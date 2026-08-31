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
import { cn } from "@/lib/utils";
import { getShippingRange, type ProductView } from "@/lib/product-types";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ProductHeader({ cartCount, placeholder }: { cartCount: number; placeholder: string }) {
  return (
    <header className="product-header">
      <Button aria-label="Voltar" variant="ghost" size="icon" onClick={() => history.back()}>
        <ArrowLeft />
      </Button>
      <label className="search-field">
        <Search aria-hidden="true" />
        <input aria-label="Pesquisar produtos" placeholder={placeholder} />
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

function ProductGallery({ images, name }: { images: string[]; name: string }) {
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

  const safeIndex = Math.min(current, Math.max(images.length - 1, 0));

  return (
    <section className="gallery" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      {images.length > 0 ? (
        <img src={images[safeIndex]} alt={`${name}, visualização ${safeIndex + 1}`} width={900} height={900} />
      ) : (
        <div className="gallery-empty" aria-hidden="true" />
      )}
      <div className="thumbnails">
        {images.map((image, index) => (
          <Button
            key={image}
            variant="ghost"
            aria-label={`Ver imagem ${index + 1}`}
            className={cn("thumbnail", safeIndex === index && "thumbnail-active")}
            onClick={() => setCurrent(index)}
          >
            <img src={image} alt="" width={64} height={64} loading="lazy" />
            {safeIndex === index && <Check aria-hidden="true" />}
          </Button>
        ))}
      </div>
      <span className="gallery-count">{Math.min(safeIndex + 1, images.length)}/{images.length}</span>
    </section>
  );
}

function ProductPrice({ data }: { data: ProductView }) {
  return (
    <section className="product-padding price-block">
      <div className="price-line">
        {data.discount_percentage != null && <span className="discount-badge">-{data.discount_percentage}%</span>}
        <strong>{currency.format(Number(data.current_price))}</strong>
        {data.old_price != null && <del>{currency.format(Number(data.old_price))}</del>}
      </div>
      <p>{data.installment_text}</p>
    </section>
  );
}

function PromotionChips({ promotions }: { promotions: string[] }) {
  if (promotions.length === 0) return null;
  return <div className="promotion-row product-padding">{promotions.map((item) => <span key={item}>{item}</span>)}</div>;
}

function Stars() {
  return <span className="stars" aria-label="5 estrelas">★★★★★</span>;
}

function ProductInfo({ data }: { data: ProductView }) {
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
        <Stars /><b>{String(data.rating ?? "").replace(".", ",")}</b><span>({data.review_count ?? 0})</span><span>{data.sales_count}</span>
      </div>
    </section>
  );
}

function ShippingInfo({ data }: { data: ProductView }) {
  return (
    <section className="product-padding shipping-section">
      <Truck aria-hidden="true" />
      <div>
        <h2>Receba entre {getShippingRange()}</h2>
        <p>{data.shipping_fee} | <em>{data.shipping_promotion_text}</em></p>
        <p className="shipping-discount">{data.shipping_discount_text}</p>
      </div>
    </section>
  );
}

function CustomerProtection({ text }: { text: string }) {
  return (
    <Button variant="ghost" className="protection-row product-padding">
      <ShieldCheck /><span>{text}</span><ChevronRight />
    </Button>
  );
}

function ReviewsSection({ data }: { data: ProductView }) {
  return (
    <section id="reviews" className="section product-padding scroll-target">
      <div className="section-heading">
        <h2><span>★</span> {String(data.rating ?? "").replace(".", ",")} Avaliações dos clientes ({data.review_count ?? 0})</h2>
        <Button variant="link">Ver mais <ChevronRight /></Button>
      </div>
      <p className="section-subtitle">{data.five_star_count ?? 0} avaliações de 5 estrelas nos últimos 30 dias</p>
      <div className="reviews-list">
        {data.reviews.map((review) => (
          <article className="review" key={review.id}>
            <div className="review-avatar">{review.avatar_initial || review.customer_name.charAt(0)}</div>
            <div className="review-body">
              <div><Stars /><span>{review.customer_name}</span></div>
              {review.image_url && <img src={review.image_url} alt={`Foto da avaliação de ${review.customer_name}`} width={94} height={94} loading="lazy" />}
              <p>{review.comment}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductDetails({ details }: { details: Array<[string, string]> }) {
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

function ProductDescription({ data }: { data: ProductView }) {
  return (
    <section id="description" className="description product-padding scroll-target">
      <h3>Descrição</h3>
      {(data.description ?? "").split(/\n+/).filter(Boolean).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      {data.highlights.length > 0 && (
        <>
          <h3>Diferenciais:</h3>
          <ul>{data.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}
      {data.closing_text && <p>{data.closing_text}</p>}
    </section>
  );
}

function Recommendations() {
  return <section id="recommendations" className="recommendations product-padding scroll-target"><h2>Recomendações</h2><p>Novas sugestões serão exibidas aqui em breve.</p></section>;
}

function StickyPurchaseBar({ data }: { data: ProductView }) {
  const checkoutUrl = (data.checkout_url ?? "").trim();
  return (
    <footer className="purchase-bar">
      <Button variant="ghost" className="bottom-action"><Store /><span>Loja</span></Button>
      <Button variant="ghost" className="bottom-action"><MessageCircle /><span>Chat</span></Button>
      <Button variant="secondary" size="icon" className="bottom-cart"><ShoppingCart /></Button>
      <Button
        className="buy-button"
        disabled={!checkoutUrl}
        onClick={() => { if (checkoutUrl) window.location.href = checkoutUrl; }}
      >
        <span>Comprar agora</span><small>Promoção de {currency.format(Number(data.current_price))}</small>
      </Button>
    </footer>
  );
}

export function ProductPage({ product }: { product: ProductView }) {
  return (
    <main id="overview" className="product-shell">
      <div className="sticky-top">
        <ProductHeader cartCount={1} placeholder={product.search_placeholder || "Pesquisar produtos"} />
        <ProductTabs />
      </div>
      <ProductGallery images={product.images} name={product.name} />
      <ProductPrice data={product} />
      <PromotionChips promotions={product.promotions} />
      <ProductInfo data={product} />
      <div className="section-divider" />
      <ShippingInfo data={product} />
      <CustomerProtection text={product.customer_protection_text || "Proteção ao cliente"} />
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

export function ProductUnavailable() {
  return (
    <main className="product-shell">
      <div className="product-padding" style={{ paddingTop: 64, textAlign: "center" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Produto indisponível</h1>
        <p style={{ marginTop: 8, fontSize: 13, color: "var(--muted-foreground)" }}>
          Este produto não existe ou não está mais disponível.
        </p>
      </div>
    </main>
  );
}
