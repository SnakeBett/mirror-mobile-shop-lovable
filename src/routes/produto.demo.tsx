import { createFileRoute } from "@tanstack/react-router";

import { ProductPage } from "@/components/product-page";

export const Route = createFileRoute("/produto/demo")({
  head: () => ({
    meta: [
      { title: "Creme de Avelã 700g | Produto Demo" },
      { name: "description", content: "Confira preço, entrega, detalhes e avaliações do creme de avelã 700g." },
      { property: "og:title", content: "Creme de Avelã 700g | Produto Demo" },
      { property: "og:description", content: "Confira preço, entrega, detalhes e avaliações do creme de avelã 700g." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductPage,
});