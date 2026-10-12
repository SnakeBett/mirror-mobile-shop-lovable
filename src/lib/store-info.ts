/** Informações globais da loja (guardadas em app_settings.store_info). */
export type StoreInfo = {
  name: string;
  logo_path: string | null;
  verified: boolean;
  sold_count: number | null;
  recommend_pct: number | null;
  trust_pct: number | null;
  ontime_pct: number | null;
  reply24_pct: number | null;
  show_verified: boolean;
  show_sold: boolean;
  show_recommend: boolean;
  show_trust: boolean;
  show_ontime: boolean;
  show_reply24: boolean;
};

export type PublicStoreInfo = StoreInfo & { logo_url: string | null };

export const DEFAULT_STORE_INFO: StoreInfo = {
  name: "",
  logo_path: null,
  verified: false,
  sold_count: null,
  recommend_pct: null,
  trust_pct: null,
  ontime_pct: null,
  reply24_pct: null,
  show_verified: true,
  show_sold: true,
  show_recommend: true,
  show_trust: true,
  show_ontime: true,
  show_reply24: true,
};

function pct(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function int(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeStoreInfo(raw: unknown): StoreInfo {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (key: keyof StoreInfo) =>
    typeof r[key] === "boolean" ? (r[key] as boolean) : (DEFAULT_STORE_INFO[key] as boolean);
  return {
    name: typeof r["name"] === "string" ? r["name"].trim() : "",
    logo_path: typeof r["logo_path"] === "string" && r["logo_path"] ? r["logo_path"] : null,
    verified: r["verified"] === true,
    sold_count: int(r["sold_count"]),
    recommend_pct: pct(r["recommend_pct"]),
    trust_pct: pct(r["trust_pct"]),
    ontime_pct: pct(r["ontime_pct"]),
    reply24_pct: pct(r["reply24_pct"]),
    show_verified: bool("show_verified"),
    show_sold: bool("show_sold"),
    show_recommend: bool("show_recommend"),
    show_trust: bool("show_trust"),
    show_ontime: bool("show_ontime"),
    show_reply24: bool("show_reply24"),
  };
}

/** 350 → "350"; 1500 → "1,5 mil"; 351400 → "351,4 mil"; 2500000 → "2,5 mi". */
export function formatSold(count: number): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.floor(n * 10) / 10);
  if (count >= 1_000_000) return `${fmt(count / 1_000_000)} mi`;
  if (count >= 1000) return `${fmt(count / 1000)} mil`;
  return String(count);
}

/** O card só aparece quando há nome da loja. */
export function hasStoreCard(info: StoreInfo | null | undefined) {
  return !!info && info.name.trim().length > 0;
}
