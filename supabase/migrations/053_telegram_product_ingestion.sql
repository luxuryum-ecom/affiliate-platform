-- =============================================================================
-- Migration: 053_telegram_product_ingestion (idempotent — safe to re-run)
-- Canal d'entrée produit fournisseur via bot Telegram + extraction IA (Haiku).
--
-- Principe : un produit reçu par Telegram suit EXACTEMENT le même chemin qu'un
-- produit du formulaire web → supplier_products en 'pending_review' → file de
-- validation admin existante → 'approved'. Aucune publication directe.
--
-- Sécurité : RLS deny-par-défaut sur les nouvelles tables. Les écritures du
-- worker bot passent par service_role (contourne la RLS) côté serveur uniquement.
-- L'identité fournisseur n'est JAMAIS exposée au grossiste.
-- =============================================================================

-- ── 1. Traçabilité + idempotence sur supplier_products ───────────────────────

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS telegram_message_id text;

ALTER TABLE public.supplier_products
  DROP CONSTRAINT IF EXISTS supplier_products_source_check;
ALTER TABLE public.supplier_products
  ADD CONSTRAINT supplier_products_source_check
  CHECK (source IN ('web', 'telegram', 'bulk_csv'));

-- Idempotence : un même message Telegram ne peut créer qu'UN produit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_telegram_message_id
  ON public.supplier_products(telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sp_source ON public.supplier_products(source);

-- ── 2. Bucket Storage — photos produit (lecture publique, écriture serveur) ───
-- Public en lecture : les URLs alimentent supplier_products.photos[] et sont
-- affichées sur la marketplace (même modèle que product-images, mig 002).
-- INSERT : aucune policy 'authenticated' → seul service_role (worker bot,
-- côté serveur) écrit. Deny par défaut pour le navigateur.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-product-images',
  'supplier-product-images',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Admin : gestion complète (modération, suppression).
DROP POLICY IF EXISTS "spi: admin all" ON storage.objects;
CREATE POLICY "spi: admin all"
  ON storage.objects FOR ALL TO authenticated
  USING  (bucket_id = 'supplier-product-images' AND public.my_role() = 'admin')
  WITH CHECK (bucket_id = 'supplier-product-images' AND public.my_role() = 'admin');

-- Pas de policy INSERT pour 'authenticated' : l'upload se fait via service_role.

-- ── 3. telegram_supplier_links — liaison bidirectionnelle web ⇆ Telegram ──────
-- Un compte fournisseur (profiles, role='supplier') ⇆ un compte Telegram.
-- Flux web → Telegram : le fournisseur génère un code depuis l'espace web,
--   puis envoie « /link <code> » au bot ⇒ telegram_user_id est lié.
-- Le code est à usage unique et expire. Tant que non lié, AUCUN produit n'est
-- accepté depuis ce compte Telegram.

CREATE TABLE IF NOT EXISTS public.telegram_supplier_links (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       uuid        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- ID utilisateur Telegram (bigint). NULL tant que la liaison n'est pas confirmée.
  telegram_user_id  bigint      UNIQUE,
  telegram_username text,
  -- Code de liaison à usage unique généré côté web.
  link_code         text        UNIQUE,
  link_code_expires_at timestamptz,
  linked_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tsl_telegram_user_id ON public.telegram_supplier_links(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_tsl_link_code        ON public.telegram_supplier_links(link_code);

DROP TRIGGER IF EXISTS trg_tsl_updated_at ON public.telegram_supplier_links;
CREATE TRIGGER trg_tsl_updated_at
  BEFORE UPDATE ON public.telegram_supplier_links
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.telegram_supplier_links ENABLE ROW LEVEL SECURITY;

-- Fournisseur : lit / crée / met à jour SA propre liaison (côté web).
-- Note : il ne peut pas se lier un telegram_user_id arbitraire via le client —
-- la confirmation (écriture de telegram_user_id + linked_at) passe par le
-- worker bot en service_role. Côté web il ne fait que générer/voir son code.
DROP POLICY IF EXISTS "tsl: supplier own" ON public.telegram_supplier_links;
CREATE POLICY "tsl: supplier own"
  ON public.telegram_supplier_links FOR SELECT TO authenticated
  USING (supplier_id = auth.uid() AND public.my_role() = 'supplier');

DROP POLICY IF EXISTS "tsl: supplier insert own" ON public.telegram_supplier_links;
CREATE POLICY "tsl: supplier insert own"
  ON public.telegram_supplier_links FOR INSERT TO authenticated
  WITH CHECK (supplier_id = auth.uid() AND public.my_role() = 'supplier');

-- UPDATE côté web : le fournisseur peut régénérer son code, mais NE PEUT PAS
-- écrire telegram_user_id / linked_at (réservés au worker service_role).
-- On restreint donc l'UPDATE web aux lignes non encore liées.
DROP POLICY IF EXISTS "tsl: supplier update unlinked" ON public.telegram_supplier_links;
CREATE POLICY "tsl: supplier update unlinked"
  ON public.telegram_supplier_links FOR UPDATE TO authenticated
  USING (supplier_id = auth.uid() AND public.my_role() = 'supplier' AND telegram_user_id IS NULL)
  WITH CHECK (supplier_id = auth.uid() AND public.my_role() = 'supplier');

DROP POLICY IF EXISTS "tsl: admin all" ON public.telegram_supplier_links;
CREATE POLICY "tsl: admin all"
  ON public.telegram_supplier_links FOR ALL TO authenticated
  USING  (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── 4. telegram_inbound — staging des messages bruts (audit + rejouabilité) ──
-- Chaque message produit reçu y est journalisé avant transformation IA, ce qui
-- garantit l'idempotence (unicité du message_id), l'audit et la rejouabilité.
-- RLS deny-par-défaut : seul l'admin lit ; le worker écrit en service_role.

CREATE TABLE IF NOT EXISTS public.telegram_inbound (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Clé d'idempotence : "<chat_id>:<message_id>" Telegram.
  telegram_message_id  text        NOT NULL UNIQUE,
  telegram_user_id     bigint      NOT NULL,
  telegram_chat_id     bigint      NOT NULL,
  caption              text,
  photo_file_id        text,
  photo_storage_path   text,
  -- Fournisseur résolu via telegram_supplier_links (NULL si non lié).
  supplier_id          uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Produit créé (NULL tant que non inséré).
  supplier_product_id  uuid        REFERENCES public.supplier_products(id) ON DELETE SET NULL,
  status               text        NOT NULL DEFAULT 'received'
                       CHECK (status IN ('received','processing','inserted','rejected','failed','duplicate')),
  ai_extraction        jsonb,
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ti_status      ON public.telegram_inbound(status);
CREATE INDEX IF NOT EXISTS idx_ti_supplier_id ON public.telegram_inbound(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ti_created_at  ON public.telegram_inbound(created_at DESC);

ALTER TABLE public.telegram_inbound ENABLE ROW LEVEL SECURITY;

-- Admin : lecture (supervision de la file d'ingestion). Aucune écriture client.
DROP POLICY IF EXISTS "ti: admin read" ON public.telegram_inbound;
CREATE POLICY "ti: admin read"
  ON public.telegram_inbound FOR SELECT TO authenticated
  USING (public.my_role() = 'admin');

-- Pas de policy INSERT/UPDATE/DELETE : écritures exclusivement via service_role.

COMMENT ON TABLE public.telegram_inbound IS
  'Staging append-only des messages Telegram entrants. Écrit uniquement par le '
  'worker bot en service_role. Garantit idempotence, audit et rejouabilité.';
