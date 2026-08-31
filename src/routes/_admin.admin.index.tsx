import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { getDashboardStats, listProducts } from "@/lib/admin-queries";
import { Button } from "@/components/ui/button";

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
  const recent = useQuery({ queryKey: ["admin", "products", ""], queryFn: () => listProducts("") });

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
        <Button asChild size="sm"><Link to="/admin/produtos/novo">Novo produto</Link></Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{value ?? "—"}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold text-foreground">Produtos recentes</h2>
      <div className="mt-3 divide-y divide-border rounded-lg border border-border bg-background">
        {(recent.data ?? []).slice(0, 5).map((product) => (
          <Link
            key={product.id}
            to="/admin/produtos/$id"
            params={{ id: product.id }}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-accent"
          >
            <span className="truncate">{product.name}</span>
            <span className="text-xs text-muted-foreground">{product.is_active ? "Ativo" : "Inativo"}</span>
          </Link>
        ))}
        {recent.data?.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
