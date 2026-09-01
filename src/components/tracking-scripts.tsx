import { useEffect } from "react";

import type { PublicTrackingConfig, TrackingIds } from "@/lib/tracking";

/**
 * Carrega Meta Pixel, TikTok Pixel e Google Analytics apenas quando o ID
 * correspondente estiver configurado. Purchase NUNCA é disparado aqui:
 * a venda só é registrada com confirmação real do backend/webhook.
 */

declare global {
  interface Window {
    pixelId?: string;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    ttq?: { track?: (...args: unknown[]) => void; page?: () => void };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function loadScript(src: string, id: string, attrs: Record<string, string> = {}) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.async = true;
  script.defer = true;
  script.src = src;
  script.id = id;
  for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value);
  document.head.appendChild(script);
}

function initMeta(pixelId: string, pageViewEventId?: string) {
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      const self = fbq as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
      if (self.callMethod) self.callMethod(...args);
      else self.queue.push(args);
    };
    (fbq as unknown as { queue: unknown[] }).queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
    loadScript("https://connect.facebook.net/en_US/fbevents.js", "meta-pixel");
  }
  window.fbq?.("init", pixelId);
  // eventID permite deduplicar o PageView com o envio da Conversions API.
  window.fbq?.("track", "PageView", {}, pageViewEventId ? { eventID: pageViewEventId } : undefined);
}

function initTikTok(pixelId: string) {
  if (!window.ttq) {
    const queue: unknown[] = [];
    window.ttq = {
      track: (...args: unknown[]) => {
        queue.push(["track", ...args]);
      },
      page: () => {
        queue.push(["page"]);
      },
    };
  }
  loadScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${pixelId}&lib=ttq`, "tiktok-pixel");
  window.ttq?.page?.();
}

function initGA(measurementId: string) {
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`, "ga-script");
  window.dataLayer = window.dataLayer || [];
  const gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", measurementId);
}

export type PixelProduct = {
  id: string;
  name: string;
  price: number;
  currency?: string;
};

export function firePixelViewContent(product: PixelProduct, eventId?: string) {
  const currency = product.currency ?? "BRL";
  window.fbq?.(
    "track",
    "ViewContent",
    {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      contents: [{ id: product.id, quantity: 1, item_price: product.price }],
      value: product.price,
      currency,
    },
    eventId ? { eventID: eventId } : undefined,
  );
  window.ttq?.track?.("ViewContent", {
    content_id: product.id,
    content_name: product.name,
    value: product.price,
    currency,
  });
  window.gtag?.("event", "view_item", {
    currency,
    value: product.price,
    items: [{ item_id: product.id, item_name: product.name, price: product.price }],
  });
}

export function firePixelInitiateCheckout(product: PixelProduct, eventId?: string) {
  const currency = product.currency ?? "BRL";
  window.fbq?.(
    "track",
    "InitiateCheckout",
    {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      contents: [{ id: product.id, quantity: 1, item_price: product.price }],
      num_items: 1,
      value: product.price,
      currency,
    },
    eventId ? { eventID: eventId } : undefined,
  );
  window.ttq?.track?.("InitiateCheckout", {
    content_id: product.id,
    content_name: product.name,
    value: product.price,
    currency,
  });
  window.gtag?.("event", "begin_checkout", {
    currency,
    value: product.price,
    items: [{ item_id: product.id, item_name: product.name, price: product.price }],
  });
}

/**
 * Scripts da UTMify. Carregados somente quando a integração está ativa e
 * apenas uma vez por sessão de página (o id do script evita duplicação em
 * navegação SPA / rerender).
 */
function UtmifyScripts({ config }: { config: PublicTrackingConfig }) {
  const { utmify_enabled: enabled, utmify_pixel_id: pixelId, utmify_pixel_script: pixelSrc, utmify_utm_script: utmSrc } =
    config;

  useEffect(() => {
    if (!enabled || !utmSrc) return;
    loadScript(utmSrc, "utmify-utms", {
      "data-utmify-prevent-xcod-sck": "",
      "data-utmify-prevent-subids": "",
    });
  }, [enabled, utmSrc]);

  useEffect(() => {
    if (!enabled || !pixelId || !pixelSrc) return;
    window.pixelId = pixelId;
    loadScript(pixelSrc, "utmify-pixel");
  }, [enabled, pixelId, pixelSrc]);

  return null;
}

export function TrackingScripts({
  ids,
  config,
  pageViewEventId,
}: {
  ids: TrackingIds;
  config: PublicTrackingConfig;
  pageViewEventId?: string;
}) {
  const { meta_pixel_id: meta, tiktok_pixel_id: tiktok, ga_measurement_id: ga } = ids;

  useEffect(() => {
    if (meta) initMeta(meta, pageViewEventId);
  }, [meta, pageViewEventId]);

  useEffect(() => {
    if (tiktok) initTikTok(tiktok);
  }, [tiktok]);

  useEffect(() => {
    if (ga) initGA(ga);
  }, [ga]);

  return  <UtmifyScripts config= {config} />;
}
