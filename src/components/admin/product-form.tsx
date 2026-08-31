import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { calcDiscount, slugify, type ProductRow } from "@/lib/product-types";

export type ProductFormValues = Partial<ProductRow>;

const empty: ProductFormValues = {
  name: "",
  slug: "",
  search_placeholder: "Pesquisar produtos",
  current_price: 0,
  old_price: null,
  discount_percentage: null,
  installment_text: "",
  sales_count: "",
  rating: 5,
  review_count: 0,
  five_star_count: 0,
  shipping_fee: "",
  shipping_promotion_text: "",
  shipping_discount_text: "",
  customer_protection_text: "Proteção ao cliente",
  description: "",
  closing_text: "",
  checkout_url: "",
  is_active: true,
};

export function ProductForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: ProductFormValues;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<ProductFormValues>({ ...empty, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.name?.trim()) return setError("Informe o nome do produto.");
    setSaving(true);
    try {
      const slug = (values.slug?.trim() || slugify(values.name)).trim();
      await onSubmit({
        ...values,
        slug,
        name: values.name.trim(),
        current_price: Number(values.current_price ?? 0),
        old_price: values.old_price === null || values.old_price === undefined ? null : Number(values.old_price),
        discount_percentage:
          values.discount_percentage ??
          calcDiscount(values.old_price ? Number(values.old_price) : null, Number(values.current_price ?? 0)),
        rating: values.rating === null ? null : Number(values.rating),
        review_count: Number(values.review_count ?? 0),
        five_star_count: Number(values.five_star_count ?? 0),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof ProductFormValues,
    label: string,
    type: "text" | "number" = "text",
    props: Record<string, unknown> = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={String(key)}>{label}</Label>
      <Input
        id={String(key)}
        type={type}
        value={(values[key] ?? "") as string | number}
        onChange={(e) =>
          set(key, (type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value) as never)
        }
        {...props}
      />
    </div>
  );

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="grid gap-4 rounded-lg border border-border bg-background p-4 md:grid-cols-2">
        {field("name", "Nome do produto")}
        {field("slug", "Slug (URL)", "text", { placeholder: "gerado automaticamente" })}
        {field("current_price", "Preço atual (R$)", "number", { step: "0.01", min: "0" })}
        {field("old_price", "Preço antigo (R$)", "number", { step: "0.01", min: "0" })}
        {field("discount_percentage", "Desconto (%)", "number", { min: "0", max: "99" })}
        {field("installment_text", "Texto de parcelamento")}
        {field("sales_count", "Vendas (texto)")}
        {field("search_placeholder", "Placeholder da busca")}
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-background p-4 md:grid-cols-3">
        {field("rating", "Nota", "number", { step: "0.1", min: "0", max: "5" })}
        {field("review_count", "Total de avaliações", "number", { min: "0" })}
        {field("five_star_count", "Avaliações 5 estrelas", "number", { min: "0" })}
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-background p-4 md:grid-cols-2">
        {field("shipping_fee", "Taxa de envio (texto)")}
        {field("shipping_promotion_text", "Promoção de quantidade")}
        {field("shipping_discount_text", "Desconto no frete")}
        {field("customer_protection_text", "Proteção ao cliente")}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-background p-4">
        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            rows={4}
            value={values.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="closing_text">Texto de encerramento</Label>
          <Textarea
            id="closing_text"
            rows={3}
            value={values.closing_text ?? ""}
            onChange={(e) => set("closing_text", e.target.value)}
          />
        </div>
        {field("checkout_url", "URL de checkout")}
        <div className="flex items-center gap-3">
          <Switch
            id="is_active"
            checked={!!values.is_active}
            onCheckedChange={(checked) => set("is_active", checked)}
          />
          <Label htmlFor="is_active">Produto ativo na loja</Label>
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? "Salvando..." : submitLabel}</Button>
    </form>
  );
}
