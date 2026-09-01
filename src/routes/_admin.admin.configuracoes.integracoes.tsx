import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getIntegrationStatus } from "@/lib/import.functions";

export const Route = createFileRoute("/_admin/admin/configuracoes/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações | Vitrine Admin" },
      { name: "description", content: "Status das integrações de importação de produtos." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Integrações | Vitrine Admin" },
      { property: "og:description", content: "Status das integrações de importação de produtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegrationsPage,
});

const PROVIDERS = [
  {
    key: "mercado_livre" as const,
    label: "Mercado Livre",
    credential: "MERCADO_LIVRE_ACCESS_TOKEN",
    note: "Token de acesso da API oficial do Mercado Livre (app próprio, via OAuth do painel de desenvolvedores).",
  },
  {
    key: "shopee" as const,
    label: "Shopee",
    credential: "SHOPEE_API_KEY",
    note: "Requer conta de parceiro Shopee Open Platform autorizada para a sua região.",
  },
  {
    key: "tiktok_shop" as const,
    label: "TikTok Shop",
    credential: "TIKTOK_SHOP_API_KEY",
    note: "Requer app aprovado no TikTok Shop Partner Center.",
  },
];

const STATUS_LABELS: Record<string, string> = {
  connected: "Conectado",
  not_configured: "Não configurado",
  error: "Erro",
};

function IntegrationsPage() {
  const fetchStatus = useServerFn(getIntegrationStatus);
  const status = useQuery({ queryKey: ["admin", "integrations"], queryFn: () => fetchStatus() });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Integrações</h1>
        <p className="text-sm text-muted-foreground">
          Conexões usadas pelo importador de produtos. As credenciais ficam apenas no servidor.
        </p>
      </header>

      <div className="divide-y divide-border rounded-lg border border-border bg-background">
        {PROVIDERS.map((provider) => {
          const value = status.data?.[provider.key] ?? "not_configured";
          return (
            <div key={provider.key} className="flex flex-wrap items-center gap-3 px-4 py-4">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium text-foreground">{provider.label}</p>
                <p className="text-xs text-muted-foreground">{provider.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Credencial necessária: <code>{provider.credential}</code>
                </p>
              </div>
              <span
                className={
                  value === "connected"
                    ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600"
                    : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                }
              >
                {STATUS_LABELS[value] ?? value}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Nenhuma credencial é inventada pelo sistema. Para conectar uma plataforma, envie a credencial oficial
        pelo chat do projeto e ela será armazenada com segurança no ambiente do servidor.
      </p>
    </div>
  );
}
