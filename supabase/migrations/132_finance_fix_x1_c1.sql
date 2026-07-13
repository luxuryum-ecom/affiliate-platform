-- =============================================================================
-- Migration 132 — CORRECTIF FINANCE X-1 + C-1 (+ C-2)
-- =============================================================================
-- Réf audit : AUDIT_SAAS_2026-07-12.md — findings X-1 (P0/P1), C-1 (P1), C-2 (P2).
--
-- ⚠️ ADDITIVE ONLY. Aucun trigger financier existant n'est supprimé ni modifié
--    destructivement. On AJOUTE :
--      • des fonctions helper pures (parité exacte avec le TS de calcul) ;
--      • un trigger BEFORE INSERT sur `orders` (garde structurelle X-1 + C-2) ;
--      • une colonne additive `commissions.clawed_back` ;
--      • un élargissement (additif) de la CHECK `entry_type` du grand livre 048 ;
--      • une redéfinition NON destructive (CREATE OR REPLACE) de `create_payout`
--        pour le clawback net (C-1) + une garde payout (X-1 défense en profondeur).
--
-- Fichier LOCAL (mig 132). NE PAS appliquer en prod dans ce chantier (GO Abdou).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POURQUOI
-- ─────────────────────────────────────────────────────────────────────────────
-- X-1 : un affilié authentifié peut INSÉRER une commande directement via PostgREST
--       (en contournant la server action `createAffiliateOrder`) avec un
--       `affiliate_commission_mad_snapshot` arbitraire (prouvé : 99999 MAD sur
--       ~50 MAD réels). La validation vivait UNIQUEMENT dans la server action, pas
--       en base → contournable. Le trigger `handle_order_delivered` (mig 122) crée
--       ensuite une commission `amount = NEW.affiliate_commission_mad_snapshot`
--       verbatim → argent net créé.
--       CORRECTIF : garde STRUCTURELLE en base (trigger BEFORE INSERT SECURITY
--       DEFINER) qui RECALCULE la commission maximale côté serveur depuis
--       `products` et REFUSE toute commande affilié dont la commission DÉPASSE ce
--       recalcul. Une commande LÉGITIME (snapshot = recalcul) passe à l'identique.
--
-- C-1 : `create_payout` versait `SUM(commissions approved AND reversed=false)` et
--       ne consultait JAMAIS le solde du grand livre 048. Un retour COD APRÈS
--       paiement écrit `commission_reversed = −amount` (mig 122) mais la commission
--       est déjà `paid` (hors pool) → le trop-perçu n'était jamais récupéré.
--       CORRECTIF : `create_payout` raisonne sur le SOLDE NET
--       (approuvé payable − clawback en attente) et verse MAX(0, net). Un solde
--       net négatif est REPORTÉ au prochain versement (jamais ignoré).
--
-- C-2 : `createAffiliateOrder` forçait `fraud_score = 0` sur les self-orders → ils
--       échappaient au gate anti-fraude B7 (mig 124). CORRECTIF : le trigger
--       recalcule `fraud_score`/`duplicate_risk_score`/`spam_score` côté serveur
--       (même logique que le flux public), le client ne peut plus forcer 0.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NON-RÉGRESSION (garde-fous Abdou)
-- ─────────────────────────────────────────────────────────────────────────────
--   • Le trigger X-1/C-2 est SCOPÉ AU SEUL VECTEUR NON FIABLE :
--       `NEW.affiliate_id IS NOT NULL AND my_role() = 'affiliate'`.
--     Les inserts service_role/admin (flux public `placeOrder`, seeds, TESTS, RPC)
--     ont `my_role() <> 'affiliate'` → trigger INERTE → ZÉRO régression.
--   • La garde commission REFUSE UNIQUEMENT un dépassement (> recalcul + tolérance
--     d'arrondi) : une commande normale n'est jamais refusée ni modifiée.
--   • `create_payout` sans aucun retour post-paiement = comportement IDENTIQUE à
--     l'existant (montant = SUM(approuvé), même ledger, même idempotence).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FONCTIONS HELPER — parité EXACTE avec src/lib/utils.ts et order-analytics.ts
--    (IMMUTABLE, pures, testables). Argent : numeric, AUCUN float.
-- ─────────────────────────────────────────────────────────────────────────────

-- Prix plateforme = usine + marge, ARRONDI au MAD entier (miroir de
-- calculatePlatformPrice : Math.round(raw) ; pour raw ≥ 0 le half-up JS == le
-- round half-away-from-zero SQL → identiques).
CREATE OR REPLACE FUNCTION public.calc_platform_price_mad(
  p_factory      numeric,
  p_margin_type  text,
  p_margin_value numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT round(
    CASE
      WHEN p_margin_type = 'percentage'
        THEN p_factory * (1 + COALESCE(p_margin_value, 0) / 100.0)
      ELSE p_factory + COALESCE(p_margin_value, 0)
    END
  );
$$;
COMMENT ON FUNCTION public.calc_platform_price_mad(numeric, text, numeric) IS
  'Miroir SQL de calculatePlatformPrice (utils.ts) : prix plateforme = usine + marge, arrondi MAD entier.';

-- Commission nette affilié = (prix_vente − prix_plateforme − livraison − confirmation
-- − packaging) × quantité, arrondie au centime (miroir de calculateNetAffiliateCommission).
CREATE OR REPLACE FUNCTION public.calc_affiliate_commission_mad(
  p_sell         numeric,
  p_factory      numeric,
  p_margin_type  text,
  p_margin_value numeric,
  p_delivery     numeric,
  p_confirmation numeric,
  p_packaging    numeric,
  p_quantity     numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT round(
    (
      p_sell
      - public.calc_platform_price_mad(p_factory, p_margin_type, p_margin_value)
      - COALESCE(p_delivery, 0)
      - COALESCE(p_confirmation, 0)
      - COALESCE(p_packaging, 0)
    ) * p_quantity
  , 2);
$$;
COMMENT ON FUNCTION public.calc_affiliate_commission_mad(numeric, numeric, text, numeric, numeric, numeric, numeric, numeric) IS
  'Miroir SQL de calculateNetAffiliateCommission (utils.ts). Utilisé par la garde X-1 (mig 132).';

-- Score de duplicata (miroir scoreDuplicateOrder / order-analytics.ts).
CREATE OR REPLACE FUNCTION public.score_duplicate_order(p_recent integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_recent <= 0 THEN 0
    WHEN p_recent = 1  THEN 35
    WHEN p_recent = 2  THEN 65
    ELSE 90
  END;
$$;

-- Score spam (miroir scoreSpamOrder / order-analytics.ts).
CREATE OR REPLACE FUNCTION public.score_spam_order(p_phone text, p_name text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(100,
      (CASE WHEN length(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')) < 9 THEN 40 ELSE 0 END)
    + (CASE WHEN regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') ~ '^(.)\1{5,}$' THEN 30 ELSE 0 END)
    + (CASE WHEN length(btrim(COALESCE(p_name, ''))) < 3 THEN 20 ELSE 0 END)
    + (CASE WHEN COALESCE(p_name, '') ~* 'test|fake|xxx' THEN 25 ELSE 0 END)
  );
$$;

-- Score fraude agrégé (miroir scoreFraudOrder / order-analytics.ts).
CREATE OR REPLACE FUNCTION public.score_fraud_order(
  p_duplicate numeric, p_spam numeric, p_has_affiliate boolean
) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(100,
    round(p_duplicate * 0.5 + p_spam * 0.4 + (CASE WHEN p_has_affiliate THEN 0 ELSE 5 END))::integer
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. GARDE STRUCTURELLE X-1 + C-2 — trigger BEFORE INSERT sur orders
-- ─────────────────────────────────────────────────────────────────────────────
-- Les affiliés n'ont AUCUNE policy UPDATE sur orders (seule "orders: admin update
-- status" existe) → le vecteur d'empoisonnement est l'INSERT. Le trigger est donc
-- BEFORE INSERT uniquement : aucune interférence avec les flux de mise à jour de
-- statut (livraison/réconciliation/payout) largement testés.
CREATE OR REPLACE FUNCTION public.enforce_affiliate_order_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod      record;
  v_sell      numeric(12,2);
  v_conf      numeric(12,2);
  v_pack      numeric(12,2);
  v_calc      numeric(12,2);
  v_floor     numeric(12,2);
  v_tol       numeric(12,2);
  v_recent    integer;
  v_dup       integer;
  v_spam      integer;
  v_fraud     integer;
BEGIN
  -- PÉRIMÈTRE STRICT : uniquement le vecteur non fiable (affilié authentifié).
  -- service_role / admin / flux public → my_role() <> 'affiliate' → trigger inerte.
  IF NEW.affiliate_id IS NULL OR public.my_role() IS DISTINCT FROM 'affiliate' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'X-1 garde : quantité invalide (%).', NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  -- Données produit CÔTÉ SERVEUR (SECURITY DEFINER — ignore toute valeur cliente).
  SELECT factory_cost_mad, platform_margin_type, platform_margin_value,
         confirmation_fee_mad, packaging_fee_mad
    INTO v_prod
    FROM public.products
   WHERE id = NEW.product_id;

  IF NOT FOUND OR v_prod.factory_cost_mad IS NULL THEN
    -- Fail closed : identique à la garde de createAffiliateOrder (coût usine obligatoire).
    RAISE EXCEPTION 'X-1 garde : produit incomplet (coût usine manquant) — commande refusée.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Prix de vente unitaire dérivé du total (l'affilié fixe LÉGITIMEMENT son prix ;
  -- seule la COMMISSION est recalculée depuis le produit et bornée).
  v_sell := round(NEW.total_amount / NEW.quantity, 2);
  v_conf := COALESCE(v_prod.confirmation_fee_mad, 10);
  v_pack := COALESCE(v_prod.packaging_fee_mad, 10);

  -- Recalcul serveur (livraison = provision fixe 35).
  -- ⚠️ SYNCHRO OBLIGATOIRE : ce 35 DOIT rester égal à DELIVERY_PROVISION_MAD
  -- (src/lib/utils.ts:49). Si la provision livraison change côté TS, la modifier
  -- ICI dans la même migration, sinon la garde refuserait des commandes légitimes.
  v_calc  := public.calc_affiliate_commission_mad(
               v_sell, v_prod.factory_cost_mad, v_prod.platform_margin_type,
               v_prod.platform_margin_value, 35, v_conf, v_pack, NEW.quantity);
  v_floor := GREATEST(v_calc, 0);   -- l'affilié touche 0 au minimum (jamais négatif).

  -- Tolérance d'arrondi (le stockage MAD à 2 décimales peut décaler d'un centime
  -- par unité). Généreuse côté arrondi, dérisoire face à une inflation X-1.
  v_tol := 0.01 * NEW.quantity + 0.01;

  -- X-1 : REFUSE UNIQUEMENT une commission qui DÉPASSE le recalcul serveur.
  -- Commande légitime : snapshot = v_calc → jamais refusée, jamais modifiée.
  IF COALESCE(NEW.affiliate_commission_mad_snapshot, 0) > v_floor + v_tol
     OR COALESCE(NEW.commission_amount, 0) > v_floor + v_tol THEN
    RAISE EXCEPTION
      'X-1 : commission déclarée (% MAD) supérieure au maximum recalculé serveur (% MAD) — commande refusée.',
      GREATEST(COALESCE(NEW.affiliate_commission_mad_snapshot, 0), COALESCE(NEW.commission_amount, 0)),
      v_floor
      USING ERRCODE = 'check_violation';
  END IF;

  -- C-2 : score anti-fraude recalculé SERVEUR (le client ne peut plus forcer 0).
  -- BEFORE INSERT → la commande courante n'est pas encore comptée (parité flux public).
  SELECT count(*) INTO v_recent
    FROM public.orders
   WHERE customer_phone = NEW.customer_phone
     AND product_id     = NEW.product_id
     AND created_at     >= now() - interval '24 hours';

  v_dup   := public.score_duplicate_order(v_recent);
  v_spam  := public.score_spam_order(NEW.customer_phone, NEW.customer_name);
  v_fraud := public.score_fraud_order(v_dup, v_spam, true);

  NEW.duplicate_risk_score := v_dup;
  NEW.spam_score           := v_spam;
  NEW.fraud_score          := v_fraud;

  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.enforce_affiliate_order_financials() IS
  'Garde structurelle X-1/C-2 (mig 132) : sur INSERT d''une commande affilié, refuse '
  'toute commission dépassant le recalcul serveur et recalcule le fraud_score. '
  'Inerte hors du vecteur affilié authentifié (service_role/admin non affectés).';

DROP TRIGGER IF EXISTS trg_enforce_affiliate_order_financials ON public.orders;
CREATE TRIGGER trg_enforce_affiliate_order_financials
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_affiliate_order_financials();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. C-1 — colonne additive + élargissement additif de la CHECK entry_type
-- ─────────────────────────────────────────────────────────────────────────────
-- Trace si une commission payée-puis-contre-passée a déjà été récupérée (clawback).
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS clawed_back boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.commissions.clawed_back IS
  'C-1 (mig 132) : true quand une commission déjà PAYÉE puis contre-passée (retour '
  'COD post-paiement) a été récupérée sur un versement ultérieur. Défaut false = dû en attente.';

-- Élargissement ADDITIF de la liste autorisée du grand livre 048 : ajout du type
-- 'clawback_recovery' (montant POSITIF qui neutralise la contre-passation lors de
-- la récupération). Aucune ligne existante invalidée → non destructif.
ALTER TABLE public.ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;
ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (entry_type IN (
    'commission_earned',
    'commission_reversed',
    'payout',
    'clawback_recovery'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. C-1 + garde X-1 payout — REDÉFINITION NON destructive de create_payout
-- ─────────────────────────────────────────────────────────────────────────────
-- Différence vs mig 052 :
--   • solde NET = SUM(approuvé payable) − SUM(clawback en attente) ;
--   • verse MAX(0, net) ; net ≤ 0 → reporté (RAISE, aucun versement) ;
--   • écriture ledger 'clawback_recovery' (+montant) qui équilibre le grand livre ;
--   • garde X-1 : refuse une commission approuvée dépassant (total − usine − frais).
-- SANS clawback en attente : montant, ledger et idempotence IDENTIQUES à l'existant.
CREATE OR REPLACE FUNCTION public.create_payout(
  p_affiliate_id    uuid,
  p_idempotency_key text,
  p_reference       text DEFAULT NULL,
  p_notes           text DEFAULT NULL
)
RETURNS public.payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.payouts;
  v_payout   public.payouts;
  v_approved numeric(12,2);
  v_clawback numeric(12,2);
  v_net      numeric(12,2);
  v_ids      uuid[];
  v_claw_ids uuid[];
  v_bad_id   uuid;
BEGIN
  -- 0. Admin uniquement (INCHANGÉ — défense en profondeur).
  IF public.my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Non autorisé : le versement est réservé aux administrateurs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 0bis. Clé d'idempotence obligatoire (INCHANGÉ).
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Clé d''idempotence requise.';
  END IF;

  -- 1. Rejeu idempotent : même clé → retourne le payout existant sans rien recréer (INCHANGÉ).
  SELECT * INTO v_existing FROM public.payouts WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- 2. Verrouille les commissions approuvées payables et les somme (INCHANGÉ).
  SELECT COALESCE(SUM(locked.amount), 0), array_agg(locked.id)
    INTO v_approved, v_ids
    FROM (
      SELECT id, amount
        FROM public.commissions
       WHERE affiliate_id = p_affiliate_id
         AND status = 'approved'
         AND reversed = false
       FOR UPDATE
    ) AS locked;

  -- 2bis. GARDE X-1 (défense en profondeur) : refuse toute commission approuvée
  --       dont le montant dépasse (total − coût usine total − frais×qté) de sa
  --       commande. Une commission LÉGITIME respecte toujours cette borne
  --       (prix_plateforme ≥ usine) → jamais de refus sur du légitime. Rattrape
  --       une éventuelle commission empoisonnée CRÉÉE AVANT le déploiement du trigger.
  IF v_ids IS NOT NULL THEN
    SELECT c.id
      INTO v_bad_id
      FROM public.commissions c
      JOIN public.orders o ON o.id = c.order_id
      LEFT JOIN public.order_financial_snapshots ofs ON ofs.order_id = c.order_id
     WHERE c.id = ANY(v_ids)
       AND c.amount >
             o.total_amount
             - COALESCE(ofs.factory_cost_mad, 0)
             - ( COALESCE(o.delivery_fee_snapshot, 0)
               + COALESCE(o.packaging_fee_snapshot, 0)
               + COALESCE(o.confirmation_fee_snapshot, 0) ) * o.quantity
             + 0.01
     LIMIT 1;
    IF v_bad_id IS NOT NULL THEN
      RAISE EXCEPTION
        'X-1 garde payout : commission % dépasse (total − usine − frais) de sa commande — versement bloqué.',
        v_bad_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 3. C-1 : commissions DÉJÀ PAYÉES puis contre-passées (retour COD post-paiement),
  --    non encore récupérées. Leur montant est un DÛ de l'affilié à récupérer.
  SELECT COALESCE(SUM(amount), 0), array_agg(id)
    INTO v_clawback, v_claw_ids
    FROM public.commissions
   WHERE affiliate_id = p_affiliate_id
     AND status = 'paid'
     AND reversed = true
     AND clawed_back = false;

  -- 4. Solde NET = approuvé payable − clawback en attente.
  v_net := COALESCE(v_approved, 0) - COALESCE(v_clawback, 0);

  -- 5. Rien à traiter du tout.
  IF v_ids IS NULL AND COALESCE(v_clawback, 0) = 0 THEN
    RAISE EXCEPTION 'Aucune commission approuvée à payer pour cet affilié.';
  END IF;

  -- 5bis. Solde net ≤ 0 : le clawback dépasse (ou égale) les gains approuvés →
  --       REPORTÉ au prochain versement (jamais ignoré, jamais de versement négatif).
  IF v_net <= 0 THEN
    RAISE EXCEPTION
      'Solde net ≤ 0 : clawback en attente (% MAD) ≥ commissions approuvées (% MAD). Reporté au prochain versement.',
      COALESCE(v_clawback, 0), COALESCE(v_approved, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  -- 6. Crée le payout au montant NET DÉRIVÉ (jamais saisi).
  INSERT INTO public.payouts (affiliate_id, amount, status, reference, notes, paid_at, idempotency_key)
  VALUES (p_affiliate_id, v_net, 'paid', p_reference, p_notes, now(), p_idempotency_key)
  RETURNING * INTO v_payout;

  -- 7. Solde les commissions approuvées + une écriture ledger NÉGATIVE par commission
  --    (INCHANGÉ : même mécanisme, mêmes clés d'idempotence 'payout:<id>').
  UPDATE public.commissions
     SET status = 'paid', paid_at = now()
   WHERE id = ANY(v_ids);

  INSERT INTO public.ledger_entries (
    affiliate_id, entry_type, amount, commission_id, payout_id,
    idempotency_key, metadata, currency, amount_source, fx_rate_to_mad
  )
  SELECT c.affiliate_id, 'payout', -c.amount, c.id, v_payout.id,
         'payout:' || c.id::text, jsonb_build_object('payout_id', v_payout.id),
         'MAD', -c.amount, 1
    FROM public.commissions c
   WHERE c.id = ANY(v_ids)
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- 8. C-1 : récupère les clawbacks — écriture ledger POSITIVE 'clawback_recovery'
  --    qui neutralise la contre-passation, et marque clawed_back=true.
  --    Cash net = v_net car Σledger de ce payout = (−Σapprouvé) + (+Σclawback)
  --    = −(approuvé − clawback) = −v_net → grand livre équilibré, dû soldé.
  IF v_claw_ids IS NOT NULL THEN
    UPDATE public.commissions
       SET clawed_back = true
     WHERE id = ANY(v_claw_ids);

    INSERT INTO public.ledger_entries (
      affiliate_id, entry_type, amount, commission_id, payout_id,
      idempotency_key, metadata, currency, amount_source, fx_rate_to_mad
    )
    SELECT c.affiliate_id, 'clawback_recovery', c.amount, c.id, v_payout.id,
           'clawback_recovery:' || c.id::text,
           jsonb_build_object('payout_id', v_payout.id, 'reason', 'post_payment_return'),
           'MAD', c.amount, 1
      FROM public.commissions c
     WHERE c.id = ANY(v_claw_ids)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN v_payout;
END;
$$;
COMMENT ON FUNCTION public.create_payout(uuid, text, text, text) IS
  'Verse le SOLDE NET (approuvé payable − clawback post-paiement en attente), '
  'MAX(0, net) ; net ≤ 0 reporté. Sans clawback : comportement identique à mig 052. '
  'Idempotent (idempotency_key UNIQUE + FOR UPDATE + ledger ON CONFLICT). '
  'Garde X-1 : refuse une commission dépassant (total − usine − frais). Admin only.';

GRANT EXECUTE ON FUNCTION public.create_payout(uuid, text, text, text) TO authenticated;
