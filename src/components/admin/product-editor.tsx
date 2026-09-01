import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createProduct,
  deleteChild,
  getProduct,
  insertChild,
  removeStorageObject,
  reorderChild,
  updateChild,
  updateProduct,
  uploadProductImage,
} from "@/lib/admin-queries";
import { calcDiscount, slugify, type ProductRow } from "@/lib/product-types";

type Draft = Partial<ProductRow>;

const emptyDraft: Draft = {
  name: "",
  slug: "",
  search_placeholder: "Pesquisar produtos",
  current_price: 0,
  old_price: null,
  discount_percentage: null,
  installment_text: "",
  installment_note: "",
  sales_count: "",
  rating: 5,
  review_count: 0,
  five_star_count: 0,
  custom_stats_enabled: true,
  shipping_fee: "",
  shipping_promotion_text: "",
  shipping_discount_text: "",
  customer_protection_text: "Proteção ao cliente",
  shipping_min_days: 3,
  shipping_max_days: 6,
  shipping_business_days: false,
  description: "",
  closing_text: "",
  checkout_url: "",
  checkout_button_text: "Comprar agora",
  checkout_button_subtext: "",
  is_active: true,
};

const TABS: Array<[string, string]> = [
  ["geral", "Geral"],
  ["imagens", "Imagens"],
  ["oferta", "Oferta"],
  ["entrega", "Entrega"],
  ["detalhes", "Detalhes"],
  ["descricao", "Descrição"],
  ["avaliacoes", "Avaliações"],
  ["checkout", "Checkout"],
];

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  id,
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function ProductEditor({ productId }: { productId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !productId;

  const query = useQuery({
    queryKey: ["admin", "product", productId],
    queryFn: () => getProduct(productId!),
    enabled: !isNew,
  });

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("geral");

  useEffect(() => {
    if (query.data?.product) {
      const next = { ...emptyDraft, ...query.data.product };
      setDraft(next);
      setBaseline(next);
    }
  }, [query.data?.product]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && isNew) next.slug = slugify(String(value ?? ""));
      if (key === "current_price" || key === "old_price") {
        next.discount_percentage = calcDiscount(
          next.old_price == null ? null : Number(next.old_price),
          Number(next.current_price ?? 0),
        );
      }
      return next;
    });
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  async function save() {
    if (!draft.name?.trim()) {
      toast.error("Informe o nome do produto.");
      setTab("geral");
      return;
    }
    setSaving(true);
    try {
      const values: Draft = {
        ...draft,
        name: draft.name.trim(),
        slug: (draft.slug?.trim() || slugify(draft.name)).trim(),
        current_price: Number(draft.current_price ?? 0),
        old_price: draft.old_price == null || draft.old_price === ("" as never) ? null : Number(draft.old_price),
        rating: draft.rating == null ? null : Number(draft.rating),
        review_count: Number(draft.review_count ?? 0),
        five_star_count: Number(draft.five_star_count ?? 0),
        shipping_min_days: Number(draft.shipping_min_days ?? 3),
        shipping_max_days: Number(draft.shipping_max_days ?? 6),
        checkout_button_text: draft.checkout_button_text?.trim() || "Comprar agora",
      };
      delete (values as Record<string, unknown>)["id"];
      delete (values as Record<string, unknown>)["created_at"];
      delete (values as Record<string, unknown>)["updated_at"];

      if (isNew) {
        const id = await createProduct(values);
        invalidate();
        toast.success("Produto criado com sucesso.");
        navigate({ to: "/admin/produtos/$id", params: { id } });
        return;
      }
      await updateProduct(productId!, values);
      setBaseline(draft);
      invalidate();
      toast.success("Produto atualizado com sucesso");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && query.isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!isNew && !query.data) return <p className="text-sm text-muted-foreground">Produto não encontrado.</p>;

  const data = query.data;
  const previewUrl = draft.slug ? `/produto/${draft.slug}` : null;

  return (
    <div className="mx-auto max-w-4xl pb-28">
      <h1 className="truncate text-xl font-semibold text-foreground">
        {isNew ? "Novo produto" : draft.name}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isNew
          ? "Salve o produto para liberar imagens, avaliações e demais conteúdos."
          : `/produto/${draft.slug}`}
      </p>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="w-max">
            {TABS.map(([value, label]) => (
              <TabsTrigger key={value} value={value}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* GERAL */}
        <TabsContent value="geral" className="mt-4 space-y-4">
          <Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do produto" id="name">
                <Input id="name" value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Slug (URL)" id="slug">
                <Input id="slug" value={draft.slug ?? ""} onChange={(e) => set("slug", e.target.value)} />
              </Field>
              <Field label="Quantidade vendida (texto)" id="sales">
                <Input id="sales" value={draft.sales_count ?? ""} onChange={(e) => set("sales_count", e.target.value)} />
              </Field>
              <Field label="Placeholder da pesquisa" id="ph">
                <Input
                  id="ph"
                  value={draft.search_placeholder ?? ""}
                  onChange={(e) => set("search_placeholder", e.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="is_active"
                checked={!!draft.is_active}
                onCheckedChange={(checked) => set("is_active", checked)}
              />
              <Label htmlFor="is_active">{draft.is_active ? "Ativo" : "Inativo"}</Label>
            </div>
          </Panel>

          <Panel title="Números exibidos">
            <div className="flex items-center gap-3">
              <Switch
                id="custom_stats"
                checked={!!draft.custom_stats_enabled}
                onCheckedChange={(checked) => set("custom_stats_enabled", checked)}
              />
              <Label htmlFor="custom_stats">Usar números personalizados</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Desativado: nota, total de avaliações e 5 estrelas são calculados pelas avaliações ativas.
            </p>
            {draft.custom_stats_enabled && (
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Nota exibida" id="rating">
                  <Input
                    id="rating"
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={draft.rating ?? ""}
                    onChange={(e) => set("rating", e.target.value === "" ? null : Number(e.target.value))}
                  />
                </Field>
                <Field label="Avaliações exibidas" id="rc">
                  <Input
                    id="rc"
                    type="number"
                    min="0"
                    value={draft.review_count ?? 0}
                    onChange={(e) => set("review_count", Number(e.target.value))}
                  />
                </Field>
                <Field label="Avaliações 5 estrelas" id="fsc">
                  <Input
                    id="fsc"
                    type="number"
                    min="0"
                    value={draft.five_star_count ?? 0}
                    onChange={(e) => set("five_star_count", Number(e.target.value))}
                  />
                </Field>
              </div>
            )}
          </Panel>
        </TabsContent>

        {/* IMAGENS */}
        <TabsContent value="imagens" className="mt-4">
          {data ? (
            <ImagesManager
              productId={data.product.id}
              images={data.images}
              previews={data.previews}
              onChange={invalidate}
            />
          ) : (
            <Panel>
              <p className="text-sm text-muted-foreground">Salve o produto para enviar imagens.</p>
            </Panel>
          )}
        </TabsContent>

        {/* OFERTA */}
        <TabsContent value="oferta" className="mt-4 space-y-4">
          <Panel title="Preço">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Preço atual (R$)" id="price">
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.current_price ?? 0}
                  onChange={(e) => set("current_price", Number(e.target.value))}
                />
              </Field>
              <Field label="Preço antigo (R$)" id="oldprice">
                <Input
                  id="oldprice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.old_price ?? ""}
                  onChange={(e) => set("old_price", e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Desconto (%)" id="disc">
                <Input
                  id="disc"
                  type="number"
                  min="0"
                  max="99"
                  value={draft.discount_percentage ?? ""}
                  onChange={(e) =>
                    set("discount_percentage", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              O desconto é calculado automaticamente ao preencher os dois preços, mas pode ser ajustado.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Texto de parcelamento" id="inst">
                <Input
                  id="inst"
                  placeholder="11x R$ 5,44"
                  value={draft.installment_text ?? ""}
                  onChange={(e) => set("installment_text", e.target.value)}
                />
              </Field>
              <Field label="Texto complementar" id="instnote">
                <Input
                  id="instnote"
                  placeholder="sem juros no cartão"
                  value={draft.installment_note ?? ""}
                  onChange={(e) => set("installment_note", e.target.value)}
                />
              </Field>
            </div>
          </Panel>

          {data ? (
            <ChipsManager productId={data.product.id} rows={data.promotions} onChange={invalidate} />
          ) : (
            <Panel title="Chips promocionais">
              <p className="text-sm text-muted-foreground">Salve o produto para adicionar chips.</p>
            </Panel>
          )}
        </TabsContent>

        {/* ENTREGA */}
        <TabsContent value="entrega" className="mt-4">
          <Panel title="Prazo de entrega">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Prazo mínimo (dias)" id="minday">
                <Input
                  id="minday"
                  type="number"
                  min="0"
                  value={draft.shipping_min_days ?? 3}
                  onChange={(e) => set("shipping_min_days", Number(e.target.value))}
                />
              </Field>
              <Field label="Prazo máximo (dias)" id="maxday">
                <Input
                  id="maxday"
                  type="number"
                  min="0"
                  value={draft.shipping_max_days ?? 6}
                  onChange={(e) => set("shipping_max_days", Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="bizdays"
                checked={!!draft.shipping_business_days}
                onCheckedChange={(checked) => set("shipping_business_days", checked)}
              />
              <Label htmlFor="bizdays">Contar apenas dias úteis</Label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Taxa de envio" id="fee">
                <Input id="fee" value={draft.shipping_fee ?? ""} onChange={(e) => set("shipping_fee", e.target.value)} />
              </Field>
              <Field label="Texto promocional da entrega" id="promo">
                <Input
                  id="promo"
                  value={draft.shipping_promotion_text ?? ""}
                  onChange={(e) => set("shipping_promotion_text", e.target.value)}
                />
              </Field>
              <Field label="Desconto no frete" id="sdisc">
                <Input
                  id="sdisc"
                  value={draft.shipping_discount_text ?? ""}
                  onChange={(e) => set("shipping_discount_text", e.target.value)}
                />
              </Field>
              <Field label="Proteção ao cliente" id="prot">
                <Input
                  id="prot"
                  value={draft.customer_protection_text ?? ""}
                  onChange={(e) => set("customer_protection_text", e.target.value)}
                />
              </Field>
            </div>
          </Panel>
        </TabsContent>

        {/* DETALHES */}
        <TabsContent value="detalhes" className="mt-4">
          {data ? (
            <DetailsManager productId={data.product.id} rows={data.details} onChange={invalidate} />
          ) : (
            <Panel>
              <p className="text-sm text-muted-foreground">Salve o produto para adicionar detalhes.</p>
            </Panel>
          )}
        </TabsContent>

        {/* DESCRIÇÃO */}
        <TabsContent value="descricao" className="mt-4 space-y-4">
          <Panel title="Descrição">
            <Textarea
              rows={10}
              value={draft.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
            <Field label="Texto de encerramento" id="closing">
              <Textarea
                id="closing"
                rows={3}
                value={draft.closing_text ?? ""}
                onChange={(e) => set("closing_text", e.target.value)}
              />
            </Field>
          </Panel>
          {data ? (
            <HighlightsManager productId={data.product.id} rows={data.highlights} onChange={invalidate} />
          ) : (
            <Panel title="Diferenciais">
              <p className="text-sm text-muted-foreground">Salve o produto para adicionar diferenciais.</p>
            </Panel>
          )}
        </TabsContent>

        {/* AVALIAÇÕES */}
        <TabsContent value="avaliacoes" className="mt-4">
          {data ? (
            <ReviewsManager
              productId={data.product.id}
              rows={data.reviews}
              previews={data.previews}
              onChange={invalidate}
            />
          ) : (
            <Panel>
              <p className="text-sm text-muted-foreground">Salve o produto para adicionar avaliações.</p>
            </Panel>
          )}
        </TabsContent>

        {/* CHECKOUT */}
        <TabsContent value="checkout" className="mt-4">
          <Panel title="Checkout">
            <Field label="URL do checkout" id="checkout">
              <Input
                id="checkout"
                type="url"
                placeholder="https://..."
                value={draft.checkout_url ?? ""}
                onChange={(e) => set("checkout_url", e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const url = (draft.checkout_url ?? "").trim();
                try {
                  const parsed = new URL(url);
                  if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad");
                  window.open(parsed.toString(), "_blank", "noopener");
                } catch {
                  toast.error("Informe uma URL válida começando com http:// ou https://");
                }
              }}
            >
              <ExternalLink className="size-4" /> Testar checkout
            </Button>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Texto do botão principal" id="btn">
                <Input
                  id="btn"
                  placeholder="Comprar agora"
                  value={draft.checkout_button_text ?? ""}
                  onChange={(e) => set("checkout_button_text", e.target.value)}
                />
              </Field>
              <Field label="Texto secundário do botão" id="btnsub">
                <Input
                  id="btnsub"
                  placeholder="Promoção de R$ 33,90"
                  value={draft.checkout_button_subtext ?? ""}
                  onChange={(e) => set("checkout_button_subtext", e.target.value)}
                />
              </Field>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-end gap-2">
          {dirty && <span className="mr-auto text-xs text-amber-600">Alterações não salvas</span>}
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/produtos" })}>
            Cancelar
          </Button>
          {previewUrl && !isNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(previewUrl, "_blank", "noopener")}
            >
              Visualizar página
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : isNew ? "Criar produto" : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- IMAGENS ------------------------------- */

function ImagesManager({
  productId,
  images,
  previews,
  onChange,
}: {
  productId: string;
  images: Array<{ id: string; image_url: string; sort_order: number }>;
  previews: Record<string, string>;
  onChange: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (list.length === 0) return;
    setBusy(true);
    try {
      for (const [index, file] of list.entries()) {
        const path = await uploadProductImage(file, productId);
        await insertChild("product_images", {
          product_id: productId,
          image_url: path,
          sort_order: images.length + index,
        });
      }
      toast.success(`${list.length} imagem(ns) enviada(s).`);
      onChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }

  async function move(from: number, to: number) {
    await reorderChild("product_images", images, from, to);
    onChange();
  }

  return (
    <Panel title="Galeria">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground hover:border-primary/50"
      >
        <Upload className="size-5" />
        {busy ? "Enviando..." : "Arraste suas imagens aqui ou clique para selecionar"}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (event) => {
          if (event.target.files?.length) await handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((image, index) => (
          <div key={image.id} className="space-y-2 rounded-md border border-border p-2">
            <div className="relative">
              <img
                src={previews[image.image_url] ?? image.image_url}
                alt=""
                className="aspect-square w-full cursor-zoom-in rounded-md object-cover"
                onClick={() => setZoom(previews[image.image_url] ?? image.image_url)}
              />
              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  PRINCIPAL
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-1">
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Mover para trás" disabled={index === 0} onClick={() => move(index, index - 1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Mover para frente"
                  disabled={index === images.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Excluir imagem"
                className="text-destructive"
                onClick={async () => {
                  await deleteChild("product_images", image.id);
                  await removeStorageObject(image.image_url);
                  onChange();
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {index !== 0 && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => move(index, 0)}>
                Tornar principal
              </Button>
            )}
          </div>
        ))}
      </div>
      {images.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma imagem cadastrada.</p>}

      <Dialog open={!!zoom} onOpenChange={(open) => !open && setZoom(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Pré-visualização</DialogTitle></DialogHeader>
          {zoom && <img src={zoom} alt="" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

/* --------------------------- CHIPS PROMOCIONAIS -------------------------- */

function ChipsManager({
  productId,
  rows,
  onChange,
}: {
  productId: string;
  rows: Array<{ id: string; text: string; sort_order: number; is_active: boolean }>;
  onChange: () => void;
}) {
  const [text, setText] = useState("");

  return (
    <Panel title="Chips promocionais">
      <div className="flex gap-2">
        <Input className="flex-1" placeholder="Ex.: Frete grátis" value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          size="sm"
          onClick={async () => {
            if (!text.trim()) return;
            await insertChild("promotions", {
              product_id: productId,
              text: text.trim(),
              sort_order: rows.length,
              is_active: true,
            });
            setText("");
            onChange();
          }}
        >
          Adicionar
        </Button>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2 p-2">
            <Input
              className="min-w-40 flex-1"
              defaultValue={row.text}
              onBlur={async (e) => {
                if (e.target.value.trim() && e.target.value !== row.text) {
                  await updateChild("promotions", row.id, { text: e.target.value.trim() });
                  onChange();
                }
              }}
            />
            <Switch
              checked={row.is_active}
              onCheckedChange={async (checked) => {
                await updateChild("promotions", row.id, { is_active: checked });
                onChange();
              }}
            />
            <Button variant="ghost" size="icon" aria-label="Subir" disabled={index === 0} onClick={async () => { await reorderChild("promotions", rows, index, index - 1); onChange(); }}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Descer" disabled={index === rows.length - 1} onClick={async () => { await reorderChild("promotions", rows, index, index + 1); onChange(); }}>
              <ArrowDown className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Excluir" className="text-destructive" onClick={async () => { await deleteChild("promotions", row.id); onChange(); }}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum chip cadastrado.</p>}
      </div>
    </Panel>
  );
}

/* ------------------------------- DETALHES ------------------------------- */

function DetailsManager({
  productId,
  rows,
  onChange,
}: {
  productId: string;
  rows: Array<{ id: string; label: string; value: string | null; sort_order: number }>;
  onChange: () => void;
}) {
  return (
    <Panel title="Detalhes do produto">
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-32 flex-1"
              defaultValue={row.label}
              onBlur={async (e) => {
                if (e.target.value.trim() && e.target.value !== row.label) {
                  await updateChild("product_details", row.id, { label: e.target.value.trim() });
                  onChange();
                }
              }}
            />
            <Input
              className="min-w-32 flex-1"
              defaultValue={row.value ?? ""}
              onBlur={async (e) => {
                if (e.target.value !== (row.value ?? "")) {
                  await updateChild("product_details", row.id, { value: e.target.value });
                  onChange();
                }
              }}
            />
            <Button variant="ghost" size="icon" aria-label="Subir" disabled={index === 0} onClick={async () => { await reorderChild("product_details", rows, index, index - 1); onChange(); }}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Descer" disabled={index === rows.length - 1} onClick={async () => { await reorderChild("product_details", rows, index, index + 1); onChange(); }}>
              <ArrowDown className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Excluir" className="text-destructive" onClick={async () => { await deleteChild("product_details", row.id); onChange(); }}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await insertChild("product_details", {
            product_id: productId,
            label: "Novo detalhe",
            value: "",
            sort_order: rows.length,
          });
          onChange();
        }}
      >
        + Adicionar detalhe
      </Button>
    </Panel>
  );
}

/* ----------------------------- DIFERENCIAIS ----------------------------- */

function HighlightsManager({
  productId,
  rows,
  onChange,
}: {
  productId: string;
  rows: Array<{ id: string; text: string; sort_order: number }>;
  onChange: () => void;
}) {
  return (
    <Panel title="Diferenciais">
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-40 flex-1"
              defaultValue={row.text}
              onBlur={async (e) => {
                if (e.target.value.trim() && e.target.value !== row.text) {
                  await updateChild("product_highlights", row.id, { text: e.target.value.trim() });
                  onChange();
                }
              }}
            />
            <Button variant="ghost" size="icon" aria-label="Subir" disabled={index === 0} onClick={async () => { await reorderChild("product_highlights", rows, index, index - 1); onChange(); }}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Descer" disabled={index === rows.length - 1} onClick={async () => { await reorderChild("product_highlights", rows, index, index + 1); onChange(); }}>
              <ArrowDown className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Excluir" className="text-destructive" onClick={async () => { await deleteChild("product_highlights", row.id); onChange(); }}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await insertChild("product_highlights", {
            product_id: productId,
            text: "Novo diferencial",
            sort_order: rows.length,
          });
          onChange();
        }}
      >
        + Novo diferencial
      </Button>
    </Panel>
  );
}

/* ------------------------------ AVALIAÇÕES ------------------------------ */

type ReviewRow = {
  id: string;
  customer_name: string;
  avatar_initial: string | null;
  rating: number;
  comment: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

function ReviewsManager({
  productId,
  rows,
  previews,
  onChange,
}: {
  productId: string;
  rows: ReviewRow[];
  previews: Record<string, string>;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [open, setOpen] = useState(false);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  return (
    <Panel title="Avaliações">
      <Button size="sm" onClick={openNew}>+ Adicionar avaliação</Button>

      <div className="divide-y divide-border rounded-md border border-border">
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 p-3">
            {row.image_url && (
              <img
                src={previews[row.image_url] ?? row.image_url}
                alt=""
                className="size-12 rounded-md border border-border object-cover"
              />
            )}
            <div className="min-w-40 flex-1">
              <p className="text-sm text-amber-500">{"★".repeat(row.rating)}<span className="text-muted-foreground">{"★".repeat(5 - row.rating)}</span></p>
              <p className="text-sm font-medium">{row.customer_name}</p>
              <p className="truncate text-xs text-muted-foreground">{row.comment}</p>
            </div>
            <span className={`text-xs ${row.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
              {row.is_active ? "Ativa" : "Oculta"}
            </span>
            <Button variant="ghost" size="icon" aria-label="Subir" disabled={index === 0} onClick={async () => { await reorderChild("reviews", rows, index, index - 1); onChange(); }}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Descer" disabled={index === rows.length - 1} onClick={async () => { await reorderChild("reviews", rows, index, index + 1); onChange(); }}>
              <ArrowDown className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setEditing(row); setOpen(true); }}>Editar</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const { id: _id, ...copy } = row;
                await insertChild("reviews", { ...copy, product_id: productId, sort_order: rows.length });
                onChange();
              }}
            >
              Duplicar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await updateChild("reviews", row.id, { is_active: !row.is_active });
                onChange();
              }}
            >
              {row.is_active ? "Ocultar" : "Exibir"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Excluir"
              className="text-destructive"
              onClick={async () => {
                await deleteChild("reviews", row.id);
                if (row.image_url) await removeStorageObject(row.image_url);
                onChange();
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma avaliação cadastrada.</p>}
      </div>

      <ReviewDialog
        key={editing?.id ?? "new"}
        open={open}
        onOpenChange={setOpen}
        productId={productId}
        review={editing}
        nextOrder={rows.length}
        onSaved={onChange}
      />
    </Panel>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  productId,
  review,
  nextOrder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  review: ReviewRow | null;
  nextOrder: number;
  onSaved: () => void;
}) {
  const [name, setName] = useState(review?.customer_name ?? "");
  const [rating, setRating] = useState(String(review?.rating ?? 5));
  const [comment, setComment] = useState(review?.comment ?? "");
  const [active, setActive] = useState(review?.is_active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    setSaving(true);
    try {
      const path = file ? await uploadProductImage(file, productId) : null;
      const values = {
        customer_name: name.trim(),
        avatar_initial: name.trim().charAt(0).toUpperCase(),
        rating: Number(rating),
        comment: comment.trim() || null,
        is_active: active,
        ...(path ? { image_url: path } : {}),
      };
      if (review) {
        await updateChild("reviews", review.id, values);
        toast.success("Avaliação atualizada.");
      } else {
        await insertChild("reviews", {
          ...values,
          image_url: path,
          product_id: productId,
          sort_order: nextOrder,
        });
        toast.success("Avaliação criada.");
      }
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{review ? "Editar avaliação" : "Nova avaliação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nome do cliente" id="rv-name">
            <Input id="rv-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Nota">
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((value) => (
                  <SelectItem key={value} value={String(value)}>{"★".repeat(value)} ({value})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Comentário" id="rv-comment">
            <Textarea id="rv-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
          </Field>
          <Field label="Foto (opcional)" id="rv-photo">
            <Input id="rv-photo" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <div className="flex items-center gap-3">
            <Switch id="rv-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="rv-active">{active ? "Ativa" : "Oculta"}</Label>
          </div>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando..." : "Salvar avaliação"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
