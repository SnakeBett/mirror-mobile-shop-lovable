import { buildUserData, loadTrackingSettings, logMetaEvent, sendCapiEvent } from "./meta.server";

/**
 * Purchase server-side.
 *
 * Só é disparado quando o pedido está `paid` no nosso banco (confirmação do
 * webhook de pagamento). O controle de idempotência é persistente:
 * `orders.meta_purchase_sent_at` + `orders.meta_purchase_event_id`. Reprocessar
 * o webhook não gera um segundo Purchase.
 */
export async function sendPurchaseForOrder(
  orderId: string,
  phone: string | null = null,
): Promise<{ status: "sent" | "skipped" | "failed"; event_id?: string; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, amount, product_id, customer_email, fbp, fbc, client_user_agent, meta_purchase_sent_at, meta_purchase_event_id, visitor_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { status: "skipped", reason: "order_not_found" };
  if (order.status !== "paid") return { status: "skipped", reason: "not_paid" };
  if (order.meta_purchase_sent_at) {
    return { status: "skipped", reason: "already_sent", event_id: order.meta_purchase_event_id ?? "" };
  }

  const settings = await loadTrackingSettings();
  const eventId = order.meta_purchase_event_id || `purchase_${order.id}`;

  if (!settings.meta_enabled || !settings.meta_pixel_id || !settings.meta_capi_token) {
    return { status: "skipped", reason: "meta_not_configured", event_id: eventId };
  }

  // `contents` já é array: um pedido com vários itens só precisa preencher a lista.
  const amount = Number(order.amount ?? 0);
  const contents: Array<Record<string, unknown>> = [];
  let productName: string | null = null;

  if (order.product_id) {
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, name")
      .eq("id", order.product_id)
      .maybeSingle();
    productName = product?.name ?? null;
    contents.push({ id: order.product_id, quantity: 1, item_price: amount });
  }

  const result = await sendCapiEvent(settings, {
    event_name: "Purchase",
    event_id: eventId,
    action_source: "website",
    user_data: await buildUserData({
      email: order.customer_email,
      phone,
      fbp: order.fbp,
      fbc: order.fbc,
      external_id: order.visitor_id,
      client_user_agent: order.client_user_agent,
    }),
    custom_data: {
      ...(contents.length > 0 ? { content_ids: contents.map((c) => c["id"]), contents } : {}),
      ...(productName ? { content_name: productName } : {}),
      content_type: "product",
      value: amount,
      currency: "BRL",
      order_id: order.id,
    },
  });

  await logMetaEvent({
    event_name: "Purchase",
    event_id: eventId,
    product_id: order.product_id,
    order_id: order.id,
    pixel_sent: false,
    capi: result,
    test_event: Boolean(settings.meta_test_event_code),
  });

  if (result.ok) {
    await supabaseAdmin
      .from("orders")
      .update({ meta_purchase_sent_at: new Date().toISOString(), meta_purchase_event_id: eventId } as never)
      .eq("id", order.id);
    return { status: "sent", event_id: eventId };
  }

  // Falha temporária: mantém o pedido elegível para retry (mesmo event_id).
  await supabaseAdmin
    .from("orders")
    .update({ meta_purchase_event_id: eventId } as never)
    .eq("id", order.id);
  return { status: "failed", event_id: eventId, reason: result.error ?? result.skipped ?? "erro" };
}
