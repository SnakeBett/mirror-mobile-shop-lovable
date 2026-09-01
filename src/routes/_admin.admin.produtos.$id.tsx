import { createFileRoute } from "@tanstack/react-router";

import { ProductEditor } from "@/components/admin/product-editor";

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
  return <ProductEditor key={id} productId={id} />;
}
