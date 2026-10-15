import { supabase } from "@/integrations/supabase/client";
import { resolveImageUrls } from "./storage-images";

export type OrderStatus = "pending" | "paid" | "cancelled" | "refunded";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export type OrderRow = {
  id: string;
  external_order_id: string;
  product_id: string | null;
  amount: number;
  status: OrderStatus;
  customer_name: string | null;
  customer_email: string | null;
  payment_method: string | null;
  is_test: boolean;
  paid_at: string | null;
  created_at: string;
  shipping_amount?: number | null;
  shipping_method_name?: string | null;
  coupon_discount?: number | null;
  shipping_address?: { cep?: string; street?: string; number?: string; complement?: string; district?: string; city?: string; state?: string } | null;
  metadata?: { quantity?: number; kit_name?: string | null; variant_labels?: string[]; product_discount?: number } | null;
};

export type SalesRange = { from: string; to: string };

/** Intervalo de dias terminando agora (inclui o dia corrente). */
export function rangeForDays(days: number): SalesRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (Math.max(1, days) - 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function rangeFromDates(fromDate: string, toDate: string): SalesRange {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T23:59:59.999`);
  return { from: from.toISOString(), to: to.toISOString() };
}

export type SalesSummary = {
  orders_count: number;
  revenue: number;
  avg_ticket: number;
  top_product_id: string | null;
  top_product_name: string | null;
};

export async function getSalesSummary(range: SalesRange): Promise<SalesSummary> {
  const { data, error } = await supabase.rpc("admin_sales_summary", {
    _from: range.from,
    _to: range.to,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    orders_count: Number(row?.orders_count ?? 0),
    revenue: Number(row?.revenue ?? 0),
    avg_ticket: Number(row?.avg_ticket ?? 0),
    top_product_id: row?.top_product_id ?? null,
    top_product_name: row?.top_product_name ?? null,
  };
}

/** Resumos de hoje, 7 e 30 dias em uma única chamada agregada por período. */
export async function getDashboardSales() {
  const [today, week, month] = await Promise.all([
    getSalesSummary(rangeForDays(1)),
    getSalesSummary(rangeForDays(7)),
    getSalesSummary(rangeForDays(30)),
  ]);
  return { today, week, month };
}

export type ProductSalesRow = {
  product_id: string | null;
  product_name: string | null;
  slug: string | null;
  orders_count: number;
  revenue: number;
  avg_ticket: number;
  thumbnail: string | null;
};

export async function getSalesByProduct(range: SalesRange): Promise<ProductSalesRow[]> {
  const { data, error } = await supabase.rpc("admin_sales_by_product", {
    _from: range.from,
    _to: range.to,
  });
  if (error) throw error;

  const rows = (data ?? []) as Array<Omit<ProductSalesRow, "thumbnail">>;
  const ids = rows.map((row) => row.product_id).filter((id): id is string => Boolean(id));

  const thumbs: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: images } = await supabase
      .from("product_images")
      .select("product_id, image_url, sort_order")
      .in("product_id", ids)
      .order("sort_order");
    const main = new Map<string, string>();
    for (const image of images ?? []) {
      if (!main.has(image.product_id)) main.set(image.product_id, image.image_url);
    }
    const resolved = await resolveImageUrls(supabase, [...main.values()]);
    for (const [id, path] of main) thumbs[id] = resolved[path] ?? "";
  }

  return rows.map((row) => ({
    ...row,
    orders_count: Number(row.orders_count),
    revenue: Number(row.revenue),
    avg_ticket: Number(row.avg_ticket),
    thumbnail: row.product_id ? (thumbs[row.product_id] || null) : null,
  }));
}

export type DailySalesRow = { day: string; orders_count: number; revenue: number };

export async function getSalesDaily(range: SalesRange): Promise<DailySalesRow[]> {
  const { data, error } = await supabase.rpc("admin_sales_daily", {
    _from: range.from,
    _to: range.to,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    day: String(row.day),
    orders_count: Number(row.orders_count),
    revenue: Number(row.revenue),
  }));
}

export type ProductPerformance = {
  orders_total: number;
  revenue_total: number;
  orders_7d: number;
  revenue_7d: number;
  orders_30d: number;
  revenue_30d: number;
};

export async function getProductPerformance(productId: string): Promise<ProductPerformance> {
  const { data, error } = await supabase.rpc("admin_product_performance", { _product_id: productId });
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    orders_total: Number(row?.orders_total ?? 0),
    revenue_total: Number(row?.revenue_total ?? 0),
    orders_7d: Number(row?.orders_7d ?? 0),
    revenue_7d: Number(row?.revenue_7d ?? 0),
    orders_30d: Number(row?.orders_30d ?? 0),
    revenue_30d: Number(row?.revenue_30d ?? 0),
  };
}

export type OrderFilters = {
  search?: string;
  productId?: string;
  status?: OrderStatus | "all";
  from?: string;
  to?: string;
};

export type OrderListItem = OrderRow & { product_name: string | null; gateway_name?: string | null };

export async function listOrders(filters: OrderFilters = {}): Promise<OrderListItem[]> {
  let query = supabase
    .from("orders")
    .select("*, products(name), payment_gateways(name)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (filters.productId && filters.productId !== "all") query = query.eq("product_id", filters.productId);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("created_at", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) query = query.lte("created_at", new Date(`${filters.to}T23:59:59.999`).toISOString());
  const term = (filters.search ?? "").trim();
  if (term) query = query.ilike("external_order_id", `%${term}%`);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const { products, ...order } = row as OrderRow & { products: { name: string } | null };
    return { ...order, amount: Number(order.amount), product_name: products?.name ?? null };
  });
}

export const currencyBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
