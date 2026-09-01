CREATE TABLE public.product_page_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  section_visibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  section_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  field_visibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  tab_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  text_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  header_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  bottom_bar_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  gallery_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  promotion_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  shipping_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  protection_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  color_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_page_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_page_settings TO authenticated;
GRANT ALL ON public.product_page_settings TO service_role;

ALTER TABLE public.product_page_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public reads page settings" ON public.product_page_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admins manage page settings" ON public.product_page_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER product_page_settings_updated_at
  BEFORE UPDATE ON public.product_page_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.product_page_settings (product_id)
SELECT id FROM public.products
ON CONFLICT (product_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_default_page_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_page_settings (product_id)
  VALUES (NEW.id)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER products_create_page_settings
  AFTER INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.create_default_page_settings();
