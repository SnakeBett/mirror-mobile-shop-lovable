import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_BUCKET, resolveImageUrls } from "./storage-images";
import { resolvePageSettings, type PageSettings } from "./page-settings";

import type {
  ProductDetailRow,
  ProductHighlightRow,
  ProductImageRow,
  ProductOffer,
  ProductPromotionRow,
  ProductReview,
  ProductRow,
} from "./product-types";

export type ChildTable =
  | "product_images"
  | "product_details"
  | "product_highlights"
  | "promotions"
  | "reviews"
  | "product_offers";

export async function listProducts(search = "") {
  let query = supabase.from("products").select("*").order("created_at", { ascending: false });
  if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

export async function getProduct(id: string) {
  const [product, images, details, highlights, promotions, reviews, settings, offers] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_images").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("product_details").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("product_highlights").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("promotions").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("reviews").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("product_page_settings").select("*").eq("product_id", id).maybeSingle(),
    supabase.from("product_offers").select("*").eq("product_id", id).order("sort_order"),
  ]);

  if (product.error) throw product.error;
  if (!product.data) return null;

  const imageRows = (images.data ?? []) as ProductImageRow[];
  const reviewRows = (reviews.data ?? []) as ProductReview[];
  const previews = await resolveImageUrls(supabase, [
    ...imageRows.map((row) => row.image_url),
    ...reviewRows.map((row) => row.image_url),
  ]);

  return {
    product: product.data as ProductRow,
    images: imageRows,
    details: (details.data ?? []) as ProductDetailRow[],
    highlights: (highlights.data ?? []) as ProductHighlightRow[],
    promotions: (promotions.data ?? []) as ProductPromotionRow[],
    reviews: reviewRows,
    offers: (offers.data ?? []) as ProductOffer[],
    previews,
    page: resolvePageSettings(
      settings.error ? null : (settings.data as Record<string, unknown> | null),
    ),
  };
}

/** Grava (ou cria) a configuração de página do produto. */
export async function savePageSettings(productId: string, page: PageSettings) {
  const { error } = await supabase
    .from("product_page_settings")
    .upsert({ product_id: productId, ...page } as never, { onConflict: "product_id" });
  if (error) throw error;
}


export async function createProduct(values: Partial<ProductRow>) {
  const { data, error } = await supabase.from("products").insert(values as never).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateProduct(id: string, values: Partial<ProductRow>) {
  const { error } = await supabase.from("products").update(values as never).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function insertChild(table: ChildTable, values: Record<string, unknown>) {
  const { error } = await supabase.from(table).insert(values as never);
  if (error) throw error;
}

export async function updateChild(table: ChildTable, id: string, values: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(values as never).eq("id", id);
  if (error) throw error;
}

export async function deleteChild(table: ChildTable, id: string) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

export async function uploadProductImage(file: File, productId: string) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${productId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeStorageObject(path: string) {
  if (/^https?:\/\//i.test(path)) return;
  await supabase.storage.from(PRODUCT_BUCKET).remove([path]);
}

export async function getDashboardStats() {
  const [products, active, reviews, images] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("reviews").select("id", { count: "exact", head: true }),
    supabase.from("product_images").select("id", { count: "exact", head: true }),
  ]);
  return {
    products: products.count ?? 0,
    active: active.count ?? 0,
    reviews: reviews.count ?? 0,
    images: images.count ?? 0,
  };
}

export type ProductListItem = ProductRow & {
  thumbnail: string | null;
  reviewCount: number;
};

/** Listagem com miniatura da imagem principal e contagem de avaliações. */
export async function listProductsWithMeta(search = ""): Promise<ProductListItem[]> {
  let query = supabase
    .from("products")
    .select("*, product_images(image_url, sort_order), reviews(id)")
    .order("created_at", { ascending: false });

  const term = search.trim();
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Array<
    ProductRow & {
      product_images: Array<{ image_url: string; sort_order: number }>;
      reviews: Array<{ id: string }>;
    }
  >;

  const mains = rows.map(
    (row) => [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url ?? null,
  );
  const previews = await resolveImageUrls(supabase, mains);

  return rows.map((row, index) => {
    const main = mains[index];
    const { product_images: _images, reviews: reviewRows, ...product } = row;
    return {
      ...(product as ProductRow),
      thumbnail: main ? (previews[main] ?? null) : null,
      reviewCount: reviewRows?.length ?? 0,
    };
  });
}

export async function setProductActive(id: string, isActive: boolean) {
  const { error } = await supabase.from("products").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export async function reorderChild(table: ChildTable, rows: Array<{ id: string }>, from: number, to: number) {
  if (to < 0 || to >= rows.length) return;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  if (!moved) return;
  next.splice(to, 0, moved);
  await Promise.all(next.map((row, index) => updateChild(table, row.id, { sort_order: index })));
}

async function uniqueSlug(base: string) {
  const { data } = await supabase.from("products").select("slug").like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}

/** Duplica o produto e todo o conteúdo relacionado, reaproveitando os arquivos do storage. */
export async function duplicateProduct(id: string): Promise<string> {
  const source = await getProduct(id);
  if (!source) throw new Error("Produto não encontrado.");

  const { id: _id, created_at: _c, updated_at: _u, slug, name, ...rest } = source.product;
  const newSlug = await uniqueSlug(`${slug}-copia`);
  const newId = await createProduct({
    ...(rest as Partial<ProductRow>),
    slug: newSlug,
    name: `${name} (cópia)`,
    is_active: false,
  });

  const clone = <T extends { id: string }>(rows: T[]) =>
    rows.map(({ id: _rowId, ...row }) => ({ ...row, product_id: newId }));

  const batches: Array<[ChildTable, Record<string, unknown>[]]> = [
    ["product_images", clone(source.images)],
    ["product_details", clone(source.details)],
    ["product_highlights", clone(source.highlights)],
    ["promotions", clone(source.promotions)],
    ["reviews", clone(source.reviews)],
    ["product_offers", clone(source.offers)],
  ];

  for (const [table, rows] of batches) {
    if (rows.length === 0) continue;
    const { error } = await supabase.from(table).insert(rows as never);
    if (error) throw error;
  }

  // Copia também toda a configuração da aba "Página" e as recomendações manuais.
  await savePageSettings(newId, source.page);
  const recommended = await listRecommendations(id);
  if (recommended.length > 0) await saveRecommendations(newId, recommended);

  return newId;

}

// ================= RECOMENDAÇÕES =================

export type RecommendationOption = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

/** Produtos disponíveis para recomendar (exclui o próprio produto). */
export async function listRecommendationOptions(excludeId?: string): Promise<RecommendationOption[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, is_active")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as RecommendationOption[]).filter((row) => row.id !== excludeId);
}

/** IDs recomendados manualmente, na ordem definida no admin. */
export async function listRecommendations(productId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_recommendations")
    .select("recommended_product_id, sort_order")
    .eq("product_id", productId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row) => row.recommended_product_id as string);
}

/** Regrava a lista completa de recomendações manuais preservando a ordem. */
export async function saveRecommendations(productId: string, ids: string[]) {
  const unique = Array.from(new Set(ids.filter((id) => id && id !== productId)));
  const { error: clearError } = await supabase
    .from("product_recommendations")
    .delete()
    .eq("product_id", productId);
  if (clearError) throw clearError;
  if (unique.length === 0) return;
  const { error } = await supabase.from("product_recommendations").insert(
    unique.map((id, index) => ({
      product_id: productId,
      recommended_product_id: id,
      sort_order: index,
    })) as never,
  );
  if (error) throw error;
}
