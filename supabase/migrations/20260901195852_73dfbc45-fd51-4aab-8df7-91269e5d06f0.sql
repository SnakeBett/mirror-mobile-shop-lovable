-- 1. EVENTOS DE ANALYTICS -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  recommended_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  visitor_id text NOT NULL,
  session_id text NOT NULL,
  path text,
  referrer text,
  device_type text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  click_id text,
  click_source text,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read analytics events"
  ON public.analytics_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_product_idx ON public.analytics_events (product_id, event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON public.analytics_events (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx ON public.analytics_events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_campaign_idx ON public.analytics_events (utm_campaign, created_at DESC);

-- 2. CONFIGURAÇÕES GLOBAIS ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  currency text NOT NULL DEFAULT 'BRL',
  meta_pixel_id text,
  tiktok_pixel_id text,
  ga_measurement_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public reads app settings"
  ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins insert app settings"
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update app settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

-- 3. TRACKING POR PRODUTO ------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tracking_use_global boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS meta_pixel_id text,
  ADD COLUMN IF NOT EXISTS tiktok_pixel_id text,
  ADD COLUMN IF NOT EXISTS ga_measurement_id text;

-- 4. ATRIBUIÇÃO NOS PEDIDOS ---------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS visitor_id text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS first_utm_source text,
  ADD COLUMN IF NOT EXISTS first_utm_campaign text;

CREATE INDEX IF NOT EXISTS orders_created_status_idx ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_product_status_idx ON public.orders (product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_campaign_idx ON public.orders (utm_campaign);

-- 5. FUNÇÕES DE RELATÓRIO ------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_funnel(_from timestamptz, _to timestamptz)
RETURNS TABLE(product_views bigint, unique_visitors bigint, buy_clicks bigint, checkouts bigint, purchases bigint, revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM public.analytics_events e WHERE public.has_role(auth.uid(),'admin') AND e.event_name='product_view' AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(DISTINCT e.visitor_id) FROM public.analytics_events e WHERE public.has_role(auth.uid(),'admin') AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(*) FROM public.analytics_events e WHERE public.has_role(auth.uid(),'admin') AND e.event_name='click_buy' AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(*) FROM public.analytics_events e WHERE public.has_role(auth.uid(),'admin') AND e.event_name='begin_checkout' AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(*) FROM public.orders o WHERE public.has_role(auth.uid(),'admin') AND o.status='paid' AND o.created_at >= _from AND o.created_at < _to),
    (SELECT COALESCE(sum(o.amount),0) FROM public.orders o WHERE public.has_role(auth.uid(),'admin') AND o.status='paid' AND o.created_at >= _from AND o.created_at < _to);
$$;

CREATE OR REPLACE FUNCTION public.admin_revenue_breakdown(_from timestamptz, _to timestamptz)
RETURNS TABLE(gross numeric, refunded numeric, net numeric, cancelled_count bigint, refunded_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(sum(o.amount) FILTER (WHERE o.status='paid'),0),
    COALESCE(sum(o.amount) FILTER (WHERE o.status='refunded'),0),
    COALESCE(sum(o.amount) FILTER (WHERE o.status='paid'),0) - COALESCE(sum(o.amount) FILTER (WHERE o.status='refunded'),0),
    count(*) FILTER (WHERE o.status='cancelled'),
    count(*) FILTER (WHERE o.status='refunded')
  FROM public.orders o
  WHERE public.has_role(auth.uid(),'admin') AND o.created_at >= _from AND o.created_at < _to;
$$;

CREATE OR REPLACE FUNCTION public.admin_product_conversion(_from timestamptz, _to timestamptz)
RETURNS TABLE(product_id uuid, product_name text, slug text, views bigint, visitors bigint, buy_clicks bigint, checkouts bigint, orders_count bigint, revenue numeric, conversion numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ev AS (
    SELECT e.product_id,
           count(*) FILTER (WHERE e.event_name='product_view') AS views,
           count(DISTINCT e.visitor_id) FILTER (WHERE e.event_name='product_view') AS visitors,
           count(*) FILTER (WHERE e.event_name='click_buy') AS buy_clicks,
           count(*) FILTER (WHERE e.event_name='begin_checkout') AS checkouts
    FROM public.analytics_events e
    WHERE e.created_at >= _from AND e.created_at < _to AND e.product_id IS NOT NULL
    GROUP BY e.product_id
  ), ord AS (
    SELECT o.product_id, count(*) AS orders_count, COALESCE(sum(o.amount),0) AS revenue
    FROM public.orders o
    WHERE o.status='paid' AND o.created_at >= _from AND o.created_at < _to AND o.product_id IS NOT NULL
    GROUP BY o.product_id
  )
  SELECT p.id, p.name, p.slug,
         COALESCE(ev.views,0), COALESCE(ev.visitors,0), COALESCE(ev.buy_clicks,0), COALESCE(ev.checkouts,0),
         COALESCE(ord.orders_count,0), COALESCE(ord.revenue,0),
         CASE WHEN COALESCE(ev.views,0) > 0 THEN round((COALESCE(ord.orders_count,0)::numeric / ev.views) * 100, 2) ELSE 0 END
  FROM public.products p
  LEFT JOIN ev ON ev.product_id = p.id
  LEFT JOIN ord ON ord.product_id = p.id
  WHERE public.has_role(auth.uid(),'admin')
    AND (COALESCE(ev.views,0) > 0 OR COALESCE(ord.orders_count,0) > 0)
  ORDER BY COALESCE(ord.revenue,0) DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_traffic_daily(_from timestamptz, _to timestamptz, _tz text DEFAULT 'America/Sao_Paulo')
RETURNS TABLE(day date, visitors bigint, sessions bigint, product_views bigint, buy_clicks bigint, checkouts bigint, orders_count bigint, revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT generate_series((_from AT TIME ZONE _tz)::date, (_to AT TIME ZONE _tz)::date, interval '1 day')::date AS day
  ), ev AS (
    SELECT (e.created_at AT TIME ZONE _tz)::date AS day,
           count(DISTINCT e.visitor_id) AS visitors,
           count(DISTINCT e.session_id) AS sessions,
           count(*) FILTER (WHERE e.event_name='product_view') AS product_views,
           count(*) FILTER (WHERE e.event_name='click_buy') AS buy_clicks,
           count(*) FILTER (WHERE e.event_name='begin_checkout') AS checkouts
    FROM public.analytics_events e
    WHERE e.created_at >= _from AND e.created_at < _to
    GROUP BY 1
  ), ord AS (
    SELECT (o.created_at AT TIME ZONE _tz)::date AS day, count(*) AS orders_count, COALESCE(sum(o.amount),0) AS revenue
    FROM public.orders o
    WHERE o.status='paid' AND o.created_at >= _from AND o.created_at < _to
    GROUP BY 1
  )
  SELECT d.day, COALESCE(ev.visitors,0), COALESCE(ev.sessions,0), COALESCE(ev.product_views,0),
         COALESCE(ev.buy_clicks,0), COALESCE(ev.checkouts,0), COALESCE(ord.orders_count,0), COALESCE(ord.revenue,0)
  FROM days d
  LEFT JOIN ev ON ev.day = d.day
  LEFT JOIN ord ON ord.day = d.day
  WHERE public.has_role(auth.uid(),'admin')
  ORDER BY d.day;
$$;

CREATE OR REPLACE FUNCTION public.admin_product_funnel(_product_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(views bigint, visitors bigint, buy_clicks bigint, checkouts bigint, orders_count bigint, revenue numeric, rec_views bigint, rec_clicks bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*) FROM public.analytics_events e WHERE e.product_id=_product_id AND e.event_name='product_view' AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(DISTINCT e.visitor_id) FROM public.analytics_events e WHERE e.product_id=_product_id AND e.event_name='product_view' AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(*) FROM public.analytics_events e WHERE e.product_id=_product_id AND e.event_name='click_buy' AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(*) FROM public.analytics_events e WHERE e.product_id=_product_id AND e.event_name='begin_checkout' AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(*) FROM public.orders o WHERE o.product_id=_product_id AND o.status='paid' AND o.created_at >= _from AND o.created_at < _to),
    (SELECT COALESCE(sum(o.amount),0) FROM public.orders o WHERE o.product_id=_product_id AND o.status='paid' AND o.created_at >= _from AND o.created_at < _to),
    (SELECT count(*) FROM public.analytics_events e WHERE e.product_id=_product_id AND e.event_name='view_recommendation' AND e.created_at >= _from AND e.created_at < _to),
    (SELECT count(*) FROM public.analytics_events e WHERE e.product_id=_product_id AND e.event_name='click_recommendation' AND e.created_at >= _from AND e.created_at < _to)
  WHERE public.has_role(auth.uid(),'admin');
$$;

CREATE OR REPLACE FUNCTION public.admin_traffic_sources(_from timestamptz, _to timestamptz, _product_id uuid DEFAULT NULL)
RETURNS TABLE(source text, visitors bigint, views bigint, orders_count bigint, revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ev AS (
    SELECT COALESCE(NULLIF(lower(e.utm_source),''),
             CASE WHEN e.referrer IS NULL OR e.referrer = '' THEN 'direto'
                  ELSE regexp_replace(regexp_replace(lower(e.referrer), '^https?://', ''), '/.*$', '') END) AS source,
           e.visitor_id, e.event_name
    FROM public.analytics_events e
    WHERE e.created_at >= _from AND e.created_at < _to
      AND (_product_id IS NULL OR e.product_id = _product_id)
  ), agg AS (
    SELECT source, count(DISTINCT visitor_id) AS visitors, count(*) FILTER (WHERE event_name='product_view') AS views
    FROM ev GROUP BY source
  ), ord AS (
    SELECT COALESCE(NULLIF(lower(o.utm_source),''),'direto') AS source, count(*) AS orders_count, COALESCE(sum(o.amount),0) AS revenue
    FROM public.orders o
    WHERE o.status='paid' AND o.created_at >= _from AND o.created_at < _to
      AND (_product_id IS NULL OR o.product_id = _product_id)
    GROUP BY 1
  )
  SELECT COALESCE(agg.source, ord.source), COALESCE(agg.visitors,0), COALESCE(agg.views,0), COALESCE(ord.orders_count,0), COALESCE(ord.revenue,0)
  FROM agg FULL OUTER JOIN ord ON ord.source = agg.source
  WHERE public.has_role(auth.uid(),'admin')
  ORDER BY COALESCE(ord.revenue,0) DESC, COALESCE(agg.visitors,0) DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_campaigns(_from timestamptz, _to timestamptz)
RETURNS TABLE(campaign text, visitors bigint, views bigint, orders_count bigint, revenue numeric, conversion numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ev AS (
    SELECT COALESCE(NULLIF(e.utm_campaign,''),'(sem campanha)') AS campaign, e.visitor_id, e.event_name
    FROM public.analytics_events e
    WHERE e.created_at >= _from AND e.created_at < _to
  ), agg AS (
    SELECT campaign, count(DISTINCT visitor_id) AS visitors, count(*) FILTER (WHERE event_name='product_view') AS views
    FROM ev GROUP BY campaign
  ), ord AS (
    SELECT COALESCE(NULLIF(o.utm_campaign,''),'(sem campanha)') AS campaign, count(*) AS orders_count, COALESCE(sum(o.amount),0) AS revenue
    FROM public.orders o
    WHERE o.status='paid' AND o.created_at >= _from AND o.created_at < _to
    GROUP BY 1
  )
  SELECT COALESCE(agg.campaign, ord.campaign), COALESCE(agg.visitors,0), COALESCE(agg.views,0),
         COALESCE(ord.orders_count,0), COALESCE(ord.revenue,0),
         CASE WHEN COALESCE(agg.visitors,0) > 0 THEN round((COALESCE(ord.orders_count,0)::numeric / agg.visitors) * 100, 2) ELSE 0 END
  FROM agg FULL OUTER JOIN ord ON ord.campaign = agg.campaign
  WHERE public.has_role(auth.uid(),'admin')
  ORDER BY COALESCE(ord.revenue,0) DESC, COALESCE(agg.visitors,0) DESC;
$$;