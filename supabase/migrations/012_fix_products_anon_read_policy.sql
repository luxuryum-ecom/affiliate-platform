-- =============================================================================
-- Migration 012 — Ensure anon read policy on products table
-- (idempotent — safe to re-run)
-- =============================================================================
-- /products/[id] is a public page that runs without an authenticated session.
-- Without an anon SELECT policy, RLS blocks all reads and the page returns 404.
-- Migration 004 defined this policy, but if it was never applied to the project
-- this migration guarantees it exists.
-- =============================================================================

DROP POLICY IF EXISTS "products: anon read active" ON public.products;
CREATE POLICY "products: anon read active"
  ON public.products FOR SELECT TO anon
  USING (active = true AND approval_status = 'approved');
