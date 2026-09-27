ALTER TABLE public.product_quantity_offers ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS use_custom_checkout boolean NOT NULL DEFAULT false;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS checkout_url text;