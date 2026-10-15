CREATE TABLE public.shipping_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  min_days integer CHECK (min_days >= 0),
  max_days integer CHECK (max_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_methods TO authenticated;
GRANT ALL ON public.shipping_methods TO service_role;
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads active shipping methods" ON public.shipping_methods FOR SELECT TO anon, authenticated USING (is_active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage shipping methods" ON public.shipping_methods FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER shipping_methods_updated BEFORE UPDATE ON public.shipping_methods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.products
  ADD COLUMN shipping_mode text NOT NULL DEFAULT 'legacy' CHECK (shipping_mode IN ('legacy','global','selected','free')),
  ADD COLUMN shipping_method_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.orders
  ADD COLUMN shipping_method_id uuid,
  ADD COLUMN shipping_method_name text;

CREATE OR REPLACE FUNCTION public.checkout_set_order_shipping(_order_id uuid, _method_id uuid, _method_name text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.orders SET shipping_method_id = _method_id, shipping_method_name = _method_name WHERE id = _order_id;
$$;
REVOKE EXECUTE ON FUNCTION public.checkout_set_order_shipping(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_set_order_shipping(uuid, uuid, text) TO service_role;