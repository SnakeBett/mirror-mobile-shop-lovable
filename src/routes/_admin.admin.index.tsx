import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useMemo, useState } from "react";

import { getDashboardStats, listProductsWithMeta } from "@/lib/admin-queries";
import { currencyBRL, getSalesSummary, rangeForDays } from "@/lib/sales-queries";
import {
  getAppSettings,
  getFunnel,
  getProductConversion,
  getRevenueBreakdown,
  getTrafficDaily,
  pctChange,
  percent,
  previousRange,
  ratio,
  resolveRange,
  todayInTz,
} from "@/lib/analytics-queries";
import { PeriodPicker, type PeriodState } from "@/components/admin/period-picker";
import { Button } from "@/components/ui/button";
import { CategoryPerformance } from "@/components/admin/category-performance";

type Metric = "revenue" | "orders_count" | "visitors" | "product_views";

const METRIC_LABELS: Record<Metric, string> = {
  revenue: "Faturamento",
  orders_count: "Vendas",
  visitors: "Visitantes",
  product_views: "Visualizações",
};

export const Route = createFileRoute("/_admin/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Vitrine Admin" },
      { name: "description", content: "Faturamento, visitas, conversão e produtos em destaque." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Dashboard | Vitrine Admin" },
      { property: "og:description", content: "Faturamento, visitas, conversão e produtos em destaque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDashboard,
});

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const positive = value >= 0;
  return (
    <span className={`text-xs ${positive ? "text-emerald-600" : "text-destructive"}`}>
      {positive ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function AdminDashboard() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: getDashboardStats });
  const recent = useQuery({
    queryKey: ["admin", "products-meta", ""],
    queryFn: () => listProductsWithMeta(""),
  });
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: getAppSettings });
  const tz = settings.data?.timezone ?? "America/Sao_Paulo";
  const today = todayInTz(tz);

  const [period, setPeriod] = useState<PeriodState>({ preset: "30d", from: today, to: today });
  const [metric, setMetric] = useState<Metric>("revenue");

  const range = useMemo(
    () => resolveRange(period.preset, tz, { from: period.from, to: period.to }),
    [period, tz],
  );
  const prev = useMemo(() => previousRange(range), [range]);

  const todaySales = useQuery({
    queryKey: ["admin", "sales-summary-1"],
    queryFn: () => getSalesSummary(rangeForDays(1)),
  });
  const funnel = useQuery({ queryKey: ["admin", "funnel", range], queryFn: () => getFunnel(range) });
  const funnelPrev = useQuery({ queryKey: ["admin", "funnel", prev], queryFn: () => getFunnel(prev) });
  const revenue = useQuery({
    queryKey: ["admin", "revenue-breakdown", range],
    queryFn: () => getRevenueBreakdown(range),
  });
  const traffic = useQuery({
    queryKey: ["admin", "traffic-daily", range, tz],
    queryFn: () => getTrafficDaily(range, tz),
  });
  const conversion = useQuery({
    queryKey: ["admin", "product-conversion", range],
    queryFn: () => getProductConversion(range),
  });

  const money = (value?: number) => (value == null ? "—" : currencyBRL.format(value));
  const rows = traffic.data ?? [];
  const maxMetric = Math.max(1, ...rows.map((row) => Number(row[metric])));

  const cards: Array<[string, string, number | null]> = [
    [
      "Faturamento",
      money(funnel.data?.revenue),
      pctChange(funnel.data?.revenue ?? 0, funnelPrev.data?.revenue ?? 0),
    ],
    [
      "Vendas",
      funnel.data ? String(funnel.data.purchases) : "—",
      pctChange(funnel.data?.purchases ?? 0, funnelPrev.data?.purchases ?? 0),
    ],
    [
      "Visitantes",
      funnel.data ? funnel.data.unique_visitors.toLocaleString("pt-BR") : "—",
      pctChange(funnel.data?.unique_visitors ?? 0, funnelPrev.data?.unique_visitors ?? 0),
    ],
    [
      "Conversão",
      percent(ratio(funnel.data?.purchases ?? 0, funnel.data?.product_views ?? 0)),
      pctChange(
        ratio(funnel.data?.purchases ?? 0, funnel.data?.product_views ?? 0),
        ratio(funnelPrev.data?.purchases ?? 0, funnelPrev.data?.product_views ?? 0),
      ),
    ],
  ];

  const catalog = [
    ["Produtos", stats.data?.products],
    ["Ativos", stats.data?.active],
    ["Avaliações", stats.data?.reviews],
    ["Imagens", stats.data?.images],
  ] as const;

  const topProducts = [...(conversion.data ?? [])].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <Button asChild size="sm"><Link to="/admin/produtos/novo">+ Novo produto</Link></Button>
      </div>

      <div className="mt-4">
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value, delta]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-xl font-semibold text-foreground">{value}</p>
            <p className="mt-1">
              <Delta value={delta} /> <span className="text-xs text-muted-foreground">vs período anterior</span>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Vendas hoje", todaySales.data ? String(todaySales.data.orders_count) : "—"],
            ["Faturamento hoje", money(todaySales.data?.revenue)],
            ["Faturamento líquido", money(revenue.data?.net)],
            ["Reembolsos", money(revenue.data?.refunded)],
          ] as Array<[string, string]>
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-lg font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Evolução diária</h2>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(METRIC_LABELS) as Metric[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={metric === key ? "secondary" : "ghost"}
                onClick={() => setMetric(key)}
              >
                {METRIC_LABELS[key]}
              </Button>
            ))}
            <Button asChild size="sm" variant="ghost"><Link to="/admin/funil">Ver funil</Link></Button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Sem dados no período selecionado.</p>
        ) : (
          <div className="mt-4 flex h-36 items-end gap-1 overflow-x-auto">
            {rows.map((row) => (
              <div key={row.day} className="flex min-w-6 flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(4, (Number(row[metric]) / maxMetric) * 104)}px` }}
                  title={`${row.day}: ${
                    metric === "revenue" ? currencyBRL.format(row.revenue) : Number(row[metric]).toLocaleString("pt-BR")
                  }`}
                />
                <span className="text-[10px] text-muted-foreground">{row.day.slice(8, 10)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <CategoryPerformance range={range} prev={prev} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">Top produtos do período</h2>
          <div className="mt-3 divide-y divide-border">
            {topProducts.map((row) => (
              <div key={row.product_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link
                  to="/admin/produtos/$id"
                  params={{ id: row.product_id }}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {row.product_name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {row.orders_count} vendas · {percent(row.conversion)} · {currencyBRL.format(row.revenue)}
                </span>
              </div>
            ))}
            {topProducts.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">Nenhuma venda registrada no período.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">Catálogo</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {catalog.map(([label, value]) => (
              <div key={label} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{value ?? "—"}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-foreground">Produtos recentes</h2>
      <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-background">
        {(recent.data ?? []).slice(0, 5).map((product) => (
          <div key={product.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            {product.thumbnail && (
              <img src={product.thumbnail} alt="" className="size-10 rounded-md border border-border object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate">{product.name}</span>
            <span className="text-xs text-muted-foreground">{product.is_active ? "Ativo" : "Inativo"}</span>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/produtos/$id" params={{ id: product.id }}>Editar</Link>
            </Button>
          </div>
        ))}
        {recent.data?.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
