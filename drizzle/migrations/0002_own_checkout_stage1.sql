ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'chargeback';

CREATE TABLE public.checkout_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.checkout_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.checkout_settings TO authenticated;
GRANT ALL ON public.checkout_settings TO service_role;
ALTER TABLE public.checkout_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read checkout settings" ON public.checkout_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin write checkout settings" ON public.checkout_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.checkout_settings (singleton) VALUES (true);

CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'sandbox',
  is_default boolean NOT NULL DEFAULT false,
  integration_status text NOT NULL DEFAULT 'pending_docs',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin gateways" ON public.payment_gateways FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.payment_gateways (provider, name) VALUES ('imperiumpay','ImperiumPay'),('zuckpay','ZuckPay');

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer,
  max_uses_per_buyer integer,
  min_order_value numeric(12,2),
  product_ids uuid[] NOT NULL DEFAULT '{}',
  store_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  uses_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin coupons" ON public.coupons FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_cpf text NOT NULL,
  discount_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.products ADD COLUMN checkout_mode text NOT NULL DEFAULT 'external';
ALTER TABLE public.products ADD COLUMN gateway_id uuid REFERENCES public.payment_gateways(id) ON DELETE SET NULL;

ALTER TABLE public.orders ADD COLUMN gateway_id uuid REFERENCES public.payment_gateways(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN subtotal numeric(12,2);
ALTER TABLE public.orders ADD COLUMN shipping_amount numeric(12,2);
ALTER TABLE public.orders ADD COLUMN coupon_discount numeric(12,2);
ALTER TABLE public.orders ADD COLUMN customer_cpf text;
ALTER TABLE public.orders ADD COLUMN customer_phone text;
ALTER TABLE public.orders ADD COLUMN shipping_address jsonb;
ALTER TABLE public.orders ADD COLUMN idempotency_key text UNIQUE;
ALTER TABLE public.orders ADD COLUMN source text NOT NULL DEFAULT 'external';

-- Atomic order + coupon creation (service role only)
CREATE OR REPLACE FUNCTION public.checkout_create_order(_order jsonb, _coupon_id uuid, _cpf text, _discount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _c public.coupons; _buyer_uses int;
BEGIN
  SELECT id INTO _id FROM public.orders WHERE idempotency_key = _order->>'idempotency_key';
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF _coupon_id IS NOT NULL THEN
    SELECT * INTO _c FROM public.coupons WHERE id = _coupon_id FOR UPDATE;
    IF NOT FOUND OR NOT _c.is_active THEN RAISE EXCEPTION 'coupon_invalid'; END IF;
    IF _c.max_uses IS NOT NULL AND _c.uses_count >= _c.max_uses THEN RAISE EXCEPTION 'coupon_exhausted'; END IF;
    IF _c.max_uses_per_buyer IS NOT NULL THEN
      SELECT count(*) INTO _buyer_uses FROM public.coupon_redemptions WHERE coupon_id = _coupon_id AND buyer_cpf = _cpf;
      IF _buyer_uses >= _c.max_uses_per_buyer THEN RAISE EXCEPTION 'coupon_buyer_limit'; END IF;
    END IF;
  END IF;
  INSERT INTO public.orders (external_order_id, product_id, amount, status, customer_name, customer_email, customer_cpf, customer_phone, payment_method, metadata, visitor_id, session_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, client_user_agent, gateway_id, coupon_id, subtotal, shipping_amount, coupon_discount, shipping_address, idempotency_key, source)
  VALUES ('own-' || gen_random_uuid()::text, (_order->>'product_id')::uuid, (_order->>'amount')::numeric, 'pending', _order->>'customer_name', _order->>'customer_email', _cpf, _order->>'customer_phone', 'pix', _order->'metadata', _order->>'visitor_id', _order->>'session_id', _order->>'utm_source', _order->>'utm_medium', _order->>'utm_campaign', _order->>'utm_content', _order->>'utm_term', _order->>'fbp', _order->>'fbc', _order->>'client_user_agent', NULLIF(_order->>'gateway_id','')::uuid, _coupon_id, (_order->>'subtotal')::numeric, (_order->>'shipping_amount')::numeric, _discount, _order->'shipping_address', _order->>'idempotency_key', 'own_checkout')
  RETURNING id INTO _id;
  IF _coupon_id IS NOT NULL THEN
    UPDATE public.coupons SET uses_count = uses_count + 1 WHERE id = _coupon_id;
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, buyer_cpf, discount_amount) VALUES (_coupon_id, _id, _cpf, _discount);
  END IF;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.checkout_create_order(jsonb, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_create_order(jsonb, uuid, text, numeric) TO service_role;