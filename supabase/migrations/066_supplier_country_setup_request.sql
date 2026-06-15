-- =============================================================================
-- Migration: 066_supplier_country_setup_request (idempotent, ADD-ONLY)
-- Débloque le « mur sans issue » des fournisseurs pré-054 sans country_code.
--
-- Contexte : migration 054 a laissé les fournisseurs déjà inscrits avec
-- country_code = NULL (pas de backfill), et le pays est figé admin-only
-- (trigger guard_profile_country_immutable). Résultat : un tel fournisseur voit
-- « Pays non configuré, contactez l'administrateur » en permanence, sans action
-- possible, et l'admin n'est jamais notifié.
--
-- Ce flag transforme le mur en demande actionnable : le fournisseur signale qu'il
-- attend la configuration ; l'admin voit la demande et pose le pays (action
-- setSupplierCountry, côté admin authentifié → satisfait my_role()='admin' du
-- trigger d'immutabilité). On NE change PAS la règle « pays figé », ni la chaîne
-- devise : seul l'admin écrit country_code, comme avant.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_setup_requested boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.country_setup_requested IS
  'Fournisseur sans country_code ayant demandé sa configuration à l''admin. '
  'Posé à true par le fournisseur (self-update), remis à false par l''admin '
  'quand il pose le country_code. Pur signal d''onboarding, hors chaîne devise.';

-- Index partiel : l''admin liste vite les demandes en attente (peu de lignes true).
CREATE INDEX IF NOT EXISTS idx_profiles_country_setup_requested
  ON public.profiles(country_setup_requested)
  WHERE country_setup_requested = true;

-- RLS : aucune nouvelle policy nécessaire. La policy existante
-- « profiles: update own (no role/status change) » (migration 001) autorise déjà
-- le fournisseur à modifier cette colonne sur SA ligne (role/status inchangés) ;
-- « profiles: admin update any » couvre l''écriture admin.
