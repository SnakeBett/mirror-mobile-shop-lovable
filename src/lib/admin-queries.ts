import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_BUCKET, resolveImageUrls } from "./storage-images";
import type {
  ProductDetailRow,
  ProductHighlightRow,
  ProductImageRow,
  ProductPromotionRow,
  ProductReview,
  ProductRow,
} from "./product-types";

export type ChildTable =
  | "product_images"
  | "product_details"
  | "product_highlights"
  | "promotions"
  | "reviews";

export async function listProducts(search = "") {
  let query = supabase.from("products").select("*").order("created_at", { ascending: false });
  if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

export async function getProduct(id: string) {
  const [product, images, details, highlights, promotions, reviews] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_images").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("product_details").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("product_highlights").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("promotions").select("*").eq("product_id", id).order("sort_order"),
    supabase.from("reviews").select("*").eq("product_id", id).order("sort_order"),
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
    previews,
  };
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
