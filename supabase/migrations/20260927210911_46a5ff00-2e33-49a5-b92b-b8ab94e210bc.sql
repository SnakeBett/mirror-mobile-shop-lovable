CREATE TABLE public.product_quantity_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 20),
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  old_price numeric(12,2),
  manual_discount numeric(5,2),
  helper_text text,
  badge text,
  is_popular boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.product_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  display_type text NOT NULL DEFAULT 'buttons' CHECK (display_type IN ('color','buttons','list')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.product_attribute_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  color_hex text,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  option_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  sku text,
  price numeric(12,2),
  old_price numeric(12,2),
  stock integer NOT NULL DEFAULT 0,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.product_quantity_offers(product_id, sort_order);
CREATE INDEX ON public.product_attributes(product_id, sort_order);
CREATE INDEX ON public.product_attribute_values(attribute_id, sort_order);
CREATE INDEX ON public.product_variants(product_id);

GRANT SELECT ON public.product_quantity_offers, public.product_attributes, public.product_attribute_values, public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_quantity_offers, public.product_attributes, public.product_attribute_values, public.product_variants TO authenticated;
GRANT ALL ON public.product_quantity_offers, public.product_attributes, public.product_attribute_values, public.product_variants TO service_role;

ALTER TABLE public.product_quantity_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads active kits" ON public.product_quantity_offers FOR SELECT TO anon, authenticated
  USING (is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active));
CREATE POLICY "Admins manage kits" ON public.product_quantity_offers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Public reads attributes" ON public.product_attributes FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active));
CREATE POLICY "Admins manage attributes" ON public.product_attributes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Public reads attribute values" ON public.product_attribute_values FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active));
CREATE POLICY "Admins manage attribute values" ON public.product_attribute_values FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Public reads variants" ON public.product_variants FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active));
CREATE POLICY "Admins manage variants" ON public.product_variants FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER product_quantity_offers_updated_at BEFORE UPDATE ON public.product_quantity_offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_page_settings ADD COLUMN variant_settings jsonb NOT NULL DEFAULT '{"quantity_offers_enabled":false,"variants_enabled":false,"track_stock":false,"same_variant_default":true}'::jsonb;
ALTER TABLE public.analytics_events ADD COLUMN quantity integer, ADD COLUMN variant_ids text[], ADD COLUMN total_value numeric(12,2), ADD COLUMN quantity_offer_id uuid;