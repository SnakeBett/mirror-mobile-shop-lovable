import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  detectPlatform,
  isAllowedSourceHost,
  parseProductUrl,
  type ImportAnalysis,
} from "./import-types";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Acesso restrito ao administrador.");
}

/** Analisa a URL informada e devolve o modelo normalizado (nunca cria produto). */
export const analyzeImportUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => ({ url: String(input?.url ?? "") }))
  .handler(async ({ data, context }): Promise<ImportAnalysis> => {
    await assertAdmin(context as never);

    const parsed = parseProductUrl(data.url);
    if ("error" in parsed) {
      return {
        status: "failed",
        product: null,
        missingFields: [],
        notices: [],
        message: parsed.error,
        individualReviewsAvailable: false,
        foundCount: 0,
      };
    }

    const platform = detectPlatform(data.url);
    const { analyzePublicUrl } = await import("./importers.server");
    try {
      return await analyzePublicUrl(parsed.url, platform);
    } catch (error) {
      console.error("[import] analyze failed", error);
      return {
        status: "blocked",
        product: null,
        missingFields: [],
        notices: ["Use a importação assistida para cadastrar os dados manualmente."],
        message: "Não conseguimos ler automaticamente esta página.",
        individualReviewsAvailable: false,
        foundCount: 0,
      };
    }
  });

/** Situação das integrações (sem expor chaves). */
export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { integrationStatus } = await import("./importers.server");
    return integrationStatus();
  });

/**
 * Copia imagens da origem para o nosso storage.
 * Só aceita hosts das plataformas integradas e devolve os caminhos salvos.
 */
export const importImagesToStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string; urls: string[] }) => ({
    productId: String(input?.productId ?? ""),
    urls: Array.isArray(input?.urls) ? input.urls.slice(0, 20).map(String) : [],
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (!data.productId) throw new Error("Produto inválido.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const paths: string[] = [];
    const skipped: string[] = [];

    for (const raw of data.urls) {
      const parsed = parseProductUrl(raw);
      if ("error" in parsed || parsed.url.protocol !== "https:") {
        skipped.push(raw);
        continue;
      }
      try {
        const response = await fetch(parsed.url.toString(), { redirect: "follow" });
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !type.startsWith("image/")) {
          skipped.push(raw);
          continue;
        }
        const buffer = new Uint8Array(await response.arrayBuffer());
        if (buffer.byteLength > 8 * 1024 * 1024) {
          skipped.push(raw);
          continue;
        }
        const extension = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        const path = `${data.productId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabaseAdmin.storage
          .from("product-images")
          .upload(path, buffer, { contentType: type, upsert: false });
        if (error) {
          skipped.push(raw);
          continue;
        }
        paths.push(path);
      } catch (error) {
        console.error("[import] image copy failed", error);
        skipped.push(raw);
      }
    }

    return { paths, skipped };
  });

/** Gera uma descrição ORIGINAL a partir apenas dos fatos do produto. */
export const generateProductDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    title: string;
    attributes: Array<{ label: string; value: string }>;
    price?: number | null;
  }) => ({
    title: String(input?.title ?? ""),
    attributes: Array.isArray(input?.attributes) ? input.attributes.slice(0, 40) : [],
    price: typeof input?.price === "number" ? input.price : null,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Geração de descrição indisponível no momento.");

    const facts = data.attributes.map((a) => `- ${a.label}: ${a.value}`).join("\n");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você escreve descrições ORIGINAIS de produtos em português do Brasil. Use apenas os fatos fornecidos, nunca invente dados, avaliações ou promessas. Estrutura: parágrafo introdutório, benefícios, características, diferenciais e informações técnicas. Texto limpo, sem markdown pesado.",
          },
          {
            role: "user",
            content: `Produto: ${data.title}\nPreço: ${data.price ?? "não informado"}\nFatos/especificações:\n${facts || "- (sem especificações)"}\n\nEscreva a descrição.`,
          },
        ],
      }),
    });

    if (response.status === 429) throw new Error("Muitas solicitações. Tente novamente em instantes.");
    if (response.status === 402) throw new Error("Créditos de IA insuficientes para gerar a descrição.");
    if (!response.ok) {
      console.error("[import] ai description failed", response.status, await response.text());
      throw new Error("Não foi possível gerar a descrição agora.");
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Não foi possível gerar a descrição agora.");
    return { description: text };
  });
