import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { normalizeCheckoutSettings, type CheckoutSettings } from "@/lib/checkout-settings";

export const Route = createFileRoute("/_admin/admin/checkout/personalizacao")({
  head: () => ({
    meta: [
      { title: "Personalização do checkout | Vitrine Admin" },
      { name: "description", content: "Frases do topo, logo, cores e textos do checkout próprio." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Personalização do checkout | Vitrine Admin" },
      { property: "og:description", content: "Frases do topo, logo, cores e textos do checkout próprio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "checkout-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("checkout_settings").select("id, settings").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [s, setS] = useState<CheckoutSettings | null>(null);
  const [newPhrase, setNewPhrase] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data) setS(normalizeCheckoutSettings(q.data.settings));
  }, [q.data]);
  if (!s) return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>;
  const up = <K extends keyof CheckoutSettings>(k: K, v: CheckoutSettings[K]) => setS({ ...s, [k]: v });
  const move = (i: number, d: number) => {
    const list = [...s.phrases];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    up("phrases", list);
  };
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("checkout_settings").update({ settings: s as never, updated_at: new Date().toISOString() }).eq("id", q.data!.id);
    setSaving(false);
    if (error) toast.error("Não foi possível salvar.");
    else {
      toast.success("Personalização salva");
      qc.invalidateQueries({ queryKey: ["admin", "checkout-settings"] });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Checkout · Personalização</h1>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </div>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Frases do topo</h2>
          <label className="flex items-center gap-2 text-sm">Faixa ativa <Switch checked={s.banner_enabled} onCheckedChange={(v) => up("banner_enabled", v)} /></label>
        </div>
        {s.phrases.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma frase cadastrada. A faixa só aparece quando houver frases ativas.</p>}
        {s.phrases.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2">
            <Input value={p.text} maxLength={140} onChange={(e) => up("phrases", s.phrases.map((x) => (x.id === p.id ? { ...x, text: e.target.value } : x)))} />
            <Switch checked={p.active} onCheckedChange={(v) => up("phrases", s.phrases.map((x) => (x.id === p.id ? { ...x, active: v } : x)))} aria-label="Ativa" />
            <Button size="icon" variant="ghost" onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="size-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="size-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => up("phrases", s.phrases.filter((x) => x.id !== p.id))} aria-label="Excluir"><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input placeholder="Nova frase, ex.: 🔒 Compra protegida e pagamento seguro" value={newPhrase} maxLength={140} onChange={(e) => setNewPhrase(e.target.value)} />
          <Button variant="outline" disabled={!newPhrase.trim()} onClick={() => { up("phrases", [...s.phrases, { id: crypto.randomUUID(), text: newPhrase.trim(), active: true }]); setNewPhrase(""); }}>Adicionar</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ColorField label="Cor de fundo da faixa" value={s.banner_bg} onChange={(v) => up("banner_bg", v)} />
          <ColorField label="Cor do texto da faixa" value={s.banner_fg} onChange={(v) => up("banner_fg", v)} />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="font-semibold">Logo e botões</h2>
        <label className="flex items-center gap-2 text-sm"><Switch checked={s.show_logo} onCheckedChange={(v) => up("show_logo", v)} /> Mostrar a logo da loja do produto</label>
        <div className="space-y-1"><Label>Altura da logo (px)</Label><Input type="number" min={20} max={80} value={s.logo_height} onChange={(e) => up("logo_height", Number(e.target.value))} /></div>
        <ColorField label="Cor principal dos botões" value={s.button_color} onChange={(v) => up("button_color", v)} />
        <div className="space-y-1"><Label>Texto do botão principal</Label><Input value={s.button_text} maxLength={40} onChange={(e) => up("button_text", e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={s.show_coupon} onCheckedChange={(v) => up("show_coupon", v)} /> Mostrar campo de cupom</label>
        <div className="space-y-1"><Label>Mensagem de pagamento seguro</Label><Input value={s.secure_message} maxLength={120} onChange={(e) => up("secure_message", e.target.value)} /></div>
        <div className="space-y-1"><Label>Mensagem de cartão indisponível</Label><Input value={s.card_unavailable_message} maxLength={120} onChange={(e) => up("card_unavailable_message", e.target.value)} /></div>
      </section>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 rounded border border-input" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
