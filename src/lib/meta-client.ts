/**
 * Sinais Meta no navegador (sem nenhum segredo).
 *
 * O Pixel e a Conversions API compartilham o MESMO event_id para que a Meta
 * deduplique os dois envios do mesmo evento lógico.
 */

const FBC_KEY = "vt_fbc";
const isBrowser = () => typeof window !== "undefined";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** IDs legíveis: vc_..., ic_..., pv_..., purchase_{order_id}. */
export function newEventId(prefix: string) {
  return `${prefix}_${uuid().replace(/-/g, "").slice(0, 24)}`;
}

export function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Cookie _fbp criado pelo próprio Pixel. Não é inventado quando ausente. */
export function getFbp(): string | null {
  return readCookie("_fbp");
}

/**
 * _fbc conforme especificação da Meta: `fb.1.{timestamp}.{fbclid}`.
 * Usa o cookie quando o Pixel já o criou; caso contrário deriva do fbclid da
 * URL e persiste para as próximas páginas. Sem fbclid, não existe fbc.
 */
export function getFbc(): string | null {
  if (!isBrowser()) return null;
  const cookie = readCookie("_fbc");
  if (cookie) return cookie;

  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (fbclid) {
    const value = `fb.1.${Date.now()}.${fbclid}`;
    try {
      window.localStorage.setItem(FBC_KEY, value);
    } catch {
      /* storage bloqueado */
    }
    return value;
  }

  try {
    return window.localStorage.getItem(FBC_KEY);
  } catch {
    return null;
  }
}

export type MetaBridgeEvent = {
  event_name: "PageView" | "ViewContent" | "InitiateCheckout" | "AddToCart" | "Search";
  event_id: string;
  product_id?: string | null;
  pixel_sent?: boolean;
  num_items?: number;
  /** Valor total real da seleção (kit/variação). */
  value?: number;
};

/**
 * Envia o evento para a nossa rota server-side, que repassa à CAPI.
 * Nunca bloqueia a navegação nem o clique em "Comprar agora".
 */
export function sendMetaServerEvent(event: MetaBridgeEvent) {
  if (!isBrowser()) return;
  const body = JSON.stringify({
    ...event,
    product_id: event.product_id ?? null,
    event_source_url: window.location.href.slice(0, 600),
    fbp: getFbp(),
    fbc: getFbc(),
    visitor_id: (() => {
      try {
        return window.localStorage.getItem("vt_visitor_id");
      } catch {
        return null;
      }
    })(),
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/public/meta-event", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* cai no fetch */
  }
  void fetch("/api/public/meta-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
