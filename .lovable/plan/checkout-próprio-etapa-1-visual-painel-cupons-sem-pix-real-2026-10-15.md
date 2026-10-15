# Checkout próprio — Etapa 1 (visual + painel + cupons, sem Pix real)

O checkout externo atual continua funcionando. O novo checkout só é usado nos produtos em que você escolher "Checkout próprio".

## O que você vai ver

**Página /checkout** (mobile-first, fundo branco, botões rosa/vermelho)
- Faixa rotativa no topo com as suas frases (troca a cada 4s, para no toque, fica fixa se houver só uma, respeita "movimento reduzido").
- Cabeçalho: Voltar + logo da loja do produto (ou o nome da loja, se não houver logo), "Finalizar compra" e "Compra segura".
- Resumo: foto, nome, variação, kit com as variações de cada unidade, quantidade, preço e desconto — vindo da seleção feita na página do produto.
- Cupom logo abaixo do resumo, com aplicar, trocar e remover. O sistema confere o cupom, não o navegador.
- Dados do comprador (nome, e-mail, CPF, WhatsApp) com máscara e validação, guardados durante a navegação.
- Endereço com busca automática pelo CEP (ViaCEP), com todos os campos editáveis à mão.
- Resumo financeiro: subtotal, frete ("Grátis" só quando o produto tiver frete grátis), desconto, cupom e total. Tudo recalculado pelo sistema.
- Pagamento: Pix selecionado e cartão em cinza, "Indisponível para esta oferta".
- "Continuar para pagamento": valida tudo, recalcula, cria o pedido pendente uma única vez (sem duplicar com cliques repetidos) e mostra uma tela avisando que o Pix ainda não está conectado. Não mostro QR Code falso.
- InitiateCheckout é disparado ao entrar, mantendo UTMs, fbclid, fbp/fbc e UTMify. O Purchase continua saindo só após confirmação do pagamento.

**Painel**
- Checkout > Personalização: frases (criar, editar, excluir, reordenar, ligar/desligar), cores da faixa, mostrar logo e tamanho, cor e texto do botão, mostrar o cupom, mensagens de compra segura e de cartão indisponível.
- Checkout > Cupons: código, % ou valor fixo, início e fim, limite total, limite por comprador (pelo CPF), valor mínimo, produtos e lojas, ativo/inativo. O desconto nunca deixa o total negativo, e o uso fica registrado no pedido.
- Pagamentos > Gateways: ImperiumPay e ZuckPay cadastrados como "Pendente — documentação necessária", com ambiente, status e definição do gateway padrão.
- No editor do produto: "Tipo de checkout" (externo, que é o padrão, ou próprio) e "Gateway" (padrão ou um específico). Os links externos não são apagados.

## Fica para a Etapa 2 (quando você tiver a documentação e as chaves)
Gerar o Pix de verdade (QR Code, Copia e Cola, prazo real), conferir o status, receber os webhooks de cada gateway, a tela "Pagamento aprovado" ligada à confirmação real e os testes de pagamento. A estrutura de conexão de gateways já fica pronta para isso.

## Detalhes técnicos
- Novas tabelas: `checkout_settings` (registro único, com frases em jsonb), `coupons`, `coupon_redemptions` (único por pedido; limite por CPF), `payment_gateways`. Novas colunas em `products`: `checkout_mode` (padrão 'external') e `gateway_id`. Novas colunas em `orders`: valor, cupom, endereço, CPF do comprador e gateway.
- RLS: o admin pode tudo. Visitantes leem só a personalização. Cupons e gateways nunca são lidos pelo navegador.
- Funções públicas no servidor: `getCheckoutQuote` (recalcula preço, kit, variação e cupom a partir dos IDs) e `createPendingOrder` (com chave de idempotência, validação Zod e uso de cupom em transação com bloqueio da linha, para evitar dois usos ao mesmo tempo).
- `src/lib/gateways/` com a interface `createPixCharge / getPaymentStatus / verifyWebhook / normalizePaymentStatus`; os adaptadores ImperiumPay e ZuckPay respondem "pendente". Novos status no pedido: declined, expired, chargeback.
- O botão "Comprar agora" leva a /checkout só quando `checkout_mode = 'own'`; nos outros casos, o fluxo atual não muda.
