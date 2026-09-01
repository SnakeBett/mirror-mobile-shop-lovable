/**
 * Modelo normalizado do importador de produtos.
 * Todos os adapters (Mercado Livre, Shopee, TikTok Shop, genérico) convertem
 * seus dados para este formato antes de chegar na interface do admin.
 */

export type SourcePlatform = "mercado_livre" | "shopee" | "tiktok_shop" | "unknown";

export type ImportStatus = "analyzing" | "found" | "partial" | "blocked" | "failed" | "imported";

export type ImportedAttribute = { label: string; value: string };

export type ImportedVariantOption = { name: string; values: string[] };

export type ImportedProduct = {
  source: SourcePlatform;
  sourceUrl: string;
  externalId: string | null;
  title: string | null;
  currentPrice: number | null;
  oldPrice: number | null;
  discount: number | null;
  images: string[];
  rating: number | null;
  reviewCount: number | null;
  /** Texto original da origem, apenas quando a fonte autoriza a reutilização. */
  description: string | null;
  descriptionLicensed: boolean;
  attributes: ImportedAttribute[];
  variants: ImportedVariantOption[];
  availability: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type ImportAnalysis = {
  status: ImportStatus;
  product: ImportedProduct | null;
  /** Campos que não puderam ser recuperados legitimamente. */
  missingFields: string[];
  /** Mensagens amigáveis para o admin (sem detalhes técnicos). */
  notices: string[];
  /** Mensagem de erro amigável quando status = failed. */
  message: string | null;
  /** Avaliações individuais nunca são inventadas. */
  individualReviewsAvailable: boolean;
};

export const PLATFORM_LABELS: Record<SourcePlatform, string> = {
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  tiktok_shop: "TikTok Shop",
  unknown: "Outra plataforma",
};

const PLATFORM_HOSTS: Array<{ platform: SourcePlatform; hosts: string[] }> = [
  { platform: "mercado_livre", hosts: ["mercadolivre.com.br", "mercadolibre.com", "mercadolibre.com.ar", "mercadolivre.com", "mlstatic.com"] },
  { platform: "shopee", hosts: ["shopee.com.br", "shopee.com", "shopee.com.my", "shopee.sg", "xiapibuy.com"] },
  { platform: "tiktok_shop", hosts: ["shop.tiktok.com", "tiktok.com", "vt.tiktok.com"] },
];

/** Valida a URL: apenas http(s) e nada de hosts internos/privados (anti-SSRF). */
export function parseProductUrl(raw: string): { url: URL } | { error: string } {
  const value = (raw ?? "").trim();
  if (!value) return { error: "URL inválida." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: "URL inválida." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "URL inválida. Use um endereço https." };
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) return { error: "URL inválida." };
  return { url };
}

export function detectPlatform(raw: string): SourcePlatform {
  const parsed = parseProductUrl(raw);
  if ("error" in parsed) return "unknown";
  const host = parsed.url.hostname.toLowerCase();
  for (const entry of PLATFORM_HOSTS) {
    if (entry.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) {
      return entry.platform;
    }
  }
  return "unknown";
}

export function isAllowedSourceHost(host: string): boolean {
  const value = host.toLowerCase();
  return PLATFORM_HOSTS.some((entry) =>
    entry.hosts.some((candidate) => value === candidate || value.endsWith(`.${candidate}`)),
  );
}

export const FIELD_LABELS: Record<string, string> = {
  title: "Nome",
  currentPrice: "Preço",
  oldPrice: "Preço anterior",
  discount: "Desconto",
  images: "Imagens",
  attributes: "Características / especificações",
  rating: "Nota média",
  reviewCount: "Quantidade de avaliações",
  variants: "Variações",
  description: "Descrição original",
  individualReviews: "Avaliações individuais",
  availability: "Disponibilidade",
};
