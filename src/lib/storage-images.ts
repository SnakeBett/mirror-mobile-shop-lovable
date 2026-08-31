import type { SupabaseClient } from "@supabase/supabase-js";

export const PRODUCT_BUCKET = "product-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 dias

function isAbsolute(value: string) {
  return /^https?:\/\//i.test(value);
}

/**
 * O bucket é privado, então caminhos de storage viram URLs assinadas.
 * URLs absolutas são devolvidas sem alteração.
 */
export async function resolveImageUrls(
  client: SupabaseClient<any, any, any>,
  values: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const paths = Array.from(
    new Set(values.filter((value): value is string => !!value && !isAbsolute(value))),
  );
  const map: Record<string, string> = {};
  for (const value of values) {
    if (value && isAbsolute(value)) map[value] = value;
  }
  if (paths.length === 0) return map;

  const { data, error } = await client.storage.from(PRODUCT_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error || !data) return map;
  for (const item of data) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}

export async function resolveImageUrl(
  client: SupabaseClient<any, any, any>,
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  const map = await resolveImageUrls(client, [value]);
  return map[value] ?? null;
}
