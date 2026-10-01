CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage categories" ON public.product_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX product_categories_parent_idx ON public.product_categories(parent_id);

ALTER TABLE public.products
  ADD COLUMN category_id uuid REFERENCES public.product_categories(id) ON DELETE RESTRICT,
  ADD COLUMN subcategory_id uuid REFERENCES public.product_categories(id) ON DELETE RESTRICT;
CREATE INDEX products_category_idx ON public.products(category_id);
CREATE INDEX products_subcategory_idx ON public.products(subcategory_id);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON public.orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_product_idx ON public.orders(product_id);

CREATE OR REPLACE FUNCTION public.admin_product_sales_by_category(_from timestamptz, _to timestamptz)
RETURNS TABLE(product_id uuid, product_name text, slug text, category_id uuid, subcategory_id uuid,
              sales bigint, revenue numeric, orders_total bigint, refunded numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.name, p.slug, p.category_id, p.subcategory_id,
    count(o.id) FILTER (WHERE o.status='paid'),
    COALESCE(sum(o.amount) FILTER (WHERE o.status='paid'),0),
    count(o.id),
    COALESCE(sum(o.amount) FILTER (WHERE o.status='refunded'),0)
  FROM public.products p
  JOIN public.orders o ON o.product_id = p.id AND o.created_at >= _from AND o.created_at < _to
  WHERE public.has_role(auth.uid(),'admin')
  GROUP BY p.id;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_product_sales_by_category(timestamptz, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_product_sales_by_category(timestamptz, timestamptz) TO authenticated;