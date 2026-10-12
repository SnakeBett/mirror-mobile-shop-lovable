import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_BUCKET } from "@/lib/storage-images";
import { normalizeStoreInfo, type StoreInfo } from "@/lib/store-info";

export type StoreRecord = { id: string; info: StoreInfo; product_count: number };

export async function listStores(): Promise<StoreRecord[]> {
  const [{ data, error }, { data: products }] = await Promise.all([
    supabase.from("stores").select("id, name, info").order("name"),
    supabase.from("products").select("store_id").not("store_id", "is", null),
  ]);
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of products ?? []) {
    const id = row.store_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    info: normalizeStoreInfo({ ...(row.info as object), name: row.name }),
    product_count: counts.get(row.id) ?? 0,
  }));
}

export async function saveStore(id: string | null, info: StoreInfo): Promise<string> {
  const clean = normalizeStoreInfo(info);
  if (!clean.name) throw new Error("Informe o nome da loja.");
  const row = { name: clean.name, info: clean as never };
  if (id) {
    const { error } = await supabase.from("stores").update(row).eq("id", id);
    if (error) throw new Error(error.message);
    return id;
  }
  const { data, error } = await supabase.from("stores").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Transfere (ou desvincula, quando transferTo é null) os produtos e exclui a loja. */
export async function deleteStore(id: string, transferTo: string | null) {
  const { error: moveError } = await supabase.from("products").update({ store_id: transferTo }).eq("store_id", id);
  if (moveError) throw new Error(moveError.message);
  const { error } = await supabase.from("stores").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function signedLogo(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from(PRODUCT_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function uploadLogo(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `store/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error("Não foi possível enviar a logo.");
  return path;
}
