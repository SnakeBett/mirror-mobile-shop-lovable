import { createFileRoute } from "@tanstack/react-router";

import { ProductPage, ProductUnavailable } from "@/components/product-page";
import { getPublicProduct } from "@/lib/public-product.functions";

export const Route = createFileRoute("/produto/$slug")({
  // O loader devolve o produto já resolvido (com URLs assinadas) e o resultado
  // é reaproveitado na hidratação, evitando divergência entre SSR e cliente.
  loader: ({ params }) => getPublicProduct({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    if (!loaderData?.name) {
      return { meta: [{ title: "Produto indisponível" }, { name: "robots", content: "noindex" }] };
    }
    const description = (loaderData.description ?? "").slice(0, 155) || `Confira ${loaderData.name}.`;
    return {
      meta: [
        { title: `${loaderData.name} | Vitrine Mobile` },
        { name: "description", content: description },
        { property: "og:title", content: loaderData.name },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProductRoute,
  errorComponent: ProductUnavailable,
  notFoundComponent: ProductUnavailable,
});

function ProductRoute() {
  const product = Route.useLoaderData();
  if (!product) return <ProductUnavailable />;
  return <ProductPage product={product} />;
}
