ALTER TABLE public.products ADD COLUMN product_type text NOT NULL DEFAULT 'physical' CHECK (product_type IN ('physical','digital'));
ALTER TABLE public.payment_attempts ADD COLUMN check_count integer NOT NULL DEFAULT 0;
CREATE INDEX payment_attempts_open_idx ON public.payment_attempts(status, created_at) WHERE status IN ('pending','processing','med');