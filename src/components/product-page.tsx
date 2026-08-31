import { useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Ellipsis,
  MessageCircle,
  Search,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import mainImage from "@/assets/hazelnut-spread-main.jpg";
import openImage from "@/assets/hazelnut-spread-open.jpg";
import servingImage from "@/assets/hazelnut-spread-serving.jpg";
import { cn } from "@/lib/utils";

type Review = {
  name: string;
  comment: string;
  image?: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  currentPrice: number;
  oldPrice: number;
  discountPercentage: number;
  installments: string;
  salesCount: string;
  rating: number;
  reviewCount: number;
  images: string[];
  promotions: string[];
  shipping: {
    fee: string;
    quantityOffer: string;
    freightDiscount: string;
  };
  details: Array<[string, string]>;
  description: string;
  highlights: string[];
  closingText: string;
  reviews: Review[];
  checkoutUrl: string;
};

export const product: Product = {
  id: "demo-700",
  slug: "creme-avela-700g",
  name: "Creme de Avelã 700g — Pote Econômico",
  currentPrice: 33.9,
  oldPrice: 74.9,
  discountPercentage: 40,
  installments: "11x R$ 3,08, com desconto de 15% de juros",
  salesCount: "25,1K vendidos on-line",
  rating: 4.8,
  reviewCount: 236,
  images: [mainImage, openImage, servingImage],
  promotions: ["Compre R$ 80 e ganhe R$ 5 de desconto", "Economize 8%"],
  shipping: {
    fee: "Taxa de envio: R$ 0,10",
    quantityOffer: "Compre 3 para ter desconto de R$ 20",
    freightDiscount: "Desconto de R$ 9 no frete em pedidos acima de R$ 9",
  },
  details: [
    ["Sabor", "Avelã"],
    ["Peso líquido", "700g"],
    ["Tipo de chocolate", "Avelã com cacau"],
  ],
  description:
    "Um creme de avelã e cacau com textura suave e sabor marcante. Ideal para tornar suas sobremesas especiais.",
  highlights: [
    "Ingredientes de alta qualidade",
    "Textura cremosa",
    "Sabor marcante",
    "Versatilidade de uso",
    "Embalagem econômica",
  ],
  closingText:
    "Perfeito para passar no pão, torradas e panquecas, e também para o preparo de bolos, tortas, mousses, milkshakes e coberturas.",
  reviews: [
    {
      name: "Camila R.",
      comment: "Veio certinho e em um tempo bom também. Qualidade do produto: muito bom!!",
      image: servingImage,
    },
    {
      name: "Juliana M.",
      comment: "Chegou bem embalado e dentro do prazo.",
      image: mainImage,
    },
    {
      name: "Patrícia L.",
      comment: "O pote rende bastante. Já vou pedir mais.",
      image: openImage,
    },
  ],
  checkoutUrl: "#comprar",
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ProductHeader({ cartCount }: { cartCount: number }) {
  return (
    <header className="product-header">
      <Button aria-label="Voltar" variant="ghost" size="icon" onClick={() => history.back()}>
        <ArrowLeft />
      </Button>
      <label className="search-field">
        <Search aria-hidden="true" />
        <input aria-label="Pesquisar produtos" placeholder="Pesquisar produtos" />
      </label>
      <div className="header-actions">
        <Button aria-label="Compartilhar" variant="ghost" size="icon"><Share2 /></Button>
        <Button aria-label="Carrinho" variant="ghost" size="icon" className="cart-button">
          <ShoppingCart />
          <span>{cartCount}</span>
        </Button>
        <Button aria-label="Mais opções" variant="ghost" size="icon"><Ellipsis /></Button>
      </div>
    </header>
  );
}

function ProductTabs() {
  const [active, setActive] = useState("overview");
  const tabs: Array<[string, string]> = [
    ["overview", "Visão geral"],
    ["reviews", "Avaliações"],
    ["description", "Descrição"],
    ["recommendations", "Recomendações"],
  ];

  return (
    <nav className="product-tabs" aria-label="Navegação do produto">
      {tabs.map(([id, label]) => (
        <Button
          key={id}
          variant="ghost"
          className={cn("product-tab", active === id && "product-tab-active")}
          onClick={() => {
            setActive(id);
            scrollToSection(id);
          }}
        >
          {label}
        </Button>
      ))}
    </nav>
  );
}

function ProductGallery({ images, name }: Pick<Product, "images" | "name">) {
  const [current, setCurrent] = useState(0);
  const startX = useRef<number | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startX.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const distance = event.clientX - startX.current;
    if (Math.abs(distance) > 45) {
      setCurrent((value) =>
        distance < 0 ? Math.min(value + 1, images.length - 1) : Math.max(value - 1, 0),
      );
    }
    startX.current = null;
  };

  return (
    <section className="gallery" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <img src={images[current]} alt={`${name}, visualização ${current + 1}`} width={900} height={900} />
      <div className="thumbnails">
        {images.map((image, index) => (
          <Button
            key={image}
            variant="ghost"
            aria-label={`Ver imagem ${index + 1}`}
            className={cn("thumbnail", current === index && "thumbnail-active")}
            onClick={() => setCurrent(index)}
          >
            <img src={image} alt="" width={64} height={64} loading="lazy" />
            {current === index && <Check aria-hidden="true" />}
          </Button>
        ))}
      </div>
      <span className="gallery-count">{current + 1}/{images.length}</span>
    </section>
  );
}

function ProductPrice({ data }: { data: Product }) {
  return (
    <section className="product-padding price-block">
      <div className="price-line">
        <span className="discount-badge">-{data.discountPercentage}%</span>
        <strong>{currency.format(data.currentPrice)}</strong>
        <del>{currency.format(data.oldPrice)}</del>
      </div>
      <p>{data.installments}</p>
    </section>
  );
}

function PromotionChips({ promotions }: Pick<Product, "promotions">) {
  return <div className="promotion-row product-padding">{promotions.map((item) => <span key={item}>{item}</span>)}</div>;
}

function Stars() {
  return <span className="stars" aria-label="5 estrelas">★★★★★</span>;
}

function ProductInfo({ data }: { data: Product }) {
  const [saved, setSaved] = useState(false);
  return (
    <section className="product-padding product-info">
      <div className="title-row">
        <h1>{data.name}</h1>
        <Button aria-label="Salvar produto" variant="ghost" size="icon" onClick={() => setSaved(!saved)}>
          <Bookmark className={saved ? "saved" : undefined} fill={saved ? "currentColor" : "none"} />
        </Button>
      </div>
      <div className="rating-line">
        <Stars /><b>{String(data.rating).replace(".", ",")}</b><span>({data.reviewCount})</span><span>{data.salesCount}</span>
      </div>
    </section>
  );
}

function formatShippingDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" })
    .format(date)
    .replace(".", "");
}

function getShippingRange() {
  const start = new Date();
  const end = new Date();
  start.setDate(start.getDate() + 3);
  end.setDate(end.getDate() + 6);
  return `${formatShippingDate(start)} e ${formatShippingDate(end)}`;
}

function ShippingInfo({ shipping }: Pick<Product, "shipping">) {
  return (
    <section className="product-padding shipping-section">
      <Truck aria-hidden="true" />
      <div>
        <h2>Receba entre {getShippingRange()}</h2>
        <p>{shipping.fee} | <em>{shipping.quantityOffer}</em></p>
        <p className="shipping-discount">{shipping.freightDiscount}</p>
      </div>
    </section>
  );
}

function CustomerProtection() {
  return (
    <Button variant="ghost" className="protection-row product-padding">
      <ShieldCheck /><span>Proteção ao cliente</span><ChevronRight />
    </Button>
  );
}

function ReviewsSection({ data }: { data: Product }) {
  return (
    <section id="reviews" className="section product-padding scroll-target">
      <div className="section-heading">
        <h2><span>★</span> {String(data.rating).replace(".", ",")} Avaliações dos clientes ({data.reviewCount})</h2>
        <Button variant="link">Ver mais <ChevronRight /></Button>
      </div>
      <p className="section-subtitle">189 avaliações de 5 estrelas nos últimos 30 dias</p>
      <div className="reviews-list">
        {data.reviews.map((review) => (
          <article className="review" key={review.name}>
            <div className="review-avatar">{review.name.charAt(0)}</div>
            <div className="review-body">
              <div><Stars /><span>{review.name}</span></div>
              {review.image && <img src={review.image} alt={`Foto da avaliação de ${review.name}`} width={94} height={94} loading="lazy" />}
              <p>{review.comment}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductDetails({ details }: Pick<Product, "details">) {
  return (
    <section className="section product-padding">
      <h2>Sobre este produto</h2>
      <h3>Detalhes</h3>
      <dl className="details-list">
        {details.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  );
}

function ProductDescription({ data }: { data: Product }) {
  return (
    <section id="description" className="description product-padding scroll-target">
      <h3>Descrição</h3>
      <p>{data.description}</p>
      <h3>Diferenciais:</h3>
      <ul>{data.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
      <p>{data.closingText}</p>
    </section>
  );
}

function Recommendations() {
  return <section id="recommendations" className="recommendations product-padding scroll-target"><h2>Recomendações</h2><p>Novas sugestões serão exibidas aqui em breve.</p></section>;
}

function StickyPurchaseBar({ data }: { data: Product }) {
  return (
    <footer className="purchase-bar">
      <Button variant="ghost" className="bottom-action"><Store /><span>Loja</span></Button>
      <Button variant="ghost" className="bottom-action"><MessageCircle /><span>Chat</span></Button>
      <Button variant="secondary" size="icon" className="bottom-cart"><ShoppingCart /></Button>
      <Button className="buy-button" onClick={() => { window.location.href = data.checkoutUrl; }}>
        <span>Comprar agora</span><small>Promoção de {currency.format(data.currentPrice)}</small>
      </Button>
    </footer>
  );
}

export function ProductPage() {
  return (
    <main id="overview" className="product-shell">
      <div className="sticky-top"><ProductHeader cartCount={1} /><ProductTabs /></div>
      <ProductGallery images={product.images} name={product.name} />
      <ProductPrice data={product} />
      <PromotionChips promotions={product.promotions} />
      <ProductInfo data={product} />
      <div className="section-divider" />
      <ShippingInfo shipping={product.shipping} />
      <CustomerProtection />
      <div className="section-divider" />
      <ReviewsSection data={product} />
      <div className="section-divider" />
      <ProductDetails details={product.details} />
      <ProductDescription data={product} />
      <Recommendations />
      <StickyPurchaseBar data={product} />
    </main>
  );
}