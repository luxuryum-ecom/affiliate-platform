-- =============================================================================
-- Migration 062 — Gestion logistique livraison wholesale (LOT 4.1 — fondation DB)
-- =============================================================================
-- But :
--   Poser la fondation DB pour tracer le coût de livraison wholesale côté Mozouna.
--
--   RÈGLE BUSINESS GRAVÉE — Mozouna ne supporte JAMAIS de sa poche le coût de
--   livraison. Trois cas exclusifs par commande :
--     'rebilled_client'  : Mozouna paie le livreur X, refacture Y ≥ X au client.
--                          Profit transport autorisé (arbitrage Abdou Q2). Net ≥ 0.
--     'supplier_billed'  : le fournisseur facture la livraison. Coût Mozouna = 0.
--     'supplier_free'    : livraison gratuite fournisseur. Coût Mozouna = 0.
--
--   Garde-fou bloquant : le CHECK constraint C2 refuse toute configuration où
--   Mozouna porterait un coût sans contrepartie.
--
--   Ce lot pose UNIQUEMENT :
--     A. 4 colonnes additives sur wholesale_orders
--     B. CHECK constraint de garde-fou (C2)
--     C. Table ledger dédié append-only wholesale_delivery_ledger (C1 + C3)
--
--   PAS de RPC d'écriture ici — ce sera le LOT 4.2.
--   Argent : numeric(12,2). AUCUN float.
-- =============================================================================

-- ── A. Colonnes additives sur wholesale_orders ────────────────────────────────
-- Toutes ajoutées IF NOT EXISTS pour idempotence.
-- NE PAS injecter dans total_cost_mad / total_amount :
--   - total_cost_mad est géré par le trigger compute_wholesale_order_costs (025)
--   - total_amount est la recette côté client (dont delivery_cost de 013 fait partie)
-- Ces colonnes sont ORTHOGONALES au calcul de marge existant.

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS logistics_mode text NULL
    CHECK (logistics_mode IN ('pickup_by_runner', 'supplier_fleet'));

COMMENT ON COLUMN public.wholesale_orders.logistics_mode IS
  'Mode d''acheminement physique de la commande wholesale. '
  'NULL = non encore renseigné. '
  '''pickup_by_runner'' = coursier envoyé par Mozouna. '
  '''supplier_fleet'' = flotte du fournisseur.';

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS delivery_cost_handling text NULL
    CHECK (delivery_cost_handling IN ('rebilled_client', 'supplier_billed', 'supplier_free'));

COMMENT ON COLUMN public.wholesale_orders.delivery_cost_handling IS
  'Qui porte le coût de livraison wholesale. NULL = non renseigné (legacy). '
  '''rebilled_client''  : Mozouna avance, refacture au client (delivery_rebill_mad ≥ delivery_cost_mad). '
  '''supplier_billed''  : fournisseur facture — coût Mozouna = 0. '
  '''supplier_free''    : gratuit fournisseur — coût Mozouna = 0.';

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS delivery_cost_mad numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.wholesale_orders.delivery_cost_mad IS
  'Coût réel DÉCAISSÉ par Mozouna au livreur, en MAD. '
  'Pertinent uniquement quand delivery_cost_handling = ''rebilled_client''. '
  'Vaut 0 dans les deux autres cas (fournisseur paie ou gratuit). '
  'JAMAIS injecté dans total_cost_mad (orthogonal au trigger 025).';

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS delivery_rebill_mad numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.wholesale_orders.delivery_rebill_mad IS
  'Montant refacturé au client en MAD (recette transport). '
  'Pertinent uniquement quand delivery_cost_handling = ''rebilled_client''. '
  'Invariant : delivery_rebill_mad ≥ delivery_cost_mad (profit transport autorisé). '
  'Vaut 0 dans les deux autres cas. '
  'Distinct de delivery_cost (migration 013) qui est la livraison COD côté client.';

-- ── B. CHECK constraint garde-fou (C2) ───────────────────────────────────────
-- Bloque toute configuration où Mozouna porterait un coût sans contrepartie.
--
-- Invariants :
--   1. Les deux montants sont toujours >= 0 (pas de montants négatifs)
--   2. rebilled_client  : delivery_rebill_mad >= delivery_cost_mad
--      (>= et non = : le profit transport est autorisé — arbitrage Abdou Q2)
--   3. supplier_billed  : les deux montants doivent être 0 (Mozouna ne paie pas)
--   4. supplier_free    : les deux montants doivent être 0 (Mozouna ne paie pas)
--   5. NULL (legacy)    : les deux montants doivent être 0 (commandes existantes :
--      DEFAULT 0 garanti, ce cas passe sans aucun UPDATE sur les lignes legacy)
--
-- VALIDATION PRÉ-ADD : toutes les lignes existantes ont delivery_cost_handling IS NULL
-- et delivery_cost_mad = 0 / delivery_rebill_mad = 0 (DEFAULT 0 appliqué ci-dessus).
-- Le cas NULL avec 0/0 est couvert par la clause (handling IS NULL AND cost=0 AND rebill=0).
-- Le ADD CONSTRAINT scanne les lignes en LECTURE (pas d'UPDATE) — compatible append-only.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wholesale_delivery_no_mozouna_loss'
  ) THEN
    ALTER TABLE public.wholesale_orders
      ADD CONSTRAINT wholesale_delivery_no_mozouna_loss CHECK (
        -- Les montants ne peuvent pas être négatifs
        delivery_cost_mad >= 0
        AND delivery_rebill_mad >= 0
        AND (
          -- Cas 1 : Mozouna avance puis refacture. ">=" (pas "=") = profit autorisé.
          (delivery_cost_handling = 'rebilled_client'
            AND delivery_rebill_mad >= delivery_cost_mad)
          -- Cas 2 : fournisseur facture → coût Mozouna = 0, pas de refacturation
          OR (delivery_cost_handling = 'supplier_billed'
              AND delivery_cost_mad = 0 AND delivery_rebill_mad = 0)
          -- Cas 3 : livraison gratuite fournisseur → coût Mozouna = 0, pas de refacturation
          OR (delivery_cost_handling = 'supplier_free'
              AND delivery_cost_mad = 0 AND delivery_rebill_mad = 0)
          -- Cas legacy : handling non encore renseigné, montants forcément à 0
          OR (delivery_cost_handling IS NULL
              AND delivery_cost_mad = 0 AND delivery_rebill_mad = 0)
        )
      );
  END IF;
END$$;

COMMENT ON CONSTRAINT wholesale_delivery_no_mozouna_loss ON public.wholesale_orders IS
  'Garde-fou inviolable : Mozouna ne supporte jamais un coût livraison sans contrepartie. '
  'delivery_rebill_mad >= delivery_cost_mad (>= et non = : profit transport autorisé). '
  'supplier_billed / supplier_free imposent cost=0 ET rebill=0. '
  'NULL legacy impose cost=0 ET rebill=0 (commandes antérieures à cette migration).';

-- ── C. Ledger dédié append-only : wholesale_delivery_ledger ──────────────────
-- Conditions C1 (ledger dédié, solde par SUM) + C3 (deux types d'écriture distincts).
--
-- Principe : deux écritures distinctes pour suivre l'encaissement :
--   'delivery_cost_incurred'     : décaissement Mozouna → amount_mad < 0
--   'delivery_rebill_collected'  : encaissement client → amount_mad > 0
--
-- Solde cash transport d'une commande = SUM(amount_mad) WHERE wholesale_order_id = X.
-- Si SUM < 0 → Mozouna à découvert (décaissement pas encore remboursé).
-- Si SUM = 0 → équilibré (cas supplier_billed / supplier_free : aucune écriture).
-- Si SUM > 0 → profit transport net réalisé.
--
-- Format idempotency_key : 'wdl:<order_id>:<entry_type>:<event_uuid>'
-- L'event_uuid est fourni par l'action appelante (LOT 4.2).
-- Cela identifie l'ÉVÉNEMENT (un décaissement, un encaissement), pas la valeur,
-- ce qui permet des corrections légitimes (via une nouvelle écriture de correction)
-- sans être avalé par un ON CONFLICT silencieux sur la valeur.
--
-- ON DELETE RESTRICT sur wholesale_orders : un ledger financier ne se détruit pas
-- avec la commande. RESTRICT lève une erreur si on tente de supprimer une commande
-- ayant des écritures ledger — protection forte. (048 ne déclare pas de FK donc
-- pas de CASCADE vs RESTRICT à aligner ; le comportement RESTRICT est plus sûr ici.)

CREATE TABLE IF NOT EXISTS public.wholesale_delivery_ledger (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesale_order_id uuid          NOT NULL
                                   REFERENCES public.wholesale_orders(id)
                                   ON DELETE RESTRICT,  -- voir commentaire ci-dessus
  entry_type         text          NOT NULL
                                   CHECK (entry_type IN (
                                     'delivery_cost_incurred',
                                     'delivery_rebill_collected'
                                   )),
  -- Montant SIGNÉ en MAD :
  --   'delivery_cost_incurred'    → négatif  (décaissement Mozouna)
  --   'delivery_rebill_collected' → positif  (encaissement client)
  -- CHECK de cohérence signe ci-dessous.
  amount_mad         numeric(12,2) NOT NULL,
  currency           text          NOT NULL DEFAULT 'MAD',
  -- Format attendu (LOT 4.2) :
  --   'wdl:' || order_id::text || ':' || entry_type || ':' || gen_random_uuid()::text
  -- L'event_uuid rend la clé unique par événement, pas par valeur.
  idempotency_key    text          NOT NULL UNIQUE,
  created_by         uuid          NULL
                                   REFERENCES auth.users(id)
                                   ON DELETE SET NULL,
  created_at         timestamptz   NOT NULL DEFAULT now()
);

-- CHECK de cohérence signe : le signe du montant doit correspondre au type d'écriture.
-- delivery_cost_incurred   : décaissement → amount_mad <= 0 (0 autorisé : écriture neutre)
-- delivery_rebill_collected: encaissement → amount_mad >= 0 (0 autorisé : écriture neutre)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wdl_amount_sign_matches_entry_type'
  ) THEN
    ALTER TABLE public.wholesale_delivery_ledger
      ADD CONSTRAINT wdl_amount_sign_matches_entry_type CHECK (
        (entry_type = 'delivery_cost_incurred'    AND amount_mad <= 0)
        OR (entry_type = 'delivery_rebill_collected' AND amount_mad >= 0)
      );
  END IF;
END$$;

COMMENT ON TABLE public.wholesale_delivery_ledger IS
  'Grand livre append-only & immuable pour les flux de livraison wholesale. '
  'Écritures SIGNÉES : décaissement Mozouna (< 0) et encaissement client (> 0). '
  'Solde cash par commande = SUM(amount_mad) WHERE wholesale_order_id = X. '
  'Format idempotency_key : ''wdl:<order_id>:<entry_type>:<event_uuid>''. '
  'Écritures exclusivement via RPC SECURITY DEFINER (LOT 4.2).';

COMMENT ON COLUMN public.wholesale_delivery_ledger.wholesale_order_id IS
  'FK avec ON DELETE RESTRICT : un ledger financier ne disparaît pas avec la commande. '
  'Supprimer une commande ayant des écritures ledger lève une erreur — protection forte.';

COMMENT ON COLUMN public.wholesale_delivery_ledger.amount_mad IS
  'Montant SIGNÉ en MAD. '
  'delivery_cost_incurred <= 0 (décaissement). '
  'delivery_rebill_collected >= 0 (encaissement). '
  'SUM(amount_mad) par commande = solde net transport Mozouna.';

COMMENT ON COLUMN public.wholesale_delivery_ledger.idempotency_key IS
  'Identifie l''ÉVÉNEMENT (pas la valeur). Format : ''wdl:<order_id>:<entry_type>:<event_uuid>''. '
  'L''event_uuid est généré par l''action appelante (LOT 4.2). '
  'Une correction légitime crée une NOUVELLE écriture avec un nouvel event_uuid, '
  'pas un UPDATE (impossible — trigger anti-mutation).';

-- Index pour le SUM par commande (requête principale : solde transport d'une commande)
CREATE INDEX IF NOT EXISTS idx_wdl_order_id
  ON public.wholesale_delivery_ledger (wholesale_order_id);

-- Index pour les audits par date
CREATE INDEX IF NOT EXISTS idx_wdl_created_at
  ON public.wholesale_delivery_ledger (created_at DESC);

-- ── C.1 Immuabilité (append-only) : bloque UPDATE, DELETE, TRUNCATE ──────────
-- Pattern calqué EXACTEMENT sur ledger_block_mutations de la migration 048.
-- La fonction est créée avec un nom spécifique à cette table pour éviter
-- les conflits avec la fonction générique de 048 (qui s'appelle ledger_block_mutations).

CREATE OR REPLACE FUNCTION public.wdl_block_mutations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wholesale_delivery_ledger is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- Bloque UPDATE et DELETE ligne par ligne
DROP TRIGGER IF EXISTS trg_wdl_block_mutations ON public.wholesale_delivery_ledger;
CREATE TRIGGER trg_wdl_block_mutations
  BEFORE UPDATE OR DELETE ON public.wholesale_delivery_ledger
  FOR EACH ROW EXECUTE FUNCTION public.wdl_block_mutations();

-- Bloque TRUNCATE (statement-level, non couvert par FOR EACH ROW)
DROP TRIGGER IF EXISTS trg_wdl_block_truncate ON public.wholesale_delivery_ledger;
CREATE TRIGGER trg_wdl_block_truncate
  BEFORE TRUNCATE ON public.wholesale_delivery_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION public.wdl_block_mutations();

-- ── C.2 RLS — deny par défaut, lecture admin/agent uniquement ─────────────────
-- Calqué sur le pattern 048 (my_role() IN ('admin', 'agent')) et 029 (admin ALL).
-- PAS de policy INSERT/UPDATE/DELETE : l'écriture viendra exclusivement d'une
-- RPC SECURITY DEFINER au LOT 4.2, qui contourne la RLS par définition.
-- Les acheteurs (buyer) ne voient PAS ce ledger : c'est une donnée interne Mozouna
-- (coûts réels, marges transport) — jamais exposée côté client.

ALTER TABLE public.wholesale_delivery_ledger ENABLE ROW LEVEL SECURITY;

-- Deny par défaut : aucune politique ne couvre les rôles non admin/agent.
-- Un utilisateur authentifié qui n'est ni admin ni agent ne voit rien.

DROP POLICY IF EXISTS "wdl: admin and agent read" ON public.wholesale_delivery_ledger;
CREATE POLICY "wdl: admin and agent read"
  ON public.wholesale_delivery_ledger
  FOR SELECT
  TO authenticated
  USING (public.my_role() IN ('admin', 'agent'));

-- GRANT minimal : authenticated peut SELECT (filtré par RLS), pas d'INSERT/UPDATE/DELETE
-- direct — ces opérations sont réservées aux RPC SECURITY DEFINER (LOT 4.2).
GRANT SELECT ON public.wholesale_delivery_ledger TO authenticated;
