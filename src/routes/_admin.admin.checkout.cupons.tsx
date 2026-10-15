import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_admin/admin/checkout/cupons")({
  head: () => ({
    meta: [
      { title: "Cupons | Vitrine Admin" },
      { name: "description", content: "Cadastre e gerencie cupons de desconto do checkout." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Cupons | Vitrine Admin" },
      { property: "og:description", content: "Cadastre e gerencie cupons de desconto do checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Coupon = {
  id?: string; code: string; discount_type: "percentage" | "fixed"; discount_value: number;
  starts_at: string | null; ends_at: string | null; max_uses: number | null; max_uses_per_buyer: number | null;
  min_order_value: number | null; product_ids: string[]; store_ids: string[]; is_active: boolean; uses_count?: number;
};
const EMPTY: Coupon = { code: "", discount_type: "percentage", discount_value: 10, starts_at: null, ends_at: null, max_uses: null, max_uses_per_buyer: null, min_order_value: null, product_ids: [], store_ids: [], is_active: true };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function Page() {
  const qc = useQueryClient();
  const coupons = useQuery({ queryKey: ["admin", "coupons"], queryFn: async () => (await supabase.from("coupons").select("*").order("created_at", { ascending: false })).data as Coupon[] | null });
  const products = useQuery({ queryKey: ["admin", "coupon-products"], queryFn: async () => (await supabase.from("products").select("id, name").order("name")).data ?? [] });
  const stores = useQuery({ queryKey: ["admin", "coupon-stores"], queryFn: async () => (await supabase.from("stores").select("id, name").order("name")).data ?? [] });
  const [edit, setEdit] = useState<Coupon | null>(null);

  const save = async () => {
    if (!edit) return;
    const code = edit.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return toast.error("Código: use 2 a 40 letras, números, - ou _.");
    if (!(edit.discount_value > 0) || (edit.discount_type === "percentage" && edit.discount_value > 100)) return toast.error("Desconto inválido.");
    const { id, uses_count: _u, ...rest } = edit;
    const row = { ...rest, code, updated_at: new Date().toISOString() };
    const { error } = id ? await supabase.from("coupons").update(row).eq("id", id) : await supabase.from("coupons").insert(row);
    if (error) return toast.error(error.code === "23505" ? "Já existe um cupom com esse código." : "Não foi possível salvar.");
    toast.success("Cupom salvo");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir este cupom?")) return;
    await supabase.from("coupons").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Checkout · Cupons</h1>
        <Button onClick={() => setEdit({ ...EMPTY })}>+ Novo cupom</Button>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {(coupons.data ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum cupom cadastrado.</p>}
        {(coupons.data ?? []).map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-mono font-semibold">{c.code} {!c.is_active && <span className="ml-1 text-xs font-normal text-muted-foreground">(inativo)</span>}</p>
              <p className="text-xs text-muted-foreground">
                {c.discount_type === "percentage" ? `${c.discount_value}%` : brl.format(c.discount_value)} · usado {c.uses_count ?? 0}{c.max_uses != null ? `/${c.max_uses}` : ""}
                {c.ends_at ? ` · até ${new Date(c.ends_at).toLocaleString("pt-BR")}` : ""}
                {c.product_ids.length ? ` · ${c.product_ids.length} produto(s)` : ""}{c.store_ids.length ? ` · ${c.store_ids.length} loja(s)` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEdit({ ...c, discount_value: Number(c.discount_value), min_order_value: c.min_order_value == null ? null : Number(c.min_order_value) })}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(c.id!)}>Excluir</Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Editar cupom" : "Novo cupom"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1"><Label>Código</Label><Input value={edit.code} maxLength={40} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Tipo</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={edit.discount_type} onChange={(e) => setEdit({ ...edit, discount_type: e.target.value as Coupon["discount_type"] })}>
                    <option value="percentage">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option>
                  </select>
                </div>
                <div className="space-y-1"><Label>Desconto</Label><Input type="number" step="0.01" min={0} value={edit.discount_value} onChange={(e) => setEdit({ ...edit, discount_value: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Início</Label><Input type="datetime-local" value={toLocal(edit.starts_at)} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
                <div className="space-y-1"><Label>Expiração</Label><Input type="datetime-local" value={toLocal(edit.ends_at)} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
                <div className="space-y-1"><Label>Limite total de usos</Label><Input type="number" min={1} value={edit.max_uses ?? ""} placeholder="Sem limite" onChange={(e) => setEdit({ ...edit, max_uses: numOrNull(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Limite por comprador (CPF)</Label><Input type="number" min={1} value={edit.max_uses_per_buyer ?? ""} placeholder="Sem limite" onChange={(e) => setEdit({ ...edit, max_uses_per_buyer: numOrNull(e.target.value) })} /></div>
                <div className="col-span-2 space-y-1"><Label>Valor mínimo da compra (R$)</Label><Input type="number" step="0.01" min={0} value={edit.min_order_value ?? ""} placeholder="Sem mínimo" onChange={(e) => setEdit({ ...edit, min_order_value: numOrNull(e.target.value) })} /></div>
              </div>
              <div className="space-y-1">
                <Label>Produtos elegíveis <span className="font-normal text-muted-foreground">(nenhum marcado = todos)</span></Label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
                  {(products.data ?? []).map((p) => (
                    <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={edit.product_ids.includes(p.id)} onChange={() => setEdit({ ...edit, product_ids: toggle(edit.product_ids, p.id) })} />{p.name}</label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Lojas elegíveis <span className="font-normal text-muted-foreground">(nenhuma marcada = todas)</span></Label>
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
                  {(stores.data ?? []).map((s) => (
                    <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={edit.store_ids.includes(s.id)} onChange={() => setEdit({ ...edit, store_ids: toggle(edit.store_ids, s.id) })} />{s.name}</label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} /> Ativo</label>
              <Button className="w-full" onClick={save}>Salvar cupom</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
