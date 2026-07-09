-- =============================================================================
-- Migration 121 — GRAND LIVRE DOUBLE-ENTRÉE (double-entry ledger) — MVP additif
-- (idempotent — safe to re-run)
-- =============================================================================
-- But :
--   Poser un VRAI grand livre en partie double, GLOBAL plateforme, qui trace le
--   chemin de CHAQUE dirham : encaissement COD → cash détenu par le livreur →
--   remise plateforme → répartition (marge plateforme / commission affilié /
--   coût fournisseur / frais). Chaque transaction est ÉQUILIBRÉE (somme des
--   écritures = 0), APPEND-ONLY, IMMUABLE et IDEMPOTENTE.
--
-- COEXISTENCE (décision @finance, tranchée) :
--   - `ledger_entries` (048) RESTE le grand livre FACE-AFFILIÉ et la source du
--     solde payable / `create_payout` (049). **INCHANGÉ ici.** Zéro régression.
--   - Ce nouveau livre est le grand livre GLOBAL : l'affilié n'y est qu'UN compte
--     (`affiliate_commission_payable`, party=affilié). Le solde DÉPENSABLE de
--     l'affilié reste calculé UNIQUEMENT depuis 048 → aucun double-comptage.
--   - MVP = AUCUN branchement automatique sur les triggers de commande (reporté
--     mig 122+, circuit @finance dédié). Aujourd'hui : tables + contraintes +
--     chart of accounts + 1 RPC d'enregistrement équilibré idempotent. Rien ne
--     s'écrit tout seul → strictement zéro risque de double versement.
--
-- CONVENTION DE SIGNE (unique, non ambiguë) :
--   DÉBIT = montant POSITIF, CRÉDIT = montant NÉGATIF.  solde(compte) = SUM(amount).
--   Un compte d'ACTIF (normal débit) a un solde positif = argent détenu.
--   Un PASSIF/PRODUIT (normal crédit) a un solde négatif ; l'UI affiche la
--   magnitude selon `normal_balance`.
--
-- Argent : numeric. AUCUN float.
--
-- NOTE conformité : la rigueur technique (atomicité, idempotence, immuabilité,
--   équilibre comptable) est couverte ici. La conformité légale/fiscale (statut
--   du cash détenu par le livreur = encaissement pour compte de tiers, KYC/AML,
--   licences de paiement) relève d'un professionnel et N'EST PAS traitée ici.
-- =============================================================================

-- ── 1. Chart of accounts (comptes internes) ─────────────────────────────────
-- Le LIBELLÉ n'est pas stocké en dur (règle i18n) : `code` = clé stable servant
-- de clé de traduction FR/AR/EN côté app.
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  type           text NOT NULL CHECK (type IN ('asset','liability','revenue','expense','equity')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ledger_accounts IS
  'Plan de comptes du grand livre double-entrée (121). code = clé i18n stable.';

-- Seed idempotent — comptes mandatés + traçage fin du dirham + réservés extensibilité.
INSERT INTO public.ledger_accounts (code, type, normal_balance, is_active) VALUES
  -- obligatoires (cadrage B2)
  ('affiliate_commission_payable', 'liability', 'credit', true),
  ('supplier_payable',             'liability', 'credit', true),
  ('platform_margin_income',       'revenue',   'credit', true),
  ('cash_in_transit_courier',      'asset',     'debit',  true),
  -- traçabilité fine (recommandés)
  ('platform_cash',                'asset',     'debit',  true),
  ('delivery_income',              'revenue',   'credit', true),
  ('confirmation_income',          'revenue',   'credit', true),
  ('packaging_income',             'revenue',   'credit', true),
  -- réservés extensibilité (seedés inactifs)
  ('cod_customer_clearing',        'asset',     'debit',  false),
  ('courier_payable',              'liability', 'credit', false)
ON CONFLICT (code) DO NOTHING;

-- ── 2. Transactions (en-tête équilibrée) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ledger_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN (
                    'cod_collected','courier_remittance','affiliate_payout',
                    'supplier_payment','commission_reversal','manual_adjust')),
  order_id        uuid REFERENCES public.orders(id),
  currency        text NOT NULL DEFAULT 'MAD' REFERENCES public.currencies(code),
  idempotency_key text NOT NULL UNIQUE,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ledger_transactions IS
  'En-têtes du grand livre double-entrée (121). Chaque transaction = somme des '
  'postings 0 (trigger déféré). Append-only, immuable, idempotente (idempotency_key).';

-- ── 3. Postings (écritures signées : débit + / crédit −) ────────────────────
CREATE TABLE IF NOT EXISTS public.ledger_postings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.ledger_transactions(id),
  account_id     uuid NOT NULL REFERENCES public.ledger_accounts(id),
  party_type     text CHECK (party_type IN ('affiliate','supplier','courier','platform','customer')),
  party_id       uuid,
  amount         numeric(14,2) NOT NULL CHECK (amount <> 0),   -- SIGNÉ : débit + / crédit −
  currency       text NOT NULL DEFAULT 'MAD' REFERENCES public.currencies(code),
  amount_source  numeric(14,2),
  fx_rate_to_mad numeric(18,8) NOT NULL DEFAULT 1 CHECK (fx_rate_to_mad > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_postings_txn     ON public.ledger_postings (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_account ON public.ledger_postings (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_postings_party   ON public.ledger_postings (party_type, party_id);

COMMENT ON TABLE public.ledger_postings IS
  'Écritures du grand livre double-entrée (121). amount SIGNÉ (débit + / crédit −). '
  'solde(compte[,party]) = SUM(amount). Append-only, immuable.';

-- ── 4. Immuabilité (append-only) : bloquer UPDATE / DELETE / TRUNCATE ────────
CREATE OR REPLACE FUNCTION public.ledger2_block_mutations()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_txn_block_mut ON public.ledger_transactions;
CREATE TRIGGER trg_ledger_txn_block_mut
  BEFORE UPDATE OR DELETE ON public.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION public.ledger2_block_mutations();
DROP TRIGGER IF EXISTS trg_ledger_txn_block_trunc ON public.ledger_transactions;
CREATE TRIGGER trg_ledger_txn_block_trunc
  BEFORE TRUNCATE ON public.ledger_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION public.ledger2_block_mutations();

DROP TRIGGER IF EXISTS trg_ledger_post_block_mut ON public.ledger_postings;
CREATE TRIGGER trg_ledger_post_block_mut
  BEFORE UPDATE OR DELETE ON public.ledger_postings
  FOR EACH ROW EXECUTE FUNCTION public.ledger2_block_mutations();
DROP TRIGGER IF EXISTS trg_ledger_post_block_trunc ON public.ledger_postings;
CREATE TRIGGER trg_ledger_post_block_trunc
  BEFORE TRUNCATE ON public.ledger_postings
  FOR EACH STATEMENT EXECUTE FUNCTION public.ledger2_block_mutations();

-- ── 5. Équilibre somme = 0 par transaction (contrainte EN BASE, trigger déféré)
-- Un CHECK ne peut pas franchir plusieurs lignes ; un CONSTRAINT TRIGGER
-- DEFERRABLE INITIALLY DEFERRED vérifie l'équilibre au COMMIT (après tous les
-- INSERT de la transaction). Append-only ⇒ une txn équilibrée le reste à jamais.
CREATE OR REPLACE FUNCTION public.ledger2_check_balanced()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_sum numeric(14,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM public.ledger_postings WHERE transaction_id = NEW.transaction_id;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'Ledger transaction % déséquilibrée : somme des postings = % (doit être 0)',
      NEW.transaction_id, v_sum USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger2_balanced ON public.ledger_postings;
CREATE CONSTRAINT TRIGGER trg_ledger2_balanced
  AFTER INSERT ON public.ledger_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.ledger2_check_balanced();

-- ── 6. RLS (deny par défaut) ─────────────────────────────────────────────────
ALTER TABLE public.ledger_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_postings     ENABLE ROW LEVEL SECURITY;

-- Chart of accounts = référentiel non sensible (aucun montant) : lisible authentifié.
DROP POLICY IF EXISTS "ledger_accounts: read" ON public.ledger_accounts;
CREATE POLICY "ledger_accounts: read"
  ON public.ledger_accounts FOR SELECT TO authenticated USING (true);

-- En-têtes de transactions = grand livre GLOBAL : staff uniquement.
DROP POLICY IF EXISTS "ledger_transactions: staff read" ON public.ledger_transactions;
CREATE POLICY "ledger_transactions: staff read"
  ON public.ledger_transactions FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin','agent'));

-- Postings : staff voit tout ; une partie (affilié/fournisseur/livreur) voit
-- UNIQUEMENT ses propres écritures (party_id = auth.uid()).
DROP POLICY IF EXISTS "ledger_postings: staff or own party read" ON public.ledger_postings;
CREATE POLICY "ledger_postings: staff or own party read"
  ON public.ledger_postings FOR SELECT TO authenticated
  USING (public.my_role() IN ('admin','agent') OR party_id = auth.uid());

-- Aucune policy INSERT/UPDATE/DELETE : écriture EXCLUSIVEMENT via le RPC
-- SECURITY DEFINER ci-dessous (ou service_role), qui contourne la RLS. Deny.

-- ── 7. RPC d'enregistrement d'une transaction ÉQUILIBRÉE, idempotente ────────
-- Seul vecteur d'écriture. Montants passés explicitement (agnostique du calcul).
-- Garde : admin (JWT) OU service_role (défense en profondeur, patron 049).
CREATE OR REPLACE FUNCTION public.record_ledger_transaction(
  p_kind            text,
  p_idempotency_key text,
  p_postings        jsonb,
  p_order_id        uuid  DEFAULT NULL,
  p_currency        text  DEFAULT 'MAD',
  p_metadata        jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_txn_id     uuid;
  v_existing   uuid;
  v_sum        numeric(14,2);
  v_account_id uuid;
  p            jsonb;
BEGIN
  -- Autorisation (défense en profondeur — même si appelé directement via l'API).
  IF NOT (public.my_role() = 'admin' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Non autorisé : enregistrement ledger réservé admin/service_role';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Clé d''idempotence requise';
  END IF;
  IF p_postings IS NULL OR jsonb_typeof(p_postings) <> 'array' OR jsonb_array_length(p_postings) < 2 THEN
    RAISE EXCEPTION 'Au moins 2 écritures (postings) requises';
  END IF;

  -- P2-1 (@security) — MVP MONO-DEVISE : l'équilibre somme `amount` bruts sans
  -- normaliser en MAD → interdire toute devise de posting <> devise de la txn
  -- (sinon une txn MAD/USD pourrait « boucler » à 0 en brut mais pas en MAD).
  -- Le vrai multi-devises (équilibre en MAD via amount_source*fx) = étape ultérieure.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_postings) e
    WHERE COALESCE(NULLIF(e->>'currency',''), p_currency) <> p_currency
  ) THEN
    RAISE EXCEPTION 'Devise mixte non supportée : tous les postings doivent être en % (MVP mono-devise)', p_currency;
  END IF;

  -- Idempotence : rejeu avec la même clé → retourne la transaction existante.
  SELECT id INTO v_existing FROM public.ledger_transactions WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Validation en amont : aucun montant nul, somme = 0.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_postings) e WHERE (e->>'amount')::numeric = 0) THEN
    RAISE EXCEPTION 'Un posting a un montant nul (interdit)';
  END IF;
  SELECT COALESCE(SUM((e->>'amount')::numeric), 0) INTO v_sum
    FROM jsonb_array_elements(p_postings) e;
  IF v_sum <> 0 THEN
    RAISE EXCEPTION 'Transaction déséquilibrée : somme des postings = % (doit être 0)', v_sum;
  END IF;

  -- Insert en-tête (idempotence dure : si course concurrente, on récupère l'existant).
  BEGIN
    INSERT INTO public.ledger_transactions (kind, order_id, currency, idempotency_key, metadata, created_by)
    VALUES (p_kind, p_order_id, p_currency, p_idempotency_key, COALESCE(p_metadata, '{}'::jsonb), auth.uid())
    RETURNING id INTO v_txn_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_txn_id FROM public.ledger_transactions WHERE idempotency_key = p_idempotency_key;
    RETURN v_txn_id;
  END;

  -- Insert postings (résolution code → account_id ; compte inconnu = refus).
  FOR p IN SELECT * FROM jsonb_array_elements(p_postings)
  LOOP
    SELECT id INTO v_account_id FROM public.ledger_accounts WHERE code = (p->>'account_code');
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'Compte inconnu : %', (p->>'account_code');
    END IF;
    INSERT INTO public.ledger_postings
      (transaction_id, account_id, party_type, party_id, amount, currency, amount_source, fx_rate_to_mad)
    VALUES (
      v_txn_id, v_account_id,
      NULLIF(p->>'party_type','')::text,
      NULLIF(p->>'party_id','')::uuid,
      (p->>'amount')::numeric,
      COALESCE(NULLIF(p->>'currency',''), p_currency),
      NULLIF(p->>'amount_source','')::numeric,
      COALESCE(NULLIF(p->>'fx_rate_to_mad','')::numeric, 1)
    );
  END LOOP;

  -- Le trigger déféré ledger2_check_balanced vérifie l'équilibre au COMMIT.
  RETURN v_txn_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ledger_transaction(text, text, jsonb, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ledger_transaction(text, text, jsonb, uuid, text, jsonb)
  TO authenticated, service_role;

-- ── 8. Vue de soldes (lecture confort — RLS des tables sous-jacentes s'applique)
CREATE OR REPLACE VIEW public.v_ledger_balances
WITH (security_invoker = true) AS
  SELECT a.code AS account_code, a.type, a.normal_balance,
         p.party_type, p.party_id,
         COALESCE(SUM(p.amount), 0) AS balance_mad
  FROM public.ledger_accounts a
  LEFT JOIN public.ledger_postings p ON p.account_id = a.id
  GROUP BY a.code, a.type, a.normal_balance, p.party_type, p.party_id;

COMMENT ON VIEW public.v_ledger_balances IS
  'Soldes par compte (et party) du grand livre double-entrée. balance_mad = SUM(amount signé).';
