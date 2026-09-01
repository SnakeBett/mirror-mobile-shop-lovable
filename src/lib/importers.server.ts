/**
 * Adapters de importação PÚBLICA (server-only).
 *
 * Nenhuma credencial, token ou API key é necessária. Cada adapter lê apenas o
 * conteúdo público da página (JSON-LD / schema.org, Open Graph, meta tags e
 * HTML). Nunca contornamos login, CAPTCHA ou proteções anti-bot: se a página
 * bloquear a leitura, devolvemos status "blocked" para oferecer a importação
 * assistida.
 */
import {
  isAllowedSourceHost,
  parseProductUrl,
  type ImportAnalysis,
  type ImportedAttribute,
  type ImportedProduct,
  type ImportedVariantOption,
  type SourcePlatform,
} from "./import-types";

export type ImporterContext = { url: URL; html: string; json: unknown[] };

export type Importer = {
  platform: SourcePlatform;
  extract: (ctx: ImporterContext) => Partial<ImportedProduct>;
};

const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;
const MAX_BYTES = 3 * 1024 * 1024;

function emptyProduct(platform: SourcePlatform, url: URL): ImportedProduct {
  return {
    source: platform,
    sourceUrl: url.toString(),
    externalId: null,
    title: null,
    currentPrice: null,
    oldPrice: null,
    discount: null,
    images: [],
    rating: null,
    reviewCount: null,
    description: null,
    descriptionLicensed: false,
    attributes: [],
    variants: [],
    availability: null,
    metadata: {},
  };
}

function blocked(message: string, notices: string[] = []): ImportAnalysis {
  return {
    status: "blocked",
    product: null,
    missingFields: [],
    notices,
    message,
    individualReviewsAvailable: false,
    foundCount: 0,
  };
}

// ---------- fetch público seguro (SSRF + timeout + redirects validados) ----------

async function fetchPublicHtml(start: URL): Promise<{ url: URL; html: string } | { error: string }> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const check = parseProductUrl(current.toString());
    if ("error" in check) return { error: "URL inválida." };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
          "user-agent": "Mozilla/5.0 (compatible; LovableProductImporter/1.0)",
        },
      });
    } catch {
      clearTimeout(timer);
      return { error: "timeout" };
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { error: "blocked" };
      try {
        current = new URL(location, current);
      } catch {
        return { error: "blocked" };
      }
      continue;
    }

    if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
      return { error: "blocked" };
    }
    if (response.status === 404) return { error: "notfound" };
    if (!response.ok) return { error: "blocked" };

    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return { error: "blocked" };

    const raw = await response.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(raw.slice(0, MAX_BYTES));
    return { url: current, html };
  }
  return { error: "blocked" };
}

// ---------- helpers de extração ----------

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function collectJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const text = (match[1] ?? "").trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
    } catch {
      /* ignora blocos inválidos */
    }
  }
  // Expande @graph
  const expanded: unknown[] = [];
  for (const entry of results) {
    expanded.push(entry);
    const graph = (entry as Record<string, unknown>)?.["@graph"];
    if (Array.isArray(graph)) expanded.push(...graph);
  }
  return expanded;
}

function isProductNode(node: unknown): node is Record<string, any> {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((value) => typeof value === "string" && value.toLowerCase().includes("product"));
}

function metaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
      "i",
    );
    const tag = html.match(pattern)?.[0];
    if (!tag) continue;
    const content = tag.match(/content=["']([\s\S]*?)["']/i)?.[1];
    if (content && content.trim()) return decodeEntities(content.trim());
  }
  return null;
}

function allMetaContents(html: string, key: string): string[] {
  const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "gi");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const content = match[0].match(/content=["']([\s\S]*?)["']/i)?.[1];
    if (content?.trim()) out.push(decodeEntities(content.trim()));
  }
  return out;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  let text = value.replace(/[^\d.,-]/g, "").trim();
  if (!text) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
  else text = text.replace(/,/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstOffer(node: Record<string, any>): Record<string, any> | null {
  const offers = node["offers"];
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  for (const offer of list) {
    if (offer && typeof offer === "object") {
      if (offer["@type"] === "AggregateOffer" || offer["lowPrice"] != null) return offer;
      if (offer["price"] != null || offer["priceSpecification"]) return offer;
    }
  }
  return list[0] && typeof list[0] === "object" ? list[0] : null;
}

function absolute(base: URL, value: string): string | null {
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function htmlImages(html: string, base: URL): string[] {
  const out: string[] = [];
  const regex = /<img[^>]+(?:data-src|data-zoom-image|src)=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) && out.length < 40) {
    const raw = match[1];
    if (!raw || raw.startsWith("data:")) continue;
    const url = absolute(base, decodeEntities(raw));
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

function stripHtml(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// ---------- extração base (JSON-LD → OG → meta → HTML) ----------

function extractFromPage(platform: SourcePlatform, ctx: ImporterContext): ImportedProduct {
  const { url, html, json } = ctx;
  const product = emptyProduct(platform, url);

  const node = json.find(isProductNode) as Record<string, any> | undefined;

  if (node) {
    if (typeof node["name"] === "string") product.title = node["name"].trim();
    if (typeof node["sku"] === "string") product.externalId = node["sku"];
    else if (typeof node["productID"] === "string") product.externalId = node["productID"];
    if (typeof node["mpn"] === "string") product.metadata["mpn"] = node["mpn"];

    const brand = node["brand"];
    const brandName = typeof brand === "string" ? brand : typeof brand?.name === "string" ? brand.name : null;
    if (brandName) product.attributes.push({ label: "Marca", value: brandName });

    const images = node["image"];
    const imageList = Array.isArray(images) ? images : images ? [images] : [];
    for (const image of imageList) {
      const raw = typeof image === "string" ? image : typeof image?.url === "string" ? image.url : null;
      if (!raw) continue;
      const abs = absolute(url, raw);
      if (abs && !product.images.includes(abs)) product.images.push(abs);
    }

    if (typeof node["description"] === "string" && node["description"].trim()) {
      product.description = stripHtml(node["description"]).slice(0, 4000);
    }

    const offer = firstOffer(node);
    if (offer) {
      product.currentPrice =
        toNumber(offer["price"]) ??
        toNumber(offer["lowPrice"]) ??
        toNumber(offer["priceSpecification"]?.["price"]);
      const currencyCode = offer["priceCurrency"] ?? offer["priceSpecification"]?.["priceCurrency"];
      if (typeof currencyCode === "string") product.metadata["currency"] = currencyCode;
      const availability = offer["availability"];
      if (typeof availability === "string") {
        product.availability = availability.includes("InStock")
          ? "Disponível"
          : availability.includes("OutOfStock")
            ? "Indisponível"
            : availability.split("/").pop() ?? null;
      }
      const high = toNumber(offer["highPrice"]);
      if (high && product.currentPrice && high > product.currentPrice) product.oldPrice = high;
    }

    const rating = node["aggregateRating"];
    if (rating && typeof rating === "object") {
      product.rating = toNumber(rating["ratingValue"]);
      product.reviewCount = toNumber(rating["reviewCount"]) ?? toNumber(rating["ratingCount"]);
    }

    const additional = node["additionalProperty"];
    if (Array.isArray(additional)) {
      for (const entry of additional) {
        const label = typeof entry?.name === "string" ? entry.name : null;
        const value = entry?.value != null ? String(entry.value) : null;
        if (label && value) product.attributes.push({ label, value });
      }
    }
    for (const [key, label] of [
      ["color", "Cor"],
      ["material", "Material"],
      ["size", "Tamanho"],
      ["model", "Modelo"],
      ["weight", "Peso"],
    ] as const) {
      const value = node[key];
      const text =
        typeof value === "string"
          ? value
          : value && typeof value === "object" && value["value"] != null
            ? `${value["value"]} ${value["unitText"] ?? ""}`.trim()
            : null;
      if (text) product.attributes.push({ label, value: text });
    }
  }

  // Open Graph / meta tags como complemento
  if (!product.title) product.title = metaContent(html, ["og:title", "twitter:title", "title"]);
  if (!product.title) {
    const tag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (tag) product.title = stripHtml(tag);
  }
  if (!product.description) {
    const description = metaContent(html, ["og:description", "description", "twitter:description"]);
    if (description) product.description = description;
  }
  if (product.currentPrice == null) {
    product.currentPrice = toNumber(
      metaContent(html, ["product:price:amount", "og:price:amount", "twitter:data1", "price"]),
    );
  }
  if (!product.metadata["currency"]) {
    const currencyMeta = metaContent(html, ["product:price:currency", "og:price:currency"]);
    if (currencyMeta) product.metadata["currency"] = currencyMeta;
  }
  if (product.oldPrice == null) {
    const old = toNumber(metaContent(html, ["product:original_price:amount", "og:price:standard_amount"]));
    if (old && product.currentPrice && old > product.currentPrice) product.oldPrice = old;
  }
  if (!product.externalId) {
    const sku = metaContent(html, ["product:retailer_item_id", "og:product:id", "sku"]);
    if (sku) product.externalId = sku;
  }
  if (product.rating == null) product.rating = toNumber(metaContent(html, ["ratingValue"]));
  if (product.reviewCount == null) product.reviewCount = toNumber(metaContent(html, ["reviewCount", "ratingCount"]));

  // Último recurso: preço visível no HTML público (microdata ou padrão monetário).
  if (product.currentPrice == null) {
    const microdata = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1];
    const fromMicrodata = toNumber(microdata ?? "");
    if (fromMicrodata) product.currentPrice = fromMicrodata;
  }
  if (product.currentPrice == null) {
    const candidates = [...html.matchAll(/(?:R\$|US\$|€|£)\s?([\d.,]{3,12})/g)]
      .map((match) => toNumber(match[1] ?? ""))
      .filter((value): value is number => value != null && value > 0);
    if (candidates.length > 0) product.currentPrice = candidates[0] ?? null;
  }

  const ogImages = [...allMetaContents(html, "og:image"), ...allMetaContents(html, "og:image:secure_url")];
  for (const image of ogImages) {
    const abs = absolute(url, image);
    if (abs && !product.images.includes(abs)) product.images.push(abs);
  }
  if (product.images.length === 0) {
    product.images = htmlImages(html, url);
  }
  product.images = product.images.slice(0, 20);

  if (product.oldPrice && product.currentPrice && product.oldPrice > product.currentPrice) {
    product.discount = Math.round(((product.oldPrice - product.currentPrice) / product.oldPrice) * 100);
  }

  // deduplica atributos
  const seen = new Set<string>();
  product.attributes = product.attributes.filter((attribute) => {
    const key = attribute.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return product;
}

// ---------- adapters específicos (apenas refinam a extração pública) ----------

function mercadoLivreItemId(url: URL): string | null {
  const source = `${url.pathname}${url.search}`;
  const match = source.match(/(ML[A-Z])-?(\d{6,})/i);
  if (!match) return null;
  return `${(match[1] ?? "").toUpperCase()}${match[2] ?? ""}`;
}

const mercadoLivreImporter: Importer = {
  platform: "mercado_livre",
  extract({ url, html }) {
    const patch: Partial<ImportedProduct> = {};
    const id = mercadoLivreItemId(url);
    if (id) patch.externalId = id;

    // Tabela pública de especificações (ficha técnica)
    const attributes: ImportedAttribute[] = [];
    const rows = html.match(/<tr[^>]*>[\s\S]{0,600}?<\/tr>/gi) ?? [];
    for (const row of rows.slice(0, 200)) {
      const cells = row.match(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi);
      if (!cells || cells.length < 2) continue;
      const label = stripHtml(cells[0] ?? "");
      const value = stripHtml(cells[1] ?? "");
      if (label && value && label.length < 40 && value.length < 120) attributes.push({ label, value });
    }
    if (attributes.length > 0) patch.attributes = attributes.slice(0, 30);

    const variants: ImportedVariantOption[] = [];
    const variantBlocks = html.match(/<p[^>]*class="[^"]*ui-pdp-variations__label[^"]*"[^>]*>([\s\S]*?)<\/p>/gi) ?? [];
    for (const block of variantBlocks) {
      const text = stripHtml(block);
      const [name, value] = text.split(":");
      if (name && value) variants.push({ name: name.trim(), values: [value.trim()] });
    }
    if (variants.length > 0) patch.variants = variants;

    return patch;
  },
};

const shopeeImporter: Importer = {
  platform: "shopee",
  extract({ url }) {
    const match = url.pathname.match(/i\.(\d+)\.(\d+)/);
    return match ? { externalId: `${match[1]}_${match[2]}` } : {};
  },
};

const tiktokImporter: Importer = {
  platform: "tiktok_shop",
  extract({ url }) {
    const id = url.searchParams.get("product_id") ?? url.pathname.match(/(\d{10,})/)?.[1] ?? null;
    return id ? { externalId: id } : {};
  },
};

const genericImporter: Importer = { platform: "unknown", extract: () => ({}) };

const IMPORTERS: Record<SourcePlatform, Importer> = {
  mercado_livre: mercadoLivreImporter,
  shopee: shopeeImporter,
  tiktok_shop: tiktokImporter,
  unknown: genericImporter,
};

export function getImporter(platform: SourcePlatform): Importer {
  return IMPORTERS[platform] ?? genericImporter;
}

// ---------- entrada principal ----------

export async function analyzePublicUrl(url: URL, platform: SourcePlatform): Promise<ImportAnalysis> {
  const fetched = await fetchPublicHtml(url);
  if ("error" in fetched) {
    if (fetched.error === "timeout") {
      return blocked("Não conseguimos ler automaticamente esta página (tempo esgotado).", [
        "Use a importação assistida para cadastrar os dados manualmente.",
      ]);
    }
    if (fetched.error === "notfound") {
      return blocked("Produto não encontrado nesta URL.");
    }
    if (fetched.error === "URL inválida.") {
      return {
        status: "failed",
        product: null,
        missingFields: [],
        notices: [],
        message: "URL inválida.",
        individualReviewsAvailable: false,
        foundCount: 0,
      };
    }
    return blocked("Não conseguimos ler automaticamente esta página.", [
      "A loja pode estar bloqueando leituras automáticas. Use a importação assistida.",
    ]);
  }

  const ctx: ImporterContext = {
    url: fetched.url,
    html: fetched.html,
    json: collectJsonLd(fetched.html),
  };

  const base = extractFromPage(platform, ctx);
  let product = base;
  try {
    const patch = getImporter(platform).extract(ctx);
    product = {
      ...base,
      ...patch,
      attributes: patch.attributes?.length ? [...base.attributes, ...patch.attributes] : base.attributes,
      images: patch.images?.length ? patch.images : base.images,
    };
  } catch (error) {
    console.error("[import] adapter falhou, usando extração genérica", error);
  }
  product.sourceUrl = url.toString();
  product.metadata["canonicalUrl"] = fetched.url.toString();
  product.metadata["imagesReusable"] = isAllowedSourceHost(fetched.url.hostname);

  const found: string[] = [];
  if (product.title) found.push("title");
  if (product.currentPrice != null) found.push("currentPrice");
  if (product.oldPrice != null) found.push("oldPrice");
  if (product.images.length > 0) found.push("images");
  if (product.attributes.length > 0) found.push("attributes");
  if (product.rating != null) found.push("rating");
  if (product.reviewCount != null) found.push("reviewCount");
  if (product.variants.length > 0) found.push("variants");
  if (product.description) found.push("description");

  if (found.length === 0) {
    return blocked("Não conseguimos ler automaticamente esta página.", [
      "Nenhum dado público estruturado foi encontrado. Use a importação assistida.",
    ]);
  }

  const missingFields = [
    "title",
    "currentPrice",
    "oldPrice",
    "images",
    "attributes",
    "rating",
    "reviewCount",
    "variants",
  ].filter((field) => !found.includes(field));
  missingFields.push("individualReviews");

  const notices = [
    "Avaliações individuais não são importadas: cadastre as suas próprias no editor.",
    "A descrição da origem serve apenas como referência factual — gere uma descrição própria.",
  ];

  return {
    status: found.length >= 4 ? "found" : "partial",
    product,
    missingFields,
    notices,
    message: null,
    individualReviewsAvailable: false,
    foundCount: found.length,
  };
}

/** Mantido para compatibilidade futura com integrações oficiais (opcional). */
export function integrationStatus() {
  return {
    mercado_livre: process.env["MERCADO_LIVRE_ACCESS_TOKEN"] ? "connected" : "not_configured",
    shopee: process.env["SHOPEE_API_KEY"] ? "connected" : "not_configured",
    tiktok_shop: process.env["TIKTOK_SHOP_API_KEY"] ? "connected" : "not_configured",
  } as const;
}
