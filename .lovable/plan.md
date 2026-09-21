# Faixa promocional e ofertas por produto

## Objetivo
Adicionar à página pública atual uma faixa promocional logo após a galeria e uma seção ordenável de ofertas em carrossel horizontal, mantendo intactos layout, checkout e integrações existentes.

## Banco e dados
- Criar `product_offers`, vinculada ao produto, com título, subtítulo, tipo/valor do benefício, cupom, texto e ação do botão, URL, ícone, status, validade e ordem.
- Liberar leitura pública somente das ofertas elegíveis e gerenciamento apenas para administradores, com regras de acesso e índices adequados.
- Ampliar as configurações por produto com:
  - faixa promocional: ativação, tipo/texto, ícone, fontes dos preços, desconto automático/manual, “A partir de” e cores do degradê;
  - seção Ofertas: ativação e título.
- Manter defaults desligados para produtos existentes, evitando mudança visual inesperada.

## Página pública
- Renderizar a faixa imediatamente após a galeria, com preço sem quebra, badge legível e degradê laranja–vermelho configurável.
- Calcular o desconto automaticamente quando houver preço atual e anterior válidos; aceitar valores manuais quando configurados.
- Renderizar somente ofertas ativas e dentro da validade, respeitando o fuso horário configurado da loja.
- Criar cards compactos em scroll horizontal com CSS scroll-snap, mostrando parte do próximo card no celular e sem rotação automática.
- Implementar ações: selecionar, copiar cupom, aplicar cupom com fallback honesto para cópia/instrução, abrir link e sem ação.
- Mostrar feedback discreto “Cupom copiado”, sem `alert()`.
- Ocultar completamente a seção quando nenhuma oferta for elegível.

## Admin
- Na aba Oferta, adicionar o painel “Faixa promocional” com todos os controles solicitados e restauração das cores padrão.
- Adicionar “Ofertas e benefícios” com criação, edição, ativação, validade, ação, cupom, link, ícone e exclusão.
- Permitir reordenação por arrastar e também por controles acessíveis; a ordem pública será idêntica.
- Integrar “Ofertas” à lista atual de seções visíveis e à ordenação da página.
- Ao duplicar um produto, clonar configurações da faixa e criar novas linhas independentes para todas as ofertas.

## Métricas internas
- Estender apenas o analytics interno com `offer_view`, `offer_click` e `coupon_copy`.
- Enviar `product_id`, `offer_id` e `offer_type` como dados anônimos; visitante e sessão continuam sendo preenchidos pelo mecanismo atual.
- Não alterar Meta Pixel, Meta CAPI, UTMify, webhook, checkout ou Imperium Pay.

## Validação
- Verificar criação, edição, reordenação, ativação, validade e duplicação no admin.
- Testar faixa e carrossel em celular e desktop, incluindo textos longos e ausência de ofertas.
- Confirmar cópia de cupom, abertura de link e registro dos três eventos internos.
