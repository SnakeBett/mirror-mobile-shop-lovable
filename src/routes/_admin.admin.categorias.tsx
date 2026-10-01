import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildTree,
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  type Category,
} from "@/lib/categories";

export const Route = createFileRoute("/_admin/admin/categorias")({
  head: () => ({
    meta: [
      { title: "Categorias | Vitrine Admin" },
      { name: "description", content: "Crie e organize categorias e subcategorias dos produtos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Categorias | Vitrine Admin" },
      { property: "og:description", content: "Crie e organize categorias e subcategorias dos produtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CategoriesPage,
});

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Não foi possível concluir.";
}

function CategoriesPage() {
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listCategories });
  const tree = buildTree(categories.data ?? []);
  const [name, setName] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });

  async function run(action: () => Promise<void>, success: string) {
    try {
      await action();
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Categorias</h1>
        <p className="text-sm text-muted-foreground">
          As mesmas categorias alimentam as recomendações, os filtros de produtos e o dashboard.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void run(() => createCategory(name), "Categoria criada.").then(() => setName(""));
        }}
      >
        <Input placeholder="Nova categoria (ex.: Automotivo)" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit"><Plus className="size-4" /> Criar categoria</Button>
      </form>

      {categories.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!categories.isLoading && tree.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma categoria criada ainda.
        </p>
      )}

      <div className="space-y-3">
        {tree.map((root) => (
          <div key={root.id} className="rounded-lg border border-border bg-card p-4">
            <CategoryRow category={root} strong run={run} />
            <div className="mt-3 space-y-1 border-l border-border pl-4">
              {root.children.map((child) => (
                <CategoryRow key={child.id} category={child} run={run} />
              ))}
              <SubForm parentId={root.id} run={run} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Run = (action: () => Promise<void>, success: string) => Promise<void>;

function CategoryRow({ category, strong, run }: { category: Category; strong?: boolean; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(category.name);
  if (editing) {
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          void run(() => renameCategory(category.id, value), "Nome atualizado.").then(() => setEditing(false));
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus className="h-8" />
        <Button size="sm" type="submit">Salvar</Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>Cancelar</Button>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className={`flex-1 truncate ${strong ? "font-semibold uppercase tracking-wide text-foreground" : "text-sm text-foreground"}`}>
        {category.name}
      </span>
      <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(true)}>
        <Pencil className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Excluir"
        onClick={() => void run(() => deleteCategory(category.id), "Categoria excluída.")}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function SubForm({ parentId, run }: { parentId: string; run: Run }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex gap-2 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        void run(() => createCategory(value, parentId), "Subcategoria criada.").then(() => setValue(""));
      }}
    >
      <Input className="h-8" placeholder="Nova subcategoria" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button size="sm" variant="outline" type="submit">Adicionar</Button>
    </form>
  );
}
