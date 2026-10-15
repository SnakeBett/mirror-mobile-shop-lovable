import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Clock, Copy, CreditCard, Lock, MapPin, ShieldCheck, Ticket, User, X } from "lucide-react";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPublicProduct } from "@/lib/public-product.functions";
import { createPendingOrder, getCheckoutQuote, getPixStatus, type CheckoutQuote } from "@/lib/checkout.functions";
import { DEFAULT_CHECKOUT_SETTINGS, isValidCpf, maskCep, maskCpf, maskPhone, normalizeCheckoutSettings, onlyDigits, type CheckoutSettings } from "@/lib/checkout-settings";
import { CHECKOUT_CONTEXT_KEY, unitLabel, type CheckoutContext } from "@/lib/variants";
import { getCheckoutTrackingContext } from "@/lib/analytics";

type Search = { produto?: string | undefined };

export const Route = createFileRoute("/checkout")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): Search => ({ produto: typeof s["produto"] === "string" ? (s["produto"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "Finalizar compra | Checkout seguro" },
      { name: "description", content: "Finalize sua compra com pagamento via Pix de forma rápida e segura." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Finalizar compra | Checkout seguro" },
      { property: "og:description", content: "Finalize sua compra com pagamento via Pix de forma rápida e segura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutPage,
});

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const FORM_KEY = "vt_checkout_form";

type Form = {
  name: string; email: string; cpf: string; phone: string;
  cep: string; street: string; number: string; complement: string; district: string; city: string; state: string;
};
const EMPTY: Form = { name: "", email: "", cpf: "", phone: "", cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };

function readContext(): CheckoutContext | null {
  try {
    return JSON.parse(sessionStorage.getItem(CHECKOUT_CONTEXT_KEY) ?? "null");
  } catch {
    return null;
  }
}

function validate(f: Form, digital = false): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (f.name.trim().split(/\s+/).length < 2) e.name = "Informe nome e sobrenome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "E-mail inválido.";
  if (!isValidCpf(f.cpf)) e.cpf = "CPF inválido.";
  const p = onlyDigits(f.phone).length;
  if (p < 10 || p > 11) e.phone = "WhatsApp inválido.";
  if (digital) return e;
  if (onlyDigits(f.cep).length !== 8) e.cep = "CEP inválido.";
  if (f.street.trim().length < 2) e.street = "Informe a rua.";
  if (!f.number.trim()) e.number = "Informe o número.";
  if (f.district.trim().length < 2) e.district = "Informe o bairro.";
  if (f.city.trim().length < 2) e.city = "Informe a cidade.";
  if (!/^[A-Za-z]{2}$/.test(f.state.trim())) e.state = "UF";
  return e;
}

function PhraseBanner({ s }: { s: CheckoutSettings }) {
  const phrases = s.phrases.filter((p) => p.active);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (phrases.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % phrases.length), 4000);
    return () => clearInterval(t);
  }, [phrases.length, paused]);
  if (!s.banner_enabled || phrases.length === 0) return null;
  return (
    <div
      className="relative h-8 overflow-hidden text-center text-xs font-medium"
      style={{ background: s.banner_bg, color: s.banner_fg }}
      onPointerDown={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-live="polite"
    >
      {phrases.map((p, idx) => (
        <p key={p.id} className="absolute inset-0 flex items-center justify-center px-3 transition-opacity duration-500 motion-reduce:transition-none" style={{ opacity: idx === i % phrases.length ? 1 : 0 }} aria-hidden={idx !== i % phrases.length}>
          {p.text}
        </p>
      ))}
    </div>
  );
}

function Card({ children, title, icon }: { children: React.ReactNode; title?: string; icon?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      {title && <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">{icon}{title}</h2>}
      {children}
    </section>
  );
}

function Input({ label, error, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined }) {
  return (
    <label className={"block " + (className ?? "")}>
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input {...props} className={"h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground " + (error ? "border-destructive" : "border-input")} />
      {error && <span className="mt-0.5 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

function CheckoutPage() {
  const { produto } = Route.useSearch();
  const [ctx] = useState(readContext);
  const slug = produto || ctx?.slug || "";
  const fetchProduct = useServerFn(getPublicProduct);
  const quoteFn = useServerFn(getCheckoutQuote);
  const orderFn = useServerFn(createPendingOrder);

  const product = useQuery({ queryKey: ["checkout-product", slug], queryFn: () => fetchProduct({ data: { slug } }), enabled: !!slug });
  const settings = useQuery({
    queryKey: ["checkout-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("checkout_settings").select("settings").maybeSingle();
      return normalizeCheckoutSettings(data?.settings);
    },
  });
  const s = settings.data ?? DEFAULT_CHECKOUT_SETTINGS;
  const logoUrl = useCheckoutLogo(s.logo_path);

  const sameCtx = ctx && ctx.slug === slug ? ctx : null;
  const selection = useMemo(
    () => ({ slug, kit_id: sameCtx?.offer_id ?? null, units: sameCtx?.units ?? [], same_for_all: sameCtx?.same_for_all ?? true }),
    [slug, sameCtx],
  );

  const [form, setForm] = useState<Form>(EMPTY);
  useEffect(() => {
    try { setForm({ ...EMPTY, ...JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "{}") }); } catch { /* vazio */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(FORM_KEY, JSON.stringify(form)); } catch { /* bloqueado */ }
  }, [form]);
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const [shippingId, setShippingId] = useState<string | null>(null);
  const quoteSeq = useRef(0);
  const loadQuote = async (code: string | null, ship: string | null = shippingId) => {
    const seq = ++quoteSeq.current;
    try {
      const res = await quoteFn({ data: { ...selection, coupon_code: code, shipping_method_id: ship, buyer_cpf: isValidCpf(form.cpf) ? form.cpf : null } });
      if (seq !== quoteSeq.current) return null;
      if (!res.ok) { setQuoteError(res.error); return null; }
      setQuote(res.quote);
      setQuoteError(null);
      return res.quote;
    } catch {
      if (seq === quoteSeq.current) setQuoteError("Não foi possível calcular o pedido agora. Verifique sua conexão e tente novamente.");
      return null;
    }
  };
  useEffect(() => {
    if (!slug) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(`vt_checkout_shipping:${slug}`); } catch { /* ignora */ }
    if (saved) setShippingId(saved);
    loadQuote(null, saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const chooseShipping = async (id: string) => {
    setShippingId(id);
    idemKey.current = "";
    try { sessionStorage.setItem(`vt_checkout_shipping:${slug}`, id); } catch { /* ignora */ }
    await loadQuote(couponCode, id);
  };

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    idemKey.current = "";
    const q = await loadQuote(code);
    setCouponBusy(false);
    if (q?.coupon) setCouponCode(code);
    else setCouponCode(null);
  };
  const removeCoupon = async () => {
    setCouponCode(null);
    setCouponInput("");
    idemKey.current = "";
    await loadQuote(null);
  };

  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const cepSeq = useRef(0);
  const cepCache = useRef(new Map<string, { street: string; district: string; city: string; state: string } | null>());
  const lastCep = useRef("");
  const lookupCep = async (cep: string) => {
    const d = onlyDigits(cep);
    if (d.length !== 8) { cepSeq.current++; setCepStatus(null); return; }
    if (d === lastCep.current) return;
    lastCep.current = d;
    const seq = ++cepSeq.current;
    const apply = (a: { street: string; district: string; city: string; state: string } | null, failed = false) => {
      if (seq !== cepSeq.current) return;
      if (a) {
        setForm((f) => ({ ...f, street: a.street || f.street, district: a.district || f.district, city: a.city || f.city, state: a.state || f.state }));
        setCepStatus(!a.street || !a.district ? "Complete a rua e o bairro." : null);
      } else setCepStatus(failed ? "Não conseguimos buscar o CEP agora. Preencha o endereço manualmente." : "CEP não encontrado. Confira o número ou preencha manualmente.");
    };
    if (cepCache.current.has(d)) return apply(cepCache.current.get(d)!);
    setCepStatus("Buscando endereço...");
    const viaCep = async () => {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error("http");
      const j = await r.json();
      if (j.erro) return null;
      return { street: j.logradouro ?? "", district: j.bairro ?? "", city: j.localidade ?? "", state: j.uf ?? "" };
    };
    const brasilApi = async () => {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${d}`, { signal: AbortSignal.timeout(5000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("http");
      const j = await r.json();
      return { street: j.street ?? "", district: j.neighborhood ?? "", city: j.city ?? "", state: j.state ?? "" };
    };
    try {
      let a: Awaited<ReturnType<typeof viaCep>>;
      try { a = await viaCep(); } catch { a = await brasilApi(); }
      cepCache.current.set(d, a);
      apply(a);
    } catch {
      lastCep.current = "";
      apply(null, true);
    }
  };

  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ order_id: string; order_number: string; total: number; attempt: PixAttempt | null; payment_error: string | null } | null>(null);
  const pixFn = useServerFn(getPixStatus);
  const attemptId = order?.attempt?.attempt_id ?? null;
  const attemptStatus = order?.attempt?.status ?? null;

  // Recupera um Pix pendente desta aba (ex.: atualizou a página).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PIX_KEY) ?? "null");
      if (saved?.slug === slug && saved.order) setOrder(saved.order);
    } catch { /* ignora */ }
  }, [slug]);
  useEffect(() => {
    if (order) try { sessionStorage.setItem(PIX_KEY, JSON.stringify({ slug, order })); } catch { /* ignora */ }
  }, [order, slug]);

  // Consulta periódica ao nosso backend (que verifica o gateway).
  useEffect(() => {
    if (!attemptId || !attemptStatus || !["pending", "processing", "med"].includes(attemptStatus)) return;
    let alive = true;
    const tick = async () => {
      try {
        const a = await pixFn({ data: { attempt_id: attemptId } });
        if (alive && a) setOrder((o) => (o ? { ...o, attempt: a } : o));
      } catch { /* tenta de novo */ }
    };
    const id = setInterval(tick, 6000);
    return () => { alive = false; clearInterval(id); };
  }, [attemptId, attemptStatus, pixFn]);

  // Purchase no Pixel uma única vez, com o mesmo event_id da CAPI.
  useEffect(() => {
    if (attemptStatus !== "paid" || !order) return;
    const flag = `vt_purchase_sent:${order.order_id}`;
    try {
      if (localStorage.getItem(flag)) return;
      localStorage.setItem(flag, "1");
    } catch { /* ignora */ }
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    fbq?.("track", "Purchase", { value: order.total, currency: "BRL", content_type: "product" }, { eventID: `purchase_${order.order_id}` });
    try { sessionStorage.removeItem(PIX_KEY); } catch { /* ignora */ }
  }, [attemptStatus, order]);
  const idemKey = useRef<string>("");

  const submit = async () => {
    if (submitting) return;
    const e = validate(form, quote?.digital);
    setErrors(e);
    if (Object.keys(e).length) {
      setSubmitError("Confira os campos destacados.");
      return;
    }
    if (quote?.selection_error) return setSubmitError(quote.selection_error);
    if (quote && !quote.digital && quote.shipping_error) return setSubmitError(quote.shipping_error);
    setSubmitting(true);
    setSubmitError(null);
    if (!idemKey.current) idemKey.current = crypto.randomUUID() + "-" + Date.now();
    const t = getCheckoutTrackingContext();
    const params = new URLSearchParams(window.location.search);
    try {
      const res = await orderFn({
        data: {
          ...selection,
          coupon_code: couponCode,
          shipping_method_id: quote?.shipping_method_id ?? shippingId,
          idempotency_key: idemKey.current,
          buyer: { name: form.name, email: form.email, cpf: form.cpf, phone: form.phone },
          address: quote?.digital ? null : { cep: form.cep, street: form.street, number: form.number, complement: form.complement, district: form.district, city: form.city, state: form.state },
          tracking: {
            visitor_id: t.visitor_id, session_id: t.session_id,
            utm_source: t.last.utm_source ?? null, utm_medium: t.last.utm_medium ?? null, utm_campaign: t.last.utm_campaign ?? null,
            utm_content: t.last.utm_content ?? null, utm_term: t.last.utm_term ?? null,
            utm_id: params.get("utm_id"), fbclid: params.get("fbclid"),
            ...Object.fromEntries(["src", "sck", "gclid", "wbraid", "gbraid", "ttclid", "kclid", "click_id"].map((k) => [k, params.get(k)])),
            fbp: t.fbp, fbc: t.fbc, user_agent: navigator.userAgent.slice(0, 400),
          },
        },
      });
      if (!res.ok) setSubmitError(res.error);
      else {
        setOrder(res);
        window.scrollTo({ top: 0 });
      }
    } catch {
      setSubmitError("Não foi possível criar o pedido. Confira os dados e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const p = product.data;
  const qty = quote?.quantity ?? sameCtx?.quantity ?? 1;
  const unitLines =
    p && sameCtx?.units?.length
      ? (sameCtx.same_for_all ? [sameCtx.units[0] ?? {}] : sameCtx.units).map((u) => unitLabel(u, p.attributes)).filter(Boolean)
      : [];

  const header = (
    <>
      <PhraseBanner s={s} />
      <header className="flex items-center justify-between border-b border-border bg-background px-3 py-2">
        <button type="button" onClick={() => history.back()} className="flex size-9 items-center justify-center rounded-full text-foreground hover:bg-muted" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </button>
        {s.show_logo && logoUrl ? (
          <img src={logoUrl} alt="Logo" style={{ maxHeight: s.logo_height }} className="h-auto w-auto max-w-[55vw] object-contain sm:max-w-[200px]" />
        ) : <span />}
        <span className="size-9" />
      </header>
      <div className="bg-background px-4 pb-2 pt-3 text-center">
        <h1 className="text-lg font-bold text-foreground">{order ? "Pagamento" : "Finalizar compra"}</h1>
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" /> {s.secure_message}</p>
      </div>
    </>
  );

  if (!slug) {
    return (
      <main className="mx-auto min-h-screen max-w-[480px] bg-muted/40 p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhum produto selecionado.</p>
        <Link to="/" className="mt-3 inline-block text-sm underline">Voltar para a loja</Link>
      </main>
    );
  }

  const summary = quote && (
    <Card>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{brl.format(quote.subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Frete</dt><dd>{quote.shipping == null ? "A calcular" : quote.shipping_free ? <span className="font-medium text-[color:var(--success,green)]">Grátis</span> : brl.format(quote.shipping)}</dd></div>
        {quote.product_discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Desconto do produto</dt><dd>-{brl.format(quote.product_discount)}</dd></div>}
        {quote.coupon && <div className="flex justify-between"><dt className="text-muted-foreground">Cupom {quote.coupon.code}</dt><dd>-{brl.format(quote.coupon.discount)}</dd></div>}
        <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><dt>Total</dt><dd>{brl.format(order?.total ?? quote.total)}</dd></div>
      </dl>
    </Card>
  );

  return (
    <main className="mx-auto min-h-screen max-w-[480px] bg-muted/40 pb-28">
      {header}
      <div className="space-y-3 p-3">
        {quoteError && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{quoteError}</p>}

        <Card>
          {p ? (
            <div className="flex gap-3">
              {p.images[0] && <img src={p.images[0]} alt="" className="size-20 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="line-clamp-2 font-medium text-foreground">{p.name}</p>
                {sameCtx?.offer_name && <p className="text-xs text-muted-foreground">{sameCtx.offer_name}</p>}
                {unitLines.map((l, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{unitLines.length > 1 ? `Unidade ${i + 1}: ` : ""}{l}</p>
                ))}
                <p className="text-xs text-muted-foreground">Quantidade: {qty}</p>
                {quote && (
                  <p className="mt-1">
                    <b className="text-foreground">{brl.format(quote.subtotal - quote.product_discount)}</b>
                    {quote.product_discount > 0 && <del className="ml-2 text-xs text-muted-foreground">{brl.format(quote.subtotal)}</del>}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
          )}
          {quote?.selection_error && <p className="mt-2 text-xs text-destructive">{quote.selection_error} <Link to="/produto/$slug" params={{ slug }} className="underline">Voltar ao produto</Link></p>}
        </Card>

        {s.show_coupon && !order && (
          <Card title="Tem um cupom de desconto?" icon={<Ticket className="size-4" />}>
            {quote?.coupon ? (
              <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                <span><Check className="mr-1 inline size-4" />Cupom <b>{quote.coupon.code}</b> aplicado: -{brl.format(quote.coupon.discount)}</span>
                <button type="button" onClick={removeCoupon} aria-label="Remover cupom"><X className="size-4" /></button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="DIGITE SEU CUPOM" maxLength={40} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm uppercase" onKeyDown={(e) => e.key === "Enter" && applyCoupon()} />
                  <button type="button" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()} className="h-10 rounded-lg px-4 text-sm font-semibold disabled:opacity-50" style={{ background: s.button_color, color: "#fff" }}>{couponBusy ? "..." : "APLICAR"}</button>
                </div>
                {quote?.coupon_error && couponInput && <p className="mt-1.5 text-xs text-destructive">{quote.coupon_error}</p>}
              </>
            )}
          </Card>
        )}

        {order ? (
          <>
            <Card>
              <div className="space-y-2 text-center">
                <PixPanel order={order} color={s.button_color} />
              </div>
            </Card>
            {summary}
          </>
        ) : (
          <>
            <Card title="Dados pessoais" icon={<User className="size-4" />}>
              <div className="grid gap-2.5">
                <Input label="Nome completo" autoComplete="name" value={form.name} error={errors.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
                <Input label="E-mail" type="email" autoComplete="email" value={form.email} error={errors.email} maxLength={160} onChange={(e) => set("email", e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input label="CPF" inputMode="numeric" value={form.cpf} error={errors.cpf} onChange={(e) => set("cpf", maskCpf(e.target.value))} />
                  <Input label="WhatsApp" inputMode="tel" autoComplete="tel" value={form.phone} error={errors.phone} onChange={(e) => set("phone", maskPhone(e.target.value))} />
                </div>
              </div>
            </Card>

            {!quote?.digital && (
            <Card title="Endereço de entrega" icon={<MapPin className="size-4" />}>
              <div className="grid grid-cols-6 gap-2">
                <Input className="col-span-3" label="CEP" inputMode="numeric" autoComplete="postal-code" value={form.cep} error={errors.cep} onChange={(e) => { const v = maskCep(e.target.value); set("cep", v); lookupCep(v); }} />
                {cepStatus && <p className="col-span-6 text-xs text-muted-foreground">{cepStatus}</p>}
                <Input className="col-span-6" label="Rua" autoComplete="address-line1" value={form.street} error={errors.street} maxLength={160} onChange={(e) => set("street", e.target.value)} />
                <Input className="col-span-2" label="Número" value={form.number} error={errors.number} maxLength={20} onChange={(e) => set("number", e.target.value)} />
                <Input className="col-span-4" label="Complemento" value={form.complement} maxLength={80} onChange={(e) => set("complement", e.target.value)} />
                <Input className="col-span-6" label="Bairro" value={form.district} error={errors.district} maxLength={80} onChange={(e) => set("district", e.target.value)} />
                <Input className="col-span-4" label="Cidade" autoComplete="address-level2" value={form.city} error={errors.city} maxLength={80} onChange={(e) => set("city", e.target.value)} />
                <Input className="col-span-2" label="Estado" maxLength={2} value={form.state} error={errors.state} onChange={(e) => set("state", e.target.value.toUpperCase())} />
              </div>
            </Card>
            )}

            {!quote?.digital && quote && quote.shipping_options.length > 0 && (
              <Card title="Escolha a entrega" icon={<Truck className="size-4" />}>
                <div className="space-y-2" role="radiogroup" aria-label="Escolha a entrega">
                  {quote.shipping_options.map((m) => {
                    const on = quote.shipping_method_id === m.id;
                    const days = m.min_days != null && m.max_days != null ? (m.min_days === m.max_days ? `${m.min_days} dias` : `${m.min_days} a ${m.max_days} dias`) : m.max_days != null ? `até ${m.max_days} dias` : null;
                    return (
                      <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => chooseShipping(m.id)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left" style={on ? { borderColor: s.button_color, borderWidth: 2 } : undefined}>
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full border" style={on ? { background: s.button_color, borderColor: s.button_color } : undefined}>{on && <Check className="size-3 text-primary-foreground" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">{m.name}</span>
                          {m.description && <span className="block text-xs text-muted-foreground">{m.description}</span>}
                          {days && <span className="block text-xs text-muted-foreground">Prazo estimado: {days}</span>}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{m.price <= 0 ? "Grátis" : brl.format(m.price)}</span>
                      </button>
                    );
                  })}
                </div>
                {quote.shipping_error && !quote.shipping_method_id && <p className="mt-2 text-xs text-destructive">{quote.shipping_error}</p>}
              </Card>
            )}
            {!quote?.digital && quote && quote.shipping_options.length === 0 && quote.shipping_error && (
              <p className="text-center text-xs text-destructive">{quote.shipping_error}</p>
            )}

            {summary}

            <Card title="Escolha a forma de pagamento">
              <div className="space-y-2" role="radiogroup">
                <div role="radio" aria-checked="true" className="flex items-center gap-3 rounded-lg border-2 p-3" style={{ borderColor: s.button_color }}>
                  <span className="flex size-5 items-center justify-center rounded-full" style={{ background: s.button_color }}><Check className="size-3 text-primary-foreground" /></span>
                  <div><p className="text-sm font-semibold text-foreground">PIX</p><p className="text-xs text-muted-foreground">Pagamento instantâneo</p></div>
                </div>
                <div role="radio" aria-checked="false" aria-disabled="true" className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-border p-3 opacity-50">
                  <CreditCard className="size-5 text-muted-foreground" />
                  <div><p className="text-sm font-semibold text-muted-foreground">CARTÃO DE CRÉDITO</p><p className="text-xs text-muted-foreground">{s.card_unavailable_message}</p></div>
                </div>
              </div>
            </Card>
            <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Seus dados estão protegidos</p>
          </>
        )}
      </div>

      {!order && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[480px] border-t border-border bg-background p-3">
          {submitError && <p className="mb-2 text-center text-xs text-destructive" role="alert">{submitError}</p>}
          <button type="button" onClick={submit} disabled={submitting || !quote} className="h-12 w-full rounded-full text-sm font-bold disabled:opacity-60" style={{ background: s.button_color, color: "#fff" }}>
            {submitting ? "Processando..." : s.button_text}
          </button>
        </div>
      )}
    </main>
  );
}

const PIX_KEY = "vt_pix_attempt";
type PixAttempt = { attempt_id: string; status: string; amount_cents: number; pix_copy_paste: string | null; qr_code_image: string | null; expires_at: string | null };

function PixPanel({ order, color }: { order: { order_number: string; attempt: PixAttempt | null; payment_error: string | null }; color: string }) {
  const a = order.attempt;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!a) {
    return (
      <>
        <Clock className="mx-auto size-8 text-muted-foreground" />
        <p className="font-semibold text-foreground">Pedido #{order.order_number} criado</p>
        <p className="text-sm text-muted-foreground">{order.payment_error ?? "O Pix não pôde ser gerado agora."} Nenhuma cobrança foi feita.</p>
      </>
    );
  }
  if (a.status === "paid") {
    return (
      <>
        <CheckCircle2 className="mx-auto size-10 text-[color:var(--success,green)]" />
        <p className="text-lg font-bold text-foreground">Pagamento aprovado!</p>
        <p className="text-sm text-muted-foreground">Pedido #{order.order_number} confirmado. Você receberá as informações por e-mail.</p>
      </>
    );
  }
  const expired = a.status === "expired" || (a.expires_at ? new Date(a.expires_at).getTime() <= now : false);
  if (expired || ["failed", "declined", "cancelled"].includes(a.status)) {
    return (
      <>
        <Clock className="mx-auto size-8 text-muted-foreground" />
        <p className="font-semibold text-foreground">{expired ? "Este Pix expirou" : "Pagamento não concluído"}</p>
        <p className="text-sm text-muted-foreground">Pedido #{order.order_number}. Volte ao produto para gerar um novo pedido.</p>
      </>
    );
  }
  const left = a.expires_at ? Math.max(0, Math.floor((new Date(a.expires_at).getTime() - now) / 1000)) : null;
  const copy = () => a.pix_copy_paste && navigator.clipboard.writeText(a.pix_copy_paste).then(() => toast.success("Código Pix copiado!"), () => toast.error("Copie o código manualmente."));
  return (
    <>
      <p className="font-semibold text-foreground">Pague com Pix para concluir o pedido #{order.order_number}</p>
      <p className="text-2xl font-bold text-foreground">{brl.format(a.amount_cents / 100)}</p>
      {left != null && <p className="text-xs text-muted-foreground">Expira em {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</p>}
      {a.qr_code_image && <img src={a.qr_code_image} alt="QR Code Pix" className="mx-auto size-52 rounded-lg border border-border bg-background object-contain p-2" />}
      {a.pix_copy_paste && (
        <>
          <textarea readOnly value={a.pix_copy_paste} rows={3} className="w-full resize-none rounded-lg border border-input bg-muted p-2 font-mono text-[11px] text-foreground" />
          <button type="button" onClick={copy} className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold" style={{ background: color, color: "#fff" }}>
            <Copy className="size-4" /> COPIAR CÓDIGO PIX
          </button>
        </>
      )}
      <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" /> Aguardando pagamento… esta tela atualiza sozinha.</p>
    </>
  );
}

function useCheckoutLogo(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    supabase.storage.from("product-images").createSignedUrl(path, 3600).then(({ data }) => { if (alive) setUrl(data?.signedUrl ?? null); });
    return () => { alive = false; };
  }, [path]);
  return url;
}
