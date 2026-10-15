CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  gateway_id uuid REFERENCES public.payment_gateways(id),
  provider text NOT NULL,
  provider_transaction_id text,
  status text NOT NULL DEFAULT 'creating',
  raw_status text,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  pix_copy_paste text,
  qr_code_image text,
  expires_at timestamptz,
  paid_at timestamptz,
  last_checked_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_attempts_provider_tx_key ON public.payment_attempts(provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX payment_attempts_one_open_per_order ON public.payment_attempts(order_id) WHERE status IN ('creating','pending','processing','unknown_result');
CREATE INDEX payment_attempts_order_idx ON public.payment_attempts(order_id);
GRANT SELECT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read payment attempts" ON public.payment_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));