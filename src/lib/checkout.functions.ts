import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { parseShippingFee, isValidCpf, onlyDigits } from "./checkout-settings";
import type { PublicAttempt } from "./payments.server";
import { DEFAULT_VARIANT_SETTINGS, computePricing, missingSelection, type ProductAttribute, type ProductVariant, type QuantityOffer, type VariantSettings } from "./variants";

const unitSchema = z.record(z.string().uuid(), z.string().uuid());

const quoteSchema = z.object({
  slug: z.string().min(1).max(200),
  kit_id: z.string().uuid().nullable(),
  units: z.array(unitSchema).max(50),
  same_for_all: z.boolean(),
  coupon_code: z.string().trim().max(40).nullable(),
  buyer_cpf: z.string().max(20).nullable().optional(),
  shipping_method_id: z.string().uuid().nullable().optional(),
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
  digital: boolean;
  shipping_options: ShippingOption[];
  shipping_method_id: string | null;
  shipping_error: string | null;
};

export type ShippingOption = { id: string; name: string; description: string | null; price: number; min_days: number | null; max_days: number | null };

const round = (n: number) => Math.round(n * 100) / 100;

type QuoteInput = z.infer<typeof quoteSchema>;

async function computeQuote(input: QuoteInput) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: product } = await db.from("products").select("*").eq("slug", input.slug).eq("is_active", true).maybeSingle();
  if (!product) throw new Error("Este produto não está mais disponível.");
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
  const digital = product.product_type === "digital";
  let ship: { amount: number; free: boolean } | null = null;
  let shipping_options: ShippingOption[] = [];
  let shippingMethod: ShippingOption | null = null;
  let shipping_error: string | null = null;
  const mode = product.shipping_mode ?? "legacy";
  if (digital) ship = { amount: 0, free: true };
  else if (mode === "free") ship = { amount: 0, free: true };
  else if (mode === "global" || mode === "selected") {
    let q = db.from("shipping_methods").select("id, name, description, price, min_days, max_days").eq("is_active", true).order("sort_order");
    if (mode === "selected") q = q.in("id", product.shipping_method_ids.length ? product.shipping_method_ids : ["00000000-0000-0000-0000-000000000000"]);
    const { data: ms, error: msErr } = await q;
    if (msErr) throw new Error("Não foi possível carregar as opções de entrega.");
    shipping_options = (ms ?? []).map((m) => ({ ...m, price: Number(m.price) }));
    shippingMethod = shipping_options.length === 1 ? shipping_options[0]! : (shipping_options.find((m) => m.id === input.shipping_method_id) ?? null);
    if (shipping_options.length === 0) shipping_error = "Nenhuma opção de entrega disponível para este produto.";
    else if (!shippingMethod) shipping_error = "Escolha a forma de entrega.";
    else ship = { amount: round(shippingMethod.price), free: shippingMethod.price <= 0 };
  } else ship = parseShippingFee(product.shipping_fee);

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
    digital,
    shipping_options,
    shipping_method_id: shippingMethod?.id ?? null,
    shipping_error,
  };
  return { quote, product, coupon_id, kit, units, attributes, shippingMethod };
}

export const getCheckoutQuote = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => quoteSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true; quote: CheckoutQuote } | { ok: false; error: string }> => {
    try {
      return { ok: true, quote: (await computeQuote(data)).quote };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("checkout quote", data.slug, msg);
      const known = /disponível|oferta escolhida|entrega/i.test(msg);
      return { ok: false, error: known ? msg : "Não foi possível calcular o pedido agora. Tente novamente em instantes." };
    }
  });

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
  }).nullable(),
  tracking: z.record(z.string(), z.string().max(400).nullable()).optional(),
});

export type CreateOrderResult =
  | { ok: true; order_id: string; order_number: string; total: number; attempt: PublicAttempt | null; payment_error: string | null }
  | { ok: false; error: string };

export const createPendingOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => orderSchema.parse(data))
  .handler(async ({ data }): Promise<CreateOrderResult> => {
    let computed: Awaited<ReturnType<typeof computeQuote>>;
    try { computed = await computeQuote({ ...data, buyer_cpf: data.buyer.cpf }); }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Não foi possível calcular o pedido." }; }
    const { quote, product, coupon_id, kit, units, attributes, shippingMethod } = computed;
    if (quote.selection_error) return { ok: false, error: quote.selection_error };
    if (!quote.digital && quote.shipping_error) return { ok: false, error: quote.shipping_error };
    if (data.coupon_code && quote.coupon_error) return { ok: false, error: quote.coupon_error };
    if (!quote.digital && !data.address) return { ok: false, error: "Informe o endereço de entrega." };
    const addr = quote.digital ? null : data.address;
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
        shipping_address: addr ? { ...addr, cep: onlyDigits(addr.cep), state: addr.state.toUpperCase() } : null,
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
    // Mesma chave reaproveitada depois de mudar frete/cupom: o pedido já gravado tem outro valor.
    const { data: saved } = await db.from("orders").select("amount").eq("id", orderId as string).maybeSingle();
    if (!saved || Math.round(Number(saved.amount) * 100) !== Math.round(quote.total * 100)) {
      return { ok: false, error: "O total do pedido mudou. Toque novamente para gerar o Pix com o valor atualizado.", reset: true };
    }
    if (shippingMethod) {
      await db.rpc("checkout_set_order_shipping", { _order_id: orderId as string, _method_id: shippingMethod.id, _method_name: shippingMethod.name });
    }
    const { createChargeForOrder } = await import("./payments.server");
    const totalCents = Math.round(quote.total * 100);
    const shipCents = Math.round((quote.shipping ?? 0) * 100);
    const title = `${product.name}${kit ? ` · ${kit.name}` : ""}${labels.length ? ` (${labels.join("; ")})` : ""}`;
    const charge = totalCents > 0
      ? await createChargeForOrder(orderId as string, gateway, () => ({
          order_id: orderId as string,
          amount_cents: totalCents,
          customer: { name: data.buyer.name, email: data.buyer.email.toLowerCase(), cpf, phone: onlyDigits(data.buyer.phone) },
          description: `Pedido ${String(orderId).slice(0, 8).toUpperCase()}`,
          shipping_cents: shipCents,
          items: [{ id: product.id, title, unit_price_cents: totalCents - shipCents, quantity: 1, tangible: !quote.digital }],
          shipping: addr ? { street: addr.street, number: addr.number, complement: addr.complement, cep: onlyDigits(addr.cep), district: addr.district, city: addr.city, state: addr.state.toUpperCase() } : null,
          tracking: Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "string" && v)) as Record<string, string>,
        }))
      : ({ ok: false, error: "Total inválido para Pix." } as const);
    return {
      ok: true,
      order_id: orderId as string,
      order_number: String(orderId).slice(0, 8).toUpperCase(),
      total: quote.total,
      attempt: charge.ok ? charge.attempt : null,
      payment_error: charge.ok ? null : charge.error,
    };
  });

export const getPixStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ attempt_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<PublicAttempt | null> => {
    const { reconcileAttempt } = await import("./payments.server");
    return reconcileAttempt(data.attempt_id);
  });
