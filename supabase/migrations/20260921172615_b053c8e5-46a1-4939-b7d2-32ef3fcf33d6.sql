CREATE TABLE public.product_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  offer_type text NOT NULL DEFAULT 'discount' CHECK (offer_type IN ('discount', 'percentage', 'free_shipping', 'bundle', 'pix', 'coupon', 'custom')),
  discount_type text NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none', 'fixed', 'percentage')),
  discount_value numeric,
  coupon_code text,
  button_text text,
  button_action text NOT NULL DEFAULT 'none' CHECK (button_action IN ('select', 'copy_coupon', 'apply_coupon', 'open_link', 'none')),
  button_url text,
  icon text NOT NULL DEFAULT 'tag' CHECK (icon IN ('tag', 'truck', 'percent', 'gift', 'zap', 'ticket')),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_offers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_offers TO authenticated;
GRANT ALL ON public.product_offers TO service_role;

ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view valid active product offers"
ON public.product_offers FOR SELECT
TO anon
USING (
  is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at IS NULL OR ends_at >= now())
);

CREATE POLICY "Admins can view all product offers"
ON public.product_offers FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create product offers"
ON public.product_offers FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update product offers"
ON public.product_offers FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete product offers"
ON public.product_offers FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX product_offers_product_sort_idx ON public.product_offers(product_id, sort_order);
CREATE INDEX product_offers_public_validity_idx ON public.product_offers(product_id, is_active, starts_at, ends_at);

CREATE TRIGGER update_product_offers_updated_at
BEFORE UPDATE ON public.product_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.analytics_events
ADD COLUMN offer_id uuid REFERENCES public.product_offers(id) ON DELETE SET NULL;

CREATE INDEX analytics_events_offer_idx ON public.analytics_events(offer_id, event_name, created_at);