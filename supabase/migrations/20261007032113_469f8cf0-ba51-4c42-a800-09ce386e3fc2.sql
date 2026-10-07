ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS variation text,
  ADD COLUMN IF NOT EXISTS import_hash text,
  ADD COLUMN IF NOT EXISTS import_source text;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_product_import_hash_key
  ON public.reviews (product_id, import_hash) WHERE import_hash IS NOT NULL;