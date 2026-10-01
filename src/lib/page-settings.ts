import { DEFAULT_VARIANT_SETTINGS, type VariantSettings } from "./variants";
/**
 * Configurações de apresentação da página pública, por produto.
 *
 * Regra crítica: TODOS os defaults reproduzem exatamente a página pública
 * atual. Um produto sem linha em `product_page_settings` (ou com JSON vazio,
 * parcial ou inválido) continua renderizando igual à versão original.
 */

export type SectionKey =
  | "gallery"
  | "offer"
  | "info"
  | "shipping"
  | "protection"
  | "offers"
  | "reviews"
  | "details"
  | "description"
  | "recommendations";

export const SECTION_ORDER_LABELS: Array<[SectionKey, string]> = [
  ["gallery", "Galeria"],
  ["offer", "Oferta"],
  ["info", "Informações do produto"],
  ["shipping", "Entrega"],
  ["protection", "Proteção"],
  ["offers", "Ofertas"],
  ["reviews", "Avaliações"],
  ["details", "Detalhes"],
  ["description", "Descrição"],
  ["recommendations", "Recomendações"],
];

export const DEFAULT_SECTION_ORDER: SectionKey[] = SECTION_ORDER_LABELS.map(([key]) => key);

export type SectionVisibility = {
  gallery: boolean;
  price: boolean;
  promotions: boolean;
  rating: boolean;
  sales: boolean;
  shipping: boolean;
  protection: boolean;
  offers: boolean;
  reviews: boolean;
  details: boolean;
  description: boolean;
  highlights: boolean;
  recommendations: boolean;
};

export const SECTION_VISIBILITY_LABELS: Array<[keyof SectionVisibility, string]> = [
  ["gallery", "Galeria de imagens"],
  ["price", "Preço"],
  ["promotions", "Promoções"],
  ["rating", "Informações de avaliação"],
  ["sales", "Quantidade vendida"],
  ["shipping", "Entrega"],
  ["protection", "Proteção ao cliente"],
  ["offers", "Ofertas e benefícios"],
  ["reviews", "Avaliações"],
  ["details", "Detalhes do produto"],
  ["description", "Descrição"],
  ["highlights", "Diferenciais"],
  ["recommendations", "Recomendações"],
];

export type FieldVisibility = {
  old_price: boolean;
  discount: boolean;
  installment: boolean;
  sales_counter: boolean;
  rating_value: boolean;
  review_count: boolean;
  review_images: boolean;
  five_star_count: boolean;
  shipping_fee: boolean;
  shipping_promotion: boolean;
  protection: boolean;
};

export const FIELD_VISIBILITY_LABELS: Array<[keyof FieldVisibility, string]> = [
  ["old_price", "Mostrar preço antigo"],
  ["discount", "Mostrar percentual de desconto"],
  ["installment", "Mostrar parcelamento"],
  ["sales_counter", "Mostrar contador de vendidos"],
  ["rating_value", "Mostrar nota do produto"],
  ["review_count", "Mostrar quantidade de avaliações"],
  ["review_images", "Mostrar imagens nas avaliações"],
  ["five_star_count", "Mostrar quantidade de avaliações 5 estrelas"],
  ["shipping_fee", "Mostrar taxa de envio"],
  ["shipping_promotion", "Mostrar promoção de frete"],
  ["protection", "Mostrar proteção ao cliente"],
];

export type TabKey = "overview" | "reviews" | "description" | "recommendations";

export type TabSettings = {
  overview: boolean;
  reviews: boolean;
  description: boolean;
  recommendations: boolean;
  overview_label: string;
  reviews_label: string;
  description_label: string;
  recommendations_label: string;
};

export const TAB_DEFAULT_LABELS: Record<TabKey, string> = {
  overview: "Visão geral",
  reviews: "Avaliações",
  description: "Descrição",
  recommendations: "Recomendações",
};

export type TextSettings = {
  reviews_title: string;
  see_more: string;
  about_title: string;
  details_title: string;
  description_title: string;
  highlights_title: string;
};

export const TEXT_DEFAULTS: TextSettings = {
  reviews_title: "Avaliações dos clientes",
  see_more: "Ver mais",
  about_title: "Sobre este produto",
  details_title: "Detalhes",
  description_title: "Descrição",
  highlights_title: "Diferenciais",
};

export const TEXT_LABELS: Array<[keyof TextSettings, string]> = [
  ["reviews_title", "Título da seção de avaliações"],
  ["see_more", 'Texto "Ver mais"'],
  ["about_title", 'Título "Sobre este produto"'],
  ["details_title", 'Título "Detalhes"'],
  ["description_title", 'Título "Descrição"'],
  ["highlights_title", 'Título "Diferenciais"'],
];

export type HeaderSettings = {
  show_back: boolean;
  show_search: boolean;
  show_share: boolean;
  show_cart: boolean;
  show_menu: boolean;
  search_placeholder: string;
  search_behavior: "visual" | "products";
};

export const HEADER_TOGGLE_LABELS: Array<[keyof HeaderSettings, string]> = [
  ["show_back", "Mostrar botão voltar"],
  ["show_search", "Mostrar busca"],
  ["show_share", "Mostrar compartilhar"],
  ["show_cart", "Mostrar carrinho superior"],
  ["show_menu", "Mostrar menu de três pontos"],
];

export type BottomBarSettings = {
  show_store: boolean;
  show_chat: boolean;
  show_cart: boolean;
  show_buy: boolean;
  store_label: string;
  chat_label: string;
  buy_label: string;
  buy_subtext: string;
  store_url: string;
  chat_url: string;
  cart_url: string;
  buy_url: string;
  use_main_checkout: boolean;
  buy_target: "same" | "new";
  chat_type: "none" | "whatsapp" | "url";
  whatsapp_number: string;
  whatsapp_message: string;
};

export type ReviewSettings = {
  /** 0 = todas */
  initial_count: number;
  show_see_more: boolean;
};

export type GallerySettings = {
  indicator: "counter" | "dots" | "none";
  show_thumbnails: boolean;
  allow_swipe: boolean;
  allow_zoom: boolean;
};

export type PromotionSettings = { layout: "scroll" | "wrap" };

export type OfferBannerSettings = {
  enabled: boolean;
  offer_type: "flash" | "special" | "promotion" | "last_units" | "custom";
  custom_text: string;
  icon: string;
  current_price_source: "product" | "custom";
  current_price: number;
  old_price_source: "product" | "custom";
  old_price: number;
  discount_mode: "automatic" | "manual";
  manual_discount: number;
  show_from: boolean;
  gradient_start: string;
  gradient_end: string;
};

export type OffersSettings = { title: string };

export type ShippingSettings = { template: string };

export const SHIPPING_TEMPLATE_DEFAULT = "Receba entre {min_date} e {max_date}";

export type ProtectionSettings = {
  title: string;
  description: string;
  url: string;
  benefit_1: string;
  benefit_2: string;
  benefit_3: string;
  benefit_4: string;
};

export type ColorSettings = {
  primary: string;
  secondary: string;
  buy: string;
  price: string;
};

export type RecommendationMode = "manual" | "auto" | "manual_auto";
export type RecommendationCriteria = "best_sellers" | "recent" | "random";

export type RecommendationSettings = {
  /** Vazio = usa "Compre também". */
  title: string;
  mode: RecommendationMode;
  auto_criteria: RecommendationCriteria;
  /** 2 a 6 itens. */
  limit: number;
};

export const RECOMMENDATION_TITLE_DEFAULT = "Compre também";

export type PageSettings = {
  section_visibility: SectionVisibility;
  section_order: SectionKey[];
  field_visibility: FieldVisibility;
  tab_settings: TabSettings;
  text_settings: TextSettings;
  header_settings: HeaderSettings;
  bottom_bar_settings: BottomBarSettings;
  review_settings: ReviewSettings;
  gallery_settings: GallerySettings;
  promotion_settings: PromotionSettings;
  offer_banner_settings: OfferBannerSettings;
  offers_settings: OffersSettings;
  shipping_settings: ShippingSettings;
  protection_settings: ProtectionSettings;
  color_settings: ColorSettings;
  recommendation_settings: RecommendationSettings;
  variant_settings: VariantSettings;
};


export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  section_visibility: {
    gallery: true,
    price: true,
    promotions: true,
    rating: true,
    sales: true,
    shipping: true,
    protection: true,
    offers: true,
    reviews: true,
    details: true,
    description: true,
    highlights: true,
    recommendations: true,
  },
  section_order: DEFAULT_SECTION_ORDER,
  field_visibility: {
    old_price: true,
    discount: true,
    installment: true,
    sales_counter: true,
    rating_value: true,
    review_count: true,
    review_images: true,
    five_star_count: true,
    shipping_fee: true,
    shipping_promotion: true,
    protection: true,
  },
  tab_settings: {
    overview: true,
    reviews: true,
    description: true,
    recommendations: true,
    overview_label: "",
    reviews_label: "",
    description_label: "",
    recommendations_label: "",
  },
  text_settings: { reviews_title: "", see_more: "", about_title: "", details_title: "", description_title: "", highlights_title: "" },
  header_settings: {
    show_back: true,
    show_search: true,
    show_share: true,
    show_cart: true,
    show_menu: true,
    search_placeholder: "",
    search_behavior: "visual",
  },
  bottom_bar_settings: {
    show_store: true,
    show_chat: true,
    show_cart: true,
    show_buy: true,
    store_label: "Loja",
    chat_label: "Chat",
    buy_label: "",
    buy_subtext: "",
    store_url: "",
    chat_url: "",
    cart_url: "",
    buy_url: "",
    use_main_checkout: true,
    buy_target: "same",
    chat_type: "none",
    whatsapp_number: "",
    whatsapp_message: "Olá, gostaria de saber mais sobre {product.name}",
  },
  review_settings: { initial_count: 0, show_see_more: true },
  recommendation_settings: { title: "", mode: "auto", auto_criteria: "best_sellers", limit: 6 },

  gallery_settings: { indicator: "counter", show_thumbnails: true, allow_swipe: true, allow_zoom: false },
  promotion_settings: { layout: "scroll" },
  offer_banner_settings: {
    enabled: false,
    offer_type: "flash",
    custom_text: "",
    icon: "⚡",
    current_price_source: "product",
    current_price: 0,
    old_price_source: "product",
    old_price: 0,
    discount_mode: "automatic",
    manual_discount: 0,
    show_from: false,
    gradient_start: "#ff7a18",
    gradient_end: "#ff4d22",
  },
  offers_settings: { title: "" },
  shipping_settings: { template: SHIPPING_TEMPLATE_DEFAULT },
  protection_settings: {
    title: "Proteção do cliente",
    description: "",
    url: "",
    benefit_1: "Devolução gratuita",
    benefit_2: "Garantia de pontualidade",
    benefit_3: "Pagamento seguro",
    benefit_4: "Reembolso se algo der errado",
  },
  color_settings: { primary: "", secondary: "", buy: "", price: "" },
  variant_settings: { ...DEFAULT_VARIANT_SETTINGS },
};

type Raw = Record<string, unknown> | null | undefined;

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Mescla cada grupo com o default, ignorando chaves desconhecidas/valores inválidos. */
function mergeGroup<T extends Record<string, unknown>>(defaults: T, raw: unknown): T {
  const source = obj(raw);
  const next = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const incoming = source[key as string];
    if (incoming === undefined || incoming === null) continue;
    const expected = typeof defaults[key];
    if (typeof incoming === expected) next[key] = incoming as T[keyof T];
  }
  return next;
}

function normalizeOrder(raw: unknown): SectionKey[] {
  const list = Array.isArray(raw) ? raw.filter((item): item is SectionKey => DEFAULT_SECTION_ORDER.includes(item as SectionKey)) : [];
  const unique = Array.from(new Set(list));
  for (const key of DEFAULT_SECTION_ORDER) if (!unique.includes(key)) unique.push(key);
  return unique;
}

/** Constrói configurações válidas a partir de uma linha do banco (ou de nada). */
export function resolvePageSettings(row: Raw): PageSettings {
  const source = obj(row);
  const enums = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

  const header = mergeGroup(DEFAULT_PAGE_SETTINGS.header_settings, source["header_settings"]);
  const bottom = mergeGroup(DEFAULT_PAGE_SETTINGS.bottom_bar_settings, source["bottom_bar_settings"]);
  const gallery = mergeGroup(DEFAULT_PAGE_SETTINGS.gallery_settings, source["gallery_settings"]);
  const reviews = mergeGroup(DEFAULT_PAGE_SETTINGS.review_settings, source["review_settings"]);
  const recommendation = mergeGroup(
    DEFAULT_PAGE_SETTINGS.recommendation_settings,
    source["recommendation_settings"],
  );
  const offerBanner = mergeGroup(DEFAULT_PAGE_SETTINGS.offer_banner_settings, source["offer_banner_settings"]);

  return {
    recommendation_settings: {
      ...recommendation,
      mode: enums(recommendation.mode, ["manual", "auto", "manual_auto"] as const, "manual_auto"),
      auto_criteria: enums(
        recommendation.auto_criteria,
        ["best_sellers", "recent", "random"] as const,
        "best_sellers",
      ),
      limit: Math.min(12, Math.max(1, Math.round(Number(recommendation.limit)) || 6)),
    },

    section_visibility: mergeGroup(DEFAULT_PAGE_SETTINGS.section_visibility, source["section_visibility"]),
    section_order: normalizeOrder(source["section_order"]),
    field_visibility: mergeGroup(DEFAULT_PAGE_SETTINGS.field_visibility, source["field_visibility"]),
    tab_settings: mergeGroup(DEFAULT_PAGE_SETTINGS.tab_settings, source["tab_settings"]),
    text_settings: mergeGroup(DEFAULT_PAGE_SETTINGS.text_settings, source["text_settings"]),
    header_settings: {
      ...header,
      search_behavior: enums(header.search_behavior, ["visual", "products"] as const, "visual"),
    },
    bottom_bar_settings: {
      ...bottom,
      buy_target: enums(bottom.buy_target, ["same", "new"] as const, "same"),
      chat_type: enums(bottom.chat_type, ["none", "whatsapp", "url"] as const, "none"),
    },
    review_settings: {
      ...reviews,
      initial_count: Number.isFinite(reviews.initial_count) ? Math.max(0, Math.floor(Number(reviews.initial_count))) : 0,
    },
    gallery_settings: {
      ...gallery,
      indicator: enums(gallery.indicator, ["counter", "dots", "none"] as const, "counter"),
    },
    promotion_settings: {
      layout: enums(obj(source["promotion_settings"])["layout"], ["scroll", "wrap"] as const, "scroll"),
    },
    offer_banner_settings: {
      ...offerBanner,
      offer_type: enums(offerBanner.offer_type, ["flash", "special", "promotion", "last_units", "custom"] as const, "flash"),
      current_price_source: enums(offerBanner.current_price_source, ["product", "custom"] as const, "product"),
      old_price_source: enums(offerBanner.old_price_source, ["product", "custom"] as const, "product"),
      discount_mode: enums(offerBanner.discount_mode, ["automatic", "manual"] as const, "automatic"),
      current_price: Math.max(0, Number(offerBanner.current_price) || 0),
      old_price: Math.max(0, Number(offerBanner.old_price) || 0),
      manual_discount: Math.min(99, Math.max(0, Math.round(Number(offerBanner.manual_discount) || 0))),
    },
    offers_settings: mergeGroup(DEFAULT_PAGE_SETTINGS.offers_settings, source["offers_settings"]),
    shipping_settings: mergeGroup(DEFAULT_PAGE_SETTINGS.shipping_settings, source["shipping_settings"]),
    protection_settings: mergeGroup(DEFAULT_PAGE_SETTINGS.protection_settings, source["protection_settings"]),
    color_settings: mergeGroup(DEFAULT_PAGE_SETTINGS.color_settings, source["color_settings"]),
    variant_settings: mergeGroup(DEFAULT_PAGE_SETTINGS.variant_settings, source["variant_settings"]),
  };
}

/** Texto com fallback para o padrão quando o campo está vazio. */
export function text(value: string | null | undefined, fallback: string) {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

/** Monta o link de chat conforme o tipo configurado. */
export function resolveChatUrl(bar: BottomBarSettings, productName: string) {
  if (bar.chat_type === "whatsapp") {
    const digits = (bar.whatsapp_number ?? "").replace(/\D/g, "");
    if (!digits) return "";
    const message = (bar.whatsapp_message ?? "").replaceAll("{product.name}", productName).trim();
    const query = message ? `?text=${encodeURIComponent(message)}` : "";
    return `https://wa.me/${digits}${query}`;
  }
  if (bar.chat_type === "url") return (bar.chat_url ?? "").trim();
  return "";
}
