-- =============================================================================
-- Migration 046 — RLS INSERT pour les grossistes sur order_proofs
-- (idempotent — safe to re-run)
-- =============================================================================

DROP POLICY IF EXISTS "proofs: buyers insert own wholesale proofs" ON public.order_proofs;
CREATE POLICY "proofs: buyers insert own wholesale proofs"
  ON public.order_proofs FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = related_wholesale_order_id
        AND wo.buyer_id = auth.uid()
    )
  );
