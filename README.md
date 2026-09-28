# Pixel Perfect Product

Quero iniciar um projeto de e-commerce mobile-first tomando a IMAGEM DE REFERÊNCIA ANEXADA como especificação visual principal.

IMPORTANTE:

A prioridade absoluta desta primeira etapa é FIDELIDADE VISUAL.

Não quero uma versão “inspirada”.

Não quero uma releitura.

Não quero modernização do design.

Não quero que você altere a estrutura por preferência própria.

Quero reconstruir a estrutura visual apresentada na referência com máxima fidelidade possível em:

- largura

- proporções

- espaçamentos

- margens

- paddings

- cores

- tipografia aproximada

- tamanhos das fontes

- pesos das fontes

- divisores

- bordas

- ícones

- hierarquia visual

- posicionamento

- tamanho das imagens

- organização das informações

- barra inferior fixa

- comportamento mobile

Não utilizar logotipos, marcas ou nomes proprietários da plataforma da referência. O conteúdo comercial será nosso, mas a estrutura visual e experiência devem seguir a imagem anexada.

==================================================

OBJETIVO DA PRIMEIRA ETAPA

==================================================

Crie SOMENTE a página pública de produto.

NÃO criar painel administrativo ainda.

NÃO conectar Supabase ainda.

NÃO criar checkout interno ainda.

NÃO criar sistema complexo de autenticação ainda.

Primeiro vamos aprovar a interface visual.

Crie a rota:

/produto/demo

Essa página será posteriormente transformada em um template dinâmico para vários produtos.

==================================================

LAYOUT GERAL

==================================================

A aplicação deve ser mobile-first.

A referência mostra uma página estreita no centro da tela, semelhante à experiência de um aplicativo mobile/e-commerce.

No desktop:

- manter a página centralizada;

- preservar aproximadamente a largura mobile vista na referência;

- fundo externo branco ou neutro extremamente discreto;

- NÃO esticar os elementos para preencher toda a tela.

No smartphone:

- utilizar 100% da largura disponível;

- preservar exatamente a hierarquia da referência;

- respeitar safe areas;

- barra de compra inferior sempre acessível.

A página deve parecer praticamente a mesma interface tanto vista no smartphone quanto centralizada no desktop.

==================================================

1. CABEÇALHO SUPERIOR

==================================================

Reproduzir a composição da referência.

Na primeira linha:

lado esquerdo:

- ícone de voltar

centro:

- campo de busca arredondado

- placeholder inicial: "Pesquisar produtos"

lado direito:

- ícone compartilhar

- ícone carrinho com pequeno badge vermelho

- menu de três pontos

O cabeçalho deve ser compacto e seguir exatamente as proporções e espaçamentos observados na referência.

==================================================

2. ABAS DE NAVEGAÇÃO

==================================================

Logo abaixo do cabeçalho criar quatro abas:

Visão geral

Avaliações

Descrição

Recomendações

A aba "Visão geral" inicia ativa.

Criar linha indicadora inferior na aba ativa.

Ao clicar:

Avaliações:

rolar suavemente até a seção de avaliações.

Descrição:

rolar até a descrição.

Visão geral:

voltar ao topo.

Recomendações:

por enquanto pode navegar para uma seção placeholder no final, sem alterar o layout principal.

As abas podem ficar sticky durante a navegação caso isso corresponda ao comportamento visual da referência.

==================================================

3. GALERIA DO PRODUTO

==================================================

Criar uma galeria grande imediatamente abaixo das abas.

A imagem do produto deve ocupar praticamente toda a largura disponível da página, respeitando a mesma proporção da referência.

Adicionar:

- imagem principal

- miniaturas sobrepostas/posicionadas na parte inferior esquerda conforme referência

- indicador de quantidade no canto inferior direito, exemplo "1/3"

- swipe no mobile

- clique nas miniaturas

- troca da imagem principal

- transição extremamente discreta

Usar imagens placeholder enquanto não forem fornecidas imagens definitivas.

Não criar card com bordas em volta da imagem caso a referência não possua.

==================================================

4. BLOCO DE PREÇO

==================================================

Abaixo da galeria reproduzir fielmente o bloco.

Exemplo inicial:

badge:

-40%

preço:

R$ 33,90

preço antigo:

R$ 74,90

Abaixo:

11x R$ 3,08, com desconto de 15% de juros

Manter preço principal com bastante destaque e na mesma cor vermelha/rosa observada na referência.

O preço antigo deve ficar menor, cinza e riscado.

==================================================

5. BENEFÍCIOS/PROMOÇÕES

==================================================

Abaixo do preço criar pequenos chips/banners promocionais horizontais.

Exemplo:

"Compre R$ 80 e ganhe R$ 5 de desconto"

"Economize 8%"

Os chips precisam reproduzir tamanho, fundo rosado, tipografia, bordas e espaçamento da referência.

Permitir scroll horizontal caso ultrapassem a largura.

==================================================

6. TÍTULO E INFORMAÇÕES DO PRODUTO

==================================================

Criar:

Título:

"Creme de Avelã 700g — Pote Econômico"

Ao lado do título:

ícone de salvar/favoritar.

Logo abaixo:

★★★★★

4,8

(236)

25,1K vendidos on-line

Usar estrelas amarelas/douradas conforme referência.

Manter textos secundários pequenos e discretos.

==================================================

7. DIVISOR

==================================================

Adicionar divisor horizontal suave exatamente semelhante à referência.

Esses divisores serão utilizados para separar os grandes blocos da página.

==================================================

8. ENTREGA

==================================================

Criar bloco de entrega com ícone de caminhão.

Texto principal:

"Receba até [DATA INICIAL] - [DATA FINAL]"

A DATA deve ser calculada automaticamente.

Criar agora uma função JavaScript/TypeScript que calcule:

data mínima = hoje + 3 dias

data máxima = hoje + 6 dias

Portanto, o texto se atualiza automaticamente todos os dias sem intervenção administrativa.

Exemplo:

se hoje for 31 de agosto, apresentar aproximadamente:

"Receba entre 3 de set. e 6 de set."

Não hardcode as datas.

Abaixo apresentar:

"Taxa de envio: R$ 0,10"

e:

"Compre 3 para ter desconto de R$ 20"

e:

"Desconto de R$ 9 no frete em pedidos acima de R$ 9"

Usar cores e hierarquia iguais à referência.

==================================================

9. PROTEÇÃO AO CLIENTE

==================================================

Criar uma linha:

ícone de escudo

"Proteção ao cliente"

chevron/seta para direita

A linha inteira deve parecer clicável.

==================================================

10. AVALIAÇÕES

==================================================

Criar seção:

⭐ 4,8 Avaliações dos clientes (236)

lado direito:

"Ver mais >"

Abaixo:

"189 avaliações de 5 estrelas nos últimos 30 dias"

Depois reproduzir o formato dos reviews da referência.

Cada avaliação deve conter:

- avatar circular com inicial

- estrelas

- nome da pessoa

- imagem opcional do produto

- comentário

- divisor inferior

Criar inicialmente três avaliações mockadas.

Exemplo:

Camila R.

★★★★★

"Veio certinho e em um tempo bom também. Qualidade do produto: muito bom!!"

Juliana M.

★★★★★

"Chegou bem embalado e dentro do prazo."

Patrícia L.

★★★★★

"O pote rende bastante. Já vou pedir mais."

As imagens dos reviews devem ser pequenas e manter aproximadamente a dimensão da referência.

Não transformar avaliações em cards grandes.

Elas devem ficar integradas à página, separadas principalmente por espaçamento e divisores.

==================================================

11. SOBRE ESTE PRODUTO

==================================================

Criar título:

"Sobre este produto"

Subtítulo:

"Detalhes"

Criar estrutura de informações semelhante à referência:

Sabor                  Avelã

Peso líquido           700g

Tipo de chocolate      Avelã com cacau

Manter formato simples em duas colunas, sem criar tabela pesada.

==================================================

12. DESCRIÇÃO

==================================================

Criar título:

"Descrição"

Adicionar texto placeholder comercial.

Depois:

"Diferenciais:"

Com pequenos bullets:

Ingredientes de alta qualidade

Textura cremosa

Sabor marcante

Versatilidade de uso

Embalagem econômica

Adicionar um parágrafo complementar abaixo.

Tipografia compacta e legível.

==================================================

13. BARRA DE COMPRA FIXA INFERIOR

==================================================

ESSA PARTE É MUITO IMPORTANTE.

Reproduzir o rodapé fixo da referência.

A barra deve ficar presa na parte inferior da tela.

Da esquerda para direita:

ícone Loja

texto "Loja"

ícone Chat

texto "Chat"

ícone Carrinho em área circular/rosada

e um grande botão principal:

"Comprar agora"

Dentro ou abaixo do texto do botão apresentar:

"Promoção de R$ 33,90"

O botão deve:

- possuir o mesmo vermelho/rosa forte da referência;

- ser arredondado;

- ocupar a maior parte da largura disponível;

- manter altura semelhante;

- ficar sempre visível.

A página precisa possuir padding-bottom suficiente para que a barra fixa não cubra o conteúdo.

==================================================

ARQUITETURA DO FRONTEND

==================================================

Usar:

React

TypeScript

Tailwind CSS

Organizar os componentes para posteriormente receber dados do banco.

Criar componentes reutilizáveis, por exemplo:

ProductHeader

ProductTabs

ProductGallery

ProductPrice

PromotionChips

ProductInfo

ShippingInfo

CustomerProtection

ReviewsSection

ProductDetails

ProductDescription

StickyPurchaseBar

Mas NÃO permitir que a componentização altere o visual da referência.

==================================================

DADOS MOCKADOS

==================================================

Criar um objeto Product único contendo todos os dados atualmente exibidos.

Exemplo conceitual:

product = {

 id,

 slug,

 name,

 currentPrice,

 oldPrice,

 discountPercentage,

 installments,

 salesCount,

 rating,

 reviewCount,

 images,

 shipping,

 details,

 description,

 highlights,

 reviews,

 checkoutUrl

}

Todos os elementos da interface devem consumir esse objeto.

Não espalhar textos e preços hardcoded pelos componentes.

Isso facilitará a conexão com Supabase posteriormente.

==================================================

RESPONSIVIDADE

==================================================

Prioridade máxima para:

375px

390px

430px

Também testar:

360px

768px

desktop

No desktop NÃO transformar a página em uma loja desktop tradicional.

Preservar a experiência vertical/mobile centralizada observada na referência.

==================================================

FIDELIDADE VISUAL

==================================================

Compare continuamente a implementação com a imagem anexada.

Não utilizar componentes genéricos grandes.

Não adicionar:

gradientes que não existam

sombras fortes

cards desnecessários

menus extras

hero section

banner promocional inventado

footer tradicional

newsletter

categorias extras

elementos decorativos

animações chamativas

Não altere o design com a justificativa de "melhorar a experiência".

Neste projeto a referência é a especificação visual.

Quando existir dúvida entre sua preferência de design e a imagem:

SIGA A IMAGEM.

==================================================

QUALIDADE

==================================================

A implementação deve ter:

- TypeScript sem erros

- zero overflow horizontal

- componentes organizados

- interface rápida

- imagens com object-fit adequado

- lazy loading quando apropriado

- scroll suave

- boa performance mobile

- elementos clicáveis funcionando

- layout estável durante carregamento

==================================================

PREPARAÇÃO PARA A PRÓXIMA FASE

==================================================

Não implementar o backend agora, mas deixar a arquitetura preparada para que posteriormente possamos criar:

/admin

e conectar Supabase para controlar:

nome

preço

preço antigo

desconto

imagens

avaliações

descrição

detalhes

promoções

frete

checkout

status do produto

Também construiremos posteriormente rotas dinâmicas:

/produto/:slug

Mas NÃO fazer isso agora.

==================================================

FINALIZAÇÃO DESTA ETAPA

==================================================

Depois de implementar:

1. revise toda a página;

2. compare novamente com a referência;

3. corrija diferenças óbvias de espaçamento e tamanho;

4. garanta que a barra inferior esteja perfeita no mobile;

5. garanta que nenhuma seção importante da referência tenha sido ignorada.

Não apresente apenas um plano.

IMPLEMENTE A PÁGINA COMPLETA.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mirror-mobile-shop.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3e5c2a7c-afb9-4fe4-84a9-5af06a27398e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
