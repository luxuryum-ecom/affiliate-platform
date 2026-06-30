-- =============================================================================
-- Migration 110 — Assignation des commandes COD à un agent (LOT 1F)
-- =============================================================================
-- Le B2B grossiste a déjà l'assignation (assign_wholesale_order_atomic, mig 061 →
-- wholesale_orders.agent_id). Le COD (table `orders`) ne l'avait pas. On ajoute le
-- strict équivalent : colonne d'assignation + RPC atomique gardé + audit.
--
-- DÉCISIONS (alignées sur le patron B2B et la décision Abdou) :
--  - Assignation ORTHOGONALE au statut COD : on ne touche JAMAIS `status` ni aucune
--    colonne financière (cod_*, commission, snapshots). « Qui traite » ≠ cycle de vie.
--  - Garde réutilisée telle quelle : `can_assign_orders(uid)` (mig 107) = admin OU
--    casier `assign_orders`. Le pouvoir de DÉLÉGUER le casier reste admin-only (mig 107),
--    inchangé ici : un agent avec `assign_orders` EXÉCUTE mais ne distribue pas les casiers.
--  - Protection PII (patron B2B IMP-1) : l'assignee doit être agent/admin — interdit
--    d'assigner un wholesaler/affiliate qui hériterait d'un accès aux PII client COD.
--  - Audit (LOT 1E) : extension ADDITIVE du trigger `audit_sensitive_change` → action
--    `order_assign_agent` sur `target_table='orders'` quand `assigned_to` change.
--
-- RÈGLES : 100% additif et réversible. RLS de `orders` INCHANGÉE. Aucune logique
-- financière touchée. RPC SECURITY DEFINER, garde DB autoritaire. service_role jamais
-- exposé. La colonne est nullable (commandes existantes = non assignées).
-- =============================================================================


-- ── 1. Colonne d'assignation sur orders (additive, nullable) ─────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- Index de lecture « commandes d'un agent » (partiel : seules les assignées).
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to
  ON public.orders (assigned_to) WHERE assigned_to IS NOT NULL;


-- ── 2. RPC atomique d'assignation COD (calque assign_wholesale_order_atomic) ──
-- Garde can_assign_orders + verrou FOR UPDATE + validation rôle assignee + idempotence.
-- N'écrit QUE assigned_to/assigned_at. Ne touche NI status NI aucune colonne financière.
CREATE OR REPLACE FUNCTION public.assign_cod_order_atomic(
  p_order_id  uuid,
  p_assignee  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid    uuid := auth.uid();
  v_assignee_role text;
  v_current       uuid;
BEGIN
  -- Garde de permission (autorité DB) : admin OU casier assign_orders.
  IF NOT public.can_assign_orders(v_caller_uid) THEN
    RAISE EXCEPTION 'errors.forbidden_assign_orders';
  END IF;

  -- Protection PII : l'assignee doit être agent ou admin (jamais wholesaler/affiliate).
  SELECT role INTO v_assignee_role FROM public.profiles WHERE id = p_assignee;
  IF v_assignee_role IS NULL OR v_assignee_role NOT IN ('agent', 'admin') THEN
    RAISE EXCEPTION 'errors.assignee_not_found';
  END IF;

  -- Verrou : sérialise les assignations concurrentes sur la même commande.
  SELECT assigned_to INTO v_current FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- Idempotence : même agent déjà assigné → no-op (pas d'écriture, pas d'audit).
  IF v_current IS NOT DISTINCT FROM p_assignee THEN
    RETURN;
  END IF;

  -- UPDATE étroit : uniquement l'assignation. AUCUNE colonne financière ni statut.
  UPDATE public.orders
     SET assigned_to = p_assignee,
         assigned_at = now()
   WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.assign_cod_order_atomic(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_cod_order_atomic(uuid, uuid) TO authenticated;


-- ── 3. Audit (LOT 1E) — extension ADDITIVE du trigger des commandes ──────────
-- On réécrit audit_sensitive_change à l'IDENTIQUE de la mig 108 + UNE branche :
-- orders.assigned_to changé → action 'order_assign_agent' sur target_table='orders'.
-- (Branches wholesale_orders et orders.status conservées verbatim.)
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
    -- LOT 1F : assignation COD à un agent.
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.admin_audit_log (actor_id, actor_role, action, target_table, target_id, old_value, new_value)
      VALUES (v_actor, v_role, 'order_assign_agent', 'orders', NEW.id::text,
              jsonb_build_object('assigned_to', OLD.assigned_to), jsonb_build_object('assigned_to', NEW.assigned_to));
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- Triggers inchangés (déjà posés mig 108) — re-déclarés par sécurité (idempotent).
DROP TRIGGER IF EXISTS trg_audit_orders ON public.orders;
CREATE TRIGGER trg_audit_orders
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_change();
