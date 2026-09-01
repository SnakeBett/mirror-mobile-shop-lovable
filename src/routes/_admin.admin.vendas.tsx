import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  currencyBRL,
  getSalesByProduct,
  getSalesDaily,
  getSalesSummary,
  rangeForDays,
  rangeFromDates,
  type ProductSalesRow,
  type SalesRange,
} from "@/lib/sales-queries";

export const Route = createFileRoute("/_admin/admin/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas | Vitrine Admin" },
      { name: "description", content: "Faturamento, ticket médio e ranking de produtos mais vendidos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Vendas | Vitrine Admin" },
      { property: "og:description", content: "Faturamento, ticket médio e ranking de produtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});

type Preset = "1" | "7" | "30" | "custom";
type SortKey = "orders" | "revenue" | "ticket";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function SalesPage() {
  const [preset, setPreset] = useState<Preset>("30");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [sort, setSort] = useState<SortKey>("orders");

  const range: SalesRange = useMemo(
    () => (preset === "custom" ? rangeFromDates(from, to) : rangeForDays(Number(preset))),
    [preset, from, to],
  );

  const summary = useQuery({
    queryKey: ["admin", "sales-summary", range],
    queryFn: () => getSalesSummary(range),
  });
  const daily = useQuery({
    queryKey: ["admin", "sales-daily", range],
    queryFn: () => getSalesDaily(range),
  });
  const byProduct = useQuery({
    queryKey: ["admin", "sales-by-product", range],
    queryFn: () => getSalesByProduct(range),
  });

  const ranking = useMemo(() => {
    const rows: ProductSalesRow[] = [...(byProduct.data ?? [])];
    const key: keyof ProductSalesRow =
      sort === "revenue" ? "revenue" : sort === "ticket" ? "avg_ticket" : "orders_count";
    return rows.sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0));
  }, [byProduct.data, sort]);

  const maxRevenue = Math.max(1, ...(daily.data ?? []).map((row) => row.revenue));

  const cards = [
    ["Vendas", summary.data ? String(summary.data.orders_count) : "—"],
    ["Faturamento", summary.data ? currencyBRL.format(summary.data.revenue) : "—"],
    ["Ticket médio", summary.data ? currencyBRL.format(summary.data.avg_ticket) : "—"],
    ["Mais vendido", summary.data?.top_product_name ?? "—"],
  ] as const;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold text-foreground">Vendas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Números reais calculados a partir dos pedidos pagos.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["1", "Hoje"],
            ["7", "7 dias"],
            ["30", "30 dias"],
            ["custom", "Personalizado"],
          ] as Array<[Preset, string]>
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={preset === value ? "default" : "outline"}
            onClick={() => setPreset(value)}
          >
            {label}
          </Button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Vendas por dia</h2>
        {(daily.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma venda paga no período.</p>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-1 overflow-x-auto">
            {(daily.data ?? []).map((row) => (
              <div key={row.day} className="flex min-w-6 flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(4, (row.revenue / maxRevenue) * 120)}px` }}
                  title={`${row.orders_count} venda(s) · ${currencyBRL.format(row.revenue)}`}
                />
                <span className="text-[10px] text-muted-foreground">{row.day.slice(8, 10)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Produtos mais vendidos</h2>
          <div className="flex gap-1">
            {(
              [
                ["orders", "Mais vendas"],
                ["revenue", "Maior faturamento"],
                ["ticket", "Maior ticket"],
              ] as Array<[SortKey, string]>
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={sort === value ? "secondary" : "ghost"}
                onClick={() => setSort(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-background">
          {ranking.map((row) => (
            <div key={row.product_id ?? row.product_name ?? "sem-produto"} className="flex items-center gap-3 px-4 py-3">
              {row.thumbnail ? (
                <img src={row.thumbnail} alt="" className="size-10 rounded-md border border-border object-cover" />
              ) : (
                <div className="size-10 rounded-md border border-border bg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{row.product_name ?? "Produto removido"}</span>
              <div className="text-right text-xs text-muted-foreground">
                <p className="text-sm font-semibold text-foreground">{row.orders_count} vendas</p>
                <p>
                  {currencyBRL.format(row.revenue)} · ticket {currencyBRL.format(row.avg_ticket)}
                </p>
              </div>
            </div>
          ))}
          {ranking.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma venda registrada no período.</p>
          )}
        </div>
      </section>
    </div>
  );
}
