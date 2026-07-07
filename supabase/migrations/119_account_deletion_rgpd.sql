-- =============================================================================
-- Migration 119 — B8 : Suppression de compte RGPD (anonymisation)
-- =============================================================================
-- ADDITIF / IDEMPOTENT. Un utilisateur peut demander la suppression de son
-- compte. On ANONYMISE ses données personnelles (profil) sans casser
-- l'intégrité comptable : les commandes/ledger gardent leur `buyer_id` (la ligne
-- profil subsiste, vidée de sa PII, statut 'deleted'). On NE fait PAS de DELETE
-- physique (verrou FK/audit append-only documenté) : le blocage de connexion se
-- fait côté auth (ban + email anonymisé) dans la server action.
--
-- Cette migration ne fait qu'AUTORISER le nouvel état :
--   1. statut 'deleted' accepté par la contrainte CHECK ;
--   2. colonne `anonymized_at` (horodatage de l'anonymisation, trace RGPD).
-- Aucune donnée existante modifiée, aucune RLS touchée, aucun montant.
-- =============================================================================

-- ── 1. Autoriser le statut 'deleted' ─────────────────────────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'deleted'::text]));

-- ── 2. Trace d'anonymisation ─────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

COMMENT ON COLUMN public.profiles.anonymized_at IS
  'B8/RGPD (mig 119) — horodatage de l''anonymisation du compte. Non null = PII '
  'vidée, statut ''deleted'', connexion bloquée. La ligne subsiste pour '
  'l''intégrité comptable des commandes (buyer_id conservé).';
