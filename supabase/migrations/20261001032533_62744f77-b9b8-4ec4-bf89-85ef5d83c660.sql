DROP POLICY IF EXISTS "read product image files" ON storage.objects;
CREATE POLICY "read product image files" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'product-images' AND (public.is_public_product_file(name) OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'))));
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;