import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import { resolveImageUrls } from "./storage-images";
import type { ProductView } from "./product-types";

function createPublicClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const getPublicProduct = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => ({ slug: String(data.slug) }))
  .handler(async ({ data }): Promise<ProductView | null> => {
    const supabase = createPublicClient();
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw new Error("Não foi possível carregar o produto.");
    if (!product) return null;

    const [images, promotions, details, highlights, reviews, settings] = await Promise.all([
      supabase.from("product_images").select("*").eq("product_id", product.id).order("sort_order"),
      supabase
        .from("promotions")
        .select("*")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("product_details").select("*").eq("product_id", product.id).order("sort_order"),
      supabase.from("product_highlights").select("*").eq("product_id", product.id).order("sort_order"),
      supabase
        .from("reviews")
        .select("*")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .order("sort_order"),
      // Falha aqui nunca quebra a página: cai nos defaults (visual original).
      supabase.from("product_page_settings").select("*").eq("product_id", product.id).maybeSingle(),
    ]);


    const imageRows = images.data ?? [];
    const reviewRows = reviews.data ?? [];
    const urlMap = await resolveImageUrls(supabase, [
      ...imageRows.map((row) => row.image_url),
      ...reviewRows.map((row) => row.image_url),
    ]);

    // Quando "números personalizados" está desativado, as estatísticas exibidas
    // são calculadas a partir das avaliações ativas.
    const computed = product.custom_stats_enabled
      ? {}
      : {
          rating:
            reviewRows.length > 0
              ? Math.round(
                  (reviewRows.reduce((sum, row) => sum + (row.rating ?? 0), 0) / reviewRows.length) * 10,
                ) / 10
              : null,
          review_count: reviewRows.length,
          five_star_count: reviewRows.filter((row) => row.rating === 5).length,
        };

    return {
      ...(product as ProductView),
      ...computed,
      images: imageRows.map((row) => urlMap[row.image_url]).filter(Boolean) as string[],
      promotions: (promotions.data ?? []).map((row) => row.text),
      details: (details.data ?? []).map((row) => [row.label, row.value ?? ""] as [string, string]),
      highlights: (highlights.data ?? []).map((row) => row.text),
      reviews: reviewRows.map((row) => ({
        id: row.id,
        customer_name: row.customer_name,
        avatar_initial: row.avatar_initial,
        rating: row.rating,
        comment: row.comment,
        sort_order: row.sort_order,
        is_active: row.is_active,
        image_url: row.image_url ? (urlMap[row.image_url] ?? null) : null,
      })),
    };
  });

export const getFirstActiveSlug = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("slug")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
});
