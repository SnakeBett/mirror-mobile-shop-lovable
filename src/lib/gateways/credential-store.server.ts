import { z } from "zod";

import {
  GATEWAY_FIELDS,
  GATEWAY_NAMES,
  GATEWAY_PROVIDERS,
  credentialHint,
  credentialValueError,
  isConfigured,
  missingRequired,
  normalizeSiteUrl,
  type CredentialSource,
  type GatewayConfigStatus,
  type GatewayCredentials,
  type GatewayProvider,
  type PaymentConfigStatus,
  type SiteOriginSource,
} from "./credentials";
import { DEFAULT_SITE_ORIGIN, webhookUrl } from "./index";

/**
 * Cofre das credenciais dos gateways, editadas em Admin → Pagamentos → Gateways.
 *
 * - Guarda JSON num bucket PRIVADO do Storage. Nenhuma policy de storage cita este
 *   bucket, então só o service role o alcança; o navegador (anônimo ou admin) não lê.
 * - Cada gravação cria um arquivo novo com a data no nome e apaga os anteriores. Só a
 *   versão mais nova vale: se ela não puder ser lida, a leitura falha (nunca volta para
 *   uma versão antiga). Nome novo a cada gravação = cache de CDN nunca devolve chave velha.
 * - A gravação confere, depois de subir o arquivo, se ninguém gravou no meio; se gravou,
 *   desfaz a sua e pede para salvar de novo (nada se perde em silêncio).
 * - Não precisa de migração: a Lovable não roda migrações que chegam pelo Git.
 * - Variável de ambiente antiga só vale para campo que o painel comprovadamente não tem.
 *   Com o cofre fora do ar, vale a última leitura boa deste servidor (até 10 min); sem
 *   ela, o gateway fica sem chaves e o checkout recusa o Pix em vez de cobrar com outra conta.
 */

export const PRIVATE_BUCKET = "configuracao-privada";
const CACHE_TTL_MS = 10_000;
const STALE_IF_ERROR_MS = 10 * 60_000;
const CALL_TIMEOUT_MS = 4_000;
const VERSION_RE = /^v(\d{13})-[0-9a-f-]{36}\.json$/;

type StorageResult<T> = { data: T | null; error: { message: string } | null };

/** Parte do cliente de Storage do supabase-js usada aqui (os testes passam um falso). */
export interface PrivateStorage {
  listBuckets(): PromiseLike<StorageResult<Array<{ id: string; public: boolean }>>>;
  createBucket(id: string, options: { public: boolean }): PromiseLike<StorageResult<unknown>>;
  updateBucket(id: string, options: { public: boolean }): PromiseLike<StorageResult<unknown>>;
  from(bucket: string): {
    list(
      path: string,
      options: { limit: number; offset: number; sortBy: { column: string; order: string } },
    ): PromiseLike<StorageResult<Array<{ name: string }>>>;
    upload(
      path: string,
      body: string,
      options: { contentType: string; upsert: boolean; cacheControl: string },
    ): PromiseLike<StorageResult<unknown>>;
    download(path: string): PromiseLike<StorageResult<Blob>>;
    remove(paths: string[]): PromiseLike<StorageResult<unknown>>;
  };
}

/** Falha de acesso ao cofre. `detail` é a mensagem técnica do Storage (sem valores de credencial). */
export class ConfigStoreError extends Error {
  constructor(
    message: string,
    public detail: string | null = null,
  ) {
    super(message);
  }
}

const describeError = (e: unknown, fallback: string) =>
  e instanceof ConfigStoreError ? [e.message, e.detail].filter(Boolean).join(" ") : fallback;

const gatewayDocSchema = z.object({
  kind: z.literal("gateway"),
  provider: z.enum(GATEWAY_PROVIDERS),
  values: z.record(z.string(), z.string()),
  updated_at: z.string(),
  updated_by: z.string().nullable(),
});
export type StoredGatewayDoc = z.infer<typeof gatewayDocSchema>;

const siteDocSchema = z.object({
  kind: z.literal("site"),
  public_site_url: z.string().nullable(),
  updated_at: z.string(),
  updated_by: z.string().nullable(),
});
export type StoredSiteDoc = z.infer<typeof siteDocSchema>;

const gatewayScope = (provider: GatewayProvider) => `gateway-${provider}`;
const SITE_SCOPE = "site";

/** Só campos conhecidos e com valor válido sobrevivem à leitura. */
function sanitizeValues(
  provider: GatewayProvider,
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of GATEWAY_FIELDS[provider]) {
    const value = values[field.key]?.trim();
    if (value && credentialValueError(value) === null) out[field.key] = value;
  }
  return out;
}

type StoreOptions = { now?: () => number; timeoutMs?: number };

export function createConfigStore(
  getStorage: () => PrivateStorage | Promise<PrivateStorage>,
  options: StoreOptions = {},
) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? CALL_TIMEOUT_MS;
  /** Última leitura boa de cada escopo (doc null = comprovadamente vazio). */
  const cache = new Map<string, { at: number; doc: unknown }>();

  /** Uma chamada ao Storage com tempo limite; exceção (rede, SDK) vira erro comum. */
  async function call<T>(run: () => PromiseLike<StorageResult<T>>): Promise<StorageResult<T>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<StorageResult<T>>((resolve) => {
      timer = setTimeout(
        () =>
          resolve({ data: null, error: { message: `Storage sem resposta em ${timeoutMs} ms` } }),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([Promise.resolve().then(run), timeout]);
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function findBucket(storage: PrivateStorage) {
    const result = await call(() => storage.listBuckets());
    if (result.error)
      throw new ConfigStoreError("Não foi possível acessar o Storage.", result.error.message);
    return (result.data ?? []).find((b) => b.id === PRIVATE_BUCKET) ?? null;
  }

  async function ensurePrivateBucket(storage: PrivateStorage) {
    let bucket = await findBucket(storage);
    if (!bucket) {
      const created = await call(() => storage.createBucket(PRIVATE_BUCKET, { public: false }));
      // Outro processo pode ter criado ao mesmo tempo: vale o que existe agora.
      bucket = await findBucket(storage);
      if (!bucket)
        throw new ConfigStoreError(
          "Não foi possível criar o cofre privado no Storage.",
          created.error?.message ?? null,
        );
    }
    if (bucket.public) {
      const fixed = await call(() => storage.updateBucket(PRIVATE_BUCKET, { public: false }));
      const again = await findBucket(storage);
      if (!again || again.public) {
        throw new ConfigStoreError(
          "O cofre está público e não foi possível torná-lo privado. Nada foi gravado.",
          fixed.error?.message ?? null,
        );
      }
    }
  }

  /**
   * Versões do escopo, da mais nova para a mais antiga. `names: null` = o bucket ainda
   * não existe (nada salvo). Erro só quando o bucket existe (ou não deu para saber).
   */
  async function listVersions(
    storage: PrivateStorage,
    scope: string,
  ): Promise<{ names: string[] | null } | { error: string }> {
    const result = await call(() =>
      storage
        .from(PRIVATE_BUCKET)
        .list(scope, { limit: 100, offset: 0, sortBy: { column: "name", order: "desc" } }),
    );
    if (!result.error) {
      const names = (result.data ?? [])
        .map((item) => item.name)
        .filter((name) => VERSION_RE.test(name))
        .sort()
        .reverse();
      return { names };
    }
    const buckets = await call(() => storage.listBuckets());
    if (!buckets.error && !(buckets.data ?? []).some((b) => b.id === PRIVATE_BUCKET))
      return { names: null };
    return { error: result.error.message };
  }

  /**
   * Lê a versão mais nova. null = nada salvo; `doc: null` = a versão mais nova está
   * ilegível. Falha de rede ou do Storage → nova listagem e nova tentativa; persistindo,
   * lança. Nunca devolve uma versão antiga no lugar da mais nova.
   */
  async function readNewest<T>(
    storage: PrivateStorage,
    scope: string,
    schema: z.ZodType<T>,
  ): Promise<{ name: string; doc: T | null } | null> {
    let failure = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const listed = await listVersions(storage, scope);
      if ("error" in listed) {
        failure = listed.error;
        continue;
      }
      const newest = listed.names?.[0];
      if (!newest) return null;
      const file = await call(() => storage.from(PRIVATE_BUCKET).download(`${scope}/${newest}`));
      if (file.error || !file.data) {
        // Pode ter sido trocada por uma gravação mais nova: a próxima volta lista de novo.
        failure = file.error?.message ?? "arquivo vazio";
        continue;
      }
      let text: string;
      try {
        text = await file.data.text();
      } catch (e) {
        failure = e instanceof Error ? e.message : "falha ao ler o arquivo";
        continue;
      }
      try {
        const parsed = schema.safeParse(JSON.parse(text));
        return { name: newest, doc: parsed.success ? parsed.data : null };
      } catch {
        return { name: newest, doc: null };
      }
    }
    throw new ConfigStoreError("Não foi possível ler o cofre.", failure || null);
  }

  async function readDoc<T>(
    scope: string,
    schema: z.ZodType<T>,
    fresh: boolean,
  ): Promise<T | null> {
    const hit = cache.get(scope);
    if (!fresh && hit && now() - hit.at < CACHE_TTL_MS) return hit.doc as T | null;
    const newest = await readNewest(await getStorage(), scope, schema);
    if (newest && newest.doc === null) {
      throw new ConfigStoreError(
        "A versão salva no cofre está ilegível. Salve de novo para corrigir.",
        newest.name,
      );
    }
    const doc = newest?.doc ?? null;
    cache.set(scope, { at: now(), doc });
    return doc;
  }

  /**
   * Grava uma versão nova por cima de `baseName` (a versão lida). Depois confere a lista:
   * a nossa precisa ser a mais nova e vir logo depois da base; senão houve outra gravação
   * no meio e a nossa é desfeita.
   */
  async function writeDoc(
    storage: PrivateStorage,
    scope: string,
    doc: StoredGatewayDoc | StoredSiteDoc,
    baseName: string | null,
  ) {
    await ensurePrivateBucket(storage);
    const lastTs = baseName ? Number(VERSION_RE.exec(baseName)?.[1] ?? 0) : 0;
    // Sempre depois da versão lida, mesmo com relógio atrasado neste servidor.
    const ts = Math.max(now(), lastTs + 1);
    const name = `v${String(ts).padStart(13, "0")}-${crypto.randomUUID()}.json`;
    const uploaded = await call(() =>
      storage.from(PRIVATE_BUCKET).upload(`${scope}/${name}`, JSON.stringify(doc), {
        contentType: "application/json",
        upsert: false,
        cacheControl: "0",
      }),
    );
    if (uploaded.error)
      throw new ConfigStoreError("Não foi possível gravar no cofre.", uploaded.error.message);

    const listed = await listVersions(storage, scope);
    if ("error" in listed) {
      // Subiu, mas não deu para conferir: a nossa é a mais nova que este servidor conhece.
      console.warn("[cofre] gravação feita sem conferência", { scope, detail: listed.error });
      cache.set(scope, { at: now(), doc });
      return;
    }
    const names = listed.names ?? [];
    if (names[0] !== name || (names[1] ?? null) !== baseName) {
      await call(() => storage.from(PRIVATE_BUCKET).remove([`${scope}/${name}`]));
      cache.delete(scope);
      throw new ConfigStoreError(
        "Outra alteração foi salva ao mesmo tempo. Confira os valores e salve de novo.",
      );
    }
    cache.set(scope, { at: now(), doc });
    const older = names.slice(1);
    if (older.length) {
      const removed = await call(() =>
        storage.from(PRIVATE_BUCKET).remove(older.map((n) => `${scope}/${n}`)),
      );
      if (removed.error)
        console.warn("[cofre] limpeza de versões antigas falhou", {
          scope,
          detail: removed.error.message,
        });
    }
  }

  function lastKnown<T>(scope: string): { doc: T | null } | null {
    const hit = cache.get(scope);
    return hit && now() - hit.at < STALE_IF_ERROR_MS ? { doc: hit.doc as T | null } : null;
  }

  async function readGateway(
    provider: GatewayProvider,
    opts: { fresh?: boolean } = {},
  ): Promise<StoredGatewayDoc | null> {
    const doc = await readDoc(gatewayScope(provider), gatewayDocSchema, !!opts.fresh);
    if (!doc || doc.provider !== provider) return null;
    return { ...doc, values: sanitizeValues(provider, doc.values) };
  }

  /** `changes`: texto = gravar, null ou vazio = remover do painel, chave ausente = manter. */
  async function writeGateway(
    provider: GatewayProvider,
    changes: Record<string, string | null>,
    actor: string | null,
  ): Promise<StoredGatewayDoc> {
    const known = new Set(GATEWAY_FIELDS[provider].map((f) => f.key));
    const cleaned: Array<[string, string | null]> = [];
    for (const [key, raw] of Object.entries(changes)) {
      if (!known.has(key)) throw new ConfigStoreError(`Campo desconhecido: ${key}.`);
      const value = raw === null ? null : raw.trim() || null;
      if (value !== null && credentialValueError(value) !== null)
        throw new ConfigStoreError(`Valor inválido em ${key}.`);
      cleaned.push([key, value]);
    }
    const storage = await getStorage();
    // Lê a versão mais nova sem cache; se não der para ler, não grava (nunca mistura com versão velha).
    const current = await readNewest(storage, gatewayScope(provider), gatewayDocSchema);
    // Versão ilegível: recomeça só com o que foi enviado agora.
    const base =
      current?.doc && current.doc.provider === provider
        ? sanitizeValues(provider, current.doc.values)
        : {};
    const values: Record<string, string> = { ...base };
    for (const [key, value] of cleaned) {
      if (value === null) delete values[key];
      else values[key] = value;
    }
    const doc: StoredGatewayDoc = {
      kind: "gateway",
      provider,
      values,
      updated_at: new Date(now()).toISOString(),
      updated_by: actor,
    };
    await writeDoc(storage, gatewayScope(provider), doc, current?.name ?? null);
    return doc;
  }

  async function readSite(opts: { fresh?: boolean } = {}): Promise<StoredSiteDoc | null> {
    return readDoc(SITE_SCOPE, siteDocSchema, !!opts.fresh);
  }

  async function writeSite(
    publicSiteUrl: string | null,
    actor: string | null,
  ): Promise<StoredSiteDoc> {
    let origin: string | null = null;
    if (publicSiteUrl !== null && publicSiteUrl.trim()) {
      const normalized = normalizeSiteUrl(publicSiteUrl);
      if (!normalized.ok) throw new ConfigStoreError(normalized.error);
      origin = normalized.origin;
    }
    const storage = await getStorage();
    const current = await readNewest(storage, SITE_SCOPE, siteDocSchema);
    const doc: StoredSiteDoc = {
      kind: "site",
      public_site_url: origin,
      updated_at: new Date(now()).toISOString(),
      updated_by: actor,
    };
    await writeDoc(storage, SITE_SCOPE, doc, current?.name ?? null);
    return doc;
  }

  async function inspectBucket(): Promise<{ exists: boolean; public: boolean }> {
    const bucket = await findBucket(await getStorage());
    return { exists: !!bucket, public: !!bucket?.public };
  }

  return {
    readGateway,
    writeGateway,
    readSite,
    writeSite,
    inspectBucket,
    lastKnownGateway: (provider: GatewayProvider) =>
      lastKnown<StoredGatewayDoc>(gatewayScope(provider)),
    lastKnownSite: () => lastKnown<StoredSiteDoc>(SITE_SCOPE),
    clearCache: () => cache.clear(),
  };
}

export type ConfigStore = ReturnType<typeof createConfigStore>;

export type ResolvedGatewayCredentials = {
  provider: GatewayProvider;
  /** Valor efetivo de cada campo: painel primeiro, depois a variável de ambiente. */
  values: GatewayCredentials;
  sources: Record<string, CredentialSource>;
  /** Campos que têm variável de ambiente preenchida (reserva quando o painel fica vazio). */
  envSet: Record<string, boolean>;
  configured: boolean;
  store:
    | { ok: true; updated_at: string | null; updated_by: string | null }
    | { ok: false; error: string; stale: boolean };
};

type Env = Record<string, string | undefined>;

/** Junta painel e variáveis de ambiente. O valor do painel sempre vence. */
export function mergeGatewayCredentials(
  provider: GatewayProvider,
  panel: Record<string, string>,
  env: Env,
): Pick<ResolvedGatewayCredentials, "values" | "sources" | "envSet" | "configured"> {
  const values: Record<string, string> = {};
  const sources: Record<string, CredentialSource> = {};
  const envSet: Record<string, boolean> = {};
  for (const field of GATEWAY_FIELDS[provider]) {
    const fromPanel = panel[field.key];
    const fromEnv = env[field.env]?.trim();
    envSet[field.key] = !!fromEnv;
    if (fromPanel) {
      values[field.key] = fromPanel;
      sources[field.key] = "panel";
    } else if (fromEnv) {
      values[field.key] = fromEnv;
      sources[field.key] = "env";
    } else {
      sources[field.key] = "none";
    }
  }
  return { values, sources, envSet, configured: isConfigured(provider, values) };
}

/**
 * Credenciais em uso. Nunca lança. Se o cofre falhar, usa a última leitura boa deste
 * servidor (até 10 min); sem ela, devolve o gateway sem chaves — a variável de ambiente
 * NÃO entra, porque o painel pode ter chaves de outra conta.
 */
export async function resolveGatewayCredentialsWith(
  store: ConfigStore,
  provider: GatewayProvider,
  env: Env,
  opts: { fresh?: boolean } = {},
): Promise<ResolvedGatewayCredentials> {
  try {
    const doc = await store.readGateway(provider, opts);
    return {
      provider,
      ...mergeGatewayCredentials(provider, doc?.values ?? {}, env),
      store: { ok: true, updated_at: doc?.updated_at ?? null, updated_by: doc?.updated_by ?? null },
    };
  } catch (e) {
    const detail = describeError(e, "Erro inesperado ao ler o cofre.");
    const known = store.lastKnownGateway(provider);
    console.error("[cofre] leitura das credenciais falhou", {
      provider,
      detail,
      usando: known ? "última leitura boa" : "nenhuma chave",
    });
    if (known) {
      const values =
        known.doc && known.doc.provider === provider
          ? sanitizeValues(provider, known.doc.values)
          : {};
      return {
        provider,
        ...mergeGatewayCredentials(provider, values, env),
        store: { ok: false, error: detail, stale: true },
      };
    }
    const nothing = mergeGatewayCredentials(provider, {}, {});
    const envSet = mergeGatewayCredentials(provider, {}, env).envSet;
    return { provider, ...nothing, envSet, store: { ok: false, error: detail, stale: false } };
  }
}

export type ResolvedSiteOrigin = {
  origin: string;
  source: SiteOriginSource;
  /** Valor salvo no painel (null = não salvo). */
  panel: string | null;
  store:
    | { ok: true; updated_at: string | null; updated_by: string | null }
    | { ok: false; error: string };
};

/**
 * Endereço do site em uso. Nunca lança. Na falha do cofre usa a última leitura boa;
 * sem ela, a variável PUBLIC_SITE_URL ou o endereço da Lovable (os dois chegam no mesmo app).
 */
export async function resolveSiteOriginWith(
  store: ConfigStore,
  env: Env,
  opts: { fresh?: boolean } = {},
): Promise<ResolvedSiteOrigin> {
  const fromEnv = env["PUBLIC_SITE_URL"] ? normalizeSiteUrl(env["PUBLIC_SITE_URL"]) : null;
  const fallback = (): Pick<ResolvedSiteOrigin, "origin" | "source"> =>
    fromEnv?.ok
      ? { origin: fromEnv.origin, source: "env" }
      : { origin: DEFAULT_SITE_ORIGIN, source: "default" };
  try {
    const doc = await store.readSite(opts);
    const panel = doc?.public_site_url ?? null;
    const store_ok = {
      ok: true as const,
      updated_at: doc?.updated_at ?? null,
      updated_by: doc?.updated_by ?? null,
    };
    if (panel) return { origin: panel, source: "panel", panel, store: store_ok };
    return { ...fallback(), panel: null, store: store_ok };
  } catch (e) {
    const detail = describeError(e, "Erro inesperado ao ler o cofre.");
    console.error("[cofre] leitura do endereço do site falhou", { detail });
    const panel = store.lastKnownSite()?.doc?.public_site_url ?? null;
    const failed = { ok: false as const, error: detail };
    if (panel) return { origin: panel, source: "panel", panel, store: failed };
    return { ...fallback(), panel: null, store: failed };
  }
}

/** Estado de um gateway para o painel: origem e final de cada campo, nunca o valor. */
export function describeGatewayStatus(
  resolved: ResolvedGatewayCredentials,
  notifyUrl: string,
): GatewayConfigStatus {
  const { provider, values, sources } = resolved;
  return {
    provider,
    name: GATEWAY_NAMES[provider],
    configured: resolved.configured,
    readable: resolved.store.ok,
    missing: missingRequired(provider, values).map((f) => f.label),
    fields: GATEWAY_FIELDS[provider].map((field) => {
      const value = values[field.key];
      return {
        ...field,
        source: sources[field.key] ?? "none",
        hint: value && credentialValueError(value) === null ? credentialHint(value) : null,
        invalid: !!value && credentialValueError(value) !== null,
        env_set: !!resolved.envSet[field.key],
      };
    }),
    webhook_url: notifyUrl,
    signature_check:
      provider === "imperiumpay"
        ? !!values["postback_secret"] && credentialValueError(values["postback_secret"]) === null
        : null,
    open_attempts: null,
    updated_at: resolved.store.ok ? resolved.store.updated_at : null,
    updated_by: resolved.store.ok ? resolved.store.updated_by : null,
  };
}

/** Tudo o que a tela de gateways mostra, lido sem cache. Nunca lança. */
export async function buildPaymentConfigStatusWith(
  store: ConfigStore,
  env: Env,
): Promise<PaymentConfigStatus> {
  const [site, resolved] = await Promise.all([
    resolveSiteOriginWith(store, env, { fresh: true }),
    Promise.all(
      GATEWAY_PROVIDERS.map((p) => resolveGatewayCredentialsWith(store, p, env, { fresh: true })),
    ),
  ]);
  let bucket = { exists: false, public: false };
  let inspectError: string | null = null;
  try {
    bucket = await store.inspectBucket();
  } catch (e) {
    inspectError = describeError(e, "Erro inesperado ao consultar o Storage.");
  }
  const errors = [
    ...(site.store.ok ? [] : [site.store.error]),
    ...resolved.flatMap((r) => (r.store.ok ? [] : [r.store.error])),
    ...(inspectError ? [inspectError] : []),
  ];
  return {
    gateways: resolved.map((r) => describeGatewayStatus(r, webhookUrl(r.provider, site.origin))),
    site: {
      origin: site.origin,
      source: site.source,
      panel: site.panel,
      default_origin: DEFAULT_SITE_ORIGIN,
    },
    vault: {
      ok: errors.length === 0,
      error: errors[0] ?? null,
      exists: bucket.exists,
      public: bucket.public,
    },
  };
}

/* ---------- instância usada pelo app (cliente com service role) ---------- */

const store = createConfigStore(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin.storage as unknown as PrivateStorage;
});

const processEnv = (): Env => process.env as Env;

export function resolveGatewayCredentials(
  provider: GatewayProvider,
  opts: { fresh?: boolean } = {},
) {
  return resolveGatewayCredentialsWith(store, provider, processEnv(), opts);
}

export function resolveSiteOrigin(opts: { fresh?: boolean } = {}) {
  return resolveSiteOriginWith(store, processEnv(), opts);
}

/** URL de aviso (webhook) que vai para o gateway na criação da cobrança. Nunca lança. */
export async function resolveWebhookUrl(provider: GatewayProvider, opts: { fresh?: boolean } = {}) {
  return webhookUrl(provider, (await resolveSiteOrigin(opts)).origin);
}

export function saveGatewayCredentials(
  provider: GatewayProvider,
  changes: Record<string, string | null>,
  actor: string | null,
) {
  return store.writeGateway(provider, changes, actor);
}

export function saveSiteOrigin(publicSiteUrl: string | null, actor: string | null) {
  return store.writeSite(publicSiteUrl, actor);
}

export function buildPaymentConfigStatus() {
  return buildPaymentConfigStatusWith(store, processEnv());
}
