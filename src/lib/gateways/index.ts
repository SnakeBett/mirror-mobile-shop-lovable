/**
 * Arquitetura modular de gateways Pix. Cada provedor implementa a mesma interface;
 * o checkout nunca conhece detalhes do provedor. Só roda no servidor.
 */
export type InternalPaymentStatus = "pending" | "paid" | "declined" | "cancelled" | "expired" | "refunded" | "chargeback";

export type PixCharge = { charge_id: string; qr_code_image: string | null; copy_paste: string; expires_at: string };

export type CreatePixInput = {
  order_id: string;
  amount: number;
  customer: { name: string; email: string; cpf: string; phone: string };
  description: string;
  environment: "sandbox" | "live";
};

export interface GatewayAdapter {
  provider: string;
  /** false enquanto a documentação oficial não foi integrada. */
  ready: boolean;
  createPixCharge(input: CreatePixInput): Promise<PixCharge>;
  getPaymentStatus(chargeId: string): Promise<InternalPaymentStatus>;
  verifyWebhook(request: Request, rawBody: string): Promise<boolean>;
  normalizePaymentStatus(raw: string): InternalPaymentStatus;
}

export class GatewayNotReadyError extends Error {
  constructor(provider: string) {
    super(`Gateway ${provider} ainda não está conectado (documentação pendente).`);
  }
}

function pendingAdapter(provider: string): GatewayAdapter {
  const fail = async (): Promise<never> => {
    throw new GatewayNotReadyError(provider);
  };
  return {
    provider,
    ready: false,
    createPixCharge: fail,
    getPaymentStatus: fail,
    verifyWebhook: async () => false,
    normalizePaymentStatus: () => "pending",
  };
}

// Endpoints/autenticação serão implementados seguindo a documentação oficial de cada provedor.
const ADAPTERS: Record<string, GatewayAdapter> = {
  imperiumpay: pendingAdapter("imperiumpay"),
  zuckpay: pendingAdapter("zuckpay"),
};

export function getGatewayAdapter(provider: string): GatewayAdapter {
  return ADAPTERS[provider] ?? pendingAdapter(provider);
}
