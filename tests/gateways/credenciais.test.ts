import { afterEach, describe, expect, test } from "bun:test";

import {
  ConfigStoreError,
  PRIVATE_BUCKET,
  buildPaymentConfigStatusWith,
  createConfigStore,
  describeGatewayStatus,
  mergeGatewayCredentials,
  resolveGatewayCredentialsWith,
  resolveSiteOriginWith,
} from "../../src/lib/gateways/credential-store.server";
import {
  credentialHint,
  credentialValueError,
  isConfigured,
  missingRequired,
  normalizeSiteUrl,
} from "../../src/lib/gateways/credentials";
import {
  DEFAULT_SITE_ORIGIN,
  GatewayNotReadyError,
  requireCredential,
} from "../../src/lib/gateways/index";
import { imperiumpay } from "../../src/lib/gateways/imperiumpay.server";
import { zuckpay } from "../../src/lib/gateways/zuckpay.server";
import { FakeStorage } from "./fake-storage";

const PUB = "pk_live_0123456789abcdefPUB1";
const PRIV = "sk_live_0123456789abcdefPRV2";
const POST = "whsec_0123456789abcdefPST3";
const ENV_IMPERIUM = {
  IMPERIUMPAY_PUBLIC_KEY: "env-pub-0123456789",
  IMPERIUMPAY_PRIVATE_KEY: "env-priv-0123456789",
};

function setup(clock = { t: Date.UTC(2026, 9, 15, 12) }) {
  const fake = new FakeStorage();
  const store = createConfigStore(() => fake, { now: () => clock.t, timeoutMs: 40 });
  return { fake, store, clock };
}

const key = (scope: string, name: string) => `${PRIVATE_BUCKET}/${scope}/${name}`;

/** Storage fora do ar de vez (toda chamada lança), não só numa tentativa. */
function breakStorage(fake: FakeStorage) {
  fake.listBuckets = async () => {
    throw new TypeError("fetch failed");
  };
  fake.from = () => {
    throw new TypeError("fetch failed");
  };
}

/** Versão "esquecida" mais antiga, como se a limpeza de uma gravação tivesse falhado. */
function plantOldVersion(fake: FakeStorage, values: Record<string, string>) {
  const name = `v0000000000001-${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}.json`;
  fake.files.set(
    key("gateway-imperiumpay", name),
    JSON.stringify({
      kind: "gateway",
      provider: "imperiumpay",
      values,
      updated_at: "2026-01-01T00:00:00Z",
      updated_by: null,
    }),
  );
  return name;
}

describe("regras puras", () => {
  test("valor de credencial: ASCII visível, sem quebra de linha, até 500", () => {
    expect(credentialValueError(PRIV)).toBeNull();
    expect(credentialValueError("chave com espaco interno")).toBeNull();
    expect(credentialValueError("")).not.toBeNull();
    expect(credentialValueError("chave\nquebrada")).not.toBeNull();
    expect(credentialValueError("chave\tcom tab")).not.toBeNull();
    expect(credentialValueError("açaí")).not.toBeNull();
    expect(credentialValueError("x".repeat(500))).toBeNull();
    expect(credentialValueError("x".repeat(501))).not.toBeNull();
  });

  test("final visível só para valores longos", () => {
    expect(credentialHint(PRIV)).toBe("PRV2");
    expect(credentialHint("curta123")).toBeNull();
    expect(credentialHint(null)).toBeNull();
  });

  test("obrigatórios e configurado", () => {
    expect(isConfigured("imperiumpay", { public_key: PUB, private_key: PRIV })).toBe(true);
    expect(missingRequired("imperiumpay", { public_key: PUB }).map((f) => f.key)).toEqual([
      "private_key",
    ]);
    expect(isConfigured("zuckpay", { client_id: "id\n", client_secret: PRIV })).toBe(false);
    expect(isConfigured("zuckpay", { client_id: "cliente-1234567890", client_secret: PRIV })).toBe(
      true,
    );
  });

  test("endereço do site: só a origem, https obrigatório fora do localhost", () => {
    expect(normalizeSiteUrl("https://MinhaLoja.com.br/loja?x=1")).toEqual({
      ok: true,
      origin: "https://minhaloja.com.br",
    });
    expect(normalizeSiteUrl("minhaloja.com.br")).toEqual({
      ok: true,
      origin: "https://minhaloja.com.br",
    });
    expect(normalizeSiteUrl("http://localhost:4720/x")).toEqual({
      ok: true,
      origin: "http://localhost:4720",
    });
    expect(normalizeSiteUrl("http://minhaloja.com.br").ok).toBe(false);
    expect(normalizeSiteUrl("ftp://minhaloja.com.br").ok).toBe(false);
    expect(normalizeSiteUrl("https://user:senha@minhaloja.com.br").ok).toBe(false);
    expect(normalizeSiteUrl("https://intranet").ok).toBe(false);
    expect(normalizeSiteUrl("   ").ok).toBe(false);
    expect(normalizeSiteUrl("isso não é url").ok).toBe(false);
  });

  test("painel vence a variável de ambiente; campo vazio no painel cai na variável", () => {
    const env = {
      IMPERIUMPAY_PUBLIC_KEY: "env-pub-0123456789",
      IMPERIUMPAY_PRIVATE_KEY: " env-priv-0123456789 ",
    };
    const merged = mergeGatewayCredentials("imperiumpay", { private_key: PRIV }, env);
    expect(merged.values).toEqual({ public_key: "env-pub-0123456789", private_key: PRIV });
    expect(merged.sources).toEqual({
      public_key: "env",
      private_key: "panel",
      postback_secret: "none",
    });
    expect(merged.envSet).toEqual({ public_key: true, private_key: true, postback_secret: false });
    expect(merged.configured).toBe(true);
    expect(mergeGatewayCredentials("imperiumpay", {}, env).values["private_key"]).toBe(
      "env-priv-0123456789",
    );
  });
});

describe("cofre: leitura e gravação", () => {
  test("sem bucket: painel comprovadamente vazio, variável vale, nada é criado", async () => {
    const { fake, store } = setup();
    expect(await store.readGateway("imperiumpay", { fresh: true })).toBeNull();
    expect(fake.buckets.size).toBe(0);
    const resolved = await resolveGatewayCredentialsWith(store, "imperiumpay", ENV_IMPERIUM, {
      fresh: true,
    });
    expect(resolved.store.ok).toBe(true);
    expect(resolved.sources["public_key"]).toBe("env");
    expect(resolved.configured).toBe(true);
  });

  test("primeira gravação cria o bucket PRIVADO e guarda uma versão só", async () => {
    const { fake, store } = setup();
    await store.writeGateway(
      "imperiumpay",
      { public_key: PUB, private_key: `  ${PRIV}  ` },
      "admin@teste.local",
    );
    expect(fake.buckets.get(PRIVATE_BUCKET)).toEqual({ public: false });
    const doc = await store.readGateway("imperiumpay", { fresh: true });
    expect(doc?.values).toEqual({ public_key: PUB, private_key: PRIV });
    expect(doc?.updated_by).toBe("admin@teste.local");
    expect(fake.versions("gateway-imperiumpay")).toHaveLength(1);
    expect(fake.versions("gateway-imperiumpay")[0]).toMatch(/^v\d{13}-[0-9a-f-]{36}\.json$/);
  });

  test("manter, trocar e remover campos; cada gateway no seu escopo; sempre uma versão", async () => {
    const { fake, store, clock } = setup();
    await store.writeGateway(
      "imperiumpay",
      { public_key: PUB, private_key: PRIV, postback_secret: POST },
      null,
    );
    clock.t += 1000;
    await store.writeGateway("imperiumpay", { private_key: "sk_live_trocada_0123456789" }, null);
    clock.t += 1000;
    await store.writeGateway("imperiumpay", { postback_secret: null }, null);
    await store.writeGateway(
      "zuckpay",
      { client_id: "cliente-0123456789", client_secret: PRIV },
      null,
    );
    expect((await store.readGateway("imperiumpay", { fresh: true }))?.values).toEqual({
      public_key: PUB,
      private_key: "sk_live_trocada_0123456789",
    });
    expect((await store.readGateway("zuckpay", { fresh: true }))?.values).toEqual({
      client_id: "cliente-0123456789",
      client_secret: PRIV,
    });
    expect(fake.versions("gateway-imperiumpay")).toHaveLength(1);
    expect(fake.versions("gateway-zuckpay")).toHaveLength(1);
    // a chave antiga não fica guardada em lugar nenhum
    expect([...fake.files.values()].some((v) => v.includes(POST))).toBe(false);
  });

  test("vazio também remove; campo desconhecido e valor inválido são recusados sem gravar", async () => {
    const { fake, store } = setup();
    await store.writeGateway(
      "zuckpay",
      { client_id: "cliente-0123456789", client_secret: PRIV },
      null,
    );
    await store.writeGateway("zuckpay", { client_id: "   " }, null);
    expect((await store.readGateway("zuckpay", { fresh: true }))?.values).toEqual({
      client_secret: PRIV,
    });
    const before = fake.versions("gateway-zuckpay");
    await expect(store.writeGateway("zuckpay", { senha_master: "x" }, null)).rejects.toBeInstanceOf(
      ConfigStoreError,
    );
    await expect(
      store.writeGateway("zuckpay", { client_id: "com\nquebra" }, null),
    ).rejects.toBeInstanceOf(ConfigStoreError);
    await expect(store.writeGateway("zuckpay", { client_id: "çãé" }, null)).rejects.toBeInstanceOf(
      ConfigStoreError,
    );
    expect(fake.versions("gateway-zuckpay")).toEqual(before);
  });

  test("relógio atrasado não faz a gravação nova perder para a antiga", async () => {
    const { store, clock } = setup();
    await store.writeGateway(
      "zuckpay",
      { client_id: "primeira-0123456789", client_secret: PRIV },
      null,
    );
    clock.t -= 60_000;
    await store.writeGateway("zuckpay", { client_id: "segunda-0123456789" }, null);
    expect((await store.readGateway("zuckpay", { fresh: true }))?.values["client_id"]).toBe(
      "segunda-0123456789",
    );
  });

  test("campo estranho salvo à mão no arquivo é ignorado na leitura", async () => {
    const { fake, store } = setup();
    await store.writeGateway("imperiumpay", { public_key: PUB, private_key: PRIV }, null);
    const [newest] = fake.versions("gateway-imperiumpay");
    const k = key("gateway-imperiumpay", newest!);
    const doc = JSON.parse(fake.files.get(k)!);
    doc.values.extra = "nao-devia-estar-aqui";
    doc.values.public_key = "quebrada\ncom enter";
    fake.files.set(k, JSON.stringify(doc));
    expect((await store.readGateway("imperiumpay", { fresh: true }))?.values).toEqual({
      private_key: PRIV,
    });
  });
});

describe("cofre: só a versão mais nova vale", () => {
  test("falha passageira ao baixar a mais nova: tenta de novo e lê a MAIS NOVA, nunca a antiga", async () => {
    const { fake, store } = setup();
    await store.writeGateway("imperiumpay", { public_key: PUB, private_key: PRIV }, null);
    plantOldVersion(fake, {
      public_key: "antiga-pub-0123456789",
      private_key: "antiga-priv-0123456789",
    });
    fake.failNext.set("download", "Internal Server Error");
    expect((await store.readGateway("imperiumpay", { fresh: true }))?.values["private_key"]).toBe(
      PRIV,
    );
  });

  test("mais nova inacessível de vez: erro, e a antiga nunca é usada nem regravada", async () => {
    const { fake, store } = setup();
    await store.writeGateway("imperiumpay", { public_key: PUB, private_key: PRIV }, null);
    const [newest] = fake.versions("gateway-imperiumpay");
    plantOldVersion(fake, {
      public_key: "antiga-pub-0123456789",
      private_key: "antiga-priv-0123456789",
    });
    const originalFrom = fake.from.bind(fake);
    fake.from = (bucket: string) => {
      const api = originalFrom(bucket);
      return {
        ...api,
        download: async (path: string) =>
          path.endsWith(newest!)
            ? { data: null, error: { message: "Internal Server Error" } }
            : api.download(path),
      };
    };
    await expect(store.readGateway("imperiumpay", { fresh: true })).rejects.toBeInstanceOf(
      ConfigStoreError,
    );
    const before = [...fake.files.keys()];
    await expect(
      store.writeGateway("imperiumpay", { postback_secret: POST }, null),
    ).rejects.toBeInstanceOf(ConfigStoreError);
    expect([...fake.files.keys()]).toEqual(before); // nada gravado em cima da antiga
  });

  test("mais nova ilegível: erro na leitura; salvar de novo recupera só com o que foi enviado", async () => {
    const { fake, store } = setup();
    await store.writeGateway("imperiumpay", { public_key: PUB, private_key: PRIV }, null);
    const [newest] = fake.versions("gateway-imperiumpay");
    plantOldVersion(fake, {
      public_key: "antiga-pub-0123456789",
      private_key: "antiga-priv-0123456789",
    });
    fake.files.set(key("gateway-imperiumpay", newest!), "{ isso não é json");
    await expect(store.readGateway("imperiumpay", { fresh: true })).rejects.toBeInstanceOf(
      ConfigStoreError,
    );
    await store.writeGateway(
      "imperiumpay",
      { public_key: PUB, private_key: "sk_nova_0123456789" },
      null,
    );
    expect((await store.readGateway("imperiumpay", { fresh: true }))?.values).toEqual({
      public_key: PUB,
      private_key: "sk_nova_0123456789",
    });
    expect(fake.versions("gateway-imperiumpay")).toHaveLength(1); // ilegível e esquecida foram apagadas
  });

  test("outra gravação entre subir e conferir: a nossa é desfeita e o erro avisa", async () => {
    const { fake, store, clock } = setup();
    await store.writeGateway(
      "zuckpay",
      { client_id: "cliente-base-0123456789", client_secret: PRIV },
      null,
    );
    const competitor = `v${String(clock.t + 999_999).padStart(13, "0")}-ffffffff-ffff-ffff-ffff-ffffffffffff.json`;
    fake.afterUpload = (k) => {
      fake.afterUpload = null;
      fake.files.set(
        key("gateway-zuckpay", competitor),
        JSON.stringify({
          kind: "gateway",
          provider: "zuckpay",
          values: { client_id: "cliente-outro-0123456789" },
          updated_at: "x",
          updated_by: null,
        }),
      );
      expect(k).toContain("gateway-zuckpay/");
    };
    clock.t += 1000;
    await expect(
      store.writeGateway("zuckpay", { client_id: "cliente-meu-0123456789" }, null),
    ).rejects.toThrow(/ao mesmo tempo/);
    const doc = await store.readGateway("zuckpay", { fresh: true });
    expect(doc?.values["client_id"]).toBe("cliente-outro-0123456789");
    expect(
      fake
        .versions("gateway-zuckpay")
        .some(
          (n) =>
            n !== competitor && fake.files.get(key("gateway-zuckpay", n))?.includes("cliente-meu"),
        ),
    ).toBe(false);
  });

  test("versão nova entrou entre a base e a nossa: também é conflito", async () => {
    const { fake, store, clock } = setup();
    await store.writeGateway(
      "zuckpay",
      { client_id: "cliente-base-0123456789", client_secret: PRIV },
      null,
    );
    const [base] = fake.versions("gateway-zuckpay");
    const baseTs = Number(base!.slice(1, 14));
    const between = `v${String(baseTs + 1).padStart(13, "0")}-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.json`;
    fake.afterUpload = () => {
      fake.afterUpload = null;
      fake.files.set(
        key("gateway-zuckpay", between),
        JSON.stringify({
          kind: "gateway",
          provider: "zuckpay",
          values: { client_id: "cliente-meio-0123456789" },
          updated_at: "x",
          updated_by: null,
        }),
      );
    };
    clock.t += 5000;
    await expect(
      store.writeGateway("zuckpay", { client_secret: "outro-segredo-0123456789" }, null),
    ).rejects.toBeInstanceOf(ConfigStoreError);
  });

  test("Storage que não responde: tempo limite vira erro (sem travar)", async () => {
    const { fake, store } = setup();
    await store.writeGateway(
      "zuckpay",
      { client_id: "cliente-0123456789", client_secret: PRIV },
      null,
    );
    fake.listBuckets = () => new Promise<never>(() => {});
    const originalFrom = fake.from.bind(fake);
    fake.from = (bucket: string) => ({
      ...originalFrom(bucket),
      list: () => new Promise<never>(() => {}),
    });
    const started = Date.now();
    const resolved = await resolveGatewayCredentialsWith(store, "zuckpay", {}, { fresh: true });
    expect(Date.now() - started).toBeLessThan(2000);
    // tinha leitura boa recente (a da gravação): usa ela e avisa
    expect(resolved.store.ok).toBe(false);
    expect(resolved.values["client_id"]).toBe("cliente-0123456789");
  });
});

describe("cofre fora do ar", () => {
  test("sem leitura boa recente: o gateway fica SEM chaves (a variável de ambiente não entra)", async () => {
    const { fake, store } = setup();
    breakStorage(fake);
    const resolved = await resolveGatewayCredentialsWith(store, "imperiumpay", ENV_IMPERIUM, {
      fresh: true,
    });
    expect(resolved.store.ok).toBe(false);
    expect(resolved.values).toEqual({});
    expect(resolved.configured).toBe(false);
    expect(resolved.envSet["public_key"]).toBe(true);
  });

  test("com leitura boa recente: usa as chaves do painel lidas há pouco, nunca as da variável", async () => {
    const { fake, store } = setup();
    await store.writeGateway("imperiumpay", { public_key: PUB, private_key: PRIV }, null);
    await store.readGateway("imperiumpay", { fresh: true });
    breakStorage(fake);
    const resolved = await resolveGatewayCredentialsWith(store, "imperiumpay", ENV_IMPERIUM, {
      fresh: true,
    });
    expect(resolved.store).toMatchObject({ ok: false, stale: true });
    expect(resolved.values).toEqual({ public_key: PUB, private_key: PRIV });
  });

  test("leitura boa vale só 10 minutos", async () => {
    const { fake, store, clock } = setup();
    await store.writeGateway("imperiumpay", { public_key: PUB, private_key: PRIV }, null);
    clock.t += 11 * 60_000;
    breakStorage(fake);
    const resolved = await resolveGatewayCredentialsWith(store, "imperiumpay", ENV_IMPERIUM, {
      fresh: true,
    });
    expect(resolved.store.ok).toBe(false);
    expect(resolved.values).toEqual({});
  });

  test("painel comprovadamente vazio há pouco + cofre fora: variável vale (é o mesmo estado)", async () => {
    const { fake, store } = setup();
    await store.readGateway("imperiumpay", { fresh: true }); // sem bucket = vazio conhecido
    breakStorage(fake);
    const resolved = await resolveGatewayCredentialsWith(store, "imperiumpay", ENV_IMPERIUM, {
      fresh: true,
    });
    expect(resolved.store.ok).toBe(false);
    expect(resolved.values["public_key"]).toBe("env-pub-0123456789");
  });

  test("falha ao gravar no Storage vira ConfigStoreError com o motivo", async () => {
    const { fake, store } = setup();
    fake.failNext.set("upload", "new row violates row-level security policy");
    try {
      await store.writeGateway("zuckpay", { client_id: "cliente-0123456789" }, null);
      throw new Error("devia falhar");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigStoreError);
      expect((e as ConfigStoreError).detail).toContain("row-level security");
    }
  });
});

describe("cofre: bucket", () => {
  test("bucket público é tornado privado antes de gravar; se não der, nada é gravado", async () => {
    const { fake, store } = setup();
    fake.buckets.set(PRIVATE_BUCKET, { public: true });
    await store.writeGateway(
      "zuckpay",
      { client_id: "cliente-0123456789", client_secret: PRIV },
      null,
    );
    expect(fake.buckets.get(PRIVATE_BUCKET)?.public).toBe(false);

    const second = setup();
    second.fake.buckets.set(PRIVATE_BUCKET, { public: true });
    second.fake.ignoreUpdate = true;
    await expect(
      second.store.writeGateway("zuckpay", { client_id: "cliente-0123456789" }, null),
    ).rejects.toBeInstanceOf(ConfigStoreError);
    expect(second.fake.files.size).toBe(0);
  });

  test("corrida na criação do bucket: o outro criou primeiro, segue normal", async () => {
    const { fake, store } = setup();
    const original = fake.createBucket.bind(fake);
    fake.createBucket = async (id, options) => {
      await original(id, options);
      return { data: null, error: { message: "The resource already exists" } };
    };
    await store.writeGateway(
      "zuckpay",
      { client_id: "cliente-0123456789", client_secret: PRIV },
      null,
    );
    expect((await store.readGateway("zuckpay", { fresh: true }))?.values["client_id"]).toBe(
      "cliente-0123456789",
    );
  });

  test("cache curto: leitura comum reaproveita; leitura 'fresh' e gravação atualizam", async () => {
    const { fake, store, clock } = setup();
    await store.writeGateway(
      "zuckpay",
      { client_id: "cliente-a-0123456789", client_secret: PRIV },
      null,
    );
    fake.calls.length = 0;
    await store.readGateway("zuckpay");
    expect(fake.calls).toEqual([]);
    const other = createConfigStore(() => fake, { now: () => clock.t + 5000, timeoutMs: 40 });
    await other.writeGateway("zuckpay", { client_id: "cliente-b-0123456789" }, null);
    expect((await store.readGateway("zuckpay"))?.values["client_id"]).toBe("cliente-a-0123456789");
    expect((await store.readGateway("zuckpay", { fresh: true }))?.values["client_id"]).toBe(
      "cliente-b-0123456789",
    );
    clock.t += 11_000;
    await other.writeGateway("zuckpay", { client_id: "cliente-c-0123456789" }, null);
    expect((await store.readGateway("zuckpay", { fresh: true }))?.values["client_id"]).toBe(
      "cliente-c-0123456789",
    );
  });
});

describe("endereço do site", () => {
  test("painel > PUBLIC_SITE_URL > padrão; inválido é recusado; voltar ao padrão", async () => {
    const { store } = setup();
    expect((await resolveSiteOriginWith(store, {}, { fresh: true })).origin).toBe(
      DEFAULT_SITE_ORIGIN,
    );
    expect(
      (
        await resolveSiteOriginWith(
          store,
          { PUBLIC_SITE_URL: "https://env.com.br/" },
          { fresh: true },
        )
      ).origin,
    ).toBe("https://env.com.br");
    expect(
      (await resolveSiteOriginWith(store, { PUBLIC_SITE_URL: "lixo sem sentido" }, { fresh: true }))
        .source,
    ).toBe("default");
    await store.writeSite("https://Loja.com.br/qualquer", "admin");
    const site = await resolveSiteOriginWith(
      store,
      { PUBLIC_SITE_URL: "https://env.com.br" },
      { fresh: true },
    );
    expect(site).toMatchObject({
      origin: "https://loja.com.br",
      source: "panel",
      panel: "https://loja.com.br",
    });
    await expect(store.writeSite("http://loja.com.br", null)).rejects.toBeInstanceOf(
      ConfigStoreError,
    );
    await store.writeSite(null, null);
    expect((await resolveSiteOriginWith(store, {}, { fresh: true })).source).toBe("default");
  });

  test("cofre fora do ar: usa o endereço lido há pouco", async () => {
    const { fake, store } = setup();
    await store.writeSite("https://loja.com.br", null);
    breakStorage(fake);
    const site = await resolveSiteOriginWith(store, {}, { fresh: true });
    expect(site.store.ok).toBe(false);
    expect(site.origin).toBe("https://loja.com.br");
  });
});

describe("estado mostrado no painel", () => {
  test("nunca leva o valor da credencial, só os 4 últimos caracteres", async () => {
    const { store } = setup();
    await store.writeGateway(
      "imperiumpay",
      { public_key: PUB, private_key: PRIV, postback_secret: POST },
      "admin@teste.local",
    );
    const status = await buildPaymentConfigStatusWith(store, {
      ZUCKPAY_CLIENT_ID: "env-cliente-0123456789",
      ZUCKPAY_CLIENT_SECRET: "quebrado\ncom enter",
    });
    const text = JSON.stringify(status);
    for (const secret of [PUB, PRIV, POST, "env-cliente-0123456789", "quebrado"])
      expect(text).not.toContain(secret);

    const imperium = status.gateways.find((g) => g.provider === "imperiumpay")!;
    expect(imperium.configured).toBe(true);
    expect(imperium.readable).toBe(true);
    expect(imperium.signature_check).toBe(true);
    expect(imperium.fields.map((f) => [f.key, f.source, f.hint])).toEqual([
      ["public_key", "panel", "PUB1"],
      ["private_key", "panel", "PRV2"],
      ["postback_secret", "panel", "PST3"],
    ]);
    expect(imperium.updated_by).toBe("admin@teste.local");
    expect(imperium.webhook_url).toBe(`${DEFAULT_SITE_ORIGIN}/api/public/webhooks/imperiumpay`);

    const zuck = status.gateways.find((g) => g.provider === "zuckpay")!;
    expect(zuck.configured).toBe(false);
    expect(zuck.missing).toEqual(["Client Secret"]);
    expect(zuck.fields.find((f) => f.key === "client_secret")).toMatchObject({
      source: "env",
      invalid: true,
      hint: null,
      env_set: true,
    });
    expect(status.vault).toEqual({ ok: true, error: null, exists: true, public: false });
  });

  test("Storage fora do ar: estado vem com aviso e 'não legível', sem lançar", async () => {
    const { fake, store } = setup();
    breakStorage(fake);
    const status = await buildPaymentConfigStatusWith(store, ENV_IMPERIUM);
    expect(status.vault.ok).toBe(false);
    expect(status.vault.error).toBeTruthy();
    expect(status.gateways).toHaveLength(2);
    expect(status.gateways.every((g) => !g.readable && !g.configured)).toBe(true);
  });

  test("status de um gateway sem nada configurado", () => {
    const resolved = {
      provider: "zuckpay" as const,
      ...mergeGatewayCredentials("zuckpay", {}, {}),
      store: { ok: true as const, updated_at: null, updated_by: null },
    };
    const s = describeGatewayStatus(resolved, "https://x.com.br/api/public/webhooks/zuckpay");
    expect(s.missing).toEqual(["Client ID", "Client Secret"]);
    expect(s.signature_check).toBeNull();
    expect(s.open_attempts).toBeNull();
    expect(s.fields.every((f) => f.source === "none" && f.hint === null && !f.env_set)).toBe(true);
  });
});

describe("adaptadores com credenciais por parâmetro", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("requireCredential: ausente ou inválida vira 'não configurado'", () => {
    expect(requireCredential("x", { k: "  valor-ok  " }, "k")).toBe("valor-ok");
    expect(() => requireCredential("x", {}, "k")).toThrow(GatewayNotReadyError);
    expect(() => requireCredential("x", { k: "açaí" }, "k")).toThrow(GatewayNotReadyError);
  });

  test("chave com caractere inválido não vira 'resultado incerto' (nenhuma chamada é feita)", async () => {
    let called = 0;
    globalThis.fetch = (async () => {
      called++;
      return Response.json({});
    }) as unknown as typeof fetch;
    const input = {
      order_id: "o",
      attempt_id: "a",
      amount_cents: 100,
      customer: { name: "N", email: "e@x.invalid", cpf: "1", phone: "1" },
      description: "d",
      shipping_cents: 0,
      items: [{ id: "i", title: "t", unit_price_cents: 100, quantity: 1, tangible: false }],
      shipping: null,
      tracking: {},
      webhook_url: "https://x.invalid/w",
    };
    await expect(
      imperiumpay.createPixCharge(input, { public_key: PUB, private_key: "chave\ncom enter" }),
    ).rejects.toBeInstanceOf(GatewayNotReadyError);
    await expect(
      zuckpay.createPixCharge(input, { client_id: "ção", client_secret: PRIV }),
    ).rejects.toBeInstanceOf(GatewayNotReadyError);
    expect(called).toBe(0);
  });

  test("cabeçalhos da ImperiumPay e Basic da ZuckPay usam as chaves recebidas", async () => {
    const seen: Array<Record<string, string>> = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen.push(Object.fromEntries(new Headers(init?.headers).entries()));
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    expect((await imperiumpay.testConnection({ public_key: PUB, private_key: PRIV })).ok).toBe(
      true,
    );
    expect(seen[0]).toMatchObject({ "x-api-public-key": PUB, "x-api-private-key": PRIV });
    expect(
      (await zuckpay.testConnection({ client_id: "cliente", client_secret: "segredo" })).ok,
    ).toBe(true);
    expect(seen[1]?.["authorization"]).toBe(`Basic ${btoa("cliente:segredo")}`);
    globalThis.fetch = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect((await imperiumpay.testConnection({ public_key: PUB, private_key: PRIV })).ok).toBe(
      false,
    );
    expect((await zuckpay.testConnection({})).message).toContain("não configuradas");
  });

  test("assinatura do postback confere com o segredo salvo (hex e base64)", async () => {
    const body = JSON.stringify({ id: "tx-1", status: "PAGO" });
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(POST),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(body)),
    );
    const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
    const b64 = btoa(String.fromCharCode(...sig));
    const req = (signature: string) =>
      new Request("https://x.invalid/w", {
        method: "POST",
        headers: { "x-signature": signature },
        body,
      });
    expect(await imperiumpay.verifyWebhook(req(hex), body, { postback_secret: POST })).toBe(true);
    expect(
      await imperiumpay.verifyWebhook(req(`sha256=${hex}`), body, { postback_secret: POST }),
    ).toBe(true);
    expect(await imperiumpay.verifyWebhook(req(b64), body, { postback_secret: POST })).toBe(true);
    expect(
      await imperiumpay.verifyWebhook(req(hex), body, {
        postback_secret: "outro-segredo-qualquer",
      }),
    ).toBe(false);
    expect(await imperiumpay.verifyWebhook(req(hex), body, {})).toBe(false);
  });
});
