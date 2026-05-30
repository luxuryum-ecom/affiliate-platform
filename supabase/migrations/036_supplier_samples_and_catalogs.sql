-- =============================================================================
-- Migration: 036_supplier_samples_and_catalogs (idempotent — safe to re-run)
-- Supplier catalog upload, per-product attachments, sample request workflow.
-- Identity rule: supplier name/company/contact NEVER exposed to wholesalers.
-- =============================================================================

-- ── 1. Storage buckets (public=false — all access via signed URLs or RLS) ─────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-catalogs',
  'supplier-catalogs',
  false,
  52428800, -- 50 MB
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip','application/x-zip-compressed']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-attachments',
  'supplier-attachments',
  false,
  104857600, -- 100 MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sample-files',
  'sample-files',
  false,
  104857600, -- 100 MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
) ON CONFLICT (id) DO NOTHING;

-- ── 2. Storage RLS — supplier-catalogs ────────────────────────────────────────

DROP POLICY IF EXISTS "sc: supplier upload own" ON storage.objects;
CREATE POLICY "sc: supplier upload own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-catalogs'
    AND public.my_role() = 'supplier'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "sc: supplier read own" ON storage.objects;
CREATE POLICY "sc: supplier read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-catalogs'
    AND (public.my_role() = 'admin' OR (storage.foldername(name))[1] = auth.uid()::text)
  );

DROP POLICY IF EXISTS "sc: admin all" ON storage.objects;
CREATE POLICY "sc: admin all"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'supplier-catalogs' AND public.my_role() = 'admin')
  WITH CHECK (bucket_id = 'supplier-catalogs' AND public.my_role() = 'admin');

-- ── 3. Storage RLS — supplier-attachments ─────────────────────────────────────

DROP POLICY IF EXISTS "sa: supplier upload" ON storage.objects;
CREATE POLICY "sa: supplier upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-attachments'
    AND public.my_role() = 'supplier'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "sa: read approved" ON storage.objects;
CREATE POLICY "sa: read approved"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-attachments'
    AND (
      public.my_role() = 'admin'
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR public.my_role() = 'wholesaler'
    )
  );

DROP POLICY IF EXISTS "sa: admin all" ON storage.objects;
CREATE POLICY "sa: admin all"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'supplier-attachments' AND public.my_role() = 'admin')
  WITH CHECK (bucket_id = 'supplier-attachments' AND public.my_role() = 'admin');

-- ── 4. Storage RLS — sample-files ─────────────────────────────────────────────

DROP POLICY IF EXISTS "sf: supplier upload" ON storage.objects;
CREATE POLICY "sf: supplier upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sample-files'
    AND public.my_role() IN ('supplier', 'admin')
  );

DROP POLICY IF EXISTS "sf: read" ON storage.objects;
CREATE POLICY "sf: read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'sample-files'
    AND public.my_role() IN ('supplier', 'admin', 'wholesaler')
  );

DROP POLICY IF EXISTS "sf: admin all" ON storage.objects;
CREATE POLICY "sf: admin all"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'sample-files' AND public.my_role() = 'admin')
  WITH CHECK (bucket_id = 'sample-files' AND public.my_role() = 'admin');

-- ── 5. supplier_catalogs ──────────────────────────────────────────────────────
-- Company-level catalogs uploaded by supplier. Admin-only + supplier-own.
-- Wholesalers NEVER see these (no wholesaler RLS).

CREATE TABLE IF NOT EXISTS public.supplier_catalogs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filename      text        NOT NULL,
  storage_path  text        NOT NULL,
  file_type     text        NOT NULL CHECK (file_type IN ('pdf', 'xlsx', 'zip')),
  file_size     bigint,
  admin_status  text        NOT NULL DEFAULT 'pending'
                CHECK (admin_status IN ('pending', 'approved', 'rejected')),
  admin_notes   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scat_supplier_id ON public.supplier_catalogs(supplier_id);
CREATE INDEX IF NOT EXISTS idx_scat_status      ON public.supplier_catalogs(admin_status);

ALTER TABLE public.supplier_catalogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scat: supplier own" ON public.supplier_catalogs;
CREATE POLICY "scat: supplier own"
  ON public.supplier_catalogs FOR ALL TO authenticated
  USING  (supplier_id = auth.uid() AND public.my_role() = 'supplier')
  WITH CHECK (supplier_id = auth.uid() AND public.my_role() = 'supplier');

DROP POLICY IF EXISTS "scat: admin all" ON public.supplier_catalogs;
CREATE POLICY "scat: admin all"
  ON public.supplier_catalogs FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── 6. supplier_product_attachments ──────────────────────────────────────────
-- Per-product attachments: pdf datasheet, catalog, images, videos.
-- Wholesalers can read APPROVED attachments for APPROVED products.

CREATE TABLE IF NOT EXISTS public.supplier_product_attachments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id uuid        NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  filename            text        NOT NULL,
  storage_path        text        NOT NULL,
  attachment_type     text        NOT NULL
                      CHECK (attachment_type IN ('pdf_datasheet', 'pdf_catalog', 'image', 'video')),
  file_size           bigint,
  admin_status        text        NOT NULL DEFAULT 'pending'
                      CHECK (admin_status IN ('pending', 'approved', 'rejected')),
  admin_notes         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spa_product_id ON public.supplier_product_attachments(supplier_product_id);
CREATE INDEX IF NOT EXISTS idx_spa_type       ON public.supplier_product_attachments(attachment_type);
CREATE INDEX IF NOT EXISTS idx_spa_status     ON public.supplier_product_attachments(admin_status);

ALTER TABLE public.supplier_product_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spa: supplier own" ON public.supplier_product_attachments;
CREATE POLICY "spa: supplier own"
  ON public.supplier_product_attachments FOR ALL TO authenticated
  USING (
    public.my_role() = 'supplier'
    AND EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.supplier_id = auth.uid()
    )
  )
  WITH CHECK (
    public.my_role() = 'supplier'
    AND EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.supplier_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "spa: admin all" ON public.supplier_product_attachments;
CREATE POLICY "spa: admin all"
  ON public.supplier_product_attachments FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "spa: wholesaler read approved" ON public.supplier_product_attachments;
CREATE POLICY "spa: wholesaler read approved"
  ON public.supplier_product_attachments FOR SELECT TO authenticated
  USING (
    public.my_role() = 'wholesaler'
    AND admin_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.approval_status = 'approved'
    )
  );

-- ── 7. sample_requests ───────────────────────────────────────────────────────
-- Wholesaler requests sample/photos/video/tech sheet from marketplace product.
-- Supplier sees request type/message but NOT buyer identity.

CREATE TABLE IF NOT EXISTS public.sample_requests (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supplier_product_id uuid        NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  request_type        text        NOT NULL
                      CHECK (request_type IN ('sample', 'photos', 'video', 'technical_sheet')),
  message             text,
  status              text        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'supplier_reply', 'approved', 'rejected', 'shipped', 'delivered')),
  admin_notes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srq_wholesaler_id       ON public.sample_requests(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_srq_supplier_product_id ON public.sample_requests(supplier_product_id);
CREATE INDEX IF NOT EXISTS idx_srq_status              ON public.sample_requests(status);
CREATE INDEX IF NOT EXISTS idx_srq_created_at          ON public.sample_requests(created_at DESC);

DROP TRIGGER IF EXISTS trg_sample_requests_updated_at ON public.sample_requests;
CREATE TRIGGER trg_sample_requests_updated_at
  BEFORE UPDATE ON public.sample_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.sample_requests ENABLE ROW LEVEL SECURITY;

-- Wholesaler: own rows only
DROP POLICY IF EXISTS "srq: wholesaler own" ON public.sample_requests;
CREATE POLICY "srq: wholesaler own"
  ON public.sample_requests FOR ALL TO authenticated
  USING  (wholesaler_id = auth.uid() AND public.my_role() = 'wholesaler')
  WITH CHECK (wholesaler_id = auth.uid() AND public.my_role() = 'wholesaler');

-- Supplier: read requests for their products — buyer identity NOT exposed (no join to profiles.wholesaler_id)
DROP POLICY IF EXISTS "srq: supplier read own products" ON public.sample_requests;
CREATE POLICY "srq: supplier read own products"
  ON public.sample_requests FOR SELECT TO authenticated
  USING (
    public.my_role() = 'supplier'
    AND EXISTS (
      SELECT 1 FROM public.supplier_products sp
      WHERE sp.id = supplier_product_id AND sp.supplier_id = auth.uid()
    )
  );

-- Admin: full access
DROP POLICY IF EXISTS "srq: admin all" ON public.sample_requests;
CREATE POLICY "srq: admin all"
  ON public.sample_requests FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── 8. sample_request_files ───────────────────────────────────────────────────
-- Files uploaded in response to a sample request.
-- Supplier uploads → admin reviews → wholesaler sees only approved files.

CREATE TABLE IF NOT EXISTS public.sample_request_files (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_request_id uuid        NOT NULL REFERENCES public.sample_requests(id) ON DELETE CASCADE,
  uploader_role     text        NOT NULL CHECK (uploader_role IN ('supplier', 'admin')),
  filename          text        NOT NULL,
  storage_path      text        NOT NULL,
  file_type         text        NOT NULL CHECK (file_type IN ('image', 'video', 'pdf')),
  file_size         bigint,
  admin_approved    boolean     NOT NULL DEFAULT false,
  admin_notes       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_srf_request_id ON public.sample_request_files(sample_request_id);
CREATE INDEX IF NOT EXISTS idx_srf_approved   ON public.sample_request_files(admin_approved);

ALTER TABLE public.sample_request_files ENABLE ROW LEVEL SECURITY;

-- Supplier: insert + read for their own requests
DROP POLICY IF EXISTS "srf: supplier insert" ON public.sample_request_files;
CREATE POLICY "srf: supplier insert"
  ON public.sample_request_files FOR INSERT TO authenticated
  WITH CHECK (
    uploader_role = 'supplier'
    AND public.my_role() = 'supplier'
    AND EXISTS (
      SELECT 1 FROM public.sample_requests sr
      JOIN public.supplier_products sp ON sp.id = sr.supplier_product_id
      WHERE sr.id = sample_request_id AND sp.supplier_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "srf: supplier read own" ON public.sample_request_files;
CREATE POLICY "srf: supplier read own"
  ON public.sample_request_files FOR SELECT TO authenticated
  USING (
    public.my_role() = 'supplier'
    AND EXISTS (
      SELECT 1 FROM public.sample_requests sr
      JOIN public.supplier_products sp ON sp.id = sr.supplier_product_id
      WHERE sr.id = sample_request_id AND sp.supplier_id = auth.uid()
    )
  );

-- Wholesaler: read only admin_approved files for own requests
DROP POLICY IF EXISTS "srf: wholesaler read approved" ON public.sample_request_files;
CREATE POLICY "srf: wholesaler read approved"
  ON public.sample_request_files FOR SELECT TO authenticated
  USING (
    public.my_role() = 'wholesaler'
    AND admin_approved = true
    AND EXISTS (
      SELECT 1 FROM public.sample_requests sr
      WHERE sr.id = sample_request_id AND sr.wholesaler_id = auth.uid()
    )
  );

-- Admin: full access
DROP POLICY IF EXISTS "srf: admin all" ON public.sample_request_files;
CREATE POLICY "srf: admin all"
  ON public.sample_request_files FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');
