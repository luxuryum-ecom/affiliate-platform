-- =============================================================================
-- Migration 077 — Fix idempotence notifications : index unique NON-partiel
-- =============================================================================
-- La migration 076 a créé un index unique PARTIEL (WHERE order_id IS NOT NULL).
-- Or `ON CONFLICT (order_id, event, recipient_id)` (utilisé par l'upsert du helper
-- notifyOrderAssigned) exige un index unique NON-partiel couvrant exactement ces
-- colonnes — sinon Postgres renvoie « no unique or exclusion constraint matching
-- the ON CONFLICT specification » et l'upsert échoue (aucune notif insérée).
--
-- Correctif : index unique plein sur (order_id, event, recipient_id). order_id est
-- nullable (futurs events hors commande) ; les NULL étant distincts en Postgres,
-- ces lignes ne se dédupliquent pas — comportement acceptable. Pour les events liés
-- à une commande (order_id non NULL), l'idempotence reste garantie.
-- =============================================================================

DROP INDEX IF EXISTS public.uniq_notif_order_event_recipient;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_order_event_recipient
  ON public.notifications (order_id, event, recipient_id);
