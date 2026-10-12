import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { StoreFormDialog } from "@/components/admin/store-form-dialog";
import { deleteStore, listStores, signedLogo, type StoreRecord } from "@/lib/stores";

export const Route = createFileRoute("/_admin/admin/lojas")({
  head: () => ({
    meta: [
      { title: "Lojas | Vitrine Admin" },
      { name: "description", content: "Cadastre lojas e vincule cada uma aos seus produtos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Lojas | Vitrine Admin" },
      { property: "og:description", content: "Gerenciador de lojas da vitrine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoresPage,
});

function Logo({ path, name }: { path: string | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { signedLogo(path).then(setUrl); }, [path]);
  return (
    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted">
      {url ? <img src={url} alt={`Logo ${name}`} className="size-full object-cover" /> : <span className="font-semibold text-muted-foreground">{name.charAt(0).toUpperCase()}</span>}
    </div>
  );
}

function StoresPage() {
  const qc = useQueryClient();
  const stores = useQuery({ queryKey: ["admin", "stores"], queryFn: listStores });
  const [editing, setEditing] = useState<StoreRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<StoreRecord | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  async function confirmDelete() {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteStore(removing.id, transferTo || null);
      toast.success("Loja excluída");
      setRemoving(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Lojas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cada produto exibe o card da loja vinculada a ele, acima da descrição.</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-4" /> Nova loja
        </Button>
      </div>

      <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-background">
        {stores.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando...</p>}
        {stores.isError && <p className="p-4 text-sm text-destructive">Não foi possível carregar as lojas.</p>}
        {stores.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma loja cadastrada ainda.</p>}
        {stores.data?.map((store) => (
          <div key={store.id} className="flex flex-wrap items-center gap-3 p-4">
            <Logo path={store.info.logo_path} name={store.info.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{store.info.name}</p>
              <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                {store.info.verified ? (
                  <span className="inline-flex items-center gap-1 text-primary"><BadgeCheck className="size-3.5" /> Verificada</span>
                ) : (
                  <span>Não verificada</span>
                )}
                <span>{store.product_count} {store.product_count === 1 ? "produto" : "produtos"}</span>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setEditing(store); setFormOpen(true); }}>Editar</Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setTransferTo(""); setRemoving(store); }}>Excluir</Button>
          </div>
        ))}
      </div>

      <StoreFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        storeId={editing?.id ?? null}
        initial={editing?.info ?? null}
        onSaved={refresh}
      />

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {removing?.info.name}?</DialogTitle>
          </DialogHeader>
          {removing && removing.product_count > 0 ? (
            <div className="space-y-3 text-sm">
              <p className="text-foreground">
                Esta loja está vinculada a <b>{removing.product_count}</b> {removing.product_count === 1 ? "produto" : "produtos"}. Escolha o que fazer com eles:
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="transfer">Destino dos produtos</Label>
                <select
                  id="transfer"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Desvincular (produtos ficam sem card de loja)</option>
                  {stores.data?.filter((s) => s.id !== removing.id).map((s) => (
                    <option key={s.id} value={s.id}>Transferir para {s.info.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum produto usa esta loja.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={busy} onClick={confirmDelete}>{busy ? "Excluindo..." : "Excluir loja"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
