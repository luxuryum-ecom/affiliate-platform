-- =============================================================================
-- Migration 118 — V5 : Watchlist grossiste + alerte baisse de prix
-- =============================================================================
-- ADDITIF / IDEMPOTENT. Un grossiste « suit » un produit fournisseur ; quand son
-- prix de gros PUBLIC baisse, une notification in-app lui est créée (cloche 🔔,
-- table `notifications` existante mig 076). Réutilise l'infra notifications ; on
-- n'ajoute QUE la table de suivi + le trigger d'alerte.
--
-- 🔒 ARGENT / SÉCURITÉ : le trigger ne lit et ne diffuse QUE
-- `suggested_wholesale_price_mad` — le PRIX DE GROS PUBLIC déjà affiché en
-- marketplace (MAD). JAMAIS une marge/coût (platform_margin_*, factory_cost,
-- unit_price_usd). Le destinataire est le grossiste lui-même (recipient_id =
-- buyer_id) ; le payload ne contient que des infos produit (nom + prix public) →
-- aucune PII d'un tiers.
-- =============================================================================

-- ── 1. Table de suivi (watchlist) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.product_watches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supplier_product_id uuid NOT NULL REFERENCES public.supplier_products(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, supplier_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_watches_product
  ON public.product_watches (supplier_product_id);
CREATE INDEX IF NOT EXISTS idx_product_watches_buyer
  ON public.product_watches (buyer_id);

COMMENT ON TABLE public.product_watches IS
  'V5 — watchlist grossiste (mig 118). Un grossiste suit un produit fournisseur '
  'pour être alerté d''une baisse de prix. RLS : own only (buyer_id=auth.uid()).';

-- ── 2. RLS : chaque grossiste gère UNIQUEMENT ses propres suivis ──────────────

ALTER TABLE public.product_watches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watch: read own" ON public.product_watches;
CREATE POLICY "watch: read own"
  ON public.product_watches FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS "watch: insert own" ON public.product_watches;
CREATE POLICY "watch: insert own"
  ON public.product_watches FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "watch: delete own" ON public.product_watches;
CREATE POLICY "watch: delete own"
  ON public.product_watches FOR DELETE TO authenticated
  USING (buyer_id = auth.uid());

-- Pas d'UPDATE (un suivi ne se modifie pas : on suit ou on ne suit pas).

-- ── 3. Trigger d'alerte baisse de prix ───────────────────────────────────────
-- SECURITY DEFINER : insère dans `notifications` (qui n'a AUCUNE policy INSERT
-- client — insertion serveur/owner uniquement). Ne fait un travail QUE si le prix
-- de gros public BAISSE réellement, sur un produit visible (approved).

CREATE OR REPLACE FUNCTION public.notify_price_drop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.suggested_wholesale_price_mad IS NOT NULL
     AND OLD.suggested_wholesale_price_mad IS NOT NULL
     AND NEW.suggested_wholesale_price_mad < OLD.suggested_wholesale_price_mad
     AND NEW.approval_status = 'approved'
  THEN
    INSERT INTO public.notifications (recipient_id, event, payload)
    SELECT
      w.buyer_id,
      'price_drop',
      jsonb_build_object(
        'supplier_product_id', NEW.id::text,
        'product_name',        COALESCE(NULLIF(NEW.public_name, ''), NEW.product_name),
        'old_price',           OLD.suggested_wholesale_price_mad,
        'new_price',           NEW.suggested_wholesale_price_mad
      )
    FROM public.product_watches w
    WHERE w.supplier_product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_price_drop ON public.supplier_products;
CREATE TRIGGER trg_notify_price_drop
  AFTER UPDATE OF suggested_wholesale_price_mad ON public.supplier_products
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_price_drop();

COMMENT ON FUNCTION public.notify_price_drop() IS
  'V5 (mig 118) — à la BAISSE du prix de gros public d''un produit approuvé, '
  'crée une notification price_drop pour chaque grossiste qui le suit. '
  'Ne diffuse QUE le prix public (jamais marge/coût). SECURITY DEFINER (insert '
  'dans notifications, table sans policy INSERT client).';
