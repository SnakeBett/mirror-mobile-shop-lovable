import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { getGatewayConfigStatus, getImperiumPayStatus } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_admin/admin/configuracoes/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos | Vitrine Admin" },
      { name: "description", content: "Configuração do gateway Imperium Pay e URL de webhook." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Pagamentos | Vitrine Admin" },
      { property: "og:description", content: "Configuração do gateway Imperium Pay e URL de webhook." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsSettingsPage,
});

const WEBHOOK_PATH = "/api/public/webhooks/imperiumpay";
const PUBLISHED_ORIGIN = "https://project--3e5c2a7c-afb9-4fe4-84a9-5af06a27398e.lovable.app";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function PaymentsSettingsPage() {
  const fetchStatus = useServerFn(getImperiumPayStatus);
  const fetchConfig = useServerFn(getGatewayConfigStatus);
  const status = useQuery({ queryKey: ["admin", "imperiumpay", "status"], queryFn: () => fetchStatus() });
  const config = useQuery({ queryKey: ["admin", "gateways", "config"], queryFn: () => fetchConfig() });
  const imperium = config.data?.gateways.find((g) => g.provider === "imperiumpay");

  // Mesmo endereço que vai nas cobranças (Gateways → Endereço do site); o padrão enquanto carrega.
  const productionUrl = imperium?.webhook_url ?? `${PUBLISHED_ORIGIN}${WEBHOOK_PATH}`;
  const previewUrl = typeof window !== "undefined" ? `${window.location.origin}${WEBHOOK_PATH}` : "";
  const received = (status.data?.total_events ?? 0) > 0;

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("URL copiada.");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Pagamentos</h1>
        <p className="text-sm text-muted-foreground">
          Configuração do gateway e recebimento de notificações de transações.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Imperium Pay</h2>
          <span
            className={
              received
                ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600"
                : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
            }
          >
            {received ? "● Webhook funcionando" : "● Aguardando primeiro evento"}
          </span>
        </div>

        {received ? (
          <p className="text-xs text-muted-foreground">
            Último evento: {formatDateTime(status.data?.last_event_at ?? null)} ({status.data?.total_events} no total)
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
          <p className="text-sm">
            <span className="font-medium text-foreground">Chaves da Imperium Pay: </span>
            <span className="text-muted-foreground">
              {config.isError && !imperium
                ? "não foi possível verificar agora."
                : !imperium
                  ? "verificando…"
                  : !imperium.readable
                    ? "não foi possível ler o cofre das chaves agora."
                    : imperium.configured
                      ? `completas${imperium.signature_check ? ", com segredo do postback" : ""}.`
                      : `faltam ${imperium.missing.join(", ").toLowerCase()}.`}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {config.isError && (
              <Button type="button" size="sm" variant="ghost" onClick={() => void config.refetch()}>
                Tentar de novo
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/pagamentos/gateways">Cadastrar chaves</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">URL DO WEBHOOK</label>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={productionUrl} className="min-w-64 flex-1 font-mono text-xs" />
            <Button type="button" onClick={() => copy(productionUrl)} className="gap-2">
              <Copy className="size-4" /> COPIAR URL
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Usa o endereço do site configurado em Gateways (ou o endereço padrão da Lovable). Cadastre esta no painel da Imperium
            Pay.
          </p>
          {previewUrl && previewUrl !== productionUrl ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Input readOnly value={previewUrl} className="min-w-64 flex-1 font-mono text-xs" />
              <Button type="button" variant="outline" onClick={() => copy(previewUrl)} className="gap-2">
                <Copy className="size-4" /> Copiar URL de teste
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Configure esta URL no painel da Imperium Pay.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>Copie a URL.</li>
            <li>Abra Webhooks na Imperium Pay.</li>
            <li>Cole em "URL do Webhook".</li>
            <li>Ative "Notificar Transações".</li>
            <li>Não é necessário ativar "Notificar Saques".</li>
            <li>Clique em Criar.</li>
          </ol>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/pagamentos/webhooks">VER WEBHOOKS</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Todo aviso recebido fica registrado em Webhooks. Um aviso só dispara a conferência do pagamento quando a
          assinatura bate com o segredo do postback, e mesmo assim o pedido só vira pago depois da consulta à Imperium Pay.
        </p>
      </section>
    </div>
  );
}
