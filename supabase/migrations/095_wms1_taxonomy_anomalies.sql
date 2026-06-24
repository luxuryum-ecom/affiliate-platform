-- =============================================================================
-- Migration 095 — WMS-1 : taxonomie raisons + table anomalies + hooks
-- =============================================================================
-- Contexte : chantier WMS-1 (stock central unifié). Suite du commit 164134c.
-- Dépend de 092/093/094 (déjà appliquées, non modifiées).
--
-- AJOUT 2 — Taxonomie métier des raisons (traité en premier car les autres en dépendent)
--   • Remplace la raison technique 'sale_reserve'/'oversell'/'adjustment'/'restore'/'return'
--     par une taxonomie métier :
--     ventes système : 'vente_affilie','vente_gros','vente_ecom'
--     mouvements manuels : 'cadeau','casse','echantillon','perte','retour','reappro'
--   • L'oversell N'EST PLUS une reason — c'est une condition (balance_after<0)
--     qui déclenche une anomalie tracée dans stock_anomalies (AJOUT 3).
--   • reserve_stock recréé avec la bonne reason VENTE par canal.
--   • restore_stock recréé → reason = 'retour'.
--   • adjust_stock_manual recréé avec p_reason validé (raisons manuelles uniquement).
--
-- AJOUT 1 — Jamais refuser (déjà acquis en 093), alerte enrichie
--   • L'alerte oversell est déléguée à record_anomaly (AJOUT 3).
--   • Charge du frontend : le type de retour des server actions est étendu
--     avec warning? : 'restocking' (voir src/app/actions/orders.ts + cart.ts).
--
-- AJOUT 3 — Socle détection anomalies (préfiguration Gardien IA)
--   • Table stock_anomalies append-only immuable avec RLS deny par défaut.
--   • record_anomaly() SECURITY DEFINER, REVOKE public/anon/authenticated.
--   • 3 hooks : oversell (depuis reserve_stock), casse/perte anormale,
--     ajustements répétés (depuis adjust_stock_manual).
--
-- RÈGLES STRICTEMENT RESPECTÉES :
--   - Zéro touche aux montants, prix, commissions, frais.
--   - Tous les objets SECURITY DEFINER ont SET search_path = public.
--   - REVOKE public/anon sur toutes les fonctions internes (record_anomaly,
--     record_stock_movement — déjà REVOKE'd en 092).
--   - RLS ENABLE sur stock_anomalies, deny par défaut.
--   - trigger immutabilité sur stock_anomalies.
--   - Idempotent : DROP FUNCTION IF EXISTS, DROP TABLE IF EXISTS, etc.
--
-- POINT D'ATTENTION @finance :
--   - Aucune colonne financière touchée (aucun prix, montant, commission, frais).
--   - adjust_stock_manual accepte maintenant p_reason (raisons manuelles).
--     La server action adjustStock DOIT passer p_reason — voir src/app/actions/stock.ts.
--   - Les raisons 'vente_*' sont RÉSERVÉES au système : toute tentative depuis
--     adjust_stock_manual lève errors.invalid_reason.
--
-- POINT D'ATTENTION @security :
--   - stock_anomalies : append-only (trigger UPDATE/DELETE → RAISE), RLS deny.
--     SELECT : admin OU has_capability('manage_stock').
--   - record_anomaly : REVOKE authenticated — interne uniquement, aucune RPC cliente.
--   - Qui reçoit les alertes : tous les profils admin (boucle FOR sur role='admin').
--     S'il n'existe aucun admin, l'anomalie est tout de même enregistrée dans
--     stock_anomalies (l'essentiel) ; seule la notification n'est pas émise (fail-safe).
--   - Les seuils c_loss_threshold=20 et c_adjust_count_threshold=10 sont des
--     heuristiques placeholder — voir commentaire dédié.
--   - La notification anomalie insère order_id=NULL pour respecter la FK
--     notifications.order_id → wholesale_orders.
-- =============================================================================

-- =============================================================================
-- ██████████████  AJOUT 2 — TAXONOMIE RAISONS  ████████████████████████████████
-- =============================================================================

-- ── 2.1 Remplacement de la contrainte CHECK reason ───────────────────────────
--
-- Ancienne contrainte (mig 092) : stock_movements_reason_check
-- Valeurs supprimées : 'sale_reserve', 'oversell', 'adjustment', 'restore', 'return'
-- Nouvelles valeurs métier :
--   Réservées système (ventes) : 'vente_affilie', 'vente_gros', 'vente_ecom'
--   Manuelles : 'cadeau', 'casse', 'echantillon', 'perte', 'retour', 'reappro'

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_reason_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_reason_check CHECK (
    reason IN (
      -- Raisons système (ventes) — écrites uniquement par reserve_stock/restore_stock
      'vente_affilie',
      'vente_gros',
      'vente_ecom',
      -- Raisons manuelles — écrites uniquement par adjust_stock_manual
      'cadeau',
      'casse',
      'echantillon',
      'perte',
      'retour',
      'reappro'
    )
  );

-- ── 2.2 reserve_stock() — recréée avec la bonne reason VENTE par canal ────────
--
-- Logique raison par canal :
--   'affiliate'   → 'vente_affilie'
--   'wholesale'   → 'vente_gros'
--   'ecom_perso'  → 'vente_ecom'
--   tout autre    → 'reappro' (entrée de réapprovisionnement — cas inattendu sécurisé)
--
-- L'oversell N'EST PLUS une reason : si balance_after < 0, on appelle record_anomaly
-- (AJOUT 3) en best-effort. La reason reste la raison MÉTIER de la vente.
--
-- Signature identique à 093 (compatibilité ascendante totale).

DROP FUNCTION IF EXISTS public.reserve_stock(uuid, integer, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_stock_before integer;
  v_reason      text;
  v_shortfall   integer;
BEGIN
  -- Verrou row-level : atomicité (FOR UPDATE).
  SELECT stock_count, stock_count - p_qty
  INTO v_stock_before, v_new_balance
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reserve_stock : produit % introuvable', p_product_id;
  END IF;

  -- Décrément (peut passer négatif — OPTION A, mig 093).
  UPDATE public.products
    SET stock_count = v_new_balance
  WHERE id = p_product_id;

  -- Reason MÉTIER selon le canal (l'oversell n'est plus une reason).
  v_reason := CASE p_channel
    WHEN 'affiliate'  THEN 'vente_affilie'
    WHEN 'wholesale'  THEN 'vente_gros'
    WHEN 'ecom_perso' THEN 'vente_ecom'
    ELSE 'reappro'   -- canal inattendu : traité comme réapprovisionnement (sécurité)
  END;

  -- Journalisation (même transaction → balance_after cohérent).
  PERFORM public.record_stock_movement(
    p_product_id,
    -p_qty,         -- qty_delta négatif (sortie)
    p_channel,
    v_reason,
    p_order_id,
    p_order_type,
    p_actor,
    NULL
  );

  -- Hook OVERSELL : si le solde devient négatif → anomalie tracée (best-effort).
  -- L'opération de vente n'est JAMAIS annulée (sous-bloc BEGIN/EXCEPTION).
  IF v_new_balance < 0 THEN
    v_shortfall := GREATEST(p_qty - GREATEST(v_stock_before, 0), 0);
    BEGIN
      PERFORM public.record_anomaly(
        'oversell',
        p_product_id,
        p_actor,
        p_channel,
        p_qty,
        v_stock_before,
        v_shortfall,
        jsonb_build_object(
          'balance_after', v_new_balance,
          'order_id',      p_order_id,
          'order_type',    p_order_type
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- record_anomaly échoue silencieusement — la vente n'est pas annulée.
      NULL;
    END;
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_stock(uuid, integer, text, uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid, integer, text, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.reserve_stock IS
  'WMS-1 (095) : réserve le stock sans jamais refuser (OPTION A). '
  'Raison métier par canal : affiliate→vente_affilie, wholesale→vente_gros, '
  'ecom_perso→vente_ecom. Oversell → record_anomaly best-effort. '
  'RETURNS integer = nouveau solde (peut être < 0). '
  'Remplace la version 093 (raison oversell/sale_reserve remplacée par taxonomie métier).';

-- ── 2.3 restore_stock() — reason = 'retour' ──────────────────────────────────
--
-- Signature identique à 093 (compatibilité ascendante totale).
-- Le paramètre p_reason est conservé mais forcé à 'retour' pour simplifier :
-- un retour est toujours un retour — pas de sous-taxonomie pour l'instant.

DROP FUNCTION IF EXISTS public.restore_stock(uuid, integer, text, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.restore_stock(
  p_product_id uuid,
  p_qty        integer,
  p_channel    text    DEFAULT 'system',
  p_reason     text    DEFAULT 'retour',  -- toujours 'retour' dans la nouvelle taxonomie
  p_order_id   uuid    DEFAULT NULL,
  p_order_type text    DEFAULT NULL,
  p_actor      uuid    DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ré-incrémente le stock (annulation ou retour).
  UPDATE public.products
    SET stock_count = stock_count + p_qty
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restore_stock : produit % introuvable', p_product_id;
  END IF;

  -- Journalise toujours avec 'retour' (nouvelle taxonomie).
  PERFORM public.record_stock_movement(
    p_product_id,
    p_qty,           -- qty_delta positif (entrée)
    p_channel,
    'retour',        -- forcé — la taxonomie 095 ne sous-distingue pas les retours
    p_order_id,
    p_order_type,
    p_actor,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_stock(uuid, integer, text, text, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.restore_stock IS
  'WMS-1 (095) : restaure le stock (annulation ou retour). '
  'Reason forcée à ''retour'' (taxonomie métier 095). '
  'Remplace la version 093. RETURNS void.';

-- ── 2.4 adjust_stock_manual() — recréée avec p_reason validé ─────────────────
--
-- Nouveau paramètre : p_reason text (raisons manuelles uniquement).
-- Raisons autorisées : 'cadeau', 'casse', 'echantillon', 'perte', 'retour', 'reappro'.
-- Raisons 'vente_*' REJETÉES (réservées au système) → errors.invalid_reason.
-- Hooks anomalies intégrés (AJOUT 3) :
--   - casse/perte ≥ c_loss_threshold sur 24h → record_anomaly('abnormal_loss')
--   - ajustements répétés ≥ c_adjust_count_threshold sur 24h → record_anomaly('repeated_adjust')
--
-- SEUILS — heuristiques placeholder pour le futur Gardien IA (POUVOIR 3) :
--   c_loss_threshold         = 20 unités (somme |qty_delta| casse+perte / actor / 24h)
--   c_adjust_count_threshold = 10 ajustements manuels / actor / 24h
-- Ces valeurs sont intentionnellement conservatrices. Elles seront affinées par
-- le Gardien IA sur données réelles. NE PAS les augmenter sans analyse stats.

DROP FUNCTION IF EXISTS public.adjust_stock_manual(uuid, integer, uuid, text);

CREATE OR REPLACE FUNCTION public.adjust_stock_manual(
  p_product_id uuid,
  p_qty_delta  integer,
  p_actor      uuid    DEFAULT NULL,   -- ignoré : acteur réel = auth.uid() (P2-B)
  p_note       text    DEFAULT NULL,
  p_reason     text    DEFAULT 'reappro'  -- nouveau paramètre — raisons manuelles
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Seuils heuristiques pour la détection d'anomalies (Gardien IA — placeholder).
  -- Modifier UNIQUEMENT après analyse statistique des données réelles.
  c_loss_threshold         CONSTANT integer := 20;  -- unités casse+perte / actor / 24h
  c_adjust_count_threshold CONSTANT integer := 10;  -- ajustements manuels / actor / 24h

  v_new_balance    integer;
  v_stock_before   integer;
  v_real_actor     uuid;
  v_loss_24h       integer;
  v_adjust_count   integer;
BEGIN
  -- P2-B : force l'acteur à auth.uid() — p_actor ignoré (non falsifiable).
  v_real_actor := auth.uid();

  -- Gate capacité : admin ou staff avec manage_stock.
  IF NOT public.has_capability('manage_stock') THEN
    RAISE EXCEPTION 'errors.forbidden';
  END IF;

  -- Garde : delta zéro interdit.
  IF p_qty_delta = 0 THEN
    RAISE EXCEPTION 'errors.stock_delta_zero';
  END IF;

  -- Validation de la raison :
  --   Raisons manuelles autorisées : cadeau, casse, echantillon, perte, retour, reappro.
  --   Raisons 'vente_*' RÉSERVÉES au système → rejetées explicitement.
  IF p_reason IN ('vente_affilie', 'vente_gros', 'vente_ecom') THEN
    RAISE EXCEPTION 'errors.invalid_reason';
  END IF;

  IF p_reason NOT IN ('cadeau', 'casse', 'echantillon', 'perte', 'retour', 'reappro') THEN
    RAISE EXCEPTION 'errors.invalid_reason';
  END IF;

  -- Verrou row-level (races concurrentes).
  SELECT stock_count, stock_count + p_qty_delta
  INTO v_stock_before, v_new_balance
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'errors.product_not_found';
  END IF;

  UPDATE public.products
    SET stock_count = v_new_balance
  WHERE id = p_product_id;

  -- Journalise avec v_real_actor (auth.uid()) — non falsifiable.
  PERFORM public.record_stock_movement(
    p_product_id,
    p_qty_delta,
    'manual_adjust',
    p_reason,        -- raison métier validée ci-dessus
    NULL,            -- pas d'order_id
    NULL,            -- pas d'order_type
    v_real_actor,
    p_note
  );

  -- ── Hook CASSE/PERTE anormale ──────────────────────────────────────────────
  -- Si la reason est 'casse' ou 'perte', calcule la somme des |qty_delta| des
  -- mouvements casse+perte du MÊME actor sur les 24 dernières heures.
  -- Si la somme >= c_loss_threshold → anomalie 'abnormal_loss'.
  IF p_reason IN ('casse', 'perte') THEN
    BEGIN
      SELECT COALESCE(SUM(ABS(qty_delta)), 0)
      INTO v_loss_24h
      FROM public.stock_movements
      WHERE actor_id = v_real_actor
        AND reason IN ('casse', 'perte')
        AND created_at >= now() - interval '24 hours';

      IF v_loss_24h >= c_loss_threshold THEN
        PERFORM public.record_anomaly(
          'abnormal_loss',
          p_product_id,
          v_real_actor,
          'manual_adjust',
          ABS(p_qty_delta),
          v_stock_before,
          NULL,    -- shortfall non applicable pour les pertes manuelles
          jsonb_build_object(
            'window_24h_qty', v_loss_24h,
            'reason',         p_reason,
            'threshold',      c_loss_threshold
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Anomalie best-effort — n'annule pas l'ajustement.
      NULL;
    END;
  END IF;

  -- ── Hook AJUSTEMENTS RÉPÉTÉS ──────────────────────────────────────────────
  -- Compte le nombre d'ajustements manuels du même actor sur les 24 dernières heures.
  -- Si >= c_adjust_count_threshold → anomalie 'repeated_adjust'.
  BEGIN
    SELECT COUNT(*)
    INTO v_adjust_count
    FROM public.stock_movements
    WHERE actor_id = v_real_actor
      AND channel = 'manual_adjust'
      AND created_at >= now() - interval '24 hours';

    IF v_adjust_count >= c_adjust_count_threshold THEN
      PERFORM public.record_anomaly(
        'repeated_adjust',
        NULL,   -- product_id NULL : anomalie comportementale actor, pas produit spécifique
        v_real_actor,
        'manual_adjust',
        NULL,
        NULL,
        NULL,
        jsonb_build_object(
          'window_24h_count', v_adjust_count,
          'threshold',        c_adjust_count_threshold
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Anomalie best-effort — n'annule pas l'ajustement.
    NULL;
  END;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_manual(uuid, integer, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock_manual(uuid, integer, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.adjust_stock_manual IS
  'Ajustement manuel du stock (WMS-1 095). SECURITY DEFINER. '
  'Gate has_capability(''manage_stock''). P2-B : p_actor ignoré = auth.uid(). '
  'Nouveau param p_reason : raisons manuelles uniquement '
  '(cadeau/casse/echantillon/perte/retour/reappro). '
  'Raisons vente_* rejetées → errors.invalid_reason. '
  'Hooks anomalies : casse/perte >= 20u/24h → abnormal_loss ; '
  'ajustements >= 10/24h → repeated_adjust. '
  'Seuils heuristiques placeholder (futur Gardien IA). '
  'RETURNS integer = nouveau solde.';


-- =============================================================================
-- ██████████████  AJOUT 3 — TABLE stock_anomalies + record_anomaly  ████████████
-- =============================================================================

-- ── 3.1 Table stock_anomalies — append-only immuable ─────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_anomalies (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  anomaly_type text         NOT NULL CHECK (
                               anomaly_type IN ('oversell', 'abnormal_loss', 'repeated_adjust')
                             ),
  product_id   uuid         REFERENCES public.products(id),  -- nullable (repeated_adjust global)
  actor_id     uuid,
  channel      text,
  qty          integer,
  stock_before integer,
  shortfall    integer,
  detail       jsonb        NOT NULL DEFAULT '{}',
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- Index pour les requêtes admin/Gardien IA les plus fréquentes.
CREATE INDEX IF NOT EXISTS idx_stock_anomalies_created_at
  ON public.stock_anomalies (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_anomalies_actor
  ON public.stock_anomalies (actor_id);

CREATE INDEX IF NOT EXISTS idx_stock_anomalies_type
  ON public.stock_anomalies (anomaly_type);

-- ── 3.2 RLS sur stock_anomalies ──────────────────────────────────────────────
-- Deny par défaut. SELECT : admin OU has_capability('manage_stock').
-- Aucune policy INSERT/UPDATE/DELETE → deny total pour authenticated/anon.
-- INSERT uniquement via record_anomaly() SECURITY DEFINER.

ALTER TABLE public.stock_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_anomalies: admin or manage_stock read" ON public.stock_anomalies;
CREATE POLICY "stock_anomalies: admin or manage_stock read"
  ON public.stock_anomalies
  FOR SELECT TO authenticated
  USING (
    public.my_role() = 'admin'
    OR public.has_capability('manage_stock')
  );

-- ── 3.3 Trigger immutabilité sur stock_anomalies ────────────────────────────
-- Sur le modèle de stock_movements (mig 092).

CREATE OR REPLACE FUNCTION public.stock_anomalies_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'stock_anomalies est append-only (ni UPDATE ni DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_anomalies_immutable ON public.stock_anomalies;
CREATE TRIGGER trg_stock_anomalies_immutable
  BEFORE UPDATE OR DELETE ON public.stock_anomalies
  FOR EACH ROW EXECUTE FUNCTION public.stock_anomalies_immutable();

-- ── 3.4 record_anomaly() — vecteur d'insertion unique ────────────────────────
--
-- Insérer dans stock_anomalies + notifier TOUS les admins (boucle FOR).
-- order_id = NULL dans notifications (FK → wholesale_orders ; pas de liaison directe).
-- REVOKE public/anon/authenticated — appelable uniquement en interne (DEFINER→DEFINER).
--
-- Comportement best-effort intégré : la fonction elle-même n'est PAS dans un
-- sous-bloc BEGIN/EXCEPTION — c'est l'APPELANT qui la wrap (déjà fait dans
-- reserve_stock et adjust_stock_manual). Ainsi, si record_anomaly lève une
-- exception, c'est l'appelant qui l'absorbe silencieusement.

CREATE OR REPLACE FUNCTION public.record_anomaly(
  p_type        text,
  p_product_id  uuid    DEFAULT NULL,
  p_actor       uuid    DEFAULT NULL,
  p_channel     text    DEFAULT NULL,
  p_qty         integer DEFAULT NULL,
  p_stock_before integer DEFAULT NULL,
  p_shortfall   integer DEFAULT NULL,
  p_detail      jsonb   DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
BEGIN
  -- Validation du type (défense en profondeur en plus du CHECK table).
  IF p_type NOT IN ('oversell', 'abnormal_loss', 'repeated_adjust') THEN
    RAISE EXCEPTION 'record_anomaly : type % inconnu', p_type;
  END IF;

  -- Insertion dans le ledger des anomalies.
  INSERT INTO public.stock_anomalies (
    anomaly_type, product_id, actor_id, channel,
    qty, stock_before, shortfall, detail
  ) VALUES (
    p_type, p_product_id, p_actor, p_channel,
    p_qty, p_stock_before, p_shortfall, COALESCE(p_detail, '{}')
  );

  -- Notification de TOUS les admins (best-effort interne — pas de sous-bloc car
  -- record_anomaly est déjà appelée dans un BEGIN/EXCEPTION chez l'appelant).
  FOR v_admin IN
    SELECT id FROM public.profiles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications (
      recipient_id, event, order_id, payload, channels
    ) VALUES (
      v_admin.id,
      'stock_anomaly',
      NULL,  -- order_id NULL : FK notifications → wholesale_orders ; pas de lien direct
      jsonb_build_object(
        'anomaly_type',  p_type,
        'product_id',    p_product_id,
        'actor_id',      p_actor,
        'channel',       p_channel,
        'qty',           p_qty,
        'stock_before',  p_stock_before,
        'shortfall',     p_shortfall,
        'detail',        COALESCE(p_detail, '{}'),
        'ts',            now()
      ),
      ARRAY['in_app']
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- REVOKE total — interne uniquement, aucune RPC cliente possible.
REVOKE ALL ON FUNCTION public.record_anomaly(text, uuid, uuid, text, integer, integer, integer, jsonb)
  FROM public, anon, authenticated;

COMMENT ON FUNCTION public.record_anomaly IS
  'Enregistre une anomalie stock dans stock_anomalies et notifie tous les admins. '
  'SECURITY DEFINER. REVOKE authenticated — interne uniquement. '
  'Types : oversell | abnormal_loss | repeated_adjust. '
  'Journalise la trace immuable (Gardien IA — POUVOIR 3 futur). '
  'WMS-1 migration 095.';

COMMENT ON TABLE public.stock_anomalies IS
  'Ledger append-only des anomalies détectées sur les flux stock (WMS-1, mig 095). '
  'Types : oversell (vente sans stock), abnormal_loss (casse/perte anormale sur 24h), '
  'repeated_adjust (ajustements manuels répétés sur 24h). '
  'Seuils heuristiques placeholder (c_loss_threshold=20, c_adjust_count_threshold=10) — '
  'destinés à être affinés par le futur Gardien IA sur données réelles. '
  'INSERT uniquement via record_anomaly() SECURITY DEFINER. '
  'Aucune policy INSERT/UPDATE/DELETE (deny par défaut) → append-only strict. '
  'SELECT : admin ou has_capability(''manage_stock'').';
