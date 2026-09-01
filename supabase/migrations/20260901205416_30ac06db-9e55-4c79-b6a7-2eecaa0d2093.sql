CREATE TABLE public.payment_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL DEFAULT 'imperiumpay',
  received_at timestamptz NOT NULL DEFAULT now(),
  http_method text NOT NULL DEFAULT 'POST',
  headers_safe jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb,
  processing_status text NOT NULL DEFAULT 'received_unmapped',
  external_event_id text,
  external_transaction_id text,
  external_order_id text,
  original_status text,
  normalized_status text,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_webhook_logs TO authenticated;
GRANT ALL ON public.payment_webhook_logs TO service_role;

ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read payment webhook logs"
ON public.payment_webhook_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX payment_webhook_logs_received_at_idx ON public.payment_webhook_logs (received_at DESC);
CREATE INDEX payment_webhook_logs_gateway_idx ON public.payment_webhook_logs (gateway);

CREATE TRIGGER payment_webhook_logs_updated_at
BEFORE UPDATE ON public.payment_webhook_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();