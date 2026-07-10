-- Migration 125 — Vues P0 : réconciliation livreur + cockpit trésorerie.
--
-- CONTEXTE : mig 121-124 posent le grand livre double-entrée, la réconciliation
-- livreur (courier_remittances/_orders + RPC reconcile_courier_remittance) et la
-- garde N1 (commission payable seulement après réconciliation). Ce lot n'ajoute
-- AUCUNE logique ni table : uniquement 2 vues de LECTURE pour les écrans admin
-- (réconciliation + cockpit trésorerie) qui consomment cet existant.
--
-- SÉCURITÉ : les 2 vues sont WITH (security_invoker = true) — elles n'élèvent
-- AUCUN privilège. L'accès réel est garanti par (a) la RLS des tables sous-
-- jacentes (orders, ledger_accounts/ledger_postings, courier_remittance_orders —
-- toutes déjà RLS staff-only ou équivalent) et (b) les server actions admin-only
-- côté serveur qui les consomment. Aucune policy nouvelle n'est créée ici, comme
-- pour v_ledger_balances / v_courier_cash_in_transit (mig 121/122).
--
-- Zéro colonne de marge/coût exposée (factory_cost, platform_margin_income en
-- détail par order n'existe pas ici — seul l'agrégat par compte est exposé dans
-- v_treasury_overview, jamais par commande).
--
-- ADAPTATION SIGNALÉE (décision prise seule, cf. autonomie de décision CLAUDE.md) :
--   orders n'a PAS de colonne `reference`, `courier_code`, `courier_zone` ni `city`
--   (vérifié en LOCAL sur le schéma réel — 001_initial_schema.sql + types générés).
--   Adaptations :
--     - reference    → o.id::text (troncature/formatage fait côté UI si besoin)
--     - city          → o.customer_city
--     - courier_code / courier_zone → LEFT JOIN public.cities ON cities.name =
--       o.customer_city (ces colonnes existent sur `cities`, mig 015, pour l'intégration
--       transporteur). NULL si la ville n'a pas de fiche `cities` correspondante —
--       comportement dégradé propre, pas un blocage.
--
-- Idempotente et additive : CREATE OR REPLACE VIEW, aucune donnée modifiée.

-- ── 1. Commandes livrées en attente de réconciliation livreur ────────────────
-- (« à verser » par le livreur — pas encore couvertes par un courier_remittance_orders)
CREATE OR REPLACE VIEW public.v_courier_remittance_pending
WITH (security_invoker = true) AS
  SELECT
    o.id                                                            AS order_id,
    o.id::text                                                      AS reference,
    o.status,
    o.total_amount                                                  AS expected_amount_mad,
    c.courier_code,
    c.courier_zone,
    o.customer_city                                                 AS city,
    o.delivered_at,
    COALESCE(o.affiliate_commission_mad_snapshot, o.commission_amount, 0) AS affiliate_commission_mad,
    o.affiliate_id
  FROM public.orders o
  LEFT JOIN public.cities c ON c.name = o.customer_city
  WHERE o.status = 'delivered'
    AND NOT EXISTS (
      SELECT 1 FROM public.courier_remittance_orders cro WHERE cro.order_id = o.id
    )
    -- Rempart STAFF dans la vue (défense en profondeur, @security P2-1) : indépendamment
    -- de la RLS des tables sous-jacentes (orders est row-scoped par affilié, PAS staff-only),
    -- un non-staff obtient TOUJOURS 0 ligne. service_role conservé (jobs serveur / RPC).
    AND (public.my_role() IN ('admin', 'agent') OR auth.role() = 'service_role');

COMMENT ON VIEW public.v_courier_remittance_pending IS
  'P0 réconciliation (125) : commandes COD LIVRÉES pas encore couvertes par un bordereau '
  'livreur réconcilié (courier_remittance_orders). Ce sont les commandes « à verser ». '
  'security_invoker=true : accès réel via la RLS de orders + server actions admin-only. '
  'Zéro marge/coût exposé.';

-- ── 2. Cockpit trésorerie — solde agrégé par compte du grand livre ───────────
CREATE OR REPLACE VIEW public.v_treasury_overview
WITH (security_invoker = true) AS
  SELECT
    a.code                          AS account_code,
    a.type,
    a.normal_balance,
    COALESCE(SUM(p.amount), 0)      AS balance_mad,
    count(DISTINCT p.transaction_id) AS movements
  FROM public.ledger_accounts a
  LEFT JOIN public.ledger_postings p ON p.account_id = a.id
  WHERE a.is_active = true
    -- Rempart STAFF dans la vue (défense en profondeur, @security P2-1) : un non-staff
    -- ne peut pas interroger l'agrégat trésorerie via PostgREST. service_role conservé.
    AND (public.my_role() IN ('admin', 'agent') OR auth.role() = 'service_role')
  GROUP BY a.code, a.type, a.normal_balance;

COMMENT ON VIEW public.v_treasury_overview IS
  'P0 cockpit trésorerie (125) : solde agrégé (toutes parties confondues) par compte actif '
  'du grand livre double-entrée (121). balance_mad = SUM(amount signé), movements = nb de '
  'transactions distinctes ayant posté sur ce compte. security_invoker=true : accès réel via '
  'la RLS de ledger_accounts/ledger_postings + server actions admin-only.';
