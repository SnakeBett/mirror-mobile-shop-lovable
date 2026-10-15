import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState } from "react";
import { Copy, Eye, EyeOff, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  getGatewayConfigStatus,
  getOpenPixCount,
  listPaymentAttempts,
  saveGatewayCredentials,
  saveSiteSettings,
  testGatewayConnection,
} from "@/lib/payments.functions";
import {
  credentialValueError,
  normalizeSiteUrl,
  type CredentialFieldStatus,
  type GatewayConfigStatus,
  type PaymentConfigStatus,
} from "@/lib/gateways/credentials";
import { cn } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_admin/admin/pagamentos/gateways")({
  head: () => ({
    meta: [
      { title: "Gateways de pagamento | Vitrine Admin" },
      { name: "description", content: "Cadastre as chaves dos gateways Pix do checkout próprio." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Gateways de pagamento | Vitrine Admin" },
      {
        property: "og:description",
        content: "Cadastre as chaves dos gateways Pix do checkout próprio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type GatewayRow = {
  id: string;
  provider: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
  integration_status: string;
  last_error: string | null;
};

const ROWS_KEY = ["admin", "gateways", "rows"] as const;
const CONFIG_KEY = ["admin", "gateways", "config"] as const;
const ATTEMPTS_KEY = ["admin", "gateways", "attempts"] as const;

const TEST_STATUS: Record<string, string> = {
  pending_docs: "Conexão ainda não testada",
  connected: "Último teste: conectado",
  error: "Último teste: falhou",
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

// Campo de chave: 16 px no celular (o iPhone não amplia a tela ao tocar) e menor no computador.
const KEY_INPUT = "min-w-0 flex-1 font-mono text-base md:text-xs";

// Campos de chave sem gerenciador de senhas: texto mascarado por CSS quando o navegador permite.
const CAN_MASK_TEXT =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("-webkit-text-security", "disc");

async function loadGatewayRows(): Promise<GatewayRow[]> {
  const { data, error } = await supabase
    .from("payment_gateways")
    .select("id, provider, name, is_active, is_default, integration_status, last_error")
    .order("name");
  if (error) throw new Error("Não foi possível carregar os gateways.");
  return (data ?? []) as GatewayRow[];
}

function Page() {
  const statusFn = useServerFn(getGatewayConfigStatus);
  const attemptsFn = useServerFn(listPaymentAttempts);
  const rows = useQuery({ queryKey: ROWS_KEY, queryFn: loadGatewayRows });
  const config = useQuery({ queryKey: CONFIG_KEY, queryFn: () => statusFn() });
  const attempts = useQuery({ queryKey: ATTEMPTS_KEY, queryFn: () => attemptsFn() });
  const retry = () => void Promise.all([rows.refetch(), config.refetch()]);
  const loadError =
    (config.error as Error | null)?.message ?? (rows.error as Error | null)?.message ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Pagamentos · Gateways</h1>
        <p className="text-sm text-muted-foreground">
          Cole aqui as chaves de cada gateway. Elas ficam guardadas no servidor: depois de salvas,
          aparecem só pelo final e nunca voltam para esta tela. O checkout usa o gateway escolhido
          no produto ou, se não houver, o gateway padrão. Ele precisa estar ativo e com as chaves
          completas.
        </p>
      </header>

      {!config.data || !rows.data ? (
        rows.isError || config.isError ? (
          <section
            className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            role="alert"
          >
            <p className="text-sm font-medium text-foreground">
              Não foi possível carregar a configuração dos gateways.
            </p>
            <p className="text-xs text-muted-foreground">
              {loadError ?? "Tente de novo em instantes."}
            </p>
            <Button size="sm" variant="outline" onClick={retry}>
              Tentar de novo
            </Button>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">Carregando gateways…</p>
        )
      ) : (
        <>
          {(rows.isError || config.isError) && (
            <section
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              role="status"
            >
              <p className="text-xs text-muted-foreground">
                Não foi possível atualizar a tela agora. O que aparece abaixo é da última
                atualização.
              </p>
              <Button size="sm" variant="outline" onClick={retry}>
                Atualizar
              </Button>
            </section>
          )}
          <VaultNotice vault={config.data.vault} />
          <DefaultNotice rows={rows.data} gateways={config.data.gateways} />
          <SiteAddressCard site={config.data.site} />
          {config.data.gateways.map((status) => (
            <GatewayCard
              key={status.provider}
              row={rows.data.find((r) => r.provider === status.provider) ?? null}
              status={status}
            />
          ))}
        </>
      )}

      <section className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="font-semibold">Últimas cobranças Pix</h2>
        {attempts.isError && (
          <p className="text-xs text-destructive">Não foi possível carregar as cobranças.</p>
        )}
        {!attempts.isError && (attempts.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma cobrança gerada ainda.</p>
        )}
        {(attempts.data ?? []).map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-xs"
          >
            <span>
              {new Date(a.created_at).toLocaleString("pt-BR")} · {a.provider} · pedido{" "}
              {a.order_id.slice(0, 8).toUpperCase()}
            </span>
            <span>
              {(a.amount_cents / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}{" "}
              · <b>{a.status}</b>
              {a.error_message ? ` · ${a.error_message}` : ""}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function VaultNotice({ vault }: { vault: PaymentConfigStatus["vault"] }) {
  if (vault.ok && !vault.public) return null;
  return (
    <section
      className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      role="alert"
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="space-y-1 text-sm">
        {!vault.ok && (
          <>
            <p>
              <span className="font-medium">Não foi possível ler o cofre das chaves agora.</span>{" "}
              Enquanto ele não responder, o checkout só gera Pix com as chaves lidas nos últimos
              minutos; sem elas, avisa o cliente que o Pix está indisponível no momento.
            </p>
            {vault.error && (
              <p className="break-words text-xs text-muted-foreground">
                Detalhe técnico: {vault.error}
              </p>
            )}
          </>
        )}
        {vault.public && (
          <p>
            <span className="font-medium">O cofre das chaves está público.</span> Salve qualquer
            chave abaixo para torná-lo privado de novo.
          </p>
        )}
      </div>
    </section>
  );
}

/** Avisa quando produtos sem gateway próprio não vão gerar Pix por causa do gateway padrão. */
function DefaultNotice({
  rows,
  gateways,
}: {
  rows: GatewayRow[];
  gateways: GatewayConfigStatus[];
}) {
  const row = rows.find((r) => r.is_default);
  const status = row ? gateways.find((g) => g.provider === row.provider) : undefined;
  let message: string | null = null;
  if (!row) {
    message =
      "Nenhum gateway está como padrão. Produtos sem gateway próprio não geram Pix: use “Definir como padrão” no gateway que deve receber os pagamentos.";
  } else if (!row.is_active) {
    message = `O gateway padrão (${status?.name ?? row.name}) está desativado. Produtos sem gateway próprio não geram Pix até você ativá-lo.`;
  } else if (status && status.readable && !status.configured) {
    message = `O gateway padrão (${status.name}) está sem as chaves completas. Produtos sem gateway próprio não geram Pix até você cadastrá-las.`;
  }
  if (!message) return null;
  return (
    <section
      className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
      role="status"
    >
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
        aria-hidden
      />
      <p className="text-sm text-foreground">{message}</p>
    </section>
  );
}

const SITE_SOURCE: Record<PaymentConfigStatus["site"]["source"], string> = {
  panel: "salvo aqui",
  env: "variável PUBLIC_SITE_URL da Lovable",
  default: "endereço padrão da Lovable",
};

function SiteAddressCard({ site }: { site: PaymentConfigStatus["site"] }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveSiteSettings);
  const inputId = useId();
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const checked = trimmed ? normalizeSiteUrl(trimmed) : null;
  const error = checked && !checked.ok ? checked.error : null;

  const save = useMutation({
    mutationFn: (next: string | null) => saveFn({ data: { public_site_url: next } }),
    onSuccess: (next, sent) => {
      qc.setQueryData(CONFIG_KEY, next);
      setValue("");
      toast.success(sent ? "Endereço do site salvo." : "O endereço voltou ao padrão.");
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar o endereço."),
  });

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <h2 className="font-semibold">Endereço do site</h2>
        <p className="text-xs text-muted-foreground">
          Os gateways avisam cada pagamento neste endereço. Use o domínio onde a loja está
          publicada; em branco, vale o padrão.
        </p>
      </div>
      <p className="text-sm">
        Em uso: <span className="break-all font-mono text-xs">{site.origin}</span>{" "}
        <span className="text-xs text-muted-foreground">({SITE_SOURCE[site.source]})</span>
      </p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (checked?.ok && !save.isPending) save.mutate(checked.origin);
        }}
      >
        <Label htmlFor={inputId}>Novo endereço</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={inputId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://minhaloja.com.br"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-erro` : undefined}
            className={cn(KEY_INPUT, "basis-56")}
          />
          <Button type="submit" disabled={!checked?.ok || save.isPending}>
            {save.isPending && save.variables !== null ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Salvar endereço
          </Button>
          {site.source === "panel" && (
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => save.mutate(null)}
            >
              Voltar ao padrão
            </Button>
          )}
        </div>
        {error && (
          <p id={`${inputId}-erro`} className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

function GatewayCard({ row, status }: { row: GatewayRow | null; status: GatewayConfigStatus }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveGatewayCredentials);
  const testFn = useServerFn(testGatewayConnection);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [removals, setRemovals] = useState<Record<string, true>>({});
  const [lit, setLit] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const litTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (litTimer.current) clearTimeout(litTimer.current);
    },
    [],
  );

  const errors: Record<string, string | null> = {};
  const changes: Record<string, string | null> = {};
  for (const field of status.fields) {
    const typed = drafts[field.key]?.trim() ?? "";
    if (typed) {
      errors[field.key] = credentialValueError(typed);
      changes[field.key] = typed;
    } else if (removals[field.key]) {
      changes[field.key] = null;
    }
  }
  const dirty = Object.keys(changes).length > 0;
  const hasErrors = Object.values(errors).some(Boolean);
  const active = !!row?.is_active;

  // Motivos para pedir confirmação antes de salvar.
  const removedRequired = status.fields.filter(
    (f) => changes[f.key] === null && f.required && !f.env_set,
  );
  const touchesExistingKey = status.fields.some(
    (f) => f.required && f.source !== "none" && f.key in changes,
  );
  const confirmReasons = (openAttempts: number | null): string[] => {
    const out: string[] = [];
    if (removedRequired.length && active) {
      out.push(
        `Sem ${removedRequired.map((f) => f.label.toLowerCase()).join(" e ")}, a ${status.name} para de gerar Pix no checkout até você cadastrar outra.`,
      );
    }
    const n = openAttempts ?? 0;
    if (touchesExistingKey && n > 0) {
      const opened = n === 1 ? "Há 1 Pix em aberto criado" : `Há ${n} Pix em aberto criados`;
      const replacing = status.fields.some(
        (f) => f.required && f.source !== "none" && typeof changes[f.key] === "string",
      );
      out.push(
        replacing
          ? `${opened} com as chaves atuais. Se as chaves novas forem de outra conta da ${status.name}, ${n === 1 ? "ele não será confirmado" : "eles não serão confirmados"} automaticamente.`
          : `${opened} com as chaves atuais. Sem elas, ${n === 1 ? "esse Pix pode não ser confirmado" : "esses Pix podem não ser confirmados"} automaticamente.`,
      );
    }
    return out;
  };
  const [reasons, setReasons] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const countFn = useServerFn(getOpenPixCount);

  const refreshAll = () => qc.invalidateQueries({ queryKey: ["admin", "gateways"] });

  const test = useMutation({
    mutationFn: () => testFn({ data: { provider: status.provider } }),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e: Error) => toast.error(e.message || "Falha ao testar."),
    onSettled: () => void qc.invalidateQueries({ queryKey: ROWS_KEY }),
  });

  const save = useMutation({
    mutationFn: (values: Record<string, string | null>) =>
      saveFn({ data: { provider: status.provider, values } }),
    onSuccess: (next, values) => {
      qc.setQueryData(CONFIG_KEY, next);
      // Limpa só o que foi salvo: o que foi digitado durante o envio continua no campo.
      setDrafts((current) => {
        const rest = { ...current };
        for (const [key, value] of Object.entries(values)) {
          if (value !== null && rest[key]?.trim() === value) delete rest[key];
        }
        return rest;
      });
      setRemovals((current) => {
        const rest = { ...current };
        for (const [key, value] of Object.entries(values)) if (value === null) delete rest[key];
        return rest;
      });
      setLit(Object.keys(values));
      if (litTimer.current) clearTimeout(litTimer.current);
      litTimer.current = setTimeout(() => setLit([]), 1600);
      toast.success(`Chaves da ${status.name} salvas.`);
      const updated = next.gateways.find((g) => g.provider === status.provider);
      if (updated?.configured && updated.readable) test.mutate();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar as chaves."),
  });

  const submit = async () => {
    if (!dirty || hasErrors || save.isPending || checking) return;
    let openAttempts = status.open_attempts;
    if (touchesExistingKey) {
      // Conta na hora: a tela pode estar aberta há tempo e com número velho.
      setChecking(true);
      try {
        openAttempts = await countFn({ data: { provider: status.provider } });
      } catch {
        // sem a contagem nova, vale a da tela
      } finally {
        setChecking(false);
      }
    }
    const found = confirmReasons(openAttempts);
    if (found.length) {
      setReasons(found);
      setConfirmOpen(true);
      return;
    }
    save.mutate(changes);
  };

  const setActive = async (next: boolean) => {
    if (!row) return;
    const { error } = await supabase
      .from("payment_gateways")
      .update({ is_active: next, updated_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    if (error) toast.error("Não foi possível salvar.");
    else if (next && !status.configured)
      toast.warning(
        `${status.name} ativada, mas ainda faltam chaves: ${status.missing.join(", ")}.`,
      );
    void refreshAll();
  };

  const makeDefault = async () => {
    if (!row) return;
    const off = await supabase
      .from("payment_gateways")
      .update({ is_default: false } as never)
      .neq("id", row.id);
    const on = await supabase
      .from("payment_gateways")
      .update({ is_default: true, updated_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    if (off.error || on.error) toast.error("Não foi possível definir o gateway padrão.");
    else toast.success(`${status.name} agora é o gateway padrão.`);
    void refreshAll();
  };

  const copy = (v: string) =>
    navigator.clipboard.writeText(v).then(
      () => toast.success("URL copiada."),
      () => toast.error("Não foi possível copiar. Selecione e copie manualmente."),
    );

  const headingId = `gw-${status.provider}`;
  const forThis = <span className="sr-only"> da {status.name}</span>;

  return (
    <section className="space-y-4 rounded-lg border border-border p-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 id={headingId} className="font-semibold">
            {status.name}
            {row?.is_default && (
              <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                Padrão
              </span>
            )}
          </h2>
          <ReadinessPill row={row} status={status} />
        </div>
        {row && (
          <label className="flex items-center gap-2 text-sm">
            Ativo
            <Switch
              checked={row.is_active}
              onCheckedChange={(v) => void setActive(v)}
              aria-label={`Ativar ${status.name} no checkout`}
            />
          </label>
        )}
      </div>
      {!row && (
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          Este gateway não está na tabela de gateways do banco. Dá para salvar as chaves, mas não
          para ativá-lo nem defini-lo como padrão.
        </p>
      )}

      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {status.fields.map((field) => (
          <CredentialRow
            key={field.key}
            field={field}
            readable={status.readable}
            draft={drafts[field.key] ?? ""}
            removing={!!removals[field.key] && !(drafts[field.key]?.trim() ?? "")}
            error={errors[field.key] ?? null}
            lit={lit.includes(field.key)}
            onDraft={(v) => setDrafts((d) => ({ ...d, [field.key]: v }))}
            onRemove={() => setRemovals((r) => ({ ...r, [field.key]: true }))}
            onUndo={() =>
              setRemovals((r) => {
                const next = { ...r };
                delete next[field.key];
                return next;
              })
            }
          />
        ))}

        <div className="flex flex-wrap items-center gap-2 pt-3">
          <Button type="submit" disabled={!dirty || hasErrors || save.isPending || checking}>
            {(save.isPending || checking) && (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            )}
            {save.isPending ? "Salvando…" : checking ? "Conferindo…" : "Salvar chaves"}
            {forThis}
          </Button>
          {dirty && !save.isPending && !checking && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDrafts({});
                setRemovals({});
              }}
            >
              Descartar alterações{forThis}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={dirty || test.isPending || save.isPending}
            onClick={() => test.mutate()}
          >
            {test.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {test.isPending ? "Testando…" : "Testar conexão"}
            {forThis}
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">Salve antes de testar.</span>}
        </div>
      </form>

      <div className="space-y-1.5 border-t border-border pt-4">
        <p className="text-sm font-medium">URL de aviso de pagamento (webhook)</p>
        <div className="flex gap-2">
          <Input
            readOnly
            value={status.webhook_url}
            aria-label={`URL de aviso da ${status.name}`}
            className="h-8 min-w-0 flex-1 font-mono text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copy(status.webhook_url)}
            className="gap-1"
          >
            <Copy className="size-3.5" aria-hidden /> Copiar
            <span className="sr-only"> URL de aviso da {status.name}</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Vai junto de cada cobrança. Se o painel da {status.name} pedir uma URL de webhook ou
          postback, cadastre esta.
          {status.readable &&
            status.signature_check === false &&
            " Sem o segredo do postback, o pagamento é confirmado pela consulta automática."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4 text-sm">
        {row && !row.is_default && (
          <Button type="button" size="sm" variant="outline" onClick={() => void makeDefault()}>
            Definir como padrão{forThis}
          </Button>
        )}
        <Link to="/admin/pagamentos/webhooks" className="text-sm underline underline-offset-4">
          Ver avisos recebidos
        </Link>
        {row && (
          <span className="text-xs text-muted-foreground">
            {TEST_STATUS[row.integration_status] ?? row.integration_status}
          </span>
        )}
        {status.updated_at && (
          <span className="text-xs text-muted-foreground">
            Chaves atualizadas em {formatDate(status.updated_at)}
            {status.updated_by ? ` por ${status.updated_by}` : ""}
          </span>
        )}
      </div>
      {row?.last_error && (
        <p className="break-words text-xs text-destructive">Último erro: {row.last_error}</p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar as chaves da {status.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => save.mutate(changes)}>
              Salvar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ReadinessPill({ row, status }: { row: GatewayRow | null; status: GatewayConfigStatus }) {
  const [tone, text] = !status.readable
    ? (["warn", "Não foi possível ler as chaves agora"] as const)
    : !status.configured
      ? (["warn", `Faltam: ${status.missing.join(", ")}`] as const)
      : !row?.is_active
        ? (["idle", "Chaves completas · desativado"] as const)
        : row.is_default
          ? (["ok", "Pronto para gerar Pix"] as const)
          : (["ok", "Pronto · só nos produtos que usam este gateway"] as const);
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "warn" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "idle" && "bg-muted text-muted-foreground",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {text}
    </p>
  );
}

type RowProps = {
  field: CredentialFieldStatus;
  readable: boolean;
  draft: string;
  removing: boolean;
  error: string | null;
  lit: boolean;
  onDraft: (value: string) => void;
  onRemove: () => void;
  onUndo: () => void;
};

function CredentialRow({
  field,
  readable,
  draft,
  removing,
  error,
  lit,
  onDraft,
  onRemove,
  onUndo,
}: RowProps) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  // Depois de "Remover" o foco vai para "Desfazer"; depois de "Desfazer", volta para o campo.
  const focusNext = useRef<"undo" | "input" | null>(null);
  useEffect(() => {
    if (focusNext.current === "undo" && removing) undoRef.current?.focus();
    if (focusNext.current === "input" && !removing) inputRef.current?.focus();
    focusNext.current = null;
  }, [removing]);

  const hasValue = field.source !== "none";
  const placeholder = removing
    ? "Será removida ao salvar"
    : hasValue
      ? "Nova chave para trocar"
      : "Cole a chave";
  const masked = !reveal && CAN_MASK_TEXT;

  return (
    <div
      className={cn(
        "-mx-2 space-y-1.5 rounded-md px-2 py-2 transition-colors duration-700 motion-reduce:transition-none",
        lit && "bg-emerald-500/10",
      )}
    >
      <Label htmlFor={id} className="flex flex-wrap items-baseline gap-x-2">
        {field.label}
        <span className="text-xs font-normal text-muted-foreground">
          {field.required ? "obrigatório" : "opcional"}
        </span>
      </Label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={id}
          name={`credencial-${field.key}`}
          type={reveal || CAN_MASK_TEXT ? "text" : "password"}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          placeholder={placeholder}
          disabled={removing}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
          data-bwignore=""
          data-form-type="other"
          aria-invalid={!!error}
          aria-describedby={`${id}-estado ${id}-ajuda${error ? ` ${id}-erro` : ""}`}
          className={cn(KEY_INPUT, masked && "[-webkit-text-security:disc]")}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Mostrar o valor digitado em ${field.label}`}
          aria-pressed={reveal}
          onClick={() => setReveal((v) => !v)}
          disabled={removing}
        >
          {reveal ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </Button>
      </div>
      {error && (
        <p id={`${id}-erro`} className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div id={`${id}-estado`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {removing ? (
          <>
            <span className="font-medium text-amber-700 dark:text-amber-400">
              Será removida ao salvar.
            </span>
            {field.env_set && (
              <span className="text-muted-foreground">
                Depois disso, volta a valer a variável {field.env} da Lovable.
              </span>
            )}
            <button
              ref={undoRef}
              type="button"
              onClick={() => {
                focusNext.current = "input";
                onUndo();
              }}
              className="font-medium underline underline-offset-4"
            >
              Desfazer<span className="sr-only"> a remoção de {field.label.toLowerCase()}</span>
            </button>
          </>
        ) : (
          <>
            <SourceText field={field} readable={readable} />
            {field.hint && (
              <span
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                title="Últimos 4 caracteres da chave em uso"
              >
                <span aria-hidden>••••</span>
                <span className="sr-only">termina em </span>
                {field.hint}
              </span>
            )}
            {field.source === "panel" && !draft.trim() && (
              <button
                type="button"
                onClick={() => {
                  focusNext.current = "undo";
                  onRemove();
                }}
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Remover do painel<span className="sr-only"> ({field.label.toLowerCase()})</span>
              </button>
            )}
          </>
        )}
      </div>
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        {field.help}
      </p>
    </div>
  );
}

function SourceText({ field, readable }: { field: CredentialFieldStatus; readable: boolean }) {
  if (field.invalid) {
    return (
      <span className="text-destructive">
        A variável {field.env} da Lovable tem caractere inválido. Cole a chave aqui para corrigir.
      </span>
    );
  }
  if (field.source === "panel")
    return (
      <span className="font-medium text-emerald-700 dark:text-emerald-400">Salva no painel</span>
    );
  if (field.source === "env")
    return <span className="text-foreground">Vem da variável {field.env} da Lovable</span>;
  if (!readable)
    return <span className="text-muted-foreground">Não foi possível conferir agora</span>;
  return field.required ? (
    <span className="font-medium text-amber-700 dark:text-amber-400">Falta cadastrar</span>
  ) : (
    <span className="text-muted-foreground">Não cadastrado</span>
  );
}
