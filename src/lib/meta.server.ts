/**
 * Meta Pixel + Conversions API (server-side).
 *
 * REGRA DE SEGURANÇA: o Access Token da CAPI vive apenas neste módulo
 * (arquivo *.server.ts, bloqueado no bundle do cliente) e na tabela
 * `tracking_settings`, que não possui nenhuma policy de leitura — só o
 * service role a alcança. O token nunca é retornado para o navegador nem
 * gravado em logs.
 */

export type TrackingSettings = {
  meta_enabled: boolean;
  meta_pixel_id: string | null;
  meta_capi_token: string | null;
  meta_test_event_code: string | null;
  meta_graph_version: string;
  utmify_enabled: boolean;
  utmify_pixel_id: string | null;
  utmify_pixel_script: string;
  utmify_utm_script: string;
  utmify_api_token: string | null;
  utmify_checkout_params: string[];
};

/** Configuração que PODE ir para o navegador (sem nenhum segredo). */
export type PublicTrackingConfig = {
  meta_enabled: boolean;
  meta_pixel_id: string | null;
  meta_capi_ready: boolean;
  utmify_enabled: boolean;
  utmify_pixel_id: string | null;
  utmify_pixel_script: string | null;
  utmify_utm_script: string | null;
  utmify_checkout_params: string[];
};

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  meta_enabled: false,
  meta_pixel_id: null,
  meta_capi_token: null,
  meta_test_event_code: null,
  meta_graph_version: "v21.0",
  utmify_enabled: false,
  utmify_pixel_id: null,
  utmify_pixel_script: "https://cdn.utmify.com.br/scripts/pixel/pixel.js",
  utmify_utm_script: "https://cdn.utmify.com.br/scripts/utms/latest.js",
  utmify_api_token: null,
  utmify_checkout_params: [],
};

const clean = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

export function normalizeTrackingSettings(row: Record<string, unknown> | null | undefined): TrackingSettings {
  if (!row) return DEFAULT_TRACKING_SETTINGS;
  const params = Array.isArray(row["utmify_checkout_params"])
    ? (row["utmify_checkout_params"] as unknown[]).map((v) => String(v).trim()).filter(Boolean)
    : [];
  return {
    meta_enabled: row["meta_enabled"] === true,
    meta_pixel_id: clean(row["meta_pixel_id"]),
    meta_capi_token: clean(row["meta_capi_token"]),
    meta_test_event_code: clean(row["meta_test_event_code"]),
    meta_graph_version: clean(row["meta_graph_version"]) ?? DEFAULT_TRACKING_SETTINGS.meta_graph_version,
    utmify_enabled: row["utmify_enabled"] === true,
    utmify_pixel_id: clean(row["utmify_pixel_id"]),
    utmify_pixel_script:
      clean(row["utmify_pixel_script"]) ?? DEFAULT_TRACKING_SETTINGS.utmify_pixel_script,
    utmify_utm_script: clean(row["utmify_utm_script"]) ?? DEFAULT_TRACKING_SETTINGS.utmify_utm_script,
    utmify_api_token: clean(row["utmify_api_token"]),
    utmify_checkout_params: params,
  };
}

export async function loadTrackingSettings(): Promise<TrackingSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("tracking_settings").select("*").maybeSingle();
  return normalizeTrackingSettings(data as Record<string, unknown> | null);
}

export function toPublicTrackingConfig(settings: TrackingSettings): PublicTrackingConfig {
  return {
    meta_enabled: settings.meta_enabled,
    meta_pixel_id: settings.meta_enabled ? settings.meta_pixel_id : null,
    meta_capi_ready: settings.meta_enabled && Boolean(settings.meta_capi_token && settings.meta_pixel_id),
    utmify_enabled: settings.utmify_enabled,
    utmify_pixel_id: settings.utmify_enabled ? settings.utmify_pixel_id : null,
    utmify_pixel_script: settings.utmify_enabled ? settings.utmify_pixel_script : null,
    utmify_utm_script: settings.utmify_enabled ? settings.utmify_utm_script : null,
    utmify_checkout_params: settings.utmify_checkout_params,
  };
}

/* ------------------------------------------------------------------ */
/* User data (Event Match Quality)                                     */
/* ------------------------------------------------------------------ */

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normalização exigida pela Meta antes do hash (minúsculas, sem espaços). */
async function hashEmail(email: string | null | undefined) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  return sha256(normalized);
}

/** Telefone: apenas dígitos, com código do país (assume +55 quando ausente). */
async function hashPhone(phone: string | null | undefined) {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11) digits = `55${digits}`;
  if (digits.length < 10) return null;
  return sha256(digits);
}

export type UserSignals = {
  email?: string | null | undefined;
  phone?: string | null | undefined;
  fbp?: string | null | undefined;
  fbc?: string | null | undefined;
  client_ip_address?: string | null | undefined;
  client_user_agent?: string | null | undefined;
  external_id?: string | null | undefined;
};

/** Monta user_data somente com sinais realmente disponíveis. Nada é inventado. */
export async function buildUserData(signals: UserSignals) {
  const userData: Record<string, unknown> = {};
  const em = await hashEmail(signals.email);
  const ph = await hashPhone(signals.phone);
  if (em) userData["em"] = [em];
  if (ph) userData["ph"] = [ph];
  if (signals.external_id) userData["external_id"] = [await sha256(String(signals.external_id))];
  if (signals.fbp) userData["fbp"] = signals.fbp;
  if (signals.fbc) userData["fbc"] = signals.fbc;
  if (signals.client_ip_address) userData["client_ip_address"] = signals.client_ip_address;
  if (signals.client_user_agent) userData["client_user_agent"] = signals.client_user_agent;
  return userData;
}

/* ------------------------------------------------------------------ */
/* Envio para a Conversions API                                        */
/* ------------------------------------------------------------------ */

export type CapiEvent = {
  event_name: "PageView" | "ViewContent" | "InitiateCheckout" | "Purchase" | "AddToCart" | "Search";
  event_id: string;
  event_time?: number | undefined;
  event_source_url?: string | null | undefined;
  action_source?: "website" | "other" | undefined;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
};

export type CapiResult = {
  ok: boolean;
  status: number | null;
  error: string | null;
  attempts: number;
  skipped?: string;
};

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Envia um evento para a Graph API. Retentativa apenas em falhas
 * temporárias (rede / 5xx / 429) — sempre com o MESMO event_id, o que
 * mantém a idempotência do lado da Meta.
 */
export async function sendCapiEvent(
  settings: TrackingSettings,
  event: CapiEvent,
  options: { maxAttempts?: number | undefined; testEventCode?: string | null | undefined } = {},
): Promise<CapiResult> {
  if (!settings.meta_enabled) return { ok: false, status: null, error: null, attempts: 0, skipped: "meta_disabled" };
  if (!settings.meta_pixel_id || !settings.meta_capi_token) {
    return { ok: false, status: null, error: null, attempts: 0, skipped: "capi_not_configured" };
  }

  const version = settings.meta_graph_version.startsWith("v")
    ? settings.meta_graph_version
    : `v${settings.meta_graph_version}`;
  const url = `https://graph.facebook.com/${version}/${settings.meta_pixel_id}/events`;
  const testCode = options.testEventCode ?? settings.meta_test_event_code;

  const body: Record<string, unknown> = {
    data: [
      {
        action_source: event.action_source ?? "website",
        event_name: event.event_name,
        event_id: event.event_id,
        event_time: event.event_time ?? Math.floor(Date.now() / 1000),
        ...(event.event_source_url ? { event_source_url: event.event_source_url } : {}),
        user_data: event.user_data,
        ...(event.custom_data ? { custom_data: event.custom_data } : {}),
      },
    ],
    access_token: settings.meta_capi_token,
  };
  if (testCode) body["test_event_code"] = testCode;

  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  let attempts = 0;
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      lastStatus = response.status;
      if (response.ok) return { ok: true, status: response.status, error: null, attempts };

      const text = (await response.text().catch(() => "")).slice(0, 500);
      lastError = safeError(text, settings.meta_capi_token);
      if (!RETRYABLE.has(response.status)) break;
    } catch (error) {
      lastStatus = null;
      lastError = safeError(error instanceof Error ? error.message : "falha de rede", settings.meta_capi_token);
    }
    if (attempts < maxAttempts) await new Promise((r) => setTimeout(r, 400 * attempts));
  }

  return { ok: false, status: lastStatus, error: lastError, attempts };
}

/** Nunca deixa o token vazar em mensagens de erro. */
function safeError(message: string, token: string | null) {
  let text = message;
  if (token) text = text.split(token).join("[REDACTED]");
  return text.replace(/access_token=[^&"\s]+/gi, "access_token=[REDACTED]").slice(0, 500);
}

/* ------------------------------------------------------------------ */
/* Log de eventos                                                      */
/* ------------------------------------------------------------------ */

export async function logMetaEvent(entry: {
  event_name: string;
  event_id: string;
  product_id?: string | null | undefined;
  order_id?: string | null | undefined;
  pixel_sent?: boolean | undefined;
  capi: CapiResult;
  test_event?: boolean | undefined;
  event_source_url?: string | null | undefined;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const capiStatus = entry.capi.skipped ? "skipped" : entry.capi.ok ? "success" : "error";
  await supabaseAdmin.from("meta_event_log").insert({
    event_name: entry.event_name,
    event_id: entry.event_id,
    product_id: entry.product_id ?? null,
    order_id: entry.order_id ?? null,
    pixel_sent: entry.pixel_sent ?? false,
    capi_status: capiStatus,
    http_status: entry.capi.status,
    error_message: entry.capi.error ?? entry.capi.skipped ?? null,
    attempts: entry.capi.attempts,
    test_event: entry.test_event ?? false,
    event_source_url: entry.event_source_url ?? null,
  } as never);
}
