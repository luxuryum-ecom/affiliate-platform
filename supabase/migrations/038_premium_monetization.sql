-- ─── 038 PREMIUM MONETIZATION ───────────────────────────────────────────────
-- Adds supplier subscription plans, per-supplier subscriptions,
-- and a revenue audit log for admin billing management.
-- All operations are idempotent (IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE).

-- ── 1. premium_plans — platform-defined subscription tiers ───────────────────

CREATE TABLE IF NOT EXISTS premium_plans (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     text NOT NULL UNIQUE,
  name                     text NOT NULL,
  price_mad_monthly        numeric(10,2) NOT NULL DEFAULT 0,
  max_products             int  NOT NULL DEFAULT 5,            -- NULL = unlimited
  rfq_priority_boost       int  NOT NULL DEFAULT 0,            -- added to score (0–40)
  featured_badge           boolean NOT NULL DEFAULT false,      -- shown in marketplace
  verified_badge           boolean NOT NULL DEFAULT false,      -- credibility signal
  full_analytics           boolean NOT NULL DEFAULT false,      -- advanced analytics page
  priority_support         boolean NOT NULL DEFAULT false,
  description              text,
  active                   boolean NOT NULL DEFAULT true,
  display_order            int  NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- Seed the three canonical plans (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO premium_plans
  (slug, name, price_mad_monthly, max_products, rfq_priority_boost, featured_badge, verified_badge, full_analytics, priority_support, description, display_order)
VALUES
  ('free',         'Gratuit',       0,    5,  0,  false, false, false, false, 'Accès de base — jusqu''à 5 produits soumis.',                             0),
  ('professional', 'Professionnel', 500,  50, 20, true,  false, true,  false, 'Jusqu''à 50 produits, badge Vedette, boost RFQ +20 pts, analytiques.',    1),
  ('enterprise',   'Entreprise',    1500, 0,  40, true,  true,  true,  true,  'Produits illimités, badge Vérifié, boost RFQ +40 pts, support prioritaire.', 2)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. supplier_subscriptions — per-supplier plan assignment ─────────────────

CREATE TABLE IF NOT EXISTS supplier_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id      uuid NOT NULL REFERENCES premium_plans(id),
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'expired', 'cancelled', 'trial')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,                    -- NULL = open-ended (manually managed)
  notes        text,                           -- admin billing notes
  assigned_by  uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id)                         -- one active plan per supplier
);

-- ── 3. subscription_audit_log — audit trail for plan changes ─────────────────

CREATE TABLE IF NOT EXISTS subscription_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  old_plan_slug  text,
  new_plan_slug  text NOT NULL,
  old_status     text,
  new_status     text NOT NULL,
  changed_by     uuid REFERENCES profiles(id),
  notes          text,
  changed_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 4. updated_at trigger for supplier_subscriptions ─────────────────────────

DROP TRIGGER IF EXISTS set_updated_at_supplier_subscriptions ON supplier_subscriptions;
CREATE TRIGGER set_updated_at_supplier_subscriptions
  BEFORE UPDATE ON supplier_subscriptions
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE premium_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_audit_log ENABLE ROW LEVEL SECURITY;

-- premium_plans — public read (suppliers and wholesalers can view plan tiers)
DROP POLICY IF EXISTS "premium_plans_read_all"  ON premium_plans;
CREATE POLICY "premium_plans_read_all"
  ON premium_plans FOR SELECT USING (true);

DROP POLICY IF EXISTS "premium_plans_admin_write" ON premium_plans;
CREATE POLICY "premium_plans_admin_write"
  ON premium_plans FOR ALL USING (my_role() = 'admin');

-- supplier_subscriptions — admin full access + supplier reads own row
DROP POLICY IF EXISTS "subscriptions_admin_all"    ON supplier_subscriptions;
CREATE POLICY "subscriptions_admin_all"
  ON supplier_subscriptions FOR ALL USING (my_role() = 'admin');

DROP POLICY IF EXISTS "subscriptions_supplier_read" ON supplier_subscriptions;
CREATE POLICY "subscriptions_supplier_read"
  ON supplier_subscriptions FOR SELECT
  USING (supplier_id = auth.uid());

-- subscription_audit_log — admin only
DROP POLICY IF EXISTS "sub_audit_admin_all" ON subscription_audit_log;
CREATE POLICY "sub_audit_admin_all"
  ON subscription_audit_log FOR ALL USING (my_role() = 'admin');

DROP POLICY IF EXISTS "sub_audit_supplier_read" ON subscription_audit_log;
CREATE POLICY "sub_audit_supplier_read"
  ON subscription_audit_log FOR SELECT
  USING (supplier_id = auth.uid());

-- ── 6. Helper function: get_supplier_plan(uid) ────────────────────────────────
-- Returns the active plan slug for a supplier (defaults to 'free').
-- Used in application logic and RFQ matching boost.

CREATE OR REPLACE FUNCTION get_supplier_plan(p_supplier_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT pp.slug
      FROM supplier_subscriptions ss
      JOIN premium_plans pp ON pp.id = ss.plan_id
      WHERE ss.supplier_id = p_supplier_id
        AND ss.status = 'active'
        AND (ss.expires_at IS NULL OR ss.expires_at > now())
      LIMIT 1
    ),
    'free'
  );
$$;

-- ── 7. Auto-expire subscriptions (function called by admin action) ────────────
-- No background job — admin triggers expiry via UI action.

-- ── 8. Indexes for performance ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_supplier_subscriptions_supplier
  ON supplier_subscriptions (supplier_id);

CREATE INDEX IF NOT EXISTS idx_supplier_subscriptions_status
  ON supplier_subscriptions (status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_subscription_audit_supplier
  ON subscription_audit_log (supplier_id, changed_at DESC);
