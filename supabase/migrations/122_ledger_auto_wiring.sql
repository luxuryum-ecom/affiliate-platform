-- =============================================================================
-- Migration 122 — BRANCHEMENT AUTO DU GRAND LIVRE DOUBLE-ENTRÉE (121) + bordereaux
-- (idempotent — safe to re-run)
-- =============================================================================
-- But :
--   Faire écrire AUTOMATIQUEMENT le grand livre GLOBAL (121) au fil du cycle de
--   vie d'une commande COD affiliation, et poser le modèle de RÉCONCILIATION du
--   versement livreur (bordereau) — le point exact où l'argent se perdait.
--
--   Additif et NON destructif :
--     - `ledger_entries` (048) = grand livre FACE-AFFILIÉ. INCHANGÉ ici.
--     - `commissions` (013) / `create_payout` (049). INCHANGÉS ici (la machine à
--       états payable = mig 123 / LOT 2). Aucune régression sur le payout.
--     - On N'AJOUTE que : 2 snapshots sur `orders`, l'écriture du grand livre
--       GLOBAL (121) via triggers SECURITY DEFINER, le modèle bordereau livreur,
--       et une RPC de réconciliation admin.
--
-- DÉCOMPOSITION ÉCONOMIQUE (prouvée depuis `calculateNetAffiliateCommission`,
--   src/lib/utils.ts) — par unité :
--     sell_price = factory_cost + platform_margin + delivery + confirmation
--                + packaging + commission_affilié
--   Donc l'encaissement COD (= total_amount) se répartit EXACTEMENT en 6 postes.
--   La somme des écritures = 0 par construction (le résidu d'arrondi éventuel est
--   absorbé par platform_margin_income — JAMAIS par l'affilié ni le fournisseur).
--
-- CONVENTION DE SIGNE (identique à 121) : DÉBIT = +, CRÉDIT = −. solde=SUM(amount).
--
-- Argent : numeric. AUCUN float.
--
-- ÉVÉNEMENTS BRANCHÉS :
--   1. Commande LIVRÉE (COD encaissé par le livreur) → txn `cod_collected` :
--        Débit  cash_in_transit_courier      (+ total encaissé, détenu par livreur)
--        Crédit supplier_payable             (− coût usine figé)
--        Crédit platform_margin_income       (− marge plateforme, + résidu arrondi)
--        Crédit delivery_income              (− provision livraison)
--        Crédit confirmation_income          (− frais confirmation)
--        Crédit packaging_income             (− frais emballage)
--        Crédit affiliate_commission_payable (− commission affilié figée)
--   2. Commande RETOURNÉE/ANNULÉE après livraison → txn `commission_reversal`
--        = contre-passation exacte de `cod_collected` (toutes lignes inversées).
--   3. VERSEMENT LIVREUR RÉCONCILIÉ (bordereau, admin) → txn `courier_remittance` :
--        Débit  platform_cash                (+ cash réellement reçu par la plateforme)
--        Crédit cash_in_transit_courier      (− cash sorti de la détention livreur)
--        Le manque (attendu − reçu) RESTE dans cash_in_transit_courier = créance
--        livreur CHIFFRÉE (fin de la fuite invisible).
--
-- RÈGLE N1 : la commission ne devient PAYABLE qu'après réconciliation du versement
--   livreur. Aujourd'hui `create_payout` (049) ne paie QUE `status='approved'` ;
--   `handle_order_delivered` crée la commission en `'pending'` → livraison ≠ payable
--   est DÉJÀ vrai. Le branchement `pending → payable = bordereau réconcilié` est
--   posé en mig 123 (LOT 2) sur `courier_remittances` défini ici.
-- =============================================================================

-- ── 1. Snapshots figés coût usine & marge plateforme — TABLE STAFF-ONLY ───────
-- @security P0 : ces montants (coût FOURNISSEUR + marge PLATEFORME) ne doivent
-- JAMAIS être lisibles par l'affilié. En colonnes sur `orders`, ils fuyaient :
-- la RLS filtre les LIGNES pas les COLONNES, et l'affilié lit ses propres lignes
-- de `orders` (policy "orders: affiliates read own") → il aurait pu lire
-- factory_cost/platform_margin via REST. On les ISOLE dans une table dédiée
-- RLS staff-only, PLUTÔT que de restreindre le SELECT de `orders` (qui casserait
-- en cascade les policies affilié référençant `orders`, ex. order_proofs —
-- régression type mig 116). L'affilié ne voit QUE sa propre commission
-- (`orders.affiliate_commission_mad_snapshot`, légitime, inchangée).

-- Nettoyage : retirer les colonnes exposées si un brouillon les avait ajoutées.
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS factory_cost_mad,
  DROP COLUMN IF EXISTS platform_margin_mad;

CREATE TABLE IF NOT EXISTS public.order_financial_snapshots (
  order_id            uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  factory_cost_mad    numeric(12,2),   -- coût usine TOTAL figé (products.factory_cost_mad × quantity)
  platform_margin_mad numeric(12,2),   -- marge plateforme TOTALE figée ((platform_price − factory) × qty)
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_financial_snapshots IS
  'Snapshots figés (coût usine + marge plateforme) par commande, pour la répartition double-entrée (122). RLS STAFF-ONLY : jamais lisible par l''affilié (coût fournisseur + marge plateforme = secret).';

ALTER TABLE public.order_financial_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_financial_snapshots: staff read" ON public.order_financial_snapshots;
CREATE POLICY "order_financial_snapshots: staff read"
  ON public.order_financial_snapshots FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin','agent'));
-- Aucune policy INSERT/UPDATE/DELETE : écriture via trigger SECURITY DEFINER / service_role. Deny.

-- Trigger : à la CRÉATION d'une commande, figer coût usine & marge depuis le
-- produit (réplique calculatePlatformPrice). ATOMIQUE avec l'insert commande →
-- aucune fenêtre où le snapshot manque. Remplace le calcul TS côté orders.ts.
CREATE OR REPLACE FUNCTION public.snapshot_order_financials()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p          public.products%ROWTYPE;
  v_qty      numeric;
  v_factory  numeric(12,2);
  v_platform numeric(12,2);
BEGIN
  SELECT * INTO p FROM public.products WHERE id = NEW.product_id;
  v_qty := COALESCE(NEW.quantity, 1);

  IF p.id IS NULL OR p.factory_cost_mad IS NULL THEN
    -- coût inconnu → snapshot NULL (le ledger absorbe en marge, dégradation documentée).
    INSERT INTO public.order_financial_snapshots (order_id, factory_cost_mad, platform_margin_mad)
    VALUES (NEW.id, NULL, NULL) ON CONFLICT (order_id) DO NOTHING;
    RETURN NEW;
  END IF;

  v_factory  := ROUND(p.factory_cost_mad * v_qty, 2);
  v_platform := ROUND(
    (CASE
       WHEN p.platform_margin_type = 'fixed'
         THEN ROUND(p.factory_cost_mad + COALESCE(p.platform_margin_value, 0))
       ELSE ROUND(p.factory_cost_mad * (1 + COALESCE(p.platform_margin_value, 0) / 100.0))
     END - p.factory_cost_mad) * v_qty, 2);

  INSERT INTO public.order_financial_snapshots (order_id, factory_cost_mad, platform_margin_mad)
  VALUES (NEW.id, v_factory, v_platform) ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_order_financials ON public.orders;
CREATE TRIGGER trg_snapshot_order_financials
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_financials();

-- Backfill des commandes existantes (réplique calculatePlatformPrice).
INSERT INTO public.order_financial_snapshots (order_id, factory_cost_mad, platform_margin_mad)
SELECT o.id,
       ROUND(COALESCE(p.factory_cost_mad, 0) * o.quantity, 2),
       ROUND((CASE
                WHEN p.platform_margin_type = 'fixed'
                  THEN ROUND(COALESCE(p.factory_cost_mad, 0) + COALESCE(p.platform_margin_value, 0))
                ELSE ROUND(COALESCE(p.factory_cost_mad, 0) * (1 + COALESCE(p.platform_margin_value, 0) / 100.0))
              END - COALESCE(p.factory_cost_mad, 0)) * o.quantity, 2)
FROM public.orders o
JOIN public.products p ON p.id = o.product_id
ON CONFLICT (order_id) DO NOTHING;

-- ── 2. Modèle bordereau / versement livreur (réconciliation manuelle admin) ──
-- Fondation partagée LOT 1 (mouvement platform_cash) + LOT 2 (passage payable).
-- Manuel aujourd'hui ; l'intégration transporteur temps réel (Ozone/Cathedis,
-- webhooks signés) = module N2, DÉPENDANCE EXTERNE (clés API) — NON couverte ici.
CREATE TABLE IF NOT EXISTS public.courier_remittances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_name       text NOT NULL,
  courier_id         uuid,                       -- futur : REFERENCES profiles(id) quand rôle livreur
  expected_amount_mad numeric(12,2) NOT NULL DEFAULT 0 CHECK (expected_amount_mad >= 0),
  received_amount_mad numeric(12,2) NOT NULL CHECK (received_amount_mad >= 0),
  currency           text NOT NULL DEFAULT 'MAD' REFERENCES public.currencies(code),
  status             text NOT NULL DEFAULT 'reconciled' CHECK (status IN ('open','reconciled')),
  reference          text,
  notes              text,
  idempotency_key    text NOT NULL UNIQUE,
  reconciled_at      timestamptz,
  reconciled_by      uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.courier_remittances IS
  'Bordereaux de versement livreur (réconciliation manuelle admin). expected−received = créance livreur restant dans cash_in_transit_courier. Base du passage commission payable (N1, mig 123).';

-- Lien bordereau ↔ commandes couvertes (1 commande = au plus 1 bordereau).
CREATE TABLE IF NOT EXISTS public.courier_remittance_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id       uuid NOT NULL REFERENCES public.courier_remittances(id) ON DELETE CASCADE,
  order_id            uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  collected_amount_mad numeric(12,2) NOT NULL DEFAULT 0 CHECK (collected_amount_mad >= 0),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_remittance_orders_remittance
  ON public.courier_remittance_orders (remittance_id);

COMMENT ON TABLE public.courier_remittance_orders IS
  'Commandes couvertes par un bordereau livreur. UNIQUE(order_id) = une commande réconciliée une seule fois.';

-- ── 3. RLS (deny par défaut) : staff uniquement ──────────────────────────────
ALTER TABLE public.courier_remittances       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_remittance_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_remittances: staff read" ON public.courier_remittances;
CREATE POLICY "courier_remittances: staff read"
  ON public.courier_remittances FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin','agent'));

DROP POLICY IF EXISTS "courier_remittance_orders: staff read" ON public.courier_remittance_orders;
CREATE POLICY "courier_remittance_orders: staff read"
  ON public.courier_remittance_orders FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin','agent'));

-- Aucune policy INSERT/UPDATE/DELETE : écriture EXCLUSIVEMENT via la RPC
-- SECURITY DEFINER ci-dessous (ou service_role). Deny par défaut.

-- ── 4. Helper interne : ajouter une écriture (skip si montant nul) ────────────
-- Contrainte 121 : ledger_postings.amount <> 0. On ignore proprement les postes nuls.
CREATE OR REPLACE FUNCTION public.ledger2_add_posting(
  p_txn_id     uuid,
  p_code       text,
  p_amount     numeric,
  p_party_type text DEFAULT NULL,
  p_party_id   uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF p_amount IS NULL OR ROUND(p_amount, 2) = 0 THEN
    RETURN;  -- poste nul : rien à écrire
  END IF;
  SELECT id INTO v_account_id FROM public.ledger_accounts WHERE code = p_code;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'Compte ledger inconnu : %', p_code;
  END IF;
  INSERT INTO public.ledger_postings
    (transaction_id, account_id, party_type, party_id, amount, currency)
  VALUES (p_txn_id, v_account_id, p_party_type, p_party_id, ROUND(p_amount, 2), 'MAD');
END;
$$;

-- ── 5. Écriture de l'encaissement COD (débit cash_in_transit_courier) ─────────
-- Interne, SECURITY DEFINER (écrit directement les tables 121 — contourne la RLS
-- et la garde admin du RPC public, car le trigger peut être déclenché par un
-- agent/livreur, pas seulement un admin). Idempotent (idempotency_key unique).
CREATE OR REPLACE FUNCTION public.ledger2_post_cod_collected(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o            public.orders%ROWTYPE;
  v_txn        uuid;
  v_qty        numeric;
  v_total      numeric(12,2);
  v_factory    numeric(12,2);
  v_commission numeric(12,2);
  v_delivery   numeric(12,2);
  v_confirm    numeric(12,2);
  v_packaging  numeric(12,2);
  v_margin     numeric(12,2);
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o.id IS NULL THEN RETURN; END IF;

  -- Idempotence : ne pas re-poster un encaissement déjà écrit.
  IF EXISTS (SELECT 1 FROM public.ledger_transactions
             WHERE idempotency_key = 'cod_collected:' || p_order_id::text) THEN
    RETURN;
  END IF;

  v_qty        := COALESCE(o.quantity, 1);
  v_total      := COALESCE(o.total_amount, 0);
  SELECT s.factory_cost_mad INTO v_factory
    FROM public.order_financial_snapshots s WHERE s.order_id = p_order_id;
  v_factory    := COALESCE(v_factory, 0);
  v_commission := COALESCE(o.affiliate_commission_mad_snapshot, o.commission_amount, 0);
  v_delivery   := ROUND(COALESCE(o.delivery_fee_snapshot, 0)     * v_qty, 2);
  v_confirm    := ROUND(COALESCE(o.confirmation_fee_snapshot, 0) * v_qty, 2);
  v_packaging  := ROUND(COALESCE(o.packaging_fee_snapshot, 0)    * v_qty, 2);
  -- Marge = RÉSIDU pour équilibrer exactement (la plateforme absorbe l'arrondi).
  v_margin     := ROUND(v_total - v_factory - v_commission - v_delivery - v_confirm - v_packaging, 2);

  -- Rien encaissé (commande à 0) → rien à écrire.
  IF ROUND(v_total, 2) = 0 THEN RETURN; END IF;

  INSERT INTO public.ledger_transactions (kind, order_id, currency, idempotency_key, metadata)
  VALUES ('cod_collected', p_order_id, 'MAD', 'cod_collected:' || p_order_id::text,
          jsonb_build_object('source', 'trigger:handle_order_delivered'))
  RETURNING id INTO v_txn;

  -- Débit : cash détenu par le livreur.
  PERFORM public.ledger2_add_posting(v_txn, 'cash_in_transit_courier',  v_total,       'courier',  NULL);
  -- Crédits (négatifs) : répartition exacte de l'encaissement.
  PERFORM public.ledger2_add_posting(v_txn, 'supplier_payable',            -v_factory,    'supplier', NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'delivery_income',             -v_delivery,   'platform', NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'confirmation_income',         -v_confirm,    'platform', NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'packaging_income',            -v_packaging,  'platform', NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'affiliate_commission_payable',-v_commission, 'affiliate', o.affiliate_id);
  PERFORM public.ledger2_add_posting(v_txn, 'platform_margin_income',      -v_margin,     'platform', NULL);
  -- La contrainte trigger déférée (121) vérifie somme=0 au COMMIT.
END;
$$;

-- ── 6. Contre-passation (retour / annulation après livraison) ────────────────
CREATE OR REPLACE FUNCTION public.ledger2_post_cod_reversal(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o            public.orders%ROWTYPE;
  v_txn        uuid;
  v_qty        numeric;
  v_total      numeric(12,2);
  v_factory    numeric(12,2);
  v_commission numeric(12,2);
  v_delivery   numeric(12,2);
  v_confirm    numeric(12,2);
  v_packaging  numeric(12,2);
  v_margin     numeric(12,2);
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o.id IS NULL THEN RETURN; END IF;

  -- N'inverser QUE si l'encaissement avait été posté, et une seule fois.
  IF NOT EXISTS (SELECT 1 FROM public.ledger_transactions
                 WHERE idempotency_key = 'cod_collected:' || p_order_id::text) THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ledger_transactions
             WHERE idempotency_key = 'cod_reversal:' || p_order_id::text) THEN
    RETURN;
  END IF;

  v_qty        := COALESCE(o.quantity, 1);
  v_total      := COALESCE(o.total_amount, 0);
  SELECT s.factory_cost_mad INTO v_factory
    FROM public.order_financial_snapshots s WHERE s.order_id = p_order_id;
  v_factory    := COALESCE(v_factory, 0);
  v_commission := COALESCE(o.affiliate_commission_mad_snapshot, o.commission_amount, 0);
  v_delivery   := ROUND(COALESCE(o.delivery_fee_snapshot, 0)     * v_qty, 2);
  v_confirm    := ROUND(COALESCE(o.confirmation_fee_snapshot, 0) * v_qty, 2);
  v_packaging  := ROUND(COALESCE(o.packaging_fee_snapshot, 0)    * v_qty, 2);
  v_margin     := ROUND(v_total - v_factory - v_commission - v_delivery - v_confirm - v_packaging, 2);

  IF ROUND(v_total, 2) = 0 THEN RETURN; END IF;

  INSERT INTO public.ledger_transactions (kind, order_id, currency, idempotency_key, metadata)
  VALUES ('commission_reversal', p_order_id, 'MAD', 'cod_reversal:' || p_order_id::text,
          jsonb_build_object('source', 'trigger:handle_order_status_reversal', 'reverses', 'cod_collected:' || p_order_id::text))
  RETURNING id INTO v_txn;

  -- Toutes les lignes inversées (contre-passation exacte).
  PERFORM public.ledger2_add_posting(v_txn, 'cash_in_transit_courier',  -v_total,      'courier',  NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'supplier_payable',             v_factory,    'supplier', NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'delivery_income',              v_delivery,   'platform', NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'confirmation_income',          v_confirm,    'platform', NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'packaging_income',             v_packaging,  'platform', NULL);
  PERFORM public.ledger2_add_posting(v_txn, 'affiliate_commission_payable', v_commission, 'affiliate', o.affiliate_id);
  PERFORM public.ledger2_add_posting(v_txn, 'platform_margin_income',       v_margin,     'platform', NULL);
END;
$$;

-- ── 7. Extension des triggers commande EXISTANTS (corps 048 conservé) ─────────
-- handle_order_delivered() : logique 009/048 conservée À L'IDENTIQUE + AJOUT de
-- l'écriture du grand livre GLOBAL (121) via ledger2_post_cod_collected().
CREATE OR REPLACE FUNCTION public.handle_order_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_commission numeric(10,2);
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status <> 'delivered'
     AND NEW.affiliate_id IS NOT NULL
  THEN
    v_commission := COALESCE(NEW.affiliate_commission_mad_snapshot, NEW.commission_amount);

    IF v_commission > 0 THEN
      INSERT INTO public.commissions (affiliate_id, order_id, amount, status)
      VALUES (NEW.affiliate_id, NEW.id, v_commission, 'pending')
      ON CONFLICT (order_id) DO NOTHING;

      -- Grand livre FACE-AFFILIÉ (048/052) — inchangé (colonnes devise 052 conservées).
      INSERT INTO public.ledger_entries (affiliate_id, entry_type, amount, order_id, commission_id, idempotency_key, metadata,
                                         currency, amount_source, fx_rate_to_mad)
      SELECT NEW.affiliate_id, 'commission_earned', v_commission, NEW.id, c.id,
             'commission_earned:' || NEW.id::text, '{}'::jsonb,
             'MAD', v_commission, 1
      FROM public.commissions c WHERE c.order_id = NEW.id
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END IF;

  -- AJOUT 122 — grand livre GLOBAL (121) : encaissement COD à la livraison.
  -- Hors du IF affiliate : une commande LIVRÉE encaisse même sans affilié
  -- (la commission vaut alors 0 et son poste est simplement omis).
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
    PERFORM public.ledger2_post_cod_collected(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- handle_order_status_reversal() : logique 048 conservée + AJOUT contre-passation 121.
CREATE OR REPLACE FUNCTION public.handle_order_status_reversal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'delivered'
     AND NEW.status IN ('returned', 'cancelled')
  THEN
    UPDATE public.commissions
      SET reversed    = true,
          reversed_at = now()
      WHERE order_id = NEW.id
        AND reversed  = false;

    -- Grand livre FACE-AFFILIÉ (048/052) — inchangé (colonnes devise 052 conservées).
    INSERT INTO public.ledger_entries (affiliate_id, entry_type, amount, order_id, commission_id, idempotency_key, metadata,
                                       currency, amount_source, fx_rate_to_mad)
    SELECT c.affiliate_id, 'commission_reversed', -c.amount, NEW.id, c.id,
           'commission_reversed:' || c.id::text, '{}'::jsonb,
           'MAD', -c.amount, 1
    FROM public.commissions c
    WHERE c.order_id = NEW.id AND c.reversed = true
    ON CONFLICT (idempotency_key) DO NOTHING;

    -- AJOUT 122 — grand livre GLOBAL (121) : contre-passation de l'encaissement.
    PERFORM public.ledger2_post_cod_reversal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- ── 8. RPC de réconciliation d'un versement livreur (admin) ──────────────────
-- Crée le bordereau, lie les commandes couvertes, et poste le mouvement
-- platform_cash ← cash_in_transit_courier pour le montant RÉELLEMENT reçu.
-- Le manque (attendu − reçu) reste dans cash_in_transit_courier = créance livreur.
-- Idempotent (idempotency_key sur le bordereau + sur la txn ledger).
CREATE OR REPLACE FUNCTION public.reconcile_courier_remittance(
  p_courier_name     text,
  p_received_amount  numeric,
  p_order_ids        uuid[],
  p_idempotency_key  text,
  p_reference        text DEFAULT NULL,
  p_notes            text DEFAULT NULL,
  p_courier_id       uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_remit_id uuid;
  v_existing uuid;
  v_expected numeric(12,2);
  v_txn      uuid;
  v_oid      uuid;
BEGIN
  -- Autorisation (défense en profondeur).
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Non autorisé : réconciliation bordereau réservée admin/service_role';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Clé d''idempotence requise';
  END IF;
  IF p_received_amount IS NULL OR p_received_amount < 0 THEN
    RAISE EXCEPTION 'Montant reçu invalide';
  END IF;

  -- Idempotence : rejeu même clé → retourne le bordereau existant.
  SELECT id INTO v_existing FROM public.courier_remittances WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Montant attendu = somme des encaissements COD des commandes couvertes.
  SELECT COALESCE(SUM(COALESCE(total_amount, 0)), 0) INTO v_expected
  FROM public.orders WHERE id = ANY(COALESCE(p_order_ids, ARRAY[]::uuid[]));

  INSERT INTO public.courier_remittances
    (courier_name, courier_id, expected_amount_mad, received_amount_mad, status,
     reference, notes, idempotency_key, reconciled_at, reconciled_by)
  VALUES (p_courier_name, p_courier_id, v_expected, ROUND(p_received_amount, 2), 'reconciled',
          p_reference, p_notes, p_idempotency_key, now(), auth.uid())
  RETURNING id INTO v_remit_id;

  -- Lier les commandes (UNIQUE(order_id) → une commande réconciliée une seule fois).
  FOREACH v_oid IN ARRAY COALESCE(p_order_ids, ARRAY[]::uuid[])
  LOOP
    INSERT INTO public.courier_remittance_orders (remittance_id, order_id, collected_amount_mad)
    SELECT v_remit_id, o.id, COALESCE(o.total_amount, 0)
    FROM public.orders o WHERE o.id = v_oid
    ON CONFLICT (order_id) DO NOTHING;
  END LOOP;

  -- Écriture ledger GLOBAL (121) : cash reçu par la plateforme.
  IF ROUND(p_received_amount, 2) > 0 THEN
    INSERT INTO public.ledger_transactions (kind, currency, idempotency_key, metadata, created_by)
    VALUES ('courier_remittance', 'MAD', 'courier_remittance:' || v_remit_id::text,
            jsonb_build_object('remittance_id', v_remit_id, 'expected', v_expected, 'received', ROUND(p_received_amount, 2)),
            auth.uid())
    RETURNING id INTO v_txn;

    PERFORM public.ledger2_add_posting(v_txn, 'platform_cash',            ROUND(p_received_amount, 2), 'platform', NULL);
    PERFORM public.ledger2_add_posting(v_txn, 'cash_in_transit_courier', -ROUND(p_received_amount, 2), 'courier',  p_courier_id);
  END IF;

  RETURN v_remit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_courier_remittance(text, numeric, uuid[], text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_courier_remittance(text, numeric, uuid[], text, text, text, uuid)
  TO authenticated, service_role;

-- ── P1 @security — durcissement : les fonctions internes ledger2_* sont
-- SECURITY DEFINER (contournent la RLS de orders). Sans REVOKE, elles seraient
-- EXECUTE-granted à PUBLIC → appelables en RPC PostgREST par tout `authenticated`
-- pour FORGER une écriture ledger (cod_collected/reversal) sur n'importe quelle
-- commande, hors du seul chemin autorisé (trigger `status='delivered'` réservé
-- admin). Sous Supabase, ces fonctions du schéma public reçoivent un GRANT
-- EXECUTE DIRECT à anon+authenticated (default privileges) → un REVOKE FROM
-- PUBLIC seul NE SUFFIT PAS. On révoque explicitement public+anon+authenticated
-- (précédent repo record_stock_movement, mig 092/099/105). AUCUN GRANT ensuite :
-- seuls les triggers (owner) et service_role exécutent → forge impossible.
REVOKE ALL ON FUNCTION public.ledger2_add_posting(uuid, text, numeric, text, uuid)   FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ledger2_post_cod_collected(uuid)                        FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ledger2_post_cod_reversal(uuid)                         FROM public, anon, authenticated;

-- ── 9. Vue confort : créance livreur (cash en transit non encore réconcilié) ──
CREATE OR REPLACE VIEW public.v_courier_cash_in_transit
WITH (security_invoker = true) AS
  SELECT
    COALESCE(SUM(p.amount), 0) AS balance_mad
  FROM public.ledger_postings p
  JOIN public.ledger_accounts a ON a.id = p.account_id
  WHERE a.code = 'cash_in_transit_courier';

COMMENT ON VIEW public.v_courier_cash_in_transit IS
  'Solde global cash_in_transit_courier = argent encaissé par les livreurs pas encore réconcilié (créance/fuite chiffrée).';
