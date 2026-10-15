import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook público da Imperium Pay — MODO CAPTURA/DIAGNÓSTICO.
 *
 * Nesta etapa o endpoint apenas registra o evento recebido em
 * `payment_webhook_logs` com `processing_status = 'received_unmapped'`.
 *
 * REGRA CRÍTICA: nenhum pedido é criado ou alterado, nenhum status
 * financeiro é inferido e nenhum evento Meta Purchase é disparado até
 * conhecermos o payload real do gateway.
 */

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB

/** Apenas cabeçalhos úteis para diagnóstico; nada de credenciais. */
const SAFE_HEADERS = new Set([
  "content-type",
  "content-length",
  "user-agent",
  "accept",
  "origin",
  "referer",
  "host",
  "x-forwarded-for",
  "cf-connecting-ip",
  "cf-ipcountry",
  "x-request-id",
  "x-event-type",
  "x-webhook-event",
]);

const REDACT_PATTERN = /(authorization|cookie|token|secret|credential|signature|api[-_]?key|password)/i;

function safeHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (REDACT_PATTERN.test(name)) {
      out[name] = "[redacted]";
      return;
    }
    if (!SAFE_HEADERS.has(name)) return;
    out[name] = value.slice(0, 400);
  });
  return out;
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export const Route = createFileRoute("/api/public/webhooks/imperiumpay")({
  server: {
    handlers: {
      // Apenas para o gateway/administrador validar que a URL existe.
      GET: async () =>
        jsonResponse({ ok: true, gateway: "imperiumpay", mode: "capture", methods: ["POST"] }),

      POST: async ({ request }) => {
        const raw = await request.text();

        if (raw.length > MAX_PAYLOAD_BYTES) {
          return jsonResponse({ error: "Payload muito grande." }, 413);
        }

        let payload: unknown;
        let parseError: string | null = null;
        try {
          payload = raw ? JSON.parse(raw) : null;
        } catch {
          parseError = "Corpo não é JSON válido; conteúdo bruto armazenado.";
          payload = { _raw: raw.slice(0, MAX_PAYLOAD_BYTES) };
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("payment_webhook_logs").insert({
            gateway: "imperiumpay",
            http_method: "POST",
            headers_safe: safeHeaders(request) as never,
            payload: (payload ?? null) as never,
            processing_status: "received_unmapped",
            error_message: parseError,
          } as never);
          if (error) {
            console.error("[imperiumpay-webhook] falha ao registrar:", error.message);
            return jsonResponse({ received: true, stored: false }, 202);
          }
        } catch (err) {
          console.error("[imperiumpay-webhook] erro inesperado:", err);
          return jsonResponse({ received: true, stored: false }, 202);
        }

        // Postback assinado (X-Signature HMAC) → reconcilia pela API autenticada.
        // Sem assinatura válida nada financeiro acontece; a confirmação segue pela consulta do checkout.
        try {
          const { imperiumpay } = await import("@/lib/gateways/imperiumpay.server");
          const valid = await imperiumpay.verifyWebhook(request, raw);
          if (!valid) return jsonResponse({ received: true, stored: true, verified: false }, 200);
          const obj = (payload ?? {}) as Record<string, unknown>;
          const inner = (obj["data"] ?? obj["sale"] ?? obj["transaction"] ?? obj) as Record<string, unknown>;
          const txId = String(inner["id"] ?? obj["id"] ?? "");
          const { findAttemptByTransaction, reconcileAttempt } = await import("@/lib/payments.server");
          const attemptId = txId ? await findAttemptByTransaction("imperiumpay", txId) : null;
          if (attemptId) await reconcileAttempt(attemptId, { minIntervalMs: 0 });
          return jsonResponse({ received: true, verified: true, matched: !!attemptId }, 200);
        } catch (err) {
          console.error("[imperiumpay-webhook] reconciliação falhou:", err instanceof Error ? err.message : err);
          return jsonResponse({ received: true, stored: true }, 200);
        }
      },
    },
  },
});
