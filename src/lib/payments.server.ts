import { getGatewayAdapter, GatewayNotReadyError, GatewayRequestError, GatewayUnknownResultError, webhookUrl, type CreatePixInput, type InternalPaymentStatus } from "./gateways";
import { sendPurchaseForOrder } from "./meta-purchase.server";

/** Estado público de uma tentativa (sem dados pessoais). */
export type PublicAttempt = {
  attempt_id: string;
  order_id: string;
  provider: string;
  status: string;
  amount_cents: number;
  pix_copy_paste: string | null;
  qr_code_image: string | null;
  expires_at: string | null;
  paid_at: string | null;
};

const OPEN = ["creating", "pending", "processing", "unknown_result"];
const ORDER_STATUS: Partial<Record<InternalPaymentStatus, "paid" | "cancelled" | "declined" | "expired" | "refunded" | "chargeback">> = {
  paid: "paid", cancelled: "cancelled", declined: "declined", failed: "declined", expired: "expired", refunded: "refunded", chargeback: "chargeback",
};

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

function toPublic(a: Record<string, unknown>): PublicAttempt {
  return {
    attempt_id: a["id"] as string, order_id: a["order_id"] as string, provider: a["provider"] as string, status: a["status"] as string,
    amount_cents: a["amount_cents"] as number, pix_copy_paste: (a["pix_copy_paste"] as string) ?? null, qr_code_image: (a["qr_code_image"] as string) ?? null,
    expires_at: (a["expires_at"] as string) ?? null, paid_at: (a["paid_at"] as string) ?? null,
  };
}

export type ChargeResult = { ok: true; attempt: PublicAttempt } | { ok: false; error: string; code: "not_configured" | "rejected" | "unknown_result" | "no_gateway" };

/**
 * Cria (no máximo) uma cobrança por pedido. A trava é o índice único de
 * tentativa aberta por pedido: cliques repetidos devolvem a mesma tentativa.
 */
export async function createChargeForOrder(
  orderId: string,
  gateway: { id: string; provider: string } | null,
  build: (attemptId: string) => Omit<CreatePixInput, "attempt_id" | "webhook_url">,
): Promise<ChargeResult> {
  const sb = await db();
  const { data: existing } = await sb.from("payment_attempts").select("*").eq("order_id", orderId).in("status", [...OPEN, "paid"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    if (existing.status === "creating" || existing.status === "unknown_result")
      return { ok: false, code: "unknown_result", error: "Estamos confirmando a geração do seu Pix. Aguarde alguns instantes e não pague em duplicidade." };
    return { ok: true, attempt: toPublic(existing) };
  }
  if (!gateway) return { ok: false, code: "no_gateway", error: "Nenhum gateway de pagamento está configurado." };
  const adapter = await getGatewayAdapter(gateway.provider);
  if (!adapter || !adapter.configured()) return { ok: false, code: "not_configured", error: "O pagamento Pix está temporariamente indisponível." };

  const { data: gw } = await sb.from("payment_gateways").select("is_active").eq("id", gateway.id).maybeSingle();
  if (!gw?.is_active) return { ok: false, code: "not_configured", error: "O pagamento Pix está temporariamente indisponível." };

  const draft = build("");
  const { data: attempt, error } = await sb.from("payment_attempts")
    .insert({ order_id: orderId, gateway_id: gateway.id, provider: gateway.provider, amount_cents: draft.amount_cents, status: "creating" })
    .select("*").single();
  if (error || !attempt) {
    // Corrida com outro clique: o índice único barrou a segunda tentativa.
    return { ok: false, code: "unknown_result", error: "Seu Pix já está sendo gerado. Aguarde alguns instantes." };
  }
  try {
    const charge = await adapter.createPixCharge({ ...build(attempt.id), attempt_id: attempt.id, webhook_url: webhookUrl(gateway.provider) });
    const { data: saved } = await sb.from("payment_attempts").update({
      provider_transaction_id: charge.providerTransactionId, status: charge.status === "paid" ? "pending" : charge.status === "unknown" ? "pending" : charge.status,
      raw_status: charge.rawStatus, pix_copy_paste: charge.pixCopyPaste, qr_code_image: charge.qrCodeImage, expires_at: charge.expiresAt, updated_at: new Date().toISOString(),
    }).eq("id", attempt.id).select("*").single();
    await sb.from("orders").update({ payment_method: "pix" }).eq("id", orderId);
    return { ok: true, attempt: toPublic(saved ?? attempt) };
  } catch (e) {
    const unknown = e instanceof GatewayUnknownResultError;
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    await sb.from("payment_attempts").update({ status: unknown ? "unknown_result" : "failed", error_message: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", attempt.id);
    await sb.from("payment_gateways").update({ last_error: `${new Date().toISOString()} · ${msg.slice(0, 200)}` }).eq("id", gateway.id);
    console.error(`[pix:${gateway.provider}] criação falhou`, msg);
    if (unknown) return { ok: false, code: "unknown_result", error: "Não conseguimos confirmar a geração do Pix. Aguarde e não tente pagar outra vez antes de verificarmos." };
    if (e instanceof GatewayNotReadyError) return { ok: false, code: "not_configured", error: "O pagamento Pix está temporariamente indisponível." };
    void (e instanceof GatewayRequestError);
    return { ok: false, code: "rejected", error: "Não foi possível gerar o Pix. Confira seus dados e tente novamente." };
  }
}

/**
 * Consulta o gateway pela API autenticada e aplica o resultado. Idempotente:
 * o pedido só vira `paid` uma vez (update condicional) e o Purchase usa
 * `orders.meta_purchase_sent_at`.
 */
export async function reconcileAttempt(attemptId: string, opts: { minIntervalMs?: number } = {}): Promise<PublicAttempt | null> {
  const sb = await db();
  const { data: a } = await sb.from("payment_attempts").select("*").eq("id", attemptId).maybeSingle();
  if (!a) return null;
  if (!a.provider_transaction_id || !["pending", "processing", "med"].includes(a.status)) return toPublic(a);
  const minGap = opts.minIntervalMs ?? 5000;
  if (a.last_checked_at && Date.now() - new Date(a.last_checked_at).getTime() < minGap) return toPublic(a);
  await sb.from("payment_attempts").update({ last_checked_at: new Date().toISOString(), check_count: (a.check_count ?? 0) + 1 }).eq("id", a.id);

  const adapter = await getGatewayAdapter(a.provider);
  if (!adapter?.configured()) return toPublic(a);
  let result;
  try {
    result = await adapter.getPaymentStatus(a.provider_transaction_id);
  } catch (e) {
    console.error(`[pix:${a.provider}] consulta falhou`, e instanceof Error ? e.message : e);
    return toPublic(a);
  }

  let status: string = result.status === "unknown" ? a.status : result.status;
  let error: string | null = null;
  if (status === "paid" && result.amountCents != null && result.amountCents !== a.amount_cents) {
    status = a.status;
    error = `Valor divergente: gateway ${result.amountCents} x pedido ${a.amount_cents}. Revisão manual.`;
  }
  const now = new Date().toISOString();
  const { data: updated } = await sb.from("payment_attempts").update({
    status, raw_status: result.rawStatus, error_message: error, updated_at: now, ...(status === "paid" && !a.paid_at ? { paid_at: now } : {}),
  }).eq("id", a.id).select("*").single();

  const orderStatus = ORDER_STATUS[status as InternalPaymentStatus];
  if (orderStatus === "paid") {
    const { data: changed } = await sb.from("orders").update({ status: "paid", paid_at: now, updated_at: now }).eq("id", a.order_id).eq("status", "pending").select("id, customer_phone");
    const row = changed?.[0];
    if (row) await sendPurchaseForOrder(row.id, row.customer_phone ?? null).catch((e) => console.error("[pix] purchase", e));
  } else if (orderStatus) {
    // Estados finais negativos só se aplicam a pedidos ainda pendentes ou (estorno/chargeback) pagos.
    const from: Array<"paid" | "pending"> = orderStatus === "refunded" || orderStatus === "chargeback" ? ["paid", "pending"] : ["pending"];
    await sb.from("orders").update({ status: orderStatus, updated_at: now }).eq("id", a.order_id).in("status", from);
  }
  return toPublic(updated ?? a);
}

export async function findAttemptByTransaction(provider: string, txId: string) {
  const sb = await db();
  const { data } = await sb.from("payment_attempts").select("id").eq("provider", provider).eq("provider_transaction_id", txId).maybeSingle();
  return data?.id ?? null;
}

export async function getPublicAttempt(attemptId: string) {
  const sb = await db();
  const { data } = await sb.from("payment_attempts").select("*").eq("id", attemptId).maybeSingle();
  return data ? toPublic(data) : null;
}

export const MAX_CHECKS = 500;
export const MAX_AGE_HOURS = 48;

/**
 * Conciliação em lote (rotina agendada): só tentativas abertas, recentes e
 * abaixo do limite de consultas. Funciona com o navegador fechado e
 * convive com postbacks — tudo passa pelo mesmo reconcileAttempt idempotente.
 */
export async function reconcilePendingAttempts(limit = 25) {
  const sb = await db();
  const since = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();
  const { data } = await sb.from("payment_attempts").select("id")
    .in("status", ["pending", "processing", "med"]).not("provider_transaction_id", "is", null)
    .gte("created_at", since).lt("check_count", MAX_CHECKS)
    .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
  const results: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = await reconcileAttempt(row.id, { minIntervalMs: 60_000 });
    const k = r?.status ?? "missing";
    results[k] = (results[k] ?? 0) + 1;
  }
  return { checked: data?.length ?? 0, results };
}
