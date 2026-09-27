/**
 * Kits por quantidade + variações (atributos livres e SKUs).
 * Funções puras compartilhadas entre admin e página pública.
 */
import { calcDiscount } from "./product-types";

export type QuantityOffer = {
  id: string;
  product_id: string;
  name: string;
  quantity: number;
  total_price: number;
  old_price: number | null;
  manual_discount: number | null;
  helper_text: string | null;
  badge: string | null;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
};

export type AttributeDisplay = "color" | "buttons" | "list";

export type AttributeValue = {
  id: string;
  attribute_id: string;
  product_id: string;
  name: string;
  color_hex: string | null;
  /** Caminho no storage (ou URL resolvida na página pública). */
  image_url: string | null;
  sort_order: number;
};

export type ProductAttribute = {
  id: string;
  product_id: string;
  name: string;
  display_type: AttributeDisplay;
  sort_order: number;
  values: AttributeValue[];
};

export type ProductVariant = {
  id: string;
  product_id: string;
  /** { attribute_id: value_id } */
  option_values: Record<string, string>;
  sku: string | null;
  price: number | null;
  old_price: number | null;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

export type VariantSettings = {
  quantity_offers_enabled: boolean;
  variants_enabled: boolean;
  track_stock: boolean;
  same_variant_default: boolean;
};

export const DEFAULT_VARIANT_SETTINGS: VariantSettings = {
  quantity_offers_enabled: false,
  variants_enabled: false,
  track_stock: false,
  same_variant_default: true,
};

/** Seleção de uma unidade: { attribute_id: value_id }. */
export type UnitSelection = Record<string, string>;

export function kitSavings(kit: Pick<QuantityOffer, "quantity" | "total_price">, basePrice: number) {
  const full = basePrice * kit.quantity;
  return Math.max(0, Math.round((full - Number(kit.total_price)) * 100) / 100);
}

export function kitDiscount(kit: QuantityOffer, basePrice: number) {
  if (kit.manual_discount != null && kit.manual_discount > 0) return Math.round(kit.manual_discount);
  const reference = kit.old_price ?? basePrice * kit.quantity;
  return calcDiscount(reference, Number(kit.total_price));
}

export function findVariant(variants: ProductVariant[], attributes: ProductAttribute[], unit: UnitSelection) {
  if (attributes.length === 0) return null;
  return (
    variants.find((variant) => attributes.every((attr) => variant.option_values[attr.id] === unit[attr.id])) ?? null
  );
}

export function isVariantAvailable(variant: ProductVariant | null, settings: VariantSettings, hasRows: boolean) {
  // Sem combinações cadastradas: tudo disponível (preço base).
  if (!hasRows) return true;
  if (!variant || !variant.is_active) return false;
  if (settings.track_stock && variant.stock <= 0) return false;
  return true;
}

/** O valor pode ser escolhido considerando as demais escolhas já feitas na unidade? */
export function isValueSelectable(
  attributeId: string,
  valueId: string,
  unit: UnitSelection,
  attributes: ProductAttribute[],
  variants: ProductVariant[],
  settings: VariantSettings,
) {
  if (variants.length === 0) return true;
  const partial = { ...unit, [attributeId]: valueId };
  return variants.some((variant) => {
    if (!variant.is_active) return false;
    if (settings.track_stock && variant.stock <= 0) return false;
    return attributes.every((attr) => !partial[attr.id] || variant.option_values[attr.id] === partial[attr.id]);
  });
}

export function unitLabel(unit: UnitSelection, attributes: ProductAttribute[]) {
  return attributes
    .map((attr) => attr.values.find((value) => value.id === unit[attr.id])?.name)
    .filter(Boolean)
    .join(" / ");
}

export type PricingResult = {
  quantity: number;
  total: number;
  old: number | null;
  discount: number | null;
  /** Seleção altera o preço padrão do produto? */
  overridden: boolean;
};

export function computePricing(input: {
  basePrice: number;
  baseOld: number | null;
  baseDiscount: number | null;
  kit: QuantityOffer | null;
  units: UnitSelection[];
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  variantsOn: boolean;
}): PricingResult {
  const { basePrice, kit, attributes, variants, variantsOn } = input;
  const quantity = kit ? kit.quantity : 1;
  const unitVariants = variantsOn
    ? Array.from({ length: quantity }, (_, index) => findVariant(variants, attributes, input.units[index] ?? {}))
    : [];
  const extra = unitVariants.reduce(
    (sum, variant) => sum + (variant?.price != null ? Number(variant.price) - basePrice : 0),
    0,
  );

  if (kit) {
    const total = Math.round((Number(kit.total_price) + extra) * 100) / 100;
    const reference = kit.old_price != null ? Number(kit.old_price) + extra : basePrice * quantity + extra;
    const old = reference > total ? reference : null;
    const discount =
      kit.manual_discount != null && kit.manual_discount > 0 ? Math.round(kit.manual_discount) : calcDiscount(old, total);
    return { quantity, total, old, discount, overridden: true };
  }

  const variant = unitVariants[0] ?? null;
  if (variant && (variant.price != null || variant.old_price != null)) {
    const total = variant.price != null ? Number(variant.price) : basePrice;
    const oldCandidate = variant.old_price != null ? Number(variant.old_price) : input.baseOld;
    const old = oldCandidate != null && oldCandidate > total ? oldCandidate : null;
    return { quantity: 1, total, old, discount: calcDiscount(old, total), overridden: true };
  }

  return { quantity: 1, total: basePrice, old: input.baseOld, discount: input.baseDiscount, overridden: false };
}

/** Primeira pendência de escolha, em texto claro para o cliente. */
export function missingSelection(
  units: UnitSelection[],
  quantity: number,
  sameForAll: boolean,
  attributes: ProductAttribute[],
  variants: ProductVariant[],
  settings: VariantSettings,
): string | null {
  const count = sameForAll ? 1 : quantity;
  for (let index = 0; index < count; index += 1) {
    const unit = units[index] ?? {};
    const suffix = count > 1 ? ` da unidade ${index + 1}` : "";
    for (const attr of attributes) {
      if (attr.values.length === 0) continue;
      if (!unit[attr.id]) return `Escolha a opção de ${attr.name.trim().toLowerCase() || "variação"}${suffix}.`;
    }
    const variant = findVariant(variants, attributes, unit);
    if (!isVariantAvailable(variant, settings, variants.length > 0)) {
      return `A combinação escolhida${suffix} está indisponível. Escolha outra opção.`;
    }
  }
  return null;
}

/** Contexto preparado para checkout/pedido (não é enviado à URL externa). */
export type CheckoutContext = {
  product_id: string;
  product_name: string;
  offer_id: string | null;
  offer_name: string | null;
  quantity: number;
  selected_variants: Array<{ unit: number; variant_id: string | null; sku: string | null; label: string }>;
  unit_price: number;
  total: number;
  currency: string;
  created_at: string;
};

export const CHECKOUT_CONTEXT_KEY = "vt_checkout_context";

export function saveCheckoutContext(context: CheckoutContext) {
  try {
    window.sessionStorage.setItem(CHECKOUT_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    /* storage bloqueado */
  }
}

/** Todas as combinações possíveis dos atributos (produto cartesiano). */
export function generateCombinations(attributes: ProductAttribute[]): UnitSelection[] {
  const usable = attributes.filter((attr) => attr.values.length > 0);
  if (usable.length === 0) return [];
  return usable.reduce<UnitSelection[]>(
    (acc, attr) => acc.flatMap((combo) => attr.values.map((value) => ({ ...combo, [attr.id]: value.id }))),
    [{}],
  );
}

export function sameCombination(a: Record<string, string>, b: Record<string, string>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}
