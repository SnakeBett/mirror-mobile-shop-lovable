import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_HOSTS = [/(^|\.)susercontent\.com$/i, /(^|\.)shopee\.com(\.br)?$/i, /(^|\.)shopeemobile\.com$/i];

/** Copia fotos públicas de avaliações para o storage do projeto. Sem contornar bloqueios. */
export const copyReviewImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId: string; urls: string[] }) => ({
    productId: String(input?.productId ?? "").slice(0, 64),
    urls: Array.isArray(input?.urls) ? input.urls.slice(0, 10).map((u) => String(u).slice(0, 1000)) : [],
  }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Acesso restrito ao administrador.");
    if (!/^[0-9a-f-]{36}$/i.test(data.productId)) throw new Error("Produto inválido.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: Array<{ url: string; path: string | null }> = [];
    for (const raw of data.urls) {
      let path: string | null = null;
      try {
        const url = new URL(raw);
        if (url.protocol === "https:" && ALLOWED_HOSTS.some((re) => re.test(url.hostname))) {
          const res = await fetch(url.toString(), { redirect: "follow" });
          const type = res.headers.get("content-type") ?? "";
          if (res.ok && type.startsWith("image/")) {
            const buf = new Uint8Array(await res.arrayBuffer());
            if (buf.byteLength <= 8 * 1024 * 1024) {
              const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
              const p = `${data.productId}/reviews/${crypto.randomUUID()}.${ext}`;
              const { error } = await supabaseAdmin.storage.from("product-images").upload(p, buf, { contentType: type });
              if (!error) path = p;
            }
          }
        }
      } catch (error) {
        console.error("[review-import] image copy failed", error);
      }
      results.push({ url: raw, path });
    }
    return { results };
  });
