REVOKE ALL ON FUNCTION public.admin_sales_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_sales_by_product(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_sales_daily(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_product_performance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.public_best_sellers(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_sales_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_by_product(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sales_daily(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_product_performance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_best_sellers(integer) TO anon, authenticated, service_role;