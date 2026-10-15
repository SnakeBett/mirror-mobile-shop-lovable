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
- Store info card data lives in `stores` (one row per store, display fields in `info` jsonb) linked via `products.store_id`; `app_settings.store_info` is deprecated — why: each product can show a different store and editing a store updates all its products.
- Own checkout (/checkout) recalculates price, kit, variant and coupon server-side in src/lib/checkout.functions.ts; orders + coupon usage are created atomically by the checkout_create_order DB function with an idempotency key — why: browser values are never trusted and double clicks must not duplicate orders/coupon uses.
- products.checkout_mode defaults to 'external'; only 'own' sends "Comprar agora" to /checkout — why: existing external checkout links keep working in parallel.

- Pix gateways (ZuckPay, ImperiumPay) are adapters in src/lib/gateways/*.server.ts; payment_attempts holds one open attempt per order and orders become paid only via reconcileAttempt (authenticated gateway status query) — why: webhooks/browser are never trusted and double clicks must not create duplicate charges.
- Gateway credentials and the public site URL are edited in Admin → Pagamentos → Gateways and stored as versioned JSON in the private Storage bucket `configuracao-privada` (src/lib/gateways/credential-store.server.ts); adapters receive credentials as a parameter. Only the newest version is ever used (an unreadable newest version is an error, never a fallback to an older one) and writes verify nobody wrote in between. Env vars (IMPERIUMPAY_*, ZUCKPAY_*, PUBLIC_SITE_URL) count only for fields the panel is known not to have; if the vault cannot be read, the checkout uses this server's last good read (≤10 min) or refuses the Pix — never the env vars. Never add a storage policy for that bucket and never return credential values to the browser (only the last 4 chars) — why: Lovable does not run migrations pushed through Git, a service-role-only bucket needs no schema change, and env keys may belong to another gateway account.
- Physical address validity is shared by checkout UI and server in src/lib/checkout-address.ts — why: delivery visibility and payment eligibility must agree.
- Payment diagnostics retain only allowlisted provider error codes and HTTP metadata, never raw response bodies; ambiguous creation responses preserve transaction IDs — why: sensitive data stays private and retries cannot duplicate uncertain charges.
