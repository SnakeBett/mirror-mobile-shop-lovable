import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { buildTree, listCategories } from "@/lib/categories";
import { currencyBRL } from "@/lib/sales-queries";
import { pctChange } from "@/lib/analytics-queries";

type Range = { from: string; to: string };

type ProductSales = {
  product_id: string;
  product_name: string;
  slug: string;
  category_id: string | null;
  subcategory_id: string | null;
  sales: number;
  revenue: number;
  orders_total: number;
  refunded: number;
};

type Agg = { sales: number; revenue: number; orders: number; refunded: number };

async function fetchSales(range: Range): Promise<ProductSales[]> {
  const { data, error } = await supabase.rpc("admin_product_sales_by_category" as never, {
    _from: range.from,
    _to: range.to,
  } as never);
  if (error) throw error;
  return ((data ?? []) as unknown as ProductSales[]).map((row) => ({
    ...row,
    sales: Number(row.sales),
    revenue: Number(row.revenue),
    orders_total: Number(row.orders_total),
    refunded: Number(row.refunded),
  }));
}

const NONE = "__none__";
const sum = (rows: ProductSales[]): Agg =>
  rows.reduce(
    (acc, row) => ({
      sales: acc.sales + row.sales,
      revenue: acc.revenue + row.revenue,
      orders: acc.orders + row.orders_total,
      refunded: acc.refunded + row.refunded,
    }),
    { sales: 0, revenue: 0, orders: 0, refunded: 0 },
  );
const ticket = (agg: Agg) => (agg.sales > 0 ? agg.revenue / agg.sales : 0);

type RankBy = "revenue" | "sales" | "ticket";

function Delta({ current, previous }: { current: number; previous: number }) {
  const value = previous > 0 ? pctChange(current, previous) : null;
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span className={`text-xs ${up ? "text-emerald-600" : "text-destructive"}`}>
      {up ? "↑" : "↓"} {Math.abs(value).toFixed(1).replace(".", ",")}%
    </span>
  );
}

export function CategoryPerformance({ range, prev }: { range: Range; prev: Range }) {
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listCategories });
  const current = useQuery({ queryKey: ["admin", "cat-sales", range], queryFn: () => fetchSales(range) });
  const previous = useQuery({ queryKey: ["admin", "cat-sales", prev], queryFn: () => fetchSales(prev) });

  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [product, setProduct] = useState("");
  const [rankBy, setRankBy] = useState<RankBy>("revenue");
  const [chartBy, setChartBy] = useState<"revenue" | "sales">("revenue");
  const [open, setOpen] = useState<string | null>(null);

  const tree = buildTree(categories.data ?? []);
  const nameOf = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data],
  );
  const subs = tree.find((root) => root.id === cat)?.children ?? [];

  const applyFilters = (rows: ProductSales[]) =>
    rows.filter((row) => {
      if (cat === NONE && row.category_id) return false;
      if (cat && cat !== NONE && row.category_id !== cat) return false;
      if (sub && row.subcategory_id !== sub) return false;
      if (product && row.product_id !== product) return false;
      return true;
    });

  const rows = applyFilters(current.data ?? []);
  const prevRows = applyFilters(previous.data ?? []);
  const total = sum(rows);

  const groups = useMemo(() => {
    const map = new Map<string, ProductSales[]>();
    for (const row of rows) {
      const key = row.category_id ?? NONE;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    const prevMap = new Map<string, Agg>();
    const prevGroups = new Map<string, ProductSales[]>();
    for (const row of prevRows) {
      const key = row.category_id ?? NONE;
      prevGroups.set(key, [...(prevGroups.get(key) ?? []), row]);
    }
    for (const [key, list] of prevGroups) prevMap.set(key, sum(list));
    const list = [...map.entries()].map(([key, items]) => {
      const agg = sum(items);
      const champion = [...items].sort((a, b) => b.sales - a.sales || b.revenue - a.revenue)[0];
      return { key, name: key === NONE ? "Sem categoria" : (nameOf.get(key) ?? "Categoria"), agg, items, champion, prev: prevMap.get(key) };
    });
    const metric = (agg: Agg) => (rankBy === "revenue" ? agg.revenue : rankBy === "sales" ? agg.sales : ticket(agg));
    return list.sort((a, b) => metric(b.agg) - metric(a.agg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.data, previous.data, cat, sub, product, rankBy, nameOf]);

  const topProducts = [...rows].sort((a, b) => b.revenue - a.revenue || b.sales - a.sales).slice(0, 10);
  const chartMax = Math.max(1, ...groups.map((g) => (chartBy === "revenue" ? g.agg.revenue : g.agg.sales)));
  const productOptions = applyFilters((current.data ?? []).map((r) => r)).filter(() => true);
  const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";
  const loading = current.isLoading || categories.isLoading;

  return (
    <section className="mt-6 space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Desempenho por categoria</h2>
        <div className="flex flex-wrap gap-2">
          <select
            className={selectClass}
            aria-label="Categoria"
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setSub("");
              setProduct("");
            }}
          >
            <option value="">Todas as categorias</option>
            {tree.map((root) => (
              <option key={root.id} value={root.id}>{root.name}</option>
            ))}
            <option value={NONE}>Sem categoria</option>
          </select>
          {subs.length > 0 && (
            <select className={selectClass} aria-label="Subcategoria" value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">Todas as subcategorias</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <select className={selectClass} aria-label="Produto" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Todos os produtos</option>
            {(product ? (current.data ?? []).filter((r) => r.product_id === product) : productOptions).map((r) => (
              <option key={r.product_id} value={r.product_id}>{r.product_name}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Vendas = somente pedidos pagos. Pedidos = todos os pedidos do período. Os filtros valem para esta seção.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(
          [
            ["Faturamento bruto", currencyBRL.format(total.revenue)],
            ["Reembolsos", currencyBRL.format(total.refunded)],
            ["Faturamento líquido", currencyBRL.format(total.revenue - total.refunded)],
            ["Vendas / Pedidos", `${total.sales} / ${total.orders}`],
            ["Ticket médio", currencyBRL.format(ticket(total))],
          ] as Array<[string, string]>
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-base font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!loading && groups.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">Nenhum pedido no período selecionado.</p>
      )}

      {groups.length > 0 && (
        <>
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Faturamento por categoria
              </h3>
              <div className="flex gap-1">
                <Button size="sm" variant={chartBy === "revenue" ? "secondary" : "ghost"} onClick={() => setChartBy("revenue")}>
                  Faturamento
                </Button>
                <Button size="sm" variant={chartBy === "sales" ? "secondary" : "ghost"} onClick={() => setChartBy("sales")}>
                  Vendas
                </Button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {groups.map((g) => {
                const value = chartBy === "revenue" ? g.agg.revenue : g.agg.sales;
                return (
                  <div key={g.key} className="grid grid-cols-[120px_1fr_auto] items-center gap-2 text-xs">
                    <span className="truncate text-foreground">{g.name}</span>
                    <div className="h-3 rounded bg-muted">
                      <div className="h-3 rounded bg-primary/80" style={{ width: `${(value / chartMax) * 100}%` }} />
                    </div>
                    <span className="text-muted-foreground">
                      {chartBy === "revenue" ? currencyBRL.format(value) : `${value} vendas`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top categorias</h3>
              <div className="flex gap-1">
                {(
                  [
                    ["revenue", "Faturamento"],
                    ["sales", "Vendas"],
                    ["ticket", "Ticket médio"],
                  ] as Array<[RankBy, string]>
                ).map(([key, label]) => (
                  <Button key={key} size="sm" variant={rankBy === key ? "secondary" : "ghost"} onClick={() => setRankBy(key)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {groups.map((g, index) => {
                const expanded = open === g.key;
                const subGroups = new Map<string, ProductSales[]>();
                for (const item of g.items) {
                  const key = item.subcategory_id ?? NONE;
                  subGroups.set(key, [...(subGroups.get(key) ?? []), item]);
                }
                return (
                  <div key={g.key} className="rounded-lg border border-border">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 p-3 text-left"
                      onClick={() => setOpen(expanded ? null : g.key)}
                    >
                      <span className="w-5 text-xs text-muted-foreground">{index + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{g.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {g.agg.sales} vendas · {g.agg.orders} pedidos · ticket {currencyBRL.format(ticket(g.agg))}
                          {g.champion && g.champion.sales > 0 && ` · campeão: ${g.champion.product_name}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{currencyBRL.format(g.agg.revenue)}</p>
                        <Delta current={g.agg.revenue} previous={g.prev?.revenue ?? 0} />
                      </div>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded && (
                      <div className="space-y-4 border-t border-border p-3">
                        {g.champion && g.champion.sales > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Produto campeão: <span className="font-medium text-foreground">{g.champion.product_name}</span> —{" "}
                            {g.champion.sales} vendas · {currencyBRL.format(g.champion.revenue)}
                          </p>
                        )}
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground">Ranking de produtos</h4>
                          <ol className="mt-1 divide-y divide-border">
                            {[...g.items]
                              .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue)
                              .map((item, i) => (
                                <li key={item.product_id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                                  <Link
                                    to="/admin/produtos/$id"
                                    params={{ id: item.product_id }}
                                    className="min-w-0 flex-1 truncate hover:underline"
                                  >
                                    {i + 1}. {item.product_name}
                                  </Link>
                                  <span className="text-xs text-muted-foreground">
                                    {item.sales} vendas · {currencyBRL.format(item.revenue)}
                                  </span>
                                </li>
                              ))}
                          </ol>
                        </div>
                        {g.key !== NONE && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground">Subcategorias</h4>
                            <ul className="mt-1 divide-y divide-border">
                              {[...subGroups.entries()]
                                .map(([key, items]) => ({ key, agg: sum(items) }))
                                .sort((a, b) => b.agg.revenue - a.agg.revenue)
                                .map(({ key, agg }) => (
                                  <li key={key} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                                    <span>{key === NONE ? "Sem subcategoria" : (nameOf.get(key) ?? "—")}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {agg.sales} vendas · {currencyBRL.format(agg.revenue)}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Kits e variações mais vendidos aparecem aqui quando os pedidos pagos passarem a registrar o kit
                          e a variação escolhidos. Hoje o checkout externo não envia esses dados, então não mostramos números.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top produtos</h3>
            <div className="mt-2 divide-y divide-border">
              {topProducts.map((row) => (
                <div key={row.product_id} className="grid grid-cols-[1fr_auto] gap-2 py-2 text-sm md:grid-cols-[1fr_140px_auto]">
                  <Link to="/admin/produtos/$id" params={{ id: row.product_id }} className="truncate hover:underline">
                    {row.product_name}
                  </Link>
                  <span className="hidden truncate text-xs text-muted-foreground md:block">
                    {row.category_id ? nameOf.get(row.category_id) : "Sem categoria"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.sales} vendas · {currencyBRL.format(row.revenue)} · ticket{" "}
                    {currencyBRL.format(row.sales > 0 ? row.revenue / row.sales : 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
