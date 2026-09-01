-- ============ ORDERS ============
DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_order_id text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'pending',
  customer_name text,
  customer_email text,
  payment_method text,
  is_test boolean NOT NULL DEFAULT false,
  metadata jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_external_order_id_key UNIQUE (external_order_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS orders_product_id_idx ON public.orders (product_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_paid_status_created_idx ON public.orders (status, created_at DESC);

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RECOMMENDATIONS ============
CREATE TABLE IF NOT EXISTS public.product_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommended_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_recommendations_unique UNIQUE (product_id, recommended_product_id),
  CONSTRAINT product_recommendations_not_self CHECK (product_id <> recommended_product_id)
);

GRANT SELECT ON public.product_recommendations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_recommendations TO authenticated;
GRANT ALL ON public.product_recommendations TO service_role;

ALTER TABLE public.product_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public reads recommendations" ON public.product_recommendations
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admins manage recommendations" ON public.product_recommendations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS product_recommendations_product_idx
  ON public.product_recommendations (product_id, sort_order);

-- ============ SETTINGS / DISPLAY FIELD ============
ALTER TABLE public.product_page_settings
  ADD COLUMN IF NOT EXISTS recommendation_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sales_count_display text;

-- ============ ADMIN ANALYTICS FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.admin_sales_summary(_from timestamptz, _to timestamptz)
RETURNS TABLE (orders_count bigint, revenue numeric, avg_ticket numeric, top_product_id uuid, top_product_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH paid AS (
    SELECT o.* FROM public.orders o
    WHERE public.has_role(auth.uid(), 'admin')
      AND o.status = 'paid'
      AND o.created_at >= _from AND o.created_at < _to
  ), top AS (
    SELECT p.product_id, pr.name, count(*) AS c
    FROM paid p LEFT JOIN public.products pr ON pr.id = p.product_id
    GROUP BY p.product_id, pr.name ORDER BY c DESC LIMIT 1
  )
  SELECT (SELECT count(*) FROM paid),
         COALESCE((SELECT sum(amount) FROM paid), 0),
         COALESCE((SELECT avg(amount) FROM paid), 0),
         (SELECT product_id FROM top),
         (SELECT name FROM top);
$$;

CREATE OR REPLACE FUNCTION public.admin_sales_by_product(_from timestamptz, _to timestamptz)
RETURNS TABLE (product_id uuid, product_name text, slug text, orders_count bigint, revenue numeric, avg_ticket numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.product_id, pr.name, pr.slug, count(*), COALESCE(sum(o.amount), 0), COALESCE(avg(o.amount), 0)
  FROM public.orders o
  LEFT JOIN public.products pr ON pr.id = o.product_id
  WHERE public.has_role(auth.uid(), 'admin')
    AND o.status = 'paid'
    AND o.created_at >= _from AND o.created_at < _to
  GROUP BY o.product_id, pr.name, pr.slug
  ORDER BY count(*) DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_sales_daily(_from timestamptz, _to timestamptz)
RETURNS TABLE (day date, orders_count bigint, revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
         count(*), COALESCE(sum(o.amount), 0)
  FROM public.orders o
  WHERE public.has_role(auth.uid(), 'admin')
    AND o.status = 'paid'
    AND o.created_at >= _from AND o.created_at < _to
  GROUP BY 1 ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_product_performance(_product_id uuid)
RETURNS TABLE (orders_total bigint, revenue_total numeric, orders_7d bigint, revenue_7d numeric, orders_30d bigint, revenue_30d numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*),
         COALESCE(sum(amount), 0),
         count(*) FILTER (WHERE created_at >= now() - interval '7 days'),
         COALESCE(sum(amount) FILTER (WHERE created_at >= now() - interval '7 days'), 0),
         count(*) FILTER (WHERE created_at >= now() - interval '30 days'),
         COALESCE(sum(amount) FILTER (WHERE created_at >= now() - interval '30 days'), 0)
  FROM public.orders
  WHERE public.has_role(auth.uid(), 'admin')
    AND status = 'paid'
    AND product_id = _product_id;
$$;

-- Ranking público (sem valores financeiros) para recomendação "mais vendidos".
CREATE OR REPLACE FUNCTION public.public_best_sellers(_limit integer DEFAULT 12)
RETURNS TABLE (product_id uuid, orders_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.product_id, count(*)
  FROM public.orders o
  JOIN public.products p ON p.id = o.product_id AND p.is_active = true
  WHERE o.status = 'paid'
  GROUP BY o.product_id
  ORDER BY count(*) DESC
  LIMIT GREATEST(COALESCE(_limit, 12), 1);
$$;

REVOKE ALL ON FUNCTION public.admin_sales_summary(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.admin_sales_by_product(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.admin_sales_daily(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.admin_product_performance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_by_product(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_daily(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_product_performance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_best_sellers(integer) TO anon, authenticated, service_role;