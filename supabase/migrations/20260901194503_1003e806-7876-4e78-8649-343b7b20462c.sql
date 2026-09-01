ALTER TABLE public.products ADD COLUMN IF NOT EXISTS import_method text;
ALTER TABLE public.product_imports ADD COLUMN IF NOT EXISTS import_method text NOT NULL DEFAULT 'server';