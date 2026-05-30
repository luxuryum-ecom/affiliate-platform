-- =============================================================================
-- Migration: 033_supplier_performance_and_issues (idempotent — safe to re-run)
-- Adds supplier_issues table for admin-internal issue tracking.
-- Performance metrics are computed at query time from supplier_quote_requests
-- and supplier_issues — no materialized view needed at this scale.
-- =============================================================================

-- ── 1. supplier_issues table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_issues (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  issue_type      text        NOT NULL
                  CHECK (issue_type IN (
                    'delay', 'quality_problem', 'wrong_quantity',
                    'communication_problem', 'other'
                  )),
  notes           text,
  -- Optional: number of days for delivery (used to compute avg_delivery_days).
  -- Fill for 'delay' issues or routine delivery confirmations.
  delivery_days   integer     CHECK (delivery_days > 0),
  created_by      uuid        REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_si_supplier_id  ON public.supplier_issues(supplier_id);
CREATE INDEX IF NOT EXISTS idx_si_issue_type   ON public.supplier_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_si_created_at   ON public.supplier_issues(created_at DESC);

-- ── 2. RLS — admin only (supplier and wholesaler must NOT see this table) ──────

ALTER TABLE public.supplier_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si: admin all" ON public.supplier_issues;
CREATE POLICY "si: admin all"
  ON public.supplier_issues FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');
