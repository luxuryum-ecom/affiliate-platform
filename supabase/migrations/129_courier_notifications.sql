-- =============================================================================
-- Migration 129 — Notifications livreur (module Livreurs, cœur notifications)
-- =============================================================================
-- Réf : CLAUDE.md (notifications mig 076/109, registre couriers mig 126, tournées
-- + retours 3 cas mig 128), RÈGLE ABSOLUE : notifs NON BLOQUANTES, JAMAIS dans une
-- transaction financière — émises depuis les server actions APRÈS le succès de la
-- RPC, en best-effort total (cf. src/lib/notifications/order-created.ts).
--
-- PÉRIMÈTRE — ADDITIF PUR :
--   • notifications.courier_id (nullable, FK couriers) : pour les events liés à un
--     livreur mais pas à une commande précise (ex. courier_over_cap).
--   • Index unique partiel (courier_id, event, recipient_id) : dédup/anti-spam des
--     events livreur, calque exact de uniq_notif_cod_event_recipient (mig 109).
--   • event reste TEXT LIBRE (aucun CHECK sur notifications.event, mig 076) →
--     aucune contrainte à modifier pour les nouveaux events courier_*.
--   • RLS INCHANGÉE (recipient-own, mig 076) : un destinataire (admin) ne voit que
--     ses propres notifs, que courier_id soit renseigné ou non.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS, CREATE UNIQUE INDEX IF NOT EXISTS.
-- LOCAL UNIQUEMENT (127.0.0.1) — appliquée ici via `supabase db push` (local).
-- Abdou applique en prod séparément après GO.
-- =============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES public.couriers(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.notifications.courier_id IS
  'Livreur concerné (mig 129) — renseigné pour les events livreur SANS commande '
  'précise (ex. courier_over_cap). Pour les events liés à une commande (pickup, '
  'livraison, retour), cod_order_id (mig 109) reste la clé de dédup principale.';

-- Dédup/anti-spam des events livreur non liés à une commande (ex. plusieurs
-- mark_return_lost successifs déclenchant courier_over_cap pour le même livreur).
-- PAS de clause WHERE (calque exact uniq_notif_cod_event_recipient, mig 109) :
-- un index unique PARTIEL n'est pas utilisable comme cible d'un upsert
-- PostgREST/supabase-js `onConflict: 'courier_id,event,recipient_id'` (Postgres
-- exige que le prédicat de l'index soit répété dans la clause ON CONFLICT, ce
-- que l'API REST ne permet pas) — vérifié en local (erreur 42P10). Un index NON
-- partiel fonctionne : les lignes courier_id IS NULL ne se dédupliquent
-- simplement pas entre elles (NULL <> NULL), ce qui est sans conséquence : ces
-- events ont toujours un cod_order_id et sont dédupliqués par l'index dédié
-- (uniq_notif_cod_event_recipient, mig 109).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_courier_event_recipient
  ON public.notifications (courier_id, event, recipient_id);

-- RLS inchangée (policies recipient-own de la mig 076, cf. "notif: read own").
