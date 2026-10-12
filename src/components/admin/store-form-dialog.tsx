import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StoreInfoCard } from "@/components/store-info-card";
import { DEFAULT_STORE_INFO, formatSold, normalizeStoreInfo, type StoreInfo } from "@/lib/store-info";
import { saveStore, signedLogo, uploadLogo } from "@/lib/stores";

const PCT_FIELDS: Array<[keyof StoreInfo, string]> = [
  ["recommend_pct", "Percentual de recomendação"],
  ["trust_pct", "Percentual de confiança"],
  ["ontime_pct", "Envios pontuais"],
  ["reply24_pct", "Respostas em até 24 horas"],
];

const TOGGLES: Array<[keyof StoreInfo, string]> = [
  ["show_verified", "Selo de loja verificada"],
  ["show_sold", "Quantidade de vendidos"],
  ["show_recommend", "Percentual de recomendação"],
  ["show_trust", "Confiança e barra de progresso"],
  ["show_ontime", "Envios pontuais"],
  ["show_reply24", "Respostas em 24 horas"],
];

export function StoreFormDialog({
  open,
  onOpenChange,
  storeId,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string | null;
  initial: StoreInfo | null;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState<StoreInfo>(DEFAULT_STORE_INFO);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const next = initial ?? DEFAULT_STORE_INFO;
    setForm(next);
    setLogoUrl(null);
    signedLogo(next.logo_path).then(setLogoUrl);
  }, [open, initial]);

  const set = <K extends keyof StoreInfo>(key: K, value: StoreInfo[K]) => setForm((p) => ({ ...p, [key]: value }));

  const numberField = (key: keyof StoreInfo, label: string, max?: number) => {
    const value = form[key] as number | null;
    const invalid = value != null && (value < 0 || (max != null && value > max));
    return (
      <div className="space-y-1.5" key={key}>
        <Label htmlFor={`store-${key}`}>{label}{max ? " (0–100)" : ""}</Label>
        <Input
          id={`store-${key}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          value={value ?? ""}
          onChange={(e) => set(key, (e.target.value === "" ? null : Math.round(Number(e.target.value))) as never)}
        />
        {invalid && <p className="text-xs text-destructive">Use um valor entre 0 e {max ?? "∞"}.</p>}
      </div>
    );
  };

  async function onLogo(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) { toast.error("Envie uma imagem."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("A imagem deve ter até 5 MB."); return; }
    setUploading(true);
    try {
      const path = await uploadLogo(file);
      set("logo_path", path);
      setLogoUrl(URL.createObjectURL(file));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (PCT_FIELDS.some(([k]) => { const v = form[k] as number | null; return v != null && (v < 0 || v > 100); })) {
      toast.error("Percentuais devem ficar entre 0 e 100.");
      return;
    }
    if (form.sold_count != null && form.sold_count < 0) { toast.error("Vendidos não pode ser negativo."); return; }
    setSaving(true);
    try {
      const id = await saveStore(storeId, form);
      toast.success("Loja salva");
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{storeId ? "Editar loja" : "Nova loja"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <section className="space-y-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Identidade</h2>
              <div className="space-y-1.5">
                <Label htmlFor="store-name">Nome da loja</Label>
                <Input id="store-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted">
                  {logoUrl ? <img src={logoUrl} alt="Logo" className="size-full object-cover" /> : <span className="text-xs text-muted-foreground">Sem logo</span>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogo(f); e.target.value = ""; }} />
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? "Enviando..." : form.logo_path ? "Substituir logo" : "Enviar logo"}
                </Button>
                {form.logo_path && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { set("logo_path", null); setLogoUrl(null); }}>
                    Remover
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="store-verified">Loja verificada (somente se confirmada)</Label>
                <Switch id="store-verified" checked={form.verified} onCheckedChange={(v) => set("verified", v)} />
              </div>
            </section>

            <section className="space-y-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Reputação e serviço</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  {numberField("sold_count", "Quantidade de vendidos")}
                  {form.sold_count != null && <p className="mt-1 text-xs text-muted-foreground">Exibe: {formatSold(form.sold_count)} vendidos</p>}
                </div>
                {PCT_FIELDS.map(([k, l]) => numberField(k, l, 100))}
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Exibição</h2>
              {TOGGLES.map(([k, l]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`store-${k}`}>{l}</Label>
                  <Switch id={`store-${k}`} checked={form[k] as boolean} onCheckedChange={(v) => set(k, v as never)} />
                </div>
              ))}
            </section>

            <Button onClick={submit} disabled={saving || uploading}>
              {saving ? "Salvando..." : "Salvar informações"}
            </Button>
          </div>

          <aside className="lg:sticky lg:top-0 lg:self-start">
            <p className="mb-2 text-sm font-medium text-foreground">Prévia</p>
            <div className="rounded-lg border border-border bg-muted/40 py-3">
              {form.name.trim() ? (
                <StoreInfoCard info={normalizeStoreInfo(form)} logoUrl={logoUrl} />
              ) : (
                <p className="px-4 text-sm text-muted-foreground">Preencha o nome da loja para ver a prévia.</p>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
