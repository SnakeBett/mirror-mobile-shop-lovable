import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  buildUserData,
  loadTrackingSettings,
  logMetaEvent,
  sendCapiEvent,
  type CapiEvent,
} from "@/lib/meta.server";

/**
 * Ponte navegador → Conversions API.
 *
 * O navegador dispara o Pixel e informa aqui o MESMO `event_id`, para que a
 * Meta deduplique os dois envios. Valor e nome do produto nunca vêm do
 * cliente: são lidos do banco. Purchase NÃO é aceito aqui — só o webhook de
 * pagamento pode gerar Purchase.
 */

const schema = z.object({
  event_name: z.enum(["PageView", "ViewContent", "InitiateCheckout", "AddToCart", "Search"]),
  event_id: z.string().min(6).max(80),
  product_id: z.string().uuid().nullish(),
  event_source_url: z.string().max(600).nullish(),
  fbp: z.string().max(200).nullish(),
  fbc: z.string().max(400).nullish(),
  visitor_id: z.string().max(64).nullish(),
  pixel_sent: z.boolean().optional(),
  num_items: z.number().int().min(1).max(50).optional(),
});

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || request.headers.get("cf-connecting-ip") || null;
}

export const Route = createFileRoute("/api/public/meta-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const parsed = schema.safeParse(body);
        if (!parsed.success) return new Response("invalid event", { status: 400 });
        const data = parsed.data;

        const settings = await loadTrackingSettings();
        if (!settings.meta_enabled) return new Response(null, { status: 204 });

        let custom: Record<string, unknown> | undefined;
        let productId: string | null = null;

        if (data.product_id) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: product } = await supabaseAdmin
            .from("products")
            .select("id, name, current_price, is_active")
            .eq("id", data.product_id)
            .maybeSingle();
          if (product?.is_active) {
            productId = product.id;
            const price = Number(product.current_price ?? 0);
            const quantity = data.num_items ?? 1;
            custom = {
              content_ids: [product.id],
              content_name: product.name,
              content_type: "product",
              contents: [{ id: product.id, quantity, item_price: price }],
              value: price * quantity,
              currency: "BRL",
              ...(data.event_name === "InitiateCheckout" ? { num_items: quantity } : {}),
            };
          }
        }

        const event: CapiEvent = {
          event_name: data.event_name,
          event_id: data.event_id,
          event_source_url: data.event_source_url ?? null,
          action_source: "website",
          user_data: await buildUserData({
            fbp: data.fbp,
            fbc: data.fbc,
            external_id: data.visitor_id,
            client_ip_address: clientIp(request),
            client_user_agent: request.headers.get("user-agent"),
          }),
          ...(custom ? { custom_data: custom } : {}),
        };

        const result = await sendCapiEvent(settings, event);
        await logMetaEvent({
          event_name: data.event_name,
          event_id: data.event_id,
          product_id: productId,
          pixel_sent: data.pixel_sent ?? false,
          capi: result,
          test_event: Boolean(settings.meta_test_event_code),
          event_source_url: data.event_source_url ?? null,
        });

        return new Response(null, { status: 204 });
      },
    },
  },
});
