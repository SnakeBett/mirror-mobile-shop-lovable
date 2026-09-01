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
  checkout_button_text: string;
  checkout_button_subtext: string | null;
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

/** Everything the public product page needs, with image URLs already resolved. */
export type ProductView = ProductRow & {
  images: string[];
  promotions: string[];
  details: Array<[string, string]>;
  highlights: string[];
  reviews: Array<Omit<ProductReview, "image_url"> & { image_url: string | null }>;
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
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" })
    .format(date)
    .replace(".", "");
}

/** Prazo de entrega automático: hoje + 3 dias até hoje + 6 dias. */
export function getShippingRange(from: Date = new Date()) {
  const start = new Date(from);
  const end = new Date(from);
  start.setDate(start.getDate() + 3);
  end.setDate(end.getDate() + 6);
  return `${formatShippingDate(start)} e ${formatShippingDate(end)}`;
}
