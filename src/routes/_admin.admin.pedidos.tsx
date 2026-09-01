import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listProducts } from "@/lib/admin-queries";
import {
  currencyBRL,
  listOrders,
  ORDER_STATUS_LABELS,
  type OrderFilters,
  type OrderStatus,
} from "@/lib/sales-queries";

export const Route = createFileRoute("/_admin/admin/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos | Vitrine Admin" },
      { name: "description", content: "Lista de pedidos com filtros por produto, status e data." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Pedidos | Vitrine Admin" },
      { property: "og:description", content: "Lista de pedidos com filtros por produto, status e data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

const STATUS_STYLES: Record<OrderStatus, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-rose-100 text-rose-700",
};

function OrdersPage() {
  const [filters, setFilters] = useState<OrderFilters>({ status: "all", productId: "all" });

  const products = useQuery({ queryKey: ["admin", "products-simple"], queryFn: () => listProducts("") });
  const orders = useQuery({
    queryKey: ["admin", "orders", filters],
    queryFn: () => listOrders(filters),
  });

  const update = (patch: Partial<OrderFilters>) => setFilters((current) => ({ ...current, ...patch }));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold text-foreground">Pedidos</h1>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Buscar por ID do pedido"
          value={filters.search ?? ""}
          onChange={(event) => update({ search: event.target.value })}
        />
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filters.productId ?? "all"}
          onChange={(event) => update({ productId: event.target.value })}
        >
          <option value="all">Todos os produtos</option>
          {(products.data ?? []).map((product) => (
            <option key={product.id} value={product.id}>{product.name}</option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filters.status ?? "all"}
          onChange={(event) => update({ status: event.target.value as OrderStatus | "all" })}
        >
          <option value="all">Todos os status</option>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
            <option key={status} value={status}>{ORDER_STATUS_LABELS[status]}</option>
          ))}
        </select>
        <Input type="date" value={filters.from ?? ""} onChange={(event) => update({ from: event.target.value })} />
        <Input type="date" value={filters.to ?? ""} onChange={(event) => update({ to: event.target.value })} />
      </div>

      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setFilters({ status: "all", productId: "all" })}>
          Limpar filtros
        </Button>
      </div>

      <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">ID do pedido</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Pagamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(orders.data ?? []).map((order) => (
              <tr key={order.id}>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {new Date(order.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="max-w-56 truncate px-3 py-2">{order.product_name ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {order.external_order_id}
                  {order.is_test && <span className="ml-2 rounded bg-muted px-1 text-[10px]">teste</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{currencyBRL.format(order.amount)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[order.status]}`}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{order.payment_method ?? "—"}</td>
              </tr>
            ))}
            {orders.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nenhum pedido encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
