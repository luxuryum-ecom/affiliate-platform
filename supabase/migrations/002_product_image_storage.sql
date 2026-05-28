-- =============================================================================
-- Migration: 002_product_image_storage  (idempotent — safe to re-run)
-- =============================================================================
-- Sets up Supabase Storage RLS policies for the product-images bucket.
-- Bucket must be created manually in the Supabase dashboard (public, 5 MB, images).
-- =============================================================================

DROP POLICY IF EXISTS "product-images: admin upload" ON storage.objects;
CREATE POLICY "product-images: admin upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.my_role() = 'admin'
  );

DROP POLICY IF EXISTS "product-images: admin update" ON storage.objects;
CREATE POLICY "product-images: admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.my_role() = 'admin'
  );

DROP POLICY IF EXISTS "product-images: admin delete" ON storage.objects;
CREATE POLICY "product-images: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.my_role() = 'admin'
  );

DROP POLICY IF EXISTS "product-images: public read" ON storage.objects;
CREATE POLICY "product-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');
