-- =============================================================================
-- Migration 117 — Niche DÉCLARÉE à l'inscription grossiste (Palier 1, couche 1 perso)
-- =============================================================================
-- ADDITIF / IDEMPOTENT. SÛR À APPLIQUER IMMÉDIATEMENT : ajoute une colonne
-- nullable et étend le trigger de création de profil pour la recopier depuis la
-- métadonnée du signup. N'altère AUCUN profil existant (le trigger ne fire qu'à
-- l'INSERT d'un nouvel auth.users). Aucun montant, aucune RLS, aucune marge.
--
-- But : le grossiste DÉCLARE sa niche à l'inscription (ex. « Alimentaire »). La
-- personnalisation par COMPORTEMENT existe déjà (detect-niche.ts) mais souffre du
-- cold-start (aucun signal au 1er jour). La niche déclarée sert de FALLBACK de
-- cold-start (boost de tri + bannière), remplacée dès que le comportement parle.
-- AFFICHAGE / PERSONNALISATION UNIQUEMENT — jamais un prix, jamais la grille.
--
-- La valeur stockée est une catégorie canonique (== products.category) validée
-- côté serveur (server action signUp → isValidCategory). Le trigger ne fait que
-- recopier la métadonnée telle quelle (NULLIF vide) ; la contrainte de validité
-- est applicative (allowlist taxonomie), pas une contrainte DB (la taxonomie est
-- dynamique, mig 081).
-- =============================================================================

-- ── 1. Colonne déclarative sur profiles ──────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS declared_niche text;

COMMENT ON COLUMN public.profiles.declared_niche IS
  'Niche déclarée par le grossiste à l''inscription (catégorie canonique == '
  'products.category). Sert de fallback cold-start à la personnalisation '
  'comportementale (detect-niche.ts). AFFICHAGE seul — jamais un prix/marge. '
  'Nullable ; posé au signup via la métadonnée (mig 117).';

-- ── 2. Trigger de création de profil — recopie declared_niche ─────────────────
-- Reprend À L'IDENTIQUE l'allowlist de rôle (mig 090, anti-escalade) et n'ajoute
-- QUE la recopie de declared_niche (NULLIF vide). Rien d'autre ne change.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requested text := NEW.raw_user_meta_data->>'role';
  v_role      text;
BEGIN
  -- ALLOWLIST stricte (inchangée, mig 090) : anti-escalade de rôle.
  IF v_requested IN ('affiliate', 'wholesaler', 'supplier') THEN
    v_role := v_requested;
  ELSE
    v_role := 'affiliate';
  END IF;

  INSERT INTO public.profiles (id, role, full_name, status, country_code, phone, declared_niche)
  VALUES (
    NEW.id,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending',
    NULLIF(NEW.raw_user_meta_data->>'country_code', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    NULLIF(NEW.raw_user_meta_data->>'declared_niche', '')
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Crée le profil au signup. Rôle = allowlist DB {affiliate,wholesaler,supplier} '
  '(défaut affiliate, anti-escalade mig 090). status=pending. Recopie aussi '
  'declared_niche (niche déclarée grossiste, mig 117). Non contournable client.';
