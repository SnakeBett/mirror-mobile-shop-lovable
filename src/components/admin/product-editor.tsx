import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, ExternalLink, GripVertical, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ProductStorePanel } from "@/components/admin/product-store-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageSettingsPanel } from "@/components/admin/page-settings-panel";
import { CheckoutLinksManager, QuantityOffersManager, VariantsManager } from "@/components/admin/variants-manager";
import { ProductCheckoutsList } from "@/components/admin/product-checkouts-list";
import { ReviewImportDialog } from "@/components/admin/review-import-dialog";
import { DEFAULT_PAGE_SETTINGS, type PageSettings } from "@/lib/page-settings";
import { buildTree, listCategories } from "@/lib/categories";
import {
  createProduct,
  savePageSettings,

  deleteChild,
  getProduct,
  insertChild,
  listRecommendationOptions,
  listRecommendations,
  saveRecommendations,
  removeStorageObject,
  reorderChild,
  updateChild,
  updateProduct,
  uploadProductImage,
  createReview,
  saveReviewImages,
  REVIEW_PHOTO_LIMIT,
} from "@/lib/admin-queries";
import { calcDiscount, slugify, type ProductOffer, type ProductRow } from "@/lib/product-types";
import { currencyBRL, getProductPerformance } from "@/lib/sales-queries";
import {
  getAppSettings,
  getProductFunnel,
  getTrafficSources,
  percent,
  ratio,
  resolveRange,
} from "@/lib/analytics-queries";

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
  sales_count_display: "",
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
  ["variacoes", "Variações"],
  ["entrega", "Entrega"],
  ["detalhes", "Detalhes"],
  ["loja", "Loja"],
  ["descricao", "Descrição"],
  ["avaliacoes", "Avaliações"],
  ["pagina", "Página"],
  ["recomendacoes", "Recomendações"],
  ["desempenho", "Desempenho"],
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

function RatingInput({ value, onChange }: { value: number | null | undefined; onChange: (value: number | null) => void }) {
  const [display, setDisplay] = useState(value == null ? "" : String(value).replace(".", ","));

  useEffect(() => {
    setDisplay(value == null ? "" : String(value).replace(".", ","));
  }, [value]);

  return (
    <Input
      id="rating"
      type="text"
      inputMode="decimal"
      placeholder="Ex.: 4,8"
      value={display}
      onChange={(event) => {
        const next = event.target.value;
        if (!/^\d?(?:[.,]\d?)?$/.test(next)) return;
        const parsed = Number(next.replace(",", "."));
        if (next && !Number.isNaN(parsed) && parsed > 5) return;
        setDisplay(next);
        if (next === "") onChange(null);
        else if (!/[.,]$/.test(next)) onChange(parsed);
      }}
      onBlur={() => {
        if (display.endsWith(",") || display.endsWith(".")) {
          const parsed = Number(display.slice(0, -1));
          setDisplay(String(parsed).replace(".", ","));
          onChange(parsed);
        }
      }}
    />
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
  const [page, setPage] = useState<PageSettings>(DEFAULT_PAGE_SETTINGS);
  const [pageBaseline, setPageBaseline] = useState<PageSettings>(DEFAULT_PAGE_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("geral");

  useEffect(() => {
    if (query.data?.product) {
      const next = { ...emptyDraft, ...query.data.product };
      setDraft(next);
      setBaseline(next);
    }
    if (query.data?.page) {
      setPage(query.data.page);
      setPageBaseline(query.data.page);
    }
  }, [query.data?.product, query.data?.page]);

  const productDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);
  const pageDirty = useMemo(() => JSON.stringify(page) !== JSON.stringify(pageBaseline), [page, pageBaseline]);
  const dirty = productDirty || pageDirty;


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
      if (!productId) throw new Error("Produto não encontrado.");
      if (productDirty) {
        await updateProduct(productId, values);
        setBaseline(draft);
      }
      if (pageDirty) {
        await savePageSettings(productId, page);
        setPageBaseline(page);
      }
      invalidate();
      toast.success("Produto atualizado com sucesso");

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : "Não foi possível salvar.";
      toast.error(message);
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
              <Field label="Quantidade vendida exibida (opcional)" id="salesdisplay">
                <Input
                  id="salesdisplay"
                  placeholder="Ex.: 5 mil+ vendidos"
                  value={(draft as Record<string, unknown>)["sales_count_display"] as string ?? ""}
                  onChange={(e) => set("sales_count_display" as keyof Draft, e.target.value as never)}
                />
                <p className="text-xs text-muted-foreground">
                  Apenas visual. Não altera os pedidos reais registrados em Vendas.
                </p>
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

          <CategoryFields
            categoryId={draft.category_id ?? null}
            subcategoryId={draft.subcategory_id ?? null}
            onChange={(categoryId, subcategoryId) =>
              setDraft((prev) => ({ ...prev, category_id: categoryId, subcategory_id: subcategoryId }))
            }
          />


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
                  <RatingInput value={draft.rating} onChange={(value) => set("rating", value)} />
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

          <Panel title="Faixa promocional">
            <div className="flex items-center gap-3">
              <Switch
                id="offer-banner-enabled"
                checked={page.offer_banner_settings.enabled}
                onCheckedChange={(enabled) => setPage((current) => ({
                  ...current,
                  offer_banner_settings: { ...current.offer_banner_settings, enabled },
                }))}
              />
              <Label htmlFor="offer-banner-enabled">Exibir faixa promocional</Label>
            </div>
            <BannerSettingsEditor
              settings={page.offer_banner_settings}
              onChange={(patch) => setPage((current) => ({
                ...current,
                offer_banner_settings: { ...current.offer_banner_settings, ...patch },
              }))}
            />
          </Panel>

          {data ? (
            <>
              <QuantityOffersManager
                productId={data.product.id}
                basePrice={Number(draft.current_price ?? 0)}
                defaultCheckoutUrl={draft.checkout_url ?? null}
                rows={data.quantityOffers}
                enabled={page.variant_settings.quantity_offers_enabled}
                onToggle={(enabled) => setPage((current) => ({
                  ...current,
                  variant_settings: { ...current.variant_settings, quantity_offers_enabled: enabled },
                }))}
                onChange={invalidate}
              />
              <OffersManager productId={data.product.id} rows={data.offers} onChange={invalidate} />
              <ChipsManager productId={data.product.id} rows={data.promotions} onChange={invalidate} />
            </>
          ) : (
            <Panel title="Ofertas e benefícios">
              <p className="text-sm text-muted-foreground">Salve o produto para adicionar ofertas.</p>
            </Panel>
          )}
        </TabsContent>

        {/* VARIAÇÕES */}
        <TabsContent value="variacoes" className="mt-4">
          {data ? (
            <VariantsManager
              productId={data.product.id}
              basePrice={Number(draft.current_price ?? 0)}
              attributes={data.attributes}
              variants={data.variants}
              images={data.images
                .map((row) => ({ path: row.image_url, url: data.previews[row.image_url] ?? "" }))
                .filter((row) => row.url)}
              settings={page.variant_settings}
              onSettings={(patch) => setPage((current) => ({
                ...current,
                variant_settings: { ...current.variant_settings, ...patch },
              }))}
              onChange={invalidate}
            />
          ) : (
            <Panel title="Variações">
              <p className="text-sm text-muted-foreground">Salve o produto para adicionar variações.</p>
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
        <TabsContent value="loja" className="mt-4">
          <ProductStorePanel storeId={draft.store_id ?? null} onChange={(id) => set("store_id", id)} />
        </TabsContent>

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

        <TabsContent value="recomendacoes" className="mt-4">
          {data ? (
            <RecommendationsPanel
              productId={data.product.id}
              settings={page.recommendation_settings}
              onSettingsChange={(next) =>
                setPage((prev) => ({ ...prev, recommendation_settings: { ...prev.recommendation_settings, ...next } }))
              }
            />
          ) : (
            <Panel title="Recomendações">
              <p className="text-sm text-muted-foreground">Salve o produto para configurar recomendações.</p>
            </Panel>
          )}
        </TabsContent>

        <TabsContent value="desempenho" className="mt-4">
          {data ? (
            <PerformancePanel productId={data.product.id} />
          ) : (
            <Panel title="Desempenho">
              <p className="text-sm text-muted-foreground">Salve o produto para acompanhar as vendas.</p>
            </Panel>
          )}
        </TabsContent>

        {/* CHECKOUT */}
        <TabsContent value="checkout" className="mt-4">
          <Panel title="Checkout padrão">
            <p className="text-xs text-muted-foreground">
              Usado como fallback quando a oferta ou variação não possui checkout próprio.
            </p>
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

          {data && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Checkouts por produto</h2>
              <ProductCheckoutsList currentProductId={data.product.id} />
            </div>
          )}

          <Panel title="Rastreamento">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.tracking_use_global !== false}
                onChange={(e) => set("tracking_use_global", e.target.checked)}
              />
              Usar os pixels globais da loja
            </label>
            {draft.tracking_use_global === false && (
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Meta Pixel ID" id="metapx">
                  <Input
                    id="metapx"
                    value={draft.meta_pixel_id ?? ""}
                    onChange={(e) => set("meta_pixel_id", e.target.value)}
                  />
                </Field>
                <Field label="TikTok Pixel ID" id="ttpx">
                  <Input
                    id="ttpx"
                    value={draft.tiktok_pixel_id ?? ""}
                    onChange={(e) => set("tiktok_pixel_id", e.target.value)}
                  />
                </Field>
                <Field label="Google Analytics (GA4)" id="gapx">
                  <Input
                    id="gapx"
                    value={draft.ga_measurement_id ?? ""}
                    onChange={(e) => set("ga_measurement_id", e.target.value)}
                  />
                </Field>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              O evento de compra é registrado apenas com a confirmação do pagamento no webhook.
            </p>
          </Panel>
        </TabsContent>


        {/* PÁGINA */}
        <TabsContent value="pagina" className="mt-4">
          {isNew ? (
            <Panel title="Página">
              <p className="text-sm text-muted-foreground">
                Salve o produto para configurar a apresentação da página pública.
              </p>
            </Panel>
          ) : (
            <PageSettingsPanel
              page={page}
              onChange={setPage}
              canPreview={!!previewUrl}
              onPreview={() => previewUrl && window.open(previewUrl, "_blank", "noopener")}
              onSaveAndPreview={async () => {
                await save();
                if (previewUrl) window.open(previewUrl, "_blank", "noopener");
              }}
            />
          )}
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

/* --------------------------- FAIXA PROMOCIONAL -------------------------- */

function BannerSettingsEditor({
  settings,
  onChange,
}: {
  settings: PageSettings["offer_banner_settings"];
  onChange: (patch: Partial<PageSettings["offer_banner_settings"]>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Tipo de oferta">
          <Select value={settings.offer_type} onValueChange={(value) => onChange({ offer_type: value as typeof settings.offer_type })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="flash">Oferta Relâmpago</SelectItem>
              <SelectItem value="special">Oferta Especial</SelectItem>
              <SelectItem value="promotion">Promoção</SelectItem>
              <SelectItem value="last_units">Últimas unidades</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ícone (opcional)"><Input value={settings.icon} maxLength={4} onChange={(e) => onChange({ icon: e.target.value })} /></Field>
        {settings.offer_type === "custom" && (
          <Field label="Texto personalizado"><Input value={settings.custom_text} onChange={(e) => onChange({ custom_text: e.target.value })} /></Field>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Preço exibido">
          <Select value={settings.current_price_source} onValueChange={(value) => onChange({ current_price_source: value as "product" | "custom" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="product">Usar preço do produto</SelectItem><SelectItem value="custom">Preço personalizado</SelectItem></SelectContent>
          </Select>
        </Field>
        {settings.current_price_source === "custom" && <Field label="Preço personalizado (R$)"><Input type="number" min="0" step="0.01" value={settings.current_price} onChange={(e) => onChange({ current_price: Number(e.target.value) })} /></Field>}
        <Field label="Preço anterior">
          <Select value={settings.old_price_source} onValueChange={(value) => onChange({ old_price_source: value as "product" | "custom" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="product">Usar preço anterior do produto</SelectItem><SelectItem value="custom">Preço personalizado</SelectItem></SelectContent>
          </Select>
        </Field>
        {settings.old_price_source === "custom" && <Field label="Preço anterior personalizado (R$)"><Input type="number" min="0" step="0.01" value={settings.old_price} onChange={(e) => onChange({ old_price: Number(e.target.value) })} /></Field>}
        <Field label="Desconto">
          <Select value={settings.discount_mode} onValueChange={(value) => onChange({ discount_mode: value as "automatic" | "manual" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="automatic">Automático</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
          </Select>
        </Field>
        {settings.discount_mode === "manual" && <Field label="Desconto manual (%)"><Input type="number" min="0" max="99" value={settings.manual_discount} onChange={(e) => onChange({ manual_discount: Number(e.target.value) })} /></Field>}
      </div>
      <div className="flex items-center gap-3">
        <Switch id="offer-show-from" checked={settings.show_from} onCheckedChange={(show_from) => onChange({ show_from })} />
        <Label htmlFor="offer-show-from">Mostrar “A partir de”</Label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Cor inicial do degradê"><Input type="color" value={settings.gradient_start} onChange={(e) => onChange({ gradient_start: e.target.value })} /></Field>
        <Field label="Cor final do degradê"><Input type="color" value={settings.gradient_end} onChange={(e) => onChange({ gradient_end: e.target.value })} /></Field>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onChange({ gradient_start: "#ff7a18", gradient_end: "#ff4d22" })}>
        <RotateCcw className="size-4" /> Restaurar cores padrão
      </Button>
    </div>
  );
}

/* -------------------------- OFERTAS E BENEFÍCIOS ------------------------ */

const blankOffer = {
  title: "",
  subtitle: "",
  offer_type: "discount",
  discount_type: "none",
  discount_value: null,
  coupon_code: "",
  button_text: "Resgatar",
  button_action: "none",
  button_url: "",
  icon: "tag",
  is_active: true,
  starts_at: "",
  ends_at: "",
} as const;

function OffersManager({ productId, rows, onChange }: { productId: string; rows: ProductOffer[]; onChange: () => void }) {
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...blankOffer });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const patchDraft = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  async function addOffer() {
    const title = String(draft["title"] ?? "").trim();
    if (!title) {
      toast.error("Informe o título da oferta.");
      return;
    }
    await insertChild("product_offers", {
      ...draft,
      title,
      subtitle: String(draft["subtitle"] ?? "").trim() || null,
      coupon_code: String(draft["coupon_code"] ?? "").trim() || null,
      button_text: String(draft["button_text"] ?? "").trim() || null,
      button_url: String(draft["button_url"] ?? "").trim() || null,
      starts_at: draft["starts_at"] || null,
      ends_at: draft["ends_at"] || null,
      product_id: productId,
      sort_order: rows.length,
    });
    setDraft({ ...blankOffer });
    onChange();
    toast.success("Oferta adicionada.");
  }

  return (
    <Panel title="Ofertas e benefícios">
      <p className="text-xs text-muted-foreground">As ofertas ativas aparecem em um carrossel na ordem abaixo.</p>
      <OfferFields value={draft} onChange={patchDraft} />
      <Button type="button" size="sm" onClick={() => void addOffer()}><Plus className="size-4" /> Adicionar oferta</Button>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            key={row.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={async (event) => {
              event.preventDefault();
              if (dragIndex !== null && dragIndex !== index) await reorderChild("product_offers", rows, dragIndex, index);
              setDragIndex(null);
              onChange();
            }}
            className="space-y-3 rounded-md border border-border p-3"
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
              <GripVertical className="size-4 cursor-grab text-muted-foreground" />
              <strong className="truncate text-sm">{index + 1}. {row.title}</strong>
              <div className="flex items-center gap-1">
                <Switch checked={row.is_active} onCheckedChange={async (is_active) => { await updateChild("product_offers", row.id, { is_active }); onChange(); }} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Duplicar oferta"
                  onClick={async () => {
                    const { id: _id, ...copy } = row;
                    await insertChild("product_offers", {
                      ...copy,
                      title: `${row.title} (cópia)`,
                      product_id: productId,
                      sort_order: rows.length,
                    });
                    onChange();
                    toast.success("Oferta duplicada.");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Subir" disabled={index === 0} onClick={async () => { await reorderChild("product_offers", rows, index, index - 1); onChange(); }}><ArrowUp className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Descer" disabled={index === rows.length - 1} onClick={async () => { await reorderChild("product_offers", rows, index, index + 1); onChange(); }}><ArrowDown className="size-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Excluir oferta" className="text-destructive" onClick={async () => { await deleteChild("product_offers", row.id); onChange(); }}><Trash2 className="size-4" /></Button>
              </div>
            </div>
            <OfferFields
              value={row as unknown as Record<string, unknown>}
              onChange={(key, value) => void updateChild("product_offers", row.id, { [key]: value === "" && (key === "starts_at" || key === "ends_at") ? null : value }).then(onChange)}
            />
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma oferta cadastrada.</p>}
      </div>
    </Panel>
  );
}

function OfferFields({ value, onChange }: { value: Record<string, unknown>; onChange: (key: string, value: unknown) => void }) {
  const textValue = (key: string) => String(value[key] ?? "");
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Título"><Input value={textValue("title")} onChange={(e) => onChange("title", e.target.value)} /></Field>
      <Field label="Subtítulo"><Input value={textValue("subtitle")} onChange={(e) => onChange("subtitle", e.target.value)} /></Field>
      <Field label="Tipo de benefício"><Select value={textValue("offer_type")} onValueChange={(v) => onChange("offer_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="discount">Desconto</SelectItem><SelectItem value="percentage">Percentual</SelectItem><SelectItem value="free_shipping">Frete grátis</SelectItem><SelectItem value="bundle">Leve mais</SelectItem><SelectItem value="pix">PIX</SelectItem><SelectItem value="coupon">Cupom</SelectItem><SelectItem value="custom">Personalizado</SelectItem></SelectContent></Select></Field>
      <Field label="Formato do valor"><Select value={textValue("discount_type")} onValueChange={(v) => onChange("discount_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem valor numérico</SelectItem><SelectItem value="fixed">Valor em reais</SelectItem><SelectItem value="percentage">Percentual</SelectItem></SelectContent></Select></Field>
      <Field label="Valor"><Input type="number" min="0" step="0.01" value={value["discount_value"] == null ? "" : Number(value["discount_value"])} onChange={(e) => onChange("discount_value", e.target.value === "" ? null : Number(e.target.value))} /></Field>
      <Field label="Código do cupom (opcional)"><Input value={textValue("coupon_code")} onChange={(e) => onChange("coupon_code", e.target.value)} /></Field>
      <Field label="Ícone"><Select value={textValue("icon")} onValueChange={(v) => onChange("icon", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tag">Etiqueta</SelectItem><SelectItem value="truck">Envio/Frete</SelectItem><SelectItem value="percent">Percentual</SelectItem><SelectItem value="gift">Presente</SelectItem><SelectItem value="zap">Relâmpago</SelectItem><SelectItem value="ticket">Cupom</SelectItem></SelectContent></Select></Field>
      <Field label="Texto do botão"><Input value={textValue("button_text")} onChange={(e) => onChange("button_text", e.target.value)} /></Field>
      <Field label="Ação do botão"><Select value={textValue("button_action")} onValueChange={(v) => onChange("button_action", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="select">Apenas selecionar oferta</SelectItem><SelectItem value="copy_coupon">Copiar cupom</SelectItem><SelectItem value="apply_coupon">Aplicar cupom</SelectItem><SelectItem value="open_link">Abrir link</SelectItem><SelectItem value="none">Sem ação</SelectItem></SelectContent></Select></Field>
      {textValue("button_action") === "open_link" && <Field label="Link"><Input type="url" value={textValue("button_url")} onChange={(e) => onChange("button_url", e.target.value)} /></Field>}
      <Field label="Início (opcional)"><Input type="datetime-local" value={textValue("starts_at").slice(0, 16)} onChange={(e) => onChange("starts_at", e.target.value ? new Date(e.target.value).toISOString() : "")} /></Field>
      <Field label="Fim (opcional)"><Input type="datetime-local" value={textValue("ends_at").slice(0, 16)} onChange={(e) => onChange("ends_at", e.target.value ? new Date(e.target.value).toISOString() : "")} /></Field>
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
  images: Array<{ id: string; image_url: string; sort_order: number }>;
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
  const [importOpen, setImportOpen] = useState(false);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  return (
    <Panel title="Avaliações">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={openNew}>+ Adicionar avaliação</Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>✨ Importar avaliações</Button>
      </div>
      <ReviewImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        productId={productId}
        nextOrder={rows.length}
        onImported={onChange}
      />

      <div className="divide-y divide-border rounded-md border border-border">
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 p-3">
            {(row.images[0]?.image_url ?? row.image_url) && (
              <div className="relative">
                <img
                  src={previews[row.images[0]?.image_url ?? row.image_url!] ?? row.images[0]?.image_url ?? row.image_url!}
                  alt=""
                  className="size-12 rounded-md border border-border object-cover"
                />
                {row.images.length > 1 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {row.images.length}
                  </span>
                )}
              </div>
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
                const { id: _id, images: copyImages, ...copy } = row;
                const newId = await createReview({ ...copy, product_id: productId, sort_order: rows.length });
                if (copyImages.length > 0) await saveReviewImages(newId, copyImages.map((img) => img.image_url));
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
                const paths = new Set([row.image_url, ...row.images.map((img) => img.image_url)].filter(Boolean) as string[]);
                for (const path of paths) await removeStorageObject(path);
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
        previews={previews}
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
  previews,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  review: ReviewRow | null;
  nextOrder: number;
  previews: Record<string, string>;
  onSaved: () => void;
}) {
  const [name, setName] = useState(review?.customer_name ?? "");
  const [rating, setRating] = useState(String(review?.rating ?? 5));
  const [comment, setComment] = useState(review?.comment ?? "");
  const [active, setActive] = useState(review?.is_active ?? true);
  type Photo = { key: string; path?: string; file?: File; url: string };
  const initialPhotos: Photo[] = (review?.images.length
    ? review.images.map((img) => img.image_url)
    : review?.image_url
      ? [review.image_url]
      : []
  ).map((path) => ({ key: path, path, url: previews[path] ?? path }));
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [saving, setSaving] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = REVIEW_PHOTO_LIMIT - photos.length;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (files.length > room) toast.error(`Limite de ${REVIEW_PHOTO_LIMIT} fotos por avaliação.`);
    const added = files.slice(0, Math.max(0, room)).map((file) => ({
      key: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...added]);
  }

  function movePhoto(index: number, delta: number) {
    setPhotos((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    setSaving(true);
    try {
      const paths: string[] = [];
      for (const photo of photos) {
        paths.push(photo.path ?? (await uploadProductImage(photo.file!, productId)));
      }
      const values = {
        customer_name: name.trim(),
        avatar_initial: name.trim().charAt(0).toUpperCase(),
        rating: Number(rating),
        comment: comment.trim() || null,
        is_active: active,
      };
      let reviewId = review?.id;
      if (reviewId) {
        await updateChild("reviews", reviewId, values);
      } else {
        reviewId = await createReview({ ...values, product_id: productId, sort_order: nextOrder });
      }
      await saveReviewImages(reviewId, paths);
      toast.success(review ? "Avaliação atualizada." : "Avaliação criada.");
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
          <Field label="Fotos da avaliação (opcional)" id="rv-photo">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="rv-photo"
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent ${photos.length >= REVIEW_PHOTO_LIMIT ? "pointer-events-none opacity-50" : ""}`}
              >
                <Upload className="size-4" /> Selecionar fotos
              </label>
              <span className="text-xs text-muted-foreground">{photos.length}/{REVIEW_PHOTO_LIMIT} fotos</span>
            </div>
            <input
              id="rv-photo"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <div key={photo.key} className="space-y-1 rounded-md border border-border p-1">
                    <img src={photo.url} alt={`Foto ${index + 1}`} className="aspect-square w-full rounded object-cover" />
                    <div className="flex items-center justify-between">
                      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Mover para trás" disabled={index === 0} onClick={() => movePhoto(index, -1)}>
                        <ArrowUp className="size-3 -rotate-90" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" aria-label="Remover foto" onClick={() => setPhotos((prev) => prev.filter((p) => p.key !== photo.key))}>
                        <Trash2 className="size-3" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Mover para frente" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)}>
                        <ArrowDown className="size-3 -rotate-90" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

function PerformancePanel({ productId }: { productId: string }) {
  const perf = useQuery({
    queryKey: ["admin", "product-performance", productId],
    queryFn: () => getProductPerformance(productId),
  });
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: getAppSettings });
  const tz = settings.data?.timezone ?? "America/Sao_Paulo";
  const range = useMemo(() => resolveRange("30d", tz), [tz]);

  const funnel = useQuery({
    queryKey: ["admin", "product-funnel", productId, range],
    queryFn: () => getProductFunnel(productId, range),
  });
  const sources = useQuery({
    queryKey: ["admin", "sources", range, productId],
    queryFn: () => getTrafficSources(range, productId),
  });

  const cards: Array<[string, string]> = [
    ["Vendas totais", perf.data ? String(perf.data.orders_total) : "—"],
    ["Faturamento total", perf.data ? currencyBRL.format(perf.data.revenue_total) : "—"],
    ["Vendas 7 dias", perf.data ? String(perf.data.orders_7d) : "—"],
    ["Faturamento 7 dias", perf.data ? currencyBRL.format(perf.data.revenue_7d) : "—"],
    ["Vendas 30 dias", perf.data ? String(perf.data.orders_30d) : "—"],
    ["Faturamento 30 dias", perf.data ? currencyBRL.format(perf.data.revenue_30d) : "—"],
  ];

  const steps: Array<[string, number, number]> = [
    ["Visualizações", funnel.data?.views ?? 0, funnel.data?.views ?? 0],
    ["Cliques em comprar", funnel.data?.buy_clicks ?? 0, funnel.data?.views ?? 0],
    ["Checkouts", funnel.data?.checkouts ?? 0, funnel.data?.buy_clicks ?? 0],
    ["Vendas", funnel.data?.orders_count ?? 0, funnel.data?.checkouts ?? 0],
  ];

  return (
    <>
      <Panel title="Desempenho (pedidos pagos)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Baseado nos pedidos reais recebidos pelo webhook de pagamento.
        </p>
      </Panel>

      <Panel title="Funil deste produto (30 dias)">
        <div className="space-y-3">
          {steps.map(([label, value, base], index) => (
            <div key={label}>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <span>
                  {value.toLocaleString("pt-BR")}
                  {index > 0 && ` · ${percent(ratio(value, base))}`}
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full rounded bg-muted">
                <div
                  className="h-2.5 rounded bg-primary/80"
                  style={{ width: `${Math.max(2, ratio(value, Math.max(1, funnel.data?.views ?? 1)))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Conversão: {percent(ratio(funnel.data?.orders_count ?? 0, funnel.data?.views ?? 0))} ·
          Recomendações vistas {funnel.data?.rec_views ?? 0} · cliques {funnel.data?.rec_clicks ?? 0}
        </p>
      </Panel>

      <Panel title="Origens de tráfego (30 dias)">
        <div className="divide-y divide-border">
          {(sources.data ?? []).map((row) => (
            <div key={row.source} className="flex items-center justify-between py-2 text-sm">
              <span className="truncate">{row.source}</span>
              <span className="text-xs text-muted-foreground">
                {row.visitors} visitantes · {row.orders_count} vendas · {currencyBRL.format(row.revenue)}
              </span>
            </div>
          ))}
          {(sources.data ?? []).length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">Sem tráfego registrado ainda.</p>
          )}
        </div>
      </Panel>
    </>
  );
}

function RecommendationsPanel({
  productId,
  settings,
  onSettingsChange,
}: {
  productId: string;
  settings: PageSettings["recommendation_settings"];
  onSettingsChange: (next: Partial<PageSettings["recommendation_settings"]>) => void;
}) {
  const options = useQuery({
    queryKey: ["admin", "recommendation-options", productId],
    queryFn: () => listRecommendationOptions(productId),
  });
  const current = useQuery({
    queryKey: ["admin", "recommendations", productId],
    queryFn: () => listRecommendations(productId),
  });

  const [selected, setSelected] = useState<string[] | null>(null);
  const ids = selected ?? current.data ?? [];
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => {
    const map = new Map<string, string>();
    (options.data ?? []).forEach((option) => map.set(option.id, option.name));
    return map;
  }, [options.data]);

  const available = (options.data ?? []).filter((option) => !ids.includes(option.id));

  async function persist(next: string[]) {
    setSelected(next);
    setBusy(true);
    try {
      await saveRecommendations(productId, next);
      await current.refetch();
      toast.success("Recomendações atualizadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void persist(next);
  }

  return (
    <div className="space-y-4">
      <Panel title="Configuração da seção">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Título da seção" id="rec-title">
            <Input
              id="rec-title"
              placeholder="Compre também"
              value={settings.title}
              onChange={(e) => onSettingsChange({ title: e.target.value })}
            />
          </Field>
          <Field label="Modo" id="rec-mode">
            <select
              id="rec-mode"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={settings.mode}
              onChange={(e) => onSettingsChange({ mode: e.target.value as typeof settings.mode })}
            >
              <option value="auto">Automático</option>
              <option value="manual">Manual</option>
              <option value="manual_auto">Automático + Manual</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Automático mostra só produtos da mesma subcategoria e depois da mesma categoria. Nunca de outras categorias.
            </p>
          </Field>
          <Field label="Ordem dos automáticos" id="rec-criteria">
            <select
              id="rec-criteria"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={settings.auto_criteria === "recent" ? "recent" : "best_sellers"}
              onChange={(e) => onSettingsChange({ auto_criteria: e.target.value as typeof settings.auto_criteria })}
            >
              <option value="best_sellers">Mais vendidos primeiro (depois mais recentes)</option>
              <option value="recent">Mais recentes</option>
            </select>
          </Field>
          <Field label="Máximo de recomendações" id="rec-limit">
            <Input
              id="rec-limit"
              type="number"
              min="1"
              max="12"
              value={settings.limit}
              onChange={(e) => onSettingsChange({ limit: Number(e.target.value) })}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          As configurações da seção são salvas junto com o produto.
        </p>
      </Panel>

      <Panel title="Produtos recomendados (manual)">
        {ids.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto selecionado.</p>}
        <ul className="space-y-2">
          {ids.map((id, index) => (
            <li key={id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <span className="flex-1 truncate text-sm">{byId.get(id) ?? id}</span>
              <Button size="sm" variant="ghost" disabled={busy || index === 0} onClick={() => move(index, -1)}>
                ↑
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || index === ids.length - 1} onClick={() => move(index, 1)}>
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void persist(ids.filter((value) => value !== id))}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>

        <ManualSearch
          options={available}
          disabled={busy}
          onAdd={(id) => void persist([...ids, id])}
        />
      </Panel>
    </div>
  );
}

function ManualSearch({
  options,
  disabled,
  onAdd,
}: {
  options: Array<{ id: string; name: string; is_active: boolean }>;
  disabled: boolean;
  onAdd: (id: string) => void;
}) {
  const [term, setTerm] = useState("");
  const q = term.trim().toLowerCase();
  const matches = q ? options.filter((option) => option.name.toLowerCase().includes(q)).slice(0, 8) : [];
  return (
    <div className="space-y-2">
      <Input
        placeholder="Buscar produto pelo nome..."
        value={term}
        disabled={disabled}
        onChange={(e) => setTerm(e.target.value)}
      />
      {q && matches.length === 0 && <p className="text-xs text-muted-foreground">Nenhum produto encontrado.</p>}
      {matches.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {matches.map((option) => (
            <li key={option.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 truncate">{option.name}</span>
              {!option.is_active && <span className="text-xs text-muted-foreground">Inativo</span>}
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  onAdd(option.id);
                  setTerm("");
                }}
              >
                Adicionar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryFields({
  categoryId,
  subcategoryId,
  onChange,
}: {
  categoryId: string | null;
  subcategoryId: string | null;
  onChange: (categoryId: string | null, subcategoryId: string | null) => void;
}) {
  const categories = useQuery({ queryKey: ["admin", "categories"], queryFn: listCategories });
  const tree = buildTree(categories.data ?? []);
  const subs = tree.find((root) => root.id === categoryId)?.children ?? [];
  const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
  return (
    <Panel title="Categoria">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Categoria" id="category">
          <select
            id="category"
            className={selectClass}
            value={categoryId ?? ""}
            onChange={(e) => onChange(e.target.value || null, null)}
          >
            <option value="">Sem categoria</option>
            {tree.map((root) => (
              <option key={root.id} value={root.id}>{root.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Subcategoria" id="subcategory">
          <select
            id="subcategory"
            className={selectClass}
            value={subcategoryId ?? ""}
            disabled={!categoryId || subs.length === 0}
            onChange={(e) => onChange(categoryId, e.target.value || null)}
          >
            <option value="">{!categoryId ? "Escolha a categoria primeiro" : "Sem subcategoria"}</option>
            {subs.map((sub) => (
              <option key={sub.id} value={sub.id}>{sub.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Usada nas recomendações automáticas e no dashboard. Gerencie em{" "}
        <a href="/admin/categorias" className="underline">Categorias</a>.
      </p>
    </Panel>
  );
}
