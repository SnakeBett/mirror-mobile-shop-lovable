import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { buildCheckoutUrl, type Attribution } from "@/lib/analytics";
import { getFbc, getFbp } from "@/lib/meta-client";
import {
  getTrackingConfig,
  listMetaEventLogs,
  retryPendingPurchases,
  saveTrackingConfig,
  testMetaConnection,
  type AdminTrackingConfig,
} from "@/lib/tracking.functions";

export const Route = createFileRoute("/_admin/admin/configuracoes/tracking")({
  head: () => ({
    meta: [
      { title: "Tracking | Vitrine Admin" },
      { name: "description", content: "Meta Pixel, Conversions API e UTMify com diagnóstico de atribuição." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Tracking | Vitrine Admin" },
      { property: "og:description", content: "Meta Pixel, Conversions API e UTMify." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackingPage,
});

const EMPTY_ATTR: Attribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  click_id: null,
  click_source: null,
  referrer: null,
};

function Badge({ ok, on = "Configurado", off = "Não configurado" }: { ok: boolean; on?: string; off?: string }) {
  return (
    <span
      className={
        ok
          ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600"
          : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
      }
    >
      {ok ? on : off}
    </span>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

type FormState = AdminTrackingConfig & { meta_capi_token_input: string; utmify_api_token_input: string };

function TrackingPage() {
  const queryClient = useQueryClient();
  const fetchConfig = useServerFn(getTrackingConfig);
  const saveFn = useServerFn(saveTrackingConfig);
  const testFn = useServerFn(testMetaConnection);
  const logsFn = useServerFn(listMetaEventLogs);
  const retryFn = useServerFn(retryPendingPurchases);

  const config = useQuery({ queryKey: ["admin", "tracking"], queryFn: () => fetchConfig(), retry: 1 });
  const logs = useQuery({ queryKey: ["admin", "meta-logs"], queryFn: () => logsFn({ data: { limit: 50 } }) });
  const products = useQuery({
    queryKey: ["admin", "tracking", "products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, slug, checkout_url")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const [form, setForm] = useState<FormState | null>(null);
  useEffect(() => {
    if (config.data) {
      setForm({ ...config.data, meta_capi_token_input: "", utmify_api_token_input: "" });
    }
  }, [config.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      await saveFn({
        data: {
          meta_enabled: form.meta_enabled,
          meta_pixel_id: form.meta_pixel_id,
          meta_test_event_code: form.meta_test_event_code,
          meta_graph_version: form.meta_graph_version,
          ...(form.meta_capi_token_input.trim() ? { meta_capi_token: form.meta_capi_token_input.trim() } : {}),
          utmify_enabled: form.utmify_enabled,
          utmify_pixel_id: form.utmify_pixel_id,
          utmify_pixel_script: form.utmify_pixel_script,
          utmify_utm_script: form.utmify_utm_script,
          ...(form.utmify_api_token_input.trim() ? { utmify_api_token: form.utmify_api_token_input.trim() } : {}),
          utmify_checkout_params: form.utmify_checkout_params,
        },
      });
    },
    onSuccess: () => {
      toast.success("Configurações de tracking salvas");
      queryClient.invalidateQueries({ queryKey: ["admin", "tracking"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: (eventName: string) => testFn({ data: { event_name: eventName } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "meta-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tracking"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retry = useMutation({
    mutationFn: () => retryFn(),
    onSuccess: (result) =>
      toast.success(`Purchase reprocessado: ${result.sent} enviado(s), ${result.failed} com falha.`),
    onError: (error: Error) => toast.error(error.message),
  });

  /* ---------------- Simulador de tracking ---------------- */
  const [testUrl, setTestUrl] = useState(
    "/produto/produto-x?utm_source=facebook&utm_medium=paid&utm_campaign=teste&utm_content=criativo01&fbclid=ABC123",
  );
  const [productId, setProductId] = useState("");

  const simulation = useMemo(() => {
    if (!form) return null;
    let params: URLSearchParams;
    try {
      params = new URL(testUrl, "https://exemplo.com").searchParams;
    } catch {
      return null;
    }
    const get = (key: string) => params.get(key) || null;
    const clickSource = ["fbclid", "gclid", "ttclid"].find((key) => params.get(key)) ?? null;
    const attribution: Attribution = {
      ...EMPTY_ATTR,
      utm_source: get("utm_source"),
      utm_medium: get("utm_medium"),
      utm_campaign: get("utm_campaign"),
      utm_content: get("utm_content"),
      utm_term: get("utm_term"),
      click_id: clickSource ? params.get(clickSource) : null,
      click_source: clickSource,
    };
    const product = (products.data ?? []).find((row) => row.id === productId) ?? (products.data ?? [])[0];
    const original = (product?.checkout_url ?? "").trim();
    const fbclid = params.get("fbclid");
    const finalUrl = original
      ? buildCheckoutUrl(
          original,
          {
            visitor_id: "visitor-simulado",
            session_id: "session-simulada",
            first: attribution,
            last: attribution,
            fbp: getFbp() ?? "fb.1.0.simulado",
            fbc: fbclid ? `fb.1.${Date.now()}.${fbclid}` : null,
          },
          form.utmify_checkout_params,
          params,
        )
      : "";
    return { attribution, original, finalUrl, product };
  }, [form, testUrl, productId, products.data]);

  const [browserSignals, setBrowserSignals] = useState({ fbp: false, fbc: false, visitor: false, session: false });
  useEffect(() => {
    setBrowserSignals({
      fbp: Boolean(getFbp()),
      fbc: Boolean(getFbc()),
      visitor: Boolean(localStorage.getItem("vt_visitor_id")),
      session: Boolean(sessionStorage.getItem("vt_session_id")),
    });
  }, []);

  if (!form) {
    if (config.isError) {
      const message = config.error instanceof Error ? config.error.message : String(config.error ?? "");
      return (
        <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-foreground">Não foi possível carregar as configurações de tracking.</p>
          {message && <p className="text-xs text-muted-foreground">Detalhe: {message}</p>}
          <p className="text-xs text-muted-foreground">Se o erro persistir, saia e entre de novo no painel.</p>
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => void config.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return <p className="text-sm text-muted-foreground">Carregando configurações...</p>;
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const dateText = (value: string | null) =>
    value ? new Date(value).toLocaleString("pt-BR") : "nenhum registro";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Tracking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meta Pixel + Conversions API com deduplicação por event_id, e camada de atribuição UTMify. Tokens
          ficam apenas no servidor.
        </p>
      </header>

      {/* ------------------------------ META ------------------------------ */}
      <Section
        title="Meta Ads"
        aside={
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={form.meta_enabled}
              onChange={(e) => set("meta_enabled", e.target.checked)}
            />
            Meta Tracking ativo
          </label>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="meta_pixel">Meta Pixel ID</Label>
            <Input
              id="meta_pixel"
              value={form.meta_pixel_id ?? ""}
              placeholder="1234567890"
              onChange={(e) => set("meta_pixel_id", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta_version">Versão da Graph API</Label>
            <Input
              id="meta_version"
              value={form.meta_graph_version}
              placeholder="v21.0"
              onChange={(e) => set("meta_graph_version", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta_token">Conversions API Access Token</Label>
            <Input
              id="meta_token"
              type="password"
              autoComplete="off"
              value={form.meta_capi_token_input}
              placeholder={form.meta_capi_configured ? "•••••••• (salvo)" : "Cole o token"}
              onChange={(e) => set("meta_capi_token_input", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Guardado somente no servidor. Deixe em branco para manter o token atual.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meta_test">Test Event Code (opcional)</Label>
            <Input
              id="meta_test"
              value={form.meta_test_event_code ?? ""}
              placeholder="TEST12345"
              onChange={(e) => set("meta_test_event_code", e.target.value || null)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">Pixel:</span>
          <Badge ok={Boolean(form.meta_pixel_id)} />
          <span className="text-muted-foreground">Conversions API:</span>
          <Badge ok={form.meta_capi_configured} on="Configurada" off="Não configurada" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={test.isPending} onClick={() => test.mutate("PageView")}>
            Testar conexão
          </Button>
          <Button variant="ghost" size="sm" disabled={test.isPending} onClick={() => test.mutate("ViewContent")}>
            Enviar ViewContent de teste
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={test.isPending}
            onClick={() => test.mutate("InitiateCheckout")}
          >
            Enviar InitiateCheckout de teste
          </Button>
          <Button variant="ghost" size="sm" disabled={retry.isPending} onClick={() => retry.mutate()}>
            Reenviar Purchase pendente
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Purchase nunca é disparado por teste: ele só sai quando o webhook confirma o pagamento
          (<code>purchase_&#123;order_id&#125;</code>, enviado uma única vez por pedido).
        </p>
      </Section>

      {/* ----------------------------- UTMIFY ----------------------------- */}
      <Section
        title="UTMify"
        aside={
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={form.utmify_enabled}
              onChange={(e) => set("utmify_enabled", e.target.checked)}
            />
            UTMify ativa
          </label>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="utmify_pixel">UTMify Pixel ID</Label>
            <Input
              id="utmify_pixel"
              value={form.utmify_pixel_id ?? ""}
              onChange={(e) => set("utmify_pixel_id", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="utmify_token">UTMify API Token (opcional)</Label>
            <Input
              id="utmify_token"
              type="password"
              autoComplete="off"
              value={form.utmify_api_token_input}
              placeholder={form.utmify_api_configured ? "•••••••• (salvo)" : "Cole o token"}
              onChange={(e) => set("utmify_api_token_input", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="utmify_pixel_script">Script do Pixel</Label>
            <Input
              id="utmify_pixel_script"
              value={form.utmify_pixel_script}
              onChange={(e) => set("utmify_pixel_script", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="utmify_utm_script">Script de UTMs</Label>
            <Input
              id="utmify_utm_script"
              value={form.utmify_utm_script}
              onChange={(e) => set("utmify_utm_script", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="utmify_params">Parâmetros extras levados ao checkout</Label>
            <Input
              id="utmify_params"
              value={form.utmify_checkout_params.join(", ")}
              placeholder="xcod, sck"
              onChange={(e) =>
                set(
                  "utmify_checkout_params",
                  e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Separe por vírgula. Preencha exatamente com os parâmetros que a documentação atual da UTMify
              exigir para a sua conta — nada é inventado pelo sistema.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Configuração necessária na UTMify</strong>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>Cadastre o domínio da loja e obtenha o Pixel ID na sua conta UTMify.</li>
            <li>
              A conciliação da venda com a ZuckPay é feita dentro da própria UTMify (integração
              UTMify ↔ ZuckPay). Nosso sistema apenas garante que os parâmetros cheguem ao checkout.
            </li>
            <li>Confirme na documentação atual da UTMify quais parâmetros devem acompanhar o checkout.</li>
          </ul>
        </div>
      </Section>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Salvando..." : "Salvar configurações"}
      </Button>

      {/* --------------------------- DIAGNÓSTICO --------------------------- */}
      <Section title="Diagnóstico de tracking">
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <Row label="Meta Pixel" ok={form.meta_enabled && Boolean(form.meta_pixel_id)} />
          <Row label="Meta CAPI" ok={form.meta_enabled && form.meta_capi_configured} />
          <Row label="UTMify" ok={form.utmify_enabled && Boolean(form.utmify_pixel_id)} />
          <Row label="Analytics interno" ok />
          <Row label="fbp (neste navegador)" ok={browserSignals.fbp} />
          <Row label="fbc (neste navegador)" ok={browserSignals.fbc} />
          <Row label="visitor_id" ok={browserSignals.visitor} />
          <Row label="session_id" ok={browserSignals.session} />
        </div>
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
          <span>Último evento browser: {dateText(form.last_browser_event_at)}</span>
          <span>Último evento servidor: {dateText(form.last_server_event_at)}</span>
          <span>Último Purchase: {dateText(form.last_purchase_at)}</span>
        </div>
      </Section>

      {/* ---------------------------- SIMULADOR ---------------------------- */}
      <Section title="Testar tracking (simulação)">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="test_url">URL de entrada</Label>
            <Input id="test_url" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test_product">Produto</Label>
            <select
              id="test_product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Primeiro produto</option>
              {(products.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </div>
        </div>

        {simulation && (
          <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
            <p className="font-medium text-foreground">Entrada</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const).map((key) => (
                <li key={key}>
                  {key} = {simulation.attribution[key] ?? "—"}
                </li>
              ))}
              <li>
                {simulation.attribution.click_source ?? "click id"} ={" "}
                {simulation.attribution.click_id ?? "—"}
              </li>
            </ul>
            <p className="font-medium text-foreground">URL original</p>
            <p className="break-all text-muted-foreground">{simulation.original || "produto sem checkout_url"}</p>
            <p className="font-medium text-foreground">URL com tracking</p>
            <p className="break-all text-muted-foreground">{simulation.finalUrl || "—"}</p>
            <p className="text-muted-foreground">Nenhuma compra é realizada nesta simulação.</p>
          </div>
        )}
      </Section>

      {/* ------------------------------ LOGS ------------------------------ */}
      <Section
        title="Logs de eventos Meta"
        aside={
          <Button variant="ghost" size="sm" onClick={() => logs.refetch()}>
            Atualizar
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Evento</th>
                <th className="py-2 pr-3">Produto</th>
                <th className="py-2 pr-3">Event ID</th>
                <th className="py-2 pr-3">Browser</th>
                <th className="py-2 pr-3">CAPI</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(logs.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 pr-3 font-medium text-foreground">
                    {row.event_name}
                    {row.test_event && <span className="ml-1 text-muted-foreground">(teste)</span>}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{row.product_name ?? "—"}</td>
                  <td className="py-2 pr-3 font-mono text-muted-foreground">{row.event_id}</td>
                  <td className="py-2 pr-3">{row.pixel_sent ? "✓" : "—"}</td>
                  <td className="py-2 pr-3">
                    {row.capi_status === "success" ? "✓" : row.capi_status === "error" ? "✕" : "—"}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {row.error_message
                      ? `${row.http_status ?? ""} ${row.error_message}`.trim()
                      : row.capi_status}
                    {row.attempts > 1 && ` · ${row.attempts} tentativas`}
                  </td>
                </tr>
              ))}
              {(logs.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted-foreground">
                    Nenhum evento registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? "font-medium text-emerald-600" : "text-muted-foreground"}>
        {ok ? "✓ OK" : "— inativo"}
      </span>
    </div>
  );
}
