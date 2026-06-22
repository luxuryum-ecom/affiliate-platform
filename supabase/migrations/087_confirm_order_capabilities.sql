-- =============================================================================
-- Migration 087 — Capacités de confirmation de commandes (SOUS-LOT A : fondation DB)
-- =============================================================================
-- Objectif : étendre le système de permissions modulables (mig 083) avec 3 nouvelles
-- capacités permettant à un salarié de confirmer les commandes d'un volet donné :
--
--   • confirm_cod_orders       — confirmation des commandes COD (Cash On Delivery)
--   • confirm_affiliate_orders — confirmation des commandes affiliés
--   • confirm_wholesale_orders — confirmation des commandes grossistes (B2B)
--
-- PÉRIMÈTRE :
--   1. Étendre la contrainte CHECK staff_permissions_capability_known (DROP + ADD)
--   2. Étendre l'allowlist en dur dans grant_staff_permission (CREATE OR REPLACE)
--   PAS de nouvelle table : le "rôle de volet" sera un bundle applicatif (sous-lot B).
--   PAS de RPC de confirmation ici (sous-lot D).
--
-- RÈGLES RESPECTÉES :
--   - 100 % additif / idempotent (DROP CONSTRAINT IF EXISTS, CREATE OR REPLACE)
--   - Le nouveau CHECK est un sur-ensemble exact de mig 086 → les lignes existantes
--     ('validate_categories', 'manage_country_sourcing') restent valides SANS interruption.
--   - RLS, policies, tables, RPCs de sourcing : NON TOUCHÉS.
--   - Aucune logique financière, aucun montant, aucune table ledger.
--   - service_role jamais exposé au client.
-- =============================================================================


-- =============================================================================
-- 1. ÉTENDRE LA CONTRAINTE CHECK staff_permissions_capability_known
-- =============================================================================
-- Pattern identique à mig 086 (lignes 70-76) :
--   DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT avec la liste finale complète.
-- Liste FINALE (sur-ensemble) :
--   'validate_categories'      (mig 083)
--   'manage_country_sourcing'  (mig 086)
--   'confirm_cod_orders'       (mig 087 — nouveau)
--   'confirm_affiliate_orders' (mig 087 — nouveau)
--   'confirm_wholesale_orders' (mig 087 — nouveau)

ALTER TABLE public.staff_permissions
  DROP CONSTRAINT IF EXISTS staff_permissions_capability_known;

ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_capability_known CHECK (
    capability IN (
      'validate_categories',
      'manage_country_sourcing',
      'confirm_cod_orders',
      'confirm_affiliate_orders',
      'confirm_wholesale_orders'
    )
  );


-- =============================================================================
-- 2. ÉTENDRE L'ALLOWLIST EN DUR DANS grant_staff_permission
-- =============================================================================
-- CREATE OR REPLACE complet — corps identique à mig 086 (lignes 81-118) sauf la
-- ligne IF p_capability NOT IN (...) qui ajoute les 3 nouvelles valeurs.
-- Gate admin, idempotence ON CONFLICT, écriture audit : INCHANGÉS.

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
    'confirm_wholesale_orders'
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
