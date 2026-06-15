-- Migration 070 — Policy INSERT manquante pour le bucket storage `order-proofs`
-- (preuves de paiement). ADDITIF STRICT : CREATE POLICY seul. Aucun DROP, aucune autre
-- policy ni aucun autre bucket touché. Aucune donnée modifiée.
--
-- BUG CORRIGÉ (P1 bloquant) : l'upload d'une preuve de paiement (client utilisateur)
-- échouait avec « new row violates row-level security policy ». Cause : la RLS est active
-- sur storage.objects (deny par défaut) et le bucket `order-proofs` n'avait AUCUNE policy
-- INSERT (contrairement aux autres buckets product-images / supplier-* qui ont les leurs).
--
-- Écrivains légitimes (source de vérité = le code serveur) :
--   - GROSSISTE, client utilisateur — src/app/actions/orders.ts (addWholesaleOrderProof) :
--     preuve attachée à SA commande, path = `${wholesale_order.id}/...` (garde appli buyer_id=auth.uid()).
--   - ADMIN / AGENT — src/app/actions/commissions.ts (addOrderProof, requireAdmin allowAgent) :
--     preuves COD, path = `${order.id}/...`.
--
-- LECTURE : le bucket `order-proofs` est PUBLIC (buckets.public = true) → l'affichage passe
-- par l'URL publique, aucune policy SELECT n'est requise (volontairement non ajoutée ici).
--
-- Scope du WITH CHECK : limité au propriétaire de la commande (le grossiste ne peut déposer
-- que sur sa propre commande) OU au staff admin/agent. Calqué sur la garde applicative
-- (orders.ts) et sur la RLS de la table public.order_proofs (migration 046).

CREATE POLICY "order-proofs: owner or staff upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'order-proofs'
    AND (
      public.my_role() = ANY (ARRAY['admin', 'agent'])
      OR EXISTS (
        SELECT 1
        FROM public.wholesale_orders wo
        WHERE wo.id::text = (storage.foldername(name))[1]
          AND wo.buyer_id = auth.uid()
      )
    )
  );
