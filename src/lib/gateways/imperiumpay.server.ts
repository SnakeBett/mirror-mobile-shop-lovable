import { fetchWithTimeout, GatewayNotReadyError, GatewayRequestError, GatewayUnknownResultError, type GatewayAdapter, type InternalPaymentStatus } from "./index";

const BASE = "https://api.imperiumpay.com.br";

function headers() {
  const pub = process.env["IMPERIUMPAY_PUBLIC_KEY"];
  const priv = process.env["IMPERIUMPAY_PRIVATE_KEY"];
  if (!pub || !priv) throw new GatewayNotReadyError("imperiumpay");
  return { "X-Api-Public-Key": pub, "X-Api-Private-Key": priv, "Content-Type": "application/json" };
}

const MAP: Record<string, InternalPaymentStatus> = {
  PENDENTE: "pending",
  EM_PROCESSAMENTO: "processing",
  PAGO: "paid",
  CANCELADO: "cancelled",
  RECUSADO: "declined",
  ESTORNADO: "refunded",
  FALHA: "failed",
  CHARGEBACK: "chargeback",
  MED: "med",
};
const normalize = (raw: string | null | undefined): InternalPaymentStatus => MAP[String(raw ?? "").toUpperCase()] ?? "unknown";

/** Aceita a transação no topo ou embrulhada (sale/transaction/data). */
function unwrap(json: Record<string, unknown>): Record<string, unknown> {
  for (const k of ["sale", "transaction", "data"]) {
    const v = json[k];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return json;
}

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = btoa(String.fromCharCode(...sig));
  return [hex, b64];
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const imperiumpay: GatewayAdapter = {
  provider: "imperiumpay",
  requiredSecrets: ["IMPERIUMPAY_PUBLIC_KEY", "IMPERIUMPAY_PRIVATE_KEY"],
  configured: () => !!process.env["IMPERIUMPAY_PUBLIC_KEY"] && !!process.env["IMPERIUMPAY_PRIVATE_KEY"],
  normalizePaymentStatus: normalize,

  async createPixCharge(input) {
    const itemsSum = input.items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
    if (itemsSum !== input.amount_cents) throw new GatewayRequestError("Soma dos itens diverge do total; cobrança não criada.");
    const t = input.tracking;
    const body: Record<string, unknown> = {
      amount: input.amount_cents,
      paymentMethod: "PIX",
      customer: { name: input.customer.name, email: input.customer.email, document: { type: "cpf", number: input.customer.cpf }, phone: input.customer.phone },
      items: input.items.map((i) => ({ id: i.id, title: i.title.slice(0, 120), unitPrice: i.unit_price_cents, quantity: i.quantity, tangible: i.tangible })),
      postbackUrl: input.webhook_url,
      metadata: JSON.stringify({ order_id: input.order_id, attempt_id: input.attempt_id }),
    };
    if (input.shipping) {
      body["shipping"] = {
        street: input.shipping.street, streetNumber: input.shipping.number, complement: input.shipping.complement,
        zipCode: input.shipping.cep, neighborhood: input.shipping.district, city: input.shipping.city, state: input.shipping.state, country: "br",
      };
    }
    const tmap: Record<string, string> = { utmSource: "utm_source", utmMedium: "utm_medium", utmCampaign: "utm_campaign", utmContent: "utm_content", utmTerm: "utm_term", src: "src", sck: "sck" };
    for (const [k, v] of Object.entries(tmap)) if (t[v]) body[k] = t[v];

    const createdAt = new Date();
    let res: Response;
    try {
      res = await fetchWithTimeout(`${BASE}/api/sales`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    } catch (e) {
      if (e instanceof GatewayNotReadyError) throw e;
      throw new GatewayUnknownResultError("Sem resposta da ImperiumPay.");
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status >= 500) throw new GatewayUnknownResultError(`ImperiumPay respondeu ${res.status}.`);
    if (!res.ok || !json) throw new GatewayRequestError(`ImperiumPay recusou a venda (HTTP ${res.status}).`, res.status);
    const sale = unwrap(json);
    const pix = ((sale["payment"] as Record<string, unknown> | undefined)?.["pix"] ?? {}) as Record<string, unknown>;
    const code = pix["key"] as string | undefined;
    if (!sale["id"] || !code) throw new GatewayRequestError("Resposta da ImperiumPay sem id ou código Pix.");
    const img = pix["qrCodeBase64"] as string | undefined;
    return {
      provider: "imperiumpay",
      orderId: input.order_id,
      providerTransactionId: String(sale["id"]),
      status: normalize(sale["status"] as string),
      rawStatus: (sale["status"] as string) ?? null,
      amountCents: Number(sale["amount"]) || input.amount_cents,
      pixCopyPaste: code,
      qrCodeImage: img ? (img.startsWith("data:") ? img : `data:image/png;base64,${img}`) : null,
      expiresAt: (pix["expiresAt"] as string) || null,
      createdAt: createdAt.toISOString(),
    };
  },

  async getPaymentStatus(id) {
    const res = await fetchWithTimeout(`${BASE}/api/transactions/${encodeURIComponent(id)}`, { headers: headers() });
    if (!res.ok) throw new GatewayRequestError(`Consulta ImperiumPay falhou (HTTP ${res.status}).`, res.status);
    const tx = unwrap(((await res.json().catch(() => ({}))) as Record<string, unknown>));
    const raw = (tx["status"] as string) ?? null;
    const amt = Number(tx["amount"]);
    return { status: normalize(raw), rawStatus: raw, amountCents: Number.isFinite(amt) && amt > 0 ? amt : null };
  },

  async verifyWebhook(request, rawBody) {
    const secret = process.env["IMPERIUMPAY_POSTBACK_SECRET"];
    const sig = request.headers.get("x-signature")?.trim().replace(/^sha256=/i, "");
    if (!secret || !sig) return false;
    const candidates = [rawBody];
    try { candidates.push(JSON.stringify(JSON.parse(rawBody))); } catch { /* corpo inválido */ }
    for (const msg of candidates) {
      for (const expected of await hmac(secret, msg)) if (safeEqual(expected.toLowerCase() === expected ? sig.toLowerCase() : sig, expected)) return true;
    }
    return false;
  },

  async testConnection() {
    try {
      const res = await fetchWithTimeout(`${BASE}/api/transactions/teste-conexao`, { headers: headers() });
      if (res.status === 401 || res.status === 403) return { ok: false, message: "Chaves recusadas pela ImperiumPay." };
      return { ok: true, message: `ImperiumPay respondeu (HTTP ${res.status}) e aceitou a autenticação.` };
    } catch (e) {
      return { ok: false, message: e instanceof GatewayNotReadyError ? "Chaves não configuradas." : "Sem resposta da ImperiumPay." };
    }
  },
};
