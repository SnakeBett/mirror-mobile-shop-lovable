import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  analyzeImportUrl,
  generateProductDescription,
  importImagesToStorage,
} from "@/lib/import.functions";
import {
  detectPlatform,
  FIELD_LABELS,
  PLATFORM_LABELS,
  type ImportAnalysis,
  type ImportedProduct,
} from "@/lib/import-types";
import {
  createProductFromImport,
  findExistingImport,
  listRecentImports,
  logImport,
  type ImportSelection,
} from "@/lib/import-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_admin/admin/importar")({
  head: () => ({
    meta: [
      { title: "Importar produto | Vitrine Admin" },
      { name: "description", content: "Importe produtos a partir de uma URL para acelerar o cadastro." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Importar produto | Vitrine Admin" },
      { property: "og:description", content: "Importe produtos a partir de uma URL para acelerar o cadastro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABELS: Record<string, string> = {
  analyzing: "Analisando",
  found: "Encontrado",
  partial: "Parcial",
  failed: "Falhou",
  imported: "Importado",
};

type DescriptionMode = "none" | "original" | "generated";

function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeImportUrl);
  const generate = useServerFn(generateProductDescription);
  const copyImages = useServerFn(importImagesToStorage);

  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [forceNew, setForceNew] = useState(false);

  const [selection, setSelection] = useState<ImportSelection>({
    name: true,
    currentPrice: true,
    oldPrice: true,
    attributes: true,
    rating: true,
    reviewCount: true,
    variants: false,
  });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [descriptionMode, setDescriptionMode] = useState<DescriptionMode>("generated");
  const [description, setDescription] = useState("");

  const platform = useMemo(() => detectPlatform(url), [url]);
  const product = analysis?.product ?? null;

  const history = useQuery({ queryKey: ["admin", "imports"], queryFn: () => listRecentImports() });

  function resetPreview(found: ImportedProduct) {
    setName(found.title ?? "");
    setPrice(found.currentPrice != null ? String(found.currentPrice) : "");
    setOldPrice(found.oldPrice != null ? String(found.oldPrice) : "");
    setSelectedImages(found.images);
    setSelectedVariants([]);
    setDescription("");
    setDescriptionMode(found.description ? "generated" : "generated");
  }

  async function handleAnalyze() {
    if (!url.trim()) {
      toast.error("URL inválida.");
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    setDuplicate(null);
    setForceNew(false);
    try {
      const result = await analyze({ data: { url: url.trim() } });
      setAnalysis(result);
      if (result.product) {
        resetPreview(result.product);
        const existing = await findExistingImport(result.product.sourceUrl, result.product.externalId);
        if (existing) setDuplicate({ id: existing.id, name: existing.name });
      }
      await logImport({
        source_platform: platform,
        source_url: url.trim(),
        external_product_id: result.product?.externalId ?? null,
        status: result.status,
        title: result.product?.title ?? null,
        missing_fields: result.missingFields,
        error_detail: result.message,
      }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["admin", "imports"] });
      if (result.status === "failed") toast.error(result.message ?? "Não foi possível importar.");
    } catch {
      toast.error("Não conseguimos analisar esta URL agora.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerateDescription() {
    if (!product) return;
    setGenerating(true);
    try {
      const result = await generate({
        data: {
          title: name || product.title || "",
          attributes: product.attributes,
          price: Number(price) || product.currentPrice,
        },
      });
      setDescription(result.description);
      setDescriptionMode("generated");
      toast.success("Descrição gerada. Revise antes de salvar.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar a descrição.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreate() {
    if (!product) return;
    if (duplicate && !forceNew) {
      toast.error("Escolha abrir o produto existente ou importar como novo.");
      return;
    }
    setCreating(true);
    try {
      const finalDescription =
        descriptionMode === "none"
          ? ""
          : descriptionMode === "original"
            ? (product.description ?? "")
            : description;

      const productId = await createProductFromImport({
        imported: product,
        selection,
        name: selection.name ? name : "Produto importado",
        currentPrice: Number(price.replace(",", ".")) || 0,
        oldPrice: oldPrice ? Number(oldPrice.replace(",", ".")) : null,
        description: finalDescription,
        selectedImagePaths: [],
        selectedAttributes: product.attributes,
        selectedVariants: product.variants.filter((variant) => selectedVariants.includes(variant.name)),
      });

      if (selectedImages.length > 0) {
        const { paths, skipped } = await copyImages({ data: { productId, urls: selectedImages } });
        if (paths.length > 0) {
          const { supabase } = await import("@/integrations/supabase/client");
          await supabase.from("product_images").insert(
            paths.map((path, index) => ({ product_id: productId, image_url: path, sort_order: index })) as never,
          );
        }
        if (skipped.length > 0) toast.warning(`${skipped.length} imagem(ns) não puderam ser copiadas.`);
      }

      await logImport({
        source_platform: product.source,
        source_url: product.sourceUrl,
        external_product_id: product.externalId,
        product_id: productId,
        status: analysis?.status === "partial" ? "partial" : "imported",
        title: name,
        missing_fields: analysis?.missingFields ?? [],
      }).catch(() => undefined);

      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Produto importado. Revise as informações antes de publicar.");
      navigate({ to: "/admin/produtos/$id", params: { id: productId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o produto.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Importar produto</h1>
        <p className="text-sm text-muted-foreground">
          Use uma URL de produto para acelerar a criação do seu cadastro.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border border-border bg-background p-4">
        <Label htmlFor="import-url">URL do produto</Label>
        <Input
          id="import-url"
          value={url}
          placeholder="https://..."
          onChange={(event) => setUrl(event.target.value)}
          className="h-12 text-base"
        />
        <p className="text-xs text-muted-foreground">
          Origem detectada: <span className="font-medium text-foreground">{PLATFORM_LABELS[platform]}</span>
        </p>
        <Button onClick={handleAnalyze} disabled={analyzing}>
          {analyzing && <Loader2 className="mr-2 size-4 animate-spin" />}
          ANALISAR PRODUTO
        </Button>
      </section>

      {analysis?.status === "failed" && (
        <section className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-foreground">{analysis.message}</p>
          {analysis.notices.map((notice) => (
            <p key={notice} className="text-xs text-muted-foreground">{notice}</p>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/produtos/novo">CRIAR PRODUTO MANUALMENTE</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/configuracoes/integracoes">Configurar integrações</Link>
            </Button>
          </div>
        </section>
      )}

      {product && (
        <section className="space-y-6 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Pré-visualização da importação</h2>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {PLATFORM_LABELS[product.source]} · {STATUS_LABELS[analysis?.status ?? "found"]}
            </span>
          </div>

          {duplicate && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm text-foreground">Este produto parece já ter sido importado.</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/produtos/$id" params={{ id: duplicate.id }}>ABRIR PRODUTO EXISTENTE</Link>
                </Button>
                <Button size="sm" variant={forceNew ? "default" : "ghost"} onClick={() => setForceNew(true)}>
                  IMPORTAR COMO NOVO
                </Button>
              </div>
            </div>
          )}

          {analysis && analysis.missingFields.length > 0 && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Algumas informações não estavam disponíveis:</p>
              <p>{analysis.missingFields.map((field) => FIELD_LABELS[field] ?? field).join(" · ")}</p>
              <p className="mt-1">Este dado não está disponível para importação automática — preencha manualmente depois.</p>
            </div>
          )}

          {/* Seleção de campos */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">O que deseja aproveitar</h3>
            {(
              [
                ["name", "Nome", product.title ?? "—"],
                ["currentPrice", "Preço", product.currentPrice != null ? currency.format(product.currentPrice) : "—"],
                ["oldPrice", "Preço anterior", product.oldPrice != null ? currency.format(product.oldPrice) : "—"],
                ["attributes", "Características / especificações", `${product.attributes.length} itens`],
                ["rating", "Nota média", product.rating != null ? String(product.rating) : "—"],
                ["reviewCount", "Quantidade de avaliações", product.reviewCount != null ? String(product.reviewCount) : "—"],
                ["variants", "Variações", `${product.variants.length} grupos`],
              ] as Array<[keyof ImportSelection, string, string]>
            ).map(([key, label, value]) => (
              <label key={key} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <Checkbox
                  checked={selection[key]}
                  onCheckedChange={(checked) => setSelection((prev) => ({ ...prev, [key]: checked === true }))}
                />
                <span className="flex-1 text-foreground">{label}</span>
                <span className="max-w-[50%] truncate text-xs text-muted-foreground">{value}</span>
              </label>
            ))}
          </div>

          {/* Nome e preços */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Label htmlFor="import-name">Nome do produto</Label>
              <Input id="import-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="import-price">Meu preço</Label>
              <Input id="import-price" value={price} onChange={(event) => setPrice(event.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Encontrado: {product.currentPrice != null ? currency.format(product.currentPrice) : "—"}
              </p>
            </div>
            <div>
              <Label htmlFor="import-old-price">Preço anterior</Label>
              <Input id="import-old-price" value={oldPrice} onChange={(event) => setOldPrice(event.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Encontrado: {product.oldPrice != null ? currency.format(product.oldPrice) : "—"}
              </p>
            </div>
            <div>
              <Label>Desconto</Label>
              <p className="mt-2 text-sm text-foreground">
                {product.discount != null ? `${product.discount}%` : "—"}
              </p>
            </div>
          </div>

          {/* Imagens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Imagens ({product.images.length})</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedImages(product.images)}>Selecionar todas</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedImages([])}>Desmarcar todas</Button>
              </div>
            </div>
            {product.images.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma imagem disponível para importação.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {product.images.map((image) => {
                  const checked = selectedImages.includes(image);
                  return (
                    <button
                      key={image}
                      type="button"
                      onClick={() =>
                        setSelectedImages((prev) =>
                          prev.includes(image) ? prev.filter((item) => item !== image) : [...prev, image],
                        )
                      }
                      className={`relative overflow-hidden rounded-md border-2 ${checked ? "border-primary" : "border-border"}`}
                    >
                      <img src={image} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                      {checked && (
                        <span className="absolute right-1 top-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Variações */}
          {product.variants.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Variações encontradas</h3>
              {product.variants.map((variant) => (
                <label key={variant.name} className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <Checkbox
                    checked={selectedVariants.includes(variant.name)}
                    onCheckedChange={(checked) =>
                      setSelectedVariants((prev) =>
                        checked === true ? [...prev, variant.name] : prev.filter((item) => item !== variant.name),
                      )
                    }
                  />
                  <span className="flex-1">
                    <span className="font-medium text-foreground">{variant.name}: </span>
                    <span className="text-muted-foreground">{variant.values.join(", ")}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Descrição */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Descrição</h3>
            <RadioGroup value={descriptionMode} onValueChange={(value) => setDescriptionMode(value as DescriptionMode)}>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="none" /> Não importar
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="original" disabled={!product.description} />
                Usar conteúdo original da origem {product.description ? "" : "(indisponível)"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="generated" /> Criar descrição nova a partir dos fatos (recomendado)
              </label>
            </RadioGroup>
            {descriptionMode === "generated" && (
              <>
                <Button size="sm" variant="outline" onClick={handleGenerateDescription} disabled={generating}>
                  {generating && <Loader2 className="mr-2 size-4 animate-spin" />}
                  GERAR MINHA DESCRIÇÃO
                </Button>
                <Textarea
                  rows={10}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="A descrição gerada aparece aqui para revisão."
                />
              </>
            )}
            {descriptionMode === "original" && product.description && (
              <Textarea rows={8} readOnly value={product.description} />
            )}
          </div>

          {/* Avaliações */}
          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Avaliações</p>
            <p className="text-muted-foreground">
              Dados agregados: {product.rating != null ? `${product.rating} de nota média` : "nota indisponível"} ·{" "}
              {product.reviewCount != null ? `${product.reviewCount} avaliações` : "quantidade indisponível"}
            </p>
            <p className="text-muted-foreground">
              {analysis?.individualReviewsAvailable
                ? "Avaliações individuais disponíveis."
                : "Avaliações individuais não disponíveis para importação. Cadastre suas próprias avaliações no editor do produto."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
              CRIAR PRODUTO
            </Button>
            <span className="text-xs text-muted-foreground">
              O produto é criado como rascunho (inativo). Nada é publicado automaticamente.
            </span>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-background">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Importações recentes</h2>
        <div className="divide-y divide-border">
          {history.isLoading && <p className="px-4 py-4 text-sm text-muted-foreground">Carregando...</p>}
          {history.data?.length === 0 && (
            <p className="px-4 py-4 text-sm text-muted-foreground">Nenhuma importação registrada ainda.</p>
          )}
          {history.data?.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-40 flex-1">
                <p className="truncate font-medium text-foreground">{row.title ?? row.source_url}</p>
                <p className="truncate text-xs text-muted-foreground">{row.source_url}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {PLATFORM_LABELS[row.source_platform as keyof typeof PLATFORM_LABELS] ?? row.source_platform}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleDateString("pt-BR")}
              </span>
              <span className="text-xs font-medium text-foreground">{STATUS_LABELS[row.status] ?? row.status}</span>
              {row.product_id && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/produtos/$id" params={{ id: row.product_id }}>Abrir</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
