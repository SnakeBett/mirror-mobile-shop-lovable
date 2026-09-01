import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions do admin para Meta (Pixel + CAPI) e UTMify.
 *
 * Nenhuma delas devolve tokens: apenas o status "configurado / não
 * configurado". Todas exigem sessão autenticada COM papel de admin.
 */

async function assertAdmin(context: { supabase: { rpc: Function }; userId: string }) {
  const { data: isAdmin } = await (context.supabase.rpc as (n: string, a: unknown) => Promise<{ data: boolean }>)(
    "has_role",
    { _user_id: context.userId, _role: "admin" },
  );
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

export type AdminTrackingConfig = {
  meta_enabled: boolean;
  meta_pixel_id: string | null;
  meta_test_event_code: string | null;
  meta_graph_version: string;
  meta_capi_configured: boolean;
  utmify_enabled: boolean;
  utmify_pixel_id: string | null;
  utmify_pixel_script: string;
  utmify_utm_script: string;
  utmify_api_configured: boolean;
  utmify_checkout_params: string[];
  last_browser_event_at: string | null;
  last_server_event_at: string | null;
  last_purchase_at: string | null;
};

export const getTrackingConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminTrackingConfig> => {
    await assertAdmin(context as never);
    const { loadTrackingSettings } = await import("./meta.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadTrackingSettings();

    const [browserRow, serverRow, purchaseRow] = await Promise.all([
      supabaseAdmin
        .from("meta_event_log")
        .select("created_at")
        .eq("pixel_sent", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("meta_event_log")
        .select("created_at")
        .eq("capi_status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("meta_event_log")
        .select("created_at")
        .eq("event_name", "Purchase")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      meta_enabled: settings.meta_enabled,
      meta_pixel_id: settings.meta_pixel_id,
      meta_test_event_code: settings.meta_test_event_code,
      meta_graph_version: settings.meta_graph_version,
      meta_capi_configured: Boolean(settings.meta_capi_token),
      utmify_enabled: settings.utmify_enabled,
      utmify_pixel_id: settings.utmify_pixel_id,
      utmify_pixel_script: settings.utmify_pixel_script,
      utmify_utm_script: settings.utmify_utm_script,
      utmify_api_configured: Boolean(settings.utmify_api_token),
      utmify_checkout_params: settings.utmify_checkout_params,
      last_browser_event_at: browserRow.data?.created_at ?? null,
      last_server_event_at: serverRow.data?.created_at ?? null,
      last_purchase_at: purchaseRow.data?.created_at ?? null,
    };
  });

const saveSchema = z.object({
  meta_enabled: z.boolean(),
  meta_pixel_id: z.string().max(40).nullable(),
  meta_test_event_code: z.string().max(40).nullable(),
  meta_graph_version: z.string().max(10),
  /** undefined = manter o token atual; "" = apagar; texto = novo token. */
  meta_capi_token: z.string().max(600).optional(),
  utmify_enabled: z.boolean(),
  utmify_pixel_id: z.string().max(80).nullable(),
  utmify_pixel_script: z.string().max(300),
  utmify_utm_script: z.string().max(300),
  utmify_api_token: z.string().max(600).optional(),
  utmify_checkout_params: z.array(z.string().max(60)).max(20),
});

export const saveTrackingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const clean = (value: string | null) => {
      const text = (value ?? "").trim();
      return text ? text : null;
    };

    const values: Record<string, unknown> = {
      meta_enabled: data.meta_enabled,
      meta_pixel_id: clean(data.meta_pixel_id),
      meta_test_event_code: clean(data.meta_test_event_code),
      meta_graph_version: clean(data.meta_graph_version) ?? "v21.0",
      utmify_enabled: data.utmify_enabled,
      utmify_pixel_id: clean(data.utmify_pixel_id),
      utmify_pixel_script: clean(data.utmify_pixel_script) ?? "https://cdn.utmify.com.br/scripts/pixel/pixel.js",
      utmify_utm_script: clean(data.utmify_utm_script) ?? "https://cdn.utmify.com.br/scripts/utms/latest.js",
      utmify_checkout_params: data.utmify_checkout_params.map((p) => p.trim()).filter(Boolean),
    };
    if (data.meta_capi_token !== undefined) values["meta_capi_token"] = clean(data.meta_capi_token);
    if (data.utmify_api_token !== undefined) values["utmify_api_token"] = clean(data.utmify_api_token);

    const { data: existing } = await supabaseAdmin.from("tracking_settings").select("id").maybeSingle();
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("tracking_settings")
        .update(values as never)
        .eq("id", existing.id);
      if (error) throw new Error("Não foi possível salvar as configurações de tracking.");
    } else {
      const { error } = await supabaseAdmin.from("tracking_settings").insert(values as never);
      if (error) throw new Error("Não foi possível salvar as configurações de tracking.");
    }
    return { ok: true };
  });

/** Testa a credencial da CAPI enviando um PageView de teste (não grava venda). */
export const testMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event_name?: string } | undefined) => ({
    event_name: input?.event_name ?? "PageView",
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { buildUserData, loadTrackingSettings, logMetaEvent, sendCapiEvent } = await import("./meta.server");
    const settings = await loadTrackingSettings();

    if (!settings.meta_pixel_id) return { ok: false, message: "Pixel ID não configurado." };
    if (!settings.meta_capi_token) return { ok: false, message: "Access Token da CAPI não configurado." };

    const allowed = ["PageView", "ViewContent", "InitiateCheckout"] as const;
    const eventName = (allowed as readonly string[]).includes(data.event_name)
      ? (data.event_name as (typeof allowed)[number])
      : "PageView";
    const eventId = `test_${Date.now().toString(36)}`;

    const result = await sendCapiEvent(
      settings,
      {
        event_name: eventName,
        event_id: eventId,
        action_source: "website",
        user_data: await buildUserData({ external_id: "admin-test" }),
        ...(eventName === "PageView" ? {} : { custom_data: { currency: "BRL", value: 0 } }),
      },
      { maxAttempts: 1 },
    );

    await logMetaEvent({ event_name: eventName, event_id: eventId, capi: result, test_event: true });

    return {
      ok: result.ok,
      message: result.ok
        ? `Evento ${eventName} aceito pela Meta${settings.meta_test_event_code ? " (modo de teste)" : ""}.`
        : (result.error ?? result.skipped ?? "Falha ao contatar a Meta."),
      status: result.status,
    };
  });

export type MetaLogRow = {
  id: string;
  created_at: string;
  event_name: string;
  event_id: string;
  product_name: string | null;
  order_id: string | null;
  pixel_sent: boolean;
  capi_status: string;
  http_status: number | null;
  error_message: string | null;
  attempts: number;
  test_event: boolean;
};

export const listMetaEventLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(input?.limit ?? 50, 1), 200),
  }))
  .handler(async ({ data, context }): Promise<MetaLogRow[]> => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("meta_event_log")
      .select("*, products(name)")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    return (rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const product = r["products"] as { name?: string } | null;
      return {
        id: String(r["id"]),
        created_at: String(r["created_at"]),
        event_name: String(r["event_name"]),
        event_id: String(r["event_id"]),
        product_name: product?.name ?? null,
        order_id: (r["order_id"] as string | null) ?? null,
        pixel_sent: r["pixel_sent"] === true,
        capi_status: String(r["capi_status"]),
        http_status: (r["http_status"] as number | null) ?? null,
        error_message: (r["error_message"] as string | null) ?? null,
        attempts: Number(r["attempts"] ?? 1),
        test_event: r["test_event"] === true,
      };
    });
  });

/** Reenvia Purchase de pedidos pagos cujo envio anterior falhou (mesmo event_id). */
export const retryPendingPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPurchaseForOrder } = await import("./meta-purchase.server");

    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("status", "paid")
      .is("meta_purchase_sent_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    let sent = 0;
    let failed = 0;
    for (const order of orders ?? []) {
      const result = await sendPurchaseForOrder(order.id);
      if (result.status === "sent") sent += 1;
      else if (result.status === "failed") failed += 1;
    }
    return { processed: (orders ?? []).length, sent, failed };
  });
