-- =============================================================================
-- Migration 081 — categories : taxonomie produit en base (SOUS-LOT 1, INERTE)
-- =============================================================================
-- Sort les catégories produit du code (src/lib/taxonomy.ts, figé au build) vers
-- une TABLE éditable. Objectif scalabilité : créer/traduire/activer une catégorie
-- depuis un panneau admin SANS déploiement.
--
-- ⚠️ SOUS-LOT 1 = TABLE INERTE. AUCUN code applicatif ne lit cette table à ce
-- stade : taxonomy.ts reste la SEULE source de vérité runtime. Cette migration est
-- 100 % ADDITIVE et RÉVERSIBLE (DROP TABLE suffit) — elle ne touche NI products,
-- NI products.category, NI la décision de canal D2. Zéro impact sur l'existant.
--
-- Modèle : table UNIQUE self-référencée (parent_id NULL = catégorie parente,
-- sinon sous-catégorie). slug = nom canonique FR ACTUEL (espaces/accents inclus)
-- → match EXACT avec products.category existant, ZÉRO backfill.
--
-- D2 (canal affilié) : `affiliate_allowed` est porté UNIQUEMENT par les catégories
-- parentes, DEFAULT false (fail-closed par défaut). Les 9 parents affiliés du code
-- (AFFILIATE_ALLOWED_CATEGORIES de taxonomy.ts) sont seedés à true à l'identique.
-- Un test de parité (tests/categories-seed-parity.test.ts) compare ce seed à
-- taxonomy.ts octet-pour-octet (noms + flag) et CASSE le build en cas de divergence.
--
-- RLS : SELECT ouvert (anon+authenticated) — slug/label/icon/affiliate_allowed/
-- active ne sont PAS des secrets (aucune marge, aucun coût, aucune PII ; le canal
-- d'un produit est déjà public). AUCUNE policy d'écriture client : INSERT/UPDATE/
-- DELETE refusés par défaut → toute mutation passera par server action en
-- service_role (sous-lot 4). En particulier `affiliate_allowed` n'est JAMAIS
-- modifiable hors server action (condition @security/@finance).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text        NOT NULL,
  parent_id         uuid        NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  label_fr          text        NOT NULL,
  label_ar          text        NOT NULL,
  label_en          text        NOT NULL,
  icon              text        NULL,           -- emoji (catégories parentes)
  image_url         text        NULL,           -- /categories/*.webp (catégories parentes)
  affiliate_allowed boolean     NOT NULL DEFAULT false,  -- D2 : fail-closed par défaut
  active            boolean     NOT NULL DEFAULT true,
  sort_order        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Unicité du slug PARENT (globale) : c'est la clé qui matche products.category.
CREATE UNIQUE INDEX IF NOT EXISTS categories_parent_slug_unique
  ON public.categories (slug)
  WHERE parent_id IS NULL;

-- Unicité du slug SOUS-CATÉGORIE par parent (un même nom — ex. « Homme » — peut
-- exister sous Textile ET sous Chaussures, comme dans la taxonomie actuelle).
CREATE UNIQUE INDEX IF NOT EXISTS categories_subcat_slug_unique
  ON public.categories (parent_id, slug)
  WHERE parent_id IS NOT NULL;

-- Lookup d'affichage : enfants d'un parent, dans l'ordre.
CREATE INDEX IF NOT EXISTS idx_categories_parent_sort
  ON public.categories (parent_id, sort_order);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- SELECT ouvert (données non sensibles). Aucune policy d'écriture → deny par défaut
-- pour INSERT/UPDATE/DELETE (mutations en service_role via server action only).
DROP POLICY IF EXISTS "categories_public_read" ON public.categories;
CREATE POLICY "categories_public_read"
  ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.categories IS
  'Taxonomie produit éditable (sous-lot 1 = INERTE, non lue par l''app). '
  'Table self-référencée : parent_id NULL = catégorie parente, sinon sous-catégorie. '
  'slug = nom canonique FR (match products.category). affiliate_allowed (D2) porté '
  'par les parents, DEFAULT false fail-closed. RLS : SELECT ouvert, écritures '
  'service_role only (server action). Seed = copie exacte de src/lib/taxonomy.ts.';

-- =============================================================================
-- SEED — copie À L'IDENTIQUE des 12 catégories + 48 sous-catégories de taxonomy.ts
-- Idempotent (guards NOT EXISTS) : ne réinsère pas si déjà seedé.
-- =============================================================================

-- SEED-PARENTS-START
INSERT INTO public.categories (slug, parent_id, label_fr, label_ar, label_en, icon, image_url, affiliate_allowed, sort_order)
SELECT v.slug, NULL, v.label_fr, v.label_ar, v.label_en, v.icon, v.image_url, v.affiliate_allowed, v.sort_order
FROM (VALUES
  ('Textile', 'Textile', 'المنسوجات', 'Textile', '👗', '/categories/textile.webp', true, 1),
  ('Matières premières', 'Matières premières', 'المواد الخام', 'Raw materials', '🧵', '/categories/matieres-premieres.webp', false, 2),
  ('Chaussures', 'Chaussures', 'الأحذية', 'Footwear', '👟', '/categories/chaussures.webp', true, 3),
  ('Cosmétique & hygiène', 'Cosmétique & hygiène', 'مستحضرات التجميل والنظافة', 'Cosmetics & hygiene', '💄', '/categories/cosmetique-hygiene.webp', true, 4),
  ('Alimentaire', 'Alimentaire', 'المواد الغذائية', 'Food & grocery', '🥗', '/categories/alimentaire.webp', false, 5),
  ('Maison & packaging', 'Maison & packaging', 'المنزل والتعبئة', 'Home & packaging', '📦', '/categories/maison-packaging.webp', true, 6),
  ('Artisanat', 'Artisanat', 'الحرف اليدوية', 'Crafts & handmade', '🧶', '/categories/artisanat.webp', true, 7),
  ('Électronique & gadgets', 'Électronique & gadgets', 'الإلكترونيات والأدوات الذكية', 'Electronics & gadgets', '📱', '/categories/electronique-gadgets.webp', true, 8),
  ('Sport & Fitness', 'Sport & Fitness', 'الرياضة واللياقة', 'Sport & fitness', '🏋️', '/categories/sport-fitness.webp', true, 9),
  ('Jouets & enfants', 'Jouets & enfants', 'الألعاب ومستلزمات الأطفال', 'Toys & children', '🧸', '/categories/jouets-enfants.webp', true, 10),
  ('Accessoires & maroquinerie', 'Accessoires & maroquinerie', 'الإكسسوارات والجلديات', 'Accessories & leather goods', '👜', '/categories/accessoires-maroquinerie.webp', true, 11),
  ('Autres', 'Autres', 'أخرى', 'Other', '🔧', '/categories/autres.webp', false, 12)
) AS v(slug, label_fr, label_ar, label_en, icon, image_url, affiliate_allowed, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE parent_id IS NULL);
-- SEED-PARENTS-END

-- SEED-SUBS-START
INSERT INTO public.categories (slug, parent_id, label_fr, label_ar, label_en, sort_order)
SELECT v.slug, p.id, v.label_fr, v.label_ar, v.label_en, v.sort_order
FROM (VALUES
  ('Textile', 'Homme', 'Homme', 'رجالي', 'Men', 1),
  ('Textile', 'Femme', 'Femme', 'نسائي', 'Women', 2),
  ('Textile', 'Enfant', 'Enfant', 'أطفال', 'Children', 3),
  ('Textile', 'Sous-vêtements', 'Sous-vêtements', 'ملابس داخلية', 'Underwear', 4),
  ('Textile', 'Hijab', 'Hijab', 'حجاب', 'Hijab', 5),
  ('Textile', 'Burkini', 'Burkini', 'بوركيني', 'Burkini', 6),
  ('Textile', 'Sportswear', 'Sportswear', 'ملابس رياضية', 'Sportswear', 7),
  ('Matières premières', 'Tissus vrac', 'Tissus vrac', 'أقمشة بالجملة', 'Bulk fabrics', 1),
  ('Matières premières', 'Maille vrac', 'Maille vrac', 'تريكو بالجملة', 'Bulk knitwear', 2),
  ('Matières premières', 'Denim', 'Denim', 'دنيم', 'Denim', 3),
  ('Matières premières', 'Coton', 'Coton', 'قطن', 'Cotton', 4),
  ('Matières premières', 'Accessoires textile', 'Accessoires textile', 'إكسسوارات منسوجات', 'Textile accessories', 5),
  ('Chaussures', 'Homme', 'Homme', 'رجالي', 'Men', 1),
  ('Chaussures', 'Femme', 'Femme', 'نسائي', 'Women', 2),
  ('Chaussures', 'Enfant', 'Enfant', 'أطفال', 'Children', 3),
  ('Cosmétique & hygiène', 'Cosmétique', 'Cosmétique', 'مستحضرات تجميل', 'Cosmetics', 1),
  ('Cosmétique & hygiène', 'Parfum', 'Parfum', 'عطور', 'Perfume', 2),
  ('Cosmétique & hygiène', 'Papier hygiénique', 'Papier hygiénique', 'ورق صحي', 'Toilet paper', 3),
  ('Cosmétique & hygiène', 'Hygiène', 'Hygiène', 'منتجات النظافة', 'Hygiene products', 4),
  ('Alimentaire', 'Produits alimentaires', 'Produits alimentaires', 'منتجات غذائية', 'Food products', 1),
  ('Alimentaire', 'Épices', 'Épices', 'بهارات', 'Spices', 2),
  ('Alimentaire', 'Conserves', 'Conserves', 'معلبات', 'Canned goods', 3),
  ('Alimentaire', 'Bio', 'Bio', 'عضوي', 'Organic', 4),
  ('Maison & packaging', 'Emballage', 'Emballage', 'تعبئة وتغليف', 'Packaging', 1),
  ('Maison & packaging', 'Articles ménagers', 'Articles ménagers', 'مستلزمات منزلية', 'Household items', 2),
  ('Maison & packaging', 'Décoration', 'Décoration', 'ديكور', 'Decoration', 3),
  ('Artisanat', 'Artisanat marocain', 'Artisanat marocain', 'حرف مغربية', 'Moroccan crafts', 1),
  ('Artisanat', 'Cadeaux', 'Cadeaux', 'هدايا', 'Gifts', 2),
  ('Artisanat', 'Décoration artisanale', 'Décoration artisanale', 'ديكور حرفي', 'Artisanal decoration', 3),
  ('Électronique & gadgets', 'Électronique', 'Électronique', 'إلكترونيات', 'Electronics', 1),
  ('Électronique & gadgets', 'Téléphonie & accessoires', 'Téléphonie & accessoires', 'هواتف وإكسسوارات', 'Phones & accessories', 2),
  ('Électronique & gadgets', 'Gadgets', 'Gadgets', 'أدوات ذكية', 'Gadgets', 3),
  ('Électronique & gadgets', 'Audio', 'Audio', 'صوتيات', 'Audio', 4),
  ('Sport & Fitness', 'Fitness', 'Fitness', 'لياقة بدنية', 'Fitness', 1),
  ('Sport & Fitness', 'Yoga', 'Yoga', 'يوغا', 'Yoga', 2),
  ('Sport & Fitness', 'Sport de plein air', 'Sport de plein air', 'رياضة خارجية', 'Outdoor sports', 3),
  ('Sport & Fitness', 'Accessoires sport', 'Accessoires sport', 'إكسسوارات رياضية', 'Sports accessories', 4),
  ('Jouets & enfants', 'Jouets', 'Jouets', 'ألعاب', 'Toys', 1),
  ('Jouets & enfants', 'Jeux éducatifs', 'Jeux éducatifs', 'ألعاب تعليمية', 'Educational games', 2),
  ('Jouets & enfants', 'Peluches', 'Peluches', 'محشوات', 'Plush toys', 3),
  ('Jouets & enfants', 'Loisirs créatifs', 'Loisirs créatifs', 'أنشطة إبداعية', 'Creative hobbies', 4),
  ('Accessoires & maroquinerie', 'Sacs', 'Sacs', 'حقائب', 'Bags', 1),
  ('Accessoires & maroquinerie', 'Maroquinerie', 'Maroquinerie', 'جلديات', 'Leather goods', 2),
  ('Accessoires & maroquinerie', 'Bijoux', 'Bijoux', 'مجوهرات', 'Jewelry', 3),
  ('Accessoires & maroquinerie', 'Lunettes', 'Lunettes', 'نظارات', 'Eyewear', 4),
  ('Accessoires & maroquinerie', 'Ceintures', 'Ceintures', 'أحزمة', 'Belts', 5),
  ('Autres', 'Accessoires', 'Accessoires', 'إكسسوارات', 'Accessories', 1),
  ('Autres', 'Divers', 'Divers', 'متنوع', 'Miscellaneous', 2)
) AS v(parent_slug, slug, label_fr, label_ar, label_en, sort_order)
JOIN public.categories p ON p.slug = v.parent_slug AND p.parent_id IS NULL
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE parent_id IS NOT NULL);
-- SEED-SUBS-END
