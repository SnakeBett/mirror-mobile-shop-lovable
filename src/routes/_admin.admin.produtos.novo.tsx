import { createFileRoute } from "@tanstack/react-router";

import { ProductEditor } from "@/components/admin/product-editor";

export const Route = createFileRoute("/_admin/admin/produtos/novo")({
  head: () => ({
    meta: [
      { title: "Novo produto | Vitrine Admin" },
      { name: "description", content: "Cadastre um novo produto na vitrine." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Novo produto | Vitrine Admin" },
      { property: "og:description", content: "Cadastre um novo produto na vitrine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewProduct,
});

function NewProduct() {
  return <ProductEditor />;
}
