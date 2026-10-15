import { fetchWithTimeout, GatewayNotReadyError, GatewayRequestError, GatewayUnknownResultError, type GatewayAdapter, type InternalPaymentStatus } from "./index";

const BASE = "https://www.zuckpay.com.br/conta/v3/pix";
const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "src", "sck", "fbclid", "fbc", "fbp", "gclid", "wbraid", "gbraid", "ttclid", "kclid", "click_id"];

function auth() {
  const id = process.env["ZUCKPAY_CLIENT_ID"];
  const secret = process.env["ZUCKPAY_CLIENT_SECRET"];
  if (!id || !secret) throw new GatewayNotReadyError("zuckpay");
  return "Basic " + btoa(`${id}:${secret}`);
}

const MAP: Record<string, InternalPaymentStatus> = { PENDING: "pending", PAID: "paid", FAILED: "failed", EXPIRADO: "expired", UNKNOWN: "unknown" };

function normalize(raw: string | null | undefined): InternalPaymentStatus {
  return MAP[String(raw ?? "").toUpperCase()] ?? "unknown";
}

function toCents(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const zuckpay: GatewayAdapter = {
  provider: "zuckpay",
  requiredSecrets: ["ZUCKPAY_CLIENT_ID", "ZUCKPAY_CLIENT_SECRET"],
  configured: () => !!process.env["ZUCKPAY_CLIENT_ID"] && !!process.env["ZUCKPAY_CLIENT_SECRET"],
  normalizePaymentStatus: normalize,

  async createPixCharge(input) {
    const body: Record<string, unknown> = {
      nome: input.customer.name,
      cpf: input.customer.cpf,
      valor: Number((input.amount_cents / 100).toFixed(2)),
      email: input.customer.email,
      telefone: input.customer.phone,
      urlnoty: input.webhook_url,
      descricao: input.description.slice(0, 140),
      external_id_client: input.attempt_id,
    };
    for (const k of TRACKING_KEYS) if (input.tracking[k]) body[k] = input.tracking[k];
    const createdAt = new Date();
    let res: Response;
    try {
      res = await fetchWithTimeout(`${BASE}/qrcode`, { method: "POST", headers: { Authorization: auth(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      if (e instanceof GatewayNotReadyError) throw e;
      throw new GatewayUnknownResultError("Sem resposta da ZuckPay.");
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status >= 500) throw new GatewayUnknownResultError(`ZuckPay respondeu ${res.status}.`);
    if (!res.ok || !json) throw new GatewayRequestError(`ZuckPay recusou a cobrança (HTTP ${res.status}).`, res.status);
    const tx = json["transactionId"];
    const code = (json["pix_code"] ?? json["qrcode"]) as string | undefined;
    if (!tx || !code) throw new GatewayRequestError("Resposta da ZuckPay sem transactionId ou código Pix.");
    const exp = Number((json["calendar"] as Record<string, unknown> | undefined)?.["expiration"]);
    const img = json["qrcode_image"] as string | undefined;
    return {
      provider: "zuckpay",
      orderId: input.order_id,
      providerTransactionId: String(tx),
      status: normalize(json["status"] as string),
      rawStatus: (json["status"] as string) ?? null,
      amountCents: toCents(json["amount"]) ?? input.amount_cents,
      pixCopyPaste: code,
      qrCodeImage: img ? (img.startsWith("data:") || img.startsWith("http") ? img : `data:image/png;base64,${img}`) : null,
      expiresAt: Number.isFinite(exp) && exp > 0 ? new Date(createdAt.getTime() + exp * 1000).toISOString() : null,
      createdAt: createdAt.toISOString(),
    };
  },

  async getPaymentStatus(transactionId) {
    const res = await fetchWithTimeout(`${BASE}/status?transactionId=${encodeURIComponent(transactionId)}`, { headers: { Authorization: auth() } });
    if (!res.ok) throw new GatewayRequestError(`Consulta ZuckPay falhou (HTTP ${res.status}).`, res.status);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const raw = (json["status"] as string) ?? null;
    return { status: normalize(raw), rawStatus: raw, amountCents: toCents(json["amount"]) };
  },

  // A documentação não define assinatura: o webhook nunca é prova de pagamento;
  // sempre reconciliamos pela consulta autenticada.
  verifyWebhook: async () => false,

  async testConnection() {
    try {
      const res = await fetchWithTimeout(`${BASE}/status?transactionId=teste-conexao`, { headers: { Authorization: auth() } });
      if (res.status === 401 || res.status === 403) return { ok: false, message: "Credenciais recusadas pela ZuckPay." };
      return { ok: true, message: `ZuckPay respondeu (HTTP ${res.status}) e aceitou a autenticação.` };
    } catch (e) {
      return { ok: false, message: e instanceof GatewayNotReadyError ? "Credenciais não configuradas." : "Sem resposta da ZuckPay." };
    }
  },
};
