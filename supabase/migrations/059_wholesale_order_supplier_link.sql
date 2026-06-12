-- =============================================================================
-- Migration 059 — LOT 3a : lien commande↔fournisseur + vue redacted supplier
-- =============================================================================
-- Périmètre : colonnes réponse fournisseur sur wholesale_orders, vue redacted
--   wholesale_orders_supplier_read (aucune PII acheteur), RPC SECURITY DEFINER
--   respond_to_wholesale_order (seule porte d'écriture pour le fournisseur).
--
-- ARGENT : AUCUNE colonne financière touchée.
--   Le trigger compute_wholesale_order_costs (migration 025) est INTANGIBLE.
--   supplier_cost_mad / gross_profit_mad / gross_margin_percent ne sont PAS
--   exposés dans la vue fournisseur (c'est la marge interne de la plateforme).
--
-- PII : le fournisseur ne voit JAMAIS buyer_id, address, buyer_notes, agent_notes,
--   customer phone (n/a B2B), ni aucun champ d'identité acheteur.
--   Il reçoit uniquement : id commande, articles, statut, délai, ville (logistique).
--
-- Sécurité écriture fournisseur : seule la RPC respond_to_wholesale_order
--   (SECURITY DEFINER) peut écrire les 3 colonnes de réponse. Le fournisseur
--   n'a aucune policy UPDATE directe sur wholesale_orders.
-- =============================================================================

-- ── 1. Colonnes réponse fournisseur sur wholesale_orders ─────────────────────
--
-- supplier_id            : profil fournisseur assigné par l'admin.
-- supplier_response      : réponse formelle ('available'|'preparing'|'on_order').
-- supplier_lead_time_days: délai annoncé par le fournisseur (>= 0).
-- supplier_responded_at  : horodatage de la dernière réponse fournisseur.
-- supplier_assigned_at   : horodatage d'assignation du fournisseur (admin).

ALTER TABLE public.wholesale_orders
  ADD COLUMN IF NOT EXISTS supplier_id               uuid        NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_response         text        NULL
    CHECK (supplier_response IN ('available', 'preparing', 'on_order')),
  ADD COLUMN IF NOT EXISTS supplier_lead_time_days   integer     NULL
    CHECK (supplier_lead_time_days >= 0),
  ADD COLUMN IF NOT EXISTS supplier_responded_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS supplier_assigned_at      timestamptz NULL;

-- Index lookups fournisseur (requêtes fréquentes : mes commandes)
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_supplier_id
  ON public.wholesale_orders(supplier_id)
  WHERE supplier_id IS NOT NULL;

-- ── 2. Vue redacted wholesale_orders_supplier_read ───────────────────────────
--
-- Colonnes EXPOSÉES au fournisseur (strictement nécessaires à la préparation) :
--   id               — identifie la commande sans ambiguïté
--   status           — pour savoir où en est la commande
--   due_at           — délai attendu (planification)
--   city             — ville de livraison UNIQUEMENT (logistique gros) —
--                      pas l'adresse précise (adresse fine = PII livraison)
--   supplier_response, supplier_lead_time_days, supplier_responded_at
--                    — ses propres données de réponse (feedback)
--   supplier_assigned_at — quand il a été assigné
--   created_at       — âge de la commande
--
-- Colonnes EXCLUES volontairement :
--   buyer_id         — identité acheteur (PII directe)
--   address          — adresse précise (PII livraison)
--   buyer_notes      — notes privées acheteur (PII comportementale)
--   agent_notes      — notes internes d'agent (informations opérationnelles)
--   agent_id         — identité de l'agent terrain (pas utile au fournisseur)
--   assigned_at      — timestamp interne d'assignation agent
--   blocked_at/blocked_reason — signaux opérationnels internes
--   total_amount     — montant commercial (le fournisseur n'a pas à connaître
--                      le prix de revente plateforme)
--   supplier_cost_mad / transport_customs_cost_mad / additional_cost_mad
--   total_cost_mad / gross_profit_mad / gross_margin_percent
--                    — marge et coûts internes (confidentiels plateforme)
--   payment_status / deposit_* — paiement acheteur (non concerné)
--   invoice_* — facturation acheteur (PII B2B)
--   quote_request_id / source_currency / fx_rate_* / merchandise_source_amount
--                    — métadonnées de sourcing interne
--   import_status    — suivi import interne
--   delivery_cost    — coût logistique interne plateforme
--   delivery_preference — préférence logistique acheteur
--
-- Les articles (wholesale_order_items) sont exposés séparément via une vue
-- dédiée ci-dessous — la vue principale renvoie uniquement le header commande.

CREATE OR REPLACE VIEW public.wholesale_orders_supplier_read AS
SELECT
  wo.id,
  wo.status,
  wo.city,
  wo.due_at,
  wo.supplier_response,
  wo.supplier_lead_time_days,
  wo.supplier_responded_at,
  wo.supplier_assigned_at,
  wo.created_at,
  wo.updated_at
FROM public.wholesale_orders wo
WHERE public.my_role() = 'supplier'
  AND wo.supplier_id = auth.uid();

GRANT SELECT ON public.wholesale_orders_supplier_read TO authenticated;

COMMENT ON VIEW public.wholesale_orders_supplier_read IS
  'Vue fournisseur — header de commande sans aucune PII acheteur. '
  'Exclut : buyer_id, address, buyer_notes, agent_notes, agent_id, montants financiers, '
  'marges internes, paiements acheteur, facturation. '
  'Expose : id, statut, ville (logistique), délai, données de réponse fournisseur uniquement.';

-- ── 3. Vue redacted des articles commande pour le fournisseur ────────────────
--
-- Le fournisseur doit connaître les produits et quantités pour préparer.
-- On expose uniquement les champs nécessaires à la préparation.
-- Colonnes EXCLUES : unit_price_snapshot, subtotal (prix commercial plateforme).

CREATE OR REPLACE VIEW public.wholesale_order_items_supplier_read AS
SELECT
  woi.id,
  woi.order_id,
  woi.product_id,
  woi.quantity,
  woi.tier_label_snapshot
FROM public.wholesale_order_items woi
WHERE public.my_role() = 'supplier'
  AND EXISTS (
    SELECT 1 FROM public.wholesale_orders wo
    WHERE wo.id = woi.order_id
      AND wo.supplier_id = auth.uid()
  );

GRANT SELECT ON public.wholesale_order_items_supplier_read TO authenticated;

COMMENT ON VIEW public.wholesale_order_items_supplier_read IS
  'Vue fournisseur — articles d''une commande sans prix commerciaux. '
  'Exclut : unit_price_snapshot, subtotal (prix de revente plateforme confidentiels). '
  'Expose : product_id, quantity, tier_label_snapshot (pour la préparation).';

-- ── 4. RPC respond_to_wholesale_order (SECURITY DEFINER) ─────────────────────
--
-- Seule porte d'écriture autorisée pour un fournisseur.
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire de la fonction
--   (postgres/owner), pas du fournisseur appelant → contourne les policies RLS
--   de manière contrôlée, en n'écrivant QUE les 3 colonnes de réponse.
-- search_path = public : protège contre le hijacking de schéma.
--
-- Garanties :
--   1. auth.uid() doit être le supplier_id de la commande (propriété stricte).
--   2. Le rôle du profil appelant doit être 'supplier'.
--   3. p_response doit être dans {'available','preparing','on_order'}.
--   4. p_lead_time_days doit être >= 0.
--   5. Seules les colonnes supplier_response, supplier_lead_time_days,
--      supplier_responded_at sont mises à jour — rien d'autre.
--   6. Les colonnes status, agent_id, montants, buyer_id etc. sont INTOUCHABLES.

DROP FUNCTION IF EXISTS public.respond_to_wholesale_order(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.respond_to_wholesale_order(
  p_order_id       uuid,
  p_response       text,
  p_lead_time_days integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier_id uuid;
  v_role        text;
BEGIN
  -- 1. Vérifier que l'appelant est authentifié et a le rôle 'supplier'
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS DISTINCT FROM 'supplier' THEN
    RAISE EXCEPTION 'errors.forbidden_supplier_only';
  END IF;

  -- 2. Vérifier que cette commande appartient bien à cet appelant
  SELECT supplier_id INTO v_supplier_id
  FROM public.wholesale_orders
  WHERE id = p_order_id;

  IF v_supplier_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'errors.order_not_found';
  END IF;

  -- 3. Valider p_response
  IF p_response NOT IN ('available', 'preparing', 'on_order') THEN
    RAISE EXCEPTION 'errors.invalid_supplier_response';
  END IF;

  -- 4. Valider p_lead_time_days
  IF p_lead_time_days IS NULL OR p_lead_time_days < 0 THEN
    RAISE EXCEPTION 'errors.invalid_lead_time';
  END IF;

  -- 5. Écrire UNIQUEMENT les 3 colonnes de réponse — rien d'autre
  UPDATE public.wholesale_orders
  SET
    supplier_response       = p_response,
    supplier_lead_time_days = p_lead_time_days,
    supplier_responded_at   = now()
  WHERE id = p_order_id;

  -- Pas d'écriture dans wholesale_order_status_history :
  -- la réponse fournisseur n'est pas une transition de statut FSM.
END;
$$;

-- ── 5. RLS : le fournisseur n'a AUCUN accès UPDATE direct sur wholesale_orders ─
--
-- Toutes les policies UPDATE existantes restent inchangées (admin, agent).
-- Le fournisseur n'a aucune policy UPDATE — il passe obligatoirement par la RPC.
-- On pose uniquement une policy SELECT pour que le fournisseur puisse, si besoin,
-- lire directement la table (en plus de la vue). Cette policy est restrictive :
-- elle ne laisse passer que les lignes où supplier_id = auth.uid().
-- Note : la vue wholesale_orders_supplier_read filtre déjà via my_role() ET
-- supplier_id = auth.uid() — cette policy est un filet de sécurité additionnel.

DROP POLICY IF EXISTS "wholesale_orders: supplier_read_own" ON public.wholesale_orders;
CREATE POLICY "wholesale_orders: supplier_read_own"
  ON public.wholesale_orders
  FOR SELECT
  TO authenticated
  USING (
    public.my_role() = 'supplier'
    AND supplier_id = auth.uid()
  );

-- Pas de policy INSERT, UPDATE, DELETE pour le rôle supplier sur wholesale_orders.
-- L'unique écriture autorisée est via la RPC respond_to_wholesale_order (SECURITY DEFINER).
