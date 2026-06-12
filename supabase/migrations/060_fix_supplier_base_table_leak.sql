-- =============================================================================
-- Migration 060 — CORRECTIF SÉCURITÉ : fuite PII/marge via policy table de base
-- =============================================================================
-- L'audit @security du LOT 3a a relevé une faille CRITIQUE introduite par la 059 :
-- la policy "wholesale_orders: supplier_read_own" donnait au fournisseur un SELECT
-- sur la TABLE DE BASE wholesale_orders. Or la RLS Postgres filtre les LIGNES, pas
-- les COLONNES → un fournisseur assigné pouvait lire toute la ligne via select('*'),
-- donc les PII acheteur (buyer_id, address, buyer_notes, agent_notes) ET les marges
-- internes (total_amount, supplier_cost_mad, gross_profit_mad, gross_margin_percent…).
-- La vue redacted wholesale_orders_supplier_read devenait inutile.
--
-- Correctif : on SUPPRIME cette policy. Le fournisseur lit EXCLUSIVEMENT via la vue
-- redacted (SECURITY DEFINER, filtrée supplier_id = auth.uid()) — exactement le
-- pattern de la migration 045. Les écritures passent par la RPC respond_to_wholesale_order.
-- Le fournisseur n'a donc AUCUN accès direct (lecture ni écriture) à wholesale_orders.
--
-- Non destructif (DROP d'une policy uniquement) — aucune donnée touchée.
-- Aucune colonne financière ni le trigger 025 ne sont touchés.
-- Note : au moment du correctif, aucune commande n'avait de supplier_id assigné
-- (la policy matchait 0 ligne) → aucune exposition effective n'a pu avoir lieu.
-- =============================================================================

DROP POLICY IF EXISTS "wholesale_orders: supplier_read_own" ON public.wholesale_orders;

-- Rappel : aucune policy SELECT/INSERT/UPDATE/DELETE pour le rôle supplier sur la
-- table de base. Lecture = vue wholesale_orders_supplier_read uniquement.
-- Écriture de la réponse = RPC respond_to_wholesale_order (SECURITY DEFINER) uniquement.
