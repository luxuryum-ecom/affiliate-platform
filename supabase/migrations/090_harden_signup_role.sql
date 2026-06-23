-- =============================================================================
-- Migration 090 — Durcir le rôle au signup (dette go-live l.164) — anti-escalade
-- =============================================================================
-- ADDITIF / DÉFENSE EN PROFONDEUR. SÛR À APPLIQUER IMMÉDIATEMENT : ne restreint que
-- l'auto-déclaration de rôles PRIVILÉGIÉS ; les signups légitimes (affiliate/wholesaler/
-- supplier) sont INCHANGÉS. N'altère AUCUN profil existant (le trigger ne fire qu'à
-- l'INSERT d'un nouvel auth.users). Aucun montant, aucune autre table touchée.
--
-- Problème (dette l.164) : `handle_new_user` (mig 056) posait
--   role = COALESCE(raw_user_meta_data->>'role', 'affiliate')
-- → le rôle venait DIRECTEMENT de la métadonnée client, sans allowlist DB. La server
-- action `signUp` (auth.ts) valide bien {affiliate,wholesaler,supplier}, mais un appel
-- DIRECT `supabase.auth.signUp({ data:{ role:'admin' } })` avec la clé anon publique
-- CONTOURNE la server action → le trigger écrivait `role='admin'`. Escalade possible.
--
-- Correctif : ALLOWLIST AU NIVEAU TRIGGER (autorité finale, non contournable côté client).
-- Tout rôle hors {affiliate, wholesaler, supplier} (donc 'admin', 'agent', ou invalide)
-- est coercé au défaut sûr 'affiliate'. admin/agent ne se posent QUE par un chemin admin
-- (updateUserById / service_role), JAMAIS au self-signup. `status='pending'` conservé.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requested text := NEW.raw_user_meta_data->>'role';
  v_role      text;
BEGIN
  -- ALLOWLIST stricte : seuls les 3 rôles non privilégiés sont auto-déclarables.
  -- Tout le reste (admin, agent, NULL, valeur inconnue) → 'affiliate' (défaut sûr).
  IF v_requested IN ('affiliate', 'wholesaler', 'supplier') THEN
    v_role := v_requested;
  ELSE
    v_role := 'affiliate';
  END IF;

  INSERT INTO public.profiles (id, role, full_name, status, country_code, phone)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending',
    NULLIF(NEW.raw_user_meta_data->>'country_code', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Crée le profil au signup. Rôle = allowlist DB {affiliate,wholesaler,supplier} '
  '(défaut affiliate) : admin/agent NON auto-déclarables (anti-escalade, dette 073/l.164). '
  'status=pending. Défense finale non contournable côté client (mig 090).';
