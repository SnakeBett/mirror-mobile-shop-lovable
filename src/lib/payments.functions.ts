import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions do admin para a área de Pagamentos.
 * Somente administradores autenticados podem ler os logs de webhook.
 */

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data: isAdmin } = await (context.supabase.rpc as (n: string, a: unknown) => Promise<{ data: boolean }>)(
    "has_role",
    { _user_id: context.userId, _role: "admin" },
  );
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

export type WebhookLogRow = {
  id: string;
  gateway: string;
  received_at: string;
  http_method: string;
  processing_status: string;
  external_event_id: string | null;
  external_transaction_id: string | null;
  external_order_id: string | null;
  original_status: string | null;
  normalized_status: string | null;
  processed_at: string | null;
  error_message: string | null;
};

export type WebhookLogDetail = WebhookLogRow & {
  /** JSON já formatado (string) para exibição segura no admin. */
  headers_safe_json: string;
  payload_json: string;
};

export const listPaymentWebhookLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WebhookLogRow[]> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("payment_webhook_logs")
      .select(
        "id, gateway, received_at, http_method, processing_status, external_event_id, external_transaction_id, external_order_id, original_status, normalized_status, processed_at, error_message",
      )
      .order("received_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Não foi possível carregar os webhooks.");
    return (data ?? []) as WebhookLogRow[];
  });

export const getPaymentWebhookLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<WebhookLogDetail | null> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("payment_webhook_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error("Não foi possível carregar o webhook.");
    if (!row) return null;
    const { headers_safe, payload, ...rest } = row as Record<string, unknown>;
    return {
      ...(rest as unknown as WebhookLogRow),
      headers_safe_json: JSON.stringify(headers_safe ?? {}, null, 2),
      payload_json: JSON.stringify(payload ?? null, null, 2),
    };
  });

export type ImperiumPayStatus = {
  total_events: number;
  last_event_at: string | null;
};

export const getImperiumPayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImperiumPayStatus> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count }, { data: last }] = await Promise.all([
      supabaseAdmin
        .from("payment_webhook_logs")
        .select("id", { count: "exact", head: true })
        .eq("gateway", "imperiumpay"),
      supabaseAdmin
        .from("payment_webhook_logs")
        .select("received_at")
        .eq("gateway", "imperiumpay")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      total_events: count ?? 0,
      last_event_at: (last as { received_at?: string } | null)?.received_at ?? null,
    };
  });
