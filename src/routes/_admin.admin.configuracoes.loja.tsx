import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StoreInfoCard } from "@/components/store-info-card";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_BUCKET } from "@/lib/storage-images";
import { DEFAULT_STORE_INFO, formatSold, normalizeStoreInfo, type StoreInfo } from "@/lib/store-info";

export const Route = createFileRoute("/_admin/admin/configuracoes/loja")({
  head: () => ({
    meta: [
      { title: "Informações da loja | Vitrine Admin" },
      { name: "description", content: "Nome, logo e indicadores de reputação exibidos em todas as páginas de produto." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Informações da loja | Vitrine Admin" },
      { property: "og:description", content: "Nome, logo e reputação da loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoreInfoPage,
});

async function loadStoreInfo() {
  const { data, error } = await supabase.from("app_settings").select("id, store_info").maybeSingle();
  if (error) throw error;
  return { id: (data?.id as string | undefined) ?? null, info: normalizeStoreInfo(data?.store_info) };
}

async function signed(path: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from(PRODUCT_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

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

function StoreInfoPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "store-info"], queryFn: loadStoreInfo });
  const [form, setForm] = useState<StoreInfo>(DEFAULT_STORE_INFO);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query.data) return;
    setForm(query.data.info);
    signed(query.data.info.logo_path).then(setLogoUrl);
  }, [query.data]);

  const set = <K extends keyof StoreInfo>(key: K, value: StoreInfo[K]) => setForm((p) => ({ ...p, [key]: value }));

  const numberField = (key: keyof StoreInfo, label: string, max?: number) => {
    const value = form[key] as number | null;
    const invalid = value != null && (value < 0 || (max != null && value > max));
    return (
      <div className="space-y-1.5" key={key}>
        <Label htmlFor={key}>{label}{max ? " (0–100)" : ""}</Label>
        <Input
          id={key}
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

  async function onLogo(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem.");
    if (file.size > 5 * 1024 * 1024) return toast.error("A imagem deve ter até 5 MB.");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `store/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) return toast.error("Não foi possível enviar a logo.");
    set("logo_path", path);
    setLogoUrl(URL.createObjectURL(file));
    toast.success("Logo carregada — clique em Salvar informações.");
  }

  const save = useMutation({
    mutationFn: async () => {
      const pcts = PCT_FIELDS.map(([k]) => form[k] as number | null);
      if (pcts.some((v) => v != null && (v < 0 || v > 100))) throw new Error("Percentuais devem ficar entre 0 e 100.");
      if (form.sold_count != null && form.sold_count < 0) throw new Error("Vendidos não pode ser negativo.");
      const info = normalizeStoreInfo(form);
      const id = query.data?.id;
      const { error } = id
        ? await supabase.from("app_settings").update({ store_info: info } as never).eq("id", id)
        : await supabase.from("app_settings").insert({ store_info: info } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Informações salvas");
      qc.invalidateQueries({ queryKey: ["admin", "store-info"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (query.isError) return <p className="text-sm text-destructive">Não foi possível carregar as informações.</p>;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Informações da Loja</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aparece acima da descrição em todas as páginas de produto. Campos vazios não são exibidos.
          </p>
        </div>

        <section className="space-y-4 rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">Identidade</h2>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome da loja</Label>
            <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
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
            <Label htmlFor="verified">Loja verificada (somente se confirmada)</Label>
            <Switch id="verified" checked={form.verified} onCheckedChange={(v) => set("verified", v)} />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">Reputação e serviço</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              {numberField("sold_count", "Quantidade de vendidos")}
              {form.sold_count != null && <p className="mt-1 text-xs text-muted-foreground">Exibe: {formatSold(form.sold_count)} vendidos</p>}
            </div>
            {PCT_FIELDS.map(([k, l]) => numberField(k, l, 100))}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">Exibição</h2>
          {TOGGLES.map(([k, l]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <Label htmlFor={k}>{l}</Label>
              <Switch id={k} checked={form[k] as boolean} onCheckedChange={(v) => set(k, v as never)} />
            </div>
          ))}
        </section>

        <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>
          {save.isPending ? "Salvando..." : "Salvar informações"}
        </Button>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-sm font-medium text-foreground">Prévia</p>
        <div className="rounded-lg border border-border bg-muted/40 py-3">
          {form.name.trim() ? (
            <StoreInfoCard info={normalizeStoreInfo(form)} logoUrl={logoUrl} />
          ) : (
            <p className="px-4 text-sm text-muted-foreground">Preencha o nome da loja para o card aparecer.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
