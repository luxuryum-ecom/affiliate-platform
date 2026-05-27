-- =============================================================================
-- Migration: 002_product_image_storage
-- Project:   Affiliate + Wholesale Platform
-- Created:   Day 2 — Product Management
--
-- PURPOSE
-- -------
-- Sets up Supabase Storage for product images.
-- Admin can upload images; the public can read them.
--
-- PREREQUISITE — run ONCE manually in the Supabase dashboard:
-- ─────────────────────────────────────────────────────────────
--   1. Go to Supabase Dashboard → Storage → New Bucket
--   2. Bucket name : product-images
--   3. Public bucket: YES  (enables direct CDN URLs)
--   4. Max file size: 5 MB (recommended)
--   5. Allowed MIME types: image/jpeg, image/png, image/webp
--
-- THEN run the SQL below to add RLS policies on the bucket.
-- =============================================================================

-- Allow admins to upload product images
create policy "product-images: admin upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.my_role() = 'admin'
  );

-- Allow admins to replace (update) existing images
create policy "product-images: admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.my_role() = 'admin'
  );

-- Allow admins to delete product images
create policy "product-images: admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.my_role() = 'admin'
  );

-- Allow everyone (including anonymous users) to read product images
-- This is safe because the bucket is public and images are not sensitive.
create policy "product-images: public read"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- =============================================================================
-- USAGE IN THE APP
-- =============================================================================
--
-- Upload an image from a server action:
--
--   const supabase = await createClient()
--   const filename = `${Date.now()}-${file.name}`
--   const { data, error } = await supabase.storage
--     .from('product-images')
--     .upload(filename, file, { contentType: file.type, upsert: false })
--
--   const { data: urlData } = supabase.storage
--     .from('product-images')
--     .getPublicUrl(filename)
--
--   // urlData.publicUrl → store in products.images[]
--
-- For now (Day 2), product image URLs are entered manually in the admin form.
-- File upload support will be added in a future iteration.
-- =============================================================================
