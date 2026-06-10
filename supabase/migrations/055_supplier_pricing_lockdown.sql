-- =============================================================================
-- Migration: 055_supplier_pricing_lockdown (idempotent, non destructif)
-- Phase 4 — câblage pays au signup + verrou serveur-autoritaire des prix.
--
-- 1. handle_new_user : enregistre country_code choisi au signup (INSERT du profil ;
--    l'immuabilité 054 est BEFORE UPDATE, donc l'INSERT initial est autorisé).
-- 2. Verrou @security : un fournisseur (rôle 'supplier') ne peut JAMAIS écrire
--    directement price_source / fx_rate_source_to_mad / suggested_wholesale_price_mad.
--    Ces colonnes sont calculées CÔTÉ SERVEUR (conversion devise→MAD via taux admin)
--    et écrites par service_role uniquement. Ferme la réserve de l'audit 054
--    (policy d'écriture préexistante 030 trop large pour le multi-devises).
-- =============================================================================

-- ── 1. Pays au signup (handle_new_user étendu) ───────────────────────────────
-- Corps identique à 001 + ajout de country_code depuis les metadata.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, status, country_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'affiliate'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending',
    NULLIF(NEW.raw_user_meta_data->>'country_code', '')  -- FK countries valide la valeur
  );
  RETURN NEW;
END;
$$;

-- ── 2. Verrou serveur-autoritaire des champs de prix sur supplier_products ───
-- Un 'supplier' ne peut pas poser price_source/fx_rate/mad (≠ NULL). service_role
-- (worker Telegram, server actions web/CSV) et 'admin' sont autorisés (my_role()
-- renvoie NULL sous service_role → la garde ne s'applique pas).

CREATE OR REPLACE FUNCTION public.guard_supplier_product_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.my_role() = 'supplier' THEN
    IF NEW.price_source IS NOT NULL
       OR NEW.fx_rate_source_to_mad IS NOT NULL
       OR NEW.suggested_wholesale_price_mad IS NOT NULL THEN
      RAISE EXCEPTION 'Prix/devise calculés côté serveur : saisie directe interdite pour un fournisseur'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sp_pricing ON public.supplier_products;
CREATE TRIGGER trg_guard_sp_pricing
  BEFORE INSERT OR UPDATE ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_product_pricing();

COMMENT ON FUNCTION public.guard_supplier_product_pricing() IS
  'Empêche un fournisseur d''écrire price_source/fx_rate_source_to_mad/'
  'suggested_wholesale_price_mad. Conversion devise→MAD réservée au serveur '
  '(service_role) avec taux admin figé. Jamais de MAD manipulé par le client.';
