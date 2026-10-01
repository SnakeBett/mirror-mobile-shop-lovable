import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { deleteProduct, duplicateProduct, listProductsWithMeta, setProductActive } from "@/lib/admin-queries";
import { buildTree, listCategories, setProductsCategory } from "@/lib/categories";
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

  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listCategories });
  const tree = buildTree(categories.data ?? []);
  const nameOf = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const [catFilter, setCatFilter] = useState("");
  const [subFilter, setSubFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState("");
  const [bulkSub, setBulkSub] = useState("");
  const filterSubs = tree.find((root) => root.id === catFilter)?.children ?? [];
  const bulkSubs = tree.find((root) => root.id === bulkCat)?.children ?? [];
  const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  const visible = (products.data ?? []).filter((product) => {
    if (catFilter === "none") return !product.category_id;
    if (catFilter && product.category_id !== catFilter) return false;
    if (subFilter && product.subcategory_id !== subFilter) return false;
    return true;
  });

  async function applyBulk() {
    try {
      await setProductsCategory([...selected], bulkCat || null, bulkSub || null);
      toast.success(`Categoria definida em ${selected.size} produto(s).`);
      setSelected(new Set());
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar.");
    }
  }

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
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm"><Link to="/admin/produtos/novo">+ Novo produto</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/admin/importar">IMPORTAR PRODUTO</Link></Button>
        </div>
      </div>

      <Input
        className="mt-4"
        placeholder="Buscar produto..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className={selectClass}
          value={catFilter}
          onChange={(e) => {
            setCatFilter(e.target.value);
            setSubFilter("");
          }}
        >
          <option value="">Todas as categorias</option>
          <option value="none">Sem categoria</option>
          {tree.map((root) => (
            <option key={root.id} value={root.id}>{root.name}</option>
          ))}
        </select>
        {filterSubs.length > 0 && (
          <select className={selectClass} value={subFilter} onChange={(e) => setSubFilter(e.target.value)}>
            <option value="">Todas as subcategorias</option>
            {filterSubs.map((sub) => (
              <option key={sub.id} value={sub.id}>{sub.name}</option>
            ))}
          </select>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={visible.length > 0 && visible.every((p) => selected.has(p.id))}
            onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((p) => p.id)) : new Set())}
          />
          Selecionar todos
        </label>
      </div>

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          <span className="font-medium">{selected.size} selecionado(s)</span>
          <span className="text-muted-foreground">Definir categoria:</span>
          <select
            className={selectClass}
            value={bulkCat}
            onChange={(e) => {
              setBulkCat(e.target.value);
              setBulkSub("");
            }}
          >
            <option value="">Sem categoria</option>
            {tree.map((root) => (
              <option key={root.id} value={root.id}>{root.name}</option>
            ))}
          </select>
          {bulkSubs.length > 0 && (
            <select className={selectClass} value={bulkSub} onChange={(e) => setBulkSub(e.target.value)}>
              <option value="">Sem subcategoria</option>
              {bulkSubs.map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          )}
          <Button size="sm" onClick={() => void applyBulk()}>Aplicar</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
        </div>
      )}

      <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-background">
        {products.isLoading && <p className="px-4 py-6 text-sm text-muted-foreground">Carregando...</p>}
        {visible.map((product) => (
          <div key={product.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              aria-label={`Selecionar ${product.name}`}
              className="size-4 accent-primary"
              checked={selected.has(product.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(product.id);
                else next.delete(product.id);
                setSelected(next);
              }}
            />
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
                <span className="text-muted-foreground">
                  {product.category_id
                    ? [nameOf.get(product.category_id), product.subcategory_id ? nameOf.get(product.subcategory_id) : null]
                        .filter(Boolean)
                        .join(" / ")
                    : "Sem categoria"}
                </span>
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
        {products.data && visible.length === 0 && (
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
