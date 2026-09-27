# Kits por quantidade + Variações de produto

## Objetivo
Adicionar ofertas por quantidade (kits) e variações livres (cor, tamanho, capacidade, modelo...) por produto, com escolha por unidade, sem alterar o layout atual nem quebrar produtos existentes, checkout, tracking, Meta, UTMify ou Imperium Pay. Tudo desligado por padrão.

## Banco de dados (novas tabelas, só admin edita, leitura pública apenas do que está ativo)
- `product_quantity_offers`: nome, quantidade, preço total, preço anterior opcional, desconto manual opcional, texto auxiliar, badge, "mais popular", ativa, ordem.
- `product_attributes`: nome (ex.: Cor), tipo de exibição (cor / botões / lista), ordem.
- `product_attribute_values`: nome, cor visual (hex) opcional, imagem opcional, ordem.
- `product_variants` (SKUs): combinação de valores, SKU, preço e preço anterior opcionais, estoque, imagem(ns), ativa.
- Configurações por produto (JSON existente): `quantity_offers_enabled`, `variants_enabled`, `track_stock`, "usar a mesma variação em todas" como padrão.
- `orders.metadata` passa a guardar oferta, quantidade, itens escolhidos, preço unitário e total (sem mudar colunas atuais nem status financeiro).

## Admin
- Aba **Oferta**: nova seção "Ofertas por quantidade" com switch, "+ Adicionar oferta", edição, ativação, reordenação (arrastar e setas) e cálculo automático de economia e % (sobrescrevível).
- Nova aba **Variações** (entre Oferta e Entrega): switch "Este produto possui variações", atributos livres com valores (cor com hex + imagem opcional), geração automática das combinações e tabela de SKUs (SKU, preço, preço anterior, estoque, imagem, ativa). Controle de estoque ligável.
- Duplicar produto copia atributos, valores, SKUs, kits e configurações com novos IDs (mapeando referências entre eles).

## Página pública (só aparece quando ativado)
- Cards de kit selecionáveis, compactos: nome, total, preço por unidade, economia, badge; selecionado em destaque. Primeiro kit "mais popular" vem pré-selecionado.
- Preço exibido atualiza com o kit/variação: dentro da faixa laranja quando ativa, senão no bloco padrão — nunca duplicado.
- Seletores de variação: bolinha de cor + nome, botões compactos para tamanhos/outros; indisponíveis desabilitados (estoque 0 ou SKU inativo).
- Com kit de N unidades e variações: blocos "Unidade 1..N" + opção "Usar a mesma variação em todas".
- Galeria troca para as imagens da cor/SKU escolhido quando configuradas.
- Resumo compacto antes do botão (Kit 3 — 1x Preto / M, 1x Azul / G... — Total).
- Validação no "Comprar agora": mensagem inline clara ("Escolha a cor da unidade 2."), sem alert(), sem redirecionar.

## Regra de preço
- Sem kit: preço do SKU escolhido, ou preço base se o SKU não tiver preço próprio.
- Com kit: preço do kit; se alguma unidade escolhida tiver SKU com preço diferente do base, soma-se a diferença dessa unidade ao total do kit.

## Checkout, analytics e Meta
- `checkout_url` continua igual; nenhum parâmetro novo é adicionado à URL externa.
- Monta um "checkout context" (produto, oferta, quantidade, variações, total, moeda) salvo na sessão e enviado junto ao evento interno de início de checkout, para uso futuro em pedidos.
- Eventos internos existentes ganham `offer_id`, `quantity`, `variant_ids`, `total_value` quando aplicável.
- InitiateCheckout (Pixel + CAPI) passa a usar value/quantity/contents reais da seleção; Purchase segue só após pagamento confirmado.

## Validação
Testar os cenários A–D (simples, simples+kit, variações, variações+kit), kits de 2 e 3 com variações diferentes, SKU sem estoque, SKU com preço diferente, faixa laranja ligada/desligada e preço nunca duplicado, em celular e desktop; duplicação de produto.

## Limitação honesta
O checkout externo (Imperium Pay) não recebe automaticamente as variações escolhidas enquanto não confirmarmos que ele aceita esses dados; o registro completo fica pronto do nosso lado.
