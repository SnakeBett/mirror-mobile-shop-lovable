import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useMemo, useState } from "react";

import { getDashboardStats, listProductsWithMeta } from "@/lib/admin-queries";
import {
  currencyBRL,
  getSalesDaily,
  getSalesSummary,
  rangeForDays,
  rangeFromDates,
  type SalesRange,
} from "@/lib/sales-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Preset = "1" | "7" | "30" | "custom";

export const Route = createFileRoute("/_admin/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Vitrine Admin" },
      { name: "description", content: "Resumo de produtos, avaliações e imagens da loja." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Dashboard | Vitrine Admin" },
      { property: "og:description", content: "Resumo de produtos, avaliações e imagens da loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: getDashboardStats });
  const recent = useQuery({
    queryKey: ["admin", "products-meta", ""],
    queryFn: () => listProductsWithMeta(""),
  });

  const [preset, setPreset] = useState<Preset>("30");
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const range: SalesRange = useMemo(
    () => (preset === "custom" ? rangeFromDates(from, to) : rangeForDays(Number(preset))),
    [preset, from, to],
  );

  const today = useQuery({ queryKey: ["admin", "sales-summary", rangeForDays(1)], queryFn: () => getSalesSummary(rangeForDays(1)) });
  const week = useQuery({ queryKey: ["admin", "sales-summary-7"], queryFn: () => getSalesSummary(rangeForDays(7)) });
  const month = useQuery({ queryKey: ["admin", "sales-summary-30"], queryFn: () => getSalesSummary(rangeForDays(30)) });
  const period = useQuery({ queryKey: ["admin", "sales-summary", range], queryFn: () => getSalesSummary(range) });
  const daily = useQuery({ queryKey: ["admin", "sales-daily", range], queryFn: () => getSalesDaily(range) });

  const money = (value?: number) => (value == null ? "—" : currencyBRL.format(value));
  const salesCards: Array<[string, string]> = [
    ["Vendas hoje", today.data ? String(today.data.orders_count) : "—"],
    ["Faturamento hoje", money(today.data?.revenue)],
    ["Vendas 7 dias", week.data ? String(week.data.orders_count) : "—"],
    ["Faturamento 7 dias", money(week.data?.revenue)],
    ["Vendas 30 dias", month.data ? String(month.data.orders_count) : "—"],
    ["Faturamento 30 dias", money(month.data?.revenue)],
    ["Ticket médio (período)", money(period.data?.avg_ticket)],
    ["Mais vendido (período)", period.data?.top_product_name ?? "—"],
  ];
  const maxRevenue = Math.max(1, ...(daily.data ?? []).map((row) => row.revenue));

  const cards = [
    ["Produtos", stats.data?.products],
    ["Ativos", stats.data?.active],
    ["Avaliações", stats.data?.reviews],
    ["Imagens", stats.data?.images],
  ] as const;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <Button asChild size="sm"><Link to="/admin/produtos/novo">+ Novo produto</Link></Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Vendas</h2>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["1", "Hoje"],
              ["7", "7 dias"],
              ["30", "30 dias"],
              ["custom", "Personalizado"],
            ] as Array<[Preset, string]>
          ).map(([value, label]) => (
            <Button key={value} size="sm" variant={preset === value ? "default" : "outline"} onClick={() => setPreset(value)}>
              {label}
            </Button>
          ))}
          {preset === "custom" && (
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" />
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {salesCards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 truncate text-xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Vendas por dia</h3>
          <Button asChild size="sm" variant="ghost"><Link to="/admin/vendas">Ver detalhes</Link></Button>
        </div>
        {(daily.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma venda paga no período selecionado.</p>
        ) : (
          <div className="mt-4 flex h-32 items-end gap-1 overflow-x-auto">
            {(daily.data ?? []).map((row) => (
              <div key={row.day} className="flex min-w-6 flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(4, (row.revenue / maxRevenue) * 96)}px` }}
                  title={`${row.orders_count} venda(s) · ${currencyBRL.format(row.revenue)}`}
                />
                <span className="text-[10px] text-muted-foreground">{row.day.slice(8, 10)}</span>
              </div>
            ))}
          </div>
        )}
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
