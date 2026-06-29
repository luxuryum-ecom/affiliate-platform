-- =============================================================================
-- Migration 106 — Capacités dépôt (LOT 1C : casiers de responsabilité)
-- =============================================================================
-- Objectif : étendre le système de permissions modulables (mig 083) avec 5 nouvelles
-- capacités « casier » correspondant aux postes polyvalents du dépôt :
--
--   • depot_reception    — réception des marchandises au dépôt
--   • depot_packing      — emballage / préparation des colis
--   • depot_shipping     — expédition / remise au transporteur
--   • depot_confirmation — confirmation des commandes au dépôt
--   • depot_supervision  — supervision du dépôt
--
-- PÉRIMÈTRE (identique aux mig 086/087/092) :
--   1. Étendre la contrainte CHECK staff_permissions_capability_known (DROP + ADD)
--   2. Étendre l'allowlist en dur dans grant_staff_permission (CREATE OR REPLACE)
--   PAS de nouvelle table : le « volet dépôt » est un bundle applicatif (catalog.ts).
--   PAS de RPC métier ici : ces capacités gateront les scans au LOT 2 (1D/scan).
--
-- RÈGLES RESPECTÉES :
--   - 100 % additif / idempotent (DROP CONSTRAINT IF EXISTS, CREATE OR REPLACE)
--   - Le nouveau CHECK est un sur-ensemble exact de mig 092 → les lignes existantes
--     restent valides SANS interruption.
--   - RLS, policies, tables, audit immuable (staff_permission_audit) : NON TOUCHÉS.
--   - Aucune logique financière, aucun montant, aucune table ledger.
--   - service_role jamais exposé au client. Contrôle d'accès uniquement.
-- =============================================================================


-- =============================================================================
-- 1. ÉTENDRE LA CONTRAINTE CHECK staff_permissions_capability_known
-- =============================================================================
-- Liste FINALE (sur-ensemble de mig 092 + 5 capacités dépôt) :
--   'validate_categories'      (mig 083)
--   'manage_country_sourcing'  (mig 086)
--   'confirm_cod_orders'       (mig 087)
--   'confirm_affiliate_orders' (mig 087)
--   'confirm_wholesale_orders' (mig 087)
--   'manage_stock'             (mig 092)
--   'depot_reception'          (mig 106 — nouveau)
--   'depot_packing'            (mig 106 — nouveau)
--   'depot_shipping'           (mig 106 — nouveau)
--   'depot_confirmation'       (mig 106 — nouveau)
--   'depot_supervision'        (mig 106 — nouveau)

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
      'depot_supervision'
    )
  );


-- =============================================================================
-- 2. ÉTENDRE L'ALLOWLIST EN DUR DANS grant_staff_permission
-- =============================================================================
-- CREATE OR REPLACE complet — corps identique à mig 092 sauf la ligne NOT IN (...)
-- qui ajoute les 5 capacités dépôt. Gate admin, idempotence ON CONFLICT, écriture
-- audit immuable : INCHANGÉS.

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
    'depot_supervision'
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
