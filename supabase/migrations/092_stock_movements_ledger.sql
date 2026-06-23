-- =============================================================================
-- Migration 092 — Ledger stock_movements : journalisation append-only (WMS-1)
-- =============================================================================
-- Contexte : chantier WMS-1 (stock central unifié).
-- Ce lot est 100 % ADDITIF — aucun comportement existant n'est modifié ici.
--   • Crée la table append-only `stock_movements` (ledger d'audit des mouvements).
--   • Crée `record_stock_movement()` SECURITY DEFINER — seul vecteur d'insertion.
--   • Étend la capacité `manage_stock` dans staff_permissions (CHECK + allowlist RPC).
--
-- RÈGLES STRICTEMENT RESPECTÉES :
--   - Zéro touche à un montant, prix, commission, frais. Pas de colonne financière.
--   - RLS ENABLE sur stock_movements, deny par défaut. INSERT uniquement via definer.
--   - service_role jamais exposé côté client.
--   - 100 % idempotent (IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, CREATE OR REPLACE).
--
-- POINT D'ATTENTION @finance/@security :
--   - balance_after est un snapshot INTEGER (stock_count après décrément) — pas
--     une valeur monétaire. Aucun CHECK financier ne l'atteint.
--   - L'insertion dans stock_movements n'est possible que depuis SECURITY DEFINER
--     (aucune policy INSERT/UPDATE/DELETE pour authenticated ou anon).
--   - record_stock_movement() lit stock_count APRÈS le UPDATE pour garantir la
--     cohérence snapshot (toujours appelée dans la même transaction que le UPDATE).
-- =============================================================================

-- ── 1. Table stock_movements ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid         NOT NULL REFERENCES public.products(id),
  channel      text         NOT NULL
                            CHECK (channel IN (
                              'affiliate', 'wholesale', 'ecom_perso',
                              'manual_adjust', 'return', 'system'
                            )),
  qty_delta    integer      NOT NULL CHECK (qty_delta <> 0),
  reason       text         NOT NULL
                            CHECK (reason IN (
                              'sale_reserve', 'restore', 'oversell',
                              'adjustment', 'return'
                            )),
  order_id     uuid,
  order_type   text         CHECK (order_type IN ('affiliate', 'wholesale') OR order_type IS NULL),
  balance_after integer     NOT NULL,
  actor_id     uuid,
  note         text,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- Index pour les requêtes les plus fréquentes
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_date
  ON public.stock_movements (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_channel
  ON public.stock_movements (channel);

CREATE INDEX IF NOT EXISTS idx_stock_movements_order
  ON public.stock_movements (order_id)
  WHERE order_id IS NOT NULL;

-- ── 2. RLS — append-only strict ──────────────────────────────────────────────

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- SELECT : admin ou has_capability('manage_stock') uniquement.
-- Aucune policy INSERT/UPDATE/DELETE → deny total pour authenticated/anon.
-- INSERT réel : uniquement via SECURITY DEFINER (record_stock_movement).
DROP POLICY IF EXISTS "stock_movements: admin or manage_stock read" ON public.stock_movements;
CREATE POLICY "stock_movements: admin or manage_stock read"
  ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    public.my_role() = 'admin'
    OR public.has_capability('manage_stock')
  );

-- Immuabilité : aucun UPDATE/DELETE possible, même pour admin.
-- (Pas de policy → deny par défaut ; la table devient append-only de fait.)

-- ── 3. Trigger anti-mutation (sur-sécu) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.stock_movements_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements est append-only (ni UPDATE ni DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_immutable
  BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_immutable();

-- ── 4. record_stock_movement() — seul vecteur d'insertion ────────────────────
--
-- Conçue pour être appelée À L'INTÉRIEUR de la même transaction que le UPDATE
-- de stock_count (reserve_stock, restore_stock, adjust_stock_manual).
-- Lit le stock_count COURANT après le UPDATE pour construire balance_after.
--
-- p_actor : auth.uid() du staff appelant (NULL = système/trigger).
-- P1-A (sécu) : AUCUN GRANT TO authenticated — appelable uniquement en interne
-- par d'autres fonctions du même owner (DEFINER→DEFINER chain).
-- Un utilisateur authentifié NE PEUT PAS appeler cette RPC directement.

CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_product_id  uuid,
  p_qty_delta   integer,
  p_channel     text,
  p_reason      text,
  p_order_id    uuid    DEFAULT NULL,
  p_order_type  text    DEFAULT NULL,
  p_actor       uuid    DEFAULT NULL,
  p_note        text    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_after integer;
BEGIN
  -- Lit le stock_count courant APRÈS le UPDATE déjà effectué dans la même tx.
  SELECT stock_count INTO v_balance_after
    FROM public.products
    WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_stock_movement : produit % introuvable', p_product_id;
  END IF;

  INSERT INTO public.stock_movements (
    product_id, channel, qty_delta, reason,
    order_id, order_type, balance_after, actor_id, note
  ) VALUES (
    p_product_id, p_channel, p_qty_delta, p_reason,
    p_order_id, p_order_type, v_balance_after, p_actor, p_note
  );
END;
$$;

-- P1-A : AUCUN GRANT TO authenticated — elle reste appelable uniquement en
-- interne par les autres fonctions SECURITY DEFINER du même owner.
REVOKE ALL ON FUNCTION public.record_stock_movement(uuid, integer, text, text, uuid, text, uuid, text) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.record_stock_movement IS
  'Journalise un mouvement de stock dans stock_movements. SECURITY DEFINER. '
  'Doit être appelée dans la MÊME transaction que le UPDATE stock_count pour '
  'garantir la cohérence de balance_after. Seul vecteur d''insertion dans '
  'stock_movements (append-only, aucune policy INSERT côté RLS). '
  'P1-A : aucun GRANT authenticated — interne aux fonctions DEFINER uniquement. '
  'WMS-1 migration 092.';

-- ── 5. Capacité manage_stock ──────────────────────────────────────────────────
-- Pattern identique à mig 086/087 : DROP + ADD CHECK (liste complète = sur-ensemble).
-- Liste FINALE après 092 :
--   validate_categories      (083)
--   manage_country_sourcing  (086)
--   confirm_cod_orders       (087)
--   confirm_affiliate_orders (087)
--   confirm_wholesale_orders (087)
--   manage_stock             (092 — nouveau)

ALTER TABLE public.staff_permissions
  DROP CONSTRAINT IF EXISTS staff_permissions_capability_known;

ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_capability_known CHECK (
    capability IN (
      'validate_categories',
      'manage_country_sourcing',
      'confirm_cod_orders',
      'confirm_affiliate_orders',
      'confirm_wholesale_orders',
      'manage_stock'
    )
  );

-- grant_staff_permission : étendre l'allowlist en dur (CREATE OR REPLACE).
-- Corps identique à mig 087 sauf la ligne NOT IN (...) qui ajoute manage_stock.

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
    'confirm_wholesale_orders',
    'manage_stock'
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

-- revoke_staff_permission : pas de changement de corps nécessaire (pas d'allowlist).
-- La contrainte CHECK suffit à bloquer une valeur inconnue à l'INSERT.

COMMENT ON TABLE public.stock_movements IS
  'Ledger append-only de tous les mouvements de stock (WMS-1, mig 092). '
  'Chaque ligne = 1 mouvement (reserve/restore/adjustment/return). '
  'INSERT uniquement via record_stock_movement() SECURITY DEFINER. '
  'Aucune policy INSERT/UPDATE/DELETE (deny par défaut) → append-only strict. '
  'SELECT : admin ou has_capability(''manage_stock'').';
