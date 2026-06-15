-- =============================================================================
-- Migration 063 — Vue redacted acheteur + durcissement ledger livraison
-- =============================================================================
-- Correctifs suite à l'audit @security de la migration 062 :
--
-- C1 (CRITIQUE) : Créer une vue redacted wholesale_orders_buyer_read exposant
--   uniquement les colonnes utiles à l'acheteur, sans AUCUNE colonne coût/marge
--   interne. Les 3 pages acheteur faisaient select('*') sur la table de base →
--   sur-extraction des 8 colonnes sensibles.
--
-- I1 : Restreindre la policy SELECT du ledger wholesale_delivery_ledger de
--   'admin' OU 'agent' à 'admin' SEUL.
--
-- M1 : Ajouter CHECK (currency = 'MAD') sur wholesale_delivery_ledger.
--
-- Colonnes EXCLUES de la vue acheteur (8 — confidentialité plateforme) :
--   supplier_cost_mad, transport_customs_cost_mad, additional_cost_mad,
--   total_cost_mad, gross_profit_mad, gross_margin_percent,
--   delivery_cost_mad, delivery_rebill_mad.
--
-- Mécanisme de sécurité de la vue :
--   Les vues Postgres s'exécutent par défaut avec les droits du PROPRIÉTAIRE
--   (SECURITY DEFINER implicite), ce qui bypasse la RLS de la table de base.
--   Sans filtre explicite dans la vue, elle exposerait TOUTES les commandes
--   à n'importe quel acheteur authentifié.
--   Même mécanisme que wholesale_orders_supplier_read (migrations 059/060) :
--   la vue EMBARQUE le filtre de lignes (WHERE buyer_id = auth.uid()) ET la
--   garde de rôle (public.my_role() = 'buyer') pour isolation stricte.
--   L'acheteur ne voit que ses propres commandes — jamais celles d'un autre.
--
-- Non destructif : aucune colonne ni donnée n'est supprimée.
-- =============================================================================

-- ── 1. Vue redacted acheteur : wholesale_orders_buyer_read ───────────────────
--
-- Liste blanche de colonnes : TOUTES sauf les 8 colonnes coût/marge internes.
-- Filtre de lignes double :
--   public.my_role() = 'buyer'  → seuls les acheteurs peuvent requêter la vue
--   wo.buyer_id = auth.uid()    → un acheteur ne voit que SES commandes
--
-- Colonnes INCLUSES (non-sensibles, nécessaires aux pages acheteur) :
--   Identité & statut  : id, status, buyer_id
--   Livraison client   : delivery_preference, city, address, buyer_notes
--   Montant recette    : total_amount, delivery_cost (recette client — migration 013)
--                        (≠ delivery_cost_mad qui est le coût INTERNE Mozouna)
--   Facturation        : invoice_requested, invoice_requested_at,
--                        invoice_company_name, invoice_ice,
--                        invoice_registre_commerce, invoice_billing_address
--   Import             : import_status
--   Paiement acheteur  : payment_status, deposit_amount, deposit_received_amount,
--                        deposit_requested_at, deposit_received_at, fully_paid_at
--   Devise multi       : source_currency, fx_rate_source_to_mad,
--                        merchandise_source_amount
--   Lien devis         : quote_request_id
--   Cycle de vie       : confirmed_at, sourcing_at, shipped_at, delivered_at,
--                        cancelled_at, assigned_at, due_at, blocked_at,
--                        blocked_reason
--   Timestamps système : created_at, updated_at
--   Logistique mode    : logistics_mode, delivery_cost_handling
--                        (mode d'acheminement — non sensible ; les montants
--                         delivery_cost_mad / delivery_rebill_mad sont EXCLUS)
--
-- Colonnes EXCLUES volontairement (confidentialité plateforme) :
--   agent_id, agent_notes          — identité et notes de l'agent terrain
--   supplier_id, supplier_response,
--   supplier_lead_time_days,
--   supplier_responded_at,
--   supplier_assigned_at           — informations fournisseur internes
--   supplier_cost_mad              — coût d'achat fournisseur (marge plateforme)
--   transport_customs_cost_mad     — coût transport+douane interne
--   additional_cost_mad            — coûts additionnels internes
--   total_cost_mad                 — total coût interne (calculé par trigger 025)
--   gross_profit_mad               — profit brut interne (calculé par trigger 025)
--   gross_margin_percent           — marge en % interne (calculée par trigger 025)
--   delivery_cost_mad              — coût décaissé Mozouna au livreur (062)
--   delivery_rebill_mad            — montant refacturé au client (062)

CREATE OR REPLACE VIEW public.wholesale_orders_buyer_read AS
SELECT
  -- Identité commande
  wo.id,
  wo.buyer_id,
  wo.status,

  -- Préférences livraison (visibles par l'acheteur — ses propres données)
  wo.delivery_preference,
  wo.city,
  wo.address,
  wo.buyer_notes,

  -- Montants côté recette client (non sensibles pour l'acheteur)
  wo.total_amount,
  wo.delivery_cost,         -- coût livraison RECETTE CLIENT (migration 013, ≠ delivery_cost_mad)

  -- Facturation / invoice
  wo.invoice_requested,
  wo.invoice_requested_at,
  wo.invoice_company_name,
  wo.invoice_ice,
  wo.invoice_registre_commerce,
  wo.invoice_billing_address,

  -- Suivi import
  wo.import_status,

  -- Paiement acheteur
  wo.payment_status,
  wo.deposit_amount,
  wo.deposit_received_amount,
  wo.deposit_requested_at,
  wo.deposit_received_at,
  wo.fully_paid_at,

  -- Multi-devise (figé depuis le devis d'origine — migration 051)
  wo.source_currency,
  wo.fx_rate_source_to_mad,
  wo.merchandise_source_amount,

  -- Lien devis source
  wo.quote_request_id,

  -- Timestamps de cycle de vie
  wo.confirmed_at,
  wo.sourcing_at,
  wo.shipped_at,
  wo.delivered_at,
  wo.cancelled_at,
  wo.assigned_at,
  wo.due_at,
  wo.blocked_at,
  wo.blocked_reason,

  -- Mode logistique (non sensible — pas les montants)
  wo.logistics_mode,
  wo.delivery_cost_handling,

  -- Timestamps système
  wo.created_at,
  wo.updated_at

FROM public.wholesale_orders wo
WHERE public.my_role() = 'buyer'
  AND wo.buyer_id = auth.uid();
-- Note : le double filtre garantit qu'un admin ou agent appelant cette vue
-- ne voit rien (my_role() != 'buyer'). Les pages admin ont accès à la table
-- de base via leurs propres policies RLS.

GRANT SELECT ON public.wholesale_orders_buyer_read TO authenticated;

COMMENT ON VIEW public.wholesale_orders_buyer_read IS
  'Vue acheteur — commandes wholesale sans aucune colonne coût/marge interne. '
  'Exclut (8 colonnes) : supplier_cost_mad, transport_customs_cost_mad, '
  'additional_cost_mad, total_cost_mad, gross_profit_mad, gross_margin_percent, '
  'delivery_cost_mad, delivery_rebill_mad. '
  'Exclut aussi : agent_id, agent_notes, supplier_id et colonnes réponse fournisseur. '
  'Filtre de lignes : my_role() = ''buyer'' ET buyer_id = auth.uid() — '
  'un acheteur ne voit que ses propres commandes, jamais celles d''un autre. '
  'Pattern identique à wholesale_orders_supplier_read (migrations 059/060). '
  'Correctif C1 de l''audit @security migration 062.';

-- ── 2. Ledger hardening — I1 : restriction policy SELECT à admin seul ────────
--
-- La migration 062 autorisait 'admin' OR 'agent' à lire le ledger.
-- L'agent terrain n'a pas besoin de consulter le grand livre de livraison.
-- Seul l'admin a la visibilité financière complète.

DROP POLICY IF EXISTS "wdl: admin and agent read" ON public.wholesale_delivery_ledger;
CREATE POLICY "wdl: admin read"
  ON public.wholesale_delivery_ledger
  FOR SELECT
  TO authenticated
  USING (public.my_role() = 'admin');

COMMENT ON POLICY "wdl: admin read" ON public.wholesale_delivery_ledger IS
  'Lecture du ledger livraison réservée à l''admin exclusivement. '
  'Correctif I1 : supprime l''accès agent (migration 062 trop permissif). '
  'Audit @security migration 062.';

-- ── 3. Ledger hardening — M1 : CHECK (currency = 'MAD') ──────────────────────
--
-- La colonne currency a DEFAULT 'MAD' mais aucun CHECK ne l'imposait.
-- Ce CHECK bloque toute insertion avec une devise non-MAD, renforçant
-- l'invariant : le ledger livraison est exclusivement en MAD.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wdl_currency_mad'
  ) THEN
    ALTER TABLE public.wholesale_delivery_ledger
      ADD CONSTRAINT wdl_currency_mad CHECK (currency = 'MAD');
  END IF;
END $$;
