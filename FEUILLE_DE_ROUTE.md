# FEUILLE DE ROUTE — Finir le SaaS d'affiliation comme un pro

**Principe :** une phase à la fois. Chaque phase finit par un checkpoint où **tu valides** avant de passer à la suite. On ne reconstruit jamais ce qui marche.

---

# 🔴 PROCHAINE SESSION — PRIORITÉS ABDOU
> Liste de tête à attaquer en début de prochaine session. Ordre = priorité décroissante.
> Chaque point : `@architect` plan d'abord → validation Abdou → implémentation. **Rien n'est codé ici.**

## === RETOURS TEST PROD MOBILE (15/06) — à traiter ===
> Retours d'Abdou après test de la prod sur mobile (Vercel). Ordre = ordre de saisie, pas
> de priorité figée. Aucune correction lancée — on cadrera l'ampleur de chaque point APRÈS.

1. **[FAIT 15/06]** Erreur serveur `/wholesale/marketplace/[id]` (digest `3098525211`) corrigée,
   mergée dans `main` (`894fa06`), déployée en prod.
2. **[RÈGLE MÉTIER]** Maroc : quantité ≤ stock → commande directe ; quantité > stock → devis /
   confirmation équipe (sur-commande, **jamais « pas disponible »**). Import (Chine / Turquie /
   Égypte / Dubai) : toujours devis + mention « transport calculé après, variable ». Supprimer la
   contradiction UI (bloc « Commander » + message rouge affichés ensemble).
3. **[PRIX]** Prix = fournisseur + commission, **hors cargo**, mention « hors transport ». Vérifier
   cohérence prix fiche ↔ panier.
4. **[i18n]** Sélecteur type d'activité (Boutique physique / Instagram-Facebook / E-commerce /
   Importateur) reste en français en arabe → traduire.
5. **[UX]** « Stock local Maroc » trompeur → reformuler.
6. **[MOBILE]** Images + organisation à hisser au standard SaaS international (90 % trafic mobile).

## 🧭 ORDRE DE REPRISE (figé avec Abdou, session 2026-06-12)
> Reprendre EXACTEMENT dans cet ordre. On ne saute pas d'étape. La branche
> `feat/habillage-premium` est à jour et poussée ; **toute la DETTE UX est résorbée**
> (cf. section dédiée plus bas). La PR vers `main` n'est PAS faite — volontairement.

1. **Lot 4.2-B / 4.2-C / 4.2-D, puis Lot 4.3 (UI)** — finir le Lot 4 (moteur cash
   livraison commencé en 4.2-A). 4.3 = la couche UI. Démarrer session fraîche,
   `@architect` plan d'abord. ⚠️ Lots 4.2 = **financiers** → circuit `@finance` +
   `@security-reviewer` + validation Abdou avant chaque commit.
   ✅✅ **LOT 4 COMPLET** (session 2026-06-13) : 4.2-B / fix money / 4.2-C / **4.3 UI** tous faits + audités GO. Migrations jusqu'à `067`. **Prochain = point 2 (purge money) puis staging.**
2. 🔴 **CHANTIER MONEY — purge `parseFloat` sur l'argent** (objectif Abdou « **zéro parseFloat sur l'argent nulle part** »). Découverte : surface bien plus large que les 7 sites d'`orders.ts` (~12 fichiers). Stratégie tranchée : **(A)** input → `parseMoneyInput` (string verbatim) ; **(B)** calcul → **centimes entiers** `Math.round(x*100)*qty/100` (validé @finance) ; **(C)** taux FX & marges % → helpers séparés `parseRateInput`/`parsePercentInput`, **lots dédiés distincts** (money.ts les corromprait) ; **(D)** preview client → dernier lot, sans @finance.
   - ✅ **FAIT + audité @finance GO + poussé** (session 2026-06-13) : **M1** `createAffiliateOrder` (`3ab61a0`), **M2-M4** `placeOrder`/`createWholesaleOrderFromCart`/`submitWholesaleOrder`/`updateWholesaleOrderCosts` (`76e8d3f`), **M-commission** `calculateNetAffiliateCommission` half-up (`5e75999`), **M5** `cities.ts`/`logistics.ts` frais config (`62a2387`), **M6** `tariffs.ts`/`affiliate-prices.ts` (`405cf45`). → `orders.ts` + `utils.ts` + `cities`/`logistics`/`tariffs`/`affiliate-prices` = **zéro parseFloat sur argent**.
   - ✅ **M7a + M7b FAIT + audité @finance GO par site** (session 2026-06-14) : **M7a** `supplier-products.ts` `tier_${i}_price`→`unit_price_usd` (`3d79ad9`) ; **M7b** `supplier-payout.ts` `supplier_cost_mad` + `quote-requests.ts` `quoted_transport_total_mad` (`5d9f5db`). 3 sites stockage-seul, valeur bit-identique pour saisie valide ≤2 déc., aucun calcul changé. **Sites déférés confirmés** : `supplier-products` `price_source` (85, FX) + `platform_margin_value` (184, %), `supplier-payout` `platform_commission_value` (%) + `transport_customs_cost_mad` (nourrit `payoutAmount`), `quote-requests` `sourceUnitPrice`/`fxOverride`/`unitPriceMad`/`subtotal`/`merchandiseSourceAmount` (FX/calcul) → lots FX/%.
   - 🔭 **Dette hors périmètre repérée** : `lib/bulk-import.ts:39` (`parseFloat` sur `unit_price_usd` import CSV/Telegram) — non listée dans M5-M8, à ajouter au backlog money.
   - ✅ **M-products montants simples FAIT + audité @finance GO par site** (session 2026-06-14, **Option C tranchée avec Abdou**) : `products.ts` `sell_price` + `factory_cost_mad` explicite + `estimated_import_price_mad` via `parseMoneyInput` (`5fdd1a5`). `sell_price`/`factory_cost` nourrissent la commission préview via `Number(chaîne validée)` = bit-identique à l'ancien `parseFloat` → `commission_amount` inchangé pour saisie valide (certifié @finance : `Number(s)===parseFloat(s)` ∀ s ∈ regex money). Saisie invalide → erreur/null (durcissement). **Ligne FX GELÉE** (`purchase_price_mad = parseFloat((purchase_price × taux).toFixed(2))`, ligne 124) avec commentaire explicite.
     - **🔵 DÉCISION REPORTÉE AU LOT FX — bascule half-up de `factory_cost_mad`** : aligner la ligne 124 sur `Math.round(×100)/100` (au lieu de `toFixed`) changerait `factory_cost_mad` de **+1 ct max** et la commission préview de **−2 ct max**, sur **~0,3 %** des produits importés (ceux tombant pile sur une demi-centime), **au prochain re-save uniquement** (passé figé, aucun trigger DB). À trancher au lot FX **avec `@finance` + GO explicite Abdou**, en même temps que `parseRateInput` (le taux lui-même est un float à fiabiliser). Convention cible = half-up (cohérence M-commission + relevé d'audit PDF).
     - **🔭 Dette restante dans `products.ts`** : fees `confirmation_fee_mad`/`packaging_fee_mad`/`delivery_fee_mad` (108-110, montants A simples qui nourrissent aussi la commission) restent en `parseFloat` — non inclus dans les « 3 montants simples » de ce lot, à purger en suivant (même pattern `Number(chaîne validée)`).
   - ✅ **LOT FX/% + COD FAIT + audité @finance GO (session 2026-06-14, décisions Abdou : half-up GO, taux 8 déc natif, % 0–100, COD parseMoneyInput serveur)** :
     - Nouveau **`src/lib/rate.ts`** (`parseRateInput` ≤8 déc >0 / `parsePercentInput` 0–100) + `tests/rate.test.ts` (9 tests). **FX-1** saisie taux (`fx` actions, products override, quote fxOverride) + lectures taux DB commentées (`77e6690`). **FX-2/3** marges %/fees/price_source + **conversion FX half-up** products/supplier (`5fad423`). **FX-4** quote-requests conversions half-up + subtotal/merchandise NO-OP (`2e74fc5`). **R1** codReceived COD validé serveur (`429df1c`). **R2** preview product-form miroir serveur (`9518053`).
     - **Half-up appliqué** (GO Abdou + avant/après) : products `purchase_price_mad`, quote `unitPriceMad` = `Math.round(×100)/100` ; écart borné **+1 ct max / ~0,1 % / nouveaux-resaves only** (snapshots figés jamais re-convertis). `subtotal`/`merchandise` = NO-OP confirmé @finance.
     - ✅ **GATE marge >100 % — LEVÉ (2026-06-14)** : balayage DB exécuté → **0 produit** (affilié ET fournisseur) avec marge `percentage` > 100. La borne 0–100 ne casse aucune fiche existante. Aucune action requise.
   - ✅ **3 VERROUS PRÉ-STAGING — FAITS (2026-06-14)** :
     - ✅ **`wholesale_tiers` — validation SERVEUR (`8c9c088`, @finance + @security GO)** : `products.ts` filtre désormais chaque palier (min_qty entier ≥1, price fini >0 ≤2 déc, max 20 paliers, tri + rejet chevauchements) — le prix client n'est plus jamais cru. Fallback paliers vidés → `sell_price` serveur. 🔭 Suivi non bloquant : audit ponctuel des `wholesale_tiers` HÉRITÉS (écrits avant ce correctif, non rétro-validés).
     - ✅ **piège 0→défaut — corrigé (`8c9c088`, @finance GO)** : marge affilié & fees conservent un 0 explicite (vente au coût / frais 0) ; seul le champ vide → défaut.
     - ✅ **GATE marge >100 %** — voir ci-dessus.
     - **🔭 `admin/quote-requests/[id]/page.tsx:68`** `parseFloat(r.rate_vs_mad)` = lecture taux DB (déjà commentée comme non-violation, cf. `fx.ts`) — RAS, no-op.
     - **🔵 R2 résiduel (affichage, hors money)** : le preview commission product-form utilise la livraison saisie ; le serveur utilise le plancher logistique. Câbler le plancher via prop pour un miroir 100 % exact.
   - ⚠️ Chaque lot money = `@finance` par site, validation Abdou si un calcul **change de résultat**. Cf. [[project-money-no-parsefloat]].
   ▶️ **PURGE MONEY COMPLÈTE + 3 verrous levés + chantier marge fournisseur (Option B) fait.** Reste avant staging : pousser `8c9c088`. Suivis non bloquants : audit tiers hérités, `bulkApproveProducts` (toggle marge), product-form `rowToTier` (parseFloat client résiduel, prix désormais re-validé serveur donc inoffensif).
2bis. ✅ **CHANTIER MARGE PLATEFORME FOURNISSEUR — FAIT (Option B), session 2026-06-14, @finance+@security GO**
   > Né de l'audit « moteur de bénéfice ». 🧭 **CLARIFICATION D'ARCHITECTURE MAJEURE (à retenir absolument)** : l'achat direct marketplace **route par le MIROIR CATALOGUE interne** (`addMarketplaceToCart` stocke `product_id = catalogProduct.id` ; le checkout `createWholesaleOrderFromCart` tarife sur `item.product` = produit catalogue via ses tiers/sell_price). **Le miroir catalogue capte DÉJÀ la marge Mozouna sur le direct.** Donc les **2 vraies sources de marge** sont : **(1) produit catalogue** (achat direct) + **(2) `platform_commission_value`** (devis/sourcing). La « marge fournisseur » `platform_margin_value` serait un **doublon** au niveau du prix facturé.
   - **DÉCISION ABDOU = Option B** : la marge fournisseur (`platform_margin_value` + toggle `apply_platform_margin`) = **AFFICHAGE VITRINE marketplace UNIQUEMENT, jamais le prix facturé**. Le prix facturé en direct vient TOUJOURS du produit catalogue. ❌ **Lot 4 (snapshot panier) ANNULÉ** (dangereux : détruirait les tiers catalogue + double-marge).
   - **FAIT** : **Lot 1** défaut marge affilié 30→20 (`ecbd1f8`, non rétroactif). **Lot 2** `applyPlatformMargin` pure + tests (`6bf033f`). **Lot 3** migration 068 (toggle `apply_platform_margin` OFF défaut + `final_wholesale_price_mad` backfill=identité) + vue acheteur expose `COALESCE(final, suggested)` + écriture à l'approbation (`d4f0666`, migration appliquée, @finance+@security GO). **Lot 5** UI toggle « marge d'affichage vitrine » (défaut 15%, %/fixe) + libellé explicite « le prix facturé en direct vient du produit catalogue » + i18n FR/AR/EN.
   - **Inerte par défaut** : toggle OFF partout ⇒ `final = suggested` ⇒ aucun prix affiché ne change tant qu'un admin ne l'active pas produit par produit (et même activé, ça ne change QUE l'affichage vitrine, pas le facturé).
   - 🔭 **Lacune de suivi** : `bulkApproveProducts` n'écrit pas le toggle/final (approbation en masse) → marge vitrine non posée par ce chemin. Lot ultérieur si besoin.
   - ✅ **DÉCISION FIGÉE (2026-06-14) — « marge par client » NON nécessaire, NE PAS reconstruire** : pour Abdou, « client » = **partenaires** (affilié + fournisseur), pas le consommateur. Ses 2 leviers de marge sont **déjà en place et suffisent** : (1) **affilié** = `products.platform_margin_value` (vrai levier, déduit dans la commission, snapshot) ; (2) **fournisseur direct** = **prix du MIROIR catalogue** (`products.wholesale_tiers`/`sell_price` que l'admin fixe = coût fournisseur + sa marge, contrôle total même si le fournisseur ne laisse rien) — le toggle `apply_platform_margin` n'est QUE la vitrine ; (3) **devis** = `platform_commission_value`. → **AUCUNE marge par couple (partenaire, produit) à construire.** Aucun chantier ouvert sur ce sujet.

3. **Déploiement staging Vercel** — SEULEMENT une fois le Lot 4 complet **ET** la purge money COMPLÈTE (M5-M8 + FX/%). URL fixe, build prod, auto-deploy sur push.
4. **PR vers `main`** — SEULEMENT après Lot 4 complet, purge money complète **ET** staging en ligne. C'est
   le dernier geste : on ne merge pas avant d'avoir vu tourner en staging.

## ✅ DÉPLOIEMENT VERCEL — **FAIT (14/06/2026)**
> **L'app est EN LIGNE sur une URL fixe, build de PRODUCTION, auto-déployée à chaque push.**
- **Déployé en PRODUCTION sur Vercel le 14/06/2026**, depuis **`main`** (merge `fb644ab`).
- **URL officielle** : **https://affiliate-platform-gamma.vercel.app**
- **18 variables d'environnement** configurées (publiques + secrètes ; aucun secret `service_role` côté client).
- **Auto-deploy sur push `main` ACTIF** (Production Branch = `main`).
- **Version mobile responsive vérifiée OK.**
- `vercel.json` durci ce tour-ci : framework nextjs, région cdg1, **headers de sécurité de base** (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy). CSP volontairement non incluse (à tester à part).
> ⚠️ **EN LIGNE ≠ DURCI POUR LE GRAND PUBLIC** → voir le bloc « GO-LIVE PUBLIC » ci-dessous avant d'ouvrir à de vrais clients.

## === GO-LIVE PUBLIC — checklist avant vrais clients ===
> Le SaaS est **en ligne** (Vercel prod), mais **PAS encore durci** pour une ouverture au grand public.
> Liste **DANS L'ORDRE de priorité** de ce qui reste à régler. ⚠️ **On NE recopie PAS les dettes** :
> chaque point **RÉFÉRENCE** sa fiche détaillée déjà notée en **SECTION 3** ou **PHASE 5**.

1. **Retirer les secrets / comptes de test** — mots de passe `SMOKE_*`/démo en clair + **authtoken ngrok à régénérer**. → cf. **SECTION 3 « MÉNAGE TEST »** (≈ L535-539).
2. **Sécurité RLS — `factory_cost_mad` exposé à `anon`** (migr. 012) → vue/colonne masquée. → cf. **SECTION 3** (≈ L528).
3. **Rate-limiting sur `placeOrder`** (flux **public COD**, exposé à l'abus). → cf. **SECTION 3** (≈ L529).
4. **Durcir la confiance `metadata.role` au signup** (rôle non auto-déclarable). → cf. **SECTION 3** (≈ L534).
5. **Signatures webhooks + logs d'audit** (durcissement final). → cf. **PHASE 5 — Durcissement & mise en ligne** (≈ L338).
6. **Idempotence + reporting de l'import CSV** (`publishBulkImport` : doublons au retry + échecs silencieux). → cf. **SECTION 3** (≈ L532-533).
7. *(Optionnel, plus tard)* **Nom de domaine perso** + **optimisation images** quand le catalogue devient volumineux.

> **Note** : chantiers à traiter **UN par UN, jamais en parallèle**. **Le SaaS est en ligne mais PAS encore durci pour le grand public.**

## 🧹 DETTE UX — parcours incomplets (murs sans issue, contradictions, features à moitié branchées)
> Audit `@architect` lancé en supervision (2026-06-12) sur les 4 rôles. **But : ne plus découvrir ces bugs un par un en test visuel.**
> Pattern chassé : l'UI propose une action (bouton/CTA/form) que la server action correspondante rejette, OU un message d'erreur affiché comme état permanent sans porte de sortie.
> Format : `[Pxx] Titre` — Rôle. `Fichier`. Symptôme → cause racine → correctif. **Toujours `@architect` plan d'abord pour les non triviaux.**

### ✅ TOUTE LA DETTE UX recensée a été corrigée (session 2026-06-12, branche `feat/habillage-premium`)
- **[P0] Crash upload justificatif >1 Mo** — Grossiste. `next.config.ts`, `wholesale-proof-form.tsx`. La form promettait « max 10 Mo » mais `serverActions.bodySizeLimit` Next valait 1 Mo → crash sur photo de téléphone. **Fix LOT UX-1** : bodySizeLimit 12 Mo + compression image client (canvas) + garde de taille + message i18n.
- **[P0] Contradiction stock / commande directe** — Grossiste. `marketplace/[id]/page.tsx`, `marketplace/page.tsx`, `cart.ts`. CTA « Commander » affiché d'après le stock fournisseur, mais le panier exigeait un miroir catalogue `products` absent → « pas encore disponible ». **Fix LOT UX-2** : helper unique `lib/wholesale-catalog-link.ts` partagé page+action ; CTA → 'rfq' sans miroir ; seuils réels affichés. **@security : GO.**
- **[P0] Mur « Pays non configuré » sans issue** — Fournisseur. `supplier/products/new`, `users.ts`, migration 066. Fournisseurs pré-054 sans `country_code`, pays figé admin-only, aucune notif. **Fix LOT UX-3a/3b** : flag `country_setup_requested`, action admin `setSupplierCountry`, mur → demande actionnable, surface admin « Fournisseurs sans pays ». **@security : GO.**
- **[P1] Fournisseur « no_rate » silencieux** — Fournisseur/Admin. `lib/supplier-pricing.ts` (`isAwaitingFxRate`), `supplier/products`, `admin/supplier-products`. Devise étrangère sans taux FX → prix MAD NULL (« Sur devis ») sans feedback. **Fix : surfaçage PUR** (zéro calcul) — badge fournisseur « prix en attente de taux {devise} » + bandeau admin groupé par devise, condition canonique validée @finance, 6 tests. **Circuit @finance complet : GO. @security : GO.** Décision @finance : **pas de re-conversion rétroactive** (snapshot = invariant), reste « Sur devis » jusqu'à re-soumission.
- **[P1] `addToCart` accepte un `import_on_demand`** — Grossiste. `actions/cart.ts`. L'UI gate déjà, mais l'action serveur ne rejetait pas → injection panier possible par appel direct, bloquée seulement au checkout. **Fix** : garde de défense en profondeur `availability_type === 'local_stock'` alignée sur `addMarketplaceToCart` et la soumission.
- **[P1] État vide « Opportunités RFQ » sans CTA** — Fournisseur. `supplier/opportunities/page.tsx`. **Fix** : sans profil de matching, l'état vide explique le lien profil→matches + CTA ancré vers le formulaire (présent sur la même page).
- **[P2] Compte grossiste : Ville/Téléphone non renseignables** — Grossiste. `wholesale/account`, `billing-form.tsx`, `actions/profile.ts`. **Fix** : phone (validé E.164) + city ajoutés au formulaire (section Coordonnées & facturation) ; résumé lecture seule réduit à l'identité.
- **[P2] Bloc Telegram absent du dashboard fournisseur** — Fournisseur. `supplier/dashboard`. **Fix (décision Abdou)** : `TelegramLinkCard` ajouté en tête du dashboard (canal principal des fournisseurs peu tech), pas seulement sur `/supplier/products`.
- **[P2] i18n en dur à l'inscription fournisseur** — Auth. `signup-form.tsx`. **Fix** : champ Pays câblé sur `auth.signup.country*` FR/AR/EN.

> **Aucune dette UX ouverte connue à ce jour.** Toute nouvelle occurrence (même pattern) à ajouter ici sous `### ⏳ À traiter` avant correction.

## ✅ BLOQUEUR P0 — RÉGRESSIONS DESIGN — **RÉSOLU** (session 2026-06-12)
**Le chantier design (lots 3x) a CASSÉ des pages qui marchaient avant**, non détecté par les tests.
1. ✅ **`/wholesale/marketplace/[id]`** — `stockAvailable` passé **comme fonction** à un Client
   Component (`MarketplaceDirectOrderForm`) → `Functions cannot be passed directly to Client
   Components`. **Corrigé** : string pré-résolue côté serveur (les args sont connus au rendu),
   type de prop passé de `(c,u)=>string` à `string`. Fichiers :
   `src/app/(wholesale)/wholesale/marketplace/[id]/page.tsx`,
   `src/components/wholesale/marketplace-direct-order-form.tsx`.
2. ✅ **Audit de la même classe de bug** (`=> t(` dans des props) sur tout `src/app` :
   - `affiliate/products/page.tsx` (`stockUnits`, `priceVsCatalog`) : **investigué, PAS une
     régression** — fonctions consommées uniquement côté serveur, ne traversent aucune frontière
     client (`AffiliatePriceForm`/`CopyLinkButton` ne reçoivent que des strings). Laissé tel quel
     (Règle d'Or n°1).
   - `admin/cities|logistics|import-tariffs` (`t.rich(..., strong: c=>...)`) : **OK**, rendu
     server-side, pas de frontière. Non touché.
   - `tsc --noEmit` **0 erreur** + `next build` **OK** sur tout le projet.
3. ✅ **Le trou « 115 tests ne voient pas le rendu » est bouché** → smoke tests Playwright (voir
   ci-dessous). Test négatif effectué : réinjection temporaire d'une fonction-prop sur `/` →
   l'erreur exacte est bien produite et détectable, puis retirée.

### 🛡️ BLINDAGE QUALITÉ installé (pour que ça ne se reproduise JAMAIS)
- **CLAUDE.md › « 🛑 RÈGLES ABSOLUES »** (en tête) : design = styles only ; jamais de
  fonction/objet-callback à un Client Component ; interdit de commit sans tsc+build+tests+smoke ;
  lots de 3-4 pages max. **+ « 💸 DISCIPLINE TOKENS »**.
- **Hooks husky** : `pre-commit` (tsc + vitest) bloque physiquement ; `pre-push` (tsc + build +
  smoke si creds). Ne jamais `--no-verify`.
- **Smoke Playwright** (`e2e/`, `pnpm smoke`) : chaque route principale doit se RENDRE sans erreur
  (status, pageerror, overlay). Tourne contre un **build de PRODUCTION** (`next build && next start`),
  **pas `next dev`** : sous dev, la compilation à froid parallèle crée des faux positifs transitoires
  (« No intl context found »). Comptes démo dans `.env.local` (4 rôles, voir `.env.local.example`).
  **Résultat : 19/19 routes vertes en prod** (3 publiques + affilié/grossiste/fournisseur/admin).
  - 🔎 *Diagnostic 2026-06-12* : l'erreur « No intl context found » vue sous `next dev` était un
    **artefact dev** (course de compilation), **PAS** un bug — confirmé par curl authentifié (FR/EN/AR)
    et build prod (0 erreur). Le `NextIntlClientProvider` racine couvre bien toutes les routes.
- **CI GitHub Actions** (`.github/workflows/ci.yml`, lite) : typecheck + vitest + build à chaque
  push/PR (pnpm 9 + Node 20, sans secret DB).

> ✅ `.env.local` renseigné (4 rôles, comptes démo `*@affipartner.ma`, gitignored) → smoke des
> routes protégées **actif** : **19/19 routes vertes en prod**.

### 📓 Journal session 2026-06-12 (branche `feat/habillage-premium` — commits LOCAUX, pas encore poussés)
> ⏳ Push en attente : le token GitHub a besoin du scope `workflow` (à cause de `ci.yml`). Pre-push déjà validé (tsc+build+smoke verts).
- `8577c12` fix P0 `stockAvailable` (fonction → Client Component) sur `/wholesale/marketplace/[id]`.
- `9a227ee` blindage : RÈGLES ABSOLUES + DISCIPLINE TOKENS (CLAUDE.md), husky pre-commit/pre-push,
  smoke Playwright (`e2e/`), CI GitHub Actions lite.
- `92c12c5` smoke contre **build prod** (`next start`) au lieu de `next dev` → fin des faux positifs.
- `97f9734` CLAUDE.md : section **AUTONOMIE DE DÉCISION**.
- **Décisions prises seul** (hors argent/sécurité) : smoke auth via comptes `.env.local` ; CI lite
  (sans secret DB) ; pre-commit = tsc+vitest ; comptes démo affilié/grossiste créés (données factices).
- **Diagnostic** : « No intl context found » sous `next dev` = artefact de compilation dev, **pas un
  bug** (prouvé en prod). Aucun fichier app à corriger côté i18n.

## ⭐ PRIORITÉ N°1 — Gestion des commandes style Deliveroo (B2B) — **EN COURS** (session 2026-06-12)

> ▶️ **REPRISE PROCHAINE SESSION (FRAÎCHE) = LOT 4.2-B/C/D puis 4.3** (le raccord cash mérite un contexte propre). Détail + conditions @finance dans la sous-section LOT 4 plus bas. **PUIS** : 🚀 CHANTIER STAGING Vercel (en tête de ce fichier). **Migrations appliquées jusqu'à `065`.**
> - **LOT 4 en cours** : ✅ **4.1** (fondation DB : colonnes + CHECK garde-fou + ledger dédié + vue redacted acheteur, migrations `062`/`063`/`064`) **poussé** ; ✅ **4.2-A** (moteur cash : 3 RPC config/collecte/garde `delivered`, migration `065`, audits @finance+@security GO, vérif empirique 18/18) **commité+poussé**. **RESTE** : **4.2-B** (helper zod `money.ts` + action `setWholesaleDeliveryConfig`, uuid neuf/soumission) → **4.2-C** (raccord `updateWholesalePaymentStatus`→`try_collect`, non-fatal/rejouable + alerte E3-bis) → **4.2-D** (i18n `errors.*` FR/AR/EN) → **4.3** (UI form 3 cas, admin seul, i18n). Chaque sous-lot : audit `@finance`+`@security`, 4 checks, `db push`.
> - **✅ LOT 3 COMPLET (a+b+c)** : Lots 1, 2 (Deliveroo) + Transport T0→T3:b ; Lot 3a (DB lien fournisseur + fix sécu `060`) ; Lot 3b (UI + IMP-2) ; Lot 3c (IMP-3 atomicité, `061`) — tous **poussés**, audits `@security` GO. IMP-1/IMP-2/IMP-3 = **tous résolus**.
**LE chantier à attaquer en premier.** Déjà détaillé en **SECTION 2bis-A** (plus bas) — s'y référer.
- Les commandes qui **arrivent** dans le SaaS → **état / statut** clair (reçue → assignée → confirmée fournisseur → en préparation → prête → ramassée/expédiée → livrée).
- **Notifications multi-rôles** (fournisseur, admin/superviseur, owner).
- **Intégrer la saisie des devis** pour les **sur-commandes** (raccord au flux devis existant `quote_requests` / `supplier_quote_requests`).
- ⚠️ **AVANT tout code : audit de l'existant** (`wholesale_orders` : statuts, timestamps, RLS déjà présents ?). Touche aux **rôles/permissions** → **audit @security RLS** ; tout ce qui touche commission/marge → **audit @finance**. **Ne rien reconstruire sans audit.**

### ✅ AUDIT @architect fait (session 2026-06-12) — 3 trous structurants identifiés
1. `wholesale_orders.agent_id` **existe mais jamais écrit** → aucune assignation réelle.
2. **Aucune infra de notification** (0 table, 0 worker) → tout à créer.
3. **Pas de FSM** sur `status` (sauts d'état libres) + **aucun lien commande→fournisseur** → réponse fournisseur dispo/délai impossible.
- 3 axes de statut existants conservés : `status` / `import_status` / `payment_status`. Trigger marge `compute_wholesale_order_costs` = **INTANGIBLE**. Conversion devis→commande OK (`quote-requests.ts:270-309`).

### 🧭 DÉCISIONS ABDOU (session 2026-06-12)
- **Rôles d'équipe = table `team_members` dédiée** (owner → superviseurs/membres, permissions granulaires cochables). [1:a]
- **États cycle = liste complète** `pending → assigned → supplier_confirmed → preparing → ready → picked_up/dispatched → delivered`, `cancelled` à part ; **`blocked`/`delayed` = FLAGS** (`blocked_at`/`due_at`) pour signal rouge, hors FSM. [2:oui]
- **Notifications = In-app (socle) + Telegram** (fournisseurs pas tech).
- *(Décidé seul, hors argent/sécurité — @architect recommandé)* : réponse fournisseur = colonnes dédiées + `supplier_id` sur la commande (1 fournisseur principal) ; **FSM stricte** côté serveur (transitions illégales bloquées) ; logistique = `logistics_mode` enum simple (`pickup_by_runner`/`supplier_fleet`), pas de nouveau rôle profil.

### 📦 PLAN PAR LOTS (petits, ordonnés ; aucun lot ne touche commission/marge)
- **LOT 1** ✅ **FAIT** — DB fondateur, SANS argent : migration `057` (CHECK `status` additif rétro-compat + table `wholesale_order_status_history` append-only + RLS deny + colonnes flags `assigned_at`/`due_at`/`blocked_at`/`blocked_reason`) + types TS + `TRANSITIONS` front étendu (permissif, serveur = autorité au L2). **4 checks verts** (tsc 0 / build / 115 tests / smoke 19/19). Audit `@security` = **GO** (0 critique). ⚠️ **Migration NON appliquée en base** (attente GO Abdou).
  - 🎫 **Conditions de sortie BLOQUANTES pour le LOT 2** (findings @security I-1/I-2/M-1) : (1) lier RLS `agent_insert`/`agent_read` de l'historique à la commande affectée (`agent_id`/`team_members`) ; (2) **FSM stricte côté serveur** dans `updateWholesaleOrderStatus` (`orders.ts:733-807`) — rejeter transitions illégales + blocage des états terminaux `delivered`/`cancelled`. (M-2 cosmétique : renommer policy `agent_read_insert_status_history` → `agent_read_status_history`.)
- **LOT 2** ✅ **FAIT** — Assignation. Migration `058` (appliquée en base) : table `team_members` (owner→membres, `permissions jsonb`) + RLS deny (membre ne peut PAS s'auto-accorder de droits) + helper `can_assign_orders` (SECURITY DEFINER) ; **durcissement RLS historique** lié à `agent_id` (I-1/I-2 ✅) + renommage policy (M-2 ✅) ; policy queue `pending` pour membres. Action `assignWholesaleOrder` (double garde rôle + `can_assign_orders`) + **FSM stricte** déportée dans `src/lib/wholesale-fsm.ts` (M-1 ✅, `updateWholesaleOrderStatus` rejette transitions illégales + états terminaux). UI : sélecteur d'assignation (`wholesale-order-assign-form.tsx`) + chargement membres côté serveur. i18n FR/AR/EN : namespace `errors` (10 clés) + `admin.wholesaleAssign` + 6 labels statut (parité 2657/langue). **4 checks verts** (tsc 0 / build / 115 tests / smoke 19/19). Audit `@security` = **GO** (0 critique).
  - 🐞 *Régression évitée au passage* : l'export d'une **const objet** (`WHOLESALE_ORDER_FSM`) depuis un fichier `'use server'` cassait `next build` (invisible pour `tsc`) → FSM déportée dans `@/lib/wholesale-fsm.ts`. **Leçon** : un fichier server action n'exporte QUE des fonctions async.
  - ✅ **Findings @security corrigés AVANT commit** : IMP-1 (assignee restreint à `agent`/`admin` — sinon héritage d'accès commande + PII livraison), MIN-2 (note d'historique : plus de texte FR en dur ni d'UUID brut), retours d'erreur DB bruts → clé `errors.update_failed`.
  - 🎫 **Reporté au LOT 3 (réserves @security non bloquantes)** : **IMP-2** repli `role='agent'` non scopé à l'owner (périmètre, pas de fuite PII) ; **IMP-3** atomicité `update`+`insert historique` non transactionnelle + boucle `reserve_stock` sans rollback de réservation partielle (préexistant) → encapsuler en RPC Postgres transactionnelle.
- **LOT 3** — Lien fournisseur : `supplier_id` + réponse dispo/délai (vue redacted, sans PII acheteur) + UI fournisseur. **+ traiter IMP-2/IMP-3 ci-dessus.** `@backend-db`+`@frontend` → audit `@security`.
  - **LOT 3a** ✅ **FAIT (DB)** — migrations `059`+`060` (appliquées). `059` : colonnes `supplier_id`/`supplier_response`(available/preparing/on_order)/`supplier_lead_time_days`/`supplier_responded_at`/`supplier_assigned_at` + **vues redacted** `wholesale_orders_supplier_read` & `_items_supplier_read` (liste blanche : id/statut/ville/délai/produits/quantités — **exclut** buyer_id/adresse/notes/montants/marges) + RPC `respond_to_wholesale_order` SECURITY DEFINER (le fournisseur n'écrit QUE sa réponse, jamais statut/montants) + actions `assignSupplierToOrder` (assignee restreint à role=supplier) / `respondToWholesaleOrder`.
    - 🛡️ **Correctif sécurité `060`** : l'audit `@security` a trouvé CRITIQUE que `059` ajoutait une policy SELECT sur la **table de base** (RLS ne filtre pas les colonnes → fuite PII+marge possible). `060` **DROP** cette policy → lecture fournisseur **uniquement via la vue redacted** (pattern `045`). Faille **non exploitée** (aucun `supplier_id` assigné au moment du fix). Re-audit `@security` = **CRIT-1 FERMÉ, GO**.
  - **LOT 3b** ✅ **FAIT** (session 2026-06-12, commits `52e6ff6`/`3d9a809`/`4222c96`, 3 sous-lots A/B/C, 4 checks verts à chaque). **A** : i18n 5 clés `errors.supplier_*` FR/AR/EN + **IMP-2** (repli global `eq('role','agent')` SUPPRIMÉ → assignation membres scopée strictement à l'équipe `team_members` de l'owner ; décision prise seule, reco `@architect`, non financière/non sécu). **B** : page `/supplier/orders` (lecture EXCLUSIVE via vues redacted, zéro PII) + form réponse dispo/délai (Client, strings pré-résolues) + carte nav dashboard + `revalidatePath('/supplier/orders')` dans l'action + route ajoutée au smoke (20/20). **C** : bloc admin « Assigner un fournisseur » (`wholesale-supplier-assign-form`) + affichage réponse fournisseur (dispo/délai/date) sur la page détail. i18n parité stricte 2861/langue. Audit `@security` = **GO** (0 critique / 0 important ; MIN-1 cosmétique noté : fallback i18n statut, non bloquant). ⚠️ **Migrations** : aucune nouvelle (3b = UI/i18n pur, DB inchangée depuis `060`).
  - **LOT 3c** ✅ **FAIT** (session 2026-06-12, commit `274fb1a`) — IMP-3 atomicité. Migration `061` (appliquée en base) : 2 RPC plpgsql `SECURITY DEFINER SET search_path=public`, `GRANT EXECUTE TO authenticated` : **`transition_wholesale_order_status`** (encapsule en UNE transaction : garde rôle interne admin/agent-assigné ≥ RLS + verrou `FOR UPDATE` + FSM SQL = réplique fidèle de `wholesale-fsm.ts` + boucle `reserve_stock`/`restore_stock` + `UPDATE` statut/timestamps + `INSERT` history → un `RAISE EXCEPTION` annule TOUT = fin de la réservation partielle) et **`assign_wholesale_order_atomic`** (garde `can_assign_orders` + assignee role agent/admin (IMP-1) + idempotence + FSM + UPDATE + history, atomique). Actions `updateWholesaleOrderStatus`/`assignWholesaleOrder` délèguent au RPC (auth/validation/`revalidatePath`/idempotence conservés, signatures `ActionState` inchangées, FSM TS gardée en fail-fast). **AUCUNE colonne financière touchée** → trigger `compute_wholesale_order_costs` (025) intangible, circuit `@finance` NON requis (tranché @architect + confirmé @security). **4 checks verts** (tsc 0 / build / 115 tests / smoke 20/20). Audit `@security` = **GO** (0 critique / 0 important bloquant ; I-2 cosmétique : param `p_notes` réservé usage futur, accepté non bloquant — migration immuable non re-touchée).
- **LOT 4** — Logistique flexible (`logistics_mode`) + états picked_up/dispatched. **CHANTIER FINANCIER → circuit `@finance` complet OBLIGATOIRE** (plan `@architect` → audit `@finance` → validation Abdou → code).
  - ### 🛑 RÈGLE BUSINESS À GRAVER — livraison/ramassage JAMAIS à la charge de Mozouna
  - **PRINCIPE ABSOLU** (même esprit que le plancher livraison affilié « jamais zéro ») : **Mozouna ne supporte JAMAIS, de sa poche, le coût de livraison/ramassage.** Le coût est **toujours** porté par quelqu'un d'autre. **Paramétrable PAR COMMANDE**, 3 cas exclusifs :
    1. **REFACTURÉ AU CLIENT** : Mozouna paie la société de livraison, **mais le montant est ajouté à la facture client** → **impact marge = ZÉRO** (le coût ET la recette de refacturation sont tous deux tracés/ledgerisés).
    2. **PRIS EN CHARGE FOURNISSEUR (facturé)** : l'usine s'occupe de la livraison et la facture (c'est dans **son** prix) → **pas dans les coûts de Mozouna**.
    3. **OFFERT PAR LE FOURNISSEUR** : livraison **gratuite** pour le client, **coût zéro** pour Mozouna.
  - **GARDE-FOU `@finance` (bloquant)** : le système doit **REFUSER toute configuration** où un coût de livraison serait supporté par Mozouna **sans contrepartie** (ni refacturation client, ni prise en charge fournisseur). Une marge ne doit **jamais** être amputée par une livraison non refacturée. Validation **côté serveur** (action/RPC + check DB), pas seulement UI. Idempotence + ledger append-only pour les montants (coût livraison + recette refacturation).
  - ⚠️ Articulation avec l'existant : NE PAS casser le trigger marge `compute_wholesale_order_costs` (025, INTANGIBLE) ni le plancher livraison affilié. `@architect` doit cadrer où s'insèrent ces 3 cas dans le calcul de marge wholesale **avant** tout code.
  - ### 📋 GATE 4.0 — plan `@architect` + audit `@finance` FAITS (session 2026-06-12) — **EN ATTENTE ARBITRAGE ABDOU, AUCUN CODE**
  - **Plan `@architect`** : nouvelles colonnes `wholesale_orders` (`logistics_mode` enum, `delivery_cost_handling` enum 3 cas `rebilled_client`/`supplier_billed`/`supplier_free`, `delivery_cost_mad`, `delivery_rebill_mad`, tous `numeric(12,2)`). Marge inchangée : NE PAS injecter coût/recette dans `total_cost_mad`/`total_amount` (net nul par invariant) → trigger `025` intact. ⚠️ NE PAS réutiliser `delivery_cost` (013 = **recette**, nom trompeur). États `picked_up`/`dispatched` DÉJÀ en FSM (057/061) → rien à toucher. Garde-fou = CHECK DB + action zod.
  - **Audit `@finance` = GO-AVEC-CONDITIONS.** Trou majeur trouvé : **l'invariant ne tient qu'en P&L, PAS en cash** — au cas 1, Mozouna décaisse X au livreur et doit récupérer Y≥X ; une simple `history` chronologique ne rend PAS calculable le solde « refacturé mais pas encore encaissé = perte cash silencieuse si le client ne paie jamais ».
  - **4 CONDITIONS BLOQUANTES avant tout code** : **C1** registre où `SUM` donne la position cash transport par commande (pas une history nue). **C2** durcir le CHECK : `cost>=0 AND rebill>=0` (tous cas) + NOT NULL/COALESCE sur branche `rebilled_client` (sinon NULL contourne) + garder `≥` (sous réserve Q2) + acter que le CHECK ne protège PAS contre la réécriture d'état → d'où C1/C3. **C3** clé d'idempotence **par ÉVÉNEMENT** (`order_id+event_uuid/sequence`), JAMAIS par valeur (`order_id+cost+rebill+handling` avale les corrections légitimes) ; append-only complet (triggers anti-UPDATE/DELETE + RLS deny, calqué `048`/`029`). **C4** ZÉRO `parseFloat` sur les montants livraison (zod décimal strict / entiers-centimes) — ne pas imiter la dette `orders.ts:706-708`.
  - **3 DÉCISIONS ARGENT à trancher par Abdou** (circuit @finance) : **Q1** ledger wholesale dédié (reco @finance, solde cash calculable) vs history simple. **Q2** profit transport `rebill>cost` autorisé (`≥`) vs refacturation au coût exact (`=`). **Q3** suivre l'**encaissement** de la refacturation (état distinct de « configurée ») oui/non. **+ Q4 (op.)** coût livraison dépend de la VILLE (réutiliser référentiel `cities`) vs saisie libre.
  - **Dettes ticketées (hors LOT 4)** : `parseFloat` `orders.ts:706-708` (3 colonnes coût existantes, ne pas aggraver) ; **TVA refacturation cas 1** (risque d'avance de TVA — traitement comptable à valider par un professionnel AVANT facturation réelle en prod ; non bloquant pour coder, montants traités comme TTC opaques).
  - ### ✅ ARBITRAGE ABDOU (session 2026-06-12) — GO pour coder, conditions @finance intégrées
  - **Q1 → LEDGER wholesale DÉDIÉ** (`wholesale_delivery_ledger` append-only, solde cash par SUM, calqué `048`). Pas de history nue. **Q2 → profit transport AUTORISÉ** (`rebill ≥ cost`, jamais perte). **Q3 → SUIVRE L'ENCAISSEMENT** : 2 types d'écriture ledger — `delivery_cost_incurred` (négatif, au décaissement Mozouna→livreur) et `delivery_rebill_collected` (positif, à l'encaissement client) ; `SUM<0` sur une commande = Mozouna à découvert = alertable. **Q4 → SAISIE LIBRE par commande** (pas de dépendance ville, montant réel livreur connu après coup).
  - **Plan d'exécution (chaque lot financier → audit `@finance` + `@security` AVANT commit)** : **4.1** ✅ **FAIT** (voir ci-dessous). **4.2** action serveur + zod décimal strict (C4, zéro parseFloat) + RPC écriture ledger idempotente+atomique colonne↔ledger (SECURITY DEFINER) + clés `errors.*` i18n. **4.3** UI form par commande (3 cas, strings pré-résolues) + suivi encaissement + i18n FR/AR/EN.
  - ### 🧭 DÉCISIONS PRODUIT 4.2 (Abdou, session 2026-06-12) — mécanique de l'argent
  - **Q-coût** : le **coût livreur** est saisi par l'**ADMIN, à tout moment** (souvent connu après coup) → écrit `delivery_cost_incurred` au ledger. **BLOQUANT** : interdiction de passer la commande au **statut final (livrée/clôturée)** si, quand un mode livraison **avec coût** est configuré (`delivery_cost_handling='rebilled_client'`), le coût transport n'est PAS renseigné. *Une commande clôturée = marge complète et vraie.* → garde à ajouter dans la transition FSM vers l'état terminal (RPC `transition_wholesale_order_status` 061 / action).
  - **Q-encaissement** : PAS d'action séparée. **Raccordé au FLUX PAIEMENT EXISTANT** (`payment_status`/dépôts) : quand le paiement de la commande **couvre le total incluant la refacturation transport**, l'écriture `delivery_rebill_collected` se fait **automatiquement** (émission serveur depuis le flux paiement, idempotente). **`@finance` valide la mécanique EXACTE du raccord** (comment « le total inclut la refacturation » est défini vs `total_amount`/dépôts, seuil de déclenchement, idempotence anti-double-écriture).
  - **TVA** : toujours ticketée (montants TTC opaques, validation comptable avant prod).
  - ### 📋 GATE 4.2 — plan `@architect` + audit `@finance` FAITS (session 2026-06-12) — **EN ATTENTE 3 ARBITRAGES ABDOU, AUCUN CODE**
  - **Découverte structurante** : le flux paiement actuel est **déclaratif/manuel** (`payment_status` + `deposit_received_amount` saisis à la main par l'admin, AUCUN seuil calculé aujourd'hui). `total_amount` & `deposit_received_amount` = `numeric(10,2)` ; ledger/colonnes delivery = `numeric(12,2)`.
  - **Plan @architect** : montant dû réel = `total_amount + delivery_rebill_mad` (calculé, JAMAIS persisté → trigger 025 intact) ; RPC `set_wholesale_delivery_config` (config + ledger cost atomique) ; garde BLOQUANTE `delivered` (migration `065` = CREATE OR REPLACE de 061 + bloc `IF delivered AND rebilled_client AND cost=0 RAISE`) ; RPC `try_collect_wholesale_delivery_rebill` appelée depuis `updateWholesalePaymentStatus` ; helper zod décimal strict.
  - **Audit @finance = GO-CONDITIONS.** Tranché par @finance (comptable) : **E4** correction coût = écriture d'**ajustement par DELTA** (`v_delta=(-cost_cible)−SUM_existant`) dans la RPC, append-only ; **E1** déclenchement sur **seuil calculé** (pas le flag `fully_paid` déclaratif) ; **E3** montant collecté = fait figé ; **E5** collecte non-fatale MAIS rejouable+tracée.
  - **8 CONDITIONS BLOQUANTES avant code** : **C-B1** seuil évalué en SQL/numeric (jamais JS). **C-R1** RPC collecte `FOR UPDATE` + `unique_violation`=succès silencieux. **C-R2** `set_config` refuse de modifier `delivery_rebill_mad` si une collecte existe (`errors.rebill_locked_after_collection`). **C-A1** `set_config` `FOR UPDATE` + delta même transaction. **C-A2** collecte non-fatale ⇒ échec loggé + idempotent rejouable (sinon NO-GO). **C-Z1** zod `^\d+(\.\d{1,2})?$`, zéro parseFloat. **C-NR1** test : `total_amount`/`gross_profit_mad` inchangés après config ET collecte. **C-NR2** migration 065 = diff strictement additif vs 061, tests FSM verts. **+ rempart dur idempotence = UNIQUE partiel** `(wholesale_order_id) WHERE entry_type='delivery_rebill_collected'`.
  - **3 ARBITRAGES ABDOU** (modèle données / UX argent) : **E4-bis** autoriser la correction du coût **à la baisse** (⇒ assouplir le CHECK de signe ledger) ou non. **E3-bis** comportement si admin baisse `deposit` sous le seuil APRÈS une collecte (défaut : ne pas dé-collecter, alerter). **E1-bis** collecte auto dès saisie d'un montant reçu ≥ seuil, sans clic de confirmation (risque faute de frappe assumé).
  - ### ✅ ARBITRAGE ABDOU 4.2 (session 2026-06-12) — GO pour coder 4.2
  - **E4-bis → AUTORISER LA BAISSE** : assouplir le CHECK de signe `wdl_amount_sign_matches_entry_type` pour permettre des écritures d'ajustement **signées** sur `delivery_cost_incurred` (le delta peut être positif quand on baisse le coût) ; garder `delivery_rebill_collected >= 0`. Le SUM converge toujours vers `−coût réel`. **E1-bis → AUTO SUR SEUIL** (pas de clic de confirmation). **E3-bis → GARDER + ALERTER** (la collecte est un fait append-only ; si `deposit` repasse sous le seuil après collecte → pas de dé-collecte auto, on TRACE une alerte ; l'alerting réel se branchera au LOT 6 notifications — pour 4.2 = log serveur best-effort).
  - **Sous-lots** : **4.2-A** migration `065` (assouplir CHECK signe + UNIQUE partiel rebill_collected + RPC `set_wholesale_delivery_config` [delta-ajustement coût, C-R2, atomique] + CREATE OR REPLACE `transition_wholesale_order_status` avec garde `delivered` [diff additif vs 061] + RPC `try_collect_wholesale_delivery_rebill` [seuil SQL, FOR UPDATE, unique_violation=succès]). **4.2-B** helper zod `money.ts` + action `setWholesaleDeliveryConfig`. **4.2-C** raccord `updateWholesalePaymentStatus` → appel `try_collect` (non-fatal, rejouable, loggé) + détection E3-bis. **4.2-D** i18n `errors.*` (delivery_cost_required, rebill_locked_after_collection, invalid_amount, …) FR/AR/EN. Chaque sous-lot : audit `@finance`+`@security`, 4 checks (+ test non-régression marge C-NR1), `supabase db push`.
  - ### ✅✅ LOT 4 COMPLET (session 2026-06-13) — moteur cash livraison wholesale de bout en bout
  - **Récap** : 4.1 (fondation DB 062-064) → 4.2-A (RPC cash 065) → 4.2-B (`money.ts` + action config) → fix money dépôts → 4.2-C (raccord paiement→collecte + détecteur 067) → **4.3 (UI admin)**. **Tous audités @finance+@security GO. Migrations appliquées jusqu'à `067`.**
  - ### ✅ LOT 4.3 FAIT (session 2026-06-13) — UI admin configuration livraison
  - **Composant `src/components/admin/wholesale-delivery-config-form.tsx`** (Client, `useActionState(setWholesaleDeliveryConfig)`) inséré dans la page admin commande wholesale (`[id]/page.tsx`), entre `WholesaleCostForm` et `WholesalePaymentForm`. Form 3 cas : `rebilled_client` → champs coût + refacturation visibles ; `supplier_billed`/`supplier_free` → champs masqués (action force 0/0). Hidden `cost_event_uuid` via `useState(() => crypto.randomUUID())` (stable au retry → idempotence DELTA). Erreurs rendues via `tErr(state.error)` (clés `errors.*`). Badge **lecture seule** d'état de collecte (la collecte est AUTO, pas d'action manuelle).
  - **Page** : 6e requête au `Promise.all` (lecture `wholesale_delivery_ledger` `select('amount_mad')` filtrée `delivery_rebill_collected`, `maybeSingle`, côté serveur — aucune colonne marge/coût exposée) → props sérialisables `rebillCollected`/`collectedAmount`. RÈGLE ABSOLUE n°2 respectée (zéro callback au client). RÈGLE n°1 (aucun calcul financier client, seul état local = `handling`).
  - **i18n** : namespace `admin.wholesaleDeliveryForm` créé **FR/AR(فصحى)/EN** (3 cas, 2 modes, labels coût/rebill, badges collecte, succès). RTL OK.
  - **Audit** : pure couche UI (action/RPC déjà audités) → relecture **`@security` = GO** (props sérialisables, lecture ledger sans fuite, aucune écriture client RÈGLE n°7, uuid stable, route admin gardée, erreurs i18n). **4 checks verts** : tsc 0 / build OK / 128 tests / smoke 20/20.
  - **PROCHAIN** : 🔴 **chantier money dédié PRIORITAIRE** (purge des 7 `parseFloat` argent restants — voir tête de fichier) AVANT staging Vercel, puis PR `main`.
  - ### ✅ LOT 4.2-C FAIT (session 2026-06-13) — raccord paiement → collecte cash + détection E3-bis
  - **Migration `067`** (appliquée) : fonction READ-ONLY `is_wholesale_delivery_undercollateralized(uuid)` (`SECURITY DEFINER` + garde `my_role()='admin'`, `STABLE`, GRANT `authenticated`) — renvoie `true` si une collecte existe ET `deposit_received_amount < total_amount + delivery_rebill_mad`, **seuil EN SQL identique à 065** (C-B1). ZÉRO écriture, ZÉRO ledger, append-only préservé.
  - **Raccord dans `updateWholesalePaymentStatus`** (`orders.ts`, après l'INSERT payment_history) : 2 blocs `try/catch` **NON-FATALS** (C-A2/E5) — (1) appel `try_collect_wholesale_delivery_rebill` (collecte AUTO sur seuil, E1-bis ; idempotent → rejoué à chaque update) ; (2) appel `is_wholesale_delivery_undercollateralized` → `console.warn` E3-bis (GARDER+ALERTER : pas de dé-collecte, log serveur best-effort pour 4.2, alerting réel au LOT 6). Aucun `return` n'avale le succès paiement. Dépôt lu FRAIS (après l'UPDATE). Aucune colonne de marge touchée (025 intangible).
  - **Fix money associé** (demande Abdou, commit séparé `1bf1639` AVANT 4.2-C) : `parseFloat` éliminé sur `deposit_amount`/`deposit_received_amount` (`updateWholesalePaymentStatus`) → `parseMoneyInput` verbatim. Durcissement : négatifs rejetés au lieu d'être ramenés à 0. Audits @finance+@security GO.
  - **Audits 4.2-C** : `@finance` = **GO** (seuil 100 % SQL identique 065/067, non-fatal/rejouable, E3-bis zéro écriture, dépôt frais, marge intangible, aucune double-collecte introduite). `@security` = **GO** (DEFINER bridé `my_role`, lecture seule réelle, GRANT `authenticated`, anti-injection, aucune fuite — logs = `orderId`/`userId`, RÈGLE n°7). **4 checks verts** : tsc 0 / build OK / 128 tests / smoke 20/20.
  - **🧾 DETTE money ticketée (lot dédié futur, circuit @finance par site)** : `parseFloat` sur de l'argent SUBSISTE ailleurs dans `orders.ts` — `707-709` (coûts wholesale, déjà ticketé) + calculs COD/pricing `147`/`271`/`337`/`525`/`536`/`640`/`651`. Hors périmètre 4.2-C (flux COD/commission, chacun = circuit @finance dédié). Objectif Abdou « zéro parseFloat sur de l'argent nulle part » → à planifier en lot money dédié.
  - **RESTE LOT 4** : **4.2-D** (i18n déjà replié dans 4.2-B — vérifier s'il reste des clés) → **4.3** (UI form admin config livraison, 3 cas, hidden `cost_event_uuid`, suivi encaissement, i18n FR/AR/EN).
  - ### ✅ LOT 4.2-B FAIT (session 2026-06-13) — adaptateur TS config livraison
  - **Aucune migration** (pur TS au-dessus des RPC 065 déjà audités). **`src/lib/money.ts`** : helper zod décimal strict `MONEY_REGEX=^\d+(\.\d{1,2})?$` + `parseMoneyInput` (champ vide→`'0'`, sinon chaîne validée **verbatim**, **ZÉRO parseFloat** C-Z1/C4 — la string traverse jusqu'au paramètre `numeric` du RPC, exactitude décimale). **Action `setWholesaleDeliveryConfig`** (`orders.ts`, après `updateWholesalePaymentStatus`) : admin seul (`requireAdmin()` sans agent), valide handling/logistics_mode par allowlist (enum 062), force `0/0` pour `supplier_billed`/`supplier_free`, délègue l'invariant `rebill≥cost` au CHECK 062 (→`errors.rebill_below_cost`), `p_cost_event_uuid` neuf par soumission/stable au retry (hidden form `cost_event_uuid` sinon `crypto.randomUUID()`), 100 % délégué au RPC (aucune écriture directe). Helper `mapDeliveryRpcError` mappe exceptions RPC + contrainte → clés `errors.*`.
  - **i18n** (replié de 4.2-D, pour ne pas laisser de clé orpheline) : `errors.invalid_amount`/`invalid_delivery_handling`/`invalid_logistics_mode`/`rebill_below_cost`/`rebill_locked_after_collection`/`delivery_cost_required` ajoutées **FR/AR/EN**.
  - **Tests** : `tests/money.test.ts` (7 cas : regex, vide→0, verbatim sans float, invalides→clé i18n, File→0). **4 checks verts** : tsc 0 / build OK / **128 tests** / smoke 20/20.
  - **Audits** : `@finance` = **GO** (zéro float sur le chemin 4.2-B, idempotence préservée, invariant délégué au CHECK 062, trigger 025 intangible). `@security` = **GO** (admin double-garde app+DB, aucune écriture directe RÈGLE n°7, inputs bornés, anti-injection via params RPC, erreurs = clés i18n, 0 critique). **RESTE LOT 4** : **4.2-C** (raccord `updateWholesalePaymentStatus`→`try_collect`) → **4.2-D** (reste i18n si besoin) → **4.3** (UI form admin, hidden `cost_event_uuid`).
  - ### ✅ LOT 4.2-A FAIT (session 2026-06-12) — moteur cash, circuit complet
  - **Migration `065`** (appliquée) : 3 RPC `SECURITY DEFINER` (garde admin pour le cash, admin+agent-assigné pour la transition). `set_wholesale_delivery_config` (delta-ajustement coût convergent vers `−cost`, C-R2 rebill verrouillée après collecte, atomique colonne↔ledger). `transition_wholesale_order_status` = **CREATE OR REPLACE de 061, diff strictement additif** (seul ajout : bloc `delivered` bloqué si `rebilled_client AND cost=0`). `try_collect_wholesale_delivery_rebill` (seuil `deposit >= total_amount + rebill` calculé EN SQL, FOR UPDATE, idempotence triple : EXISTS + UNIQUE partiel + EXCEPTION unique_violation). CHECK de signe assoupli (E4-bis : ajustements signés sur cost_incurred). Trigger marge `025` intact.
  - **Vérification empirique 18/18** (commande de test `a7de4066`, session admin réelle) : delta converge (−200→−250→−100 après baisse), **marge inchangée**, seuil collecte, idempotence (1 seule collecte), C-R2 RAISE, garde `delivered` (bloque sans coût / passe avec). ⚠️ Commande `a7de4066` (`TEST-065-VERIFY`) **reste en base** (ledger append-only + FK RESTRICT empêchent sa suppression) — artefact de test à ignorer.
  - **Audits** : `@finance` = **GO** (toutes conditions C-* intégrées, non-régression 025 prouvée structurellement, 0 trou de comptage). `@security` = **GO** (DEFINER bridé, gardes rôle OK, append-only préservé, anti-injection, 0 critique). **Décision politique non bloquante** (signalée @finance) : la clôture `delivered` est autorisée si coût saisi même si rebill **pas encore encaissé** — **conforme à la consigne Abdou** (bloquant = coût non saisi ; en COD on encaisse à/après livraison). **Contrats pour 4.2-B** : (1) l'action TS génère un `p_cost_event_uuid` **neuf par soumission** (stable au retry uniquement) ; (2) UI config/collecte cash **admin seul**.
  - ### ✅ LOT 4.1 FAIT (session 2026-06-12) — fondation DB, circuit financier complet
  - **Migrations `062`+`063`+`064`** (appliquées en base) : `062` colonnes `wholesale_orders` (`logistics_mode`, `delivery_cost_handling` 3 cas, `delivery_cost_mad`, `delivery_rebill_mad`, numeric(12,2)) + CHECK durci `wholesale_delivery_no_mozouna_loss` (cost≥0, rebill≥0, `rebilled_client⇒rebill≥cost`, autres cas⇒0/0) + **ledger dédié append-only `wholesale_delivery_ledger`** (écritures signées `delivery_cost_incurred`<0 / `delivery_rebill_collected`>0, idempotence par événement, triggers anti UPDATE/DELETE/TRUNCATE, RLS deny). Trigger marge `025` et `delivery_cost` (013) **non touchés**.
  - **Audits** : `@finance` = GO (invariant cash calculable par SUM, idempotence event-based, non-régression marge). `@security` = d'abord **NOT-GO (CRITIQUE C1)** : les colonnes coût/marge (062 ET marges 025 préexistantes) étaient sur-extraites par `select('*')` côté acheteur. **Corrigé** (arbitrage Abdou) : `063` **vue redacted `wholesale_orders_buyer_read`** (liste blanche, exclut les 8 colonnes coût/marge + internes agent/fournisseur) + 3 pages acheteur repointées dessus ; ledger restreint **admin seul** (I1) ; CHECK `currency='MAD'` (M1).
  - 🐞 **Bug silencieux attrapé en vérif manuelle** : `063` filtrait la vue sur `my_role()='buyer'` (rôle INEXISTANT — le vrai rôle acheteur est `wholesaler`, + accès via flag `wholesale_access`) → vue renvoyait **0 ligne** à tout acheteur ; le smoke ne l'a pas vu (une page en état vide passe). **`064`** corrige : `WHERE buyer_id = auth.uid()` seul. **Preuve empirique** : session réelle d'un acheteur avec commande → vue renvoie sa commande (1 ligne, son buyer_id uniquement), 0 colonne sensible. Ré-audit `@security` = **GO**. **4 checks verts** (tsc 0 / build / 115 tests / smoke 20/20). Migrations appliquées jusqu'à `064`.
- **LOT 5** — Alertes visuelles retard/bloqué (UI, signal rouge, consomme flags du LOT 1).
- **LOT 6** — Notifications in-app + Telegram (table `notifications` append-only + émission serveur depuis LOTS 1-4). `@backend-db`+`@frontend` → audit `@security`.

### 🤖 VISION ABDOU — AUTOMATISATION TOTALE des notifications (zéro intervention manuelle)
> **Objectif fondateur** : la plateforme doit tourner **SANS supervision manuelle**. Aucune commande oubliée, aucune perte de temps ni d'argent. Le système surveille, alerte et **escalade tout seul**.
- **Alertes automatiques sur commande bloquée trop longtemps sur un statut** (seuils par étape, à affiner) :
  - ex. **24h sans réponse fournisseur** (statut `assigned`/`supplier_confirmed` non avancé) → alerte.
  - ex. **48h sans ramassage/expédition** (statut `ready` non passé `picked_up`/`dispatched`) → alerte.
  - S'appuie sur les **flags du LOT 1** (`due_at`, `blocked_at`, `assigned_at`) + horodatage des transitions (`wholesale_order_status_history`).
- **Escalade hiérarchique automatique** : si le **membre assigné ne réagit pas** dans le délai → notif **au responsable/superviseur** (chaîne owner → superviseur → membre via `team_members`). Le silence d'un échelon **remonte automatiquement** à l'échelon supérieur.
- **Mécanisme** : un **worker planifié** (cron / Edge Function Supabase) scanne périodiquement les commandes actives, calcule les retards par rapport aux seuils, émet les notifs in-app + Telegram et **journalise** (pas de double envoi → idempotence par `notification` clé `order_id+rule+threshold`).
- **Seuils configurables** (pas en dur) : par étape du cycle, ajustables par l'admin. **i18n FR/AR/EN** obligatoire sur tous les messages.
- 🔗 Recoupe **LOT 5** (signal rouge visuel = la même donnée de retard, vue côté UI) et la **SECTION 2bis-A** (alertes admin, commande non traitée, fournisseur qui ne répond pas). À cadrer `@architect` avant code ; touche rôles/escalade → **audit `@security`**.

## ⭐ CHANTIER TRANSPORT DDP — Prix hors transport + devis (validé Abdou 2026-06-12) — **ACTIF**
> ⏸️ **Le Lot 3 Deliveroo est EN PAUSE** tant que ce chantier transport n'est pas fini. **On ne mélange pas deux chantiers** (règle Abdou). Reprise Deliveroo Lot 3 (lien fournisseur) APRÈS.

### 🔎 Diagnostic (audit lecture seule — l'existant est INTACT, on ne reconstruit rien)
- **Logique transport intacte** (vérifié git) : migrations `021`/`022` (1 seul commit chacune, jamais retouchées) — 3 modes dont **2 maritimes** (`sea_textile_kg`, `sea_volume_cbm`) + aérien (`air_door_to_door_kg`), `transport_customs_price_mad` (transport **+ douane** = DDP), unité kg/cbm, **prix par pays**, `delivery_days`. `tariff-utils.ts` = labels+unité (créé 2026-05-30, avant les chantiers). `tariffs.ts` = CRUD tarif. **Design/i18n/Lots 1-2 n'ont rien cassé** (les pages d'affichage ont reçu du style/i18n, la logique a survécu).
- **Affichage aujourd'hui** : fiche produit grossiste → panneau `ImportInfoBlock` (mode, coût/kg-cbm, délais) **MAIS uniquement si `availability_type='import_on_demand'`** ; produits `local_stock` → pas de panneau. Devis (`prepare-quote-form`) → admin saisit `quoted_quantity` + `quoted_transport_total_mad` (**transport au devis déjà modifiable**). Doc devis → ligne « Transport & Douane ».
- **Le problème** : la note `importPriceNote` (« Transport et douane inclus ») est **trompeuse** vs la règle Abdou — elle suggère transport *inclus dans le prix* alors qu'il est **calculé à part au devis**.

### 🧭 Règle business Abdou
- Prix produit affiché = **HORS transport, toujours**.
- Sur chaque fiche produit importé : mention claire « Transport calculé dans le devis selon quantité et mode (maritime/aérien) » — zéro surprise.
- **Exception textile maritime** (`sea_textile_kg`) : tarif au kg fixe → **affichable directement**.
- Transport communiqué **dans le devis après validation des quantités**, **modifiable admin** (tarif paramétrable par pays, changé rarement).

### 📦 Plan par lots (ordre imposé ; ⚠️ ARGENT → circuits complets)
- **LOT T0** ✅ **FAIT** — Audit `@finance` (gate) : **invariante « prix HORS transport » CONFIRMÉE** au niveau données + logique. `sell_price` = coût usine + marge plateforme seulement (jamais de transport) ; devis décompose marchandise + transport sans double comptage (`quote-document.tsx`) ; commande/ledger tracent le transport en COÛT séparé (trigger `025`, ledger COD intact). **Seule contamination = le WORDING UI** (3 textes contradictoires). GO T1.
- **LOT T1** ✅ **FAIT** — Recadrage message prix (i18n/affichage SEUL, RÈGLE ABSOLUE 1, zéro logique). 3 clés harmonisées FR/AR/EN (parité 2657) : `home.countries.trust2`, `marketplaceDetail.importPriceNote`, `productDetail.importSubtitle` → « **hors transport — calculé au devis selon quantité et mode (maritime/aérien)** ». **Wording recommandé/signé `@finance`**. 4 checks verts (tsc/build/115 tests/smoke 19/19). *(Échec smoke transitoire = conflit port 3000 avec le serveur dev, pas une régression — résolu en stoppant le dev.)*
- **LOT T2** ✅ **FAIT** — Exception textile maritime (`sea_textile_kg`) : sur la fiche produit, sous-titre affirmatif « Tarif transport fixe au kg — connu d'avance » + badge « Tarif fixe » (vs « estimation au devis » pour aérien/maritime volume). Display SEUL (conditionnel sur `shipping_mode` existant, aucun calcul/argent). 2 clés i18n FR/AR/EN (parité 2659). 4 checks verts.
- **LOT T3** — Transport au devis. ⚠️ **DÉCISION ABDOU REQUISE (argent + modèle de données)** :
  - ✅ **Partie obligatoire = DÉJÀ SATISFAITE** (confirmé audit `@finance` T0) : l'admin saisit `quoted_transport_total_mad` **après** validation des quantités, **modifiable**, tarif par pays **paramétrable** dans `admin/import-tariffs`. Pas de double comptage. La règle business est déjà tenue.
  - 🚧 **Option auto-suggestion BLOQUÉE** : `suggestion = tarif_pays × poids/volume × qté` **n'est pas calculable** — **aucun poids (kg) ni volume (cbm) numérique par produit** en base (seul `buyer_volume_tier` = tranche déclarative). La construire exige d'abord **capturer le poids/volume par produit** (nouveau champ + saisie fournisseur/admin) → scope élargi, circuit `@finance`+`@security`+Abdou.
  - **DÉCISION ABDOU = (b)** ✅ **FAIT** : hint **read-only** du tarif pays paramétré, affiché sous le champ transport du form devis (`getActiveTariff` côté serveur → prop sérialisable `tariffHint`). L'admin **saisit toujours le total** ; le hint n'écrit/ne calcule RIEN. Audit `@finance` = **GO** (0 risque ; finding wording « tarif unitaire → saisir le TOTAL » corrigé avant commit). 4 clés i18n FR/AR/EN (parité 2663). 4 checks verts.
  - 🔮 **CHANTIER FUTUR — « Auto-calcul transport » (option (a), différé)** : auto-suggestion `tarif_pays × poids/volume × qté`, à construire **le jour où on capture les poids/volumes produits**. Voie privilégiée = **onboarding fournisseur assisté IA** (SECTION 1 : photo → l'IA remplit nom/catégorie/prix… **et pourrait estimer le poids/volume**) → capture **sans friction** pour des fournisseurs pas tech. Circuit `@finance`+`@security`+Abdou au moment venu. Tant que les poids n'existent pas, on reste sur le hint (b) + saisie admin.
- **Garde-fous** : T0→T1→T2→T3. T1/T2 = affichage (wording signé finance). T3 = argent, circuit complet.

## 2. 🐛 BUG quota produits — la limite ne bloque PAS vraiment
- **Symptôme constaté** : un fournisseur a **7 produits** alors que le plan **Gratuit en autorise 5** → la limite n'est pas réellement appliquée au moment de l'ajout.
- **Diagnostiquer les 3 voies d'ajout** : **web** (formulaire / server action), **Telegram** (worker bot), **import CSV** (`publishBulkImport`). Identifier laquelle (ou lesquelles) contourne(nt) le contrôle de limite.
- **Faire respecter la limite** de façon **centralisée** (un seul chokepoint partagé par les 3 voies, sinon le trou réapparaît). S'appuyer sur `getProductLimitStatus` (`maxAllowed` / `currentCount`) déjà utilisé à l'affichage.
- *Note* : c'est l'affichage du compteur (carte Telegram) qui a révélé l'incohérence `7/5` — l'affichage est correct, c'est l'**application** de la limite qui manque.

## 3. 🧭 Page « Soumettre un produit » — à repenser comme un GUIDE
- Aujourd'hui : un simple **message rouge** (« limite atteinte ») bloque sans orienter.
- **Cible** : une page qui **guide** en proposant directement les **3 voies d'ajout** :
  1. **Abonnement / plan** (passer à un plan supérieur pour augmenter la limite — réutiliser la carte Premium OR déjà faite).
  2. **Telegram** (avec l'explication : lier le compte, envoyer photo + description au bot).
  3. **Import CSV** (catalogue en masse).
- Esprit : zéro jargon, parcours le plus court, défauts intelligents (fil rouge « utilisateurs pas tech »).

## 4. ⚡ Perf — serveur lourd / lent
- **Diagnostiquer** la lenteur du serveur (dev et/ou prod) : requêtes lourdes / N+1, `Promise.all` manquants, gros payloads, images, cache, bundle.
- Établir un constat chiffré **avant** d'optimiser (mesurer d'abord, pas d'optimisation à l'aveugle).

---

## Comment l'orchestration fonctionne

La session principale de Claude Code = le **CHEF D'ORCHESTRE**. Elle ne code pas tout elle-même : elle délègue à l'agent spécialisé selon la tâche (`@architect`, `@backend-db`, `@finance`, `@frontend`, `@security-reviewer`), rassemble les résultats, et te présente les points de validation.

**Boucle standard pour chaque feature :**
`@architect` planifie → tu valides → le spécialiste implémente (sur une branche) → `@tester` teste (vert obligatoire) → `@security-reviewer` audite → tu valides → merge.

---

## PHASE 0 — Audit & fondations (lecture seule)
**But :** connaître l'état réel sans rien casser, et poser les fondations.
- `@architect` + `@security-reviewer` auditent le repo (read-only) : stack, structure, ce qui marche, failles RLS, fuites de secrets.
- Finaliser le `CLAUDE.md` avec les infos réelles de l'audit.
- Hygiène Git : branche de travail, secrets bien ignorés.
- **CHECKPOINT :** tu lis le rapport d'audit + la liste des failles classées.

## PHASE 1 — Sécuriser le socle
**But :** fermer les trous avant de construire dessus.
- `@backend-db` corrige les failles RLS prioritaires trouvées en Phase 0.
- `@security-reviewer` revalide chaque correctif (read-only).
- **CHECKPOINT :** RLS deny-par-défaut sur toutes les tables, aucun secret côté client.

## PHASE 2 — Moteur finance (le cœur)
**But :** bâtir la partie argent, la plus critique, en premier dans le « neuf ».
- `@finance` construit le grand livre (ledger append-only), le moteur de commissions, l'idempotence, la machine à états COD, la table d'audit.
- Tests de calculs + `@security-reviewer`.
- **CHECKPOINT :** un scénario de commission complet, calculé correctement, traçable, sans double versement.

## PHASE 3 — Backend & logique métier restants
- `@backend-db` complète les API / server actions manquantes au-dessus du socle sécurisé.
- `@security-reviewer` à chaque feature.
- **CHECKPOINT :** toutes les routes métier protégées et testées.

## PHASE 4 — Frontend pro
**But :** l'UI solide et esthétique, posée sur un backend déjà fiable.
- `@frontend` construit/refond l'interface (Next.js + shadcn), dashboards affiliés filtrés par utilisateur.
- **CHECKPOINT :** interface pro, responsive, zéro fuite de données inter-affiliés.

## PHASE 5 — Durcissement & mise en ligne
- Rate limiting, signatures webhooks, logs d'audit, perfs.
- `@security-reviewer` : passe complète finale.
- Déploiement.
- **CHECKPOINT :** audit final propre → go live.

---

## Économie de tokens (intégrée à la route)
- Le `CLAUDE.md` évite de réexpliquer le projet à chaque session.
- Les subagents isolent le contexte lourd → la session principale reste légère.
- **Chef d'orchestre (session principale) : Opus**, avec discipline de délégation pour rester léger (c'est le 1er poste de tokens).
- **Opus = raisonnement court à fort enjeu** (`@architect`, `@finance`, `@security-reviewer`) ; **Sonnet = exécution lourde** (`@backend-db`, `@frontend`, `@tester`).
- `/compact` entre chaque phase ; plan mode avant chaque feature ; contexte principal jamais > ~70 %.

---

# ROADMAP — Multi-pays, sourcing & au-delà
> Ajout post-session. Lecture/planif seulement — rien n'est construit ici.

## ✅ Déjà fait & figé (sur branches, NON mergé)
- **Étape 1 — Référentiel pays + devises** · branche `feat/etape1-country-currency-reference` (`859bcb2`)
  Migration `050` : `currencies` (MAD/USD/AED/EUR), `countries` (5 capacités indépendantes : office/warehouse/source/cod/export ; **COD = MA uniquement**), `exchange_rates` (pivot-MAD, append-only) + vue `current_exchange_rates`, `country_aliases`. RLS deny par défaut. Audit GO.
- **Étape 2 — Multi-devise sur le devis `quote_requests`** · branche `feat/etape2-quote-multicurrency` (`c275639`)
  Migration `051` : helpers FX, snapshot taux figé sur le devis + propagation commande, affichage devise client, réconciliation `products.exchange_rate_to_mad`. Backlog audit Étape 1 traité (IMP-1/MIN-1/MIN-2/MIN-3) + IMP-A/IMP-B corrigés. Audit GO.
- **Étape 3 — Devise dans le ledger** · branche `feat/etape3-ledger-currency` (`d691eff`)
  Migration `052` : colonnes `currency` + `amount_source` + `fx_rate_to_mad` (taux figé), 3 CHECK d'invariant, vue `ledger_balances`, INSERT des 3 fonctions (earned/reversed/payout) en MAD. **Append-only & idempotence préservés.** Audits `@security-reviewer` + `@finance` : aucun finding CRITIQUE.
- **Design premium NOIR & OR** · branche `feat/habillage-premium`
  Thème sombre + or (tokens sémantiques bi-contexte via `.theme-dark`), **accueil complet refondu** (hero plein écran + visuels de marque `public/brand/`) **+ pages clés** (auth, fiche produit, marketplace + cartes, dashboard affilié). 100 % visuel, aucune logique touchée. Pages admin/fournisseur laissées claires (scopé).
- **Multilingue FR / AR / EN + RTL (infra + accueil)** · branche `feat/habillage-premium`
  `next-intl` mode cookie (sans préfixe d'URL), détection navigateur + sélecteur de langue, **RTL auto pour l'arabe**, messages `FR/AR/EN`. **Accueil entièrement traduit.** Middleware auth Supabase non touché.
- **Espace ADMIN — habillage premium + multilingue (LOT 3d, 12/12 sous-lots — ✅ TERMINÉ)** · branche `feat/habillage-premium`
  Tout l'espace admin habillé **et** traduit FR/AR/EN : tokens sémantiques bi-contexte (surface/line/foreground/muted/faint, success/warning/danger/accent-soft+fg, gold, primary — purge totale du bleu/indigo/violet/vert/rouge/ambre/gris en dur), `<DashboardHeader>` partagé, badges statut scindés (`*_CLS` + libellés `t()`), pluriels ICU one/other (FR/AR/EN), dates via locale, flèches →/← selon RTL. **12 sous-lots livrés (3d.1 → 3d.12)** : commandes COD, produits, fournisseurs (produits/devis/perfs), commissions, payouts, users, premium, sourcing, moteur RFQ, devis clients, commandes gros, médiation échantillons, logistique/villes/tarifs, **dashboard & analytics**. Apparence + i18n uniquement — **aucune logique ni calcul touché**. Parité 1328 clés admin/langue. 0 TS, 115 tests verts.
- **Pivot interne = MAD** ; COD-Maroc et ledger Phase 2 non touchés (vérifié).

## 🔧 Reste à faire (ordre à respecter)

> ✅ **1. CORRECTION MOTEUR COMMISSION AFFILIÉ — FAIT** (audits `@finance` + `@security-reviewer` = GO ; réserves traitées). Branche `feat/habillage-premium`, non mergé.
> Décisions Abdou : D1 plancher **différencié** — Casablanca (hub) **25 MAD**, reste du Maroc / défaut **35 MAD** · D2 « commission de base » = **défaut logistique planché** (aperçu stocké `products.ts` ET affichage `page.tsx` alignés) · D3 livraison `> 0`, retour `>= 0` · D4 commission négative → **blocage côté affilié uniquement** (`createAffiliateOrder`) ; flux **public** `placeOrder` **non bloqué** (commission ramenée à 0, vente conservée, message neutre — recommandation des 2 audits) · D5 **plancher runtime seul**, pas de migration.
> 1. ✅ **Garde-fou livraison JAMAIS zéro** : `fee > 0` dans `addCity`/`updateCity`/`updateLogisticsSettings` + plancher différencié `Math.max(floor, …)` (floor = 25 Casablanca / 35 national) dans `resolveDeliveryFeeByCity` (chokepoint unique alimentant le calcul) et `resolveDeliveryFee`.
> 2. ✅ **Commission affichée périmée** : `page.tsx` recalcule en direct via `calculateNetAffiliateCommission` (défaut logistique planché) au lieu de la colonne figée ; « Non rentable » si ≤ 0.
> - **Fichiers** : `src/lib/utils.ts` (const `MIN_DELIVERY_FEE_MAD`), `src/app/actions/cities.ts`, `logistics.ts`, `products.ts`, `orders.ts`, `src/app/(affiliate)/affiliate/products/page.tsx`. Typecheck + compilation `/affiliate/products` OK.
> - ✅ **Tests** : Vitest + 22 cas limites verts (`tests/`, commit `a3ab52a`) — résolveur livraison, formule commission, flux D4, contrat idempotence payouts. `npm test`.
> - **Dettes hors périmètre signalées par l'audit (à ticketer)** : pas de rate-limiting sur `placeOrder` ; RLS `products` expose `factory_cost_mad` à `anon` (migr. 012) — non aggravé par ce lot ; usage float `toFixed/parseFloat` sur montants (tampon livraison 25 rend le gate `<0` insensible aux arrondis).
> - 🧾 **DETTE — test d'intégration DB idempotence réelle `create_payout`** : les tests unitaires couvrent le contrat JS (clé transmise, montant dérivé) mais PAS l'idempotence réelle (rejeu/double-clic neutralisés, atomicité, ON CONFLICT) qui vit dans la RPC Postgres. À faire plus tard avec une vraie base de test (Supabase local / pgTAP). Non bloquant.

2. **Reconnexion comptes test** — diagnostiquer/rétablir l'accès aux comptes de test (cloud Supabase) : 86 comptes intacts ; vérifier flux auth, retrouver/réinitialiser les mots de passe de seed des comptes démo.
3. **Relecture des traductions arabes** — ✅ *FAIT* : `ar.json` + `en.json` complets et à parité (1282 clés ×3), فصحى marketing sans darija. **Reste optionnel** : relecture humaine par un locuteur natif avant prod.
4. **Extension multilingue aux autres pages** — ✅ *FAIT (Phase A)* : TOUT le client traduit FR/AR/EN — accueil, auth (login/signup/pending), 3 dashboards, espace affilié (4), fournisseur (8), grossiste (15), pages publiques (fiche produit COD + suivi). **+ corrections BIDI/RTL** : `formatCurrency` isolé Unicode (FSI…PDI) → montants corrects en RTL ; **chiffres latins** forcés en arabe (`ar-u-nu-latn`, standard Maghreb) ; classes directionnelles → logiques (ms/me/ps/pe). Boutons/CTA tous branchés. Vérif : typecheck OK, 22/22 tests, 0 erreur i18n sur 27 routes en AR. Branche `feat/habillage-premium` (poussée).
   - **Espace admin** : ✅ *FAIT* — habillage premium + i18n FR/AR/EN complet (LOT 3d, 12/12 sous-lots ; voir « Déjà fait & figé » ci-dessus).
   - **Hors périmètre Phase A (à faire plus tard)** : quelques constantes métier (`PURCHASE_PROFILE_LABELS`, `VOLUME_TIER_LABELS`, `getDeliveryEstimate` côté grossiste/affilié) ; page `bootstrap` (interne).
   - 🧾 **DETTE — i18n du CONTENU DB** : noms/descriptions produits, libellés saisis (catégories, notes, pays texte) viennent de la base → **non traduisibles par i18n**. Nécessite une stratégie séparée (colonnes traduites `name_ar/name_en`, ou table de traductions, ou traduction à la saisie). À cadrer plus tard.
5. **Raccord colonnes pays texte → codes ISO** — normaliser `import_tariffs.country`, `origin_country`, `destination_country`, `countries_served[]` via `country_aliases` (+ `resolve_country_code`). Ajouter colonnes `*_country_code` (FK), sans casser l'existant.
6. **Stock multi-entrepôt par pays** — rattacher le stock aux pays `has_warehouse` ; notions réservé / provisoire / en transit / retour (aujourd'hui : `stock_count` scalaire mono-pays).
7. **Commande sourcing 2 lignes** — marchandise + transport séparés, pays_source + pays_destination, suivi paiement/échéances (mini-compta sur le ledger Phase 2).
8. **Branchement transport / courier (API)** — activer les champs `courier_*` préparés (table `cities`, migr. 015) + `logistics_settings.api_config` ; sync transporteur.
   - 🚢 **DEMANDE ABDOU — Transport DDP variable (volume/quantité, maritime/aérien)** — *captée le 2026-06-12*.
     **CE QUI EXISTE DÉJÀ (ne pas reconstruire)** : moteur `import_tariffs` (migr. `021`/`022`) avec `shipping_mode` = `air_door_to_door_kg` (aérien DDP porte-à-porte/kg), `sea_textile_kg` (maritime/kg), `sea_volume_cbm` (maritime au **volume/CBM**), `transport_customs_price_mad` (transport **+ douane** = DDP), `unit` kg/cbm, `delivery_days`, **par pays** (Chine/Turquie/Égypte/Dubai/Autre). Produits : `import_shipping_mode` + `tariff_mode` (global/custom). Calcul dans `src/lib/tariff-utils.ts`, branché au flux **devis** (`quote-requests`). → Le tarif **varie déjà** selon mode (air/mer) et selon poids **ou** volume (kg/cbm).
     **CE QUI MANQUE / À CADRER** : (a) **tarif dégressif par paliers de volume/quantité** (aujourd'hui = un tarif unitaire plat par pays+mode, pas de remise au volume — cf. `VOLUME_TIER_LABELS` qui n'est qu'un libellé d'affichage) ; (b) **raccord de ce moteur DDP au cycle de commande B2B Deliveroo** (LOT 4 logistique) — aujourd'hui le DDP vit côté devis/sourcing, pas sur `wholesale_orders`. ⚠️ Touche l'**ARGENT** (transport entre dans la marge) → **audit `@finance` + `@security` AVANT tout code**. `@architect` cadre d'abord.
9. **Features métier (backlog)** — cadrer puis construire B1–B5 (voir plus bas) + secteur « grossistes locaux Maroc » ; fil rouge = simplicité maximale (utilisateurs pas tech).
10. **Durcissement final + push GitHub + prod** — rate limiting, audit complet `@security-reviewer`, puis push/merge des branches et go-live (sur GO d'Abdou).

## 💡 Nouveau secteur (idée — à cadrer plus tard) — Grossistes locaux Maroc (B2B local)
**Idée :** fournitures, snacks, agro-alimentaire ; achat direct chez les **usines/fabricants marocains**.
**Principe :** brancher sur le circuit **fournisseur/marketplace EXISTANT** (`supplier_products`, RFQ `rfq_matches`/`rfq_offers`, `supplier_quote_requests`) — **ne pas reconstruire**.

**Questions à trancher avant tout build :**
- **Paiement** : achat en **COD** comme le reste, ou conditions B2B locales (paiement à terme, dépôt) ?
- **Type fournisseur** : les usines = nouveau type `local_factory` (vs `morocco` / `international` existants dans `supplier_matching_profiles.supplier_type`) ?
- **Spécificités agro-alimentaire** : DLC/DLUO, gestion par **lots**, **quantités minimums** (MOQ déjà présent), traçabilité sanitaire ?
- **Devise/transport** : 100 % MAD + transport local (pas d'import) → réutilise le pivot MAD, pas de FX.
- Réutiliser : `supplier_products`, modération, `import_tariffs` (ou tarif transport local dédié), stock local Maroc.

---

# BACKLOG FEATURES MÉTIER (à cadrer plus tard)
> Idées capturées, non priorisées, **rien n'est construit**. À cadrer via `@architect` quand leur tour viendra.

> **🧵 FIL ROUGE OBLIGATOIRE pour TOUTES ces features :** utilisables par des **grossistes/fournisseurs marocains PAS tech (ancienne génération)**. **Simplicité maximale** : zéro jargon, parcours le plus court possible, gros boutons, défauts intelligents. Toute décision de cadrage se juge d'abord à l'aune de ce critère.

## B1 — Saisie manuelle de commande (affilié)
**Besoin :** l'affilié qui vend sur **Facebook / WhatsApp / marketplace** sans copier le lien doit pouvoir **saisir sa commande à la main** directement dans son dashboard, section **« Mes commandes »** (récolte des coordonnées client).
- Visible **directement au dashboard** pour les débutants (pas enfoui dans un menu).
- **Option future :** import d'un **Google Sheet** de l'affilié.
- *À cadrer :* champs minimaux requis, validation des coordonnées, rattachement à la commission/au ledger comme une commande normale.

## B2 — Précommande / production usine (ne jamais bloquer l'achat)
**Règle :** si le fournisseur **n'a pas renseigné de quantité**, le système **NE DOIT JAMAIS bloquer l'achat** (produit possible **en production**, surtout gros clients et **agro-alimentaire**).
- Bloquer **UNIQUEMENT** si le fournisseur déclare explicitement **« rupture définitive »**.
- Dans ce cas : **notification au client ET à nous**.
- *À cadrer :* nouvel état produit/stock « rupture définitive » distinct de « stock non renseigné » ; canaux de notif ; délais de production affichés.

## B3 — Sourcing personnalisé par upload photo (pas de lien)
**Besoin :** remplacer les champs **« lien produit »** et **« URL image »** par un **UPLOAD DE PHOTO directe** (pas de lien, pas de vidéo).
- **Sécurité robuste obligatoire** (ces contenus partent sur **WhatsApp**) : validation stricte de l'upload (type MIME réel, taille, ré-encodage/strip EXIF), **aucune URL externe injectable**, protection contre fichiers/liens dangereux et utilisateurs malveillants.
- *À cadrer avec `@security-reviewer` :* stockage (Supabase Storage + RLS), antivirus/scan, limites, modération.

## B4 — Affichage intelligent par secteur
**Besoin :** le grossiste **définit son secteur** et le catalogue s'adapte (recommandation produits liée au métier/besoin).
- Exemples : **snack** → viande, friteuse, papier alu, sauces, huile… ; **épicier/revendeur** → tout ; **textile** → vêtements homme/femme/enfant, chaussures.
- *À cadrer :* taxonomie des secteurs, mapping secteur → catégories produits, défaut si secteur non défini.

## B5 — Comptes fournisseurs / usines via bot WhatsApp / Telegram
**Besoin :** le fournisseur envoie ses **produits + prix + stock** par **WhatsApp / Telegram**, le SaaS enregistre.
- **Validation ADMIN obligatoire avant publication** au catalogue.
- **Prix qui changent souvent :** le fournisseur renvoie un message **« nouveau prix »** → **historique des prix conservé (façon ledger)**.
- *À cadrer :* **API officielle vs bot**, format des messages attendus, parsing/robustesse, rattachement au circuit fournisseur existant (`supplier_products`, modération).

---

# 🧭 VISION ABDOU — grands chantiers (à CONCEVOIR, pas à coder maintenant)

> ⚠️ **Règle d'or de ces chantiers** : on en conçoit/construit **UN SEUL à la fois, jamais en parallèle**. Chacun démarre par `@architect` (plan) + audit avant tout code. On NE reconstruit PAS l'existant — **audit préalable obligatoire**.

## SECTION 1 — PARCOURS FOURNISSEUR (refonte)

**Objectif :** un parcours digne d'un gros SaaS international (Shopify / Faire / Alibaba), **ultra-simple** pour des fournisseurs de **tous niveaux** (vendeur de légumes/viande → alimentaire → construction → déco → électronique), **nationaux et internationaux**.

**Ordre de conception :**
1. **Ajout produit SANS rien taper** : le fournisseur envoie une **photo/vidéo** → l'**IA remplit** automatiquement nom, catégorie, sous-catégorie, description, **prix suggéré**.
2. **Onboarding ultra-simple** : 2-3 champs maximum.
3. **Gestion des commandes + disponibilité** (côté fournisseur).
4. **IA** : classification produits + analyse/benchmark des prix.

**⚠️ Audit préalable obligatoire** : import CSV, catalogue PDF/XLSX/ZIP et ajout produit **semblent déjà présents** (espace fournisseur déjà construit/i18n). **Ne pas reconstruire** — partir de l'existant (`supplier_products`, formulaires actuels, BulkImport, CatalogUpload) et n'ajouter que la couche IA + simplification.

## SECTION 2 — COUCHE OPÉRATIONS & ÉQUIPE (agents de sourcing)

**Principe fondateur :** **Abdou = INTERMÉDIAIRE**. Ni les agents, ni les fournisseurs, ni les grossistes ne se contactent directement.

1. **Rôles « agent de sourcing » par pays** : **assignation AUTOMATIQUE** des commandes selon le pays (Chine, Dubaï, Turquie, Égypte). Chaque agent = compte + rôle + **permissions définies par l'admin**.
2. **PERMISSION CRITIQUE** : les agents **NE voient PAS** les données sensibles client (**téléphone, adresse**) → empêcher le court-circuitage / les deals dans le dos. **Idem côté fournisseur** (identité acheteur masquée).
3. **Tableau de performance par agent** : commandes traitées, délais, qui traîne.
4. **Alertes admin** : commande non traitée, fournisseur qui ne répond pas / ne livre pas.
5. **Compte-rendu obligatoire** par l'agent sur chaque commande.

**⚠️ Chantier RÔLES + PERMISSIONS + DONNÉES SENSIBLES → audit sécurité RLS Supabase OBLIGATOIRE avant tout code** (`@security-reviewer` + `@backend-db`). C'est le sujet le plus sensible après l'argent.

## SECTION 2bis — VISION OPÉRATIONNELLE & MODÈLE ÉCONOMIQUE

> Prolonge directement la SECTION 2 (couche ops & équipe). **À CONCEVOIR plus tard, un seul chantier à la fois**, `@architect` d'abord. **Audit @finance** pour tout ce qui touche commission/marge/fidélité ; **audit @security** pour les rôles/permissions. **AVANT tout code : audit de l'existant** (le cycle de commande `wholesale_orders` est-il déjà présent ? statuts, timestamps, RLS ?).

### A. Gestion des commandes + rôles (style Deliveroo B2B)
- La commande arrive dans le SaaS → l'**owner la voit** → peut l'**ASSIGNER** à un superviseur selon son rôle.
- **Rôles assignables par équipe** : cocher/décocher les permissions d'un membre **en 1 clic**.
- **Cycle de vie commande** : reçue → assignée → confirmée fournisseur → en préparation → prête → ramassée/expédiée → livrée.
- **Notifications multi-rôles** : fournisseur (nouvelle commande), admin/superviseur, owner.
- Le **fournisseur RÉPOND** : disponible / en préparation / sur commande **+ DÉLAI**.
- **Logistique flexible** : soit un **RAMASSEUR** passe récupérer, soit le **fournisseur livre avec SA flotte** (cas usines agro-alimentaires).
- **Alertes visuelles** : signal **ROUGE** pour les commandes **en retard ou bloquées** → pour les sauver et satisfaire le grossiste. **Distinguer clairement les commandes bloquées.**

### B. Modèle économique + fidélité grossistes
- **Programme de fidélité** (surtout épiciers) : **points + cadeaux + réductions** pour acheter sur la plateforme plutôt que de contacter l'usine en direct.
- **Principe clé** : négocier avec l'usine pour **GARDER LE MÊME PRIX DE VENTE** → l'épicier **paie pareil** qu'en direct, MAIS gagne points/cadeaux chez Mozouna.
- L'usine **économise les salaires de commerciaux** → accepte que Mozouna prenne une **COMMISSION d'intermédiaire** en plus.
- Mozouna **sacrifie un bout de marge** en récompenses pour **fidéliser et capter le volume**.

> 🔗 **Liens & garde-fous** : A (rôles/permissions/données sensibles) recoupe la SECTION 2 → même exigence **audit @security RLS**. B (commission/marge/fidélité) touche l'**ARGENT** → **plan + audit @finance + @security AVANT commit**, jamais dans la précipitation (RÈGLE D'OR n°5/argent). Réutiliser l'existant (`wholesale_orders`, ledger, commissions) — **ne rien reconstruire sans audit préalable**.

## WMS — Traçabilité stock par scan QR (chantier majeur post-lancement)

Vision : un seul stock dépôt central. TOUTE sortie est scannée (QR) quel que soit le canal — e-commerce local COD, affilié, gros. Objectif : traçabilité complète des flux + comptabilisation automatique, zéro perte de stock.

Périmètre à cadrer plus tard (`@architect` + `@finance`, gros chantier) :
- Mouvements de stock : entrées dépôt (réappro), sorties par canal, transferts, retours COD (colis refusé qui revient au stock).
- Scan QR à la sortie qui décrémente automatiquement le bon stock du bon canal.
- Traçabilité : qui a sorti quoi, quand, pour quelle commande.
- Mode partenaire : offrir le système aux partenaires (fournisseurs/grossistes) pour tracer LEURS flux, avec isolation stricte des données (un partenaire ne voit jamais le stock d'un autre — même règle anti-deals que les agents sourcing). Source de valeur ajoutée / revenu potentiel (abonnement).
- Deux usages QR complémentaires : (a) QR par COMMANDE = page de suivi Deliveroo ; (b) QR de SORTIE dépôt = traçabilité stock.

Règle : à construire APRÈS le lancement, sur des flux réels observés, pas devinés. Au lancement, gestion de stock manuelle via l'admin existant.

## Relevés & Rapports partenaires (PDF + QR de vérification) — post-lancement

But : relevés exportables/imprimables par partenaire, pour audit manuel et envoi.
- AFFILIÉ : relevé complet (commandes, dates, montants, commissions, statuts) — pour audit si soupçon de fraude. QR de vérification.
- GROSSISTE : relevé commandes/paiements.
- FOURNISSEUR : rapport d'activité + info de paiement (date prévue + moyen de paiement), à lui envoyer.
- QR = vérification d'authenticité : pointe vers la vraie donnée serveur, relevé infalsifiable.
- PRÉREQUIS STRICT : à construire APRÈS la purge money complète — un relevé d'audit doit afficher des chiffres exacts, donc tous les calculs doivent être fiabilisés d'abord.
- Données déjà calculées existantes (commissions/paiements/marges) → mises en PDF + QR.

## Choix code-barres vs QR (à trancher au moment du WMS)

- Suivi commande Deliveroo → QR (ouvre la page de suivi au téléphone). DÉCIDÉ.
- Relevés/rapports d'audit → QR (vérification authenticité). DÉCIDÉ.
- Sortie stock dépôt (WMS) → code-barres 1D (douchette entrepôt rapide) OU QR (scan téléphone) — à trancher selon le matériel choisi, au cadrage WMS.

## SECTION 3 — DETTES & SUJETS EN ATTENTE (consolidation)

- 🧾 **i18n contenu DB** : noms/descriptions produits (et libellés saisis) non traduisibles par i18n → stratégie à cadrer (**colonnes `name_ar`/`name_en`** ou **table de traductions**, ou traduction à la saisie/IA).
- 🛡️ **Dette sécurité — RLS `products`** : expose `factory_cost_mad` à `anon` (migr. 012) → à corriger (vue/colonne masquée).
- ⏱️ **Dette — rate-limiting manquant** sur `placeOrder` (flux public COD).
- 🧪 **Dette — test d'intégration DB** de l'idempotence réelle de `create_payout` (RPC Postgres : rejeu/atomicité/ON CONFLICT) ; les tests unitaires couvrent seulement le contrat JS.
- ✅ **Espace ADMIN — habillage premium + i18n FR/AR/EN : TERMINÉ** (LOT 3d, 12/12 sous-lots) — voir « Déjà fait & figé ». Plus une dette.
- 📥 **Dette — reporting des lignes CSV échouées** (`publishBulkImport`) : le `continue` silencieux masque chaque insert raté → un fournisseur croit ses N produits importés alors que certains ont pu échouer. Ajouter un **compteur d'échecs + rapport** remonté à l'utilisateur (avec la raison). Signalée par l'audit @finance du lot multi-devise (Phase 5 CSV).
- 🔁 **Dette — idempotence import CSV** (`publishBulkImport`) : pas de clé d'idempotence → un retry / double-clic **recréerait tous les produits en doublon** (RÈGLE D'OR n°5). Ajouter une **clé d'idempotence** (ex. hash `csv_text` + `import_id`, ou verrouiller le statut de l'import avant insertion).
- 🔑 **Dette préexistante — confiance `metadata.role` au signup** : `handle_new_user` lit `role` depuis `raw_user_meta_data` → un appel direct à `auth.signUp` avec `role:'admin'` créerait un profil admin (mitigé par `status='pending'` + validation admin obligatoire). Signalée Phase 4, **non introduite** par le lot multi-devise. À durcir (rôle non auto-déclaré au signup).
- 🧽 **MÉNAGE TEST — secrets temporaires à RETIRER** (posés pour les tests multi-devise Telegram, à nettoyer) :
  - `supplier-morocco-03@affipartner.ma` : mot de passe temporaire **`TelegramTest2026!`** → réinitialiser ou retirer.
  - `agent-demo@affipartner.ma` : compte **agent de démo** (mot de passe **`AgentDemo2026!`**, créé le 2026-06-12 pour tester l'assignation LOT 2) → retirer ou réinitialiser avant prod.
  - `admin@affipartner.ma` : mot de passe temporaire **`AdminTest2026!`** (posé pour corriger le pays via session admin) → réinitialiser ou retirer.
  - **authtoken ngrok** passé en clair dans la conversation de dev → **régénérer** sur https://dashboard.ngrok.com/get-started/your-authtoken.
- 🚚 **Dette — Logistique B2B grossiste** : frais de livraison gérés **MANUELLEMENT** par commande (soit **OFFERT = 0**, soit ajouté dans les **frais additionnels**). **Pas de moteur automatique** — le B2C/Ozone existant ne change pas. Vérifier que le champ existe déjà sur la commande grossiste avant d'en ajouter un.
- 🔀 **MERGE vers `main`** : `origin/main` est figé/en retard ; **`MERGE_PLAN.md` prêt** (Option B, jalonnée `--no-ff`). Merger `feat/habillage-premium` → `main` = **décision séparée, sur GO explicite d'Abdou** (un seul commit/lot à la fois, jamais auto).
