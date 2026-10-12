import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StoreFormDialog } from "@/components/admin/store-form-dialog";
import { StoreInfoCard } from "@/components/store-info-card";
import { listStores, signedLogo } from "@/lib/stores";

export function ProductStorePanel({ storeId, onChange }: { storeId: string | null; onChange: (id: string | null) => void }) {
  const qc = useQueryClient();
  const stores = useQuery({ queryKey: ["admin", "stores"], queryFn: listStores });
  const [formOpen, setFormOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const selected = stores.data?.find((s) => s.id === storeId) ?? null;

  useEffect(() => {
    setLogoUrl(null);
    signedLogo(selected?.info.logo_path ?? null).then(setLogoUrl);
  }, [selected?.info.logo_path]);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">Informações da Loja</h2>
      <div className="space-y-1.5">
        <Label htmlFor="product-store">Loja deste produto</Label>
        <select
          id="product-store"
          value={storeId ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Nenhuma (card oculto)</option>
          {stores.data?.map((s) => <option key={s.id} value={s.id}>{s.info.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { setEditMode(false); setFormOpen(true); }}>+ Criar nova loja</Button>
        <Button type="button" variant="outline" size="sm" disabled={!selected} onClick={() => { setEditMode(true); setFormOpen(true); }}>Editar loja selecionada</Button>
      </div>
      {selected && (
        <p className="text-xs text-muted-foreground">
          Alterações na loja valem para todos os {selected.product_count} produtos vinculados a ela.
        </p>
      )}
      <div className="max-w-sm rounded-lg border border-border bg-muted/40 py-3">
        {selected ? (
          <StoreInfoCard info={selected.info} logoUrl={logoUrl} />
        ) : (
          <p className="px-4 text-sm text-muted-foreground">Sem loja vinculada, o card não aparece na página.</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Clique em "Salvar" do produto para gravar o vínculo.</p>

      <StoreFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        storeId={editMode ? (selected?.id ?? null) : null}
        initial={editMode ? (selected?.info ?? null) : null}
        onSaved={(id) => {
          qc.invalidateQueries({ queryKey: ["admin", "stores"] });
          if (!editMode) onChange(id);
        }}
      />
    </div>
  );
}
