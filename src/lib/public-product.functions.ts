import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import { resolveImageUrls } from "./storage-images";
import { resolvePageSettings } from "./page-settings";
import type { ProductView, RecommendedProduct } from "./product-types";
import type { PageSettings } from "./page-settings";
import type { AttributeValue, ProductAttribute, ProductVariant, QuantityOffer } from "./variants";
import { EMPTY_PUBLIC_TRACKING, normalizeAppSettings, resolveTrackingIds } from "./tracking";


function createPublicClient() {
  // Hosts like Vercel may only define the VITE_* names; accept either.
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY environment variables.");
  }
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

  const limit = Math.min(12, Math.max(1, config.limit || 6));
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
    // Automático: somente produtos relacionados (mesma subcategoria, depois mesma categoria).
    // Nunca completa com produtos de categorias diferentes ou sem categoria.
    const { data: self } = await supabase
      .from("products")
      .select("category_id, subcategory_id")
      .eq("id", productId)
      .maybeSingle();
    const categoryId = (self as { category_id?: string | null } | null)?.category_id ?? null;
    const subcategoryId = (self as { subcategory_id?: string | null } | null)?.subcategory_id ?? null;

    if (categoryId) {
      const { data } = await supabase
        .from("products")
        .select(`${RECOMMENDATION_COLUMNS}, subcategory_id, created_at`)
        .eq("is_active", true)
        .eq("category_id", categoryId)
        .neq("id", productId)
        .order("created_at", { ascending: false })
        .limit(60);
      const rows = (data ?? []) as Array<Record<string, unknown>>;

      const rank = new Map<string, number>();
      if (config.auto_criteria !== "recent") {
        const { data: ranking } = await supabase.rpc("public_best_sellers", { _limit: 200 });
        ((ranking ?? []) as Array<{ product_id: string | null; orders_count: number }>).forEach((row) => {
          if (row.product_id) rank.set(row.product_id, Number(row.orders_count));
        });
      }
      const sorted = rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
          const sa = subcategoryId && a.row["subcategory_id"] === subcategoryId ? 0 : 1;
          const sb = subcategoryId && b.row["subcategory_id"] === subcategoryId ? 0 : 1;
          if (sa !== sb) return sa - sb;
          const ra = rank.get(String(a.row["id"])) ?? 0;
          const rb = rank.get(String(b.row["id"])) ?? 0;
          if (ra !== rb) return rb - ra;
          return a.index - b.index;
        })
        .map((item) => item.row);
      push(sorted);
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

type Rows = Array<Record<string, unknown>> | null;

/** Só entrega kits/variações quando ligados no produto; senão a página segue como hoje. */
function buildVariantData(
  page: PageSettings,
  kits: Rows,
  attrs: Rows,
  values: Rows,
  variants: Rows,
  resolveImg: (path: string | null | undefined) => string | null,
): Pick<ProductView, "quantity_offers" | "attributes" | "variants"> {
  const cfg = page.variant_settings;
  const quantity_offers = cfg.quantity_offers_enabled
    ? ((kits ?? []) as unknown as QuantityOffer[]).map((kit) => ({
        ...kit,
        total_price: Number(kit.total_price),
        old_price: kit.old_price == null ? null : Number(kit.old_price),
        manual_discount: kit.manual_discount == null ? null : Number(kit.manual_discount),
      }))
    : [];
  if (!cfg.variants_enabled) return { quantity_offers, attributes: [], variants: [] };
  const valueRows = (values ?? []) as unknown as AttributeValue[];
  const attributes = ((attrs ?? []) as unknown as ProductAttribute[])
    .map((attr) => ({
      ...attr,
      values: valueRows
        .filter((value) => value.attribute_id === attr.id)
        .map((value) => ({ ...value, image_url: resolveImg(value.image_url) })),
    }))
    .filter((attr) => attr.values.length > 0);
  return {
    quantity_offers,
    attributes,
    variants: ((variants ?? []) as unknown as ProductVariant[]).map((variant) => ({
      ...variant,
      price: variant.price == null ? null : Number(variant.price),
      old_price: variant.old_price == null ? null : Number(variant.old_price),
      image_url: resolveImg(variant.image_url),
    })),
  };
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

    const [images, promotions, details, highlights, reviews, settings, offers, kitsRes, attrsRes, valuesRes, variantsRes] = await Promise.all([
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
      supabase
        .from("product_offers")
        .select("*")
        .eq("product_id", product.id)
        .eq("is_active", true)
        .or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`)
        .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
        .order("sort_order"),
      supabase.from("product_quantity_offers").select("*").eq("product_id", product.id).eq("is_active", true).order("sort_order"),
      supabase.from("product_attributes").select("*").eq("product_id", product.id).order("sort_order"),
      supabase.from("product_attribute_values").select("*").eq("product_id", product.id).order("sort_order"),
      supabase.from("product_variants").select("*").eq("product_id", product.id).order("sort_order"),
    ]);

    const { data: settingsRow } = await supabase.from("app_settings").select("*").maybeSingle();
    const appSettings = normalizeAppSettings(settingsRow as Record<string, unknown> | null);

    // Config de Meta/UTMify: lida só no servidor; devolvemos apenas a parte pública.
    const { loadTrackingSettings, toPublicTrackingConfig } = await import("./meta.server");
    const trackingSettings = await loadTrackingSettings().catch(() => null);
    const trackingConfig = trackingSettings
      ? toPublicTrackingConfig(trackingSettings)
      : EMPTY_PUBLIC_TRACKING;


    const imageRows = images.data ?? [];
    const reviewRows = reviews.data ?? [];
    const urlMap = await resolveImageUrls(supabase, [
      ...imageRows.map((row) => row.image_url),
      ...reviewRows.map((row) => row.image_url),
      ...(valuesRes.data ?? []).map((row) => row.image_url as string | null),
      ...(variantsRes.data ?? []).map((row) => row.image_url as string | null),
    ]);
    const resolveImg = (path: string | null | undefined) => (path ? (urlMap[path] ?? null) : null);

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
      offers: (offers.data ?? []) as ProductView["offers"],
      ...buildVariantData(page, kitsRes.data, attrsRes.data, valuesRes.data, variantsRes.data, resolveImg),
      tracking: {
        ...resolveTrackingIds(product as Record<string, never>, appSettings),
        // Pixel do Meta: override do produto > configuração Meta > pixel legado.
        meta_pixel_id: trackingConfig.meta_enabled
          ? (resolveTrackingIds(product as Record<string, never>, appSettings).meta_pixel_id ??
            trackingConfig.meta_pixel_id)
          : null,
      },
      tracking_config: trackingConfig,
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
