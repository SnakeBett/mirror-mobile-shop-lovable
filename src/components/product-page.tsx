import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronRight,
  Ellipsis,
  Gift,
  MessageCircle,
  Percent,
  Search,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Ticket,
  Truck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { appendCheckoutTracking, track } from "@/lib/analytics";
import { newEventId, sendMetaServerEvent } from "@/lib/meta-client";
import {
  TrackingScripts,
  firePixelInitiateCheckout,
  firePixelViewContent,
} from "@/components/tracking-scripts";
import { cn } from "@/lib/utils";
import { calcDiscount, formatShippingText, type ProductOffer, type ProductView } from "@/lib/product-types";
import {
  resolveChatUrl,
  text,
  RECOMMENDATION_TITLE_DEFAULT,
  TAB_DEFAULT_LABELS,
  TEXT_DEFAULTS,
  type PageSettings,
  type SectionKey,
  type TabKey,
} from "@/lib/page-settings";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openLink(url: string, target: "same" | "new" = "same") {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return;
  if (target === "new") window.open(trimmed, "_blank", "noopener");
  else window.location.href = trimmed;
}

function ProductHeader({ page, placeholder }: { page: PageSettings; placeholder: string }) {
  const header = page.header_settings;
  const columns = `${header.show_back ? "34px " : ""}minmax(0, 1fr) auto`;
  const [term, setTerm] = useState("");

  return (
    <header className="product-header" style={{ gridTemplateColumns: columns }}>
      {header.show_back && (
        <Button aria-label="Voltar" variant="ghost" size="icon" onClick={() => history.back()}>
          <ArrowLeft />
        </Button>
      )}
      {header.show_search ? (
        <form
          className="search-field"
          onSubmit={(event) => {
            event.preventDefault();
            if (header.search_behavior !== "products") return;
            const query = term.trim();
            if (query) window.location.href = `/?q=${encodeURIComponent(query)}`;
          }}
        >
          <Search aria-hidden="true" />
          <input
            aria-label="Pesquisar produtos"
            placeholder={placeholder}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </form>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="header-actions">
        {header.show_share && (
          <Button aria-label="Compartilhar" variant="ghost" size="icon"><Share2 /></Button>
        )}
        {header.show_cart && (
          <Button aria-label="Carrinho" variant="ghost" size="icon" className="cart-button">
            <ShoppingCart />
            <span>1</span>
          </Button>
        )}
        {header.show_menu && (
          <Button aria-label="Mais opções" variant="ghost" size="icon"><Ellipsis /></Button>
        )}
      </div>
    </header>
  );
}

function ProductTabs({ tabs }: { tabs: Array<[TabKey, string]> }) {
  const [active, setActive] = useState<TabKey>(tabs[0]?.[0] ?? "overview");
  if (tabs.length === 0) return null;

  return (
    <nav
      className="product-tabs"
      aria-label="Navegação do produto"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}
    >
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

function ProductGallery({ images, name, page }: { images: string[]; name: string; page: PageSettings }) {
  const gallery = page.gallery_settings;
  const [current, setCurrent] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const startX = useRef<number | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!gallery.allow_swipe) return;
    startX.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!gallery.allow_swipe || startX.current === null) return;
    const distance = event.clientX - startX.current;
    if (Math.abs(distance) > 45) {
      setCurrent((value) =>
        distance < 0 ? Math.min(value + 1, images.length - 1) : Math.max(value - 1, 0),
      );
    }
    startX.current = null;
  };

  const safeIndex = Math.min(current, Math.max(images.length - 1, 0));
  const activeImage = images[safeIndex];

  return (
    <section className="gallery" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      {activeImage ? (
        <img
          src={activeImage}
          alt={`${name}, visualização ${safeIndex + 1}`}
          width={900}
          height={900}
          onClick={() => gallery.allow_zoom && setZoomed(true)}
          style={gallery.allow_zoom ? { cursor: "zoom-in" } : undefined}
        />
      ) : (
        <div className="gallery-empty" aria-hidden="true" />
      )}

      {gallery.show_thumbnails && (
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
      )}

      {gallery.indicator === "counter" && (
        <span className="gallery-count">{Math.min(safeIndex + 1, images.length)}/{images.length}</span>
      )}
      {gallery.indicator === "dots" && images.length > 1 && (
        <div className="gallery-dots" aria-hidden="true">
          {images.map((image, index) => (
            <span key={image} className={safeIndex === index ? "dot-active" : undefined} />
          ))}
        </div>
      )}

      {zoomed && activeImage && (
        <div
          className="lightbox"
          role="dialog"
          aria-label={`Imagem ampliada de ${name}`}
          onClick={() => setZoomed(false)}
        >
          <img src={activeImage} alt={`${name} ampliado`} />
        </div>
      )}
    </section>
  );
}

function ProductPrice({ data }: { data: ProductView }) {
  const fields = data.page.field_visibility;
  const installment = [data.installment_text, data.installment_note].filter((part) => (part ?? "").trim()).join(" ");
  return (
    <section className="product-padding price-block">
      <div className="price-line">
        {fields.discount && data.discount_percentage != null && (
          <span className="discount-badge">-{data.discount_percentage}%</span>
        )}
        <strong>{currency.format(Number(data.current_price))}</strong>
        {fields.old_price && data.old_price != null && <del>{currency.format(Number(data.old_price))}</del>}
      </div>
      {fields.installment && installment && <p>{installment}</p>}
    </section>
  );
}

const BANNER_LABELS = {
  flash: "Oferta Relâmpago",
  special: "Oferta Especial",
  promotion: "Promoção",
  last_units: "Últimas unidades",
  custom: "Oferta",
} as const;

function safeHex(value: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function OfferBanner({ data }: { data: ProductView }) {
  const settings = data.page.offer_banner_settings;
  if (!settings.enabled) return null;
  const current = settings.current_price_source === "custom" ? settings.current_price : Number(data.current_price);
  const old = settings.old_price_source === "custom" ? settings.old_price : Number(data.old_price ?? 0);
  const automatic = calcDiscount(old || null, current || null);
  const discount = settings.discount_mode === "manual" ? settings.manual_discount : automatic;
  const label = settings.offer_type === "custom"
    ? text(settings.custom_text, BANNER_LABELS.custom)
    : BANNER_LABELS[settings.offer_type];
  const style = {
    "--offer-gradient-start": safeHex(settings.gradient_start, "#ff7a18"),
    "--offer-gradient-end": safeHex(settings.gradient_end, "#ff4d22"),
  } as CSSProperties;

  return (
    <section className="offer-banner" style={style} aria-label={label}>
      <div className="offer-banner-pricing">
        <div className="offer-banner-current">
          {discount != null && discount > 0 && <span className="offer-banner-badge">-{discount}%</span>}
          <strong><small>{settings.show_from ? "A partir de " : ""}</small>{currency.format(current)}</strong>
        </div>
        {old > current && <del>{currency.format(old)}</del>}
      </div>
      <div className="offer-banner-label">
        {settings.icon.trim() && <span aria-hidden="true">{settings.icon.trim()}</span>}
        <b>{label}</b>
      </div>
    </section>
  );
}

const OFFER_ICONS = { tag: Tag, truck: Truck, percent: Percent, gift: Gift, zap: Zap, ticket: Ticket };

function OffersSection({ data }: { data: ProductView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const offers = data.offers;

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || offers.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      offers.forEach((offer) => track("offer_view", {
        product_id: data.id,
        offer_id: offer.id,
        metadata: { offer_type: offer.offer_type },
      }, { once: `offer_view:${data.id}:${offer.id}` }));
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data.id, offers]);

  if (offers.length === 0) return null;

  async function copyCoupon(offer: ProductOffer, applying = false) {
    if (!offer.coupon_code?.trim()) {
      toast.info("Consulte as condições desta oferta.");
      return;
    }
    await navigator.clipboard.writeText(offer.coupon_code.trim());
    track("coupon_copy", {
      product_id: data.id,
      offer_id: offer.id,
      metadata: { offer_type: offer.offer_type },
    });
    toast.success(applying ? "Cupom copiado. Cole no checkout." : "Cupom copiado");
  }

  function handleAction(offer: ProductOffer) {
    track("offer_click", {
      product_id: data.id,
      offer_id: offer.id,
      metadata: { offer_type: offer.offer_type, action: offer.button_action },
    });
    if (offer.button_action === "select") {
      setSelected(offer.id);
      toast.success("Oferta selecionada");
    } else if (offer.button_action === "copy_coupon") {
      void copyCoupon(offer);
    } else if (offer.button_action === "apply_coupon") {
      void copyCoupon(offer, true);
    } else if (offer.button_action === "open_link" && offer.button_url) {
      openLink(offer.button_url, "new");
    }
  }

  return (
    <section ref={sectionRef} className="offers-section product-padding">
      <div className="offers-heading">
        <h2>{text(data.page.offers_settings.title, "Ofertas")}</h2>
        <ChevronRight aria-hidden="true" />
      </div>
      <div className="offers-row">
        {offers.map((offer) => {
          const Icon = OFFER_ICONS[offer.icon] ?? Tag;
          const hasAction = offer.button_action !== "none" && Boolean(offer.button_text?.trim());
          return (
            <article key={offer.id} className={cn("offer-card", selected === offer.id && "offer-card-selected")}>
              <span className="offer-card-icon"><Icon aria-hidden="true" /></span>
              <div className="offer-card-copy">
                <strong>{offer.title}</strong>
                {offer.subtitle && <small>{offer.subtitle}</small>}
              </div>
              {hasAction && (
                <Button variant="ghost" size="sm" onClick={() => handleAction(offer)}>
                  {offer.button_text}
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PromotionChips({ promotions, page }: { promotions: string[]; page: PageSettings }) {
  if (promotions.length === 0) return null;
  return (
    <div
      className={cn("promotion-row product-padding", page.promotion_settings.layout === "wrap" && "promotion-wrap")}
    >
      {promotions.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function Stars() {
  return <span className="stars" aria-label="5 estrelas">★★★★★</span>;
}

function ProductInfo({ data }: { data: ProductView }) {
  const [saved, setSaved] = useState(false);
  const sections = data.page.section_visibility;
  const fields = data.page.field_visibility;
  const showSales = sections.sales && fields.sales_counter && !!(data.sales_count_display ?? data.sales_count ?? "").trim();
  const showRating = sections.rating && (fields.rating_value || fields.review_count);

  return (
    <section className="product-padding product-info">
      <div className="title-row">
        <h1>{data.name}</h1>
        <Button aria-label="Salvar produto" variant="ghost" size="icon" onClick={() => setSaved(!saved)}>
          <Bookmark className={saved ? "saved" : undefined} fill={saved ? "currentColor" : "none"} />
        </Button>
      </div>
      {(showRating || showSales) && (
        <div className="rating-line">
          {showRating && <Stars />}
          {sections.rating && fields.rating_value && <b>{String(data.rating ?? "").replace(".", ",")}</b>}
          {sections.rating && fields.review_count && <span>({data.review_count ?? 0})</span>}
          {showSales && <span>{(data.sales_count_display ?? "").trim() || data.sales_count}</span>}
        </div>
      )}
    </section>
  );
}

function ShippingInfo({ data }: { data: ProductView }) {
  const fields = data.page.field_visibility;
  const fee = fields.shipping_fee ? (data.shipping_fee ?? "").trim() : "";
  const promo = fields.shipping_promotion ? (data.shipping_promotion_text ?? "").trim() : "";
  return (
    <section className="product-padding shipping-section">
      <Truck aria-hidden="true" />
      <div>
        <h2>
          {formatShippingText(
            data.page.shipping_settings.template,
            data.shipping_min_days,
            data.shipping_max_days,
            data.shipping_business_days,
          )}
        </h2>
        {(fee || promo) && (
          <p>
            {fee}
            {fee && promo ? " | " : ""}
            {promo && <em>{promo}</em>}
          </p>
        )}
        {(data.shipping_discount_text ?? "").trim() && (
          <p className="shipping-discount">{data.shipping_discount_text}</p>
        )}
      </div>
    </section>
  );
}

function CustomerProtection({ data }: { data: ProductView }) {
  const settings = data.page.protection_settings;
  const title = text(settings.title, data.customer_protection_text || "Proteção ao cliente");
  const url = (settings.url ?? "").trim();
  const description = (settings.description ?? "").trim();

  const row = (
    <>
      <ShieldCheck />
      <span>
        {title}
        {description && <span className="protection-note"> {description}</span>}
      </span>
      <ChevronRight />
    </>
  );

  if (url) {
    return (
      <Button asChild variant="ghost" className="protection-row product-padding">
        <a href={url} target="_blank" rel="noopener noreferrer">{row}</a>
      </Button>
    );
  }
  return <Button variant="ghost" className="protection-row product-padding">{row}</Button>;
}

function ReviewsSection({ data }: { data: ProductView }) {
  const settings = data.page.review_settings;
  const fields = data.page.field_visibility;
  const labels = data.page.text_settings;
  const initial = settings.initial_count > 0 ? settings.initial_count : data.reviews.length;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? data.reviews : data.reviews.slice(0, initial);
  const hasMore = data.reviews.length > visible.length;

  return (
    <section id="reviews" className="section product-padding scroll-target">
      <div className="section-heading">
        <h2>
          {fields.rating_value && <><span>★</span> {String(data.rating ?? "").replace(".", ",")} </>}
          {text(labels.reviews_title, TEXT_DEFAULTS.reviews_title)}
          {fields.review_count && ` (${data.review_count ?? 0})`}
        </h2>
        {settings.show_see_more && hasMore && (
          <Button variant="link" onClick={() => setExpanded(true)}>
            {text(labels.see_more, TEXT_DEFAULTS.see_more)} <ChevronRight />
          </Button>
        )}
      </div>
      {fields.five_star_count && (
        <p className="section-subtitle">
          {data.five_star_count ?? 0} avaliações de 5 estrelas nos últimos 30 dias
        </p>
      )}
      <div className="reviews-list">
        {visible.map((review) => (
          <article className="review" key={review.id}>
            <div className="review-avatar">{review.avatar_initial || review.customer_name.charAt(0)}</div>
            <div className="review-body">
              <div><Stars /><span>{review.customer_name}</span></div>
              {fields.review_images && review.image_url && (
                <img
                  src={review.image_url}
                  alt={`Foto da avaliação de ${review.customer_name}`}
                  width={94}
                  height={94}
                  loading="lazy"
                />
              )}
              <p>{review.comment}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProductDetails({ data }: { data: ProductView }) {
  const labels = data.page.text_settings;
  return (
    <section className="section product-padding">
      <h2>{text(labels.about_title, TEXT_DEFAULTS.about_title)}</h2>
      <h3>{text(labels.details_title, TEXT_DEFAULTS.details_title)}</h3>
      <dl className="details-list">
        {data.details.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  );
}

function ProductDescription({ data }: { data: ProductView }) {
  const labels = data.page.text_settings;
  const showHighlights = data.page.section_visibility.highlights && data.highlights.length > 0;
  return (
    <section id="description" className="description product-padding scroll-target">
      <h3>{text(labels.description_title, TEXT_DEFAULTS.description_title)}</h3>
      {(data.description ?? "").split(/\n+/).filter(Boolean).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      {showHighlights && (
        <>
          <h3>{text(labels.highlights_title, TEXT_DEFAULTS.highlights_title)}:</h3>
          <ul>{data.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}
      {data.closing_text && <p>{data.closing_text}</p>}
    </section>
  );
}

function Recommendations({ data }: { data: ProductView }) {
  const config = data.page.recommendation_settings;
  const items = data.recommendations;
  const sectionRef = useRef<HTMLElement | null>(null);

  // view_recommendation só dispara quando a seção realmente entra na viewport.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          track(
            "view_recommendation",
            { product_id: data.id, metadata: { count: items.length } },
            { once: `view_recommendation:${data.id}` },
          );
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [data.id, items.length]);

  if (items.length === 0) return null;

  return (
    <section ref={sectionRef} id="recommendations" className="recommendations product-padding scroll-target">
      <h2>{text(config.title, RECOMMENDATION_TITLE_DEFAULT)}</h2>
      <div className="rec-row">
        {items.map((item) => (
          <a
            key={item.id}
            className="rec-card"
            href={`/produto/${item.slug}`}
            onClick={() =>
              track("click_recommendation", {
                product_id: data.id,
                recommended_product_id: item.id,
                metadata: { source_product_id: data.id, recommended_slug: item.slug },
              })
            }
          >
            <div className="rec-thumb">
              {item.image ? (
                <img src={item.image} alt={item.name} loading="lazy" width={160} height={160} />
              ) : (
                <span aria-hidden="true" />
              )}
              {item.discount_percentage != null && (
                <em className="rec-discount">-{item.discount_percentage}%</em>
              )}
            </div>
            <strong className="rec-name">{item.name}</strong>
            <span className="rec-price">{currency.format(Number(item.current_price))}</span>
            {item.old_price != null && (
              <del className="rec-old">{currency.format(Number(item.old_price))}</del>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}

function StickyPurchaseBar({ data }: { data: ProductView }) {
  const bar = data.page.bottom_bar_settings;
  const checkoutUrl = (data.checkout_url ?? "").trim();
  const buyUrl = bar.use_main_checkout ? checkoutUrl : (bar.buy_url ?? "").trim() || checkoutUrl;
  const chatUrl = resolveChatUrl(bar, data.name);

  const tracks = [
    bar.show_store && "38px",
    bar.show_chat && "38px",
    bar.show_cart && "42px",
    bar.show_buy ? "minmax(0,1fr)" : "minmax(0,1fr)",
  ].filter(Boolean) as string[];

  return (
    <footer className="purchase-bar" style={{ gridTemplateColumns: tracks.join(" ") }}>
      {bar.show_store && (
        <Button
          variant="ghost"
          className="bottom-action"
          onClick={() => openLink(bar.store_url, "new")}
        >
          <Store /><span>{text(bar.store_label, "Loja")}</span>
        </Button>
      )}
      {bar.show_chat && (
        <Button
          variant="ghost"
          className="bottom-action"
          onClick={() => openLink(chatUrl, "new")}
        >
          <MessageCircle /><span>{text(bar.chat_label, "Chat")}</span>
        </Button>
      )}
      {bar.show_cart && (
        <Button
          variant="secondary"
          size="icon"
          aria-label="Carrinho"
          className="bottom-cart"
          onClick={() => openLink(bar.cart_url, "new")}
        >
          <ShoppingCart />
        </Button>
      )}
      {bar.show_buy ? (
        <Button
          className="buy-button"
          disabled={!buyUrl}
          onClick={() => {
            const payload = { product_id: data.id, metadata: { value: Number(data.current_price) } };
            // 1-2. analytics interno
            track("click_buy", payload);
            track("begin_checkout", payload);

            // 3. Meta: Pixel + CAPI com o MESMO event_id (deduplicação).
            const eventId = newEventId("ic");
            const metaOn = data.tracking_config.meta_enabled;
            if (metaOn) {
              firePixelInitiateCheckout(
                {
                  id: data.id,
                  name: data.name,
                  price: Number(data.current_price),
                  currency: data.currency,
                },
                eventId,
              );
              sendMetaServerEvent({
                event_name: "InitiateCheckout",
                event_id: eventId,
                product_id: data.id,
                pixel_sent: Boolean(data.tracking.meta_pixel_id),
                num_items: 1,
              });
            }

            // 4-7. atribuição preservada e redirecionamento imediato.
            openLink(
              appendCheckoutTracking(buyUrl, data.tracking_config.utmify_checkout_params),
              bar.buy_target,
            );
          }}
        >
          <span>{text(bar.buy_label, data.checkout_button_text || "Comprar agora")}</span>
          {text(bar.buy_subtext, (data.checkout_button_subtext ?? "").trim()) && (
            <small>{text(bar.buy_subtext, data.checkout_button_subtext ?? "")}</small>
          )}
        </Button>
      ) : (
        <span aria-hidden="true" />
      )}
    </footer>
  );
}

function colorStyle(page: PageSettings): CSSProperties {
  const colors = page.color_settings;
  const style: Record<string, string> = {};
  if (colors.primary?.trim()) style["--primary"] = colors.primary.trim();
  if (colors.secondary?.trim()) style["--success"] = colors.secondary.trim();
  if (colors.buy?.trim()) style["--buy-color"] = colors.buy.trim();
  if (colors.price?.trim()) style["--price-color"] = colors.price.trim();
  return style as CSSProperties;
}

export function ProductPage({ product }: { product: ProductView }) {
  const page = product.page;
  const sections = page.section_visibility;

  // event_ids estáveis por montagem: Pixel e CAPI enviam o mesmo id.
  const eventIds = useMemo(
    () => ({ pageView: newEventId("pv"), viewContent: newEventId("vc") }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product.id],
  );

  // Um único product_view por produto/sessão de página — rerenders não duplicam.
  const metaEnabled = product.tracking_config.meta_enabled;
  const pixelId = product.tracking.meta_pixel_id;
  useEffect(() => {
    track("page_view", { product_id: product.id }, { once: `page_view:${product.id}` });
    track("product_view", { product_id: product.id }, { once: `product_view:${product.id}` });
    track("view_content", { product_id: product.id }, { once: `view_content:${product.id}` });
    if (!metaEnabled) return;
    firePixelViewContent(
      {
        id: product.id,
        name: product.name,
        price: Number(product.current_price),
        currency: product.currency,
      },
      eventIds.viewContent,
    );
    sendMetaServerEvent({
      event_name: "PageView",
      event_id: eventIds.pageView,
      product_id: product.id,
      pixel_sent: Boolean(pixelId),
    });
    sendMetaServerEvent({
      event_name: "ViewContent",
      event_id: eventIds.viewContent,
      product_id: product.id,
      pixel_sent: Boolean(pixelId),
    });
  }, [
    product.id,
    product.name,
    product.current_price,
    product.currency,
    metaEnabled,
    pixelId,
    eventIds,
  ]);

  const tabs = useMemo(() => {
    const available: Array<[TabKey, boolean]> = [
      ["overview", page.tab_settings.overview],
      ["reviews", page.tab_settings.reviews && sections.reviews],
      ["description", page.tab_settings.description && sections.description],
      ["recommendations", page.tab_settings.recommendations && sections.recommendations],
    ];
    return available
      .filter(([, enabled]) => enabled)
      .map(([key]) => {
        const custom = page.tab_settings[`${key}_label` as const];
        return [key, text(custom, TAB_DEFAULT_LABELS[key])] as [TabKey, string];
      });
  }, [page.tab_settings, sections.reviews, sections.description, sections.recommendations]);

  const blocks: Record<SectionKey, ReactNode> = {
    gallery: sections.gallery ? (
      <div key="gallery">
        <ProductGallery images={product.images} name={product.name} page={page} />
        <OfferBanner data={product} />
      </div>
    ) : null,
    offer:
      sections.price || sections.promotions ? (
        <div key="offer">
          {sections.price && <ProductPrice data={product} />}
          {sections.promotions && <PromotionChips promotions={product.promotions} page={page} />}
        </div>
      ) : null,
    info: <ProductInfo key="info" data={product} />,
    shipping: sections.shipping ? <ShippingInfo key="shipping" data={product} /> : null,
    protection:
      sections.protection && page.field_visibility.protection ? (
        <CustomerProtection key="protection" data={product} />
      ) : null,
    offers: sections.offers && product.offers.length > 0 ? <OffersSection key="offers" data={product} /> : null,
    reviews: sections.reviews ? <ReviewsSection key="reviews" data={product} /> : null,
    details: sections.details ? <ProductDetails key="details" data={product} /> : null,
    description: sections.description ? <ProductDescription key="description" data={product} /> : null,
    recommendations: sections.recommendations ? <Recommendations key="recommendations" data={product} /> : null,
  };

  // Divisores só aparecem entre seções realmente renderizadas — sem espaços vazios.
  const dividerBefore = new Set<SectionKey>(["shipping", "reviews", "details"]);
  const rendered: ReactNode[] = [];
  for (const key of page.section_order) {
    const node = blocks[key];
    if (!node) continue;
    if (dividerBefore.has(key) && rendered.length > 0) {
      rendered.push(<div className="section-divider" key={`divider-${key}`} />);
    }
    rendered.push(node);
  }

  return (
    <main id="overview" className="product-shell" style={colorStyle(page)}>
      <TrackingScripts
        ids={product.tracking}
        config={product.tracking_config}
        pageViewEventId={eventIds.pageView}
      />
      <div className="sticky-top">
        <ProductHeader
          page={page}
          placeholder={
            text(page.header_settings.search_placeholder, product.search_placeholder || "Pesquisar produtos")
          }
        />
        <ProductTabs tabs={tabs} />
      </div>
      {rendered}
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
