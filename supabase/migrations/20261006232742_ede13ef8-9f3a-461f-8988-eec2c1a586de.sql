CREATE TABLE public.review_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.review_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_images TO authenticated;
GRANT ALL ON public.review_images TO service_role;
ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;
CREATE INDEX review_images_review_idx ON public.review_images(review_id, sort_order);

CREATE OR REPLACE FUNCTION public.is_public_review(_review_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.reviews r JOIN public.products p ON p.id = r.product_id AND p.is_active
                 WHERE r.id = _review_id AND r.is_active)
$$;

CREATE POLICY "public reads review images" ON public.review_images FOR SELECT TO anon, authenticated
  USING (public.is_public_review(review_id));
CREATE POLICY "admins manage review images" ON public.review_images FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Fotos antigas passam a existir também na nova lista (a coluna antiga é mantida).
INSERT INTO public.review_images (review_id, image_url, sort_order)
SELECT id, image_url, 0 FROM public.reviews WHERE image_url IS NOT NULL AND image_url <> '';

CREATE OR REPLACE FUNCTION public.is_public_product_file(_name text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.product_images i JOIN public.products p ON p.id=i.product_id AND p.is_active WHERE i.image_url=_name)
      OR EXISTS (SELECT 1 FROM public.reviews r JOIN public.products p ON p.id=r.product_id AND p.is_active WHERE r.image_url=_name AND r.is_active)
      OR EXISTS (SELECT 1 FROM public.review_images ri JOIN public.reviews r ON r.id=ri.review_id AND r.is_active JOIN public.products p ON p.id=r.product_id AND p.is_active WHERE ri.image_url=_name)
      OR EXISTS (SELECT 1 FROM public.product_attribute_values v JOIN public.products p ON p.id=v.product_id AND p.is_active WHERE v.image_url=_name)
      OR EXISTS (SELECT 1 FROM public.product_variants v JOIN public.products p ON p.id=v.product_id AND p.is_active WHERE v.image_url=_name AND v.is_active)
$$;