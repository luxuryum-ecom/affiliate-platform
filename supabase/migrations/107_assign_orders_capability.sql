-- =============================================================================
-- Migration 107 — Capacité « assign_orders » + rebranchement can_assign_orders
-- =============================================================================
-- Objectif (LOT 1G) :
--   1. Ajouter la capacité modulable `assign_orders` (volet Commandes) au système
--      staff_permissions (mig 083) → exposable comme casier dans /admin/permissions.
--   2. Rebrancher `can_assign_orders(uid)` sur staff_permissions au lieu de la table
--      `team_members` (mig 058), qui est une coquille morte (jamais peuplée, sans UI
--      ni RPC d'écriture). On déprécie ainsi team_members pour l'assignation.
--
-- PÉRIMÈTRE (même patron que mig 086/087/092/106) :
--   1. Étendre la contrainte CHECK staff_permissions_capability_known (DROP + ADD)
--   2. Étendre l'allowlist en dur de grant_staff_permission (CREATE OR REPLACE)
--   3. CREATE OR REPLACE can_assign_orders : admin OR staff_permissions('assign_orders')
--
-- RÈGLES RESPECTÉES :
--   - 100 % additif / idempotent (DROP IF EXISTS, CREATE OR REPLACE)
--   - CHECK = sur-ensemble exact de mig 106 → lignes existantes intactes
--   - can_assign_orders garde sa signature (uid uuid) → les appelants existants
--     (assign_wholesale_order_atomic mig 061, assignSupplierToOrder) sont inchangés.
--   - Audit immuable staff_permission_audit, gate admin, REVOKE/GRANT : INCHANGÉS.
--   - Aucune logique financière, aucun montant, aucune table ledger.
--   - service_role jamais exposé au client. Contrôle d'accès uniquement.
-- =============================================================================


-- =============================================================================
-- 1. ÉTENDRE LA CONTRAINTE CHECK (sur-ensemble mig 106 + 'assign_orders')
-- =============================================================================

ALTER TABLE public.staff_permissions
  DROP CONSTRAINT IF EXISTS staff_permissions_capability_known;

ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_capability_known CHECK (
    capability IN (
      'validate_categories',
      'manage_country_sourcing',
      'confirm_cod_orders',
      'confirm_affiliate_orders',
      'confirm_wholesale_orders',
      'manage_stock',
      'depot_reception',
      'depot_packing',
      'depot_shipping',
      'depot_confirmation',
      'depot_supervision',
      'assign_orders'
    )
  );


-- =============================================================================
-- 2. ÉTENDRE L'ALLOWLIST grant_staff_permission (CREATE OR REPLACE)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.grant_staff_permission(
  p_user_id    uuid,
  p_capability text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role  text;
BEGIN
  IF public.my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  -- Capacité connue uniquement (défense en plus du CHECK table).
  IF p_capability NOT IN (
    'validate_categories',
    'manage_country_sourcing',
    'confirm_cod_orders',
    'confirm_affiliate_orders',
    'confirm_wholesale_orders',
    'manage_stock',
    'depot_reception',
    'depot_packing',
    'depot_shipping',
    'depot_confirmation',
    'depot_supervision',
    'assign_orders'
  ) THEN
    RAISE EXCEPTION 'Capacité inconnue : %', p_capability;
  END IF;
  -- La cible doit exister.
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Idempotent : déjà accordée → aucune écriture ni audit.
  INSERT INTO public.staff_permissions (user_id, capability, granted_by)
  VALUES (p_user_id, p_capability, v_actor)
  ON CONFLICT (user_id, capability) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.staff_permission_audit (action, user_id, capability, changed_by)
    VALUES ('grant', p_user_id, p_capability, v_actor);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.grant_staff_permission(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_staff_permission(uuid, text) TO authenticated;


-- =============================================================================
-- 3. REBRANCHER can_assign_orders SUR staff_permissions
-- =============================================================================
-- Avant (mig 058) : admin OR (team_members actif AND permissions->>'assign_orders').
-- Après (mig 107)  : admin OR staff_permissions(user_id=uid, capability='assign_orders').
-- team_members N'EST PLUS référencé pour l'assignation (coquille morte dépréciée).
-- Signature inchangée → assign_wholesale_order_atomic (mig 061) et assignSupplierToOrder
-- continuent d'appeler can_assign_orders(uid) sans modification.

CREATE OR REPLACE FUNCTION public.can_assign_orders(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = uid
      AND p.role = 'admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.staff_permissions sp
    WHERE sp.user_id = uid
      AND sp.capability = 'assign_orders'
  );
$$;

REVOKE ALL ON FUNCTION public.can_assign_orders(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_assign_orders(uuid) TO authenticated;
