import { supabase } from "@/integrations/supabase/client";

import { slugify } from "./product-types";
import type { ImportedProduct, ImportMethod, SourcePlatform } from "./import-types";
import { DEFAULT_VARIANT_SETTINGS } from "./variants";

export type ImportHistoryRow = {
  id: string;
  source_platform: string;
  source_url: string;
  external_product_id: string | null;
  product_id: string | null;
  status: string;
  title: string | null;
  missing_fields: string[];
  import_method: string | null;
  created_at: string;
};

export async function listRecentImports(limit = 20): Promise<ImportHistoryRow[]> {
  const { data, error } = await supabase
    .from("product_imports")
    .select("id, source_platform, source_url, external_product_id, product_id, status, title, missing_fields, import_method, created_at")
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
  import_method?: ImportMethod;
}) {
  const payload = {
    ...values,
    missing_fields: values.missing_fields ?? [],
    import_method: values.import_method ?? "server",
  };

  // Reanálise da mesma URL atualiza o registro existente em vez de duplicar.
  if (!values.product_id) {
    const { data: existing } = await supabase
      .from("product_imports")
      .select("id")
      .eq("source_url", values.source_url)
      .is("product_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (existing ?? [])[0];
    if (row) {
      const { error: updateError } = await supabase
        .from("product_imports")
        .update(payload as never)
        .eq("id", row.id);
      if (updateError) throw updateError;
      return;
    }
  }

  const { error } = await supabase.from("product_imports").insert(payload as never);
  if (error) throw error;

}

/** Procura produtos já importados da mesma origem. */
export async function findExistingImport(sourceUrl: string, externalId: string | null) {
  // Duas consultas com .eq(): URL com vírgula ou parênteses quebra o filtro .or().
  const columns = "id, name, slug, is_active";
  const byUrl = await supabase.from("products").select(columns).eq("source_url", sourceUrl).limit(1);
  if (byUrl.error) throw byUrl.error;
  if (byUrl.data?.[0] || !externalId) return byUrl.data?.[0] ?? null;

  const byId = await supabase.from("products").select(columns).eq("external_product_id", externalId).limit(1);
  if (byId.error) throw byId.error;
  return byId.data?.[0] ?? null;
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
  importMethod?: ImportMethod;
};

/** Grupos de variação sem nomes vazios nem valores repetidos. */
export function normalizeVariantGroups(groups: Array<{ name: string; values: string[] }>) {
  const seenGroups = new Set<string>();
  const result: Array<{ name: string; values: string[] }> = [];
  for (const group of groups) {
    const name = group.name.trim();
    const groupKey = name.toLowerCase();
    if (!name || seenGroups.has(groupKey)) continue;
    const seenValues = new Set<string>();
    const values: string[] = [];
    for (const raw of group.values) {
      const value = raw.trim();
      const valueKey = value.toLowerCase();
      if (!value || seenValues.has(valueKey)) continue;
      seenValues.add(valueKey);
      values.push(value);
    }
    if (values.length === 0) continue;
    seenGroups.add(groupKey);
    result.push({ name, values });
  }
  return result;
}

/**
 * Cria as variações de verdade (atributos + valores) e liga a seção no produto.
 * Nenhuma combinação é gravada: assim todas as opções ficam disponíveis pelo preço base.
 */
async function createImportedVariations(productId: string, groups: Array<{ name: string; values: string[] }>) {
  const clean = normalizeVariantGroups(groups);
  if (clean.length === 0) return;

  for (const [index, group] of clean.entries()) {
    const { data: attribute, error } = await supabase
      .from("product_attributes")
      .insert({
        product_id: productId,
        name: group.name,
        display_type: /\b(cor|cores|color|colour)\b/i.test(group.name) ? "color" : "buttons",
        sort_order: index,
      } as never)
      .select("id")
      .single();
    if (error) throw error;

    const { error: valueError } = await supabase.from("product_attribute_values").insert(
      group.values.map((name, sortOrder) => ({
        attribute_id: attribute.id,
        product_id: productId,
        name,
        sort_order: sortOrder,
      })) as never,
    );
    if (valueError) throw valueError;
  }

  const { error: settingsError } = await supabase
    .from("product_page_settings")
    .upsert(
      { product_id: productId, variant_settings: { ...DEFAULT_VARIANT_SETTINGS, variants_enabled: true } } as never,
      { onConflict: "product_id" },
    );
  if (settingsError) throw settingsError;
}

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
      import_method: input.importMethod ?? "server",
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

  if (input.selection.variants) await createImportedVariations(productId, input.selectedVariants);

  const details = input.selection.attributes ? input.selectedAttributes : [];
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

export type AssistedImportInput = {
  name: string;
  currentPrice: number;
  oldPrice: number | null;
  description: string;
  rating: number | null;
  reviewCount: number | null;
  attributes: Array<{ label: string; value: string }>;
  sourceUrl: string | null;
  sourcePlatform: SourcePlatform;
  importMethod?: ImportMethod;
};

/** Cadastro assistido: usado quando a página bloqueia a leitura automática. */
export async function createProductAssisted(input: AssistedImportInput): Promise<string> {
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
      current_price: input.currentPrice,
      old_price: input.oldPrice,
      discount_percentage: discount,
      description: input.description || null,
      rating: input.rating,
      review_count: input.reviewCount ?? 0,
      is_active: false,
      source_platform: input.sourcePlatform,
      source_url: input.sourceUrl,
      import_method: input.importMethod ?? "manual",
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const productId = data.id as string;

  const details = input.attributes.filter((item) => item.label.trim() && item.value.trim());
  if (details.length > 0) {
    const { error: detailError } = await supabase.from("product_details").insert(
      details.map((detail, index) => ({
        product_id: productId,
        label: detail.label.trim(),
        value: detail.value.trim(),
        sort_order: index,
      })) as never,
    );
    if (detailError) throw detailError;
  }

  return productId;
}
