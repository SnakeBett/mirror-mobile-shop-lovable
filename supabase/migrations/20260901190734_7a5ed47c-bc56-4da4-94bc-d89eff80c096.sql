ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS external_product_id text;

CREATE INDEX IF NOT EXISTS products_source_url_idx ON public.products (source_url);
CREATE INDEX IF NOT EXISTS products_external_product_id_idx ON public.products (external_product_id);

CREATE TABLE IF NOT EXISTS public.product_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform text NOT NULL DEFAULT 'unknown',
  source_url text NOT NULL,
  external_product_id text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'analyzing',
  title text,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_detail text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_imports TO authenticated;
GRANT ALL ON public.product_imports TO service_role;

ALTER TABLE public.product_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage product imports"
ON public.product_imports FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER product_imports_updated_at
BEFORE UPDATE ON public.product_imports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();