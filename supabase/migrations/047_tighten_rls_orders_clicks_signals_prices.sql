-- =============================================================================
-- Migration 047 — Tighten RLS: drop anon-permissive policies on four tables
-- (idempotent — safe to re-run)
-- =============================================================================
-- Context: the four paths below are handled exclusively by server actions using
-- createAdminClient() (service_role, server-side only). PostgREST never evaluates
-- these paths under the `anon` role anymore, so the permissive anon policies are
-- no longer needed and are removed to harden the surface.
--
-- Removed policies (source migrations):
--   004 — "orders: anon insert"          → placeOrder()       uses service_role
--   009 — "clicks: anon insert"          → recordAffiliateClick() uses service_role
--   009 — "signals: service insert"      → placeOrder()       uses service_role
--   011 — "aff_prices: anon read"        → product page + placeOrder() use service_role
--
-- All authenticated / admin / affiliate-manage-own policies are left untouched.
-- =============================================================================

DROP POLICY IF EXISTS "orders: anon insert"     ON public.orders;
DROP POLICY IF EXISTS "clicks: anon insert"     ON public.affiliate_clicks;
DROP POLICY IF EXISTS "signals: service insert" ON public.order_signals;
DROP POLICY IF EXISTS "aff_prices: anon read"   ON public.affiliate_product_prices;
