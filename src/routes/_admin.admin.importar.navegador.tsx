import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  analyzeCapturedData,
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
  logImport,
  type ImportSelection,
} from "@/lib/import-queries";
import {
  buildCaptureBookmarklet,
  getCaptureToken,
  listenForCapture,
  readClipboardCapture,
  type CapturePayload,
} from "@/lib/browser-capture";
import { formatDecimalInput, parseDecimalInput } from "@/lib/product-types";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_admin/admin/importar/navegador")({
  head: () => ({
    meta: [
      { title: "Importar pelo navegador | Vitrine Admin" },
      {
        name: "description",
        content: "Cole os dados da página que você já acessa no navegador e crie o produto como rascunho.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Importar pelo navegador | Vitrine Admin" },
      {
        property: "og:description",
        content: "Cole os dados da página que você já acessa no navegador e crie o produto como rascunho.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrowserImportPage,
});

/** ~5 MB: suficiente para o HTML de páginas modernas. */
const MAX_CONTENT_CHARS = 5 * 1024 * 1024;

type EditableAttribute = { label: string; value: string };

/** Tudo o que a criação precisa, venha da tela de revisão ou da captura em um clique. */
type CreateValues = {
  selection: ImportSelection;
  name: string;
  currentPrice: number;
  oldPrice: number | null;
  description: string;
  attributes: EditableAttribute[];
  /** Já na ordem final: a primeira vira a principal. */
  images: string[];
  variantNames: string[];
  missingFields: string[];
};

/** Todo texto vindo da captura é exibido como texto puro (nunca como HTML). */
function safeText(value: string | null | undefined, max = 400): string {
  return (value ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);
}

function BrowserImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const analyzeCaptured = useServerFn(analyzeCapturedData);
  const generate = useServerFn(generateProductDescription);
  const copyImages = useServerFn(importImagesToStorage);

  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [forceNew, setForceNew] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [rating, setRating] = useState("");
  const [reviewCount, setReviewCount] = useState("");
  const [soldCount, setSoldCount] = useState("");
  const [description, setDescription] = useState("");
  const [attributes, setAttributes] = useState<EditableAttribute[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [primaryImage, setPrimaryImage] = useState<string | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);

  // A aba foi aberta pelo botão de favoritos (…/navegador?captura=1)?
  const captureMode = useMemo(() => new URLSearchParams(window.location.search).get("captura") === "1", []);
  const [captureReceived, setCaptureReceived] = useState(false);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  const platform = useMemo(() => detectPlatform(sourceUrl), [sourceUrl]);
  const product = analysis?.product ?? null;
  const tooLarge = content.length > MAX_CONTENT_CHARS;

  const contentKind = useMemo(() => {
    const value = content.trim();
    if (!value) return "—";
    if (value.startsWith("{") || value.startsWith("[")) return "JSON estruturado";
    if (/<script[^>]+ld\+json/i.test(value)) return "HTML com JSON-LD";
    if (/<html|<meta|<div/i.test(value)) return "HTML da página";
    return "Texto";
  }, [content]);

  function resetPreview(found: ImportedProduct) {
    setName(safeText(found.title, 200));
    setPrice(formatDecimalInput(found.currentPrice, 2));
    setOldPrice(formatDecimalInput(found.oldPrice, 2));
    setRating(formatDecimalInput(found.rating));
    setReviewCount(found.reviewCount != null ? String(found.reviewCount) : "");
    setSoldCount(found.soldCount != null ? String(found.soldCount) : "");
    setDescription("");
    setAttributes(
      found.attributes.map((item) => ({ label: safeText(item.label, 60), value: safeText(item.value, 200) })),
    );
    setSelectedImages(found.images);
    setPrimaryImage(found.images[0] ?? null);
    setSelectedVariants([]);
  }

  /**
   * Analisa o conteúdo e preenche a prévia. Recebe os valores por parâmetro
   * porque a captura em um clique chega antes de os campos da tela mudarem.
   */
  async function runAnalysis(
    rawContent: string,
    rawUrl: string,
  ): Promise<{ result: ImportAnalysis; duplicated: boolean } | null> {
    if (!rawContent.trim()) {
      toast.error("Cole os dados capturados da página.");
      return null;
    }
    if (rawContent.length > MAX_CONTENT_CHARS) {
      toast.error("Conteúdo muito grande. Cole apenas o JSON estruturado.");
      return null;
    }
    setAnalyzing(true);
    setAnalysis(null);
    setDuplicate(null);
    setForceNew(false);
    try {
      const result = await analyzeCaptured({ data: { content: rawContent, sourceUrl: rawUrl.trim() } });
      setAnalysis(result);
      let duplicated = false;
      if (result.product) {
        resetPreview(result.product);
        const existing = await findExistingImport(result.product.sourceUrl, result.product.externalId);
        if (existing) {
          setDuplicate({ id: existing.id, name: existing.name });
          duplicated = true;
        }
        toast.success(`${result.foundCount} dados encontrados.`);
      } else {
        toast.warning(result.message ?? "Nenhum dado encontrado.");
      }
      await logImport({
        source_platform: detectPlatform(rawUrl),
        source_url: result.product?.sourceUrl ?? (rawUrl.trim() || "captura-navegador"),
        external_product_id: result.product?.externalId ?? null,
        status: result.status,
        title: result.product?.title ?? null,
        missing_fields: result.missingFields,
        error_detail: result.message,
        import_method: "browser_capture",
      }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ["admin", "imports"] });
      return { result, duplicated };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível analisar os dados.");
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  /** Captura vinda do botão de favoritos: analisa e, se vier limpa, já cria o rascunho completo. */
  async function importCapture(capture: CapturePayload) {
    setCaptureReceived(true);
    setSourceUrl(capture.url);
    setContent(capture.html);

    const outcome = await runAnalysis(capture.html, capture.url);
    const found = outcome?.result.product;
    // Sem produto: o aviso com o motivo já aparece abaixo.
    if (!outcome || !found) return;
    if (outcome.duplicated) {
      toast.info("Este produto já foi importado. Escolha abaixo abrir o existente ou importar como novo.");
      return;
    }
    if (outcome.result.blockedReason) {
      toast.warning("A captura veio de uma tela de verificação. Confira os dados abaixo antes de criar.");
      return;
    }
    if (!found.title || found.currentPrice == null) {
      toast.warning("A página não entregou nome e preço. Confira os dados abaixo antes de criar.");
      return;
    }
    await createFromCapture(found, {
      selection: {
        name: true,
        currentPrice: true,
        oldPrice: found.oldPrice != null,
        attributes: true,
        rating: found.rating != null,
        reviewCount: found.reviewCount != null,
        variants: found.variants.length > 0,
      },
      name: safeText(found.title, 200),
      currentPrice: found.currentPrice,
      oldPrice: found.oldPrice,
      description: found.description ?? "",
      attributes: found.attributes.map((item) => ({ label: safeText(item.label, 60), value: safeText(item.value, 200) })),
      images: found.images,
      variantNames: found.variants.map((variant) => variant.name),
      missingFields: outcome.result.missingFields,
    });
  }

  // Sempre a versão mais recente, para a escuta abaixo não guardar uma função antiga.
  const importCaptureRef = useRef(importCapture);
  importCaptureRef.current = importCapture;

  useEffect(() => {
    if (!captureMode) return;
    return listenForCapture(window, getCaptureToken(), (capture) => void importCaptureRef.current(capture));
  }, [captureMode]);

  useEffect(() => {
    // Atribuído direto no elemento: o React recusa endereços "javascript:" passados por propriedade.
    bookmarkletRef.current?.setAttribute("href", buildCaptureBookmarklet(window.location.origin, getCaptureToken()));
  }, []);

  async function handlePasteCapture() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.error("O navegador não liberou a área de transferência. Cole no campo abaixo com Ctrl+V.");
      return;
    }
    const capture = readClipboardCapture(text);
    if (!capture) {
      toast.error("Não há captura copiada. Clique no botão na página do produto e tente de novo.");
      return;
    }
    await importCapture(capture);
  }

  async function handleGenerateDescription() {
    if (!product) return;
    setGenerating(true);
    try {
      const result = await generate({
        data: {
          title: name || product.title || "",
          attributes,
          price: parseDecimalInput(price) ?? product.currentPrice,
        },
      });
      setDescription(result.description);
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
    await createFromCapture(product, {
      selection: {
        name: true,
        currentPrice: true,
        oldPrice: Boolean(oldPrice),
        attributes: true,
        rating: Boolean(rating),
        reviewCount: Boolean(reviewCount),
        variants: selectedVariants.length > 0,
      },
      name,
      currentPrice: parseDecimalInput(price) ?? 0,
      oldPrice: oldPrice ? parseDecimalInput(oldPrice) : null,
      description,
      attributes,
      images: primaryImage
        ? [primaryImage, ...selectedImages.filter((image) => image !== primaryImage)]
        : selectedImages,
      variantNames: selectedVariants,
      missingFields: analysis?.missingFields ?? [],
    });
  }

  async function createFromCapture(found: ImportedProduct, values: CreateValues) {
    setCreating(true);
    try {
      const productId = await createProductFromImport({
        imported: found,
        selection: values.selection,
        name: values.name,
        currentPrice: values.currentPrice,
        oldPrice: values.oldPrice,
        description: values.description,
        selectedImagePaths: [],
        selectedAttributes: values.attributes.filter((item) => item.label.trim() && item.value.trim()),
        selectedVariants: found.variants.filter((variant) => values.variantNames.includes(variant.name)),
        importMethod: "browser_capture",
      });

      if (values.images.length > 0) {
        const { paths, skipped } = await copyImages({ data: { productId, urls: values.images } });
        if (paths.length > 0) {
          await supabase.from("product_images").insert(
            paths.map((path, index) => ({ product_id: productId, image_url: path, sort_order: index })) as never,
          );
        }
        if (skipped.length > 0) {
          toast.warning(`${skipped.length} imagem(ns) não puderam ser copiadas. Envie as suas no editor.`);
        }
      }

      await logImport({
        source_platform: found.source,
        source_url: found.sourceUrl,
        external_product_id: found.externalId,
        product_id: productId,
        status: "imported",
        title: values.name,
        missing_fields: values.missingFields,
        import_method: "browser_capture",
      }).catch(() => undefined);

      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Produto criado como rascunho. Revise antes de publicar.");
      navigate({ to: "/admin/produtos/$id", params: { id: productId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o produto.");
    } finally {
      setCreating(false);
    }
  }

  function moveImage(image: string, direction: -1 | 1) {
    setSelectedImages((prev) => {
      const index = prev.indexOf(image);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/importar">
            <ArrowLeft className="mr-2 size-4" /> Voltar para o importador
          </Link>
        </Button>
        <h1 className="text-xl font-semibold text-foreground">Importar pelo navegador</h1>
        <p className="text-sm text-muted-foreground">
          Abra a página do produto no seu navegador e envie os dados da página para o importador. Usamos apenas o
          conteúdo que você mesmo consegue ver — nada de burlar verificações de segurança.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">1. Captura em um clique</h2>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Arraste o botão abaixo para a barra de favoritos do navegador (só na primeira vez);</li>
          <li>abra a página do produto na loja de origem, como você faz normalmente;</li>
          <li>clique no botão na barra de favoritos: uma aba desta loja abre e o rascunho é criado sozinho.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <a
            ref={bookmarkletRef}
            draggable
            onClick={(event) => {
              event.preventDefault();
              toast.info("Arraste este botão para a barra de favoritos e clique nele na página do produto.");
            }}
            className="inline-flex cursor-grab items-center rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-foreground"
          >
            Enviar para a Vitrine
          </a>
          <Button variant="outline" size="sm" onClick={() => void handlePasteCapture()} disabled={analyzing || creating}>
            COLAR CAPTURA
          </Button>
        </div>
        {captureMode && !captureReceived && (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Aguardando os dados da página do produto. Se nada chegar em alguns segundos, volte para a página do
            produto, clique no botão de novo e depois use COLAR CAPTURA aqui.
          </p>
        )}
        {captureReceived && (analyzing || creating) && (
          <p className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
            <Loader2 className="size-4 animate-spin" />
            {creating ? "Criando o rascunho e copiando as imagens..." : "Captura recebida. Lendo os dados..."}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          O botão vale para este navegador e funciona no computador. Ele envia para esta loja apenas o que já está
          aberto na sua tela; se a loja de origem pedir uma verificação, resolva-a antes de clicar.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold text-foreground">2. Ou cole os dados manualmente</h2>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Com a página do produto aberta, abra as ferramentas do navegador;</li>
          <li>copie o HTML da página ou os dados estruturados disponíveis;</li>
          <li>cole no campo abaixo;</li>
          <li>clique em Analisar dados.</li>
        </ol>

        <div>
          <Label htmlFor="capture-url">URL do produto</Label>
          <Input
            id="capture-url"
            value={sourceUrl}
            placeholder="https://..."
            onChange={(event) => setSourceUrl(event.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Origem detectada: <span className="font-medium text-foreground">{PLATFORM_LABELS[platform]}</span>
          </p>
        </div>

        <div>
          <Label htmlFor="capture-content">Dados capturados da página</Label>
          <Textarea
            id="capture-content"
            rows={12}
            spellCheck={false}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              // Captura do botão colada à mão: o endereço do produto vem na primeira linha.
              const capture = readClipboardCapture(event.target.value);
              if (capture && !sourceUrl.trim()) setSourceUrl(capture.url);
            }}
            placeholder="Cole aqui o HTML da página, o JSON-LD ou o JSON estruturado."
            className="font-mono text-xs"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Tipo detectado: <span className="font-medium text-foreground">{contentKind}</span> ·{" "}
            {(content.length / 1024).toFixed(0)} KB
          </p>
          {tooLarge && (
            <p className="mt-1 text-xs font-medium text-destructive">
              Conteúdo muito grande. Cole apenas o JSON estruturado ou use a importação assistida.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void runAnalysis(content, sourceUrl)} disabled={analyzing || tooLarge}>
            {analyzing && <Loader2 className="mr-2 size-4 animate-spin" />}
            ANALISAR DADOS
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setContent(""); setAnalysis(null); }}>
            LIMPAR
          </Button>
        </div>

        <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          O conteúdo colado é tratado como dado não confiável: nada é executado, nenhum script roda e nenhum recurso
          externo é carregado automaticamente. Fazemos apenas a leitura do texto.
        </p>
      </section>

      {analysis && !analysis.product && (
        <section className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">{safeText(analysis.message)}</p>
          {analysis.notices.map((notice) => (
            <p key={notice} className="text-xs text-muted-foreground">{safeText(notice)}</p>
          ))}
        </section>
      )}

      {product && (
        <section className="space-y-5 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Pré-visualização</h2>
            <span className="text-xs font-medium text-foreground">{analysis?.foundCount ?? 0} dados encontrados</span>
          </div>

          {analysis && analysis.missingFields.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Não encontrados:{" "}
              {analysis.missingFields.map((field) => FIELD_LABELS[field] ?? field).join(", ")}. Você pode continuar
              mesmo assim e completar no editor.
            </p>
          )}

          {duplicate && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="text-foreground">Já existe um produto importado desta origem: {safeText(duplicate.name)}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/produtos/$id" params={{ id: duplicate.id }}>ABRIR EXISTENTE</Link>
                </Button>
                <Button size="sm" variant={forceNew ? "default" : "secondary"} onClick={() => setForceNew(true)}>
                  IMPORTAR COMO NOVO
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="capture-name">Nome</Label>
              <Input id="capture-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="capture-price">Preço</Label>
              <Input id="capture-price" value={price} onChange={(event) => setPrice(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="capture-old-price">Preço anterior</Label>
              <Input id="capture-old-price" value={oldPrice} onChange={(event) => setOldPrice(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="capture-rating">Nota</Label>
              <Input id="capture-rating" value={rating} onChange={(event) => setRating(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="capture-reviews">Avaliações</Label>
              <Input
                id="capture-reviews"
                value={reviewCount}
                onChange={(event) => setReviewCount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="capture-sold">Vendidos</Label>
              <Input id="capture-sold" value={soldCount} onChange={(event) => setSoldCount(event.target.value)} />
            </div>
            <div>
              <Label>Desconto</Label>
              <Input readOnly value={product.discount != null ? `${product.discount}%` : "—"} />
            </div>
          </div>

          {/* Imagens */}
          {product.images.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">Imagens</h3>
                <Button size="sm" variant="outline" onClick={() => setSelectedImages(product.images)}>
                  SELECIONAR TODAS
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setSelectedImages([]); setPrimaryImage(null); }}>
                  DESMARCAR TODAS
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {product.images.map((image) => {
                  const checked = selectedImages.includes(image);
                  return (
                    <div key={image} className="space-y-2 rounded-md border border-border p-2">
                      <img
                        src={image}
                        alt="Imagem capturada do produto"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-28 w-full rounded object-contain"
                      />
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            setSelectedImages((prev) =>
                              value ? [...prev, image] : prev.filter((item) => item !== image),
                            )
                          }
                        />
                        Usar
                      </label>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant={primaryImage === image ? "default" : "outline"}
                          onClick={() => setPrimaryImage(image)}
                        >
                          Principal
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => moveImage(image, -1)}>←</Button>
                        <Button size="sm" variant="ghost" onClick={() => moveImage(image, 1)}>→</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Características */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Características</h3>
            {attributes.map((attribute, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={attribute.label}
                  onChange={(event) =>
                    setAttributes((prev) =>
                      prev.map((item, position) => (position === index ? { ...item, label: event.target.value } : item)),
                    )
                  }
                />
                <Input
                  value={attribute.value}
                  onChange={(event) =>
                    setAttributes((prev) =>
                      prev.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setAttributes((prev) => prev.filter((_, position) => position !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAttributes((prev) => [...prev, { label: "", value: "" }])}
            >
              <Plus className="mr-2 size-4" /> ADICIONAR
            </Button>
          </div>

          {/* Variações */}
          {product.variants.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">Variações</h3>
              {product.variants.map((variant) => (
                <label key={variant.name} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={selectedVariants.includes(variant.name)}
                    onCheckedChange={(value) =>
                      setSelectedVariants((prev) =>
                        value ? [...prev, variant.name] : prev.filter((item) => item !== variant.name),
                      )
                    }
                  />
                  <span className="flex-1">
                    <span className="font-medium text-foreground">{safeText(variant.name, 60)}: </span>
                    <span className="text-muted-foreground">{safeText(variant.values.join(", "), 300)}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Descrição */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Descrição</h3>
            <Button size="sm" variant="outline" onClick={handleGenerateDescription} disabled={generating}>
              {generating && <Loader2 className="mr-2 size-4 animate-spin" />}
              GERAR NOVA DESCRIÇÃO
            </Button>
            <Textarea
              rows={8}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Escreva ou gere uma descrição própria."
            />
            {product.description && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Ver texto da origem (apenas referência)</summary>
                <p className="mt-2 whitespace-pre-wrap">{safeText(product.description, 4000)}</p>
              </details>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
              CRIAR PRODUTO
            </Button>
            <span className="text-xs text-muted-foreground">
              O produto é criado como rascunho (inativo) e você é levado ao editor.
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
