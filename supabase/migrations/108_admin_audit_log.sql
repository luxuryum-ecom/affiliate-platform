-- =============================================================================
-- Migration 108 — Journal d'audit GLOBAL / traçabilité totale (LOT 1E)
-- =============================================================================
-- Objectif (décision Abdou) : tracer TOUTE action sensible de TOUTE personne
-- (personnel dépôt, agents, admin) de façon append-only ineffaçable — qui / quoi /
-- quand, + ancienne → nouvelle valeur.
--
-- DESIGN (sûr) : audit par TRIGGERS sur les tables sensibles (capture la mutation
-- quel que soit le chemin — RPC FSM, assignation, UPDATE direct — DANS la même
-- transaction) + helper log_admin_action() pour les événements applicatifs (login,
-- promotions). On NE réécrit AUCUNE RPC du cycle de vie (zéro risque argent/FSM).
--
-- PATRON RÉUTILISÉ : trigger d'immuabilité de staff_permission_audit (mig 083).
--
-- RÈGLES : 100% additif. RLS deny par défaut, lecture admin-only. Écriture seulement
-- via fonctions SECURITY DEFINER (jamais d'INSERT direct client). service_role
-- jamais exposé. AUCUNE logique financière touchée (montants/ledger/commissions).
-- Les changements de capacités restent tracés dans staff_permission_audit (mig 083).
-- =============================================================================


-- ── 1. Table append-only ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL, -- auth.uid() ; NULL = système/service_role
  actor_role   text,                                                          -- snapshot du rôle au moment de l'action
  action       text        NOT NULL,                                          -- ex. 'order_status_change', 'order_assign_agent', 'login', 'promote_to_agent'
  target_table text,
  target_id    text,
  old_value    jsonb,
  new_value    jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor   ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action  ON public.admin_audit_log (action, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Lecture admin-only. Aucune policy d'écriture → INSERT via fonctions definer seulement.
DROP POLICY IF EXISTS "admin_audit_log_admin_read" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_admin_read"
  ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');


-- ── 2. Immuabilité : UPDATE/DELETE rejetés pour TOUS (y compris definer/service_role) ──
CREATE OR REPLACE FUNCTION public.admin_audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log est append-only (ni UPDATE ni DELETE)';
END $$;

DROP TRIGGER IF EXISTS trg_admin_audit_log_immutable ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_immutable();


-- ── 3. Helper applicatif : log_admin_action (login, promotions, événements hors-table) ──
-- NON gaté admin-only : la traçabilité couvre TOUTE personne. auth.uid() est préservé
-- même appelé depuis une autre fonction SECURITY DEFINER. SECURITY DEFINER pour franchir
-- la RLS d'écriture de admin_audit_log.
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action       text,
  p_target_table text,
  p_target_id    text,
  p_old          jsonb,
  p_new          jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role  text;
BEGIN
  -- Allowlist d'actions (intégrité du journal) : un utilisateur authentifié ne
  -- peut pas injecter une action arbitraire / fabriquer de fausses entrées.
  -- (L'usurpation d'autrui est déjà impossible : actor_id = auth.uid() forcé.)
  IF p_action NOT IN (
    'login',
    'promote_to_agent',
    'order_status_change',
    'order_assign_agent',
    'order_assign_supplier',
    'cod_order_status_change'
  ) THEN
    RAISE EXCEPTION 'Action d''audit inconnue : %', p_action;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.admin_audit_log
    (actor_id, actor_role, action, target_table, target_id, old_value, new_value)
  VALUES (v_actor, v_role, p_action, p_target_table, p_target_id, p_old, p_new);
END $$;

REVOKE ALL ON FUNCTION public.log_admin_action(text, text, text, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb, jsonb) TO authenticated;


-- ── 4. Trigger d'audit des mutations sensibles (commandes) ────────────────────
-- AFTER UPDATE : n'INSÈRE une ligne d'audit QUE si une colonne sensible change.
-- SECURITY DEFINER (owner postgres → BYPASSRLS) pour écrire dans admin_audit_log.
-- auth.uid() = appelant (les RPC FSM/assignation et les UPDATE directs sont invoqués
-- via le client utilisateur → le JWT est préservé). NULL si write système/service_role.
CREATE OR REPLACE FUNCTION public.audit_sensitive_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role  text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = v_actor;

  IF TG_TABLE_NAME = 'wholesale_orders' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.admin_audit_log (actor_id, actor_role, action, target_table, target_id, old_value, new_value)
      VALUES (v_actor, v_role, 'order_status_change', 'wholesale_orders', NEW.id::text,
              jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    END IF;
    IF NEW.agent_id IS DISTINCT FROM OLD.agent_id THEN
      INSERT INTO public.admin_audit_log (actor_id, actor_role, action, target_table, target_id, old_value, new_value)
      VALUES (v_actor, v_role, 'order_assign_agent', 'wholesale_orders', NEW.id::text,
              jsonb_build_object('agent_id', OLD.agent_id), jsonb_build_object('agent_id', NEW.agent_id));
    END IF;
    IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
      INSERT INTO public.admin_audit_log (actor_id, actor_role, action, target_table, target_id, old_value, new_value)
      VALUES (v_actor, v_role, 'order_assign_supplier', 'wholesale_orders', NEW.id::text,
              jsonb_build_object('supplier_id', OLD.supplier_id), jsonb_build_object('supplier_id', NEW.supplier_id));
    END IF;

  ELSIF TG_TABLE_NAME = 'orders' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.admin_audit_log (actor_id, actor_role, action, target_table, target_id, old_value, new_value)
      VALUES (v_actor, v_role, 'cod_order_status_change', 'orders', NEW.id::text,
              jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_wholesale_orders ON public.wholesale_orders;
CREATE TRIGGER trg_audit_wholesale_orders
  AFTER UPDATE ON public.wholesale_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_change();

DROP TRIGGER IF EXISTS trg_audit_orders ON public.orders;
CREATE TRIGGER trg_audit_orders
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_change();
