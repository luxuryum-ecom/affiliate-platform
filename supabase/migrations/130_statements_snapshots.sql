-- =============================================================================
-- Migration 130 — Relevés PDF figés (module Livreurs, Lot F) — COUCHE DONNÉES
-- =============================================================================
-- Réf : grand livre 048-052 (ledger_entries, create_payout 049), couriers 126,
-- v_courier_balances 126, courier_remittances/_orders 122, courier_returns 128.
--
-- PÉRIMÈTRE — ADDITIF PUR, ZÉRO TRIGGER/RPC FINANCIER EXISTANT TOUCHÉ :
--   • `payouts.payment_method` : métadonnée descriptive (virement/cash/cheque/autre),
--     nullable. N'entre JAMAIS dans un calcul de montant — pur affichage sur le relevé.
--   • Table `payout_statements` : SNAPSHOT FIGÉ (jsonb immuable) du relevé affilié au
--     moment d'un payout. 1 relevé / payout (UNIQUE). Append-only immuable.
--   • Table `courier_statements` : SNAPSHOT FIGÉ du relevé livreur signable sur une
--     période choisie par l'admin. Plusieurs relevés / livreur (périodes distinctes).
--     Append-only immuable.
--   • RPC `generate_payout_statement(payout_id)` : construit le snapshot depuis le
--     GRAND LIVRE (ledger_entries entry_type='payout' → commissions → orders). AUCUNE
--     somme reconstruite hors SQL. Garde-fou : total_snapshot = payouts.amount, sinon
--     EXCEPTION (divergence grand livre interdite). Idempotent (ON CONFLICT payout_id).
--   • RPC `generate_courier_statement(courier_id, start, end)` : SOLDE FINAL lu depuis
--     `v_courier_balances` (grand livre, aucun calcul parallèle) ; activité de période
--     (ramassages, livraisons+cash, retours dépôt/société, pertes chiffrées, cash versé)
--     agrégée depuis les tables opérationnelles source. Snapshot figé horodaté.
--
-- DÉCISION D'ARCHI (verrouillée) : un relevé est une PHOTO immuable. Les RPC de
-- génération sont SECURITY DEFINER admin-only ; les tables n'ont AUCUNE policy
-- INSERT/UPDATE/DELETE (écriture exclusivement via ces RPC / service_role).
--
-- Idempotente : CREATE ... IF NOT EXISTS / OR REPLACE, DROP POLICY/TRIGGER avant
-- recréation. Zéro donnée financière existante modifiée.
-- =============================================================================

-- ── 1. payouts.payment_method (métadonnée descriptive, additive) ─────────────

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('virement', 'cash', 'cheque', 'autre'));

COMMENT ON COLUMN public.payouts.payment_method IS
  'Méthode de règlement DÉCLARATIVE du payout (virement/cash/cheque/autre), Lot F mig 130. '
  'Métadonnée d''affichage sur le relevé PDF — n''entre dans AUCUN calcul de montant.';

-- ── 2. Table payout_statements (relevé affilié figé) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.payout_statements (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id      uuid          NOT NULL UNIQUE REFERENCES public.payouts(id),
  affiliate_id   uuid          NOT NULL REFERENCES public.profiles(id),
  period_start   date,
  period_end     date,
  total_amount   numeric(12,2) NOT NULL,
  payment_method text,
  reference      text,
  -- Photo FIGÉE : entête + lignes (réf commande, date, montant commande, commission).
  snapshot       jsonb         NOT NULL,
  generated_at   timestamptz   NOT NULL DEFAULT now(),
  generated_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_payout_statements_affiliate
  ON public.payout_statements (affiliate_id);

COMMENT ON TABLE public.payout_statements IS
  'Relevé PDF affilié FIGÉ au payout (Lot F, mig 130). snapshot jsonb = photo immuable '
  'construite depuis le grand livre (ledger_entries payout → commissions → orders) au moment '
  'de la génération : une fois créé, ne change JAMAIS même si des écritures arrivent après. '
  'total_amount = payouts.amount (garde-fou RPC). Append-only immuable. Écriture EXCLUSIVEMENT '
  'via generate_payout_statement / service_role.';

ALTER TABLE public.payout_statements ENABLE ROW LEVEL SECURITY;

-- SELECT : l'affilié voit UNIQUEMENT ses relevés ; l'admin voit tout. Aucune fuite
-- inter-affiliés (cloisonnement @security). service_role conservé (RPC/jobs).
DROP POLICY IF EXISTS "payout_statements: own or admin read" ON public.payout_statements;
CREATE POLICY "payout_statements: own or admin read"
  ON public.payout_statements FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() OR public.my_role() = 'admin');
-- Aucune policy INSERT/UPDATE/DELETE → deny total (écriture via RPC SECURITY DEFINER).

-- Immuabilité append-only (calque courier_product_debts_immutable mig 126).
CREATE OR REPLACE FUNCTION public.payout_statements_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'payout_statements est append-only (relevé figé : ni UPDATE ni DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_payout_statements_immutable ON public.payout_statements;
CREATE TRIGGER trg_payout_statements_immutable
  BEFORE UPDATE OR DELETE ON public.payout_statements
  FOR EACH ROW EXECUTE FUNCTION public.payout_statements_immutable();

-- ── 3. Table courier_statements (relevé livreur signable figé) ───────────────

CREATE TABLE IF NOT EXISTS public.courier_statements (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id        uuid          NOT NULL REFERENCES public.couriers(id),
  period_start      date          NOT NULL,
  period_end        date          NOT NULL,
  -- SOLDE FINAL = v_courier_balances au moment du snapshot (grand livre, source unique).
  final_balance_mad numeric(12,2) NOT NULL,
  cash_owed_mad     numeric(12,2) NOT NULL,
  product_debt_mad  numeric(12,2) NOT NULL,
  snapshot          jsonb         NOT NULL,
  generated_at      timestamptz   NOT NULL DEFAULT now(),
  generated_by      uuid
);

CREATE INDEX IF NOT EXISTS idx_courier_statements_courier
  ON public.courier_statements (courier_id, generated_at DESC);

COMMENT ON TABLE public.courier_statements IS
  'Relevé livreur signable FIGÉ (Lot F, mig 130) — preuve papier anti-litige. final_balance_mad / '
  'cash_owed_mad / product_debt_mad = v_courier_balances (grand livre) au moment du snapshot. '
  'snapshot jsonb = activité de période (ramassages, livraisons+cash, retours dépôt/société, pertes, '
  'cash versé). Append-only immuable. Écriture EXCLUSIVEMENT via generate_courier_statement / '
  'service_role. RLS SELECT admin-only (livreurs = données admin, Lot A).';

ALTER TABLE public.courier_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_statements: admin read" ON public.courier_statements;
CREATE POLICY "courier_statements: admin read"
  ON public.courier_statements FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');
-- Aucune policy INSERT/UPDATE/DELETE → deny total.

CREATE OR REPLACE FUNCTION public.courier_statements_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'courier_statements est append-only (relevé figé : ni UPDATE ni DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_courier_statements_immutable ON public.courier_statements;
CREATE TRIGGER trg_courier_statements_immutable
  BEFORE UPDATE OR DELETE ON public.courier_statements
  FOR EACH ROW EXECUTE FUNCTION public.courier_statements_immutable();

-- ── 4. RPC generate_payout_statement — snapshot figé depuis le grand livre ───
-- Source des montants : ledger_entries (entry_type='payout', payout_id) — la seule
-- table qui lie un payout aux commissions qu'il a soldées (mig 049). AUCUNE somme
-- reconstruite hors SQL. Garde-fou : total lignes = payouts.amount, sinon EXCEPTION.

CREATE OR REPLACE FUNCTION public.generate_payout_statement(p_payout_id uuid)
RETURNS public.payout_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing   public.payout_statements;
  v_stmt       public.payout_statements;
  v_payout     public.payouts;
  v_affiliate  text;
  v_lines      jsonb;
  v_total      numeric(12,2);
  v_pstart     date;
  v_pend       date;
  v_count      integer;
BEGIN
  -- 0. Garde AUTORISATION (défense en profondeur) : admin uniquement.
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Non autorisé : seul un administrateur peut générer un relevé'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1. Idempotence : 1 relevé FIGÉ par payout. Rejeu → renvoyer l'existant tel quel.
  SELECT * INTO v_existing FROM public.payout_statements WHERE payout_id = p_payout_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- 2. Payout source.
  SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout introuvable : %', p_payout_id;
  END IF;

  SELECT full_name INTO v_affiliate FROM public.profiles WHERE id = v_payout.affiliate_id;

  -- 3. Lignes du relevé DEPUIS LE GRAND LIVRE : chaque écriture 'payout' négative
  --    (mig 049) → 1 commission soldée → 1 commande. Montant commission = -ledger.amount.
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'ref',         upper(left(o.id::text, 8)),
        'orderId',     o.id,
        'date',        o.created_at,
        'orderAmount', o.total_amount,
        'commission',  (-le.amount)
      ) ORDER BY o.created_at
    ), '[]'::jsonb),
    COALESCE(SUM(-le.amount), 0),
    MIN(o.created_at)::date,
    MAX(o.created_at)::date,
    COUNT(*)
  INTO v_lines, v_total, v_pstart, v_pend, v_count
  FROM public.ledger_entries le
  JOIN public.commissions c ON c.id = le.commission_id
  JOIN public.orders o      ON o.id = c.order_id
  WHERE le.payout_id = p_payout_id
    AND le.entry_type = 'payout';

  -- 4. GARDE-FOU FINANCIER (divergence grand livre interdite, @finance) : le total des
  --    lignes DOIT égaler le montant du payout. Sinon, on refuse de figer un relevé faux.
  IF v_total IS DISTINCT FROM v_payout.amount THEN
    RAISE EXCEPTION 'Relevé incohérent : total lignes (%) <> montant payout (%)',
      v_total, v_payout.amount;
  END IF;

  -- 5. Insérer le snapshot FIGÉ (idempotent au cas où appels concurrents).
  INSERT INTO public.payout_statements (
    payout_id, affiliate_id, period_start, period_end, total_amount,
    payment_method, reference, snapshot, generated_by
  )
  VALUES (
    p_payout_id, v_payout.affiliate_id, v_pstart, v_pend, v_total,
    v_payout.payment_method, v_payout.reference,
    jsonb_build_object(
      'affiliateName', COALESCE(v_affiliate, ''),
      'paidAt',        v_payout.paid_at,
      'reference',     v_payout.reference,
      'paymentMethod', v_payout.payment_method,
      'notes',         v_payout.notes,
      'period',        jsonb_build_object('start', v_pstart, 'end', v_pend),
      'lines',         v_lines,
      'count',         v_count,
      'total',         v_total
    ),
    auth.uid()
  )
  ON CONFLICT (payout_id) DO NOTHING
  RETURNING * INTO v_stmt;

  IF v_stmt.id IS NULL THEN
    SELECT * INTO v_stmt FROM public.payout_statements WHERE payout_id = p_payout_id;
  END IF;

  RETURN v_stmt;
END;
$$;

COMMENT ON FUNCTION public.generate_payout_statement(uuid) IS
  'Fige le relevé PDF d''un payout (Lot F, mig 130) depuis le grand livre. Idempotent (1/payout). '
  'Garde-fou : total lignes = payouts.amount sinon EXCEPTION. Admin-only (my_role). Écrit dans '
  'payout_statements (append-only). Le PDF est rendu à la volée depuis ce snapshot figé.';

REVOKE ALL ON FUNCTION public.generate_payout_statement(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_payout_statement(uuid) TO authenticated, service_role;

-- ── 5. RPC generate_courier_statement — relevé signable figé sur une période ─
-- SOLDE FINAL depuis v_courier_balances (grand livre) ; activité de période agrégée
-- depuis les tables opérationnelles source (scan_events pickup, orders delivered,
-- courier_returns, courier_product_debts, courier_remittance_orders).

CREATE OR REPLACE FUNCTION public.generate_courier_statement(
  p_courier_id uuid,
  p_start      date,
  p_end        date
)
RETURNS public.courier_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stmt        public.courier_statements;
  v_courier     public.couriers;
  v_bal         record;
  v_pickups     integer;
  v_deliv_cnt   integer;
  v_deliv_cash  numeric(12,2);
  v_ret_depot   integer;
  v_ret_company integer;
  v_loss_cnt    integer;
  v_loss_amt    numeric(12,2);
  v_cash_remit  numeric(12,2);
  v_end_excl    timestamptz;
BEGIN
  -- 0. Garde AUTORISATION admin-only (défense en profondeur).
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Non autorisé : seul un administrateur peut générer un relevé livreur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_courier_id IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'Livreur et période (début, fin) requis';
  END IF;
  IF p_end < p_start THEN
    RAISE EXCEPTION 'Période invalide : fin (%) avant début (%)', p_end, p_start;
  END IF;

  SELECT * INTO v_courier FROM public.couriers WHERE id = p_courier_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Livreur introuvable : %', p_courier_id;
  END IF;

  -- Fin de période INCLUSIVE au jour près : [p_start 00:00, p_end+1 00:00).
  v_end_excl := (p_end + 1)::timestamptz;

  -- 1. SOLDE FINAL = grand livre (v_courier_balances). Source unique, aucun calcul parallèle.
  --    L'admin guard ci-dessus garantit que le rempart staff de la vue laisse passer la ligne.
  SELECT cash_owed_mad, product_debt_mad, total_balance_mad
    INTO v_bal
    FROM public.v_courier_balances
   WHERE id = p_courier_id;
  IF NOT FOUND THEN
    -- Livreur sans aucune activité financière : soldes à zéro.
    v_bal.cash_owed_mad := 0; v_bal.product_debt_mad := 0; v_bal.total_balance_mad := 0;
  END IF;

  -- 2. Ramassages (scan_events pickup_dispatch) des commandes de CE livreur, dans la période.
  SELECT COUNT(*) INTO v_pickups
    FROM public.scan_events se
    JOIN public.orders o ON o.id = se.order_id
   WHERE se.scan_type = 'pickup_dispatch'
     AND o.courier_id = p_courier_id
     AND se.scanned_at >= p_start::timestamptz AND se.scanned_at < v_end_excl;

  -- 3. Livraisons + cash encaissé (orders delivered de CE livreur, dans la période).
  SELECT COUNT(*), COALESCE(SUM(o.total_amount), 0)
    INTO v_deliv_cnt, v_deliv_cash
    FROM public.orders o
   WHERE o.courier_id = p_courier_id
     AND o.status = 'delivered'
     AND o.delivered_at >= p_start::timestamptz AND o.delivered_at < v_end_excl;

  -- 4. Retours confirmés dépôt / société (courier_returns), confirmés dans la période.
  SELECT
    COUNT(*) FILTER (WHERE cr.state = 'confirmed_depot'),
    COUNT(*) FILTER (WHERE cr.state = 'confirmed_company')
    INTO v_ret_depot, v_ret_company
    FROM public.courier_returns cr
   WHERE cr.courier_id = p_courier_id
     AND cr.confirmed_at >= p_start::timestamptz AND cr.confirmed_at < v_end_excl;

  -- 5. Pertes chiffrées (créances produit POSITIVES) créées dans la période.
  SELECT COUNT(*) FILTER (WHERE d.amount_mad > 0), COALESCE(SUM(d.amount_mad), 0)
    INTO v_loss_cnt, v_loss_amt
    FROM public.courier_product_debts d
   WHERE d.courier_id = p_courier_id
     AND d.created_at >= p_start::timestamptz AND d.created_at < v_end_excl;

  -- 6. Cash versé = allocation EXACTE par commande (courier_remittance_orders.collected_amount_mad)
  --    des commandes de CE livreur, sur des remises réconciliées dans la période.
  SELECT COALESCE(SUM(cro.collected_amount_mad), 0)
    INTO v_cash_remit
    FROM public.courier_remittance_orders cro
    JOIN public.courier_remittances rem ON rem.id = cro.remittance_id
    JOIN public.orders o ON o.id = cro.order_id
   WHERE o.courier_id = p_courier_id
     AND rem.status = 'reconciled'
     AND rem.reconciled_at >= p_start::timestamptz AND rem.reconciled_at < v_end_excl;

  -- 7. Figer le snapshot horodaté.
  INSERT INTO public.courier_statements (
    courier_id, period_start, period_end,
    final_balance_mad, cash_owed_mad, product_debt_mad, snapshot, generated_by
  )
  VALUES (
    p_courier_id, p_start, p_end,
    v_bal.total_balance_mad, v_bal.cash_owed_mad, v_bal.product_debt_mad,
    jsonb_build_object(
      'courierName',  v_courier.name,
      'courierType',  v_courier.courier_type,
      'companyName',  v_courier.company_name,
      'period',       jsonb_build_object('start', p_start, 'end', p_end),
      'activity',     jsonb_build_object(
        'pickups',        v_pickups,
        'deliveries',     jsonb_build_object('count', v_deliv_cnt, 'cashCollected', v_deliv_cash),
        'returnsDepot',   v_ret_depot,
        'returnsCompany', v_ret_company,
        'losses',         jsonb_build_object('count', v_loss_cnt, 'amount', v_loss_amt),
        'cashRemitted',   v_cash_remit
      ),
      'balance',      jsonb_build_object(
        'cashOwed',     v_bal.cash_owed_mad,
        'productDebt',  v_bal.product_debt_mad,
        'final',        v_bal.total_balance_mad
      )
    ),
    auth.uid()
  )
  RETURNING * INTO v_stmt;

  RETURN v_stmt;
END;
$$;

COMMENT ON FUNCTION public.generate_courier_statement(uuid, date, date) IS
  'Fige un relevé livreur signable (Lot F, mig 130) : SOLDE FINAL depuis v_courier_balances (grand '
  'livre) + activité de période (ramassages/livraisons+cash/retours/pertes/cash versé) depuis les '
  'tables opérationnelles. Admin-only (my_role). Écrit dans courier_statements (append-only). '
  'Preuve papier anti-litige rendue en PDF à la volée depuis ce snapshot figé.';

REVOKE ALL ON FUNCTION public.generate_courier_statement(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_courier_statement(uuid, date, date) TO authenticated, service_role;
