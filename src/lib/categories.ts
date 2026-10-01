import { supabase } from "@/integrations/supabase/client";

export type Category = { id: string; name: string; parent_id: string | null; sort_order: number };
export type CategoryTree = Category & { children: Category[] };

/** Única fonte de categorias: alimenta produtos, recomendações e dashboard. */
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("product_categories" as never)
    .select("id, name, parent_id, sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Category[];
}

export function buildTree(rows: Category[]): CategoryTree[] {
  return rows
    .filter((row) => !row.parent_id)
    .map((root) => ({ ...root, children: rows.filter((row) => row.parent_id === root.id) }));
}

export async function createCategory(name: string, parentId: string | null = null) {
  const { error } = await supabase
    .from("product_categories" as never)
    .insert({ name: name.trim(), parent_id: parentId } as never);
  if (error) throw error;
}

export async function renameCategory(id: string, name: string) {
  const { error } = await supabase
    .from("product_categories" as never)
    .update({ name: name.trim() } as never)
    .eq("id", id);
  if (error) throw error;
}

/** Quantos produtos usam a categoria (como categoria ou subcategoria). */
export async function categoryUsage(id: string) {
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .or(`category_id.eq.${id},subcategory_id.eq.${id}`);
  return count ?? 0;
}

export async function deleteCategory(id: string) {
  const used = await categoryUsage(id);
  if (used > 0) throw new Error(`Não é possível excluir: ${used} produto(s) usam esta categoria.`);
  const { count: children } = await supabase
    .from("product_categories" as never)
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);
  if ((children ?? 0) > 0) throw new Error("Exclua as subcategorias primeiro.");
  const { error } = await supabase.from("product_categories" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function setProductsCategory(ids: string[], categoryId: string | null, subcategoryId: string | null) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("products")
    .update({ category_id: categoryId, subcategory_id: subcategoryId } as never)
    .in("id", ids);
  if (error) throw error;
}
