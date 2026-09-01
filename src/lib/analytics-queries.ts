import { supabase } from "@/integrations/supabase/client";

import { normalizeAppSettings, type AppSettings } from "./tracking";

/* ------------------------------------------------------------------ */
/* Períodos com fuso horário configurável                              */
/* ------------------------------------------------------------------ */

export type RangePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "custom";

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  "30d": "30 dias",
  this_month: "Este mês",
  last_month: "Mês anterior",
  custom: "Personalizado",
};

export type Range = { from: string; to: string };

/** Deslocamento do fuso (em minutos) para um instante específico. */
function tzOffsetMinutes(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]) === 24 ? 0 : Number(parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return (asUTC - date.getTime()) / 60000;
}

/** Meia-noite (no fuso informado) do dia YYYY-MM-DD, como instante UTC. */
export function startOfDayInTz(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0);
  const offset = tzOffsetMinutes(new Date(guess), timeZone);
  return new Date(guess - offset * 60000);
}

/** Dia atual (YYYY-MM-DD) no fuso configurado. */
export function todayInTz(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(day: string, amount: number) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function monthStart(day: string, deltaMonths = 0) {
  const [y, m] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1 + deltaMonths, 1));
  return date.toISOString().slice(0, 10);
}

/** Intervalo [from, to) do preset, no fuso configurado. */
export function resolveRange(
  preset: RangePreset,
  timeZone: string,
  custom?: { from: string; to: string },
): Range {
  const today = todayInTz(timeZone);
  let firstDay = today;
  let lastDay = today; // inclusivo

  switch (preset) {
    case "today":
      break;
    case "yesterday":
      firstDay = addDays(today, -1);
      lastDay = firstDay;
      break;
    case "7d":
      firstDay = addDays(today, -6);
      break;
    case "30d":
      firstDay = addDays(today, -29);
      break;
    case "this_month":
      firstDay = monthStart(today);
      break;
    case "last_month":
      firstDay = monthStart(today, -1);
      lastDay = addDays(monthStart(today), -1);
      break;
    case "custom":
      firstDay = custom?.from || today;
      lastDay = custom?.to || today;
      break;
  }

  return {
    from: startOfDayInTz(firstDay, timeZone).toISOString(),
    to: startOfDayInTz(addDays(lastDay, 1), timeZone).toISOString(),
  };
}

/** Período imediatamente anterior, com a mesma duração. */
export function previousRange(range: Range): Range {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const span = Math.max(to - from, 1);
  return { from: new Date(from - span).toISOString(), to: new Date(from).toISOString() };
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export const percent = (value: number) =>
  `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/* ------------------------------------------------------------------ */
/* Configurações globais                                               */
/* ------------------------------------------------------------------ */

export async function getAppSettings(): Promise<AppSettings> {
  const { data } = await supabase.from("app_settings").select("*").maybeSingle();
  return normalizeAppSettings(data as Record<string, unknown> | null);
}

export async function updateAppSettings(values: Partial<AppSettings>) {
  const { data: existing } = await supabase.from("app_settings").select("id").maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from("app_settings").update(values as never).eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("app_settings").insert(values as never);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Relatórios                                                          */
/* ------------------------------------------------------------------ */

export type Funnel = {
  product_views: number;
  unique_visitors: number;
  buy_clicks: number;
  checkouts: number;
  purchases: number;
  revenue: number;
};

export async function getFunnel(range: Range): Promise<Funnel> {
  const { data, error } = await supabase.rpc("admin_funnel", { _from: range.from, _to: range.to });
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    product_views: Number(row?.product_views ?? 0),
    unique_visitors: Number(row?.unique_visitors ?? 0),
    buy_clicks: Number(row?.buy_clicks ?? 0),
    checkouts: Number(row?.checkouts ?? 0),
    purchases: Number(row?.purchases ?? 0),
    revenue: Number(row?.revenue ?? 0),
  };
}

export type RevenueBreakdown = {
  gross: number;
  refunded: number;
  net: number;
  cancelled_count: number;
  refunded_count: number;
};

export async function getRevenueBreakdown(range: Range): Promise<RevenueBreakdown> {
  const { data, error } = await supabase.rpc("admin_revenue_breakdown", {
    _from: range.from,
    _to: range.to,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    gross: Number(row?.gross ?? 0),
    refunded: Number(row?.refunded ?? 0),
    net: Number(row?.net ?? 0),
    cancelled_count: Number(row?.cancelled_count ?? 0),
    refunded_count: Number(row?.refunded_count ?? 0),
  };
}

export type ProductConversionRow = {
  product_id: string;
  product_name: string;
  slug: string;
  views: number;
  visitors: number;
  buy_clicks: number;
  checkouts: number;
  orders_count: number;
  revenue: number;
  conversion: number;
};

export async function getProductConversion(range: Range): Promise<ProductConversionRow[]> {
  const { data, error } = await supabase.rpc("admin_product_conversion", {
    _from: range.from,
    _to: range.to,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    product_id: String(row.product_id),
    product_name: String(row.product_name ?? ""),
    slug: String(row.slug ?? ""),
    views: Number(row.views),
    visitors: Number(row.visitors),
    buy_clicks: Number(row.buy_clicks),
    checkouts: Number(row.checkouts),
    orders_count: Number(row.orders_count),
    revenue: Number(row.revenue),
    conversion: Number(row.conversion),
  }));
}

export type TrafficDayRow = {
  day: string;
  visitors: number;
  sessions: number;
  product_views: number;
  buy_clicks: number;
  checkouts: number;
  orders_count: number;
  revenue: number;
};

export async function getTrafficDaily(range: Range, timeZone: string): Promise<TrafficDayRow[]> {
  const { data, error } = await supabase.rpc("admin_traffic_daily", {
    _from: range.from,
    _to: range.to,
    _tz: timeZone,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    day: String(row.day),
    visitors: Number(row.visitors),
    sessions: Number(row.sessions),
    product_views: Number(row.product_views),
    buy_clicks: Number(row.buy_clicks),
    checkouts: Number(row.checkouts),
    orders_count: Number(row.orders_count),
    revenue: Number(row.revenue),
  }));
}

export type ProductFunnel = {
  views: number;
  visitors: number;
  buy_clicks: number;
  checkouts: number;
  orders_count: number;
  revenue: number;
  rec_views: number;
  rec_clicks: number;
};

export async function getProductFunnel(productId: string, range: Range): Promise<ProductFunnel> {
  const { data, error } = await supabase.rpc("admin_product_funnel", {
    _product_id: productId,
    _from: range.from,
    _to: range.to,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    views: Number(row?.views ?? 0),
    visitors: Number(row?.visitors ?? 0),
    buy_clicks: Number(row?.buy_clicks ?? 0),
    checkouts: Number(row?.checkouts ?? 0),
    orders_count: Number(row?.orders_count ?? 0),
    revenue: Number(row?.revenue ?? 0),
    rec_views: Number(row?.rec_views ?? 0),
    rec_clicks: Number(row?.rec_clicks ?? 0),
  };
}

export type SourceRow = {
  source: string;
  visitors: number;
  views: number;
  orders_count: number;
  revenue: number;
};

const SOURCE_LABELS: Record<string, string> = {
  direto: "Direto",
  facebook: "Facebook",
  "facebook.com": "Facebook",
  "m.facebook.com": "Facebook",
  fb: "Facebook",
  instagram: "Instagram",
  "instagram.com": "Instagram",
  ig: "Instagram",
  tiktok: "TikTok",
  "tiktok.com": "TikTok",
  google: "Google",
  "google.com": "Google",
  "www.google.com": "Google",
};

export function sourceLabel(value: string) {
  return SOURCE_LABELS[value] ?? value;
}

export async function getTrafficSources(range: Range, productId?: string): Promise<SourceRow[]> {
  const { data, error } = await supabase.rpc("admin_traffic_sources", {
    _from: range.from,
    _to: range.to,
    ...(productId ? { _product_id: productId } : {}),
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    source: sourceLabel(String(row.source ?? "direto")),
    visitors: Number(row.visitors),
    views: Number(row.views),
    orders_count: Number(row.orders_count),
    revenue: Number(row.revenue),
  }));
}

export type CampaignRow = {
  campaign: string;
  visitors: number;
  views: number;
  orders_count: number;
  revenue: number;
  conversion: number;
};

export async function getCampaigns(range: Range): Promise<CampaignRow[]> {
  const { data, error } = await supabase.rpc("admin_campaigns", { _from: range.from, _to: range.to });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    campaign: String(row.campaign ?? "(sem campanha)"),
    visitors: Number(row.visitors),
    views: Number(row.views),
    orders_count: Number(row.orders_count),
    revenue: Number(row.revenue),
    conversion: Number(row.conversion),
  }));
}

/* ------------------------------------------------------------------ */
/* Alertas ("Atenção")                                                 */
/* ------------------------------------------------------------------ */

export type ProductAlert = { product_id: string; product_name: string; message: string; level: "warn" | "info" };

export function buildAlerts(
  rows: ProductConversionRow[],
  products: Array<{ id: string; name: string; is_active: boolean; checkout_url: string | null; hasImage: boolean }>,
): ProductAlert[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const alerts: ProductAlert[] = [];

  for (const row of rows) {
    const product = byId.get(row.product_id);
    if (row.views >= 100 && row.conversion < 1) {
      alerts.push({
        product_id: row.product_id,
        product_name: row.product_name,
        level: "warn",
        message: `${row.product_name} recebeu ${row.views.toLocaleString("pt-BR")} visualizações e converteu apenas ${percent(row.conversion)}.`,
      });
    }
    if (row.buy_clicks >= 50 && row.orders_count === 0) {
      alerts.push({
        product_id: row.product_id,
        product_name: row.product_name,
        level: "warn",
        message: `${row.product_name} teve ${row.buy_clicks} cliques em comprar e nenhuma venda aprovada.`,
      });
    }
    if (product && !product.is_active && row.views > 0) {
      alerts.push({
        product_id: row.product_id,
        product_name: row.product_name,
        level: "info",
        message: `${row.product_name} está inativo, mas recebeu ${row.views} visualizações.`,
      });
    }
  }

  for (const product of products) {
    if (!(product.checkout_url ?? "").trim()) {
      alerts.push({
        product_id: product.id,
        product_name: product.name,
        level: "warn",
        message: `${product.name} está sem link de checkout configurado.`,
      });
    }
    if (!product.hasImage) {
      alerts.push({
        product_id: product.id,
        product_name: product.name,
        level: "info",
        message: `${product.name} está sem imagem cadastrada.`,
      });
    }
  }

  return alerts.slice(0, 12);
}
