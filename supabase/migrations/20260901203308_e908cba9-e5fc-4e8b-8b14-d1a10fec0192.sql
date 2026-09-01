CREATE TABLE public.tracking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  meta_enabled boolean NOT NULL DEFAULT false,
  meta_pixel_id text,
  meta_capi_token text,
  meta_test_event_code text,
  meta_graph_version text NOT NULL DEFAULT 'v21.0',
  utmify_enabled boolean NOT NULL DEFAULT false,
  utmify_pixel_id text,
  utmify_pixel_script text NOT NULL DEFAULT 'https://cdn.utmify.com.br/scripts/pixel/pixel.js',
  utmify_utm_script text NOT NULL DEFAULT 'https://cdn.utmify.com.br/scripts/utms/latest.js',
  utmify_api_token text,
  utmify_checkout_params jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.tracking_settings TO service_role;
ALTER TABLE public.tracking_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tracking_settings_updated_at BEFORE UPDATE ON public.tracking_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tracking_settings (singleton) VALUES (true);

CREATE TABLE public.meta_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_id text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  pixel_sent boolean NOT NULL DEFAULT false,
  capi_status text NOT NULL DEFAULT 'skipped',
  http_status integer,
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  test_event boolean NOT NULL DEFAULT false,
  event_source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.meta_event_log TO authenticated;
GRANT ALL ON public.meta_event_log TO service_role;
ALTER TABLE public.meta_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read meta event log" ON public.meta_event_log
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX meta_event_log_created_at_idx ON public.meta_event_log (created_at DESC);
CREATE INDEX meta_event_log_event_id_idx ON public.meta_event_log (event_id);

ALTER TABLE public.orders
  ADD COLUMN fbp text,
  ADD COLUMN fbc text,
  ADD COLUMN client_user_agent text,
  ADD COLUMN meta_purchase_sent_at timestamptz,
  ADD COLUMN meta_purchase_event_id text;