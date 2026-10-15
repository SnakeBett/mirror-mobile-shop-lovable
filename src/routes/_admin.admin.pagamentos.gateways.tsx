import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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

const STATUS: Record<string, string> = { pending_docs: "Pendente: documentação necessária", connected: "Conectado", error: "Erro" };

function Page() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "gateways"], queryFn: async () => (await supabase.from("payment_gateways").select("*").order("name")).data ?? [] });
  const update = async (id: string, values: Record<string, unknown>) => {
    const { error } = await supabase.from("payment_gateways").update({ ...values, updated_at: new Date().toISOString() } as never).eq("id", id);
    if (error) toast.error("Não foi possível salvar.");
    qc.invalidateQueries({ queryKey: ["admin", "gateways"] });
  };
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
          Os gateways serão conectados seguindo a documentação oficial de cada um. Enquanto estiverem pendentes, o checkout próprio registra o pedido sem gerar Pix.
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
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">Ambiente
              <select className="h-8 rounded-md border border-input bg-background px-2" value={g.environment} onChange={(e) => update(g.id, { environment: e.target.value })}>
                <option value="sandbox">Teste</option><option value="live">Produção</option>
              </select>
            </label>
            {!g.is_default && <Button size="sm" variant="outline" onClick={() => makeDefault(g.id)}>Definir como padrão</Button>}
            <Button size="sm" variant="outline" disabled title="Disponível quando a integração for conectada">Testar conexão</Button>
            <Link to="/admin/pagamentos/webhooks" className="text-sm underline">Ver logs de webhook</Link>
          </div>
          {g.last_error && <p className="text-xs text-destructive">Último erro: {g.last_error}</p>}
        </section>
      ))}
    </div>
  );
}
