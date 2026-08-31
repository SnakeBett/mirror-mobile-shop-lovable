import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { ProductForm } from "@/components/admin/product-form";
import { createProduct } from "@/lib/admin-queries";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-foreground">Novo produto</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Após salvar você poderá adicionar imagens, avaliações, detalhes e promoções.
      </p>
      <div className="mt-6">
        <ProductForm
          submitLabel="Criar produto"
          onSubmit={async (values) => {
            const id = await createProduct(values);
            queryClient.invalidateQueries({ queryKey: ["admin"] });
            navigate({ to: "/admin/produtos/$id", params: { id } });
          }}
        />
      </div>
    </div>
  );
}
