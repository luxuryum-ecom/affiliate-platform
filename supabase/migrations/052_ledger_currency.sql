-- =============================================================================
-- Migration 052 — Devise dans le grand livre (ledger multi-devises)
-- (idempotent — safe to re-run)
-- =============================================================================
-- But :
--   Tracer la DEVISE SOURCE de chaque écriture du ledger (`public.ledger_entries`)
--   sans casser l'append-only, l'existant, ni la mathématique d'argent.
--
--   PRINCIPE NON NÉGOCIABLE :
--     - `amount` RESTE le pivot MAD, INCHANGÉ. Tout SUM(amount) (dont create_payout)
--       garde sa sémantique exacte. On ne renomme, ne convertit, ne touche RIEN.
--     - Tout est ADD-ONLY : ALTER TABLE ADD COLUMN / ADD CONSTRAINT / CREATE VIEW /
--       CREATE OR REPLACE FUNCTION. Aucun DROP, aucune réécriture de table, aucune
--       modification des triggers d'immuabilité (048).
--     - Aujourd'hui les commissions sont 100 % en MAD : ce plumbing pose les colonnes
--       devise figées à 'MAD'/taux 1 pour tout l'existant ET tout le flux actuel.
--       De vraies devises source seront branchées dans une étape ultérieure.
--
--   Backfill : IMPOSSIBLE par UPDATE (le trigger append-only le bloque). Les lignes
--   existantes sont renseignées UNIQUEMENT par DEFAULT constant (`currency`,
--   `fx_rate_to_mad`) ou laissées NULL avec sémantique « legacy = MAD »
--   (`amount_source`). Aucun UPDATE n'est émis sur ledger_entries.
--
--   S'appuie sur le référentiel devises 050/051 (currencies, exchange_rates,
--   current_exchange_rates, fx_rate_to_mad). MAD = pivot interne.
--
--   Argent : numeric. AUCUN float.
-- =============================================================================

-- ── 1. Colonnes devise sur ledger_entries (ADD-ONLY) ─────────────────────────
-- `currency`       : devise source de l'écriture. DEFAULT constant 'MAD' → remplit
--                    toutes les lignes existantes sans UPDATE (métadonnée only).
-- `amount_source`  : montant en devise source. NULLABLE — non backfillable à
--                    `amount` (UPDATE bloqué) et un default constant ne peut pas
--                    référencer une autre colonne. Sémantique : NULL ⇒ legacy MAD,
--                    amount_source ≡ amount. Tout NOUVEL INSERT le remplit.
-- `fx_rate_to_mad` : taux FIGÉ source→MAD (nb de MAD pour 1 unité source).
--                    DEFAULT constant 1 → l'existant MAD a un taux pivot = 1.

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS currency       text          NOT NULL DEFAULT 'MAD'
                                                         REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS amount_source  numeric(12,2),
  ADD COLUMN IF NOT EXISTS fx_rate_to_mad numeric(18,8) NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.ledger_entries.currency IS
  'Devise source de l''écriture (FK currencies). DEFAULT MAD = pivot interne.';
COMMENT ON COLUMN public.ledger_entries.amount_source IS
  'Montant en devise source. NULL = ligne legacy antérieure au multi-devises (≡ amount MAD).';
COMMENT ON COLUMN public.ledger_entries.fx_rate_to_mad IS
  'Taux FIGÉ source→MAD (nb de MAD pour 1 unité source). 1 pour MAD. amount = amount_source * fx_rate_to_mad.';

-- ── 2. CHECK d'invariant « argent » (stricts, satisfaits par l'existant) ─────
-- Conçus pour que les lignes legacy passent la validation (currency='MAD',
-- fx_rate_to_mad=1, amount_source=NULL). ADD CONSTRAINT scanne en LECTURE les
-- lignes existantes (ne les modifie pas) → compatible append-only.
-- Idempotence : pg ne supporte pas ADD CONSTRAINT IF NOT EXISTS → on garde via
-- un bloc DO qui ne crée la contrainte que si absente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_fx_rate_positive') THEN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT ledger_fx_rate_positive
        CHECK (fx_rate_to_mad > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_mad_rate_is_one') THEN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT ledger_mad_rate_is_one
        CHECK (currency <> 'MAD' OR fx_rate_to_mad = 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_mad_amount_matches_source') THEN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT ledger_mad_amount_matches_source
        CHECK (amount_source IS NULL OR currency <> 'MAD' OR amount = amount_source);
  END IF;
END$$;

-- ── 3. Vue de solde par devise (read-only, additive) ─────────────────────────
-- security_invoker = true → hérite de la RLS de ledger_entries (affilié voit son
-- solde, admin/agent voient tout). Même convention que current_exchange_rates.
-- balance_mad : pivot MAD (toujours sommable, inchangé pour MAD).
-- balance_source : en devise source, COHÉRENT car groupé PAR devise (jamais
-- d'addition inter-devises). COALESCE(amount_source, amount) pour le legacy MAD.

CREATE OR REPLACE VIEW public.ledger_balances
  WITH (security_invoker = true) AS
SELECT
  affiliate_id,
  currency,
  SUM(amount)                          AS balance_mad,
  SUM(COALESCE(amount_source, amount)) AS balance_source
FROM public.ledger_entries
GROUP BY affiliate_id, currency;

COMMENT ON VIEW public.ledger_balances IS
  'Solde par affilié ET par devise, calculé depuis le ledger. balance_mad = SUM(amount) '
  '(pivot MAD). balance_source = SUM en devise source (cohérent car groupé par devise). '
  'RLS héritée de ledger_entries (security_invoker).';

GRANT SELECT ON public.ledger_balances TO authenticated;

-- ── 4. Sites d'écriture du ledger — renseigner la devise (MAD / taux 1) ──────
-- Les 3 fonctions sont ré-déclarées par CREATE OR REPLACE en conservant leur
-- corps À L'IDENTIQUE : seul l'INSERT ledger gagne 3 colonnes (currency='MAD',
-- amount_source=<montant>, fx_rate_to_mad=1). `amount` (pivot MAD) inchangé.

-- 4.a — handle_order_delivered() : écriture 'commission_earned' (+)
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

      -- AJOUT 048 — écriture ledger append-only (positif), idempotente.
      -- AJOUT 052 — devise source (MAD aujourd'hui : commission en MAD, taux 1).
      INSERT INTO public.ledger_entries (affiliate_id, entry_type, amount, order_id, commission_id, idempotency_key, metadata,
                                         currency, amount_source, fx_rate_to_mad)
      SELECT NEW.affiliate_id, 'commission_earned', v_commission, NEW.id, c.id,
             'commission_earned:' || NEW.id::text, '{}'::jsonb,
             'MAD', v_commission, 1
      FROM public.commissions c WHERE c.order_id = NEW.id
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4.b — handle_order_status_reversal() : écriture 'commission_reversed' (-)
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

    -- AJOUT 048 — écriture ledger append-only (négatif), idempotente.
    -- AJOUT 052 — devise source (MAD aujourd'hui : commission en MAD, taux 1).
    INSERT INTO public.ledger_entries (affiliate_id, entry_type, amount, order_id, commission_id, idempotency_key, metadata,
                                       currency, amount_source, fx_rate_to_mad)
    SELECT c.affiliate_id, 'commission_reversed', -c.amount, NEW.id, c.id,
           'commission_reversed:' || c.id::text, '{}'::jsonb,
           'MAD', -c.amount, 1
    FROM public.commissions c
    WHERE c.order_id = NEW.id AND c.reversed = true
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 4.c — create_payout() : écriture 'payout' (-)
-- Corps À L'IDENTIQUE de la migration 049 (autorisation admin, idempotence,
-- montant DÉRIVÉ SUM, verrou FOR UPDATE, marquage paid). Seul l'INSERT ledger
-- (étape 6) gagne les 3 colonnes devise.
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
  v_total    numeric(12,2);
  v_ids      uuid[];
BEGIN
  -- 0. Garde AUTORISATION (défense en profondeur).
  IF public.my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Non autorisé : seul un administrateur peut créer un paiement'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 0bis. Garde CLÉ D'IDEMPOTENCE : doit être non vide.
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Clé d''idempotence requise pour créer un paiement';
  END IF;

  -- 1. Garde idempotence (rejeu).
  SELECT * INTO v_existing
    FROM public.payouts
   WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- 2. Verrou anti-concurrence : sélectionner ET verrouiller les commissions payables.
  SELECT COALESCE(SUM(locked.amount), 0), array_agg(locked.id)
    INTO v_total, v_ids
    FROM (
      SELECT id, amount
        FROM public.commissions
       WHERE affiliate_id = p_affiliate_id
         AND status = 'approved'
         AND reversed = false
         FOR UPDATE
    ) AS locked;

  -- 3. Garde montant : rien à payer → exception (rollback).
  IF v_ids IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'Aucune commission approuvée à payer pour cet affilié';
  END IF;

  -- 4. Insérer le payout avec le montant DÉRIVÉ (somme), jamais saisi.
  INSERT INTO public.payouts (
    affiliate_id, amount, status, reference, notes, paid_at, idempotency_key
  )
  VALUES (
    p_affiliate_id, v_total, 'paid', p_reference, p_notes, now(), p_idempotency_key
  )
  RETURNING * INTO v_payout;

  -- 5. Marquer les commissions soldées 'paid'.
  UPDATE public.commissions
     SET status  = 'paid',
         paid_at = now()
   WHERE id = ANY(v_ids);

  -- 6. Écriture ledger append-only : UNE entrée 'payout' NÉGATIVE par commission.
  --    AJOUT 052 — devise source (MAD aujourd'hui : commission en MAD, taux 1).
  INSERT INTO public.ledger_entries (
    affiliate_id, entry_type, amount, commission_id, payout_id, idempotency_key, metadata,
    currency, amount_source, fx_rate_to_mad
  )
  SELECT c.affiliate_id, 'payout', -c.amount, c.id, v_payout.id,
         'payout:' || c.id::text,
         jsonb_build_object('payout_id', v_payout.id),
         'MAD', -c.amount, 1
    FROM public.commissions c
   WHERE c.id = ANY(v_ids)
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- 7. Retourner le payout créé.
  RETURN v_payout;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_payout(uuid, text, text, text) TO authenticated;
