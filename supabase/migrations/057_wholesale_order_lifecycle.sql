-- =============================================================================
-- Migration 057 — LOT 1 : machine à états étendue + historique des transitions
-- =============================================================================
-- Objectif : étendre le cycle de vie de wholesale_orders pour le modèle
--   Deliveroo-style (assigned → supplier_confirmed → preparing → ready →
--   picked_up → dispatched → delivered) tout en gardant les états legacy.
-- Périmètre : schéma uniquement. Aucune colonne financière touchée.
-- Le trigger compute_wholesale_order_costs (migration 025) est INTANGIBLE.
-- =============================================================================

-- ── 1. Mise à jour du CHECK status (additif, rétro-compatible) ────────────────
--
-- L'ancien CHECK (posé dans migration 004) se nomme wholesale_orders_status_check.
-- On le supprime puis on le recrée avec l'union ancien ∪ nouveau.
-- Les états legacy (confirmed, sourcing, shipped) sont conservés tels quels —
-- des commandes existantes peuvent les utiliser.

ALTER TABLE public.wholesale_orders
  DROP CONSTRAINT IF EXISTS wholesale_orders_status_check;

ALTER TABLE public.wholesale_orders
  ADD CONSTRAINT wholesale_orders_status_check
    CHECK (status IN (
      -- États legacy (migration 004) — conservés, jamais supprimés
      'pending',
      'confirmed',
      'sourcing',
      'shipped',
      -- Nouveaux états du cycle Deliveroo-style (LOT 1)
      'assigned',
      'supplier_confirmed',
      'preparing',
      'ready',
      'picked_up',
      'dispatched',
      -- État terminal commun (inchangé)
      'delivered',
      'cancelled'
    ));

-- ── 2. Nouvelles colonnes de flags / timestamps (IF NOT EXISTS) ───────────────
--
-- assigned_at  : horodatage d'affectation à un agent de terrain.
-- due_at       : échéance attendue de livraison (en retard si dépassée + non livrée).
-- blocked_at   : timestamp de blocage (signal rouge, pas un état).
-- blocked_reason : raison du blocage (texte libre).
-- Ces colonnes sont des signaux opérationnels, pas des états du workflow.

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS assigned_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS due_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS blocked_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS blocked_reason text        NULL;

-- ── 3. Table d'historique des transitions de statut (append-only) ─────────────
--
-- Calquée sur wholesale_order_import_history (migration 026) et
-- wholesale_order_payment_history (migration 029).
-- Chaque changement de status produit une ligne immuable.
-- L'écriture réelle se fait via server actions (LOT 2) — ici on pose la structure.

CREATE TABLE IF NOT EXISTS public.wholesale_order_status_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid        NOT NULL
                             REFERENCES public.wholesale_orders(id) ON DELETE CASCADE,
  from_status  text        NULL,   -- NULL pour la première entrée (création)
  to_status    text        NOT NULL,
  changed_by   uuid        NULL    REFERENCES auth.users(id) ON DELETE SET NULL,
  note         text        NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ws_status_history_order_id
  ON public.wholesale_order_status_history(order_id, created_at DESC);

-- ── 4. RLS sur wholesale_order_status_history ─────────────────────────────────
--
-- Deny par défaut (ENABLE ROW LEVEL SECURITY = deny-all si aucune policy ne match).
-- Modèle : même structure que les tables 026 et 029.

ALTER TABLE public.wholesale_order_status_history ENABLE ROW LEVEL SECURITY;

-- Admin : accès complet (lecture + écriture)
DROP POLICY IF EXISTS "admin_all_status_history" ON public.wholesale_order_status_history;
CREATE POLICY "admin_all_status_history"
  ON public.wholesale_order_status_history
  FOR ALL
  TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- Agent terrain : peut lire et insérer (écriture réelle via server actions au LOT 2)
DROP POLICY IF EXISTS "agent_read_insert_status_history" ON public.wholesale_order_status_history;
CREATE POLICY "agent_read_insert_status_history"
  ON public.wholesale_order_status_history
  FOR SELECT
  TO authenticated
  USING (public.my_role() = 'agent');

DROP POLICY IF EXISTS "agent_insert_status_history" ON public.wholesale_order_status_history;
CREATE POLICY "agent_insert_status_history"
  ON public.wholesale_order_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.my_role() = 'agent');

-- Buyer : lecture seule sur ses propres commandes
DROP POLICY IF EXISTS "buyer_read_status_history" ON public.wholesale_order_status_history;
CREATE POLICY "buyer_read_status_history"
  ON public.wholesale_order_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = order_id
        AND wo.buyer_id = auth.uid()
    )
  );

-- Pas de policy UPDATE ni DELETE : table append-only.
