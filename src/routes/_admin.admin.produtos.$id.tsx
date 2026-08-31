import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ProductForm } from "@/components/admin/product-form";
import {
  deleteChild,
  deleteProduct,
  getProduct,
  insertChild,
  removeStorageObject,
  updateChild,
  updateProduct,
  uploadProductImage,
  type ChildTable,
} from "@/lib/admin-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_admin/admin/produtos/$id")({
  head: () => ({
    meta: [
      { title: "Editar produto | Vitrine Admin" },
      { name: "description", content: "Edite dados, imagens, avaliações e promoções do produto." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Editar produto | Vitrine Admin" },
      { property: "og:description", content: "Edite dados, imagens, avaliações e promoções do produto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditProduct,
});

function EditProduct() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "product", id], queryFn: () => getProduct(id) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!query.data) return <p className="text-sm text-muted-foreground">Produto não encontrado.</p>;

  const { product, images, details, highlights, promotions, reviews, previews } = query.data;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-xl font-semibold text-foreground">{product.name}</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/produto/$slug" params={{ slug: product.slug }}>Ver na loja</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              if (!confirm("Excluir este produto?")) return;
              await deleteProduct(product.id);
              invalidate();
              navigate({ to: "/admin/produtos" });
            }}
          >
            Excluir
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dados" className="mt-6">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="imagens">Imagens</TabsTrigger>
          <TabsTrigger value="avaliacoes">Avaliações</TabsTrigger>
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          <TabsTrigger value="diferenciais">Diferenciais</TabsTrigger>
          <TabsTrigger value="promocoes">Promoções</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <ProductForm
            initial={product}
            submitLabel="Salvar alterações"
            onSubmit={async (values) => {
              await updateProduct(product.id, values);
              invalidate();
            }}
          />
        </TabsContent>

        <TabsContent value="imagens" className="mt-4">
          <ImagesManager productId={product.id} images={images} previews={previews} onChange={invalidate} />
        </TabsContent>

        <TabsContent value="avaliacoes" className="mt-4">
          <ReviewsManager productId={product.id} reviews={reviews} previews={previews} onChange={invalidate} />
        </TabsContent>

        <TabsContent value="detalhes" className="mt-4">
          <DetailsManager productId={product.id} details={details} onChange={invalidate} />
        </TabsContent>

        <TabsContent value="diferenciais" className="mt-4">
          <SimpleListManager
            title="Diferenciais"
            table="product_highlights"
            productId={product.id}
            rows={highlights}
            onChange={invalidate}
          />
        </TabsContent>

        <TabsContent value="promocoes" className="mt-4">
          <SimpleListManager
            title="Promoções"
            table="promotions"
            productId={product.id}
            rows={promotions}
            onChange={invalidate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 rounded-lg border border-border bg-background p-4">{children}</div>;
}

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

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      for (const [index, file] of Array.from(files).entries()) {
        const path = await uploadProductImage(file, productId);
        await insertChild("product_images", {
          product_id: productId,
          image_url: path,
          sort_order: images.length + index,
        });
      }
    },
    onSuccess: onChange,
  });

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Galeria</h2>
        <Button
          size="sm"
          disabled={busy || upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? "Enviando..." : "Enviar imagens"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (event) => {
            if (!event.target.files?.length) return;
            setBusy(true);
            try {
              await upload.mutateAsync(event.target.files);
            } finally {
              setBusy(false);
              event.target.value = "";
            }
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((image, index) => (
          <div key={image.id} className="space-y-2">
            <img
              src={previews[image.image_url] ?? image.image_url}
              alt=""
              className="aspect-square w-full rounded-md border border-border object-cover"
            />
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-muted-foreground">#{index + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={async () => {
                  await deleteChild("product_images", image.id);
                  await removeStorageObject(image.image_url);
                  onChange();
                }}
              >
                Remover
              </Button>
            </div>
          </div>
        ))}
        {images.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma imagem cadastrada.</p>}
      </div>
    </Panel>
  );
}

function ReviewsManager({
  productId,
  reviews,
  previews,
  onChange,
}: {
  productId: string;
  reviews: Array<{
    id: string;
    customer_name: string;
    comment: string | null;
    image_url: string | null;
    is_active: boolean;
    sort_order: number;
  }>;
  previews: Record<string, string>;
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function addReview() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const path = file ? await uploadProductImage(file, productId) : null;
      await insertChild("reviews", {
        product_id: productId,
        customer_name: name.trim(),
        avatar_initial: name.trim().charAt(0).toUpperCase(),
        rating: 5,
        comment: comment.trim() || null,
        image_url: path,
        sort_order: reviews.length,
        is_active: true,
      });
      setName("");
      setComment("");
      setFile(null);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <h2 className="text-sm font-semibold">Avaliações</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="review-name">Nome do cliente</Label>
          <Input id="review-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="review-image">Foto (opcional)</Label>
          <Input
            id="review-image"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="review-comment">Comentário</Label>
        <Textarea id="review-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
      </div>
      <Button size="sm" onClick={addReview} disabled={saving}>Adicionar avaliação</Button>

      <div className="divide-y divide-border rounded-md border border-border">
        {reviews.map((review) => (
          <div key={review.id} className="flex items-center gap-3 p-3">
            {review.image_url && (
              <img
                src={previews[review.image_url] ?? review.image_url}
                alt=""
                className="size-12 rounded-md border border-border object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{review.customer_name}</p>
              <p className="truncate text-xs text-muted-foreground">{review.comment}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await updateChild("reviews", review.id, { is_active: !review.is_active });
                onChange();
              }}
            >
              {review.is_active ? "Ocultar" : "Exibir"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                await deleteChild("reviews", review.id);
                if (review.image_url) await removeStorageObject(review.image_url);
                onChange();
              }}
            >
              Excluir
            </Button>
          </div>
        ))}
        {reviews.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma avaliação cadastrada.</p>}
      </div>
    </Panel>
  );
}

function DetailsManager({
  productId,
  details,
  onChange,
}: {
  productId: string;
  details: Array<{ id: string; label: string; value: string | null; sort_order: number }>;
  onChange: () => void;
}) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  return (
    <Panel>
      <h2 className="text-sm font-semibold">Detalhes técnicos</h2>
      <div className="flex flex-wrap gap-2">
        <Input className="flex-1" placeholder="Atributo" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input className="flex-1" placeholder="Valor" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button
          size="sm"
          onClick={async () => {
            if (!label.trim()) return;
            await insertChild("product_details", {
              product_id: productId,
              label: label.trim(),
              value: value.trim(),
              sort_order: details.length,
            });
            setLabel("");
            setValue("");
            onChange();
          }}
        >
          Adicionar
        </Button>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {details.map((detail) => (
          <div key={detail.id} className="flex items-center gap-3 p-3 text-sm">
            <span className="w-40 shrink-0 text-muted-foreground">{detail.label}</span>
            <span className="min-w-0 flex-1 truncate">{detail.value}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                await deleteChild("product_details", detail.id);
                onChange();
              }}
            >
              Excluir
            </Button>
          </div>
        ))}
        {details.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum detalhe cadastrado.</p>}
      </div>
    </Panel>
  );
}

function SimpleListManager({
  title,
  table,
  productId,
  rows,
  onChange,
}: {
  title: string;
  table: Extract<ChildTable, "product_highlights" | "promotions">;
  productId: string;
  rows: Array<{ id: string; text: string; sort_order: number }>;
  onChange: () => void;
}) {
  const [text, setText] = useState("");

  return (
    <Panel>
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="flex gap-2">
        <Input className="flex-1" placeholder={`Novo item de ${title.toLowerCase()}`} value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          size="sm"
          onClick={async () => {
            if (!text.trim()) return;
            await insertChild(table, {
              product_id: productId,
              text: text.trim(),
              sort_order: rows.length,
            });
            setText("");
            onChange();
          }}
        >
          Adicionar
        </Button>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{row.text}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={async () => {
                await deleteChild(table, row.id);
                onChange();
              }}
            >
              Excluir
            </Button>
          </div>
        ))}
        {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum item cadastrado.</p>}
      </div>
    </Panel>
  );
}
