import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getProduct } from "@/lib/admin-queries";
import { CheckoutLinksManager } from "@/components/admin/variants-manager";
import { Input } from "@/components/ui/input";
import { isValidCheckoutUrl } from "@/lib/variants";

export const Route = createFileRoute("/_admin/admin/checkouts")({
  head: () => ({
    meta: [
      { title: "Checkouts das variações | Vitrine Admin" },
      { name: "description", content: "Gerencie os links de checkout das variações de cada produto." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Checkouts das variações | Vitrine Admin" },
      { property: "og:description", content: "Gerencie os links de checkout das variações de cada produto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutsPage,
});

type Summary = { id: string; name: string; total: number; withCheckout: number };

async function loadSummaries(): Promise<Summary[]> {
  const [products, attrs, values, variants] = await Promise.all([
    supabase.from("products").select("id, name").order("name"),
    supabase.from("product_attributes").select("id, product_id"),
    supabase.from("product_attribute_values").select("id, attribute_id"),
    supabase.from("product_variants").select("product_id, use_custom_checkout, checkout_url"),
  ]);
  if (products.error) throw products.error;
  const valueCount = new Map<string, number>();
  for (const v of values.data ?? []) valueCount.set(v.attribute_id, (valueCount.get(v.attribute_id) ?? 0) + 1);
  const result: Summary[] = [];
  for (const p of products.data ?? []) {
    const counts = (attrs.data ?? [])
      .filter((a) => a.product_id === p.id)
      .map((a) => valueCount.get(a.id) ?? 0)
      .filter((n) => n > 0);
    const rows = (variants.data ?? []).filter((v) => v.product_id === p.id);
    const combos = counts.length ? counts.reduce((a, b) => a * b, 1) : 0;
    const total = Math.max(combos, rows.length);
    if (total === 0) continue;
    const withCheckout = rows.filter((v) => v.use_custom_checkout && isValidCheckoutUrl(v.checkout_url)).length;
    result.push({ id: p.id, name: p.name, total, withCheckout });
  }
  return result;
}

function CheckoutsPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { data = [], isLoading } = useQuery({ queryKey: ["checkout-summaries"], queryFn: loadSummaries });
  const q = query.trim().toLowerCase();
  const list = data.filter((p) => !q || p.name.toLowerCase().includes(q));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Checkouts das variações</h1>
        <p className="text-sm text-muted-foreground">Clique em um produto para configurar o checkout de cada combinação.</p>
      </div>
      <Input placeholder="Buscar produto..." value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-md" />
      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && list.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum produto com variações encontrado.</p>
      )}
      <div className="space-y-2">
        {list.map((p) => {
          const isOpen = open.has(p.id);
          return (
            <div key={p.id} className="rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.total} variações • {p.withCheckout} configuradas • {p.total - p.withCheckout} sem checkout
                  </p>
                </div>
              </button>
              {isOpen && <ProductVariantCheckouts id={p.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProductVariantCheckouts({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["checkout-product", id], queryFn: () => getProduct(id) });
  if (isLoading || !data) return <p className="px-4 pb-4 text-sm text-muted-foreground">Carregando...</p>;
  return (
    <div className="border-t border-border p-4">
      <CheckoutLinksManager
        productId={id}
        offers={[]}
        offersEnabled={false}
        attributes={data.attributes}
        variants={data.variants}
        defaultCheckoutUrl={data.product.checkout_url ?? null}
        onChange={() => {
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["checkout-summaries"] });
        }}
      />
    </div>
  );
}
