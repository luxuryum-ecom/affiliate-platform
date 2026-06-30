-- =============================================================================
-- Migration 109 — Notifications de commande COD affilié (LOT 1B)
-- =============================================================================
-- Objectif : permettre de notifier (in-app + Telegram admin) à la création / la
-- confirmation d'une commande COD (table `orders`), comme le B2B le fait déjà pour
-- `wholesale_orders`. La table `notifications` ne référençait que `wholesale_orders`
-- (mig 076) → on ajoute une référence vers `orders`.
--
-- + Traçabilité (LOT 1E) : trigger AFTER INSERT sur `orders` → ligne d'audit
--   'cod_order_created' (la confirmation est déjà tracée par le trigger AFTER UPDATE
--   de la mig 108 = 'cod_order_status_change').
--
-- RÈGLES : 100% additif et réversible. Aucune logique financière touchée (montants,
-- commissions, snapshots, ledger INCHANGÉS). RLS de notifications inchangée
-- (recipient-own). Écriture des notifs via service_role serveur (jamais client).
-- =============================================================================


-- ── 1. Référence COD sur notifications (nullable, additif) ────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS cod_order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE;

-- Idempotence des upserts COD : index unique dédié (cod_order_id, event, recipient_id).
-- Distinct de uniq_notif_order_event_recipient (B2B) → les deux flux coexistent.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_cod_event_recipient
  ON public.notifications (cod_order_id, event, recipient_id);

-- Index de lecture non-lues côté destinataire déjà couvert par mig 076 (recipient_id).


-- ── 2. Traçabilité création de commande COD (journal d'audit 1E) ──────────────
-- AFTER INSERT sur orders → 1 ligne admin_audit_log 'cod_order_created'.
-- actor = auth.uid() (affilié ; NULL pour une commande publique non authentifiée).
-- N'écrit QUE dans admin_audit_log (aucune donnée métier modifiée, aucune PII :
-- on ne logge que le statut, jamais nom/téléphone/adresse client).
CREATE OR REPLACE FUNCTION public.audit_cod_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role  text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = v_actor;
  INSERT INTO public.admin_audit_log (actor_id, actor_role, action, target_table, target_id, old_value, new_value)
  VALUES (v_actor, v_role, 'cod_order_created', 'orders', NEW.id::text, NULL,
          jsonb_build_object('status', NEW.status));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_cod_order_insert ON public.orders;
CREATE TRIGGER trg_audit_cod_order_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_cod_order_insert();
