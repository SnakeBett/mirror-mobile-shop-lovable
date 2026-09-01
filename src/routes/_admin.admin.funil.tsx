import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PeriodPicker, type PeriodState } from "@/components/admin/period-picker";
import {
  buildAlerts,
  getAppSettings,
  getCampaigns,
  getFunnel,
  getProductConversion,
  getTrafficSources,
  percent,
  ratio,
  resolveRange,
  todayInTz,
} from "@/lib/analytics-queries";
import { listProductsWithMeta } from "@/lib/admin-queries";
import { currencyBRL } from "@/lib/sales-queries";

export const Route = createFileRoute("/_admin/admin/funil")({
  head: () => ({
    meta: [
      { title: "Funil de conversão | Vitrine Admin" },
      { name: "description", content: "Visitas, cliques em comprar, checkouts e vendas por período." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Funil de conversão | Vitrine Admin" },
      { property: "og:description", content: "Acompanhe cada etapa até a venda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FunnelPage,
});

function FunnelPage() {
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: getAppSettings });
  const tz = settings.data?.timezone ?? "America/Sao_Paulo";
  const today = todayInTz(tz);
  const [period, setPeriod] = useState<PeriodState>({ preset: "30d", from: today, to: today });

  const range = useMemo(
    () => resolveRange(period.preset, tz, { from: period.from, to: period.to }),
    [period, tz],
  );

  const funnel = useQuery({ queryKey: ["admin", "funnel", range], queryFn: () => getFunnel(range) });
  const conversion = useQuery({
    queryKey: ["admin", "product-conversion", range],
    queryFn: () => getProductConversion(range),
  });
  const sources = useQuery({
    queryKey: ["admin", "sources", range],
    queryFn: () => getTrafficSources(range),
  });
  const campaigns = useQuery({
    queryKey: ["admin", "campaigns", range],
    queryFn: () => getCampaigns(range),
  });
  const products = useQuery({
    queryKey: ["admin", "products-meta", ""],
    queryFn: () => listProductsWithMeta(""),
  });

  const data = funnel.data;
  const steps = [
    { label: "Visitantes únicos", value: data?.unique_visitors ?? 0, base: data?.unique_visitors ?? 0 },
    { label: "Visualizações de produto", value: data?.product_views ?? 0, base: data?.unique_visitors ?? 0 },
    { label: "Cliques em comprar", value: data?.buy_clicks ?? 0, base: data?.product_views ?? 0 },
    { label: "Checkouts iniciados", value: data?.checkouts ?? 0, base: data?.buy_clicks ?? 0 },
    { label: "Vendas aprovadas", value: data?.purchases ?? 0, base: data?.checkouts ?? 0 },
  ];
  const maxStep = Math.max(1, ...steps.map((step) => step.value));

  const alerts = useMemo(
    () =>
      buildAlerts(
        conversion.data ?? [],
        (products.data ?? []).map((product) => ({
          id: product.id,
          name: product.name,
          is_active: product.is_active,
          checkout_url: (product as { checkout_url?: string | null }).checkout_url ?? null,
          hasImage: Boolean(product.thumbnail),
        })),
      ),
    [conversion.data, products.data],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold text-foreground">Funil de conversão</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Da visita à venda aprovada — fuso {tz}.
      </p>

      <div className="mt-4">
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <section className="mt-5 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Etapas</h2>
        <div className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <div key={step.label}>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{step.label}</span>
                <span>
                  {step.value.toLocaleString("pt-BR")}
                  {index > 0 && ` · ${percent(ratio(step.value, step.base))} da etapa anterior`}
                </span>
              </div>
              <div className="mt-1 h-3 w-full rounded bg-muted">
                <div
                  className="h-3 rounded bg-primary/80"
                  style={{ width: `${Math.max(2, (step.value / maxStep) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Taxa de conversão geral:{" "}
          <strong className="text-foreground">
            {percent(ratio(data?.purchases ?? 0, data?.product_views ?? 0))}
          </strong>{" "}
          · Faturamento {currencyBRL.format(data?.revenue ?? 0)}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-foreground">Conversão por produto</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Produto</th>
                <th className="px-3 py-2 text-right font-medium">Visitas</th>
                <th className="px-3 py-2 text-right font-medium">Cliques</th>
                <th className="px-3 py-2 text-right font-medium">Checkouts</th>
                <th className="px-3 py-2 text-right font-medium">Vendas</th>
                <th className="px-3 py-2 text-right font-medium">Conversão</th>
                <th className="px-4 py-2 text-right font-medium">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(conversion.data ?? []).map((row) => (
                <tr key={row.product_id}>
                  <td className="max-w-[220px] truncate px-4 py-2">
                    <Link to="/admin/produtos/$id" params={{ id: row.product_id }} className="hover:underline">
                      {row.product_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">{row.views.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right">{row.buy_clicks.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right">{row.checkouts.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right">{row.orders_count.toLocaleString("pt-BR")}</td>
                  <td className="px-3 py-2 text-right">{percent(row.conversion)}</td>
                  <td className="px-4 py-2 text-right">{currencyBRL.format(row.revenue)}</td>
                </tr>
              ))}
              {(conversion.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Nenhum dado de navegação no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">Origens de tráfego</h2>
          <div className="mt-3 divide-y divide-border">
            {(sources.data ?? []).map((row) => (
              <div key={row.source} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate">{row.source}</span>
                <span className="text-xs text-muted-foreground">
                  {row.visitors} visitantes · {row.orders_count} vendas · {currencyBRL.format(row.revenue)}
                </span>
              </div>
            ))}
            {(sources.data ?? []).length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">Sem tráfego registrado no período.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">Campanhas</h2>
          <div className="mt-3 divide-y divide-border">
            {(campaigns.data ?? []).map((row) => (
              <div key={row.campaign} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate">{row.campaign}</span>
                <span className="text-xs text-muted-foreground">
                  {row.visitors} visitantes · {percent(row.conversion)} · {currencyBRL.format(row.revenue)}
                </span>
              </div>
            ))}
            {(campaigns.data ?? []).length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">Nenhuma campanha identificada.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">Atenção</h2>
        <ul className="mt-3 space-y-2">
          {alerts.map((alert, index) => (
            <li key={`${alert.product_id}-${index}`} className="text-sm">
              <span className={alert.level === "warn" ? "text-destructive" : "text-muted-foreground"}>•</span>{" "}
              <Link to="/admin/produtos/$id" params={{ id: alert.product_id }} className="hover:underline">
                {alert.message}
              </Link>
            </li>
          ))}
          {alerts.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhum alerta no momento.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
