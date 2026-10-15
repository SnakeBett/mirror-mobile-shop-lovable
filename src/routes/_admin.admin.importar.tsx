import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  analyzeImportUrl,
  generateProductDescription,
  importImagesToStorage,
} from "@/lib/import.functions";
import {
  detectPlatform,
  displayImportTitle,
  IMPORT_METHOD_LABELS,
  type ImportMethod,

  FIELD_LABELS,
  PLATFORM_LABELS,
  type ImportAnalysis,
  type ImportedProduct,
} from "@/lib/import-types";
import {
  createProductAssisted,
  createProductFromImport,
  findExistingImport,
  listRecentImports,
  logImport,
  type ImportSelection,
} from "@/lib/import-queries";
import { uploadProductImage } from "@/lib/admin-queries";
import { formatDecimalInput, parseDecimalInput } from "@/lib/product-types";
import { supabase } from "@/integrations/supabase/client";
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
      { name: "description", content: "Importe produtos a partir de uma URL pública para acelerar o cadastro." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Importar produto | Vitrine Admin" },
      { property: "og:description", content: "Importe produtos a partir de uma URL pública para acelerar o cadastro." },
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
  blocked: "Leitura bloqueada",
  failed: "Falhou",
  imported: "Importado",
};

type DescriptionMode = "none" | "reference" | "generated";
type EditableAttribute = { label: string; value: string };

/** Tudo o que a criação precisa, venha da tela de revisão ou do cadastro em um clique. */
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
  const [assistedOpen, setAssistedOpen] = useState(false);

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
  const [attributes, setAttributes] = useState<EditableAttribute[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [primaryImage, setPrimaryImage] = useState<string | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [descriptionMode, setDescriptionMode] = useState<DescriptionMode>("generated");
  const [description, setDescription] = useState("");

  // Importação assistida
  const [assisted, setAssisted] = useState({
    name: "",
    price: "",
    oldPrice: "",
    description: "",
    rating: "",
    reviewCount: "",
  });
  const [assistedAttributes, setAssistedAttributes] = useState<EditableAttribute[]>([{ label: "", value: "" }]);
  const [assistedFiles, setAssistedFiles] = useState<File[]>([]);

  const platform = useMemo(() => detectPlatform(url), [url]);
  const product = analysis?.product ?? null;

  const history = useQuery({ queryKey: ["admin", "imports"], queryFn: () => listRecentImports() });

  function resetPreview(found: ImportedProduct) {
    setName(found.title ?? "");
    setPrice(formatDecimalInput(found.currentPrice, 2));
    setOldPrice(formatDecimalInput(found.oldPrice, 2));
    setAttributes(found.attributes.map((item) => ({ ...item })));
    setSelectedImages(found.images);
    setPrimaryImage(found.images[0] ?? null);
    setSelectedVariants([]);
    setDescription("");
    setDescriptionMode("generated");
  }

  /** Lê o link e preenche a prévia. Devolve o resultado para quem quiser seguir direto para a criação. */
  async function runAnalysis(): Promise<{ result: ImportAnalysis; duplicated: boolean } | null> {
    if (!url.trim()) {
      toast.error("URL inválida.");
      return null;
    }
    setAnalyzing(true);
    setAnalysis(null);
    setDuplicate(null);
    setForceNew(false);
    setAssistedOpen(false);
    try {
      const result = await analyze({ data: { url: url.trim() } });
      setAnalysis(result);
      let duplicated = false;
      if (result.product) {
        resetPreview(result.product);
        const existing = await findExistingImport(result.product.sourceUrl, result.product.externalId);
        if (existing) {
          setDuplicate({ id: existing.id, name: existing.name });
          duplicated = true;
        }
      } else {
        setAssisted((prev) => ({ ...prev, name: prev.name }));
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
      if (result.status === "failed") toast.error(result.message ?? "URL inválida.");
      if (result.status === "blocked") toast.warning(result.message ?? "Não conseguimos ler esta página.");
      return { result, duplicated };
    } catch {
      setAnalysis({
        status: "blocked",
        product: null,
        missingFields: [],
        notices: ["Use a importação assistida para cadastrar os dados manualmente."],
        message: "Não conseguimos ler automaticamente esta página.",
        individualReviewsAvailable: false,
        foundCount: 0,
      });
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  /** Um clique: lê o link e, se a página entregar os dados sem bloqueio, já cria o rascunho completo. */
  async function handleImportAndCreate() {
    const outcome = await runAnalysis();
    const found = outcome?.result.product;
    // Sem produto: o painel de alternativas (navegador / assistida / manual) já aparece abaixo.
    if (!outcome || !found) return;
    if (outcome.duplicated) {
      toast.info("Este produto já foi importado. Escolha abaixo abrir o existente ou importar como novo.");
      return;
    }
    if (outcome.result.blockedReason) {
      toast.warning("A página bloqueou parte da leitura. Confira os dados abaixo antes de criar.");
      return;
    }
    if (!found.title || found.currentPrice == null) {
      toast.warning("A página não entregou nome e preço. Confira os dados abaixo antes de criar.");
      return;
    }
    await createFromImport(found, {
      selection: {
        name: true,
        currentPrice: true,
        oldPrice: true,
        attributes: true,
        rating: true,
        reviewCount: true,
        variants: true,
      },
      name: found.title,
      currentPrice: found.currentPrice,
      oldPrice: found.oldPrice,
      description: found.description ?? "",
      attributes: found.attributes,
      images: found.images,
      variantNames: found.variants.map((variant) => variant.name),
      missingFields: outcome.result.missingFields,
    });
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
    const finalDescription =
      descriptionMode === "none"
        ? ""
        : descriptionMode === "reference"
          ? (product.description ?? "")
          : description;

    await createFromImport(product, {
      selection,
      name,
      currentPrice: parseDecimalInput(price) ?? 0,
      oldPrice: oldPrice ? parseDecimalInput(oldPrice) : null,
      description: finalDescription,
      attributes,
      images: primaryImage
        ? [primaryImage, ...selectedImages.filter((image) => image !== primaryImage)]
        : selectedImages,
      variantNames: selectedVariants,
      missingFields: analysis?.missingFields ?? [],
    });
  }

  async function createFromImport(found: ImportedProduct, values: CreateValues) {
    setCreating(true);
    try {
      const productId = await createProductFromImport({
        imported: found,
        selection: values.selection,
        name: values.selection.name ? values.name : "Produto importado",
        currentPrice: values.currentPrice,
        oldPrice: values.oldPrice,
        description: values.description,
        selectedImagePaths: [],
        selectedAttributes: values.attributes.filter((item) => item.label.trim() && item.value.trim()),
        selectedVariants: found.variants.filter((variant) => values.variantNames.includes(variant.name)),
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
      }).catch(() => undefined);

      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Produto importado. Revise antes de publicar.");
      navigate({ to: "/admin/produtos/$id", params: { id: productId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o produto.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAssistedCreate() {
    if (!assisted.name.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    setCreating(true);
    try {
      const productId = await createProductAssisted({
        name: assisted.name,
        currentPrice: parseDecimalInput(assisted.price) ?? 0,
        oldPrice: assisted.oldPrice ? parseDecimalInput(assisted.oldPrice) : null,
        description: assisted.description,
        rating: assisted.rating ? parseDecimalInput(assisted.rating) : null,
        reviewCount: assisted.reviewCount ? parseDecimalInput(assisted.reviewCount) : null,
        attributes: assistedAttributes,
        sourceUrl: url.trim() || null,
        sourcePlatform: platform,
      });

      if (assistedFiles.length > 0) {
        const paths: string[] = [];
        for (const file of assistedFiles) {
          try {
            paths.push(await uploadProductImage(file, productId));
          } catch {
            toast.warning(`Não foi possível enviar ${file.name}.`);
          }
        }
        if (paths.length > 0) {
          await supabase.from("product_images").insert(
            paths.map((path, index) => ({ product_id: productId, image_url: path, sort_order: index })) as never,
          );
        }
      }

      await logImport({
        source_platform: platform,
        source_url: url.trim() || "cadastro-assistido",
        product_id: productId,
        status: "imported",
        title: assisted.name,
      }).catch(() => undefined);

      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Produto importado. Revise antes de publicar.");
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
          Cole o link público do produto. Não é necessária nenhuma configuração prévia.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border border-border bg-background p-4">
        <Label htmlFor="import-url">Cole o link</Label>
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
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleImportAndCreate} disabled={analyzing || creating}>
            {(analyzing || creating) && <Loader2 className="mr-2 size-4 animate-spin" />}
            IMPORTAR E CADASTRAR
          </Button>
          <Button variant="secondary" onClick={() => void runAnalysis()} disabled={analyzing || creating}>
            {analysis ? "ANALISAR DE NOVO" : "ANALISAR ANTES DE CRIAR"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/importar/navegador">IMPORTAR PELO NAVEGADOR</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/produtos/novo">CADASTRO MANUAL</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Importar e cadastrar cria o rascunho completo de uma vez: nome, preços, imagens, características e
          variações. O produto nasce inativo, para você conferir antes de publicar.
        </p>
      </section>

      {(analysis?.status === "blocked" || analysis?.status === "failed") && (
        <section className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">{analysis.message}</p>
          {analysis.notices.map((notice) => (
            <p key={notice} className="text-xs text-muted-foreground">{notice}</p>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/admin/importar/navegador">IMPORTAR PELO NAVEGADOR</Link>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAssistedOpen(true)}>
              IMPORTAÇÃO ASSISTIDA
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/produtos/novo">CADASTRO MANUAL</Link>
            </Button>
          </div>
        </section>
      )}

      {assistedOpen && (
        <section className="space-y-4 rounded-lg border border-border bg-background p-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Importação assistida</h2>
            <p className="text-xs text-muted-foreground">
              Preencha os dados que você tem em mãos e envie suas próprias imagens.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="assisted-name">Nome</Label>
              <Input
                id="assisted-name"
                value={assisted.name}
                onChange={(event) => setAssisted((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="assisted-price">Preço</Label>
              <Input
                id="assisted-price"
                value={assisted.price}
                onChange={(event) => setAssisted((prev) => ({ ...prev, price: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="assisted-old-price">Preço antigo</Label>
              <Input
                id="assisted-old-price"
                value={assisted.oldPrice}
                onChange={(event) => setAssisted((prev) => ({ ...prev, oldPrice: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="assisted-rating">Nota média</Label>
              <Input
                id="assisted-rating"
                value={assisted.rating}
                onChange={(event) => setAssisted((prev) => ({ ...prev, rating: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="assisted-reviews">Quantidade de avaliações</Label>
              <Input
                id="assisted-reviews"
                value={assisted.reviewCount}
                onChange={(event) => setAssisted((prev) => ({ ...prev, reviewCount: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="assisted-description">Descrição</Label>
              <Textarea
                id="assisted-description"
                rows={6}
                value={assisted.description}
                onChange={(event) => setAssisted((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Características</Label>
            {assistedAttributes.map((attribute, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Marca"
                  value={attribute.label}
                  onChange={(event) =>
                    setAssistedAttributes((prev) =>
                      prev.map((item, position) =>
                        position === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="Valor"
                  value={attribute.value}
                  onChange={(event) =>
                    setAssistedAttributes((prev) =>
                      prev.map((item, position) =>
                        position === index ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setAssistedAttributes((prev) => prev.filter((_, position) => position !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAssistedAttributes((prev) => [...prev, { label: "", value: "" }])}
            >
              <Plus className="mr-1 size-4" /> Adicionar característica
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assisted-images">Imagens (envie as suas)</Label>
            <Input
              id="assisted-images"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setAssistedFiles(Array.from(event.target.files ?? []))}
            />
            {assistedFiles.length > 0 && (
              <p className="text-xs text-muted-foreground">{assistedFiles.length} imagem(ns) selecionada(s).</p>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button onClick={handleAssistedCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
              CRIAR PRODUTO
            </Button>
            <span className="text-xs text-muted-foreground">Criado como rascunho (inativo).</span>
          </div>
        </section>
      )}

      {product && (
        <section className="space-y-6 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Produto encontrado</h2>
              <p className="text-xs text-muted-foreground">
                {analysis?.foundCount ?? 0} informações encontradas.
              </p>
            </div>
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
              <p className="mt-1">Você pode preencher manualmente agora ou depois, no editor.</p>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">O que deseja aproveitar</h3>
            {(
              [
                ["name", "Nome", product.title ?? "—"],
                ["currentPrice", "Preço", product.currentPrice != null ? currency.format(product.currentPrice) : "—"],
                ["oldPrice", "Preço anterior", product.oldPrice != null ? currency.format(product.oldPrice) : "—"],
                ["attributes", "Características / especificações", `${attributes.length} itens`],
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

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Label htmlFor="import-name">Nome do produto</Label>
              <Input id="import-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="import-price">Preço que será usado</Label>
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

          {/* Características editáveis */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Características</h3>
            {attributes.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma característica encontrada.</p>
            )}
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
              <Plus className="mr-1 size-4" /> Adicionar característica
            </Button>
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
              <p className="text-xs text-muted-foreground">
                Nenhuma imagem disponível. Envie suas próprias imagens no editor do produto.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {product.images.map((image) => {
                  const checked = selectedImages.includes(image);
                  return (
                    <div
                      key={image}
                      className={`relative overflow-hidden rounded-md border-2 ${checked ? "border-primary" : "border-border"}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedImages((prev) =>
                            prev.includes(image) ? prev.filter((item) => item !== image) : [...prev, image],
                          )
                        }
                        className="block w-full"
                      >
                        <img src={image} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                      </button>
                      <div className="flex items-center justify-between gap-1 px-1 py-1 text-[10px]">
                        <span>{checked ? "Selecionada" : "Ignorada"}</span>
                        <button
                          type="button"
                          onClick={() => setPrimaryImage(image)}
                          className={primaryImage === image ? "font-semibold text-primary" : "text-muted-foreground"}
                        >
                          {primaryImage === image ? "Principal" : "Definir principal"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Copiamos apenas imagens públicas acessíveis. Se a origem bloquear, envie as suas no editor.
            </p>
          </div>

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
                <RadioGroupItem value="reference" disabled={!product.description} />
                Usar o texto da origem apenas como referência {product.description ? "" : "(indisponível)"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="generated" /> Criar descrição nova a partir dos fatos (recomendado)
              </label>
            </RadioGroup>
            {descriptionMode === "generated" && (
              <>
                <Button size="sm" variant="outline" onClick={handleGenerateDescription} disabled={generating}>
                  {generating && <Loader2 className="mr-2 size-4 animate-spin" />}
                  GERAR NOVA DESCRIÇÃO
                </Button>
                <Textarea
                  rows={10}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="A descrição gerada aparece aqui para revisão."
                />
              </>
            )}
            {descriptionMode === "reference" && product.description && (
              <Textarea rows={8} readOnly value={product.description} />
            )}
          </div>

          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Avaliações</p>
            <p className="text-muted-foreground">
              Dados agregados: {product.rating != null ? `${product.rating} de nota média` : "nota indisponível"} ·{" "}
              {product.reviewCount != null ? `${product.reviewCount} avaliações` : "quantidade indisponível"}
            </p>
            <p className="text-muted-foreground">
              Avaliações individuais não são importadas. Cadastre as suas no editor do produto.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
              CRIAR PRODUTO
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAssistedOpen(true)}>
              Preencher manualmente
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
                <p className="truncate font-medium text-foreground">
                  {displayImportTitle(row.title, row.source_platform, row.external_product_id, row.source_url)}
                </p>

                <p className="truncate text-xs text-muted-foreground">{row.source_url}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {PLATFORM_LABELS[row.source_platform as keyof typeof PLATFORM_LABELS] ?? row.source_platform}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleDateString("pt-BR")}
              </span>
              <span className="text-xs font-medium text-foreground">{STATUS_LABELS[row.status] ?? row.status}</span>
              <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {IMPORT_METHOD_LABELS[(row.import_method ?? "server") as ImportMethod] ?? row.import_method}
              </span>
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
