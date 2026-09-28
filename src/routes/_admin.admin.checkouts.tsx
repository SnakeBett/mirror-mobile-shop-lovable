import { createFileRoute } from "@tanstack/react-router";
import { ProductCheckoutsList } from "@/components/admin/product-checkouts-list";

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

function CheckoutsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Checkouts por produto</h1>
      </div>
      <ProductCheckoutsList />
    </div>
  );
}
