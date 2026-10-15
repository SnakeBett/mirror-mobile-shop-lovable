import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_admin/admin/entrega/fretes")({
  head: () => ({
    meta: [
      { title: "Métodos de frete | Vitrine Admin" },
      { name: "description", content: "Cadastre os métodos de frete com valores fixos exibidos no checkout." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Métodos de frete | Vitrine Admin" },
      { property: "og:description", content: "Cadastre os métodos de frete com valores fixos exibidos no checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

export type ShippingMethod = {
  id?: string; code: string; name: string; description: string | null; price: number;
  min_days: number | null; max_days: number | null; is_active: boolean; sort_order: number;
};
const EMPTY: ShippingMethod = { code: "", name: "", description: null, price: 0, min_days: null, max_days: null, is_active: true, sort_order: 0 };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numOrNull = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));
const codeOf = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function Page() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "shipping-methods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shipping_methods").select("*").order("sort_order");
      if (error) throw error;
      return data.map((m) => ({ ...m, price: Number(m.price) })) as ShippingMethod[];
    },
  });
  const [edit, setEdit] = useState<ShippingMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const list = q.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "shipping-methods"] });

  const save = async () => {
    if (!edit) return;
    const name = edit.name.trim();
    if (!name) { toast.error("Informe o nome do método."); return; }
    if (!Number.isFinite(edit.price) || edit.price < 0) { toast.error("Valor inválido.");
    if (edit.min_days != null && edit.max_days != null && edit.min_days > edit.max_days) { toast.error("O prazo mínimo não pode ser maior que o máximo.");
    const code = codeOf(edit.code || name);
    if (!code) { toast.error("Identificador inválido.");
    setSaving(true);
    const row = { code, name, description: edit.description?.trim() || null, price: Math.round(edit.price * 100) / 100, min_days: edit.min_days, max_days: edit.max_days, is_active: edit.is_active, sort_order: edit.id ? edit.sort_order : list.length };
    const { error } = edit.id
      ? await supabase.from("shipping_methods").update(row).eq("id", edit.id)
      : await supabase.from("shipping_methods").insert(row);
    setSaving(false);
    if (error) { toast.error(error.code === "23505" ? "Já existe um método com esse identificador." : "Não foi possível salvar.");
    toast.success("Método salvo.");
    setEdit(null);
    refresh();
  };

  const remove = async (m: ShippingMethod) => {
    if (!confirm(`Excluir "${m.name}"? Pedidos antigos mantêm o nome e o valor cobrado.`)) return;
    const { error } = await supabase.from("shipping_methods").delete().eq("id", m.id!);
    if (error) { toast.error("Não foi possível excluir.");
    refresh();
  };
  const toggle = async (m: ShippingMethod, v: boolean) => {
    const { error } = await supabase.from("shipping_methods").update({ is_active: v }).eq("id", m.id!);
    if (error) toast.error("Não foi possível alterar.");
    refresh();
  };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    await Promise.all(next.map((m, idx) => supabase.from("shipping_methods").update({ sort_order: idx }).eq("id", m.id!)));
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Métodos de frete</h1>
          <p className="text-sm text-muted-foreground">Valores fixos definidos por você. Os nomes são só rótulos: não há cotação automática de transportadora.</p>
        </div>
        <Button onClick={() => setEdit({ ...EMPTY })}>+ Novo método</Button>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {q.isError && <p className="text-sm text-destructive">Não foi possível carregar os métodos.</p>}
      {!q.isLoading && list.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum método cadastrado ainda.</p>}

      <div className="space-y-2">
        {list.map((m, i) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <div className="flex flex-col">
              <button type="button" aria-label="Subir" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30"><ArrowUp className="size-4" /></button>
              <button type="button" aria-label="Descer" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="disabled:opacity-30"><ArrowDown className="size-4" /></button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{m.name} <span className="text-xs text-muted-foreground">({m.code})</span></p>
              <p className="text-xs text-muted-foreground">
                {m.price <= 0 ? "Grátis" : brl.format(m.price)}
                {m.min_days != null || m.max_days != null ? ` · ${m.min_days ?? "?"} a ${m.max_days ?? "?"} dias` : ""}
                {m.description ? ` · ${m.description}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs"><Switch checked={m.is_active} onCheckedChange={(v) => toggle(m, v)} aria-label="Ativo" />{m.is_active ? "Ativo" : "Inativo"}</div>
            <Button variant="outline" size="sm" onClick={() => setEdit(m)}><Pencil className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => remove(m)}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Editar método" : "Novo método"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label htmlFor="sm-name">Nome</Label><Input id="sm-name" value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Frete Grátis" /></div>
              <div><Label htmlFor="sm-code">Identificador interno</Label><Input id="sm-code" value={edit.code} maxLength={40} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder={codeOf(edit.name) || "frete-gratis"} /></div>
              <div><Label htmlFor="sm-desc">Descrição (opcional)</Label><Input id="sm-desc" value={edit.description ?? ""} maxLength={120} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label htmlFor="sm-price">Valor (R$)</Label><Input id="sm-price" type="number" min="0" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></div>
                <div><Label htmlFor="sm-min">Prazo mín. (dias)</Label><Input id="sm-min" type="number" min="0" value={edit.min_days ?? ""} onChange={(e) => setEdit({ ...edit, min_days: numOrNull(e.target.value) })} /></div>
                <div><Label htmlFor="sm-max">Prazo máx. (dias)</Label><Input id="sm-max" type="number" min="0" value={edit.max_days ?? ""} onChange={(e) => setEdit({ ...edit, max_days: numOrNull(e.target.value) })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch id="sm-active" checked={edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} /><Label htmlFor="sm-active">Ativo</Label></div>
              <Button className="w-full" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
