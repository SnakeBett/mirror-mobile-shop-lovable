/** Personalização do checkout próprio (registro único em checkout_settings.settings). */
export type CheckoutPhrase = { id: string; text: string; active: boolean };

export type CheckoutSettings = {
  banner_enabled: boolean;
  phrases: CheckoutPhrase[];
  banner_bg: string;
  banner_fg: string;
  show_logo: boolean;
  logo_height: number;
  button_color: string;
  button_text: string;
  show_coupon: boolean;
  secure_message: string;
  card_unavailable_message: string;
};

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  banner_enabled: true,
  phrases: [],
  banner_bg: "#111111",
  banner_fg: "#ffffff",
  show_logo: true,
  logo_height: 36,
  button_color: "#fe2c55",
  button_text: "CONTINUAR PARA PAGAMENTO",
  show_coupon: true,
  secure_message: "Compra segura",
  card_unavailable_message: "Indisponível para esta oferta",
};

const HEX = /^#[0-9a-fA-F]{3,8}$/;

export function normalizeCheckoutSettings(raw: unknown): CheckoutSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CHECKOUT_SETTINGS;
  const str = (k: keyof CheckoutSettings, max = 120) =>
    typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string).slice(0, max) : (d[k] as string);
  const hex = (k: keyof CheckoutSettings) => (typeof r[k] === "string" && HEX.test(r[k] as string) ? (r[k] as string) : (d[k] as string));
  const bool = (k: keyof CheckoutSettings) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (d[k] as boolean));
  const phrases = Array.isArray(r["phrases"])
    ? (r["phrases"] as unknown[])
        .map((p, i) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return {
            id: typeof o["id"] === "string" ? (o["id"] as string) : `p${i}`,
            text: String(o["text"] ?? "").slice(0, 140),
            active: o["active"] !== false,
          };
        })
        .filter((p) => p.text.trim())
    : [];
  const h = Number(r["logo_height"]);
  return {
    banner_enabled: bool("banner_enabled"),
    phrases,
    banner_bg: hex("banner_bg"),
    banner_fg: hex("banner_fg"),
    show_logo: bool("show_logo"),
    logo_height: Number.isFinite(h) ? Math.min(80, Math.max(20, Math.round(h))) : d.logo_height,
    button_color: hex("button_color"),
    button_text: str("button_text", 40),
    show_coupon: bool("show_coupon"),
    secure_message: str("secure_message"),
    card_unavailable_message: str("card_unavailable_message"),
  };
}

/** "R$ 9,90" → 9.9; "Grátis" → 0; vazio → null (frete não informado). */
export function parseShippingFee(text: string | null | undefined): { amount: number; free: boolean } | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  if (/gr[aá]tis|free/i.test(value)) return { amount: 0, free: true };
  const match = value.replace(/\./g, "").match(/(\d+)(?:,(\d{1,2}))?/);
  if (!match) return null;
  const amount = Number(`${match[1]}.${match[2] ?? "0"}`);
  return amount > 0 ? { amount, free: false } : { amount: 0, free: true };
}

export function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

export function isValidCpf(raw: string) {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i += 1) sum += Number(cpf[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(cpf[len])) return false;
  }
  return true;
}

export function maskCpf(v: string) {
  return onlyDigits(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function maskCep(v: string) {
  return onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
}
