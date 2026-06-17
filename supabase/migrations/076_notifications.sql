-- =============================================================================
-- Migration 076 — Table notifications (in-app) + RLS  (LOT 6)
-- =============================================================================
-- Notifications in-app append-only. 1ʳᵉ usage : alerte d'assignation d'une
-- commande B2B à un fournisseur (event 'order_assigned'), destinataires
-- fournisseur + admin(s) (+ agent optionnel). Le push Telegram est géré côté
-- serveur (best-effort) et n'est PAS stocké ici (channels = canaux tentés).
--
-- CLOISONNEMENT / PII : le `payload` ne contient QUE des champs sûrs
-- (ref, items[label/qty], city, dueAt) — JAMAIS de PII acheteur (buyer_id,
-- nom, téléphone, adresse, buyer_notes). Garantie applicative (helper) + audit.
--
-- INSERT : aucune policy pour `authenticated` → insertion CLIENT refusée
-- (deny par défaut). L'émission passe EXCLUSIVEMENT par le serveur via
-- createAdminClient() (service-role, bypass RLS). Aucune surface d'insertion
-- navigateur (RÈGLE D'OR 7).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event        text NOT NULL,
  order_id     uuid REFERENCES public.wholesale_orders(id) ON DELETE CASCADE,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  channels     text[] NOT NULL DEFAULT '{}',
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Idempotence : une seule notif (order, event, destinataire). order_id peut être
-- NULL pour de futurs events non liés à une commande → index partiel.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_order_event_recipient
  ON public.notifications (order_id, event, recipient_id)
  WHERE order_id IS NOT NULL;

-- Lecture in-app : « mes notifs non lues, plus récentes d'abord ».
CREATE INDEX IF NOT EXISTS idx_notif_recipient_unread
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT : uniquement les siennes.
DROP POLICY IF EXISTS "notif: read own" ON public.notifications;
CREATE POLICY "notif: read own"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- UPDATE : marquer lu, uniquement les siennes (le recipient ne peut pas changer).
-- En pratique l'écriture passe par une server action ciblée sur read_at.
DROP POLICY IF EXISTS "notif: mark read own" ON public.notifications;
CREATE POLICY "notif: mark read own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Pas d'INSERT/DELETE pour authenticated (deny par défaut). Insert = service-role.
-- UPDATE limité à la SEULE colonne read_at (marquer lu) — grant colonne-spécifique :
-- la RLS filtre les LIGNES (own only), ce grant filtre les COLONNES. Un utilisateur
-- ne peut donc PAS réécrire payload/event/channels/order_id de ses propres notifs.
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

COMMENT ON TABLE public.notifications IS
  'Notifications in-app (LOT 6). payload jsonb STRUCTURÉ sans PII acheteur '
  '(ref, items[label,qty], city, dueAt). RLS : lecture/maj own only ; insertion '
  'serveur (service-role) uniquement, aucune policy INSERT client.';
