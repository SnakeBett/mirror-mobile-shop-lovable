import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getProduct } from "@/lib/admin-queries";
import { isValidCheckoutUrl } from "@/lib/variants";
import { CheckoutLinksManager } from "@/components/admin/variants-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Summary = { id: string; name: string; total: number; withCheckout: number; offers: number };

async function loadSummaries(): Promise<Summary[]> {
  const [products, attrs, values, variants, offers] = await Promise.all([
    supabase.from("products").select("id, name").order("name"),
    supabase.from("product_attributes").select("id, product_id"),
    supabase.from("product_attribute_values").select("id, attribute_id"),
    supabase.from("product_variants").select("product_id, use_custom_checkout, checkout_url"),
    supabase.from("product_quantity_offers").select("product_id"),
  ]);
  for (const result of [products, attrs, values, variants, offers]) {
    if (result.error) throw result.error;
  }
  const valueCount = new Map<string, number>();
  for (const value of values.data ?? []) valueCount.set(value.attribute_id, (valueCount.get(value.attribute_id) ?? 0) + 1);
  return (products.data ?? []).flatMap((product) => {
    const counts = (attrs.data ?? []).filter((a) => a.product_id === product.id)
      .map((a) => valueCount.get(a.id) ?? 0).filter((n) => n > 0);
    const rows = (variants.data ?? []).filter((v) => v.product_id === product.id);
    const total = Math.max(counts.length ? counts.reduce((a, b) => a * b, 1) : 0, rows.length);
    const offerCount = (offers.data ?? []).filter((offer) => offer.product_id === product.id).length;
    if (!total && !offerCount) return [];
    return [{ id: product.id, name: product.name, total,
      withCheckout: rows.filter((v) => v.use_custom_checkout && isValidCheckoutUrl(v.checkout_url)).length,
      offers: offerCount }];
  });
}

export function ProductCheckoutsList({ currentProductId }: { currentProductId?: string }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(currentProductId ? [currentProductId] : []));
  const { data = [], isLoading, error } = useQuery({ queryKey: ["checkout-summaries"], queryFn: loadSummaries });
  const list = data.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <div className="space-y-4">
      <Input aria-label="Buscar produto" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar os produtos.</p>}
      {!isLoading && !error && list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto com ofertas ou variações encontrado.</p>}
      <div className="space-y-3">
        {list.map((product) => {
          const expanded = open.has(product.id);
          return (
            <section key={product.id} className="border-b border-border pb-3">
              <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-3 text-left" aria-expanded={expanded}
                onClick={() => setOpen((previous) => {
                  const next = new Set(previous);
                  if (next.has(product.id)) next.delete(product.id); else next.add(product.id);
                  return next;
                })}>
                {expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                <span className="min-w-0 whitespace-normal">
                  <span className="block font-semibold">{product.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {product.total} variações · {product.withCheckout} com checkout · {product.total - product.withCheckout} sem checkout
                    {product.offers > 0 && ` · ${product.offers} ofertas`}
                  </span>
                </span>
              </Button>
              {expanded && <ProductCheckoutEntries id={product.id} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ProductCheckoutEntries({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["checkout-product", id], queryFn: () => getProduct(id) });
  if (isLoading) return <p className="px-4 pb-4 text-sm text-muted-foreground">Carregando...</p>;
  if (error || !data) return <p className="px-4 pb-4 text-sm text-destructive">Não foi possível carregar os checkouts.</p>;
  return (
    <div className="space-y-4 pl-4 sm:pl-7">
      <CheckoutLinksManager productId={id} offers={data.quantityOffers}
        offersEnabled={data.page.variant_settings.quantity_offers_enabled}
        flat attributes={data.attributes} variants={data.variants}
        defaultCheckoutUrl={data.product.checkout_url ?? null}
        onChange={() => {
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["checkout-summaries"] });
          void queryClient.invalidateQueries({ queryKey: ["admin", "product", id] });
        }} />
    </div>
  );
}