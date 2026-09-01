import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import { resolveImageUrls } from "./storage-images";
import { resolvePageSettings } from "./page-settings";
import type { ProductView, RecommendedProduct } from "./product-types";
import type { PageSettings } from "./page-settings";
import { normalizeAppSettings, resolveTrackingIds } from "./tracking";


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


type Client = ReturnType<typeof createPublicClient>;

const RECOMMENDATION_COLUMNS = "id, slug, name, current_price, old_price, discount_percentage, is_active";

/**
 * Monta a lista de recomendações respeitando o modo configurado.
 * Produtos inativos, sem slug ou o próprio produto nunca entram.
 */
async function loadRecommendations(
  supabase: Client,
  productId: string,
  page: PageSettings,
): Promise<RecommendedProduct[]> {
  const config = page.recommendation_settings;
  if (!page.section_visibility.recommendations) return [];

  const limit = Math.min(6, Math.max(2, config.limit || 4));
  const picked: Array<Record<string, unknown>> = [];
  const seen = new Set<string>([productId]);

  const push = (rows: Array<Record<string, unknown>> | null | undefined) => {
    for (const row of rows ?? []) {
      const id = String(row["id"] ?? "");
      const slug = String(row["slug"] ?? "").trim();
      if (!id || !slug || seen.has(id) || row["is_active"] !== true) continue;
      seen.add(id);
      picked.push(row);
      if (picked.length >= limit) break;
    }
  };

  if (config.mode !== "auto") {
    const { data } = await supabase
      .from("product_recommendations")
      .select(`sort_order, product:products!product_recommendations_recommended_product_id_fkey(${RECOMMENDATION_COLUMNS})`)
      .eq("product_id", productId)
      .order("sort_order");
    push(
      (data ?? [])
        .map((row) => (row as Record<string, unknown>)["product"] as Record<string, unknown> | null)
        .filter(Boolean) as Array<Record<string, unknown>>,
    );
  }

  if (config.mode !== "manual" && picked.length < limit) {
    const criteria = config.auto_criteria;

    if (criteria === "best_sellers") {
      const { data: ranking } = await supabase.rpc("public_best_sellers", { _limit: limit * 3 });
      const ids: string[] = ((ranking ?? []) as Array<{ product_id: string | null }>)
        .map((row) => row.product_id)
        .filter((id): id is string => Boolean(id) && !seen.has(id as string));
      if (ids.length > 0) {
        const { data } = await supabase.from("products").select(RECOMMENDATION_COLUMNS).in("id", ids);
        const byId = new Map((data ?? []).map((row) => [String(row.id), row as Record<string, unknown>]));
        push(ids.map((id: string) => byId.get(id)).filter(Boolean) as Array<Record<string, unknown>>);
      }

    }

    if (picked.length < limit) {
      // Fallback (e critérios "recentes"/"aleatórios"): produtos ativos mais recentes.
      const { data } = await supabase
        .from("products")
        .select(RECOMMENDATION_COLUMNS)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit * 4);
      let rows = (data ?? []) as Array<Record<string, unknown>>;
      if (criteria === "random") rows = [...rows].sort(() => Math.random() - 0.5);
      push(rows);
    }
  }

  const ids = picked.map((row) => String(row["id"]));
  const imageMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: imageRows } = await supabase
      .from("product_images")
      .select("product_id, image_url, sort_order")
      .in("product_id", ids)
      .order("sort_order");
    const mainByProduct = new Map<string, string>();
    for (const row of imageRows ?? []) {
      const key = String(row.product_id);
      if (!mainByProduct.has(key)) mainByProduct.set(key, row.image_url as string);
    }
    const resolved = await resolveImageUrls(supabase, [...mainByProduct.values()]);
    for (const [key, path] of mainByProduct) imageMap[key] = resolved[path] ?? "";
  }

  return picked.map((row) => ({
    id: String(row["id"]),
    slug: String(row["slug"]),
    name: String(row["name"]),
    current_price: Number(row["current_price"] ?? 0),
    old_price: row["old_price"] == null ? null : Number(row["old_price"]),
    discount_percentage: row["discount_percentage"] == null ? null : Number(row["discount_percentage"]),
    image: imageMap[String(row["id"])] || null,
  }));
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

    const { data: settingsRow } = await supabase.from("app_settings").select("*").maybeSingle();
    const appSettings = normalizeAppSettings(settingsRow as Record<string, unknown> | null);


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

    const page = resolvePageSettings(
      settings.error ? null : (settings.data as Record<string, unknown> | null),
    );
    const recommendations = await loadRecommendations(supabase, product.id, page);

    return {
      ...(product as ProductView),
      ...computed,
      page,
      recommendations,
      tracking: resolveTrackingIds(product as Record<string, never>, appSettings),
      currency: appSettings.currency,

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
