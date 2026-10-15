import { createFileRoute } from "@tanstack/react-router";

/**
 * Rotina agendada de conciliação Pix. Só consulta os gateways pela API
 * autenticada; nunca aceita status vindo do chamador. Por isso, ser chamada
 * por terceiros não confirma pagamento algum (idempotente e com limites).
 */
export const Route = createFileRoute("/api/public/hooks/reconcile-pix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { reconcilePendingAttempts } = await import("@/lib/payments.server");
        const r = await reconcilePendingAttempts();
        return Response.json({ ok: true, ...r });
      },
    },
  },
});
