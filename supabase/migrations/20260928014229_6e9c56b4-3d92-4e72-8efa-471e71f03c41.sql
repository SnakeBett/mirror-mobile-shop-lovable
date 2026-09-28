CREATE OR REPLACE FUNCTION public.is_active_product(_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND is_active = true)
$$;

CREATE OR REPLACE FUNCTION public.is_public_product_file(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.product_images i JOIN public.products p ON p.id=i.product_id AND p.is_active WHERE i.image_url=_name)
      OR EXISTS (SELECT 1 FROM public.reviews r JOIN public.products p ON p.id=r.product_id AND p.is_active WHERE r.image_url=_name AND r.is_active)
      OR EXISTS (SELECT 1 FROM public.product_attribute_values v JOIN public.products p ON p.id=v.product_id AND p.is_active WHERE v.image_url=_name)
      OR EXISTS (SELECT 1 FROM public.product_variants v JOIN public.products p ON p.id=v.product_id AND p.is_active WHERE v.image_url=_name AND v.is_active)
$$;

DROP POLICY IF EXISTS "public reads product details" ON public.product_details;
CREATE POLICY "public reads product details" ON public.product_details FOR SELECT TO anon, authenticated USING (public.is_active_product(product_id));
DROP POLICY IF EXISTS "public reads highlights" ON public.product_highlights;
CREATE POLICY "public reads highlights" ON public.product_highlights FOR SELECT TO anon, authenticated USING (public.is_active_product(product_id));
DROP POLICY IF EXISTS "public reads product images" ON public.product_images;
CREATE POLICY "public reads product images" ON public.product_images FOR SELECT TO anon, authenticated USING (public.is_active_product(product_id));
DROP POLICY IF EXISTS "public reads page settings" ON public.product_page_settings;
CREATE POLICY "public reads page settings" ON public.product_page_settings FOR SELECT TO anon, authenticated USING (public.is_active_product(product_id));
DROP POLICY IF EXISTS "public reads recommendations" ON public.product_recommendations;
CREATE POLICY "public reads recommendations" ON public.product_recommendations FOR SELECT TO anon, authenticated USING (public.is_active_product(product_id) AND public.is_active_product(recommended_product_id));
DROP POLICY IF EXISTS "public reads app settings" ON public.app_settings;
CREATE POLICY "public reads app settings" ON public.app_settings FOR SELECT TO anon, authenticated USING (singleton = true);

DROP POLICY IF EXISTS "read product image files" ON storage.objects;
CREATE POLICY "read product image files" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'admin') OR public.is_public_product_file(name)));