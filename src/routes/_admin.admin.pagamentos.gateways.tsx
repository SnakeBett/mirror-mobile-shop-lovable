import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { getGatewayConfigStatus, listPaymentAttempts, testGatewayConnection } from "@/lib/payments.functions";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_admin/admin/pagamentos/gateways")({
  head: () => ({
    meta: [
      { title: "Gateways de pagamento | Vitrine Admin" },
      { name: "description", content: "Gerencie os gateways Pix do checkout próprio." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Gateways de pagamento | Vitrine Admin" },
      { property: "og:description", content: "Gerencie os gateways Pix do checkout próprio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, string> = { pending_docs: "Conexão ainda não testada", connected: "Conectado", error: "Erro" };

function Page() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "gateways"], queryFn: async () => (await supabase.from("payment_gateways").select("*").order("name")).data ?? [] });
  const update = async (id: string, values: Record<string, unknown>) => {
    const { error } = await supabase.from("payment_gateways").update({ ...values, updated_at: new Date().toISOString() } as never).eq("id", id);
    if (error) toast.error("Não foi possível salvar.");
    qc.invalidateQueries({ queryKey: ["admin", "gateways"] });
  };
  const cfgFn = useServerFn(getGatewayConfigStatus);
  const testFn = useServerFn(testGatewayConnection);
  const attemptsFn = useServerFn(listPaymentAttempts);
  const cfg = useQuery({ queryKey: ["admin", "gateways", "cfg"], queryFn: () => cfgFn() });
  const attempts = useQuery({ queryKey: ["admin", "gateways", "attempts"], queryFn: () => attemptsFn() });
  const test = async (provider: string) => {
    try {
      const r = await testFn({ data: { provider } });
      r.ok ? toast.success(r.message) : toast.error(r.message);
    } catch { toast.error("Falha ao testar."); }
    qc.invalidateQueries({ queryKey: ["admin", "gateways"] });
  };
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success("URL copiada."), () => toast.error("Copie manualmente."));
  const makeDefault = async (id: string) => {
    await supabase.from("payment_gateways").update({ is_default: false }).neq("id", id);
    await update(id, { is_default: true });
    toast.success("Gateway padrão definido");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Pagamentos · Gateways</h1>
        <p className="text-sm text-muted-foreground">
          As chaves ficam guardadas com segurança no servidor e nunca aparecem aqui. Só gateways ativos e com chaves completas geram Pix.
        </p>
      </div>
      {(q.data ?? []).map((g) => (
        <section key={g.id} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{g.name} {g.is_default && <span className="ml-1 rounded bg-accent px-1.5 py-0.5 text-xs">Padrão</span>}</h2>
              <p className="text-xs text-muted-foreground">{STATUS[g.integration_status] ?? g.integration_status}</p>
            </div>
            <label className="flex items-center gap-2 text-sm">Ativo <Switch checked={g.is_active} onCheckedChange={(v) => update(g.id, { is_active: v })} /></label>
          </div>
          {(() => {
            const c = cfg.data?.find((x) => x.provider === g.provider);
            if (!c) return null;
            return (
              <div className="space-y-2 text-sm">
                <p className={c.configured ? "text-xs font-medium text-foreground" : "text-xs font-medium text-destructive"}>
                  Configuração {c.configured ? "completa" : "incompleta"}: {c.secrets.map((x) => `${x.name} ${x.set ? "✓" : "✗"}`).join(" · ")}
                  {c.postback_signature != null && ` · IMPERIUMPAY_POSTBACK_SECRET ${c.postback_signature ? "✓" : "✗ (postback sem validação; confirmação só pela consulta)"}`}
                </p>
                <div className="flex gap-2">
                  <input readOnly value={c.webhook_url} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs" />
                  <Button size="sm" variant="outline" onClick={() => copy(c.webhook_url)} className="gap-1"><Copy className="size-3.5" /> Copiar</Button>
                </div>
              </div>
            );
          })()}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-xs text-muted-foreground">Ambiente: Produção (sem ambiente de testes documentado)</span>
            {!g.is_default && <Button size="sm" variant="outline" onClick={() => makeDefault(g.id)}>Definir como padrão</Button>}
            <Button size="sm" variant="outline" onClick={() => test(g.provider)}>Testar conexão</Button>
            <Link to="/admin/pagamentos/webhooks" className="text-sm underline">Ver logs de webhook</Link>
          </div>
          {g.last_error && <p className="text-xs text-destructive">Último erro: {g.last_error}</p>}
        </section>
      ))}
      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="font-semibold">Últimas cobranças Pix</h2>
        {(attempts.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma cobrança gerada ainda.</p>}
        {(attempts.data ?? []).map((a) => (
          <div key={a.id} className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-xs">
            <span>{new Date(a.created_at).toLocaleString("pt-BR")} · {a.provider} · pedido {a.order_id.slice(0, 8).toUpperCase()}</span>
            <span>{(a.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · <b>{a.status}</b>{a.error_message ? ` · ${a.error_message}` : ""}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
