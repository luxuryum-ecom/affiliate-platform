# ETAT_SYSTEME.md — REGISTRE DE VÉRITÉ UNIQUE

> **⚠️ RÈGLE DE TRAVAIL — À LIRE AVANT TOUT CHANTIER.**
> **Avant de construire quoi que ce soit, lire ce fichier.** Une feature validée s'inscrit
> ici et **ne se reconstruit jamais**. **Mettre à jour ce fichier à chaque feature finie.**
> Ce registre fait foi : il est rempli à partir du **code et de git** (pas de mémoire).
>
> **🩺 RÈGLE DIAGNOSTIC — déploiement d'abord.** Si l'agent voit le **bon comportement dans le code** (vérifié runtime sur build local) mais que l'utilisateur voit **autre chose en prod**, **VÉRIFIER LE DÉPLOIEMENT VERCEL EN PREMIER** (souvent en retard sur `main` / cache). Ne PAS conclure « ergonomie » ou « non reproduit » avant ça. Trancher en **forçant un redeploy** : `git commit --allow-empty -m "chore: force redeploy" && git push` sur `main`. Cas réel : recherche grossiste « Pull ref 5 » = 0 en prod alors que le code était correct → déploiement périmé (résolu par `6dc0244`).

**Dernière synchro :** 2026-06-22 — `main` @ `cbc1aaa` — 85 migrations (001→085).

---

## 🧭 POINT DE REPRISE — fin de session 2026-06-18 (à lire en premier)

### ✅ EN PROD (confirmé, validé runtime)
- **LOT « Mobile + finitions vitrine » EN PROD** (merge `267beee`, **pas de migration, affichage pur**) :
  - **A5 mobile** (`3d07571`) : lazy-load `<img>` marketplace (`product-card-image`) ; cible tactile CTA carte affilié ≥44px (texte/couleur/position **inchangés**) ; stats fiche affilié `grid-cols-2 sm:grid-cols-4` (2×2 mobile, desktop identique) ; CTA hero marketplace `sm:whitespace-nowrap` (wrap mobile/AR). **Nombre de cartes/ligne, taille des cartes : INCHANGÉS** (vérifié runtime : 2 mobile / 4 desktop, zéro débordement FR/AR/EN).
  - **A4 wording** (`696ab44` + fix `992fcb0`) : « Stock local Maroc » (trompeur) → « **Stock Maroc — livraison rapide** » (badges/trust/availability) / « **Stock Maroc** » (filtres/chips) / titre hero « **MAROC — STOCK DISPONIBLE** ». **48 remplacements FR/AR/EN** (27 + 21 au fix PHASE C). Plus aucun « stock local »/« local stock »/« مخزون محلي ». (`supplierTypeMorocco = "Local Maroc"` = type fournisseur, laissé.)
  - **A3 i18n sélecteur** (`696ab44`) : labels d'options du sélecteur activité (4 profils) + volume (4 paliers) du form de devis marketplace étaient en **français en dur** (`rfq-buyer-intake.ts`) → 8 clés i18n (`quoteFormProfile*`/`quoteFormVol*`) FR/AR/EN, résolues **serveur** (parent `marketplace/[id]`) passées en strings au form client (zéro fonction au client). Vérifié runtime : options traduites AR/EN, zéro français. Constantes conservées pour l'admin.
  - **Carte affilié #5** (`35aa5d6`) : ligne « tout compris » neutralisée (text-muted, plus verte) → le bloc gain reste l'accent. **#6** (encadré gris) = obsolète (déjà vert lisible). **#7** (badges stock séparés) = déjà groupés sur fiche affilié ET publique.
  - **Preuves** : captures Playwright mobile 390 + desktop 1280, FR/AR/EN + RTL (`.mobile-proofs/`, commit `cd2801f`). tsc 0 / build / 239 tests / smoke 20/20 à chaque commit. **Note méthode** : la PHASE C a rattrapé un FAIL réel (titre hero « STOCK LOCAL » manqué) → corrigé + re-vérifié.
- **ÉTAPE 2 « Publication propre » EN PROD** (merge `9862f96`, **pas de migration** — flag TS + colonnes existantes) :
  1. **Canal par catégorie D2** (`42d98e4`) — `affiliate_enabled` forcé SERVEUR selon la catégorie (`isAffiliateAllowedCategory` **fail-closed** dans `src/lib/taxonomy.ts`), allowlist anti-POST (`isValidCategory`), **fix fuite miroir** : `buildSupplierMirror` pose `affiliate_enabled=false` EXPLICITE + copie `category`/`subcategory` (avant : défaut `true` → un miroir grossiste fuyait au catalogue affilié sans capital). Taxonomie portée à **12 catégories** (+ Électronique & gadgets / Sport & Fitness / Jouets & enfants / Accessoires & maroquinerie, toutes affilié). Backfill : 2 produits Alimentaire → grossiste (0 miroir fuyant en prod).
  2. **Report paliers fournisseur → `products.wholesale_tiers`** (`cef7342`, D3) — `buildMirrorTiers` (`supplier-pricing.ts`) convertit `supplier_product_moq_tiers` (devise source) via FX (`convertToMad`) + marge (`applyPlatformMargin`) en **ENTIER MAD** (jamais le biais ½-cent), `max_qty` **bornés** pour que `getWholesaleTier` serve le bon palier volume. **Grossiste-only** (miroir `affiliate_enabled=false`). Reporté à l'approbation.
  3. **Rayons/familles + filtres catégorie** (`1794496`) — `CategoryRail` (Server Component pur) + filtre serveur `?category=` sur `/affiliate/products` ET `/wholesale/products` ; `CATEGORY_ICONS` + `resolveCategoryLabel` dans `taxonomy.ts` ; i18n namespace `categories` **FR/AR/EN parité 58 clés** + RTL.
  4. **Normalisation catégories** (`17e4af7`) — 117 lignes legacy (« Mode & Textile », « Electronique »…) → taxonomie canonique (script `normalize-categories.mjs`, backup avant). Prérequis de D2.
  **@finance + @security GO ×2** sur chaque sub-lot argent. **Preuve runtime END-TO-END** : approbation réelle d'un produit fournisseur via l'UI admin → miroir `affiliate_enabled=false`, catégorie reportée, `sell_price=125` (=100 +25%), paliers `[{1,max99,125},{100,100}]` entier MAD (8/8 PASS, données nettoyées). **ZÉRO montant existant modifié** (capital 073 intact), D3 respecté. tsc 0 / 239 tests (+14) / build / smoke 20/20. **Suivis** : (a) traduction IA du contenu produit = **ÉTAPE 2b** (lot dédié) ; (b) paliers du flux **Finaliser** encore en **saisie manuelle** (auto-report = flux Approuver/miroir uniquement, pré-remplissage futur @finance).
- **Catalogue grossiste UNIFIÉ** (2 onglets Disponible/À importer, interne+fournisseur fusionnés & cloisonnés, noir & or) — `d379ca1` / mig. 075.
- **Marketplace grossiste GLOBAL** (inclut produits internes Mozouna + fournisseurs, source invisible) + **filtres pays** (Chine/Turquie/Égypte/Dubai) corrigés — `8ab5189` / `c908809`.
- **Hook profit affilié** (simulateur gain temps réel, prix conseillé ×1,25) — `ba4b2af`.
- **Wording affilié tout-inclus** (« Tu vends, tu encaisses… ») — `842acce`.
- **Notif fournisseur LOT 6** (commande assignée → fournisseur + admin in-app + Telegram best-effort, zéro PII, RLS étanche) — mig. 076+077.
- **Bot Telegram ingestion produit EN PROD** — webhook sur `https://affiliate-platform-gamma.vercel.app/api/telegram/webhook` (plus ngrok). **Validé bout-en-bout 18/06** : caption → extraction IA → upload image → `supplier_products` en `pending_review` → **validation admin testée**. Voir section FOURNISSEURS.
- **Bouton « Finaliser » produit fournisseur→catalogue EN PROD** (`40776cf`, merge `ad93ba0`) : sur `/admin/supplier-products/[id]` (produit validé), bouton → `/admin/products/new?from_supplier=<id>` qui **pré-remplit les BASIQUES** (nom, photos, catégorie/sous-cat, origine, stock) ; **l'argent (coût, marge, frais, paliers, sell_price, commission, affiliate_enabled) reste VIDE, saisi par l'admin** dans le form déjà audité (zéro logique financière). **Anti-doublon** : lien `source_supplier_product_id` posé + supplier_product source **archivé** (`archived_at`) → retiré de la vue grossiste fournisseur (gate `archived_at IS NULL`, mig 068) → pas de double-listing. Vérifié runtime + tsc/tests/build/smoke. (Option 1 de `FEUILLE_DE_ROUTE.md` → Option 3 intégrée reste future, circuit @finance.) **Flux Finaliser 2-canaux testé bout-en-bout 6/6 fonctionnel = VALIDÉ EN PROD** (2026-06-18, session admin réelle : capital mig 073 = coût 40 + marge 25% → 50 + emballage 10 + confirmation 10 + livraison 35 = 105, commission 0 au prix catalogue ; paliers grossiste 52/50/48/46 décroissants sans frais COD ; affiché 1× affilié + 1× grossiste ; anti-doublon par archivage OK ; séparation stricte zéro palier en affilié / zéro frais COD en grossiste. Données de test nettoyées).
- **Hook grossiste = TABLEAU 3 COLONNES (Quantité / Prix du lot / Tu économises), ambiguïté levée = EN PROD** (`ae79b73`, merge `61e1d3f`) : sur `/wholesale/products/[id]`, tableau clair — **Quantité** (ex. 500 pièces), **Prix du lot** = `prix_palier × quantité` (ce que le client paie, ex. 83×500 = 41 500 MAD), **Tu économises** = `(prix_petit_palier − prix_palier) × quantité` (ex. 5 500 MAD). Accroche en haut avec le plus gros montant **toujours labellisé** « Jusqu'à … d'économie » (jamais un montant nu — corrige l'ambiguïté du format initial `23b2db8`). **AFFICHAGE PUR** (lecture `wholesale_tiers` stockés, zéro recalcul serveur, aucune donnée sensible) ; garde-fou < 2 paliers → rien ; séparation respectée (grossiste, zéro frais COD) ; i18n FR/AR/EN chiffres latins (séparateur espace). `src/lib/wholesale-savings.ts` (helper pur, champ `lotPrice`, 9 tests) + `src/components/wholesale/wholesale-savings-hook.tsx`. Rendu FR vérifié runtime. NB : cartes catalogue non couvertes (vue n'expose que `from_price`) — cadrage séparé si besoin.
- **Liaison finalisation unités = EN PROD** (`74ccc39`, merge `f74e10e`, **pas de migration**) : à la finalisation (`/admin/products/new?from_supplier`), l'unité de vente (`supplier_products.unit` → `products.sale_unit`, unité RÉELLE seulement, pcs/null → null = pièce inchangé) et le conditionnement (`pack_size`/`pack_unit`) se **reportent** au produit catalogue. **Saisie manuelle** unité/conditionnement ajoutée au **formulaire admin** (`ProductForm` : select `sale_unit` + inputs `pack_*`, pré-remplis) pour **tout produit**, et `upsertProduct` les sauve (insert+update). **Additif, ZÉRO calcul** (hors capital/commission/paliers/checkout). Non-régression : produit sans unité = pixel-identique ; édition réécrit les mêmes valeurs. Testé runtime : supplier_product « carton »+pack 50 → form pré-rempli carton/50/boîte ; sans unité → reste pièce.
- **Cosmétique conditionnement (pluriel pack_unit à l'affichage + traduction i18n AR/EN/FR du nom de conditionnement, fallback texte brut, affichage pur zéro calcul) = EN PROD** (`c1975c3`, merge `00970a9`, **pas de migration**) : sur `PackBreakdown`, le nom du conditionnement (`pack_unit`) est **accordé en nombre** (pluriel pour la composition « carton de 50 **boîtes** », singulier pour le prix/unité « / **boîte** ») et **traduit** si l'unité est connue (helpers purs `normalizePackUnit`/`resolvePackUnitLabel` + clés i18n `pu_*` : FR/EN en ICU plural, AR forme unique à chiffres latins). Terme libre **inconnu → texte brut conservé** (fallback sûr). **AFFICHAGE PUR, ZÉRO calcul, valeur stockée jamais modifiée** ; produit sans conditionnement = inchangé (garde-fou `null`). Rendu réel vérifié : FR « carton de 50 boîtes — ≈ 2,98 MAD / boîte », AR « كرطونة من 50 علبة — ≈ 2,98 MAD / علبة » (RTL 100 % arabe), EN « carton of 50 boxes — ≈ 2,98 MAD / box ». Garde-fous tous verts (tsc 0, 218 tests dont +8, build à froid, smoke 20/20). Données de test prod nettoyées.
- **Fix RTL arabe conditionnement (≈ groupé avec le prix dans isolat bidi + size isolé, affichage propre en AR, FR/EN inchangés au pixel, zéro calcul) = EN PROD** (`8ed3557`, merge `6296454`, **pas de migration**) : en arabe (dir=rtl) le « ≈ » du prix/unité se **détachait** du nombre (laissé hors isolat bidi → posé à droite du bloc, après « MAD »). Fix calqué sur la convention du prix principal : dans `PackBreakdown`, `perUnit = ⁨≈ {formatMAD}⁩` (isolat **FSI U+2068 … PDI U+2069**) → « ≈ 2,98 MAD » forme un **îlot LTR unique** et le ≈ **colle au prix** ; « ≈ » retiré des 3 messages `packPerUnit` (porté par `perUnit`) ; `{size}` nu également isolé (robustesse). « MAD » conservé (cohérence prix principal, **pas** de د.م.). **Isolats invisibles en LTR → FR « ≈ 2,98 MAD / boîte » et EN inchangés AU PIXEL.** **AFFICHAGE PUR, zéro calcul, valeur stockée jamais modifiée.** Preuve rendu réel AVANT (≈ à x=329, détaché après MAD) → APRÈS (≈ à x=262, collé devant « 2,98 »@272) ; FR/EN identiques ; garde-fous verts (tsc 0, 218 tests, build à froid, smoke 20/20). Données de test éphémères nettoyées.
- **Unités ml/litre(L)/gramme ajoutées (normalizeSaleUnit + extraction IA FR/AR/darija + labels + select form + conditionnement, additif zéro calcul, existant inchangé) = EN PROD** (`3dd81f2`, merge `3f9f419`, **pas de migration**) : `SALE_UNITS` += `ml`/`litre`/`gramme` ; `normalizeSaleUnit` refactoré en map d'alias (FR/AR/darija/EN : « litre »/« L »/« لتر » → litre, « millilitre »/« ml »/« مل » → ml, « gramme »/« g »/« غرام » → gramme) **+ repli dernier token** (« les 100 ml » → ml) ; **défaut `piece` inchangé**. Extraction IA Telegram (P2) : prompt + tool desc reconnaissent litre/ml/gramme — démo Haiku réelle 4/4 (« 80 dh le litre » → litre, « 150 dh les 100 ml » → ml, « 12 dh le gramme » → gramme, « carton de 12 litres » → pack 12/litre). Labels i18n FR/AR/EN (vente : litre=« L », gramme=« g », ml=« ml », AR « لتر/غرام/مل » ; conditionnement `pu_*` pluriel FR/EN). Option select `sale_unit` ajoutée. Conditionnement compatible (« carton de 12 litres — ≈ 20,00 MAD / litre » ; AR « كرطونة من 12 لتر »). **AFFICHAGE PUR, zéro calcul** (pas de @finance), existant (mètre/kg/paquet/pièce/carton) et produits actuels inchangés. Rendu réel FR/AR vérifié ; garde-fous verts (tsc 0, 225 tests dont +13, build à froid, smoke 20/20). Données de test éphémères nettoyées.
- **Prompt IA conditionnement amélioré (règles contenant/contenu anti-inversion + anti-redondance + exemples, démo réelle 4 cas corrigés sans régression, prompt only zéro calcul) = EN PROD** (`75aff16`, merge `0b917a9`, **pas de migration**) : le prompt d'extraction (`extract.ts`, SYSTEM only) créait des conditionnements **redondants** (« ml de 100 ml », « mètre de 100 mètres ») ou **inversés** (« kg de 10 sacs » au lieu de « sac de 10 kg »). Règles ajoutées : (1) l'unité de vente = le **CONTENANT** quand le prix porte dessus (sac/carton/paquet), pas le contenu ; (2) **contenant/contenu** : `pack_unit` = le CONTENU, `pack_size` = combien, le contenant est déjà `unit` ; (3) **anti-redondance** : conditionnement de même unité que la vente → `pack` vide ; + exemples bons ✅ / mauvais ❌. Démo Haiku réelle AVANT→APRÈS : « rouleau de 100 m » → metre **sans pack** (était metre/100/mètre) ; « sac de 10 kg » → **paquet/10/kg** (était kg/10/kg inversé) ; « huile 100 ml » → ml sans pack ; « carton de 50 boîtes » → carton/50/boîte (**resté bon**). Non-régression vérifiée (poulet=kg, gâteau=pièce, couches=paquet/50/pièce, savon=pièce+carton/24). **PROMPT ONLY**, aucune logique/helper/calcul touché (pas de @finance). Garde-fous verts (tsc 0, 225 tests, build à froid, smoke 20/20).
- **Fix miroir approbation copie sale_unit/pack (buildSupplierMirror reporte l'unité/conditionnement au catalogue comme Finaliser, cohérence des 2 flux, logique financière du miroir intouchée, zéro @finance) = EN PROD** (`e5a209f`, merge `6be209c`, **pas de migration**) : trou découvert — l'**approbation** d'un `supplier_product` crée un miroir catalogue `products` (`buildSupplierMirror`) mais **ne copiait PAS** `sale_unit`/`pack_size`/`pack_unit` → un produit **approuvé mais non finalisé** perdait son unité au catalogue (seul le flux **Finaliser** la reportait). Fix : `SupplierMirrorInput`/`MirrorRow` += `unit`/`pack_size`/`pack_unit` ; `sale_unit = normalizeSaleUnit(unit)` (pcs/null → null = pièce, inchangé), pack reporté tel quel ; `approveSupplierProduct` lit et passe ces champs. **Les 2 flux (Approbation ET Finaliser) reportent maintenant l'unité de façon cohérente.** **Logique FINANCIÈRE du miroir INTOUCHÉE** (`sell_price`/`factory_cost_mad`/marge captée/conditions C-B1..C-B5 — test le vérifie) → **AFFICHAGE PUR, pas de @finance**. Non-régression : produit sans unité → miroir sans unité (inchangé). Garde-fous verts (tsc 0, 228 tests dont +4 miroir, build à froid, smoke 20/20).
- **Badges i18n (branding.tsx : MOQ/Vérifié/Vedette/origines/disponibilité traduits FR/AR/EN via Server Components, FR inchangé, catégories taxonomie laissées séparées) = EN PROD** (`0b18d10`, merge `1d64e11`, **pas de migration**) : correctif audit **P0-2** — `branding.tsx` affichait du **français en dur** sur les badges même en AR/EN (MOQ, Vérifié, Vedette, Stock disponible, Import, Fournisseur Maroc, Réactif, Rupture, origines pays…). Fix : nouveau namespace i18n **`badges`** (FR/AR/EN) ; les composants à texte deviennent des **Server Components async** résolvant via `getTranslations('badges')` (jamais de fonction `t` passée à un Client Component — tous les usages sont des pages serveur, vérifié ; build/smoke valident). Origines & trust via ICU `select` (fallback texte brut si valeur inconnue). **AFFICHAGE PUR, zéro argent.** **CategoryBadge laissé non traduit** (catégorie/sous-catégorie = valeurs DONNÉE de la taxonomie → chantier séparé, cf. Décision 2) ; « Gold » gardé (palier universel). Rendu réel vérifié FR (inchangé) / AR / EN (origines basculent Maroc→Morocco→المغرب, MOQ→أدنى كمية, Vérifié/Vedette traduits). Garde-fous verts (tsc 0, 228 tests, build à froid, smoke 20/20).
- **Marketplace RTL/format (prix→formatMAD isolat bidi, MOQ/stock→formatQty, suffixe unité conditionnel, 'u.' en dur retiré, validé FR/AR/EN, affichage pur zéro argent) = EN PROD** (`b007baa`, merge `7cf40b0`, **pas de migration**) : correctif audit **P1-5** — sur `/wholesale/marketplace/[id]`, le prix « … MAD » était **concaténé à la main** (sans isolat bidi) → réordonnancement en arabe ; MOQ/stock nus ; suffixe d'unité **orphelin** quand `unit=''` ; **« u. » français en dur** dans la carte (`marketplace/page.tsx`). Fix : nouveau helper `formatQty` (entier isolé FSI/PDI, **sans devise**, ≠ formatMAD) ; prix → `formatMAD` ; MOQ/stock → `formatQty` + **unité affichée seulement si présente** ; unité du form de commande directe trimée ; `numLocale` inutilisé retiré ; carte → `MOQChip unit=''` (le chip traduit déjà « MOQ » via le lot badges et omet l'unité vide) + texte WhatsApp guardé → **plus aucun « u. » en dur**. **AFFICHAGE PUR, zéro argent.** Rendu réel vérifié **FR/AR/EN** : prix `⁨1.144,17 MAD⁩` isolé partout, MOQ « 40 pcs » sans orphelin, sous-total isolé ; FR inchangé visuellement. Garde-fous verts (tsc 0, 228 tests, build à froid, smoke 20/20).
- **P2 cosmétiques (img marketplace→ProductThumbnail fallback, descriptions→getMeaningfulDescription, tarif transport masqué si 0/vide, FR/AR/EN, affichage pur zéro argent) = EN PROD** (`c14e172`, merge `d6042e4`, **pas de migration**) : correctifs audit **P2-2/P2-3/P2-4**. **P2-2** — fiche `/wholesale/marketplace/[id]` : `<img>` brut (sans fallback) → composant partagé `ProductThumbnail` (fallback **initiales** via `onError`, cohérent avec le reste). **P2-3** — descriptions grossiste (`/wholesale/products/[id]`) + marketplace via `getMeaningfulDescription` (déjà utilisé côté affilié) : la description ne s'affiche que si non-vide ET différente du nom (plus de `<p>` vide / qui répète le nom). **P2-4** — `wholesale/products/[id]` : tarif transport `Number('')→0` corrigé (`transportCostMad = null` si null/vide/0 → champ **masqué**, garde `!= null`) → plus de « 0,00 MAD » parasite ; valeur positive toujours affichée. **AFFICHAGE PUR, zéro argent.** Preuve rendu réel **FR/AR/EN** (produit éphémère image cassée + description=nom, nettoyé) : initiales affichées, `<img>` brisée absente, description répétant le nom masquée. P2-4 vérifié par logique + tsc (0 produit import_on_demand en prod). Garde-fous verts (tsc 0, 228 tests, build à froid, smoke 20/20).
- **P0-1 auto-miroir approbation réparé (SELECT→INSERT/UPDATE app-level idempotent, index 069 backstop, Finaliser poli si miroir existe, fix unité dormant e5a209f activé, @finance+@security GO, zéro calcul touché, pas de migration) = EN PROD** (`1e75f03`, merge `b33d236`, **pas de migration**) : BUG de fond (commit `71e893d` du 15/06) — l'auto-miroir catalogue à l'approbation ne se créait JAMAIS car `.upsert({ onConflict:'source_supplier_product_id' })` ne peut pas inférer l'**index UNIQUE PARTIEL** 069 (`WHERE … IS NOT NULL`) → Postgres 42P10 → erreur avalée → aucun produit catalogue. Fix Option A (app-level, **aucune migration**) : `approveSupplierProduct` fait un **SELECT par `source_supplier_product_id` → UPDATE si présent (clé immuable exclue), INSERT sinon** ; idempotent ; l'index partiel 069 reste le **backstop** anti-doublon (race → échec propre non-fatal). `upsertProduct` (**Finaliser poli**) : si un miroir existe déjà → **refus propre** (« déjà au catalogue ») AVANT toute dérivation → plus de crash sur l'unique index ; **garde double-marge `isMirrorProduct` INTACTE** (régression 14/06 préservée). Le fix dormant `e5a209f` (copie `sale_unit`/`pack` au miroir) **s'active enfin** → le miroir porte l'unité. **@finance GO + @security GO** (zéro changement de VALEUR, mécanisme seul ; RLS-bound, pas de service_role ; clé de lien exclue). Test runtime réel 4/4 : (a) approuver → miroir créé sell=200/carton/50/boîte ; (b) ré-approuver → 1 seul miroir (idempotent) ; (c) Finaliser produit déjà-miroir → refus propre, pas de doublon ; (d) produit import (sans miroir) → Finaliser inchangé. Données de test nettoyées (0 résiduel). Garde-fous verts (tsc 0, 228 tests, build à froid, smoke 20/20).
- **Unités de vente P3 conditionnement = EN PROD** (`a9342d1`, merge `dbd5545`, **migration 080**, @architect GO) : champs `pack_size`/`pack_unit` (NULL = aucun conditionnement) sur `products` + `supplier_products`. Affichage descriptif sur fiches affilié/grossiste : **« carton de N boîtes — ≈ X MAD/unité »** où le prix/unité est **DÉRIVÉ à l'affichage** (`prix ÷ pack_size`), **jamais stocké, jamais facturé**. **La facturation reste au prix de l'unité de vente (le carton) — INCHANGÉE.** **DESCRIPTIF ONLY**, aucun calcul ne lit `pack_*` (grep ∅ utils/savings/cart/orders). Rendu uniquement si pack posé → produit sans conditionnement pixel-identique. Extraction IA Telegram étendue (pack_size+pack_unit → supplier_products si détectés). Testé runtime prod : NULL=identique, « carton 50 boîte → ≈ 2,98 MAD/boîte », `sell_price`/`commission`/paliers inchangés. ⚠️ Facturer à la boîte = @finance (PAS fait). Composant `src/components/shared/pack-breakdown.tsx` + helper `packPerUnitPrice`.
- **Unités de vente P2 (extraction IA) = EN PROD** (`5d1cb51`, merge `96c34d3`, @architect GO, **pas de migration**) : l'IA d'extraction Telegram **devine l'unité de vente** (FR/AR/darija : « le mètre »/« متر »→metre, « le kg »/« كيلو »→kg, « le carton »/« كرطونة »→carton, « le sac »→paquet) et la pose dans **`supplier_products.unit`** (où ingest écrit déjà ; PAS `products.sale_unit` qui est le catalogue interne). Champ `unit` ajouté au schéma IA + prompt + tool ; normalisation via `normalizeSaleUnit` (réutilise le helper P1). **Unité NON détectée → rien posé → défaut colonne `'pcs'` inchangé** (RÈGLE ABSOLUE). **ZÉRO calcul touché.** Démo IA réelle 5/5 + 6 tests. Le « sac 25kg » (conditionnement) ne perturbe pas l'unité de prix « kg ». Suite : P3 conditionnement, P4 vue.
- **Unités de vente P1 = EN PROD** (`d9e4894`, merge `cd640ed`, **migration 079**, @architect GO) : champ `products.sale_unit` (text NULL = « pièce » implicite, additif sans default/backfill, **distinct** de `import_price_unit`). Affichage du **suffixe d'unité** (« 12 MAD / kg ») sur fiche affilié + fiche grossiste **ET** dans le hook économie (prop `unitLabel` string résolue serveur) **uniquement si `sale_unit` est posé** → produit sans unité (NULL) = **pixel-identique** à avant. **ZÉRO calcul touché** (prix/capital/commission/paliers/checkout n'en dépendent pas) → pas de @finance. Helper `src/lib/units.ts` (normalize → piece par défaut, jamais d'erreur) + i18n FR/AR/EN. Testé runtime base prod : NULL = sans suffixe, kg = « / kg » + hook « 50 kg ». **Suites : P2 extraction IA unité, P3 conditionnement (descriptif), P4 vue — cf. `FEUILLE_DE_ROUTE.md`.**
- **Sécurité / backup** : code sur GitHub (`origin`, `main`=prod) ; base Supabase dumpée dans `~/AI-FACTORY/backups/` + **copie hors-PC iCloud** (`Mozouna-backups/`, auto à chaque backup) + backup hebdo launchd `com.mozouna.backup-prod`. Voir section SÉCURITÉ / BACKUP.

### ✅ CHANTIER « CATÉGORIES DYNAMIQUES EN BASE + PANNEAU ADMIN » EN PROD (merge `6d3557d`, 2026-06-21)
- **Objectif (scalabilité mondiale)** : sortir les catégories produit du code (`src/lib/taxonomy.ts`, figé au build) vers une **table DB éditable** + **panneau admin `/admin/categories`** → créer/éditer/traduire (FR/AR/EN)/activer-désactiver/réordonner une catégorie **sans déploiement**. Une nouvelle branche métier (électroménager, BTP…) se crée en 2 clics, le produit n'est plus noyé dans « Autres ».
- **Migrations** : **081** (`categories` self-référencée parent_id, slug = nom canonique FR = match `products.category` zéro backfill, `affiliate_allowed` DEFAULT false, seed **12 cat + 48 sous-cat à l'identique**, RLS SELECT public) + **082** (RLS écriture admin-only, RPC `set_category_affiliate_allowed` SECURITY DEFINER auditée, table **`category_channel_audit` append-only immuable**, triggers : guard canal / audit immuable / protection `'Autres'`). Backup prod avant chaque push.
- **Sous-lots 1-4 FAITS** (5 nettoyage = optionnel reporté) : (1) table + seed inerte + test parité ; (2) lecture taxonomie depuis la base + **fallback fail-closed** `taxonomy.ts` (IA d'ingestion `extract.ts`/`schema.ts`, lecture cachée `getCategoryContext`) ; (3) 🔴 **bascule décision canal D2** (`products.ts:115-135` → `getChannelDecision`, lecture **fraîche non cachée**, **décision positive `=== true`**, fail-closed) ; (4) panneau admin CRUD + **toggle canal audité** (qui/quand/ancien→nouveau).
- **CANAL D2 / ARGENT** : `@finance` GO + `@security` GO sur le **code réel** des sous-lots 3 et 4. **Non-régression prouvée — 12 canaux IDENTIQUES avant/après** (octet pour octet, test `tests/categories-d2-parity.test.ts` + live prod 0 écart) : **9 affiliées restent affiliées**, **Alimentaire + Matières premières + Autres restent grossiste-seul**. Aucune règle figée (capital/D2/D3) rouverte. `supplier-mirror.ts` non touché (garde `!isMirrorProduct`). Nouvelle catégorie naît **grossiste** (fail-closed) ; passage en affilié = action **auditée** (RPC seul chemin, trigger bloque tout rôle client, `service_role` jamais exposé).
- **Preuves runtime (session admin réelle)** : toggle canal + restore audité (2 lignes old→new + acteur + horodatage) ; UPDATE direct `affiliate_allowed` **bloqué** par trigger ; audit **immuable 2 couches** (RLS client + trigger service_role) ; `'Autres'` suppression/désactivation **bloquées** ; RPC en anon **refusée**. i18n FR/AR/EN + RTL sur les écrans admin.
- **4 checks verts** à chaque sous-lot (tsc 0 / build / **263 tests** dont parité seed + parité D2 / smoke 20/20). 5 commits (`7957f45`/`d7d6021`/`2ed93f8`/`f1cb2b4`), merge `6d3557d` `--no-ff`. **EN PROD.**
- **SUIVI (tracé `FEUILLE_DE_ROUTE.md`)** : ✅ **Lot affichage dynamique** (filtres `?category=` / forms admin+supplier / rails / grilles / unif. 3× `CATEGORY_ICONS` → lire la base, **non-financier**) = **EN PROD (merge `9e1e4b0`)** — voir entrée dédiée ci-dessous ; ⬜ **Sous-lot 5** (réduire `taxonomy.ts` au rôle de fallback) ; ⬜ 3 findings mineurs `@security` (N+1 audit fetch, `updateCategory` re-check id, `image_url` zod `url()`) ; ⬜ `@finance` `changed_by ON DELETE SET NULL` → libellé acteur si rétention nominative exigée.

### ✅ LOT « Dashboard grossiste HUB 3 zones » EN PROD (merge `--no-ff` de `feat/dashboard-grossiste-hub`, 2026-06-21)
- **UX-G1 + UX-G2 — Refonte `/wholesale/dashboard` en HUB 3 zones** (**affichage pur, zéro argent, zéro migration**) — **EN PROD, 4 checks verts (tsc 0 / build OK / 263 tests / smoke 20/20) + vérif runtime mobile 390px FR/AR/EN/RTL, GO Abdou, poussé `origin/main`.** Réorganisation des 10 blocs à plat en **3 zones empilées mobile-first** : **ZONE 1 ACHETER** (2 boutons or `Stock Maroc`→`/wholesale/products` + `Marché mondial`→`/wholesale/marketplace` avec drapeaux 🇲🇦🇨🇳🇹🇷🇪🇬🇦🇪 sous le nom ; entrée `Sourcing intelligent`→`/wholesale/sourcing` mise en avant fond `bg-primary` noir/or, badge Nouveau) ; **ZONE 2 MON ACTIVITÉ** (chips réels En cours + Panier→`/wholesale/cart` ; liens Mes commandes→`/wholesale/orders`, Mes devis→`/wholesale/quote-requests` + 3 compteurs préservés, Mes échantillons→`/wholesale/samples` badge préservé) ; **ZONE 3 MON COMPTE** (seul lien réel `Mon compte & facturation`→`/wholesale/account`, **aucune fausse feature** — pas de fidélité/Bronze, pas de Mes factures). **« Total dépensé » RETIRÉ.** **100 % ADDITIF côté navigation** : les **8 liens identiques avant/après** (`git` hrefs diff vide), tous **status 200** vérifiés runtime (zéro lien cassé). Tokens sémantiques noir & or conservés (pas de couleur en dur) → pas de casse light/dark. **1 seul fichier UI** `src/app/(wholesale)/wholesale/dashboard/page.tsx` (+ clés i18n `zone*`/`buyLocal*`/`buyGlobal*` FR/AR/EN). Preuves `.nav-proofs/dashboard-hub/` (3 captures mobile) + script `e2e/capture-dashboard-hub.mjs`. **Rendu en thème CLAIR (encre & or) assumé : règle Abdou « les dashboards restent en clair » (cohérence espace grossiste) — pas de dark forcé.** **EN PROD.**

### ✅ LOT A « Entrée catalogue par rayon » EN PROD (merge `d82c6e2`, 2026-06-21)
- **LOT A — Restructuration ENTRÉE catalogue** (merge `d82c6e2` `--no-ff`, code `e320507`, **affichage pur, zéro argent, zéro migration, UN SEUL fichier**) — **EN PROD, 4 checks verts (tsc 0 / build / 239 tests / smoke 20/20), GO visuel Abdou, poussé `origin/main`** : l'entrée du **catalogue grossiste `/wholesale/products`** guide le commerçant peu lettré (90 % mobile) par une bascule serveur unique `inAisle = !!filters.category`. (1) **SANS `?category=` (entrée)** : la **grande grille de TOUS les rayons en images** (`CategoryShowcase layout="grid"`, titre « Choisis ton rayon ») devient la porte d'entrée ; **rail compact masqué** (décision Abdou, anti-doublon). (2) **AVEC `?category=` (dans un rayon)** : la grande grille **disparaît**, le **rail compact** des autres rayons (chips, actif en or + « Toutes ») reste en haut et la **grille produit filtrée remonte direct** (zéro scroll pénible mobile). **100 % ADDITIF** : onglets Disponible/Importer, cardinalité/taille des cartes PRODUIT, filtres, CTA, couleurs noir & or **intacts**. Réutilise tout l'existant (`CategoryShowcase`/`CategoryRail`/12 WebP/i18n FR-AR-EN déjà traduits) — **rien reconstruit, aucun nouveau composant**. Seul `src/app/(wholesale)/wholesale/products/page.tsx` modifié (+25/−20). **Vérifié runtime END-TO-END par @tester** : 6 captures mobile 390px FR/AR/EN × (entrée/rayon) + inspection DOM (entrée = 12 liens rayons, rail absent ; rayon = showcase absente, grille produit présente) ; **RTL AR `dir=rtl` confirmé**. Preuves `.nav-proofs/entree-rayons/`. **EN PROD.**

### ✅ LOT « Navigation CATALOGUE » EN PROD (merge `128131c`, 2026-06-21)
- **LOT « Navigation CATALOGUE »** (merge `128131c` `--no-ff`, **affichage pur, zéro argent, zéro migration**) — **EN PROD, 4 checks verts (tsc 0 / build / 239 tests / smoke 20/20), GO visuel Abdou, poussé `origin/main`** : navigation visuelle par rayon ajoutée sur le **CATALOGUE produits `/wholesale/products`** (stock local Maroc, commande directe — cible du commerçant peu lettré), **PAS sur le marketplace global** (recadrage de cible Abdou). (1) **Section « cartes-rayons » EN HAUT du catalogue, au-dessus des onglets** Disponible/Import (carrousel mobile / grille desktop) ; cartes → `/wholesale/products?category=` (onglet + filtres préservés). (2) **Route bonus `/wholesale/products/categories`** (grille pleine). Composant `CategoryShowcase`/`CategoryCard` (Server Component pur, fallback emoji CSS). (3) **12 images self-hostées WebP** `public/categories/` (Unsplash libre de droit, `CREDITS.md`) + `CATEGORY_IMAGES` dans `taxonomy.ts`. **Le rail catégories existait DÉJÀ nativement sur le catalogue** (`1794496`) → non dupliqué. **100 % ADDITIF** : grille produit / onglets / rail / CTA / filtres **intouchés**. **`/wholesale/marketplace` remis byte-identique à l'origine** (1er essai retiré ; preuve `git diff 4047c8c` vide). i18n FR/AR/EN + RTL vérifiés (captures catalogue mobile+desktop, `.nav-proofs/catalog/`). **EN PROD.**

### ✅ LOT « Catégories affichage dynamique + Marketplace 3 zones » EN PROD (merge `--no-ff` `9e1e4b0` de `feat/categories-affichage-marketplace`, 2026-06-22)
- **Affichage pur, zéro argent, zéro migration. Canal D2 / `getChannelDecision` / `isValidCategory` / capital INTOUCHÉS** (vérifié : `products.ts` valide déjà la catégorie POSTée contre la BASE, pas le figé → offrir les catégories DB dans les forms ne touche ni canal ni sécurité).
- **PARTIE 1 — CAT-AFF (lecture dynamique)** : `src/lib/categories/read.ts` enrichi (`label_fr/ar/en/icon/image_url` — colonnes déjà seedées mig 081, RLS SELECT ouverte → **0 migration**, fail-closed conservé) ; nouveau résolveur **server-only** `src/lib/categories/display.ts` (`getCategoryDisplayList`/`subcategoriesOf`) renvoyant une liste **100 % sérialisable**. Fallback **non-régressif** label `i18n→DB(locale)→slug` / icône `CATEGORY_ICONS figé→DB→📦` / image `CATEGORY_IMAGES→DB→∅` → **les 12 catégories seedées rendent pixel-identique**, une catégorie créée en admin apparaît partout (libellé/icône/image DB). Consommateurs branchés : `/affiliate/products`, `/wholesale/products`, `/wholesale/products/categories`, **forms admin (`product-form` via parents `new`+`[id]/edit`) + supplier (`submit-product-form` via `supplier/products/new`)** — Client Components alimentés par **prop sérialisable** (RÈGLE #2 ✅, legacy value préservée). **3× `CATEGORY_ICONS` unifiés** en une source canonique (`taxonomy.ts`) : `product-card-image.tsx` (prop `fallbackIcon`) + `branding.tsx` (icônes alignées canonique, volontaire 🧵/📦/🧶).
- **PARTIE 2 — UX-M2 (marketplace 3 zones)** : `wholesale/marketplace/page.tsx` refondu mobile-first — **ZONE 1 Stock Maroc** (1 hero + métriques uniques), **ZONE 2 Importer depuis** (4 pays `grid-cols-2` mobile, libellés en i18n `countryTurkey/China/Egypt/Dubai*`), **ZONE 3 Sourcing + nav catégorie grandes cartes-images + grille produit** (filtre combiné `?origin=…&category=…`). **SUPPRIMÉS** : rangée de 6 badges trust répétitifs + stats en double. **PROTÉGÉ/INTACT** : `MarketplaceProductCard` (cartes/CTA/prix), sources, `__source` server-only, routage détail. Thème noir & or conservé.
- **Vérif** : tsc 0 / build OK / **263 tests** (parité D2 8 + seed 5 + read 11 verts) / smoke **20/20** ; `@tester` runtime **PASS** mobile 390px FR/AR/EN + RTL (`dir=rtl`, 0 débordement), **22 captures `.nav-proofs/cat-marketplace/`**.
- **Note `@backend-db` (non bloquant, PRÉ-EXISTANT)** : `__source` est présent dans le payload **RSC inline** (valeur `supplier`/`internal`, **aucune donnée sensible**, jamais visible/attribut). Exclusion totale = reconstruire l'objet passé à la carte sans `__source` (passer `productUrl` calculé). À cadrer si voulu.
- **MERGÉ EN PROD `9e1e4b0` (GO Abdou).**

### ✅ EN PROD — CAT-IA-SUGGEST + permissions modulables (merge `--no-ff` `cbc1aaa`, 2026-06-22)
- **Branche `feat/cat-ia-suggest` MERGÉE dans `main` (`cbc1aaa`, poussée `origin/main`)** — 4 checks verts à chaque sous-lot, @security GO ×2, runtime @tester PASS. **Non-financier** (canal D2 / prix / capital INTOUCHÉS).
- **Migrations 083/084/085 appliquées en prod (DB)** (additives : tables + fonctions, zéro mutation de données). Backup avant push.
- **Objectif** : quand l'IA d'ingestion ne trouve AUCUNE catégorie correspondante, au lieu du seul fallback `'Autres'`, elle **PROPOSE** une nouvelle catégorie et range le produit dans une **FILE DE VALIDATION** (le produit garde `'Autres'`, **filet intouché**, jamais bloqué). Un **valideur** (permission modulable) tranche : créer la catégorie OU ranger dans une existante OU rejeter.
- **L1 — Fondation permissions modulables** (`95a823c`, **mig 083**) : table `staff_permissions` (capacité attribuable/retirable) + `staff_permission_audit` (append-only immuable) + `has_capability()` (SECURITY DEFINER, admin = toutes) + RPC `grant_/revoke_staff_permission` (admin-only, auditées) + helper `requireCapability()`. **@security GO** (aucun P0/P1). Capacité initiale `validate_categories`. Conçu pour héberger d'autres capacités (ex. `assign_sourcing_country` du lot suivant).
- **L2 — File de validation DB** (`592c8e0`, **mig 084**) : table `category_suggestions` (sidecar, idempotent 1 pending/produit) + RLS lecture = `has_capability` / insertion = service_role (ingestion) / écriture = RPC seulement + RPC `validator_create_category` (slug=label_fr, **`affiliate_allowed=false` forcé**), `validator_resolve_suggestion` (cat existante active), `validator_reject_suggestion`.
- **L3 — Branchement ingestion IA** (`8f395a0`) : champ IA `suggested_category` (tool+prompt — propose UNIQUEMENT si rien ne colle) ; `sanitizeSuggestedCategory` pur (`normalizeCategory` **INTOUCHÉ**) ; `ingest.ts` insère la suggestion (service_role, best-effort, idempotent, ne bloque jamais l'ingestion). +8 tests.
- **L4 — Panneau file de validation** (`14d788e`, **mig 085**) : `list_pending_category_suggestions()` (lecture **redacted** SECURITY DEFINER capability-gated : nom/photo/cat, zéro coût/marge/PII) ; server actions capability-gated ; page `/admin/categories/suggestions` (garde `requireCapability`→redirect) + entrée+badge sur `/admin/categories` ; i18n FR/AR/EN 34 clés + RTL.
- **L5 — Panneau permissions admin** (`14d788e`) : page `/admin/permissions` (admin-only) — toggle « Valider les catégories » **on/off en un clic, réversible** par salarié (agent) + tableau d'audit ; entrée sur `/admin/dashboard` ; i18n FR/AR/EN 32 clés + RTL. **@security GO sur l'ENSEMBLE du système de permissions** (L1+L2+L4+L5) : invariant argent/canal **étanche de bout en bout**, RPC definer gatées+`search_path` figé, RLS deny-default + insert service_role unique, double-garde (action + DB).
- **🛑 INVARIANT ARGENT/CANAL VÉRIFIÉ** : un valideur non-admin peut créer/ranger des catégories MAIS le toggle `affiliate_allowed` (canal D2) reste **RÉSERVÉ admin** (RPC `set_category_affiliate_allowed` mig 082, seul chemin). Une catégorie créée par un valideur **naît `affiliate_allowed=false`** (grossiste, fail-closed) — **confirmé runtime en DB par @tester**.
- **Runtime @tester (12/14 PASS)** : file de validation (suggestion visible, FR/AR/EN + RTL + mobile 390px 0 débordement), RANGER (`status='filed'` + `category` changée), **CRÉER (`affiliate_allowed=false` CONFIRMÉ DB)**, REJETER (`status='rejected'` + produit reste `'Autres'`), permissions toggle (`staff_permissions` + audit grant/revoke), garde d'accès (redirect sans capacité). Les 2 « FAIL » = **faux négatifs d'infra de test** (Playwright + `next start` perd la session SSR après `revalidatePath`) — les RPC sous-jacentes validées directement en DB. **Dette test** : ajouter un re-login `beforeEach` aux scénarios C/D de `e2e/cat-ia-suggest.spec.ts`. Captures : `.nav-proofs/cat-ia-suggest/` (16). Données de test nettoyées.
- **Lot suivant tracé** (`0f7c89c`) : AFFECTATION AGENTS SOURCING PAR PAYS (repose sur ces permissions modulables) — voir `FEUILLE_DE_ROUTE.md`.

### ⏳ EN ATTENTE (non urgent — à reprendre)
- **Abonnement « Entreprise » de TEST** posé sur le fournisseur `cec673db-e148-4247-9b08-06839d975142` (lignes `supplier_subscriptions` `88fcfe24…` + audit `18b6a686…`) pour débloquer le test Telegram. **À RETIRER un jour** (DELETE → retour `free`/5). Donnée de test réelle en prod, sans impact ailleurs.
- ✅ **Notif commande Telegram admin (`ADMIN_TELEGRAM_CHAT_ID` actif) = EN PROD, VALIDÉE** (2026-06-18) : Abdou reçoit sur son Telegram (`608081527`) chaque commande B2B **assignée à un fournisseur** (`notifyOrderAssigned` → `telegramSendMessage` vers `ADMIN_TELEGRAM_CHAT_ID`). Variable posée dans Vercel Production + redéployé. Testé bout-en-bout sur prod : assignation réelle (fournisseur NON lié Telegram, pour isoler le canal admin) → message reçu (« 🛒 Nouvelle commande à préparer · Réf · ville · produits ×qty », zéro PII acheteur). Données de test nettoyées. Best-effort (n'altère jamais l'assignation).
- ✅ **Notif superviseur pays (`agent_countries`) = EN PROD** (`257ae51`, merge `a6705a1`, **migration 078** appliquée, @architect + @security GO) : un **agent lié à un pays** via la table `agent_countries` (N agents/pays ET N pays/agent, RLS admin-only) est **notifié in-app** quand une commande B2B dont le **fournisseur est de ce pays** est assignée (`notifyOrderAssigned` → bloc « 3bis » isolé en try/catch, dérive `supplier.country_code` → agents `role='agent'`). **Zéro PII** (même payload `{ref,items,city,dueAt}`), **awareness seule** (RLS `wholesale_orders` non touchée), garde-fou `country_code` null → personne, best-effort total. Testé runtime (code branche vs base prod) : agent notifié sur commande pays MA, ignoré sur fournisseur sans pays, données de test nettoyées. **Telegram superviseur = Phase 2 (non construit).** Créer les liens : `scripts/link-agent-country.mjs` (UI admin = lot séparé). **Inerte** tant que fournisseurs sans `country_code` + aucun lien.
- **UI cloche notifications in-app PAS construite** : la table `notifications` existe et se remplit (LOT 6), mais **aucun composant cloche/liste** côté front pour les afficher.
- **Backfill catégories des autres produits internes** : l'ancien bug (catégorie/sous-catégorie jetées à l'upsert) est **corrigé pour les futurs** (`2ce7406`) ; les produits internes créés AVANT ont `category`/`subcategory` vides → backfill à prévoir pour le filtre par niche.

### 🏗️ GROS CHANTIERS FUTURS (gravés roadmap — NE PAS coder sans cadrage @architect/@finance)
- **Système d'abonnement/paiement automatique (Stripe)** : les 3 plans existent déjà (`free`/`professional`/`enterprise` — mig. 038) mais **l'attribution est 100 % manuelle admin** (`/admin/premium` + `assignPlan`), pas de paiement en ligne (upgrade fournisseur = lien WhatsApp placeholder). → automatiser facturation + checkout.
- **Visibilité produit par canal** (matrice produit × canal × niveau abonnement) — voir section FEATURES FUTURES.
- **Premium « accès direct fournisseur » 10K** (offre fournisseur premium à cadrer).
- **Marketplace affiliation multi-partenaires** (cœur financier 3-4 parties) — voir `FEUILLE_DE_ROUTE.md` → VISION STRATÉGIQUE.
- **Traduction IA du contenu produits** (nom + description à l'approbation).
- **Dette `factory_cost` authenticated** (branche `feat/dette-factory-cost-authenticated`, différée option C) — voir section FINANCE.

---

## Légende des statuts
- ✅ **FAIT ET EN PROD** — mergé dans `main` (+ migration appliquée si concerné)
- 📄 **DOCUMENTÉ / SPÉCIFIÉ** — décrit dans la roadmap, **pas de code**
- ⏸️ **BRANCHE NON MERGÉE** — code existant mais pas dans `main`
- ❌ **PAS FAIT** — n'existe nulle part (ni code, ni branche, ni stash)

---

## 💰 RÈGLE MÉTIER DÉFINITIVE — 2 CANAUX = 2 MODÈLES ÉCONOMIQUES SÉPARÉS
> Gravé le **2026-06-18** (décision Abdou). **Calculs DIFFÉRENTS, JAMAIS mélangés.** Toute évolution
> prix/commission respecte cette séparation. Touche l'argent → circuit `@finance` + `@security` + GO Abdou.

- **CANAL GROSSISTE** (achat de **stock réel**, le grossiste prend le risque) :
  - Calcul = **prix grossiste + PALIERS DÉGRESSIFS** quantité→prix (plus il achète, moins cher).
  - **AUCUN frais COD** (emballage / confirmation / livraison **ne le concernent pas**).
  - Champs `products` : `wholesale_tiers`, `wholesale_min_qty`. Prix lu par `wholesale_catalog_read` = MIN palier.
- **CANAL AFFILIÉ** (dropshipping / **COD**, zéro stock, zéro risque) :
  - Calcul = **capital mig 073** = coût marchandise + marge + **emballage 10 + confirmation 10 + livraison 35** ; `commission = prix_vente − capital`.
  - **AUCUN PALIER** (vente à l'unité). Les paliers sont **réservés au grossiste**.
  - **Marge plateforme > 0 OBLIGATOIRE** : « commission incluse » (marge 0) **INTERDITE en affilié** (sinon la part Mozouna devient 0 non traçable). Le « tout inclus » est réservé au grossiste.
  - Champs `products` : `factory_cost_mad`, `platform_margin_*`, `packaging_fee_mad`, `confirmation_fee_mad`, `delivery_fee_mad`, `sell_price`, `commission_amount`, `affiliate_enabled`.
- **🛑 ABSOLU** : paliers = **grossiste only** ; frais COD = **affilié only**. **JAMAIS l'un dans l'autre.**
  (Erreur à NE PAS refaire : appliquer un garde-fou « palier ≥ capital affilié » — ça mélange les 2 modèles.)
- **INTENTION BUSINESS ASSUMÉE** : le prix grossiste (achat stock) **peut être plus avantageux** que le
  dropshipping affilié → **incitation VOULUE** à acheter du stock réel. Un palier grossiste sous le capital
  affilié **n'est PAS une anomalie** (canaux séparés).
- **Vérifié dans le code (2026-06-18)** : vue grossiste `075` = zéro frais COD ; `calculateNetAffiliateCommission`
  = zéro palier ; les 2 jeux de colonnes coexistent **séparément** sur la même ligne `products`.
- **Flux de validation cible (« Finaliser un produit fournisseur/Telegram ») — NON CONSTRUIT, session dédiée** :
  fournisseur/Telegram saisit **son prix** → l'admin **coche les canaux** (grossiste et/ou affilié) → chaque canal
  coché applique **SON calcul, séparément**, sur la même ligne `products`. **À construire AVEC : branche dédiée +
  `@finance` + `@security-reviewer` + GO Abdou AVANT chaque étape. NE PAS construire maintenant.** Détail :
  `FEUILLE_DE_ROUTE.md` → « PRODUIT TELEGRAM → CATALOGUE COMPLET » (Option 1 / Option 3). Garde-fous @finance
  retenus (GO-conditionné) : **marge affilié > 0** (interdire « commission incluse » en affilié) ; **snapshot règle
  par produit + audit immuable + idempotence** ; paliers grossiste validés (prix > 0, `min_qty` croissants
  non-chevauchants, monotone décroissant). Un **grossiste-seul** n'injecte JAMAIS de `factory_cost_mad` (pas de
  commission fantôme) et les **miroirs fournisseur restent exclus** de la dérivation capital (régression
  double-marge du 2026-06-14 à ne pas rouvrir).
- **✅ DETTE ARRONDI factory_cost FX = CORRIGÉ** (`8df6d2b`, merge `0b11999`, @finance GO) :
  `factory_cost_mad` dérivé du FX = désormais **ENTIER MAD** (`Math.round(price_source × fx_rate)`), au lieu du
  fallback `purchase_price_mad` à 2 décimales (biais ½ centime « hors-ledger »). **Périmètre : futurs produits
  importés uniquement** (coût non saisi + `needsConversion`). **Existant FIGÉ** (code d'écriture admin, aucun
  recompute rétroactif — un produit ne bouge qu'à son re-save). **Capital/commission outputs INCHANGÉS** (déjà
  arrondis entier par le moteur ; écart borné |Δ factory| ≤ 0,50 MAD). Saisie manuelle du coût ≤ 2 déc. inchangée.
  Vérifié : tsc + 186 tests + build froid + smoke 20/20.

---

## 📦 RÈGLE STOCK & COMMANDE — définitive (TRANCHÉ)
> Gravé le **2026-06-18** (décision Abdou). Règle métier, vaut pour tout affichage/flux commande.

- **On ne bloque JAMAIS une commande pour cause de stock indisponible.** Si le stock n'est pas
  dispo, on livre **SUR COMMANDE** (réapprovisionnement).
- Le **blocage n'arrive qu'en cas de FORCE MAJEURE** — et dans ce cas, on **contacte le client sur
  WhatsApp** pour s'excuser.
- **Conséquence affichage** : le **hook économie grossiste** (et les paliers) affiche **TOUS les
  paliers même au-dessus du stock actuel** = **comportement VOULU** (pas un bug), car tout est
  livrable sur commande. → L'observation « paliers au-dessus du stock » (test humain du hook) est
  **résolue : c'est intentionnel**, ne pas « corriger » en masquant des paliers.

---

## 🔔 NOTIFICATIONS — cas « Deliveroo » fournisseur (TRANCHÉ)

| Feature | Statut | Commit / Branche | Preuve (fichier clé) |
|---|---|---|---|
| **Notif fournisseur LOT 6 — commande assignée → fournisseur + admin(s) (+ agent optionnel) avertis** (in-app + Telegram best-effort, zéro PII acheteur, RLS étanche own-only) | ✅ **EN PROD** | migrations **076+077** | table `notifications` + helper `src/lib/notifications/order-assigned.ts` (appelé dans `assignSupplierToOrder`) ; @security GO ; test runtime : 5 lignes créées, payload sans PII, RLS étanche, idempotent |
| Notif RFQ fournisseurs (matching sourcing) | ⚠️ Partiel (flag DB, **PULL**) | `2825927`, `29f859d` | `src/app/actions/rfq-engine.ts:250` `notifyMatchedSuppliers` = met `rfq_matches.status='notified'` + `revalidatePath`, **n'envoie sur aucun canal** |
| Envoi Telegram sortant lié à une commande | ✅ **EN PROD (LOT 6, best-effort)** | migrations 076+077 | `notifyOrderAssigned` push `telegramSendMessage` au fournisseur lié + `ADMIN_TELEGRAM_CHAT_ID` ; échec silencieux, n'altère jamais l'assignation |
| In-app infra (table `notifications`) | ✅ **EN PROD** | migrations **076+077** | table append-only, RLS read/maj own-only, insert service-role only, idempotence `(order_id,event,recipient_id)` |
| Email / SMS / push web infra | ❌ PAS FAIT | aucun | aucune lib (`resend/nodemailer/twilio/web-push/fcm`) |

> **📌 DESTINATAIRES (TÂCHE 2, à cadrer)** : essentiels **toujours notifiés** = **Abdou + le fournisseur** ; **commercial/agent pays = optionnel cochable**. Design fin des destinataires (par événement/rôle/canal) **à finaliser par Abdou**. PII acheteur masquée côté fournisseur (vues redacted). Détail : `FEUILLE_DE_ROUTE.md` → LOT 6.

> **⚠️ PIÈGE DE NOMMAGE :** « **Deliveroo** » dans le code **n'est PAS** un système de notification.
> C'est la **machine à états (FSM) des commandes B2B** (suivi de statuts, façon tracking Deliveroo) —
> voir section Wholesale/B2B. La recherche `deliveroo|notifySupplier|sendOrderNotification|lot6`
> sur **tout l'historique + toutes les branches + stash** ne révèle **aucune** implémentation de notif.

---

## 💸 FINANCE (cœur — le plus critique)

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Ledger append-only + commissions + COD Maroc | ✅ EN PROD | migrations 009+ | `src/app/actions/orders.ts`, mig. `009_cod_order_engine.sql` |
| Multi-devise (pivot MAD) — pays/devise, devis, ledger | ✅ EN PROD | `feat/etape1/2/3-*` (mergées) | mig. ledger currency, `008_delivery_fee_and_costs.sql` |
| Règle capital affilié (prix catalogue = usine+marge+emballage+conf+provision livr. 35) | ✅ EN PROD | `628d8c7` / mig. **073** | `073_affiliate_catalog_capital_rule.sql` |
| Confirmation conditionnelle (`is_pre_confirmed`) + packaging min 10 | ✅ EN PROD | `4e2127b` / mig. **074** | `074_orders_pre_confirmed_and_packaging_fix.sql` |
| Fix M-1 — `convertQuoteToOrder` facture le devis figé (fail-closed, jamais 0 MAD) | ✅ EN PROD | `6a33573` / `fix/m1-quote-conversion-price` | `src/app/actions/orders.ts` (convertQuoteToOrder) |
| Payout atomique + RLS prix/clics | ✅ EN PROD | `fix/phase2-ledger-atomic-payout` | mig. ledger / RPC |
| Audit financier E2E (5 types de commande, bouclages X=Y+Z+W) | ✅ DOC | `2fab7b5` | `AUDIT_FINANCIER_E2E.md` |
| **Dette `factory_cost` authenticated** | ⏸️ **NON MERGÉE (différée option C)** | `feat/dette-factory-cost-authenticated` | `a081622` (roadmap : chantier dédié différé) |

---

## 🛒 PRODUITS

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| CRUD produits admin (liste / création / édition) | ✅ EN PROD | — | `src/app/(admin)/admin/products/{page,new,[id]/edit}.tsx` |
| Upload image produit (compression canvas → WebP/JPEG, bucket `product-images`) | ✅ EN PROD | mig. **002** | `src/lib/product-image-upload.ts`, `src/lib/image-compress.ts` |
| **Support HEIC/HEIF (photo iPhone) à l'upload** | ✅ **FAIT ET EN PROD** | `5c54544` | `image-compress.ts` `isHeic()` + `decodeHeicToJpeg()` (heic2any, import dynamique) → conversion JPEG avant canvas ; `accept` élargi sur les 2 inputs |
| Catalogue affilié 2 niveaux (P1 fiche produit) | ✅ EN PROD | `f920834` / `feat/affiliate-catalog-detail-p1` | `src/app/(affiliate)/affiliate/products/...` |
| Vue publique products whitelistée (ferme fuite coût/marge ANON — dette 012) | ✅ EN PROD | `f748732` / mig. **072** | `072_products_public_read_view.sql` |
| **Bug « catégorie/sous-catégorie non persistée à la création/édition produit »** (le formulaire admin les saisissait mais `upsertProduct` les jetait → produits internes non filtrables) | ✅ **CORRIGÉ** | `2ce7406` | `src/app/actions/products.ts` — lecture `category`/`subcategory` du formData + ajout au payload `base` (insert+update) |

## 🏭 FOURNISSEURS

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Espace fournisseur (dashboard, products, orders, catalogs, samples, opportunities, analytics, premium) | ✅ EN PROD | — | `src/app/(supplier)/supplier/*` |
| Miroir catalogue + coût fournisseur + marge plateforme | ✅ EN PROD | mig. **068/069** | `src/lib/supplier-mirror.ts`, `069_products_supplier_mirror_link.sql` |
| Modération supplier-products (admin) | ✅ EN PROD | — | `src/app/(admin)/admin/supplier-products/*` |
| Onboarding « Pays non configuré » (flag + action admin) | ✅ EN PROD | `41ee0b9` (LOT UX-3a) / mig. 066 | `src/app/actions/users.ts` |
| Telegram — liaison compte + ingestion produits (ENTRANT) | ✅ EN PROD | mig. **053** | `src/lib/telegram/ingest.ts`, `webhook/route.ts` |
| **Bot Telegram ingestion produit EN PROD** (webhook prod, extraction IA caption, image upload Storage, produit créé en attente validation admin) | ✅ **EN PROD** | webhook re-pointé 2026-06-18 | Webhook Telegram pointe désormais sur **`https://affiliate-platform-gamma.vercel.app/api/telegram/webhook`** (plus ngrok dev). Test runtime bout-en-bout 2026-06-18 : message `608081527:13` → `telegram_inbound` status `inserted` → `supplier_products` `b6340464…` créé (« Pack 3 boxers en bambou MAWRI », Textile/Sous-vêtements, 40 MAD, stock 200, image uploadée HTTP 200, `approval_status='pending_review'`, `source='telegram'`). Secret webhook (Vercel) = `.env.local` vérifié (200/401). Barrière `checkProductLimit` active (3 canaux). 4 vars prod requises : `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`/`ANTHROPIC_API_KEY`/`TELEGRAM_BOT_USERNAME` |
| RFQ — moteur de matching automatique | ✅ EN PROD | `2825927` / mig. **037** | `src/app/actions/rfq-engine.ts` |

---

## 🤝 WHOLESALE / B2B (« Deliveroo » = FSM commande, PAS notif)

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| FSM cycle de vie commande B2B (états type Deliveroo) | ✅ EN PROD | `6fa1d23` (LOT 1) / mig. **057** | `src/lib/wholesale-fsm.ts:15` *« Cycle Deliveroo-style »* |
| Assignation commandes B2B + équipes + FSM stricte | ✅ EN PROD | `75021b5` (LOT 2) | `src/components/admin/wholesale-order-status-form.tsx` |
| Lien fournisseur + vue redacted (sans PII acheteur) | ✅ EN PROD | `896a4ad` (LOT 3a) | `wholesale_orders_supplier_read` (vue) |
| Transition de statut atomique | ✅ EN PROD | mig. **061** | `061_atomic_wholesale_status_transition.sql` |
| Paiement → collecte cash + détection E3-bis (sous-collatéral) | ✅ EN PROD | `3ff966a` (LOT 4.2-C) / mig. **065/067** | `065_wholesale_delivery_cash_rpcs.sql` |
| Affichage prix import honnête (aérien/maritime, marge selon devis) | ✅ EN PROD | `028d790` / mig. **071** | `071_supplier_quote_shipping_mode.sql` |
| **Catalogue grossiste UNIFIÉ** (2 onglets Disponible/À importer, interne+fournisseur fusionnés & cloisonnés, design noir & or) | ✅ **EN PROD** | `d379ca1` / mig. **075** | vue `wholesale_catalog_read` (`075_wholesale_catalog_read_view.sql`) ∪ `products_public_read`+`supplier_products_wholesaler_read` ; page `src/app/(wholesale)/wholesale/products/page.tsx` (`source` serveur only, @security GO, aucun coût/marge exposé) |
| **Marketplace grossiste GLOBAL** (`/wholesale/marketplace` inclut désormais les produits internes Mozouna + fournisseurs, source invisible) | ✅ **EN PROD** | `8ab5189` | additif : 2ᵉ source `wholesale_catalog_read` (source='internal') mappée en MarketplaceProduct (supplier_type='morocco', badges off) ; routage détail par discriminant `__source` SERVEUR-ONLY (interne → `/wholesale/products/[id]`). Runtime : internes présents, zéro fuite `__source`/supplier_id. Rappel : « disponible grossistes » = pas un flag (toujours activé) |
| **Filtre pays marketplace (Chine/Turquie/Égypte/Dubai) corrigé** — plantait en 500 (`origin_country` null des internes → `null.toLowerCase()`) | ✅ **EN PROD** | `c908809` | mapping interne coercé (`category`/`origin_country` ?? '') + guards `(p.x ?? '').toLowerCase()` sur filtres recherche/sous-cat/origine ; runtime 4 pays : 500→200 |
| **Thème grossiste `/wholesale/products`** (rendait en thème clair → corrigé en noir & or) | ✅ **CORRIGÉ** | `2ce7406` | wrapper `theme-dark bg-bg text-foreground min-h-screen` (`wholesale/products/page.tsx:125`, comme affilié/marketplace) |
| **Thème détail produit interne `/wholesale/products/[id]`** (rendait en thème clair → corrigé en noir & or) | ✅ **CORRIGÉ EN PROD** | `6dc0244` | wrapper `theme-dark bg-bg text-foreground min-h-screen` (`wholesale/products/[id]/page.tsx:72`, comme le détail fournisseur) |
| **Recherche grossiste `/wholesale/products` (« Pull ref 5 » = 0 résultat)** | ✅ **OK — pas un bug code** | — | prouvé runtime : Pull ref 5 = 1ʳᵉ carte de l'onglet Disponible + trouvé par le champ recherche. Le 0 venait d'un **déploiement Vercel périmé** (résolu par redeploy `6dc0244`), pas du code |
| **Message inter-onglets recherche grossiste** — quand l'onglet actif est vide mais l'autre a des résultats filtrés, lien « Aucun résultat ici — mais N produit(s) “terme” dans l'autre onglet → » (conserve recherche/filtres) | ✅ **EN PROD** | `b5251d1` | `wholesale/products/page.tsx` (réutilise localRows/importRows/tabHref) + i18n FR/AR/EN ; UI pur, aucune logique de filtre changée |

---

## 🧑‍💼 AFFILIÉS

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Catalogue affilié, liens, commissions | ✅ EN PROD | — | `src/app/(affiliate)/affiliate/*` |
| Message « Ajuste ton prix » (remplace « Non rentable ») | ✅ EN PROD | `ed520ab` | affichage affilié (FR/AR/EN) |
| **HOOK PROFIT AFFILIÉ** — simulateur gain temps réel (« Tu gagnes X/vente » = prix saisi − catalogue), prix conseillé catalogue × 1,25 (fourchette +20/+30 %) cliquable, accroche catalogue « fixe tes prix, garde la différence », phrase marge-zéro remplacée par encouragement | ✅ **EN PROD** | `ba4b2af` | `src/components/affiliate/affiliate-price-form.tsx` + `affiliate/products/{[id],}/page.tsx` ; AFFICHAGE PUR (calcul serveur commission inchangé, aucune donnée coût/marge au client) |
| **Wording affilié tout-inclus (vendeur/punchy)** — bloc « frais déduits » négatif remplacé par « 💰 Tu vends, tu encaisses. Le reste, c'est notre job. » (livraison/emballage/confirmation gérés, zéro avance) + mentions « prix tout compris » sous le prix (fiche + cartes) | ✅ **EN PROD** | `842acce` | `affiliate/products/{[id],}/page.tsx` + i18n FR/AR/EN ; AFFICHAGE PUR (frais déjà dans le capital, calcul serveur inchangé) |

---

## 🔐 AUTH & SÉCURITÉ

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Auth + rôles (admin/agent/affiliate/wholesaler/supplier) + RLS deny-default | ✅ EN PROD | mig. **001** | `src/app/(admin)/layout.tsx:23-31` (guard rôle/statut) |
| Gestion users admin (`updateUserById` via service_role) | ✅ EN PROD | — | `src/app/(admin)/admin/users/[id]/page.tsx` |
| **Page self-service « mot de passe oublié » / reset** | ❌ PAS FAIT | aucun | aucune route reset ; récupération admin = script `scripts/reset-admin-password.mjs` (hors app) |

---

## 🎨 DESIGN & i18n

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Habillage premium (thème noir & or) | ✅ EN PROD | `3ee9530` / `feat/habillage-premium` | composants UI, `b9d7973` theme-dark |
| i18n FR / AR (فصحى) / EN + RTL | ✅ EN PROD | `3ee9530` | `messages/{fr,ar,en}.json`, `next-intl` |

---

## 🗄️ STORAGE (buckets)

| Bucket | Statut | Preuve |
|---|---|---|
| `product-images` (public) + policies admin/SELECT public | ✅ EN PROD | mig. **002** |
| `supplier-product-images` (public) | ✅ EN PROD | mig. **053** |
| `order-proofs` (public) + INSERT policy | ✅ EN PROD | mig. **070** |
| `supplier-catalogs`, `supplier-attachments`, `sample-files` (private) | ✅ EN PROD | mig. **036** |

---

## 🚀 FEATURES FUTURES / MONÉTISATION (à concevoir — NE PAS coder maintenant)

| Feature | Statut | Détail |
|---|---|---|
| **Contrôle de visibilité produit par canal** (idée stratégique Abdou) | 📄 DOCUMENTÉ — feature future | Boutons activer/désactiver l'affichage d'un produit **par canal** (catalogue affilié, catalogue grossiste, marketplace, vitrine publique). Aujourd'hui binaire (`affiliate_enabled` + grossiste toujours visible si actif). **Leviers** : (1) contrôle fin Abdou ; (2) **exclusivité** sellers/grossistes (protection concurrence interne) ; (3) **monétisation** — « visible partout » = feature **PREMIUM** payante par abonnement ; (4) distinguer les niveaux d'abonnement. **Nature** : conception d'une matrice **produit × canal × niveau d'abonnement**, à cadrer avec `@architect`. Pertinent à l'**ouverture publique + abonnements (Sprint 4+)**. Détail complet : `FEUILLE_DE_ROUTE.md` → SECTION VIS-CANAL. **À NE PAS construire maintenant** (Sprint 2 = vrais produits). |

---

## 🛟 SÉCURITÉ / BACKUP

- **CODE** : tout est sur **GitHub** (`origin`). `main` = prod. Branches de travail poussées (y compris `feat/dette-factory-cost-authenticated`, sauvegardée à distance).
- **BASE Supabase** (plan gratuit = **aucun backup auto** → critique) : dump complet schéma + données via le **CLI Supabase**, dans `~/AI-FACTORY/backups/` (fichiers datés `prod_backup_<date>.sql` + `_data.sql`).
- **Refaire un backup manuellement** : `bash ~/AI-FACTORY/backups/backup-prod.sh`
- **Backup hebdo automatique** : LaunchAgent macOS `com.mozouna.backup-prod` (lundi 9h) → `~/Library/LaunchAgents/com.mozouna.backup-prod.plist`, logs dans `~/AI-FACTORY/backups/backup.log`. (cron classique bloqué par macOS « Operation not permitted » → launchd à la place.)
  - Vérifier : `launchctl list | grep mozouna` · Désactiver : `launchctl unload ~/Library/LaunchAgents/com.mozouna.backup-prod.plist`
- **ROUTINE** : backup **AVANT chaque migration** (`supabase db push`) + **1×/semaine** (auto) + avant tout backfill de données. Copier `~/AI-FACTORY/backups/` **hors du PC** régulièrement.

---

## ⏸️ BRANCHES NON MERGÉES (état git au 2026-06-22)
- `feat/dette-factory-cost-authenticated` — chantier **différé (option C)**, pas dans `main` mais **poussé sur `origin`** (sauvegardé).
- *(`feat/cat-ia-suggest` MERGÉE `cbc1aaa` 2026-06-22 — CAT-IA-SUGGEST + permissions modulables EN PROD, voir section dédiée plus haut.)*

> Toutes les autres `feat/*` et `fix/*` listées par `git branch --merged main` sont **mergées et en prod**.
