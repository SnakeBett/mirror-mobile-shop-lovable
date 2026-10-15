/**
 * Credenciais dos gateways Pix: quais campos cada gateway usa e as regras puras
 * (validação, máscara, endereço do site). Não acessa servidor nem banco: o painel
 * e o servidor usam exatamente as mesmas regras. Os valores ficam no cofre
 * privado (credential-store.server.ts) e nunca voltam para o navegador.
 */

export const GATEWAY_PROVIDERS = ["imperiumpay", "zuckpay"] as const;
export type GatewayProvider = (typeof GATEWAY_PROVIDERS)[number];

export function isGatewayProvider(value: unknown): value is GatewayProvider {
  return typeof value === "string" && (GATEWAY_PROVIDERS as readonly string[]).includes(value);
}

export const GATEWAY_NAMES: Record<GatewayProvider, string> = {
  imperiumpay: "ImperiumPay",
  zuckpay: "ZuckPay",
};

export type CredentialField = {
  key: string;
  label: string;
  /** Variável de ambiente usada quando o campo não foi salvo no painel. */
  env: string;
  /** Sem ele o gateway não gera Pix. */
  required: boolean;
  help: string;
};

export const GATEWAY_FIELDS: Record<GatewayProvider, readonly CredentialField[]> = {
  imperiumpay: [
    {
      key: "public_key",
      label: "Chave pública",
      env: "IMPERIUMPAY_PUBLIC_KEY",
      required: true,
      help: "Fica no painel da ImperiumPay, junto da chave privada. Vai no cabeçalho X-Api-Public-Key.",
    },
    {
      key: "private_key",
      label: "Chave privada",
      env: "IMPERIUMPAY_PRIVATE_KEY",
      required: true,
      help: "Vai no cabeçalho X-Api-Private-Key. Nunca compartilhe.",
    },
    {
      key: "postback_secret",
      label: "Segredo do postback",
      env: "IMPERIUMPAY_POSTBACK_SECRET",
      required: false,
      help: "Opcional. Confere a assinatura (X-Signature) dos avisos de pagamento. Sem ele, o pagamento é confirmado pela consulta automática.",
    },
  ],
  zuckpay: [
    {
      key: "client_id",
      label: "Client ID",
      env: "ZUCKPAY_CLIENT_ID",
      required: true,
      help: "Credencial de API da conta ZuckPay.",
    },
    {
      key: "client_secret",
      label: "Client Secret",
      env: "ZUCKPAY_CLIENT_SECRET",
      required: true,
      help: "Segredo de API da conta ZuckPay. Nunca compartilhe.",
    },
  ],
};

/** Valores efetivos das credenciais de um gateway, por chave do campo. */
export type GatewayCredentials = Readonly<Partial<Record<string, string>>>;

/** Onde está o valor que o checkout usa: salvo no painel, variável de ambiente da Lovable ou nenhum. */
export type CredentialSource = "panel" | "env" | "none";

/* Estado mostrado no painel. Nunca carrega o valor de uma credencial, só o final dela. */
export type CredentialFieldStatus = CredentialField & {
  source: CredentialSource;
  /** Últimos 4 caracteres do valor em uso (só para valores longos). */
  hint: string | null;
  /** Valor em uso inválido (só acontece com variável de ambiente mal preenchida). */
  invalid: boolean;
  /** Existe variável de ambiente para este campo (vale quando o painel está vazio). */
  env_set: boolean;
};

export type GatewayConfigStatus = {
  provider: GatewayProvider;
  name: string;
  configured: boolean;
  /** false = o cofre não respondeu agora; o que aparece pode estar incompleto. */
  readable: boolean;
  /** Rótulos dos campos obrigatórios que faltam. */
  missing: string[];
  fields: CredentialFieldStatus[];
  webhook_url: string;
  /** ImperiumPay: segredo do postback presente (os avisos têm a assinatura conferida). */
  signature_check: boolean | null;
  /** Pix deste gateway ainda em aberto (últimas 48 h); null = não deu para contar. */
  open_attempts: number | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type SiteOriginSource = "panel" | "env" | "default";

export type PaymentConfigStatus = {
  gateways: GatewayConfigStatus[];
  site: { origin: string; source: SiteOriginSource; panel: string | null; default_origin: string };
  vault: { ok: boolean; error: string | null; exists: boolean; public: boolean };
};

export const CREDENTIAL_MAX_LENGTH = 500;

/**
 * Erro do valor de uma credencial (já sem espaços nas pontas), ou null se for válido.
 * Só caracteres ASCII visíveis: as chaves vão em cabeçalhos HTTP, e acento ou quebra
 * de linha faria a chamada ao gateway falhar sem dizer o motivo.
 */
export function credentialValueError(value: string): string | null {
  if (!value) return "Preencha o valor.";
  if (value.length > CREDENTIAL_MAX_LENGTH)
    return `Use no máximo ${CREDENTIAL_MAX_LENGTH} caracteres.`;
  if (!/^[\x20-\x7E]+$/.test(value))
    return "Use só letras, números e símbolos comuns, sem acentos, emojis ou quebras de linha.";
  return null;
}

export function fieldsOf(provider: GatewayProvider): readonly CredentialField[] {
  return GATEWAY_FIELDS[provider];
}

/** Campo obrigatório vazio ou inválido = gateway sem condição de gerar Pix. */
export function missingRequired(
  provider: GatewayProvider,
  creds: GatewayCredentials,
): CredentialField[] {
  return GATEWAY_FIELDS[provider].filter((f) => {
    const value = creds[f.key];
    return f.required && (!value || credentialValueError(value) !== null);
  });
}

export function isConfigured(provider: GatewayProvider, creds: GatewayCredentials): boolean {
  return missingRequired(provider, creds).length === 0;
}

/** Final visível de um valor salvo: os 4 últimos caracteres, só quando o valor é longo. */
export function credentialHint(value: string | null | undefined): string | null {
  if (!value || value.length < 12) return null;
  return value.slice(-4);
}

/**
 * Endereço público do site, usado nos avisos de pagamento (webhooks).
 * Aceita https (http só para localhost) e guarda apenas a origem, sem caminho.
 */
export function normalizeSiteUrl(
  input: string,
): { ok: true; origin: string } | { ok: false; error: string } {
  const text = input.trim();
  if (!text) return { ok: false, error: "Informe o endereço do site." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "Endereço inválido. Exemplo: https://minhaloja.com.br" };
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    return { ok: false, error: "Use um endereço com https://" };
  if (url.username || url.password)
    return { ok: false, error: "O endereço não pode ter usuário ou senha." };
  if (!local && !url.hostname.includes("."))
    return { ok: false, error: "Endereço inválido. Exemplo: https://minhaloja.com.br" };
  return { ok: true, origin: url.origin };
}
