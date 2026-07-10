-- =============================================================================
-- Migration 126 — Registre livreurs (module Livreurs, Lot A) — COUCHE DONNÉES
-- =============================================================================
-- Réf : CLAUDE.md (grand livre 121-125, courier_remittances/_orders 122,
-- v_courier_remittance_pending / v_treasury_overview 125).
--
-- PÉRIMÈTRE — ADDITIF PUR, ZÉRO TRIGGER/RPC FINANCIER TOUCHÉ :
--   • Table `couriers` : fiche livreur (société type Ozone/Cathedis OU livreur
--     personnel), avec plafond d'encours (`balance_cap_mad`, 0 = illimité) et
--     `access_code` (lien /courier cloisonné, posé par l'action serveur, Lot B).
--   • Table `courier_product_debts` : créances PRODUIT (retour manquant / fuite),
--     append-only immuable — calque exact `scan_events_immutable` (mig 100).
--   • `orders.courier_id` : assignation livreur, colonne additive nullable.
--   • Vue `v_courier_balances` (security_invoker + rempart staff, calque mig 125) :
--     solde CALCULÉ (cash détenu + créances produit), AUCUNE table financière
--     existante n'est modifiée — lecture seule sur orders/courier_remittance_orders/
--     courier_product_debts.
--
-- DÉCISION D'ARCHI (verrouillée, cf. prompt @backend-db) : le solde livreur est
-- une VUE dérivée. On NE TOUCHE À AUCUN trigger/RPC du grand livre (121-125).
--
-- Idempotente : CREATE TABLE/POLICY/FUNCTION/VIEW IF NOT EXISTS ou OR REPLACE,
-- DROP POLICY/TRIGGER IF EXISTS avant recréation. Zéro donnée existante modifiée.
-- =============================================================================

-- ── 1. Table couriers (fiche livreur) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.couriers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  courier_type     text        NOT NULL CHECK (courier_type IN ('company', 'personal')),
  company_name     text,
  phone            text,
  notes            text,
  status           text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  -- Plafond d'encours autorisé (cash + créances produit). 0 = pas de plafond.
  balance_cap_mad  numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_cap_mad >= 0),
  -- Jeton du lien /courier cloisonné (Lot B) — posé par l'action serveur à la
  -- création, nullable ici (couche données pure, pas de génération SQL).
  access_code      text        UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid
);

COMMENT ON TABLE public.couriers IS
  'Registre livreurs (Lot A, mig 126) : société de livraison (Ozone/Cathedis, courier_type=company) '
  'ou livreur personnel (courier_type=personal). balance_cap_mad=0 = pas de plafond. access_code = '
  'jeton du lien /courier cloisonné, posé par les server actions (Lot B). Écriture EXCLUSIVEMENT via '
  'service_role/server actions admin-only — aucune policy INSERT/UPDATE/DELETE (deny par défaut).';

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "couriers: staff read" ON public.couriers;
CREATE POLICY "couriers: staff read"
  ON public.couriers FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');  -- admin-only (moindre privilège, @security P2-1/P2-2 : access_code non lisible par un agent)
-- Aucune policy INSERT/UPDATE/DELETE → deny total (écriture via service_role/server actions
-- admin-only uniquement, cf. src/app/actions/couriers.ts).

-- ── 2. Table courier_product_debts (créances PRODUIT, append-only immuable) ──

CREATE TABLE IF NOT EXISTS public.courier_product_debts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id   uuid        NOT NULL REFERENCES public.couriers(id),
  order_id     uuid        REFERENCES public.orders(id),
  variant_id   uuid,
  quantity     integer     NOT NULL CHECK (quantity > 0),
  -- amount_mad NÉGATIF autorisé = ligne de contre-passation d'une créance erronée (corrige @finance P1-2 :
  -- append-only conservé, mais une créance fausse est corrigeable par une nouvelle ligne négative).
  amount_mad   numeric(12,2) NOT NULL CHECK (amount_mad <> 0),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_courier_product_debts_courier
  ON public.courier_product_debts (courier_id);

COMMENT ON TABLE public.courier_product_debts IS
  'Créances PRODUIT livreur (Lot A, mig 126) : retour manquant / fuite constatée. Append-only '
  'immuable (calque scan_events_immutable, mig 100) — aucune correction/suppression, seulement de '
  'nouvelles lignes (ex. régularisation = nouvelle ligne négative si le besoin apparaît plus tard). '
  'Écriture EXCLUSIVEMENT via service_role/server actions admin-only. RLS SELECT staff-only.';

ALTER TABLE public.courier_product_debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_product_debts: staff read" ON public.courier_product_debts;
CREATE POLICY "courier_product_debts: staff read"
  ON public.courier_product_debts FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');  -- admin-only (moindre privilège, @security P2-1/P2-2 : access_code non lisible par un agent)
-- Aucune policy INSERT/UPDATE/DELETE → deny total (écriture via service_role uniquement).

-- Trigger d'immutabilité (append-only strict, calque scan_events_immutable mig 100).
CREATE OR REPLACE FUNCTION public.courier_product_debts_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'courier_product_debts est append-only (ni UPDATE ni DELETE)';
END;
$$;

DROP TRIGGER IF EXISTS trg_courier_product_debts_immutable ON public.courier_product_debts;
CREATE TRIGGER trg_courier_product_debts_immutable
  BEFORE UPDATE OR DELETE ON public.courier_product_debts
  FOR EACH ROW EXECUTE FUNCTION public.courier_product_debts_immutable();

-- ── 3. orders.courier_id — assignation livreur (additive, nullable) ──────────

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_id uuid REFERENCES public.couriers(id);

COMMENT ON COLUMN public.orders.courier_id IS
  'Livreur assigné (registre couriers, mig 126). Nullable — additif, ne remplace aucun mécanisme '
  'existant (courier_name/courier_id texte libre sur courier_remittances reste inchangé).';

-- ── 4. Vue v_courier_balances — solde CALCULÉ, lecture seule (security_invoker) ─
-- Ne modifie AUCUN trigger/RPC financier existant (121-125). cash_owed_mad = cash
-- détenu par le livreur (commandes livrées assignées, pas encore couvertes par un
-- courier_remittance_orders) ; product_debt_mad = créances produit ; total =
-- somme ; over_cap = plafond dépassé (balance_cap_mad=0 → jamais over_cap).
CREATE OR REPLACE VIEW public.v_courier_balances
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.name,
  c.courier_type,
  c.company_name,
  c.status,
  c.balance_cap_mad,
  COALESCE(cash.cash_owed_mad, 0)                                        AS cash_owed_mad,
  COALESCE(debt.product_debt_mad, 0)                                     AS product_debt_mad,
  COALESCE(cash.cash_owed_mad, 0) + COALESCE(debt.product_debt_mad, 0)   AS total_balance_mad,
  (c.balance_cap_mad > 0
    AND (COALESCE(cash.cash_owed_mad, 0) + COALESCE(debt.product_debt_mad, 0)) > c.balance_cap_mad
  ) AS over_cap
FROM public.couriers c
LEFT JOIN LATERAL (
  -- Cash dû par le livreur = résidu PRO-RATA par commande (corrige @finance P1-1) :
  --   résidu = total_amount − received × (total_amount / expected)  [du bordereau couvrant la commande]
  -- Commande non réconciliée → sous-requête NULL → résidu = total_amount (dû en entier).
  -- Réconciliée en TOTAL (received=expected) → résidu = 0. Réconciliée en PARTIEL → le manque
  -- (expected−received) reste chiffré, réparti au prorata (le versement partiel n'efface plus le solde).
  SELECT COALESCE(SUM(
    o.total_amount - COALESCE((
      SELECT ROUND(cr.received_amount_mad * o.total_amount / NULLIF(cr.expected_amount_mad, 0), 2)
      FROM public.courier_remittance_orders cro
      JOIN public.courier_remittances cr ON cr.id = cro.remittance_id
      WHERE cro.order_id = o.id
      LIMIT 1
    ), 0)
  ), 0) AS cash_owed_mad
  FROM public.orders o
  WHERE o.courier_id = c.id
    AND o.status = 'delivered'
) cash ON true
LEFT JOIN LATERAL (
  SELECT SUM(d.amount_mad) AS product_debt_mad
  FROM public.courier_product_debts d
  WHERE d.courier_id = c.id
) debt ON true
-- Rempart STAFF dans la vue (défense en profondeur, calque mig 125 P2-1) :
-- indépendant de la RLS des tables sous-jacentes, un non-staff obtient 0 ligne.
-- service_role conservé (server actions / jobs).
WHERE (public.my_role() = 'admin' OR auth.role() = 'service_role');

COMMENT ON VIEW public.v_courier_balances IS
  'Solde livreur CALCULÉ (Lot A, mig 126) : cash_owed_mad = Σ total_amount des commandes livrées '
  'assignées pas encore réconciliées (courier_remittance_orders) ; product_debt_mad = Σ créances '
  'produit (courier_product_debts) ; total_balance_mad = somme ; over_cap = plafond dépassé '
  '(balance_cap_mad=0 → jamais over_cap). security_invoker=true + rempart staff : aucune donnée '
  'financière existante modifiée, lecture pure sur orders/courier_remittance_orders/'
  'courier_product_debts (121-125, 126).';
