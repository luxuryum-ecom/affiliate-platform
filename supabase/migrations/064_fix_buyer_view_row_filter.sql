-- =============================================================================
-- Migration 064 — Correctif filtre de lignes de wholesale_orders_buyer_read
-- =============================================================================
-- BUG corrigé : la migration 063 filtrait la vue acheteur sur
--   `my_role() = 'buyer'`. Or le rôle réel de l'acheteur wholesale est
--   'wholesaler' (cf. (wholesale)/layout.tsx, my_role()='wholesaler' partout) ;
--   le rôle 'buyer' n'existe PAS. Conséquence : la vue renvoyait 0 ligne à TOUT
--   acheteur réel → les 3 pages acheteur affichaient un état vide (régression
--   silencieuse non détectée par le smoke, qui ne vérifie que le rendu, pas la
--   présence de données).
--
-- CORRECTIF : le filtre de lignes devient `buyer_id = auth.uid()` SEUL.
--   - C'est la véritable frontière de sécurité par-utilisateur (on ne voit que
--     les commandes dont on est l'acheteur), airtight : la vue s'exécute avec
--     les droits du propriétaire (bypass RLS), donc ce WHERE est l'unique filtre.
--   - PAS de garde de rôle : un utilisateur accède au wholesale soit via
--     role='wholesaler', soit via le flag `wholesale_access` (sans avoir le rôle
--     'wholesaler' — cf. (wholesale)/layout.tsx). Un filtre `my_role()='wholesaler'`
--     exclurait à tort les acheteurs `wholesale_access` de LEURS propres commandes.
--   - Un admin/agent appelant la vue ne verra que les commandes où il est lui-même
--     l'acheteur (≈ aucune) ; l'admin lit la table de base via ses propres policies.
--
-- La liste blanche de colonnes est COPIÉE À L'IDENTIQUE de 063 (mêmes colonnes,
-- mêmes 8 colonnes coût/marge + internes EXCLUES) — on ne change QUE le WHERE.
-- =============================================================================

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
WHERE wo.buyer_id = auth.uid();

GRANT SELECT ON public.wholesale_orders_buyer_read TO authenticated;

COMMENT ON VIEW public.wholesale_orders_buyer_read IS
  'Vue acheteur — commandes wholesale sans aucune colonne coût/marge interne. '
  'Exclut (8 colonnes) : supplier_cost_mad, transport_customs_cost_mad, '
  'additional_cost_mad, total_cost_mad, gross_profit_mad, gross_margin_percent, '
  'delivery_cost_mad, delivery_rebill_mad. '
  'Exclut aussi : agent_id, agent_notes, supplier_id et colonnes réponse fournisseur. '
  'Filtre de lignes : buyer_id = auth.uid() (frontière par-utilisateur airtight, '
  'sans garde de rôle pour ne pas exclure les acheteurs wholesale_access). '
  'Correctif 064 du filtre 063 (qui utilisait à tort my_role()=''buyer'', rôle inexistant).';
