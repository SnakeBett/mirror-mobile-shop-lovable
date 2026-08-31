import { createFileRoute, redirect } from "@tanstack/react-router";

import { getFirstActiveSlug } from "@/lib/public-product.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const slug = await getFirstActiveSlug();
    if (slug) {
      throw redirect({ to: "/produto/$slug", params: { slug } });
    }
  },
  head: () => ({
    meta: [
      { title: "Vitrine Mobile | Produtos" },
      { name: "description", content: "Vitrine mobile de produtos com checkout rápido." },
      { property: "og:title", content: "Vitrine Mobile | Produtos" },
      { property: "og:description", content: "Vitrine mobile de produtos com checkout rápido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmptyStore,
});

function EmptyStore() {
  return (
    <main className="product-shell">
      <div className="product-padding" style={{ paddingTop: 64, textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Nenhum produto publicado</h1>
        <p style={{ marginTop: 8, fontSize: 13, color: "var(--muted-foreground)" }}>
          Cadastre um produto no painel administrativo em /admin.
        </p>
      </div>
    </main>
  );
}
