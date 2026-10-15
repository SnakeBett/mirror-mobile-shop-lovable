import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CREDENTIAL_MAX_LENGTH,
  GATEWAY_FIELDS,
  GATEWAY_PROVIDERS,
  credentialValueError,
  missingRequired,
  normalizeSiteUrl,
  type PaymentConfigStatus,
} from "@/lib/gateways/credentials";

/**
 * Server functions do admin para a área de Pagamentos.
 * Somente administradores autenticados podem ler os logs de webhook.
 */

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data: isAdmin } = await (context.supabase.rpc as (n: string, a: unknown) => Promise<{ data: boolean }>)(
    "has_role",
    { _user_id: context.userId, _role: "admin" },
  );
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

export type WebhookLogRow = {
  id: string;
  gateway: string;
  received_at: string;
  http_method: string;
  processing_status: string;
  external_event_id: string | null;
  external_transaction_id: string | null;
  external_order_id: string | null;
  original_status: string | null;
  normalized_status: string | null;
  processed_at: string | null;
  error_message: string | null;
};

export type WebhookLogDetail = WebhookLogRow & {
  /** JSON já formatado (string) para exibição segura no admin. */
  headers_safe_json: string;
  payload_json: string;
};

export const listPaymentWebhookLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WebhookLogRow[]> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("payment_webhook_logs")
      .select(
        "id, gateway, received_at, http_method, processing_status, external_event_id, external_transaction_id, external_order_id, original_status, normalized_status, processed_at, error_message",
      )
      .order("received_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Não foi possível carregar os webhooks.");
    return (data ?? []) as WebhookLogRow[];
  });

export const getPaymentWebhookLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<WebhookLogDetail | null> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("payment_webhook_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error("Não foi possível carregar o webhook.");
    if (!row) return null;
    const { headers_safe, payload, ...rest } = row as Record<string, unknown>;
    return {
      ...(rest as unknown as WebhookLogRow),
      headers_safe_json: JSON.stringify(headers_safe ?? {}, null, 2),
      payload_json: JSON.stringify(payload ?? null, null, 2),
    };
  });

export type ImperiumPayStatus = {
  total_events: number;
  last_event_at: string | null;
};

export const getImperiumPayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImperiumPayStatus> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count }, { data: last }] = await Promise.all([
      supabaseAdmin
        .from("payment_webhook_logs")
        .select("id", { count: "exact", head: true })
        .eq("gateway", "imperiumpay"),
      supabaseAdmin
        .from("payment_webhook_logs")
        .select("received_at")
        .eq("gateway", "imperiumpay")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      total_events: count ?? 0,
      last_event_at: (last as { received_at?: string } | null)?.received_at ?? null,
    };
  });

/** Quem fez a alteração (e-mail do admin; o id se o token não tiver e-mail). */
function actorOf(context: unknown): string | null {
  const ctx = context as { userId?: string; claims?: { email?: unknown } };
  return typeof ctx.claims?.email === "string" && ctx.claims.email ? ctx.claims.email : (ctx.userId ?? null);
}

type CredentialStoreModule = typeof import("@/lib/gateways/credential-store.server");

/** Mensagem para o admin quando o cofre falha. Erro do cofre traz o motivo técnico; qualquer outro vira a mensagem genérica. */
function vaultFailure(store: CredentialStoreModule, e: unknown, fallback: string): Error {
  if (!(e instanceof store.ConfigStoreError)) return new Error(fallback);
  return new Error(e.detail ? `${e.message} (${e.detail.slice(0, 200)})` : e.message);
}

/**
 * Junta ao estado quantos Pix de cada gateway ainda esperam pagamento (últimas 48 h): trocar
 * as chaves para outra conta deixa esses Pix sem confirmação automática. Falha = null.
 */
async function countOpenAttempts(provider: string): Promise<number | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const { count, error } = await supabaseAdmin
      .from("payment_attempts")
      .select("id", { count: "exact", head: true })
      .eq("provider", provider)
      .in("status", ["creating", "pending", "processing", "unknown_result"])
      .gte("created_at", since);
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

async function withOpenAttempts(status: PaymentConfigStatus): Promise<PaymentConfigStatus> {
  const counts = await Promise.all(status.gateways.map((g) => countOpenAttempts(g.provider)));
  return { ...status, gateways: status.gateways.map((g, i) => ({ ...g, open_attempts: counts[i] ?? null })) };
}

/** Contagem na hora de salvar: a tela pode estar aberta há tempo e ter número velho. */
export const getOpenPixCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: string }) => z.object({ provider: z.enum(GATEWAY_PROVIDERS) }).parse(input))
  .handler(async ({ context, data }): Promise<number | null> => {
    await assertAdmin(context as never);
    return countOpenAttempts(data.provider);
  });

/**
 * Estado das credenciais dos gateways para Admin → Pagamentos → Gateways.
 * Mostra de onde vem cada valor e só o final dele; o valor nunca sai do servidor.
 */
export const getGatewayConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentConfigStatus> => {
    await assertAdmin(context as never);
    const { buildPaymentConfigStatus } = await import("@/lib/gateways/credential-store.server");
    return withOpenAttempts(await buildPaymentConfigStatus());
  });

const saveCredentialsSchema = z.object({
  provider: z.enum(GATEWAY_PROVIDERS),
  /** texto = gravar; null ou vazio = remover do painel; campo ausente = manter. */
  values: z.record(z.string(), z.string().max(CREDENTIAL_MAX_LENGTH + 200).nullable()),
});

export const saveGatewayCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveCredentialsSchema.parse(input))
  .handler(async ({ context, data }): Promise<PaymentConfigStatus> => {
    await assertAdmin(context as never);
    const fields = GATEWAY_FIELDS[data.provider];
    const changes: Record<string, string | null> = {};
    for (const [key, raw] of Object.entries(data.values)) {
      const field = fields.find((f) => f.key === key);
      if (!field) throw new Error("Campo de credencial desconhecido.");
      const value = raw === null ? "" : raw.trim();
      if (value) {
        const problem = credentialValueError(value);
        if (problem) throw new Error(`${field.label}: ${problem}`);
      }
      changes[key] = value || null;
    }
    if (Object.keys(changes).length === 0) throw new Error("Nenhuma alteração para salvar.");

    const store = await import("@/lib/gateways/credential-store.server");
    const actor = actorOf(context);
    try {
      await store.saveGatewayCredentials(data.provider, changes, actor);
    } catch (e) {
      console.error("[gateways] falha ao salvar credenciais", { provider: data.provider, erro: e instanceof Error ? e.message : "desconhecido" });
      throw vaultFailure(store, e, "Não foi possível salvar as credenciais.");
    }
    // Auditoria sem valores: só quais campos mudaram e quem mudou.
    console.info("[gateways] credenciais atualizadas", {
      provider: data.provider,
      gravados: Object.keys(changes).filter((k) => changes[k] !== null),
      removidos: Object.keys(changes).filter((k) => changes[k] === null),
      por: actor,
    });
    return withOpenAttempts(await store.buildPaymentConfigStatus());
  });

export const saveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ public_site_url: z.string().max(300).nullable() }).parse(input))
  .handler(async ({ context, data }): Promise<PaymentConfigStatus> => {
    await assertAdmin(context as never);
    const value = data.public_site_url?.trim() || null;
    if (value) {
      const normalized = normalizeSiteUrl(value);
      if (!normalized.ok) throw new Error(normalized.error);
    }
    const store = await import("@/lib/gateways/credential-store.server");
    try {
      await store.saveSiteOrigin(value, actorOf(context));
    } catch (e) {
      console.error("[gateways] falha ao salvar o endereço do site", { erro: e instanceof Error ? e.message : "desconhecido" });
      throw vaultFailure(store, e, "Não foi possível salvar o endereço do site.");
    }
    return withOpenAttempts(await store.buildPaymentConfigStatus());
  });

export const testGatewayConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { provider: string }) => z.object({ provider: z.enum(GATEWAY_PROVIDERS) }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context as never);
    const { getGatewayAdapter } = await import("@/lib/gateways");
    const { resolveGatewayCredentials } = await import("@/lib/gateways/credential-store.server");
    const a = (await getGatewayAdapter(data.provider))!;
    const creds = await resolveGatewayCredentials(data.provider, { fresh: true });
    // Cofre sem resposta: não testa (a resposta seria sobre chaves que podem não ser as salvas) e não mexe no status.
    if (!creds.store.ok) {
      return { ok: false, message: `Não foi possível ler as chaves salvas agora. Tente de novo em instantes. (${creds.store.error})` };
    }
    const missing = missingRequired(data.provider, creds.values).map((f) => f.label);
    const r = missing.length ? { ok: false, message: `Faltam credenciais: ${missing.join(", ")}.` } : await a.testConnection(creds.values);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("payment_gateways").update({
      integration_status: r.ok ? "connected" : "error",
      last_error: r.ok ? null : `${new Date().toISOString()} · ${r.message}`,
      updated_at: new Date().toISOString(),
    }).eq("provider", data.provider);
    return r;
  });

export type AttemptRow = { id: string; provider: string; status: string; amount_cents: number; created_at: string; error_message: string | null; order_id: string };

export const listPaymentAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AttemptRow[]> => {
    await assertAdmin(context as never);
    const { data } = await context.supabase.from("payment_attempts").select("id, provider, status, amount_cents, created_at, error_message, order_id").order("created_at", { ascending: false }).limit(30);
    return (data ?? []) as AttemptRow[];
  });
