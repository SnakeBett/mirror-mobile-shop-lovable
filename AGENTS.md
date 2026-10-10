<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Kits/variações: tabelas product_quantity_offers, product_attributes, product_attribute_values, product_variants (option_values = {attribute_id: value_id}); liga/desliga em product_page_settings.variant_settings; lógica pura em src/lib/variants.ts — why: produtos antigos seguem intactos com tudo desligado por padrão.
- Seleção de compra vira "checkout context" em sessionStorage (vt_checkout_context) e nos eventos internos; nada é anexado à URL do checkout externo — why: gateway ainda não confirmou suporte a esses parâmetros.
- A lista administrativa de checkouts por produto é compartilhada entre a aba Checkout e /admin/checkouts — why: ambos devem agrupar os mesmos links por nome do produto sem duplicar registros.
- Offer countdowns persist a per-product deadline in browser storage and stop at zero without automatic renewal — why: refreshing must not reset the displayed deadline.
