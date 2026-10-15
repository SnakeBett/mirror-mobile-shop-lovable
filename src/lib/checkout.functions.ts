import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { parseShippingFee, isValidCpf, onlyDigits } from "./checkout-settings";
import { DEFAULT_VARIANT_SETTINGS, computePricing, missingSelection, type ProductAttribute, type ProductVariant, type QuantityOffer, type VariantSettings } from "./variants";

const unitSchema = z.record(z.string().uuid(), z.string().uuid());

const quoteSchema = z.object({
  slug: z.string().min(1).max(200),
  kit_id: z.string().uuid().nullable(),
  units: z.array(unitSchema).max(50),
  same_for_all: z.boolean(),
  coupon_code: z.string().trim().max(40).nullable(),
  buyer_cpf: z.string().max(20).nullable().optional(),
});

export type CheckoutQuote = {
  product_id: string;
  quantity: number;
  subtotal: number;
  product_discount: number;
  shipping: number | null;
  shipping_free: boolean;
  coupon: { code: string; discount: number } | null;
  coupon_error: string | null;
  total: number;
  selection_error: string | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

type QuoteInput = z.infer<typeof quoteSchema>;

async function computeQuote(input: QuoteInput) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: product } = await db.from("products").select("*").eq("slug", input.slug).eq("is_active", true).maybeSingle();
  if (!product) throw new Error("Produto indisponível.");
  const [settingsRes, kitsRes, attrsRes, valuesRes, variantsRes] = await Promise.all([
    db.from("product_page_settings").select("variant_settings").eq("product_id", product.id).maybeSingle(),
    db.from("product_quantity_offers").select("*").eq("product_id", product.id).eq("is_active", true),
    db.from("product_attributes").select("*").eq("product_id", product.id),
    db.from("product_attribute_values").select("*").eq("product_id", product.id),
    db.from("product_variants").select("*").eq("product_id", product.id),
  ]);
  const cfg: VariantSettings = { ...DEFAULT_VARIANT_SETTINGS, ...((settingsRes.data?.variant_settings as object) ?? {}) };
  const kits = cfg.quantity_offers_enabled ? ((kitsRes.data ?? []) as unknown as QuantityOffer[]) : [];
  const kit = input.kit_id ? (kits.find((k) => k.id === input.kit_id) ?? null) : null;
  if (input.kit_id && !kit) throw new Error("A oferta escolhida não está mais disponível.");
  const attributes: ProductAttribute[] = cfg.variants_enabled
    ? ((attrsRes.data ?? []) as unknown as ProductAttribute[])
        .map((a) => ({ ...a, values: ((valuesRes.data ?? []) as unknown as ProductAttribute["values"]).filter((v) => v.attribute_id === a.id) }))
        .filter((a) => a.values.length > 0)
    : [];
  const variants = cfg.variants_enabled ? ((variantsRes.data ?? []) as unknown as ProductVariant[]) : [];
  const quantity = kit?.quantity ?? 1;
  const same = input.same_for_all || quantity === 1;
  const units = Array.from({ length: quantity }, (_, i) => (same ? input.units[0] : input.units[i]) ?? {});
  const variantsOn = attributes.length > 0;
  const selection_error = variantsOn ? missingSelection(input.units, quantity, same, attributes, variants, cfg) : null;
  const pricing = computePricing({
    basePrice: Number(product.current_price),
    baseOld: product.old_price == null ? null : Number(product.old_price),
    baseDiscount: product.discount_percentage == null ? null : Number(product.discount_percentage),
    kit: kit ? { ...kit, total_price: Number(kit.total_price), old_price: kit.old_price == null ? null : Number(kit.old_price) } : null,
    units,
    attributes,
    variants: variants.map((v) => ({ ...v, price: v.price == null ? null : Number(v.price), old_price: v.old_price == null ? null : Number(v.old_price) })),
    variantsOn,
  });
  const itemsTotal = round(pricing.total);
  const subtotal = round(pricing.old && pricing.old > itemsTotal ? pricing.old : itemsTotal);
  const ship = parseShippingFee(product.shipping_fee);

  let coupon: CheckoutQuote["coupon"] = null;
  let coupon_error: string | null = null;
  let coupon_id: string | null = null;
  if (input.coupon_code) {
    const code = input.coupon_code.toUpperCase();
    const { data: c } = await db.from("coupons").select("*").eq("code", code).maybeSingle();
    const now = Date.now();
    if (!c || !c.is_active) coupon_error = "Cupom inválido.";
    else if (c.starts_at && new Date(c.starts_at).getTime() > now) coupon_error = "Este cupom ainda não está válido.";
    else if (c.ends_at && new Date(c.ends_at).getTime() < now) coupon_error = "Este cupom expirou.";
    else if (c.max_uses != null && c.uses_count >= c.max_uses) coupon_error = "Este cupom atingiu o limite de usos.";
    else if (c.product_ids.length && !c.product_ids.includes(product.id)) coupon_error = "Este cupom não vale para este produto.";
    else if (c.store_ids.length && (!product.store_id || !c.store_ids.includes(product.store_id))) coupon_error = "Este cupom não vale para esta loja.";
    else if (c.min_order_value != null && itemsTotal < Number(c.min_order_value))
      coupon_error = `Compra mínima de ${Number(c.min_order_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para este cupom.`;
    else {
      if (c.max_uses_per_buyer != null && input.buyer_cpf && isValidCpf(input.buyer_cpf)) {
        const { count } = await db.from("coupon_redemptions").select("id", { count: "exact", head: true }).eq("coupon_id", c.id).eq("buyer_cpf", onlyDigits(input.buyer_cpf));
        if ((count ?? 0) >= c.max_uses_per_buyer) coupon_error = "Você já usou este cupom o número máximo de vezes.";
      }
      if (!coupon_error) {
        const raw = c.discount_type === "percentage" ? (itemsTotal * Number(c.discount_value)) / 100 : Number(c.discount_value);
        const discount = round(Math.min(itemsTotal, Math.max(0, raw)));
        coupon = { code, discount };
        coupon_id = c.id;
      }
    }
  }

  const total = round(Math.max(0, itemsTotal - (coupon?.discount ?? 0) + (ship?.amount ?? 0)));
  const quote: CheckoutQuote = {
    product_id: product.id,
    quantity,
    subtotal,
    product_discount: round(subtotal - itemsTotal),
    shipping: ship ? ship.amount : null,
    shipping_free: ship?.free ?? false,
    coupon,
    coupon_error,
    total,
    selection_error,
  };
  return { quote, product, coupon_id, kit, units, attributes };
}

export const getCheckoutQuote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => quoteSchema.parse(data))
  .handler(async ({ data }) => (await computeQuote(data)).quote);

const orderSchema = quoteSchema.extend({
  idempotency_key: z.string().min(16).max(80),
  buyer: z.object({
    name: z.string().trim().min(3).max(120),
    email: z.string().trim().email().max(160),
    cpf: z.string().refine(isValidCpf, "CPF inválido"),
    phone: z.string().refine((v) => onlyDigits(v).length >= 10 && onlyDigits(v).length <= 11, "WhatsApp inválido"),
  }),
  address: z.object({
    cep: z.string().refine((v) => onlyDigits(v).length === 8, "CEP inválido"),
    street: z.string().trim().min(2).max(160),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(80),
    district: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().length(2),
  }),
  tracking: z.record(z.string(), z.string().max(400).nullable()).optional(),
});

export type CreateOrderResult =
  | { ok: true; order_id: string; order_number: string; total: number; gateway_status: "pending_integration" | "no_gateway" }
  | { ok: false; error: string };

export const createPendingOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => orderSchema.parse(data))
  .handler(async ({ data }): Promise<CreateOrderResult> => {
    const { quote, product, coupon_id, kit, units, attributes } = await computeQuote({ ...data, buyer_cpf: data.buyer.cpf });
    if (quote.selection_error) return { ok: false, error: quote.selection_error };
    if (data.coupon_code && quote.coupon_error) return { ok: false, error: quote.coupon_error };
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    // Gateway: o do produto, senão o padrão ativo. Fica gravado no pedido.
    let gateway: { id: string; provider: string } | null = null;
    if (product.gateway_id) {
      const { data: g } = await db.from("payment_gateways").select("id, provider").eq("id", product.gateway_id).maybeSingle();
      gateway = g;
    }
    if (!gateway) {
      const { data: g } = await db.from("payment_gateways").select("id, provider").eq("is_default", true).maybeSingle();
      gateway = g;
    }

    const t = data.tracking ?? {};
    const labels = attributes.length
      ? units.map((u, i) => `${i + 1}: ${attributes.map((a) => a.values.find((v) => v.id === u[a.id])?.name).filter(Boolean).join(" / ")}`)
      : [];
    const cpf = onlyDigits(data.buyer.cpf);
    const { data: orderId, error } = await db.rpc("checkout_create_order", {
      _order: {
        idempotency_key: data.idempotency_key,
        product_id: product.id,
        amount: quote.total,
        subtotal: quote.subtotal,
        shipping_amount: quote.shipping ?? 0,
        customer_name: data.buyer.name,
        customer_email: data.buyer.email.toLowerCase(),
        customer_phone: onlyDigits(data.buyer.phone),
        gateway_id: gateway?.id ?? "",
        shipping_address: { ...data.address, cep: onlyDigits(data.address.cep), state: data.address.state.toUpperCase() },
        metadata: { kit_id: kit?.id ?? null, kit_name: kit?.name ?? null, quantity: quote.quantity, units, variant_labels: labels, product_discount: quote.product_discount, utm_id: t["utm_id"] ?? null, fbclid: t["fbclid"] ?? null },
        visitor_id: t["visitor_id"] ?? null,
        session_id: t["session_id"] ?? null,
        utm_source: t["utm_source"] ?? null,
        utm_medium: t["utm_medium"] ?? null,
        utm_campaign: t["utm_campaign"] ?? null,
        utm_content: t["utm_content"] ?? null,
        utm_term: t["utm_term"] ?? null,
        fbp: t["fbp"] ?? null,
        fbc: t["fbc"] ?? null,
        client_user_agent: t["user_agent"] ?? null,
      } as never,
      _coupon_id: coupon_id as never,
      _cpf: cpf,
      _discount: quote.coupon?.discount ?? 0,
    });
    if (error || !orderId) {
      const msg = error?.message ?? "";
      if (msg.includes("coupon_buyer_limit")) return { ok: false, error: "Você já usou este cupom o número máximo de vezes." };
      if (msg.includes("coupon_")) return { ok: false, error: "Este cupom não está mais disponível." };
      console.error("checkout_create_order", msg);
      return { ok: false, error: "Não foi possível criar o pedido. Tente novamente." };
    }
    // Etapa 2: aqui será chamado getGatewayAdapter(gateway.provider).createPixCharge(...)
    return {
      ok: true,
      order_id: orderId as string,
      order_number: String(orderId).slice(0, 8).toUpperCase(),
      total: quote.total,
      gateway_status: gateway ? "pending_integration" : "no_gateway",
    };
  });
