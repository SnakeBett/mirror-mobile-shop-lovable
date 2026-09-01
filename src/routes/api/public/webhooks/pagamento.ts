import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { sendPurchaseForOrder } from "@/lib/meta-purchase.server";

/**
 * Endpoint de webhook de pagamento (genérico e idempotente).
 *
 * Segurança: exige o cabeçalho `x-webhook-secret` igual ao segredo
 * `PAYMENT_WEBHOOK_SECRET`. Enquanto o segredo não estiver configurado o
 * endpoint responde 503 — nenhum pedido é gravado sem validação.
 * A verificação de assinatura específica do gateway será adicionada quando
 * o provedor for definido.
 *
 * Idempotência: o pedido é identificado por `external_order_id` (único no
 * banco). Reenvios do mesmo evento atualizam o registro existente em vez de
 * criar uma nova venda.
 */

const payloadSchema = z.object({
  external_order_id: z.string().min(1).max(120),
  status: z.enum(["pending", "paid", "cancelled", "refunded"]),
  amount: z.coerce.number().nonnegative().optional(),
  product_id: z.string().uuid().nullish(),
  product_slug: z.string().min(1).nullish(),
  customer_name: z.string().max(160).nullish(),
  customer_email: z.string().max(160).nullish(),
  payment_method: z.string().max(60).nullish(),
  paid_at: z.string().nullish(),
  is_test: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  // Atribuição anônima (repassada pelo checkout via query string).
  visitor_id: z.string().max(64).nullish(),
  session_id: z.string().max(64).nullish(),
  utm_source: z.string().max(160).nullish(),
  utm_medium: z.string().max(160).nullish(),
  utm_campaign: z.string().max(160).nullish(),
  utm_content: z.string().max(160).nullish(),
  utm_term: z.string().max(160).nullish(),
  first_utm_source: z.string().max(160).nullish(),
  first_utm_campaign: z.string().max(160).nullish(),
  // Sinais Meta repassados pelo checkout (quando disponíveis).
  fbp: z.string().max(200).nullish(),
  fbc: z.string().max(400).nullish(),
  client_user_agent: z.string().max(400).nullish(),
  customer_phone: z.string().max(40).nullish(),
});

/** Aceita a atribuição tanto no corpo quanto dentro de metadata. */
function attributionFrom(data: {
  metadata?: Record<string, unknown> | null;
} & Record<string, unknown>) {
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = data[key] ?? meta[key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 160);
    }
    return null;
  };
  return {
    visitor_id: pick("visitor_id", "vid"),
    session_id: pick("session_id", "sid"),
    utm_source: pick("utm_source"),
    utm_medium: pick("utm_medium"),
    utm_campaign: pick("utm_campaign"),
    utm_content: pick("utm_content"),
    utm_term: pick("utm_term"),
    first_utm_source: pick("first_utm_source"),
    first_utm_campaign: pick("first_utm_campaign"),
    fbp: pick("fbp", "_fbp"),
    fbc: pick("fbc", "_fbc"),
    client_user_agent: pick("client_user_agent"),
  };
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/webhooks/pagamento")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYMENT_WEBHOOK_SECRET"];
        if (!secret) {
          return Response.json(
            { error: "Webhook não configurado. Defina o segredo PAYMENT_WEBHOOK_SECRET." },
            { status: 503 },
          );
        }

        const provided = request.headers.get("x-webhook-secret") ?? "";
        if (!timingSafeEqual(provided, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido." }, { status: 400 });
        }

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Payload inválido.", issues: parsed.error.issues }, { status: 400 });
        }
        const data = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // O produto nunca vem do frontend: resolvemos pelo slug/ID no banco.
        let productId: string | null = null;
        if (data.product_id) {
          const { data: row } = await supabaseAdmin
            .from("products")
            .select("id")
            .eq("id", data.product_id)
            .maybeSingle();
          productId = row?.id ?? null;
        } else if (data.product_slug) {
          const { data: row } = await supabaseAdmin
            .from("products")
            .select("id")
            .eq("slug", data.product_slug)
            .maybeSingle();
          productId = row?.id ?? null;
        }

        const { data: existing } = await supabaseAdmin
          .from("orders")
          .select("id, status, paid_at")
          .eq("external_order_id", data.external_order_id)
          .maybeSingle();

        const paidAt =
          data.status === "paid"
            ? (data.paid_at ?? existing?.paid_at ?? new Date().toISOString())
            : (existing?.paid_at ?? null);

        const values = {
          external_order_id: data.external_order_id,
          status: data.status,
          amount: data.amount ?? 0,
          product_id: productId,
          customer_name: data.customer_name ?? null,
          customer_email: data.customer_email ?? null,
          payment_method: data.payment_method ?? null,
          is_test: data.is_test ?? false,
          metadata: (data.metadata ?? null) as never,
          paid_at: paidAt,
          ...attributionFrom(data as never),
        };

        if (existing) {
          const { error } = await supabaseAdmin
            .from("orders")
            .update(values as never)
            .eq("id", existing.id);
          if (error) return Response.json({ error: "Falha ao atualizar pedido." }, { status: 500 });
          // Idempotente: só envia Purchase se ainda não foi enviado para este pedido.
          const meta = await sendPurchaseForOrder(existing.id, data.customer_phone ?? null);
          return Response.json({ ok: true, duplicated: true, order_id: existing.id, meta });
        }

        const { data: inserted, error } = await supabaseAdmin
          .from("orders")
          .insert(values as never)
          .select("id")
          .single();

        if (error) {
          // Corrida entre dois envios simultâneos do mesmo evento: já existe.
          if ((error as { code?: string }).code === "23505") {
            return Response.json({ ok: true, duplicated: true });
          }
          return Response.json({ error: "Falha ao registrar pedido." }, { status: 500 });
        }

        const meta = await sendPurchaseForOrder(inserted.id, data.customer_phone ?? null);
        return Response.json({ ok: true, duplicated: false, order_id: inserted.id, meta });
      },
    },
  },
});
