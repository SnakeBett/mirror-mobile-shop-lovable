/**
 * Adapters de importação (server-only).
 *
 * Cada provider recebe a URL já validada e devolve um ImportAnalysis com o
 * modelo normalizado. Regras: só APIs oficiais/dados públicos autorizados,
 * nada de burlar login, CAPTCHA ou proteções anti-bot, e nunca inventar dados.
 */
import {
  type ImportAnalysis,
  type ImportedAttribute,
  type ImportedProduct,
  type ImportedVariantOption,
  type SourcePlatform,
} from "./import-types";

export type ImporterContext = { url: URL };

export type Importer = {
  platform: SourcePlatform;
  analyze: (ctx: ImporterContext) => Promise<ImportAnalysis>;
};

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

function failed(message: string, notices: string[] = []): ImportAnalysis {
  return {
    status: "failed",
    product: null,
    missingFields: [],
    notices,
    message,
    individualReviewsAvailable: false,
  };
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    redirect: "follow",
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

// ============ MERCADO LIVRE ============

function mercadoLivreItemId(url: URL): string | null {
  const source = `${url.pathname}${url.search}`;
  const match = source.match(/(ML[A-Z])-?(\d{6,})/i);
  if (!match) return null;
  return `${match[1].toUpperCase()}${match[2]}`;
}

const mercadoLivreImporter: Importer = {
  platform: "mercado_livre",
  async analyze({ url }) {
    const itemId = mercadoLivreItemId(url);
    if (!itemId) return failed("Produto não encontrado nesta URL do Mercado Livre.");

    const token = process.env["MERCADO_LIVRE_ACCESS_TOKEN"];
    const headers = token ? { authorization: `Bearer ${token}` } : {};

    const item = await fetchJson(`https://api.mercadolibre.com/items/${itemId}`, headers);

    if (item.status === 401 || item.status === 403) {
      return failed(
        "Esta plataforma exige uma integração autorizada. Configure as credenciais do Mercado Livre em Configurações › Integrações.",
      );
    }
    if (item.status === 404) return failed("Produto não encontrado.");
    if (!item.ok || !item.body || typeof item.body !== "object") {
      return failed("Não conseguimos acessar informações suficientes deste produto.");
    }

    const data = item.body as Record<string, any>;
    const product = emptyProduct("mercado_livre", url);
    product.externalId = String(data["id"] ?? itemId);
    product.title = typeof data["title"] === "string" ? data["title"] : null;
    product.currentPrice = typeof data["price"] === "number" ? data["price"] : null;
    product.oldPrice =
      typeof data["original_price"] === "number" && data["original_price"] > (product.currentPrice ?? 0)
        ? data["original_price"]
        : null;
    if (product.oldPrice && product.currentPrice) {
      product.discount = Math.round(((product.oldPrice - product.currentPrice) / product.oldPrice) * 100);
    }
    product.availability =
      data["status"] === "active"
        ? `Disponível${typeof data["available_quantity"] === "number" ? ` (${data["available_quantity"]} un.)` : ""}`
        : (data["status"] ?? null);

    const pictures = Array.isArray(data["pictures"]) ? data["pictures"] : [];
    product.images = pictures
      .map((picture: any) => (typeof picture?.secure_url === "string" ? picture.secure_url : null))
      .filter((value: string | null): value is string => !!value);

    const attributes = Array.isArray(data["attributes"]) ? data["attributes"] : [];
    product.attributes = attributes
      .map((attribute: any): ImportedAttribute | null => {
        const label = typeof attribute?.name === "string" ? attribute.name : null;
        const value =
          typeof attribute?.value_name === "string"
            ? attribute.value_name
            : attribute?.value_struct?.number != null
              ? `${attribute.value_struct.number} ${attribute.value_struct.unit ?? ""}`.trim()
              : null;
        return label && value ? { label, value } : null;
      })
      .filter((entry: ImportedAttribute | null): entry is ImportedAttribute => !!entry);

    const variations = Array.isArray(data["variations"]) ? data["variations"] : [];
    const variantMap = new Map<string, Set<string>>();
    for (const variation of variations) {
      for (const combination of variation?.attribute_combinations ?? []) {
        const name = typeof combination?.name === "string" ? combination.name : null;
        const value = typeof combination?.value_name === "string" ? combination.value_name : null;
        if (!name || !value) continue;
        if (!variantMap.has(name)) variantMap.set(name, new Set());
        variantMap.get(name)!.add(value);
      }
    }
    product.variants = Array.from(variantMap.entries()).map(
      ([name, values]): ImportedVariantOption => ({ name, values: Array.from(values) }),
    );

    // Nota média / quantidade agregada, quando a API expõe.
    const reviews = data["reviews"] as Record<string, any> | undefined;
    if (reviews && typeof reviews === "object") {
      product.rating = typeof reviews["rating_average"] === "number" ? reviews["rating_average"] : null;
      product.reviewCount = typeof reviews["total"] === "number" ? reviews["total"] : null;
    }

    // Descrição original: só é oferecida quando a API oficial devolve o texto.
    const description = await fetchJson(
      `https://api.mercadolibre.com/items/${itemId}/description`,
      headers,
    ).catch(() => null);
    if (description?.ok && description.body && typeof description.body === "object") {
      const text = (description.body as Record<string, any>)["plain_text"];
      if (typeof text === "string" && text.trim()) {
        product.description = text.trim();
        product.descriptionLicensed = false; // texto de terceiro: preferir descrição própria
      }
    }

    product.metadata = { permalink: data["permalink"] ?? null, condition: data["condition"] ?? null };

    const missingFields: string[] = [];
    if (!product.title) missingFields.push("title");
    if (product.currentPrice == null) missingFields.push("currentPrice");
    if (product.oldPrice == null) missingFields.push("oldPrice");
    if (product.images.length === 0) missingFields.push("images");
    if (product.rating == null) missingFields.push("rating");
    if (product.reviewCount == null) missingFields.push("reviewCount");
    if (product.variants.length === 0) missingFields.push("variants");
    missingFields.push("individualReviews");

    const notices = [
      "Avaliações individuais não disponíveis para importação.",
      "A descrição original é conteúdo de terceiro: prefira gerar uma descrição própria.",
    ];

    return {
      status: missingFields.length > 1 ? "partial" : "found",
      product,
      missingFields,
      notices,
      message: null,
      individualReviewsAvailable: false,
    };
  },
};

// ============ SHOPEE / TIKTOK SHOP ============

function authorizedIntegrationImporter(
  platform: SourcePlatform,
  label: string,
  envVar: string,
): Importer {
  return {
    platform,
    async analyze() {
      const configured = !!process.env[envVar];
      if (!configured) {
        return failed(
          `Esta plataforma exige uma integração autorizada. Conecte ${label} em Configurações › Integrações para importar produtos.`,
          ["Este dado não está disponível para importação automática."],
        );
      }
      return failed(
        `A integração ${label} está configurada, mas ainda não retornou dados deste produto. Cadastre o produto manualmente.`,
      );
    },
  };
}

// ============ GENÉRICO ============

const genericImporter: Importer = {
  platform: "unknown",
  async analyze() {
    return failed("Plataforma não integrada.", [
      "Você pode criar o produto manualmente e preencher os dados à mão.",
    ]);
  },
};

const IMPORTERS: Record<SourcePlatform, Importer> = {
  mercado_livre: mercadoLivreImporter,
  shopee: authorizedIntegrationImporter("shopee", "Shopee", "SHOPEE_API_KEY"),
  tiktok_shop: authorizedIntegrationImporter("tiktok_shop", "TikTok Shop", "TIKTOK_SHOP_API_KEY"),
  unknown: genericImporter,
};

export function getImporter(platform: SourcePlatform): Importer {
  return IMPORTERS[platform] ?? genericImporter;
}

export function integrationStatus() {
  return {
    mercado_livre: process.env["MERCADO_LIVRE_ACCESS_TOKEN"] ? "connected" : "not_configured",
    shopee: process.env["SHOPEE_API_KEY"] ? "connected" : "not_configured",
    tiktok_shop: process.env["TIKTOK_SHOP_API_KEY"] ? "connected" : "not_configured",
  } as const;
}
