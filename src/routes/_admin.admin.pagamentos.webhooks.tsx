import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { getPaymentWebhookLog, listPaymentWebhookLogs } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_admin/admin/pagamentos/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks de pagamento | Vitrine Admin" },
      { name: "description", content: "Payloads recebidos dos gateways de pagamento." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Webhooks de pagamento | Vitrine Admin" },
      { property: "og:description", content: "Payloads recebidos dos gateways de pagamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebhooksPage,
});

const GATEWAY_LABELS: Record<string, string> = { imperiumpay: "Imperium Pay" };

const STATUS_LABELS: Record<string, string> = {
  received_unmapped: "Recebido / aguardando mapeamento",
  processed: "Processado",
  error: "Erro",
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function WebhooksPage() {
  const fetchLogs = useServerFn(listPaymentWebhookLogs);
  const fetchLog = useServerFn(getPaymentWebhookLog);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const logs = useQuery({
    queryKey: ["admin", "payment-webhooks"],
    queryFn: () => fetchLogs(),
    refetchInterval: 30_000,
  });

  const detail = useQuery({
    queryKey: ["admin", "payment-webhooks", selectedId],
    queryFn: () => fetchLog({ data: { id: selectedId! } }),
    enabled: Boolean(selectedId),
  });

  async function copyJson() {
    const value = detail.data?.payload_json;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("JSON copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Webhooks</h1>
          <p className="text-sm text-muted-foreground">
            Eventos recebidos dos gateways de pagamento (modo captura/diagnóstico).
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => logs.refetch()}>
          <RefreshCw className="size-4" /> Atualizar
        </Button>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Recebido em</th>
              <th className="px-3 py-2 text-left">Gateway</th>
              <th className="px-3 py-2 text-left">Transação</th>
              <th className="px-3 py-2 text-left">Status original</th>
              <th className="px-3 py-2 text-left">Status interno</th>
              <th className="px-3 py-2 text-left">Processamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            ) : (logs.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum webhook recebido ainda.
                </td>
              </tr>
            ) : (
              (logs.data ?? []).map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  className="cursor-pointer hover:bg-accent/50"
                >
                  <td className="px-3 py-2">{formatDateTime(row.received_at)}</td>
                  <td className="px-3 py-2">{GATEWAY_LABELS[row.gateway] ?? row.gateway}</td>
                  <td className="px-3 py-2">{row.external_transaction_id ?? "-"}</td>
                  <td className="px-3 py-2">{row.original_status ?? "-"}</td>
                  <td className="px-3 py-2">{row.normalized_status ?? "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {STATUS_LABELS[row.processing_status] ?? row.processing_status}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do webhook</DialogTitle>
            <DialogDescription>
              {detail.data
                ? `${GATEWAY_LABELS[detail.data.gateway] ?? detail.data.gateway} • ${formatDateTime(detail.data.received_at)}`
                : "Carregando…"}
            </DialogDescription>
          </DialogHeader>

          {detail.data ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-muted-foreground">Payload</span>
                  <Button size="sm" variant="outline" className="gap-2" onClick={copyJson}>
                    <Copy className="size-4" /> COPIAR JSON
                  </Button>
                </div>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {detail.data.payload_json}
                </pre>
              </div>
              <div>
                <span className="text-xs font-medium uppercase text-muted-foreground">Cabeçalhos (seguros)</span>
                <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {detail.data.headers_safe_json}
                </pre>
              </div>
              {detail.data.error_message ? (
                <p className="text-xs text-destructive">{detail.data.error_message}</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
