import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteProduct, listProducts } from "@/lib/admin-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_admin/admin/produtos/")({
  head: () => ({
    meta: [
      { title: "Produtos | Vitrine Admin" },
      { name: "description", content: "Gerencie os produtos publicados na vitrine." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Produtos | Vitrine Admin" },
      { property: "og:description", content: "Gerencie os produtos publicados na vitrine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsList,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function ProductsList() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["admin", "products", search],
    queryFn: () => listProducts(search),
  });

  const remove = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Produtos</h1>
        <Button asChild size="sm"><Link to="/admin/produtos/novo">Novo produto</Link></Button>
      </div>

      <Input
        className="mt-4"
        placeholder="Buscar por nome"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-background">
        {products.isLoading && <p className="px-4 py-6 text-sm text-muted-foreground">Carregando...</p>}
        {products.data?.map((product) => (
          <div key={product.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                /produto/{product.slug} · {currency.format(Number(product.current_price))} ·{" "}
                {product.is_active ? "Ativo" : "Inativo"}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/produtos/$id" params={{ id: product.id }}>Editar</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/produto/$slug" params={{ slug: product.slug }}>Ver</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => {
                if (confirm(`Excluir "${product.name}"? Esta ação não pode ser desfeita.`)) {
                  remove.mutate(product.id);
                }
              }}
            >
              Excluir
            </Button>
          </div>
        ))}
        {products.data?.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        )}
      </div>
    </div>
  );
}
