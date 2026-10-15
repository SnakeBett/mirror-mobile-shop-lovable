/**
 * Arquitetura modular de gateways Pix. Cada provedor implementa a mesma interface;
 * o checkout só consome a estrutura comum `PixCharge`. Só roda no servidor.
 */
export type InternalPaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "declined"
  | "cancelled"
  | "expired"
  | "refunded"
  | "chargeback"
  | "med"
  | "unknown";

export type PixCharge = {
  provider: string;
  orderId: string;
  providerTransactionId: string;
  status: InternalPaymentStatus;
  rawStatus: string | null;
  amountCents: number;
  pixCopyPaste: string;
  qrCodeImage: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type CreatePixInput = {
  order_id: string;
  attempt_id: string;
  amount_cents: number;
  customer: { name: string; email: string; cpf: string; phone: string };
  description: string;
  /** Frete incluído em amount_cents (já somado ao total exibido). */
  shipping_cents: number;
  items: Array<{ id: string; title: string; unit_price_cents: number; quantity: number; tangible: boolean }>;
  shipping: { street: string; number: string; complement: string; cep: string; district: string; city: string; state: string } | null;
  tracking: Record<string, string | null>;
  webhook_url: string;
};

export type StatusResult = { status: InternalPaymentStatus; rawStatus: string | null; amountCents: number | null };

export interface GatewayAdapter {
  provider: string;
  /** Lista de segredos exigidos (nomes, nunca valores). */
  requiredSecrets: string[];
  configured(): boolean;
  createPixCharge(input: CreatePixInput): Promise<PixCharge>;
  getPaymentStatus(transactionId: string): Promise<StatusResult>;
  verifyWebhook(request: Request, rawBody: string): Promise<boolean>;
  normalizePaymentStatus(raw: string | null | undefined): InternalPaymentStatus;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

export class GatewayNotReadyError extends Error {
  constructor(provider: string) {
    super(`Gateway ${provider} não está configurado.`);
  }
}

/** Erro em que não sabemos se a cobrança foi criada (timeout, rede). Não repetir cegamente. */
export class GatewayUnknownResultError extends Error {
  constructor(message: string, public httpStatus: number | null = null, public errorCode = "UNKNOWN_RESULT", public transactionId: string | null = null) { super(message); }
}

export class GatewayRequestError extends Error {
  constructor(message: string, public httpStatus: number | null = null, public errorCode = "REQUEST_REJECTED") {
    super(message);
  }
}

/** Only known machine codes are retained; provider messages may contain PII. */
export function gatewayErrorCode(json: Record<string, unknown> | null, status: number): string {
  const error = json?.["error"];
  const candidate = json?.["code"] ?? (error && typeof error === "object" ? (error as Record<string, unknown>)["code"] : null);
  const allowed = new Set(["UNAUTHORIZED", "FORBIDDEN", "INVALID_CREDENTIALS", "VALIDATION_ERROR", "INVALID_DOCUMENT", "INVALID_AMOUNT", "INVALID_REQUEST", "MISSING_REQUIRED_FIELD", "PIX_KEY_REQUIRED", "INTERNAL_SERVER_ERROR"]);
  return typeof candidate === "string" && allowed.has(candidate.toUpperCase()) ? candidate.toUpperCase() : `HTTP_${status}`;
}

export async function fetchWithTimeout(url: string, init: RequestInit, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function getGatewayAdapter(provider: string): Promise<GatewayAdapter | null> {
  if (provider === "zuckpay") return (await import("./zuckpay.server")).zuckpay;
  if (provider === "imperiumpay") return (await import("./imperiumpay.server")).imperiumpay;
  return null;
}

export function webhookUrl(provider: string) {
  const origin = process.env["PUBLIC_SITE_URL"] || "https://project--3e5c2a7c-afb9-4fe4-84a9-5af06a27398e.lovable.app";
  return `${origin}/api/public/webhooks/${provider}`;
}
