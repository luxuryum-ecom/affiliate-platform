\set ON_ERROR_STOP on
\timing off

-- =====================================================================
-- TEST 052 — Devise dans le ledger. Lancé en tant que postgres.
-- (les triggers append-only ne sont PAS contournés par postgres)
-- =====================================================================

-- ── SETUP ────────────────────────────────────────────────────────────
-- Le trigger handle_new_user crée le profil automatiquement (rôle lu dans
-- raw_user_meta_data->>'role'). On passe donc le rôle en metadata.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111','admin@test.local','{"role":"admin"}'),
  ('22222222-2222-2222-2222-222222222222','aff@test.local','{"role":"affiliate"}');

-- Garantir rôle/statut attendus (le profil existe déjà via trigger).
UPDATE public.profiles SET role='admin',     status='approved' WHERE id='11111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET role='affiliate', status='approved' WHERE id='22222222-2222-2222-2222-222222222222';

INSERT INTO public.products (id, name, sell_price, commission_amount)
  VALUES ('33333333-3333-3333-3333-333333333333','Produit test', 100, 20);

-- Commande 1 : servira earned → reversed
INSERT INTO public.orders
  (id, affiliate_id, product_id, customer_name, customer_phone, customer_city,
   customer_address, quantity, total_amount, commission_amount,
   affiliate_commission_mad_snapshot, status)
VALUES
  ('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333','Client A','0600000000','Casablanca',
   'Adresse A',1,100,20,20,'pending_confirmation');

-- Commande 2 : servira create_payout
INSERT INTO public.orders
  (id, affiliate_id, product_id, customer_name, customer_phone, customer_city,
   customer_address, quantity, total_amount, commission_amount,
   affiliate_commission_mad_snapshot, status)
VALUES
  ('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333','Client B','0611111111','Rabat',
   'Adresse B',1,100,30,30,'pending_confirmation');

-- ── SCHÉMA : colonnes + contraintes + vue présentes ──────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ledger_entries'
     AND column_name IN ('currency','amount_source','fx_rate_to_mad');
  IF n <> 3 THEN RAISE EXCEPTION 'SCHEMA FAIL: % colonnes devise (attendu 3)', n; END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname IN ('ledger_fx_rate_positive','ledger_mad_rate_is_one','ledger_mad_amount_matches_source');
  IF n <> 3 THEN RAISE EXCEPTION 'SCHEMA FAIL: % CHECK (attendu 3)', n; END IF;

  PERFORM 1 FROM pg_views WHERE schemaname='public' AND viewname='ledger_balances';
  IF NOT FOUND THEN RAISE EXCEPTION 'SCHEMA FAIL: vue ledger_balances absente'; END IF;
  RAISE NOTICE 'TEST SCHEMA OK — 3 colonnes, 3 CHECK, vue ledger_balances';
END $$;

-- ── TEST 1 : commission_earned remplit devise MAD/taux 1 ─────────────
UPDATE public.orders SET status='delivered'
 WHERE id='44444444-4444-4444-4444-444444444444';

DO $$
DECLARE r public.ledger_entries;
BEGIN
  SELECT * INTO r FROM public.ledger_entries
   WHERE entry_type='commission_earned'
     AND order_id='44444444-4444-4444-4444-444444444444';
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST1 FAIL: pas d''écriture commission_earned'; END IF;
  IF r.amount <> 20 THEN RAISE EXCEPTION 'TEST1 FAIL: amount=% (attendu 20)', r.amount; END IF;
  IF r.currency <> 'MAD' THEN RAISE EXCEPTION 'TEST1 FAIL: currency=% (attendu MAD)', r.currency; END IF;
  IF r.amount_source <> 20 THEN RAISE EXCEPTION 'TEST1 FAIL: amount_source=% (attendu 20)', r.amount_source; END IF;
  IF r.fx_rate_to_mad <> 1 THEN RAISE EXCEPTION 'TEST1 FAIL: fx=% (attendu 1)', r.fx_rate_to_mad; END IF;
  RAISE NOTICE 'TEST1 OK — commission_earned: amount=20 currency=MAD amount_source=20 fx=1';
END $$;

-- ── TEST 2 : ligne LEGACY (amount_source NULL, defaults) passe les CHECK
INSERT INTO public.ledger_entries (affiliate_id, entry_type, amount, idempotency_key)
VALUES ('22222222-2222-2222-2222-222222222222','commission_earned', 50, 'legacy-shape-1');

DO $$
DECLARE r public.ledger_entries;
BEGIN
  SELECT * INTO r FROM public.ledger_entries WHERE idempotency_key='legacy-shape-1';
  IF r.currency <> 'MAD' OR r.fx_rate_to_mad <> 1 OR r.amount_source IS NOT NULL THEN
    RAISE EXCEPTION 'TEST2 FAIL: legacy defaults inattendus (currency=% fx=% amount_source=%)',
      r.currency, r.fx_rate_to_mad, r.amount_source;
  END IF;
  RAISE NOTICE 'TEST2 OK — ligne legacy acceptée (MAD/1/NULL), CHECK tolèrent amount_source NULL';
END $$;

-- ── TEST 3 : CHECK rejettent les incohérences ────────────────────────
DO $$
BEGIN
  -- 3a : fx = 0 interdit
  BEGIN
    INSERT INTO public.ledger_entries(affiliate_id,entry_type,amount,idempotency_key,fx_rate_to_mad)
    VALUES('22222222-2222-2222-2222-222222222222','payout',-1,'bad-fx-zero',0);
    RAISE EXCEPTION 'TEST3a FAIL: fx=0 accepté';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3a OK — fx=0 rejeté';
  END;
  -- 3b : MAD avec fx <> 1 interdit
  BEGIN
    INSERT INTO public.ledger_entries(affiliate_id,entry_type,amount,idempotency_key,currency,fx_rate_to_mad)
    VALUES('22222222-2222-2222-2222-222222222222','payout',-1,'bad-mad-rate','MAD',2);
    RAISE EXCEPTION 'TEST3b FAIL: MAD fx=2 accepté';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3b OK — MAD avec fx<>1 rejeté';
  END;
  -- 3c : MAD avec amount <> amount_source interdit
  BEGIN
    INSERT INTO public.ledger_entries(affiliate_id,entry_type,amount,idempotency_key,currency,amount_source,fx_rate_to_mad)
    VALUES('22222222-2222-2222-2222-222222222222','payout',-100,'bad-mad-amt','MAD',-50,1);
    RAISE EXCEPTION 'TEST3c FAIL: MAD amount<>amount_source accepté';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'TEST3c OK — MAD amount<>amount_source rejeté';
  END;
  -- 3d : devise inconnue rejetée (FK)
  BEGIN
    INSERT INTO public.ledger_entries(affiliate_id,entry_type,amount,idempotency_key,currency,amount_source,fx_rate_to_mad)
    VALUES('22222222-2222-2222-2222-222222222222','payout',-100,'bad-ccy','ZZZ',-10,10);
    RAISE EXCEPTION 'TEST3d FAIL: devise inconnue acceptée';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'TEST3d OK — devise inconnue rejetée (FK)';
  END;
  -- 3e : devise NON-MAD cohérente acceptée (USD, amount=fx*source, fx libre)
  INSERT INTO public.ledger_entries(affiliate_id,entry_type,amount,idempotency_key,currency,amount_source,fx_rate_to_mad)
  VALUES('22222222-2222-2222-2222-222222222222','payout',-100,'ok-usd','USD',-10,10);
  RAISE NOTICE 'TEST3e OK — écriture USD cohérente acceptée (forward-compat multi-devises)';
END $$;

-- ── TEST 4 : immuabilité préservée (UPDATE/DELETE/TRUNCATE bloqués) ───
DO $$
BEGIN
  BEGIN
    UPDATE public.ledger_entries SET currency='USD' WHERE idempotency_key='legacy-shape-1';
    RAISE EXCEPTION 'TEST4a FAIL: UPDATE autorisé';
  EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'TEST4a OK — UPDATE bloqué (append-only)';
  END;
  BEGIN
    DELETE FROM public.ledger_entries WHERE idempotency_key='legacy-shape-1';
    RAISE EXCEPTION 'TEST4b FAIL: DELETE autorisé';
  EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'TEST4b OK — DELETE bloqué (append-only)';
  END;
END $$;
DO $$
BEGIN
  BEGIN
    TRUNCATE public.ledger_entries;
    RAISE EXCEPTION 'TEST4c FAIL: TRUNCATE autorisé';
  EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'TEST4c OK — TRUNCATE bloqué (append-only)';
  END;
END $$;

-- ── TEST 5 : commission_reversed symétrique en MAD ───────────────────
UPDATE public.orders SET status='returned'
 WHERE id='44444444-4444-4444-4444-444444444444';

DO $$
DECLARE r public.ledger_entries;
BEGIN
  SELECT * INTO r FROM public.ledger_entries
   WHERE entry_type='commission_reversed'
     AND order_id='44444444-4444-4444-4444-444444444444';
  IF NOT FOUND THEN RAISE EXCEPTION 'TEST5 FAIL: pas d''écriture commission_reversed'; END IF;
  IF r.amount <> -20 THEN RAISE EXCEPTION 'TEST5 FAIL: amount=% (attendu -20)', r.amount; END IF;
  IF r.currency <> 'MAD' OR r.amount_source <> -20 OR r.fx_rate_to_mad <> 1 THEN
    RAISE EXCEPTION 'TEST5 FAIL: devise (currency=% amount_source=% fx=%)', r.currency, r.amount_source, r.fx_rate_to_mad;
  END IF;
  RAISE NOTICE 'TEST5 OK — commission_reversed: amount=-20 currency=MAD amount_source=-20 fx=1';
END $$;

-- ── TEST 6 : create_payout idempotent + remplit la devise ────────────
-- Commande 2 → delivered → commission pending → approved
UPDATE public.orders SET status='delivered'
 WHERE id='55555555-5555-5555-5555-555555555555';
UPDATE public.commissions SET status='approved'
 WHERE order_id='55555555-5555-5555-5555-555555555555';

-- Simuler le JWT admin (auth.uid() → profil admin → my_role()='admin')
SELECT set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111"}',false);

DO $$
DECLARE p1 public.payouts; p2 public.payouts; r public.ledger_entries; n int;
BEGIN
  p1 := public.create_payout('22222222-2222-2222-2222-222222222222','paykey-1');
  -- rejeu même clé → même payout, aucun doublon
  p2 := public.create_payout('22222222-2222-2222-2222-222222222222','paykey-1');
  IF p1.id <> p2.id THEN RAISE EXCEPTION 'TEST6 FAIL: idempotence cassée (payouts différents)'; END IF;
  IF p1.amount <> 30 THEN RAISE EXCEPTION 'TEST6 FAIL: montant payout=% (attendu 30)', p1.amount; END IF;

  SELECT count(*) INTO n FROM public.payouts WHERE affiliate_id='22222222-2222-2222-2222-222222222222';
  IF n <> 1 THEN RAISE EXCEPTION 'TEST6 FAIL: % payouts créés (attendu 1)', n; END IF;

  SELECT count(*) INTO n FROM public.ledger_entries WHERE entry_type='payout' AND payout_id=p1.id;
  IF n <> 1 THEN RAISE EXCEPTION 'TEST6 FAIL: % écritures payout au ledger (attendu 1)', n; END IF;

  SELECT * INTO r FROM public.ledger_entries WHERE entry_type='payout' AND payout_id=p1.id;
  IF r.amount <> -30 OR r.currency <> 'MAD' OR r.amount_source <> -30 OR r.fx_rate_to_mad <> 1 THEN
    RAISE EXCEPTION 'TEST6 FAIL: ligne payout (amount=% currency=% amount_source=% fx=%)',
      r.amount, r.currency, r.amount_source, r.fx_rate_to_mad;
  END IF;
  RAISE NOTICE 'TEST6 OK — create_payout idempotent (1 payout, 1 ligne), devise MAD/-30/1';
END $$;

-- ── TEST 7 : vue ledger_balances (solde MAD = SUM(amount) par devise) ─
DO $$
DECLARE v_mad numeric; v_sum numeric;
BEGIN
  -- balance_mad MAD de l'affilié = SUM(amount) des lignes MAD
  SELECT balance_mad INTO v_mad FROM public.ledger_balances
   WHERE affiliate_id='22222222-2222-2222-2222-222222222222' AND currency='MAD';
  SELECT SUM(amount) INTO v_sum FROM public.ledger_entries
   WHERE affiliate_id='22222222-2222-2222-2222-222222222222' AND currency='MAD';
  IF v_mad IS DISTINCT FROM v_sum THEN
    RAISE EXCEPTION 'TEST7 FAIL: vue balance_mad=% <> SUM(amount)=%', v_mad, v_sum;
  END IF;
  RAISE NOTICE 'TEST7 OK — ledger_balances.balance_mad(MAD)=% = SUM(amount)', v_mad;
END $$;

\echo ''
\echo '================== TOUS LES TESTS PASSENT =================='
SELECT entry_type, currency, amount, amount_source, fx_rate_to_mad
  FROM public.ledger_entries
 WHERE affiliate_id='22222222-2222-2222-2222-222222222222'
 ORDER BY created_at;
\echo '--- ledger_balances ---'
SELECT * FROM public.ledger_balances
 WHERE affiliate_id='22222222-2222-2222-2222-222222222222'
 ORDER BY currency;
