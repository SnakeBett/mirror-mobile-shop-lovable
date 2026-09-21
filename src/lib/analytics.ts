/**
 * Analytics próprio (sem cookies de terceiros).
 *
 * - Identificadores anônimos: visitor_id (persistente) e session_id (por sessão).
 * - Atribuição: guarda first touch e last touch separadamente.
 * - Envio assíncrono via sendBeacon (não bloqueia navegação nem redirecionamento).
 */

import { getFbc, getFbp } from "./meta-client";

export type AnalyticsEventName =
  | "page_view"
  | "product_view"
  | "view_content"
  | "click_buy"
  | "begin_checkout"
  | "view_recommendation"
  | "click_recommendation"
  | "offer_view"
  | "offer_click"
  | "coupon_copy";

export type Attribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  click_id: string | null;
  click_source: string | null;
  referrer: string | null;
};

const VISITOR_KEY = "vt_visitor_id";
const SESSION_KEY = "vt_session_id";
const FIRST_KEY = "vt_attr_first";
const LAST_KEY = "vt_attr_last";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const CLICK_KEYS = ["fbclid", "gclid", "ttclid"] as const;

const isBrowser = () => typeof window !== "undefined";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readStore(store: Storage | null, key: string) {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStore(store: Storage | null, key: string, value: string) {
  try {
    store?.setItem(key, value);
  } catch {
    /* modo privado / storage bloqueado */
  }
}

function local() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function session() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getVisitorId(): string {
  if (!isBrowser()) return "";
  const existing = readStore(local(), VISITOR_KEY);
  if (existing) return existing;
  const id = uuid();
  writeStore(local(), VISITOR_KEY, id);
  return id;
}

export function getSessionId(): string {
  if (!isBrowser()) return "";
  const existing = readStore(session(), SESSION_KEY);
  if (existing) return existing;
  const id = uuid();
  writeStore(session(), SESSION_KEY, id);
  return id;
}

export function getDeviceType(): "mobile" | "tablet" | "desktop" {
  if (!isBrowser()) return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

const EMPTY: Attribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  click_id: null,
  click_source: null,
  referrer: null,
};

function parseStored(raw: string | null): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Attribution>;
    return { ...EMPTY, ...parsed };
  } catch {
    return null;
  }
}

function attributionFromUrl(): Attribution | null {
  const params = new URLSearchParams(window.location.search);
  const attr: Attribution = { ...EMPTY };
  let found = false;

  for (const key of UTM_KEYS) {
    const value = (params.get(key) ?? "").trim().slice(0, 160);
    if (value) {
      attr[key] = value;
      found = true;
    }
  }
  for (const key of CLICK_KEYS) {
    const value = (params.get(key) ?? "").trim().slice(0, 250);
    if (value) {
      attr.click_id = value;
      attr.click_source = key;
      found = true;
      break;
    }
  }

  const referrer = (document.referrer || "").slice(0, 500);
  const sameHost = referrer.includes(window.location.host);
  if (referrer && !sameHost) {
    attr.referrer = referrer;
    found = true;
  }

  return found ? attr : null;
}

/**
 * Captura UTMs/click ids da URL atual e mantém first touch e last touch.
 * Navegar para outro produto não perde a atribuição original.
 */
export function captureAttribution(): { first: Attribution; last: Attribution } {
  if (!isBrowser()) return { first: EMPTY, last: EMPTY };

  const incoming = attributionFromUrl();
  const storedFirst = parseStored(readStore(local(), FIRST_KEY));
  const storedLast = parseStored(readStore(session(), LAST_KEY)) ?? storedFirst;

  if (incoming) {
    if (!storedFirst) writeStore(local(), FIRST_KEY, JSON.stringify(incoming));
    writeStore(session(), LAST_KEY, JSON.stringify(incoming));
    return { first: storedFirst ?? incoming, last: incoming };
  }

  return { first: storedFirst ?? EMPTY, last: storedLast ?? EMPTY };
}

export function getAttribution() {
  return captureAttribution();
}

type TrackPayload = {
  product_id?: string | null;
  recommended_product_id?: string | null;
  offer_id?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

const sent = new Set<string>();

/** Envia o evento sem bloquear a navegação. Repetições idênticas na mesma sessão são ignoradas. */
export function track(event: AnalyticsEventName, payload: TrackPayload = {}, options: { once?: string } = {}) {
  if (!isBrowser()) return;
  if (options.once) {
    if (sent.has(options.once)) return;
    sent.add(options.once);
  }

  const { first, last } = captureAttribution();
  const body = JSON.stringify({
    event_name: event,
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    product_id: payload.product_id ?? null,
    recommended_product_id: payload.recommended_product_id ?? null,
    offer_id: payload.offer_id ?? null,
    path: window.location.pathname.slice(0, 300),
    referrer: last.referrer ?? (document.referrer || null),
    device_type: getDeviceType(),
    utm_source: last.utm_source,
    utm_medium: last.utm_medium,
    utm_campaign: last.utm_campaign,
    utm_content: last.utm_content,
    utm_term: last.utm_term,
    click_id: last.click_id,
    click_source: last.click_source,
    first_utm_source: first.utm_source,
    first_utm_medium: first.utm_medium,
    first_utm_campaign: first.utm_campaign,
    metadata: payload.metadata ?? null,
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/public/track", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* cai no fetch abaixo */
  }

  void fetch("/api/public/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/** Contexto de atribuição usado para montar a URL final do checkout. */
export type CheckoutTrackingContext = {
  visitor_id: string;
  session_id: string;
  first: Attribution;
  last: Attribution;
  fbp: string | null;
  fbc: string | null;
};

export function getCheckoutTrackingContext(): CheckoutTrackingContext {
  const { first, last } = captureAttribution();
  return {
    visitor_id: getVisitorId(),
    session_id: getSessionId(),
    first,
    last,
    fbp: getFbp(),
    fbc: getFbc(),
  };
}

/**
 * Monta a URL final do checkout preservando a atribuição.
 *
 * Regras: usa URL/URLSearchParams (nunca concatenação) e NUNCA sobrescreve um
 * parâmetro que já exista na checkout_url original.
 * `extraParams` recebe os parâmetros exigidos pela integração externa
 * (ex.: UTMify) conforme configurados no admin.
 */
export function buildCheckoutUrl(
  url: string,
  ctx: CheckoutTrackingContext,
  extraParams: string[] = [],
  sourceParams?: URLSearchParams,
): string {
  if (!url.trim()) return url;
  const base = typeof window !== "undefined" ? window.location.origin : "https://localhost";
  try {
    const parsed = new URL(url, base);
    const setIfAbsent = (key: string, value: string | null | undefined) => {
      if (!value) return;
      if (parsed.searchParams.has(key)) return;
      parsed.searchParams.set(key, value);
    };

    setIfAbsent("vid", ctx.visitor_id);
    setIfAbsent("sid", ctx.session_id);
    for (const key of UTM_KEYS) setIfAbsent(key, ctx.last[key]);
    setIfAbsent("first_utm_source", ctx.first.utm_source);
    setIfAbsent("first_utm_campaign", ctx.first.utm_campaign);

    // Identificadores de clique de anúncio (Meta/Google/TikTok).
    if (ctx.last.click_id && ctx.last.click_source) setIfAbsent(ctx.last.click_source, ctx.last.click_id);
    setIfAbsent("fbp", ctx.fbp);
    setIfAbsent("fbc", ctx.fbc);

    // Parâmetros adicionais exigidos pela integração externa configurada.
    const source =
      sourceParams ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
    for (const key of extraParams) {
      const name = key.trim();
      if (!name) continue;
      setIfAbsent(name, source?.get(name) ?? null);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/** Compatibilidade com o uso anterior. */
export function appendCheckoutTracking(url: string, extraParams: string[] = []): string {
  if (!isBrowser() || !url.trim()) return url;
  return buildCheckoutUrl(url, getCheckoutTrackingContext(), extraParams);
}
