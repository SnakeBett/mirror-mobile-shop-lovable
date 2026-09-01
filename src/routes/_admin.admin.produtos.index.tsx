import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { deleteProduct, duplicateProduct, listProductsWithMeta, setProductActive } from "@/lib/admin-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["admin", "products-meta", search],
    queryFn: () => listProductsWithMeta(search),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  async function handleDuplicate(id: string) {
    try {
      const newId = await duplicateProduct(id);
      invalidate();
      toast.success("Produto duplicado com sucesso. Você está editando a nova cópia.");
      navigate({ to: "/admin/produtos/$id", params: { id: newId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível duplicar.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Produtos</h1>
        <Button asChild size="sm"><Link to="/admin/produtos/novo">+ Novo produto</Link></Button>
      </div>

      <Input
        className="mt-4"
        placeholder="Buscar produto..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-background">
        {products.isLoading && <p className="px-4 py-6 text-sm text-muted-foreground">Carregando...</p>}
        {products.data?.map((product) => (
          <div key={product.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            {product.thumbnail ? (
              <img src={product.thumbnail} alt="" className="size-12 shrink-0 rounded-md border border-border object-cover" />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                <ImageIcon className="size-4" />
              </div>
            )}

            <div className="min-w-40 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
              <p className="truncate text-xs text-muted-foreground">/produto/{product.slug}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-foreground">{currency.format(Number(product.current_price))}</span>
                {product.old_price != null && (
                  <span className="text-muted-foreground line-through">{currency.format(Number(product.old_price))}</span>
                )}
                <span className={product.is_active ? "text-emerald-600" : "text-muted-foreground"}>
                  {product.is_active ? "Ativo" : "Inativo"}
                </span>
                <span className="text-muted-foreground">{product.reviewCount} avaliações</span>
              </p>
            </div>

            <Button asChild variant="outline" size="sm">
              <Link to="/admin/produtos/$id" params={{ id: product.id }}>Editar</Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ações"><MoreHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => window.open(`/produto/${product.slug}`, "_blank", "noopener")}>
                  Visualizar página
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleDuplicate(product.id)}>
                  Duplicar produto
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    await setProductActive(product.id, !product.is_active);
                    invalidate();
                  }}
                >
                  {product.is_active ? "Desativar" : "Ativar"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setPendingDelete({ id: product.id, name: product.name })}
                >
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {products.data?.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o produto “{pendingDelete?.name}” e seus dados relacionados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  await deleteProduct(pendingDelete.id);
                  toast.success("Produto excluído.");
                  invalidate();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
                }
                setPendingDelete(null);
              }}
            >
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
