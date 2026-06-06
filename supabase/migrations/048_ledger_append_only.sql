-- =============================================================================
-- Migration 048 — Grand livre (ledger) append-only & immuable
-- (idempotent — safe to re-run)
-- =============================================================================
-- But :
--   Établir un grand livre append-only (`public.ledger_entries`) qui enregistre
--   chaque mouvement financier d'affilié sous forme d'écritures SIGNÉES et
--   immuables. Les soldes d'affilié se CALCULENT à partir de ces écritures
--   (SUM(amount)), jamais édités en place.
--
--   Le ledger est branché sur les triggers commission EXISTANTS (Phase 1) :
--     - handle_order_delivered()        → écriture 'commission_earned' (+)
--     - handle_order_status_reversal()  → écriture 'commission_reversed' (-)
--   Ces deux fonctions sont étendues ICI par CREATE OR REPLACE : la logique
--   commission existante est conservée À L'IDENTIQUE, on ne fait qu'AJOUTER
--   l'insertion ledger après l'opération commission réussie.
--
--   Idempotence financière : chaque écriture porte une `idempotency_key` UNIQUE,
--   et les INSERT ledger utilisent ON CONFLICT (idempotency_key) DO NOTHING →
--   aucun double versement même si un trigger se redéclenche / on rejoue.
--
--   Argent : numeric(12,2). AUCUN float.
--
--   NOTE conformité : la rigueur technique (atomicité, idempotence, immuabilité)
--   est couverte ici. La conformité légale/fiscale (KYC, AML, licences de
--   paiement) relève d'un professionnel et N'EST PAS traitée par cette migration.
-- =============================================================================

-- ── 1. Table ledger_entries (append-only, immuable) ──────────────────────────

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    uuid          NOT NULL REFERENCES public.profiles(id),
  entry_type      text          NOT NULL
                                CHECK (entry_type IN (
                                  'commission_earned',
                                  'commission_reversed',
                                  'payout'
                                )),
  -- Montant SIGNÉ :
  --   commission_earned   → positif
  --   commission_reversed → négatif
  --   payout              → négatif
  amount          numeric(12,2) NOT NULL,
  order_id        uuid          REFERENCES public.orders(id),
  commission_id   uuid          REFERENCES public.commissions(id),
  payout_id       uuid          REFERENCES public.payouts(id),
  idempotency_key text          NOT NULL UNIQUE,
  metadata        jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_affiliate_created
  ON public.ledger_entries (affiliate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_type
  ON public.ledger_entries (entry_type);

COMMENT ON TABLE public.ledger_entries IS
  'Grand livre append-only & immuable. Écritures financières SIGNÉES par affilié. '
  'Les soldes se calculent par SUM(amount), jamais édités en place. '
  'Écrit exclusivement par triggers SECURITY DEFINER / service_role.';

-- ── 2. Immuabilité (append-only) : bloquer UPDATE & DELETE ───────────────────

CREATE OR REPLACE FUNCTION public.ledger_block_mutations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_block_mutations ON public.ledger_entries;
CREATE TRIGGER trg_ledger_block_mutations
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.ledger_block_mutations();

-- ── 3. RLS (deny par défaut) ─────────────────────────────────────────────────

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- SELECT : l'affilié voit ses propres écritures ; admin/agent voient tout.
-- Aucune policy INSERT/UPDATE/DELETE : les écritures passent par les triggers
-- SECURITY DEFINER (ou service_role), qui contournent la RLS. Deny par défaut.
DROP POLICY IF EXISTS "ledger: affiliates read own" ON public.ledger_entries;
CREATE POLICY "ledger: affiliates read own"
  ON public.ledger_entries FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() OR public.my_role() IN ('admin', 'agent'));

-- ── 4. handle_order_delivered() — étendu : + écriture ledger 'commission_earned'
-- Corps EXACT de la migration 009 conservé À L'IDENTIQUE.
-- AJOUT : après l'INSERT réussi dans commissions, on écrit l'entrée ledger
-- positive correspondante (idempotente via ON CONFLICT).

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
      INSERT INTO public.ledger_entries (affiliate_id, entry_type, amount, order_id, commission_id, idempotency_key, metadata)
      SELECT NEW.affiliate_id, 'commission_earned', v_commission, NEW.id, c.id,
             'commission_earned:' || NEW.id::text, '{}'::jsonb
      FROM public.commissions c WHERE c.order_id = NEW.id
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Le trigger trg_order_delivered (migration 009) pointe déjà vers cette fonction
-- par son nom ; CREATE OR REPLACE FUNCTION suffit, inutile de le recréer.

-- ── 5. handle_order_status_reversal() — étendu : + écriture ledger négative ───
-- Corps EXACT de la migration 013 conservé À L'IDENTIQUE.
-- AJOUT : après l'UPDATE qui passe les commissions en reversed=true, on écrit
-- une entrée ledger NÉGATIVE par commission reversée (idempotente).
-- On utilise c.affiliate_id (robuste : la source de vérité de l'affilié de la
-- commission), pas NEW.affiliate_id.

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
    INSERT INTO public.ledger_entries (affiliate_id, entry_type, amount, order_id, commission_id, idempotency_key, metadata)
    SELECT c.affiliate_id, 'commission_reversed', -c.amount, NEW.id, c.id,
           'commission_reversed:' || c.id::text, '{}'::jsonb
    FROM public.commissions c
    WHERE c.order_id = NEW.id AND c.reversed = true
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Le trigger trg_order_status_reversal (migration 013) pointe déjà vers cette
-- fonction par son nom ; CREATE OR REPLACE FUNCTION suffit.
