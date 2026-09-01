/**
 * Adapters de importação PÚBLICA (server-only).
 *
 * Nenhuma credencial, token ou API key é necessária. Cada adapter lê apenas o
 * conteúdo público da página (JSON-LD / schema.org, Open Graph, meta tags,
 * estado serializado da aplicação e HTML). Nunca contornamos login, CAPTCHA ou
 * proteções anti-bot: se a página bloquear a leitura, marcamos "blocked" e
 * mantemos apenas os dados reais que já tinham sido descobertos.
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

export type ImporterContext = {
  url: URL;
  canonicalUrl: URL;
  productId: string | null;
  html: string;
  json: unknown[];
  inlineJson: unknown[];
};

export type Importer = {
  platform: SourcePlatform;
  extract: (ctx: ImporterContext) => Partial<ImportedProduct>;
};

const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;
const MAX_BYTES = 3 * 1024 * 1024;

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

// ---------- detecção de páginas de bloqueio ----------

const BLOCK_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /security\s*check/i, reason: "security_check" },
  { re: /access\s*denied/i, reason: "access_denied" },
  { re: /\b403\s*forbidden\b|^forbidden$/i, reason: "forbidden" },
  { re: /captcha/i, reason: "captcha" },
  { re: /verify\s+(that\s+)?you(?:'re| are)?\s+(a\s+)?human/i, reason: "human_verification" },
  { re: /robot\s*check/i, reason: "robot_check" },
  { re: /just\s+a\s+moment/i, reason: "challenge" },
  { re: /temporarily\s+unavailable/i, reason: "temporarily_unavailable" },
  { re: /verifica(ção|cao)\s+de\s+seguran(ç|c)a/i, reason: "security_check" },
  { re: /acesso\s+negado/i, reason: "access_denied" },
  { re: /attention\s+required/i, reason: "challenge" },
  { re: /checking\s+your\s+browser/i, reason: "challenge" },
  { re: /^(entrar|log\s*in|login|sign\s*in|iniciar\s+sess(ã|a)o)\b/i, reason: "login_required" },
  { re: /^fa(ç|c)a\s+login\b/i, reason: "login_required" },

];

/** Retorna o motivo do bloqueio quando o texto parece uma página de proteção. */
export function detectBlockedText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text || text.length > 120) return null;
  for (const entry of BLOCK_PATTERNS) if (entry.re.test(text)) return entry.reason;
  return null;
}

/** Detecta se a página inteira é um desafio/bloqueio anti-bot. */
export function detectBlockedPage(html: string): string | null {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const byTitle = detectBlockedText(title ? stripHtml(title) : null);
  if (byTitle) return byTitle;

  const head = html.slice(0, 20_000);
  const body = stripHtml(head).slice(0, 4000);
  if (body.length < 1200) {
    for (const entry of BLOCK_PATTERNS) if (entry.re.test(body)) return entry.reason;
  }
  if (/cf-browser-verification|__cf_chl|_Incapsula_Resource|distil_r_captcha/i.test(head)) return "challenge";
  return null;
}

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
    soldCount: null,
    description: null,
    descriptionLicensed: false,
    attributes: [],
    variants: [],
    availability: null,
    metadata: {},
  };
}

function blocked(message: string, notices: string[] = [], reason = "blocked"): ImportAnalysis {
  return {
    status: "blocked",
    product: null,
    missingFields: [],
    notices,
    message,
    individualReviewsAvailable: false,
    foundCount: 0,
    blockedReason: reason,
    strategyUsed: "none",
  };
}

// ---------- URL canônica / productId ----------

const TRACKING_PARAMS = /^(utm_|btm_|source$|share|from|_r$|_t$|checksum|sec_user_id|enter_from|trk|ref$|referer|referrer|spm|gclid|fbclid|msclkid|pvid|tt_|aid$|ad_|campaign)/i;

export function canonicalizeProductUrl(
  url: URL,
  platform: SourcePlatform,
): { canonical: URL; productId: string | null } {
  const canonical = new URL(url.toString());
  canonical.hash = "";

  let productId: string | null = null;

  if (platform === "tiktok_shop") {
    const match = canonical.pathname.match(/\/pdp\/(?:[^/]*?-)?(\d{6,})/) ?? canonical.pathname.match(/(\d{12,})/);
    productId = match?.[1] ?? canonical.searchParams.get("product_id");
    if (productId) {
      const locale = canonical.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//i)?.[1];
      canonical.pathname = `${locale ? `/${locale}` : ""}/pdp/${productId}`;
      canonical.search = "";
      return { canonical, productId };
    }
  }

  if (platform === "mercado_livre") {
    const match = `${canonical.pathname}${canonical.search}`.match(/(ML[A-Z])-?(\d{6,})/i);
    if (match) productId = `${(match[1] ?? "").toUpperCase()}${match[2] ?? ""}`;
  }

  if (platform === "shopee") {
    const match = canonical.pathname.match(/i\.(\d+)\.(\d+)/);
    if (match) productId = `${match[1]}_${match[2]}`;
  }

  // Remove parâmetros de rastreio genéricos.
  const keys = [...canonical.searchParams.keys()];
  for (const key of keys) if (TRACKING_PARAMS.test(key)) canonical.searchParams.delete(key);

  return { canonical, productId };
}

// ---------- fetch público seguro (SSRF + timeout + redirects validados) ----------

async function fetchOnce(start: URL, userAgent: string): Promise<{ url: URL; html: string } | { error: string }> {
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
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
          "user-agent": userAgent,
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

    if (response.status === 404) return { error: "notfound" };

    const type = response.headers.get("content-type") ?? "";
    const raw = await response.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(raw.slice(0, MAX_BYTES));

    // Mesmo em 403/429 lemos o corpo: às vezes há og:tags úteis antes do bloqueio.
    if (!response.ok) {
      if (html && (type.includes("html") || type.includes("text"))) {
        return { url: current, html };
      }
      return { error: "blocked" };
    }
    if (!type.includes("html") && !type.includes("text")) return { error: "blocked" };
    return { url: current, html };
  }
  return { error: "blocked" };
}

/** Tenta desktop e, se a página vier bloqueada/vazia, tenta a versão mobile. */
async function fetchPublicHtml(start: URL): Promise<{ url: URL; html: string } | { error: string }> {
  const first = await fetchOnce(start, DESKTOP_UA);
  const firstBlocked = !("error" in first) && detectBlockedPage(first.html) != null;
  if (!("error" in first) && !firstBlocked) return first;

  const second = await fetchOnce(start, MOBILE_UA);
  if (!("error" in second) && detectBlockedPage(second.html) == null) return second;
  if (!("error" in first)) return first;
  return second;
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
  const expanded: unknown[] = [];
  for (const entry of results) {
    expanded.push(entry);
    const graph = (entry as Record<string, unknown>)?.["@graph"];
    if (Array.isArray(graph)) expanded.push(...graph);
  }
  return expanded;
}

/**
 * Coleta objetos JSON serializados (hydration state) sem executar JavaScript.
 * Apenas texto: __NEXT_DATA__, __INITIAL_STATE__, SIGI_STATE, RENDER_DATA etc.
 */
function collectInlineJson(html: string): unknown[] {
  const found: unknown[] = [];
  const push = (text: string | undefined) => {
    if (!text) return;
    const trimmed = text.trim().replace(/;$/, "");
    if (trimmed.length < 20 || trimmed.length > 2_000_000) return;
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
    try {
      found.push(JSON.parse(trimmed));
    } catch {
      /* ignora blocos inválidos */
    }
  };

  // <script id="__NEXT_DATA__" type="application/json">, SIGI_STATE, RENDER_DATA...
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    const attrs = script[1] ?? "";
    const body = script[2] ?? "";
    if (!body.trim()) continue;

    if (/type=["'](application\/json|application\/ld\+json)["']/i.test(attrs)) {
      push(body);
      continue;
    }

    // Atribuições típicas de estado inicial.
    const assignments = body.matchAll(
      /(?:window\.)?(?:__NEXT_DATA__|__INITIAL_STATE__|__INITIAL_DATA__|__NUXT__|SIGI_STATE|RENDER_DATA|_ROUTER_DATA|__UNIVERSAL_DATA__|__APOLLO_STATE__|INITIAL_STATE|__STATE__)\s*=\s*/g,
    );
    for (const assignment of assignments) {
      const start = (assignment.index ?? 0) + assignment[0].length;
      const slice = extractBalancedJson(body, start);
      push(slice);
    }
  }
  return found;
}

/** Lê um objeto/array JSON balanceado a partir de uma posição (sem eval). */
function extractBalancedJson(source: string, start: number): string | undefined {
  const open = source[start];
  if (open !== "{" && open !== "[") return undefined;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return undefined;
}

const PRODUCT_KEY_HINTS = [
  "productinfo",
  "productdetail",
  "productdata",
  "product_info",
  "product_detail",
  "iteminfo",
  "item_info",
  "skuinfo",
  "sku_info",
  "product",
  "item",
];

/** Percorre objetos serializados procurando o nó do produto principal. */
function findProductObjects(roots: unknown[], productId: string | null): Record<string, any>[] {
  const matches: Record<string, any>[] = [];
  const seen = new Set<unknown>();
  const queue: Array<{ node: unknown; key: string }> = roots.map((node) => ({ node, key: "" }));
  let visited = 0;

  while (queue.length > 0 && visited < 40_000) {
    const entry = queue.shift();
    if (!entry) break;
    const { node, key } = entry;
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    visited += 1;

    if (Array.isArray(node)) {
      for (const child of node.slice(0, 400)) queue.push({ node: child, key });
      continue;
    }

    const record = node as Record<string, any>;
    const keys = Object.keys(record).map((value) => value.toLowerCase());
    const hasTitle = keys.some((k) => ["title", "name", "productname", "product_name"].includes(k));
    const hasPriceish = keys.some((k) =>
      ["price", "saleprice", "sale_price", "originalprice", "original_price", "realprice", "price_info", "priceinfo", "images", "imageurls", "sku_list", "skus"].includes(k),
    );
    const idValues = ["product_id", "productid", "id", "itemid", "item_id"]
      .map((k) => record[k] ?? record[k.replace(/_/g, "")])
      .filter((value) => value != null)
      .map(String);

    const matchesId = productId ? idValues.includes(productId) : false;
    const looksLikeProduct = hasTitle && hasPriceish;
    const keyHint = PRODUCT_KEY_HINTS.some((hint) => key.toLowerCase().includes(hint));

    if (matchesId && (looksLikeProduct || keyHint)) matches.unshift(record);
    else if (looksLikeProduct && (keyHint || !productId)) matches.push(record);

    for (const [childKey, child] of Object.entries(record)) {
      if (child && typeof child === "object") queue.push({ node: child, key: childKey });
    }
  }
  return matches.slice(0, 5);
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
    const url = new URL(value.startsWith("//") ? `https:${value}` : value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// ---------- imagens ----------

const IMAGE_NOISE =
  /(sprite|logo|icon|favicon|avatar|placeholder|loading|spinner|banner|badge|pixel|tracking|1x1|blank|button|arrow|star|flag|qr[-_]?code)/i;

function looksLikeImageUrl(value: string) {
  return /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(value) || /image|img|photo|tos-|akamaized|mlstatic|susercontent/i.test(value);
}

function imageScore(value: string): number {
  const size = value.match(/(\d{3,4})\s*[x×]\s*(\d{3,4})/);
  if (size) return Number(size[1]) * Number(size[2]);
  const single = value.match(/[_-](\d{3,4})(?:w|px)?\./);
  if (single) return Number(single[1]) * Number(single[1]);
  return 0;
}

function normalizeImage(base: URL, raw: string): string | null {
  const value = decodeEntities(raw.trim());
  if (!value || value.startsWith("data:")) return null;
  if (IMAGE_NOISE.test(value)) return null;
  if (!looksLikeImageUrl(value)) return null;
  const abs = absolute(base, value);
  if (!abs) return null;
  return abs.split("#")[0] ?? abs;
}

function collectHtmlImages(html: string, base: URL): string[] {
  const out: string[] = [];
  const add = (value: string | undefined) => {
    if (!value) return;
    const normalized = normalizeImage(base, value);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  };

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    add(tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]);
    add(tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1]);
    add(tag.match(/\bdata-original=["']([^"']+)["']/i)?.[1]);
    add(tag.match(/\bdata-zoom-image=["']([^"']+)["']/i)?.[1]);
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) for (const part of srcset.split(",")) add(part.trim().split(/\s+/)[0]);
  }
  for (const match of html.matchAll(/<source\b[^>]*>/gi)) {
    const srcset = match[0].match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) for (const part of srcset.split(",")) add(part.trim().split(/\s+/)[0]);
  }
  for (const match of html.matchAll(/background-image\s*:\s*url\((['"]?)([^'")]+)\1\)/gi)) add(match[2]);
  for (const match of html.matchAll(/<link[^>]+rel=["']image_src["'][^>]*>/gi)) {
    add(match[0].match(/href=["']([^"']+)["']/i)?.[1]);
  }
  return out;
}

/** Varre objetos JSON procurando arrays de imagens do produto. */
function collectJsonImages(nodes: Record<string, any>[], base: URL): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = normalizeImage(base, value);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  };
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node.slice(0, 200)) {
        if (typeof child === "string") add(child);
        else walk(child, depth + 1);
      }
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (typeof value === "string") {
        if (/(image|img|photo|picture|thumb|cover|url_list|urllist)/.test(lower)) add(value);
      } else {
        walk(value, depth + 1);
      }
    }
  };
  for (const node of nodes) walk(node, 0);
  return out;
}

function stripHtml(value: string) {
  return decodeEntities(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- extração a partir de objetos JSON serializados ----------

function pickString(node: Record<string, any>, keys: string[]): string | null {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = value["value"] ?? value["text"] ?? value["priceStr"] ?? value["price_str"];
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return null;
}

function pickNumber(node: Record<string, any>, keys: string[]): number | null {
  for (const key of keys) {
    const value = node[key];
    const direct = toNumber(value);
    if (direct != null && direct > 0) return direct;
    if (value && typeof value === "object") {
      const nested =
        toNumber((value as Record<string, unknown>)["value"]) ??
        toNumber((value as Record<string, unknown>)["amount"]) ??
        toNumber((value as Record<string, unknown>)["price"]);
      if (nested != null && nested > 0) return nested;
    }
  }
  return null;
}

function applyJsonProduct(product: ImportedProduct, node: Record<string, any>, base: URL) {
  const priceHolder =
    (node["price_info"] as Record<string, any>) ??
    (node["priceInfo"] as Record<string, any>) ??
    (node["price"] && typeof node["price"] === "object" ? (node["price"] as Record<string, any>) : null) ??
    node;

  if (!product.title) {
    const title = pickString(node, ["title", "name", "productName", "product_name", "product_title"]);
    if (title && !detectBlockedText(title)) product.title = title;
  }
  if (product.currentPrice == null) {
    product.currentPrice = pickNumber(priceHolder, [
      "sale_price",
      "salePrice",
      "currentPrice",
      "current_price",
      "real_price",
      "realPrice",
      "min_price",
      "price",
      "priceVal",
      "price_val",
    ]);
  }
  if (product.oldPrice == null) {
    product.oldPrice = pickNumber(priceHolder, [
      "original_price",
      "originalPrice",
      "list_price",
      "listPrice",
      "market_price",
      "marketPrice",
      "origin_price",
      "strikethrough_price",
    ]);
  }
  if (product.rating == null) {
    product.rating = pickNumber(node, ["rating", "ratingValue", "product_rating", "star", "average_rating", "averageRating"]);
    if (product.rating != null && product.rating > 5) product.rating = null;
  }
  if (product.reviewCount == null) {
    product.reviewCount = pickNumber(node, ["review_count", "reviewCount", "comment_count", "commentCount", "rating_count", "ratingCount"]);
  }
  const sold = pickNumber(node, ["sold_count", "soldCount", "sale_cnt", "sales", "sold"]);
  if (sold != null) {
    if (product.soldCount == null) product.soldCount = sold;
    if (product.metadata["soldCount"] == null) product.metadata["soldCount"] = sold;
  }

  if (!product.externalId) {
    const id = pickString(node, ["product_id", "productId", "item_id", "itemId", "id", "sku"]);
    if (id) product.externalId = id;
  }
  if (!product.description) {
    const description = pickString(node, ["description", "desc", "detail", "product_description"]);
    if (description) product.description = stripHtml(description).slice(0, 4000);
  }
  if (!product.availability) {
    const stock = pickNumber(node, ["stock", "stock_num", "quantity", "available_quantity"]);
    if (stock != null) product.availability = stock > 0 ? "Disponível" : "Indisponível";
  }

  // Variantes (SKUs públicos)
  if (product.variants.length === 0) {
    const groups = node["sale_props"] ?? node["saleProps"] ?? node["variations"] ?? node["variants"] ?? node["specifications"];
    if (Array.isArray(groups)) {
      const variants: ImportedVariantOption[] = [];
      for (const group of groups.slice(0, 10)) {
        if (!group || typeof group !== "object") continue;
        const record = group as Record<string, any>;
        const groupName = pickString(record, ["name", "prop_name", "title", "label"]);
        const rawValues = record["values"] ?? record["sale_prop_values"] ?? record["options"] ?? record["prop_values"];
        const values = Array.isArray(rawValues)
          ? rawValues
              .map((value) =>
                typeof value === "string" ? value : pickString(value as Record<string, any>, ["name", "value", "text", "title"]),
              )
              .filter((value): value is string => Boolean(value))
          : [];
        if (groupName && values.length > 0) variants.push({ name: groupName, values: [...new Set(values)].slice(0, 40) });
      }
      if (variants.length > 0) product.variants = variants;
    }
  }

  // Especificações
  if (product.attributes.length === 0) {
    const specs = node["specifications"] ?? node["specs"] ?? node["attributes"] ?? node["product_attributes"];
    if (Array.isArray(specs)) {
      const attributes: ImportedAttribute[] = [];
      for (const spec of specs.slice(0, 40)) {
        if (!spec || typeof spec !== "object") continue;
        const record = spec as Record<string, any>;
        const label = pickString(record, ["name", "label", "key", "attr_name"]);
        const value = pickString(record, ["value", "value_name", "text", "attr_value"]);
        if (label && value) attributes.push({ label, value });
      }
      if (attributes.length > 0) product.attributes = attributes;
    }
  }

  const jsonImages = collectJsonImages([node], base);
  for (const image of jsonImages) if (!product.images.includes(image)) product.images.push(image);
}

// ---------- extração base (JSON-LD → JSON inline → OG → meta → HTML) ----------

function extractFromPage(platform: SourcePlatform, ctx: ImporterContext): { product: ImportedProduct; strategies: string[] } {
  const { url, html, json, inlineJson, productId } = ctx;
  const product = emptyProduct(platform, url);
  const strategies: string[] = [];

  const node = json.find(isProductNode) as Record<string, any> | undefined;

  if (node) {
    strategies.push("json_ld");
    const name = typeof node["name"] === "string" ? node["name"].trim() : null;
    if (name && !detectBlockedText(name)) product.title = name;
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

  // Estado serializado / hydration data — sempre relacionado ao productId da URL.
  const jsonNodes = findProductObjects([...inlineJson, ...json], productId);
  if (jsonNodes.length > 0) {
    strategies.push("inline_json");
    for (const candidate of jsonNodes) applyJsonProduct(product, candidate, url);
  }

  // Open Graph / meta tags como complemento
  const ogTitle = metaContent(html, ["og:title", "twitter:title", "title"]);
  if (!product.title && ogTitle && !detectBlockedText(ogTitle)) {
    product.title = ogTitle;
    strategies.push("open_graph");
  }
  if (!product.title) {
    const tag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const text = tag ? stripHtml(tag) : null;
    if (text && !detectBlockedText(text)) product.title = text;
  }
  if (!product.description) {
    const description = metaContent(html, ["og:description", "description", "twitter:description"]);
    if (description && !detectBlockedText(description)) product.description = description;
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
    if (candidates.length > 0) {
      product.currentPrice = candidates[0] ?? null;
      strategies.push("html_text");
    }
  }

  const ogImages = [...allMetaContents(html, "og:image"), ...allMetaContents(html, "og:image:secure_url")];
  for (const image of ogImages) {
    const abs = absolute(url, image);
    if (abs && !product.images.includes(abs)) product.images.push(abs);
  }
  const htmlFound = collectHtmlImages(html, url);
  for (const image of htmlFound) if (!product.images.includes(image)) product.images.push(image);

  // Deduplica, ordena por resolução aparente mantendo as primeiras (mais relevantes).
  const unique = [...new Set(product.images)];
  const head = unique.slice(0, 3);
  const tail = unique.slice(3).sort((a, b) => imageScore(b) - imageScore(a));
  product.images = [...head, ...tail].slice(0, 24);

  if (product.oldPrice && product.currentPrice && product.oldPrice > product.currentPrice) {
    product.discount = Math.round(((product.oldPrice - product.currentPrice) / product.oldPrice) * 100);
  } else if (product.oldPrice && product.currentPrice && product.oldPrice <= product.currentPrice) {
    product.oldPrice = null;
  }

  // deduplica atributos
  const seen = new Set<string>();
  product.attributes = product.attributes.filter((attribute) => {
    const key = attribute.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { product, strategies };
}

// ---------- adapters específicos (apenas refinam a extração pública) ----------

const mercadoLivreImporter: Importer = {
  platform: "mercado_livre",
  extract({ html, productId }) {
    const patch: Partial<ImportedProduct> = {};
    if (productId) patch.externalId = productId;

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
  extract({ productId }) {
    return productId ? { externalId: productId } : {};
  },
};

/**
 * TikTok Shop: a página é renderizada por JavaScript, então priorizamos o
 * estado serializado (hydration data) já coletado e o productId da URL.
 */
const tiktokImporter: Importer = {
  platform: "tiktok_shop",
  extract({ productId, inlineJson, url }) {
    const patch: Partial<ImportedProduct> = {};
    if (productId) patch.externalId = productId;

    const nodes = findProductObjects(inlineJson, productId);
    if (nodes.length === 0) return patch;

    const scratch = emptyProduct("tiktok_shop", url);
    for (const node of nodes) applyJsonProduct(scratch, node, url);

    if (scratch.title) patch.title = scratch.title;
    if (scratch.currentPrice != null) patch.currentPrice = scratch.currentPrice;
    if (scratch.oldPrice != null) patch.oldPrice = scratch.oldPrice;
    if (scratch.images.length > 0) patch.images = scratch.images;
    if (scratch.attributes.length > 0) patch.attributes = scratch.attributes;
    if (scratch.variants.length > 0) patch.variants = scratch.variants;
    if (scratch.rating != null) patch.rating = scratch.rating;
    if (scratch.reviewCount != null) patch.reviewCount = scratch.reviewCount;
    if (scratch.availability) patch.availability = scratch.availability;
    return patch;
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
  const { canonical, productId } = canonicalizeProductUrl(url, platform);

  let fetched = await fetchPublicHtml(canonical);
  if ("error" in fetched && canonical.toString() !== url.toString()) {
    fetched = await fetchPublicHtml(url);
  }

  if ("error" in fetched) {
    if (fetched.error === "timeout") {
      return blocked(
        "Não conseguimos ler automaticamente esta página (tempo esgotado).",
        ["Use a importação assistida para cadastrar os dados manualmente."],
        "timeout",
      );
    }
    if (fetched.error === "notfound") return blocked("Produto não encontrado nesta URL.", [], "not_found");
    if (fetched.error === "URL inválida.") {
      return {
        status: "failed",
        product: null,
        missingFields: [],
        notices: [],
        message: "URL inválida.",
        individualReviewsAvailable: false,
        foundCount: 0,
        blockedReason: null,
        strategyUsed: "none",
      };
    }
    return blocked(
      "Não conseguimos ler automaticamente esta página.",
      ["A loja pode estar bloqueando leituras automáticas. Use a importação assistida."],
      "blocked",
    );
  }

  return analyzeDocument({
    platform,
    html: fetched.html,
    finalUrl: fetched.url,
    canonical,
    productId,
    origin: "server",
  });
}

type DocumentInput = {
  platform: SourcePlatform;
  html: string;
  finalUrl: URL;
  canonical: URL;
  productId: string | null;
  /** "server" = HTML buscado por nós; "browser" = conteúdo colado pelo admin. */
  origin: "server" | "browser";
  /** JSON já extraído (usado pela captura do navegador quando o admin cola JSON puro). */
  extraJson?: unknown[];
};

/**
 * Pipeline única de extração: usada tanto pela leitura server-side quanto pela
 * captura feita no navegador do administrador. Nunca executa scripts — apenas
 * faz parsing de texto.
 */
export function analyzeDocument(input: DocumentInput): ImportAnalysis {
  const { platform, html, finalUrl, canonical, productId, origin } = input;

  const redirectedToAuth = /\/(login|signin|sign-in|passport|verify|captcha|challenge)(\/|$)/i.test(
    finalUrl.pathname,
  );
  const blockedReason = detectBlockedPage(html) ?? (redirectedToAuth && origin === "server" ? "login_required" : null);

  const url = finalUrl;
  const fetched = { url: finalUrl, html };
  const ctx: ImporterContext = {
    url: fetched.url,
    canonicalUrl: canonical,
    productId,
    html: fetched.html,
    json: [...collectJsonLd(fetched.html), ...(input.extraJson ?? [])],
    inlineJson: [...collectInlineJson(fetched.html), ...(input.extraJson ?? [])],
  };


  const { product: base, strategies } = extractFromPage(platform, ctx);
  let product = base;
  try {
    const patch = getImporter(platform).extract(ctx);
    product = {
      ...base,
      ...patch,
      attributes: patch.attributes?.length ? [...base.attributes, ...patch.attributes] : base.attributes,
      images: patch.images?.length ? [...new Set([...patch.images, ...base.images])].slice(0, 24) : base.images,
    };
  } catch (error) {
    console.error("[import] adapter falhou, usando extração genérica", error);
  }

  // Nunca aceitar título de página de bloqueio.
  if (product.title && detectBlockedText(product.title)) product.title = null;
  if (product.description && detectBlockedText(product.description)) product.description = null;

  if (!product.externalId && productId) product.externalId = productId;
  product.sourceUrl = canonical.toString();
  product.metadata["canonicalUrl"] = canonical.toString();
  product.metadata["requestedUrl"] = url.toString();
  product.metadata["imagesReusable"] = isAllowedSourceHost(fetched.url.hostname);
  if (productId) product.metadata["productId"] = productId;
  if (blockedReason) product.metadata["blockedReason"] = blockedReason;

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
  if (product.availability) found.push("availability");

  const strategyUsed = strategies.length > 0 ? [...new Set(strategies)].join("+") : blockedReason ? "blocked" : "none";
  product.metadata["strategyUsed"] = strategyUsed;

  const allFields = [
    "title",
    "currentPrice",
    "oldPrice",
    "images",
    "attributes",
    "rating",
    "reviewCount",
    "variants",
    "description",
    "availability",
  ];
  const missingFields = allFields.filter((field) => !found.includes(field));
  missingFields.push("individualReviews");

  if (found.length === 0) {
    return blocked(
      blockedReason
        ? "Esta página bloqueou a leitura automática."
        : "Não conseguimos ler automaticamente esta página.",
      [
        blockedReason
          ? "A loja exibiu uma verificação de segurança. Use a importação assistida."
          : "Nenhum dado público estruturado foi encontrado. Use a importação assistida.",
      ],
      blockedReason ?? "no_data",
    );
  }

  const notices = [
    "Avaliações individuais não são importadas: cadastre as suas próprias no editor.",
    "A descrição da origem serve apenas como referência factual — gere uma descrição própria.",
  ];
  if (blockedReason) {
    notices.unshift("Esta página bloqueou parte da leitura automática. Mostramos apenas os dados reais encontrados.");
  }

  return {
    status: blockedReason ? "partial" : found.length >= 4 ? "found" : "partial",
    product,
    missingFields,
    notices,
    message: blockedReason ? "Esta página bloqueou a leitura automática." : null,
    individualReviewsAvailable: false,
    foundCount: found.length,
    blockedReason: blockedReason ?? null,
    strategyUsed,
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
