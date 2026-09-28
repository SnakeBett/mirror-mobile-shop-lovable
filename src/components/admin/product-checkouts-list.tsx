import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, ImageIcon, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getProduct, listProductsWithMeta } from "@/lib/admin-queries";
import { isValidCheckoutUrl } from "@/lib/variants";
import { CheckoutLinksManager } from "@/components/admin/variants-manager";

type Summary = {
  id: string;
  name: string;
  thumbnail: string | null;
  total: number;
  withCheckout: number;
  offers: number;
};

type Status = "complete" | "pending" | "none";

function statusOf(product: Summary): Status {
  if (product.withCheckout === 0) return "none";
  return product.withCheckout >= product.total ? "complete" : "pending";
}

const statusChip: Record<Status, { label: (p: Summary) => string; className: string }> = {
  complete: { label: () => "Tudo configurado", className: "bg-success/10 text-success" },
  pending: {
    label: (p) => `${p.total - p.withCheckout} pendente${p.total - p.withCheckout === 1 ? "" : "s"}`,
    className: "bg-destructive/10 text-destructive",
  },
  none: { label: () => "Sem links", className: "bg-muted text-muted-foreground" },
};

async function loadSummaries(): Promise<Summary[]> {
  const [products, attrs, values, variants, offers] = await Promise.all([
    listProductsWithMeta(),
    supabase.from("product_attributes").select("id, product_id"),
    supabase.from("product_attribute_values").select("id, attribute_id"),
    supabase.from("product_variants").select("product_id, use_custom_checkout, checkout_url"),
    supabase.from("product_quantity_offers").select("product_id"),
  ]);
  for (const result of [attrs, values, variants, offers]) {
    if (result.error) throw result.error;
  }
  const valueCount = new Map<string, number>();
  for (const value of values.data ?? []) valueCount.set(value.attribute_id, (valueCount.get(value.attribute_id) ?? 0) + 1);
  return (products ?? [])
    .map((product) => {
      const counts = (attrs.data ?? []).filter((a) => a.product_id === product.id)
        .map((a) => valueCount.get(a.id) ?? 0).filter((n) => n > 0);
      const rows = (variants.data ?? []).filter((v) => v.product_id === product.id);
      const total = Math.max(counts.length ? counts.reduce((a, b) => a * b, 1) : 0, rows.length);
      const offerCount = (offers.data ?? []).filter((offer) => offer.product_id === product.id).length;
      return {
        id: product.id,
        name: product.name,
        thumbnail: product.thumbnail,
        total,
        withCheckout: rows.filter((v) => v.use_custom_checkout && isValidCheckoutUrl(v.checkout_url)).length,
        offers: offerCount,
      };
    })
    .filter((p) => p.total > 0 || p.offers > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function SegButton({
  active,
  count,
  children,
  onClick,
}: {
  active: boolean;
  count: number;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-lg bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm"
          : "rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children} <span className={active ? "text-muted-foreground" : ""}>{count}</span>
    </button>
  );
}

export function ProductCheckoutsList({ currentProductId }: { currentProductId?: string }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");
  const [openId, setOpenId] = useState<string | null>(() => currentProductId ?? null);
  const { data = [], isLoading, error } = useQuery({ queryKey: ["checkout-summaries"], queryFn: loadSummaries });
  const term = search.trim().toLowerCase();
  const list = data
    .filter((p) => !term || p.name.toLowerCase().includes(term))
    .filter((p) => (filter === "with" ? p.withCheckout > 0 : filter === "without" ? p.withCheckout === 0 : true));

  const completeCount = data.filter((p) => statusOf(p) === "complete").length;
  const withoutCount = data.filter((p) => statusOf(p) === "none").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            aria-label="Buscar produto"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div className="flex w-fit items-center gap-1 rounded-xl bg-muted p-1">
          <SegButton active={filter === "all"} count={data.length} onClick={() => setFilter("all")}>Todas</SegButton>
          <SegButton active={filter === "with"} count={data.length - withoutCount} onClick={() => setFilter("with")}>
            Com checkout
          </SegButton>
          <SegButton active={filter === "without"} count={withoutCount} onClick={() => setFilter("without")}>
            Sem checkout
          </SegButton>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar os produtos.</p>}
      {!isLoading && !error && list.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
          {completeCount >= 0 && !term && filter !== "all"
            ? "Nenhum produto neste filtro."
            : "Nenhum produto com ofertas ou variações encontrado."}
        </p>
      )}

      <div className="space-y-3">
        {list.map((product) => {
          const expanded = openId === product.id;
          const status = statusOf(product);
          const chip = statusChip[status];
          return (
            <section
              key={product.id}
              className={
                expanded
                  ? "overflow-hidden rounded-2xl border-2 border-primary/30 bg-card shadow-md shadow-primary/5 transition-shadow"
                  : "group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-colors hover:border-foreground/25"
              }
            >
              <button
                type="button"
                aria-expanded={expanded}
                className="flex w-full items-center gap-4 p-4 text-left"
                onClick={() => setOpenId((previous) => (previous === product.id ? null : product.id))}
              >
                <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                  {product.thumbnail ? (
                    <img src={product.thumbnail} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-5" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                    {product.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{product.total} variações</span>
                    <span className="size-1 rounded-full bg-border" />
                    {product.offers > 0 && (
                      <>
                        <span>{product.offers} oferta{product.offers === 1 ? "" : "s"}</span>
                        <span className="size-1 rounded-full bg-border" />
                      </>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chip.className}`}>
                      {chip.label(product)}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground ${expanded ? "rotate-180 text-primary" : ""}`}
                />
              </button>
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
  if (isLoading) return <p className="border-t border-border px-4 py-5 text-sm text-muted-foreground">Carregando...</p>;
  if (error || !data)
    return <p className="border-t border-border px-4 py-5 text-sm text-destructive">Não foi possível carregar os checkouts.</p>;
  return (
    <div className="border-t border-border bg-muted/20 p-4">
      <CheckoutLinksManager
        productId={id}
        offers={data.quantityOffers}
        offersEnabled={data.page.variant_settings.quantity_offers_enabled}
        flat
        attributes={data.attributes}
        variants={data.variants}
        defaultCheckoutUrl={data.product.checkout_url ?? null}
        onChange={() => {
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["checkout-summaries"] });
          void queryClient.invalidateQueries({ queryKey: ["admin", "product", id] });
        }}
      />
    </div>
  );
}
