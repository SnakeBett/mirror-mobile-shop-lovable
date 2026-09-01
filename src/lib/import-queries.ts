import { supabase } from "@/integrations/supabase/client";

import { slugify } from "./product-types";
import type { ImportedProduct, SourcePlatform } from "./import-types";

export type ImportHistoryRow = {
  id: string;
  source_platform: string;
  source_url: string;
  external_product_id: string | null;
  product_id: string | null;
  status: string;
  title: string | null;
  missing_fields: string[];
  created_at: string;
};

export async function listRecentImports(limit = 20): Promise<ImportHistoryRow[]> {
  const { data, error } = await supabase
    .from("product_imports")
    .select("id, source_platform, source_url, external_product_id, product_id, status, title, missing_fields, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ImportHistoryRow[];
}

export async function logImport(values: {
  source_platform: SourcePlatform;
  source_url: string;
  external_product_id?: string | null;
  product_id?: string | null;
  status: string;
  title?: string | null;
  missing_fields?: string[];
  error_detail?: string | null;
}) {
  const { error } = await supabase.from("product_imports").insert({
    ...values,
    missing_fields: values.missing_fields ?? [],
  } as never);
  if (error) throw error;
}

/** Procura produtos já importados da mesma origem. */
export async function findExistingImport(sourceUrl: string, externalId: string | null) {
  const filters = [`source_url.eq.${sourceUrl}`];
  if (externalId) filters.push(`external_product_id.eq.${externalId}`);
  const { data, error } = await supabase
    .from("products")
    .select("id, name, slug, is_active")
    .or(filters.join(","))
    .limit(1);
  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

async function uniqueSlug(base: string) {
  const safe = base || "produto";
  const { data } = await supabase.from("products").select("slug").like("slug", `${safe}%`);
  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(safe)) return safe;
  let counter = 2;
  while (taken.has(`${safe}-${counter}`)) counter += 1;
  return `${safe}-${counter}`;
}

export type ImportSelection = {
  name: boolean;
  currentPrice: boolean;
  oldPrice: boolean;
  attributes: boolean;
  rating: boolean;
  reviewCount: boolean;
  variants: boolean;
};

export type CreateFromImportInput = {
  imported: ImportedProduct;
  selection: ImportSelection;
  name: string;
  currentPrice: number;
  oldPrice: number | null;
  description: string;
  selectedImagePaths: string[];
  selectedAttributes: Array<{ label: string; value: string }>;
  selectedVariants: Array<{ name: string; values: string[] }>;
};

/** Cria o produto SEMPRE como rascunho (inativo) a partir dos dados revisados. */
export async function createProductFromImport(input: CreateFromImportInput): Promise<string> {
  const name = input.name.trim() || "Produto importado";
  const slug = await uniqueSlug(slugify(name));

  const discount =
    input.oldPrice && input.oldPrice > input.currentPrice
      ? Math.round(((input.oldPrice - input.currentPrice) / input.oldPrice) * 100)
      : null;

  const { data, error } = await supabase
    .from("products")
    .insert({
      slug,
      name,
      current_price: input.selection.currentPrice ? input.currentPrice : 0,
      old_price: input.selection.oldPrice ? input.oldPrice : null,
      discount_percentage: input.selection.oldPrice ? discount : null,
      description: input.description || null,
      rating: input.selection.rating ? input.imported.rating : null,
      review_count: input.selection.reviewCount ? (input.imported.reviewCount ?? 0) : 0,
      is_active: false,
      source_platform: input.imported.source,
      source_url: input.imported.sourceUrl,
      external_product_id: input.imported.externalId,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const productId = data.id as string;

  if (input.selectedImagePaths.length > 0) {
    const { error: imageError } = await supabase.from("product_images").insert(
      input.selectedImagePaths.map((path, index) => ({
        product_id: productId,
        image_url: path,
        sort_order: index,
      })) as never,
    );
    if (imageError) throw imageError;
  }

  const details = [
    ...(input.selection.attributes ? input.selectedAttributes : []),
    ...(input.selection.variants
      ? input.selectedVariants.map((variant) => ({ label: variant.name, value: variant.values.join(", ") }))
      : []),
  ];
  if (details.length > 0) {
    const { error: detailError } = await supabase.from("product_details").insert(
      details.map((detail, index) => ({
        product_id: productId,
        label: detail.label,
        value: detail.value,
        sort_order: index,
      })) as never,
    );
    if (detailError) throw detailError;
  }

  return productId;
}
