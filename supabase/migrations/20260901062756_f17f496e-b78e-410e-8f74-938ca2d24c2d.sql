ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shipping_min_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS shipping_max_days integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS shipping_business_days boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installment_note text,
  ADD COLUMN IF NOT EXISTS custom_stats_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS checkout_button_text text NOT NULL DEFAULT 'Comprar agora',
  ADD COLUMN IF NOT EXISTS checkout_button_subtext text;