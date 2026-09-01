/** IDs de pixels/analytics resolvidos para uma página (global ou por produto). */
export type TrackingIds = {
  meta_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  ga_measurement_id: string | null;
};

/** Configuração de tracking que PODE ir para o navegador (sem segredos). */
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

export const EMPTY_PUBLIC_TRACKING: PublicTrackingConfig = {
  meta_enabled: false,
  meta_pixel_id: null,
  meta_capi_ready: false,
  utmify_enabled: false,
  utmify_pixel_id: null,
  utmify_pixel_script: null,
  utmify_utm_script: null,
  utmify_checkout_params: [],
};

export type AppSettings = {
  timezone: string;
  currency: string;
  meta_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  ga_measurement_id: string | null;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  timezone: "America/Sao_Paulo",
  currency: "BRL",
  meta_pixel_id: null,
  tiktok_pixel_id: null,
  ga_measurement_id: null,
};

const clean = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text ? text : null;
};

export function normalizeAppSettings(row: Record<string, unknown> | null | undefined): AppSettings {
  if (!row) return DEFAULT_APP_SETTINGS;
  return {
    timezone: clean(row["timezone"]) ?? DEFAULT_APP_SETTINGS.timezone,
    currency: clean(row["currency"]) ?? DEFAULT_APP_SETTINGS.currency,
    meta_pixel_id: clean(row["meta_pixel_id"]),
    tiktok_pixel_id: clean(row["tiktok_pixel_id"]),
    ga_measurement_id: clean(row["ga_measurement_id"]),
  };
}

/** Produto com "usar tracking global" ligado herda os IDs globais. */
export function resolveTrackingIds(
  product: {
    tracking_use_global?: boolean | null;
    meta_pixel_id?: string | null;
    tiktok_pixel_id?: string | null;
    ga_measurement_id?: string | null;
  },
  global: AppSettings,
): TrackingIds {
  if (product.tracking_use_global !== false) {
    return {
      meta_pixel_id: global.meta_pixel_id,
      tiktok_pixel_id: global.tiktok_pixel_id,
      ga_measurement_id: global.ga_measurement_id,
    };
  }
  return {
    meta_pixel_id: clean(product.meta_pixel_id),
    tiktok_pixel_id: clean(product.tiktok_pixel_id),
    ga_measurement_id: clean(product.ga_measurement_id),
  };
}

export function formatMoney(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value) || 0);
}
