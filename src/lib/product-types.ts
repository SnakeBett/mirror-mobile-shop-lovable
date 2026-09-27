export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  search_placeholder: string | null;
  current_price: number;
  old_price: number | null;
  discount_percentage: number | null;
  installment_text: string | null;
  sales_count: string | null;
  rating: number | null;
  review_count: number | null;
  five_star_count: number | null;
  shipping_fee: string | null;
  shipping_discount_text: string | null;
  shipping_promotion_text: string | null;
  customer_protection_text: string | null;
  description: string | null;
  closing_text: string | null;
  checkout_url: string | null;
  is_active: boolean;
  shipping_min_days: number;
  shipping_max_days: number;
  shipping_business_days: boolean;
  installment_note: string | null;
  custom_stats_enabled: boolean;
  sales_count_display: string | null;
  checkout_button_text: string;
  checkout_button_subtext: string | null;
  tracking_use_global: boolean;
  meta_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  ga_measurement_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductReview = {
  id: string;
  customer_name: string;
  avatar_initial: string | null;
  rating: number;
  comment: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ProductDetailRow = { id: string; label: string; value: string | null; sort_order: number };
export type ProductHighlightRow = { id: string; text: string; sort_order: number };
export type ProductPromotionRow = { id: string; text: string; sort_order: number; is_active: boolean };
export type ProductImageRow = { id: string; image_url: string; sort_order: number };

export type ProductOffer = {
  id: string;
  product_id: string;
  title: string;
  subtitle: string | null;
  offer_type: "discount" | "percentage" | "free_shipping" | "bundle" | "pix" | "coupon" | "custom";
  discount_type: "none" | "fixed" | "percentage";
  discount_value: number | null;
  coupon_code: string | null;
  button_text: string | null;
  button_action: "select" | "copy_coupon" | "apply_coupon" | "open_link" | "none";
  button_url: string | null;
  icon: "tag" | "truck" | "percent" | "gift" | "zap" | "ticket";
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
};

export type RecommendedProduct = {
  id: string;
  slug: string;
  name: string;
  current_price: number;
  old_price: number | null;
  discount_percentage: number | null;
  image: string | null;
};

/** Everything the public product page needs, with image URLs already resolved. */
export type ProductView = ProductRow & {
  images: string[];
  promotions: string[];
  details: Array<[string, string]>;
  highlights: string[];
  reviews: Array<Omit<ProductReview, "image_url"> & { image_url: string | null }>;
  page: import("./page-settings").PageSettings;
  recommendations: RecommendedProduct[];
  offers: ProductOffer[];
  quantity_offers: import("./variants").QuantityOffer[];
  attributes: import("./variants").ProductAttribute[];
  variants: import("./variants").ProductVariant[];
  /** IDs de pixel já resolvidos (global ou específicos do produto). */
  tracking: import("./tracking").TrackingIds;
  /** Configuração pública de Meta/UTMify (nunca contém tokens). */
  tracking_config: import("./tracking").PublicTrackingConfig;
  currency: string;
};


export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function calcDiscount(oldPrice: number | null, currentPrice: number | null) {
  if (!oldPrice || !currentPrice || oldPrice <= 0 || currentPrice >= oldPrice) return null;
  return Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
}

function formatShippingDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

function addDays(from: Date, days: number, businessOnly: boolean) {
  const date = new Date(from);
  let remaining = Math.max(0, Math.round(days));
  if (!businessOnly) {
    date.setUTCDate(date.getUTCDate() + remaining);
    return date;
  }
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date;
}

/** Prazo de entrega calculado a partir de hoje, usando a configuração do produto. */
export function getShippingRange(
  minDays = 3,
  maxDays = 6,
  businessDays = false,
  from: Date = new Date(),
) {
  const min = Math.min(minDays, maxDays);
  const max = Math.max(minDays, maxDays);
  return `${formatShippingDate(addDays(from, min, businessDays))} e ${formatShippingDate(addDays(from, max, businessDays))}`;
}

/** Datas de entrega (mínima e máxima) já formatadas. */
export function getShippingDates(
  minDays = 3,
  maxDays = 6,
  businessDays = false,
  from: Date = new Date(),
): [string, string] {
  const min = Math.min(minDays, maxDays);
  const max = Math.max(minDays, maxDays);
  return [
    formatShippingDate(addDays(from, min, businessDays)),
    formatShippingDate(addDays(from, max, businessDays)),
  ];
}

/** Aplica o modelo de texto da entrega, com fallback para o padrão atual. */
export function formatShippingText(
  template: string,
  minDays = 3,
  maxDays = 6,
  businessDays = false,
  from: Date = new Date(),
) {
  const [min, max] = getShippingDates(minDays, maxDays, businessDays, from);
  const model = (template ?? "").trim() || "Receba entre {min_date} e {max_date}";
  return model.replaceAll("{min_date}", min).replaceAll("{max_date}", max);
}
