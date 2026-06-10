-- Migration 042: Align wholesale cart/order buyer RLS with wholesale_access entitlement
-- Fixes DB-1: affiliates/suppliers with wholesale_access could use /wholesale/* in the app
-- but RLS required my_role() = 'wholesaler' for cart writes and order creation.

-- ── Helper: approved wholesaler OR wholesale_access ─────────────────────────

CREATE OR REPLACE FUNCTION public.has_wholesale_buyer_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'approved'
      AND (
        p.role = 'wholesaler'
        OR p.wholesale_access = true
      )
  );
$$;

COMMENT ON FUNCTION public.has_wholesale_buyer_access() IS
  'True when auth user is approved and is a wholesaler or has wholesale_access.';

-- ── wholesale_cart_items (insert / update / delete) ───────────────────────────
-- SELECT unchanged: buyer_id = auth.uid() OR admin (migration 001).

DROP POLICY IF EXISTS "cart: wholesalers insert" ON public.wholesale_cart_items;
CREATE POLICY "cart: wholesalers insert"
  ON public.wholesale_cart_items FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND public.has_wholesale_buyer_access()
  );

DROP POLICY IF EXISTS "cart: wholesalers update own" ON public.wholesale_cart_items;
CREATE POLICY "cart: wholesalers update own"
  ON public.wholesale_cart_items FOR UPDATE TO authenticated
  USING (
    buyer_id = auth.uid()
    AND public.has_wholesale_buyer_access()
  )
  WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "cart: wholesalers delete own" ON public.wholesale_cart_items;
CREATE POLICY "cart: wholesalers delete own"
  ON public.wholesale_cart_items FOR DELETE TO authenticated
  USING (
    buyer_id = auth.uid()
    AND public.has_wholesale_buyer_access()
  );

-- ── wholesale_orders (buyer insert) ───────────────────────────────────────────
-- SELECT / UPDATE unchanged. wholesale_order_items insert checks buyer_id on parent order.

DROP POLICY IF EXISTS "wholesale_orders: buyers insert" ON public.wholesale_orders;
CREATE POLICY "wholesale_orders: buyers insert"
  ON public.wholesale_orders FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND public.has_wholesale_buyer_access()
  );
