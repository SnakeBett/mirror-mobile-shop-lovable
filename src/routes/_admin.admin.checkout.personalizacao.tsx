import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!s?.logo_path) return;
    supabase.storage.from("product-images").createSignedUrl(s.logo_path, 3600).then(({ data }) => setLogoUrl(data?.signedUrl ?? null));
  }, [s?.logo_path]);
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
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Use PNG, JPG ou WebP."); return; }
    setUploading(true);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `checkout/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) { toast.error("Não foi possível enviar a logo."); return; }
    up("logo_path", path);
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
        <div className="space-y-2">
          <Label>Logo do Checkout</Label>
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 p-2">
            {logoUrl ? <img src={logoUrl} alt="Logo do checkout" style={{ maxHeight: s.logo_height }} className="max-w-[200px] object-contain" /> : <span className="text-xs text-muted-foreground">Nenhuma logo cadastrada</span>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Enviando..." : s.logo_path ? "Substituir logo" : "Enviar logo"}</Button>
            {s.logo_path && <Button type="button" variant="ghost" size="sm" onClick={() => { up("logo_path", null); setLogoUrl(null); }}>Remover</Button>}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
          <p className="text-xs text-muted-foreground">PNG (inclusive transparente), JPG ou WebP. A mesma logo aparece em todos os checkouts. Clique em Salvar para aplicar.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={s.show_logo} onCheckedChange={(v) => up("show_logo", v)} /> Mostrar a logo no checkout</label>
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
