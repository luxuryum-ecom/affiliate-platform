-- =============================================================================
-- Migration 120 — FIX régression mig 116 : l'acheteur ne voit plus ses lignes
-- =============================================================================
-- BUG (introduit par mig 116 / lot E1, EN PROD depuis 2026-07-06) :
-- E1 a rendu `wholesale_orders` SELECT *staff-only* (retrait de la branche
-- buyer_id) pour fermer la fuite de marge owner-facing. MAIS 4 policies RLS
-- d'acheteur vérifient l'appartenance de la commande via un
-- `EXISTS (SELECT 1 FROM wholesale_orders WHERE buyer_id = auth.uid())` — sous-
-- requête sur la table de BASE, désormais invisible à l'acheteur. Conséquence :
-- l'`EXISTS` renvoie faux → l'acheteur ne peut PLUS lire ses propres :
--   • lignes de commande (wholesale_order_items) → « 0 article », facture non
--     itemisée, réassort cassé ;
--   • historique d'import / de paiement ;
--   • justificatifs de paiement (order_proofs, canal grossiste).
--
-- CORRECTIF : une fonction SECURITY DEFINER `is_my_wholesale_order(uuid)` qui
-- teste `buyer_id = auth.uid()` en CONTOURNANT la RLS de `wholesale_orders`.
-- Elle ne renvoie qu'un BOOLÉEN d'appartenance — AUCUNE colonne, donc AUCUNE
-- marge/coût exposée. La fuite E1 reste FERMÉE : l'acheteur ne lit toujours pas
-- `wholesale_orders` base (gross_profit_mad, supplier_cost_mad… restent staff-
-- only ; l'acheteur passe par la vue redacted `wholesale_orders_buyer_read`).
-- Les lignes `wholesale_order_items` ne contiennent QUE des données acheteur
-- (product_id, quantity, unit_price_snapshot, subtotal, tier_label_snapshot) —
-- zéro marge. Additif / idempotent. Aucune donnée modifiée.
-- =============================================================================

-- ── 1. Fonction d'appartenance (SECURITY DEFINER, bornée à un booléen) ───────

CREATE OR REPLACE FUNCTION public.is_my_wholesale_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wholesale_orders wo
    WHERE wo.id = p_order_id
      AND wo.buyer_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_my_wholesale_order(uuid) IS
  'FIX mig 120 : l''acheteur courant est-il le propriétaire de cette commande '
  'gros ? SECURITY DEFINER (contourne la RLS staff-only de wholesale_orders '
  'posée par mig 116). Ne renvoie qu''un booléen d''appartenance — AUCUNE '
  'colonne, donc AUCUNE marge/coût exposée. E1 reste fermé.';

-- Exécutable par les rôles applicatifs (la fonction ne divulgue rien de sensible).
GRANT EXECUTE ON FUNCTION public.is_my_wholesale_order(uuid) TO authenticated, anon;

-- ── 2. wholesale_order_items : l'acheteur relit ses lignes ───────────────────
-- Branche acheteur via la fonction ; branches staff (agent/admin) inchangées
-- (elles fonctionnent : agent/admin lisent bien wholesale_orders base).

DROP POLICY IF EXISTS "wholesale_order_items: read" ON public.wholesale_order_items;
CREATE POLICY "wholesale_order_items: read"
  ON public.wholesale_order_items FOR SELECT TO authenticated
  USING (
    public.is_my_wholesale_order(order_id)
    OR EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = wholesale_order_items.order_id
        AND (wo.agent_id = auth.uid() OR my_role() = 'admin')
    )
  );

-- ── 3. wholesale_order_import_history — historique d'import (acheteur) ────────

DROP POLICY IF EXISTS "buyer_read_import_history" ON public.wholesale_order_import_history;
CREATE POLICY "buyer_read_import_history"
  ON public.wholesale_order_import_history FOR SELECT TO authenticated
  USING (public.is_my_wholesale_order(order_id));

-- ── 4. wholesale_order_payment_history — historique de paiement (acheteur) ────

DROP POLICY IF EXISTS "buyer_read_payment_history" ON public.wholesale_order_payment_history;
CREATE POLICY "buyer_read_payment_history"
  ON public.wholesale_order_payment_history FOR SELECT TO authenticated
  USING (public.is_my_wholesale_order(order_id));

-- ── 5. order_proofs — justificatifs de paiement (canal GROSSISTE) ────────────
-- Seule la branche grossiste est cassée (elle subquery wholesale_orders base).
-- La branche AFFILIÉ (subquery sur `orders` COD, restée lisible par l'affilié)
-- n'est PAS concernée et n'est pas touchée ici.

DROP POLICY IF EXISTS "proofs: buyers read own wholesale proofs" ON public.order_proofs;
CREATE POLICY "proofs: buyers read own wholesale proofs"
  ON public.order_proofs FOR SELECT TO authenticated
  USING (
    related_wholesale_order_id IS NOT NULL
    AND public.is_my_wholesale_order(related_wholesale_order_id)
  );
