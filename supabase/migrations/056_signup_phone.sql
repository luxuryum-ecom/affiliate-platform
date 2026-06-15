-- =============================================================================
-- Migration: 056_signup_phone (idempotent, non destructif)
-- TÉLÉPHONE au signup (Niveau 1 : stocké, SANS vérification OTP).
--
-- profiles.phone existe déjà (migration 001). On étend handle_new_user pour
-- recopier le téléphone depuis raw_user_meta_data au signup, exactement comme
-- country_code (migration 055). Le téléphone (obligatoire role=supplier/wholesaler)
-- est validé et normalisé côté serveur (server action, format E.164) AVANT
-- d'être posé dans les metadata. Aucune autre table, aucune RLS, aucun montant touché.
-- But : joignabilité (appel + WhatsApp).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, status, country_code, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'affiliate'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending',
    NULLIF(NEW.raw_user_meta_data->>'country_code', ''),  -- FK countries valide la valeur
    NULLIF(NEW.raw_user_meta_data->>'phone', '')          -- ← seul ajout vs migr. 055
  );
  RETURN NEW;
END;
$$;
