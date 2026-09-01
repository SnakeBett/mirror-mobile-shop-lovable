import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Ingestão de eventos de analytics (público, sem login).
 *
 * Só aceita a lista fixa de eventos e campos anônimos — nenhum dado pessoal.
 * A escrita usa o cliente administrativo porque a tabela não permite leitura
 * nem escrita direta por visitantes (RLS: só admin lê).
 */

const eventSchema = z.object({
  event_name: z.enum([
    "page_view",
    "product_view",
    "view_content",
    "click_buy",
    "begin_checkout",
    "view_recommendation",
    "click_recommendation",
  ]),
  visitor_id: z.string().min(6).max(64),
  session_id: z.string().min(6).max(64),
  product_id: z.string().uuid().nullish(),
  recommended_product_id: z.string().uuid().nullish(),
  path: z.string().max(300).nullish(),
  referrer: z.string().max(500).nullish(),
  device_type: z.enum(["mobile", "tablet", "desktop"]).nullish(),
  utm_source: z.string().max(160).nullish(),
  utm_medium: z.string().max(160).nullish(),
  utm_campaign: z.string().max(160).nullish(),
  utm_content: z.string().max(160).nullish(),
  utm_term: z.string().max(160).nullish(),
  click_id: z.string().max(250).nullish(),
  click_source: z.string().max(20).nullish(),
  first_utm_source: z.string().max(160).nullish(),
  first_utm_medium: z.string().max(160).nullish(),
  first_utm_campaign: z.string().max(160).nullish(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullish(),
});

export const Route = createFileRoute("/api/public/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const parsed = eventSchema.safeParse(body);
        if (!parsed.success) return new Response("invalid event", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("analytics_events").insert(parsed.data as never);
        if (error) {
          console.error("analytics insert failed", error.message);
          return new Response("error", { status: 500 });
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
