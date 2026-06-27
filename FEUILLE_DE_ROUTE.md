# FEUILLE DE ROUTE — SaaS d'affiliation Mozouna

> **Réorganisée le 2026-06-20 en 3 ÉTAPES claires.** ZÉRO suppression : **tout**
> l'historique détaillé d'origine est conservé **verbatim** sous
> « 📚 ARCHIVE / HISTORIQUE DÉTAILLÉ » en bas de ce fichier. Le sommaire ci-dessous
> **indexe** ces sections. Statuts croisés avec `ETAT_SYSTEME.md` (registre de vérité).
>
> Légende : ✅ Fait (en prod) · 🔄 En cours / partiel · ⬜ À faire / à cadrer.

---

## 🧭 SOMMAIRE — 3 ÉTAPES

### ÉTAPE 1 — Vitrine crédible ✅ **FAIT**
> Photos + prix clair + incitation affilié. Commits `90ddaeb` / `aec0689` / `3803a01`,
> mergé `d274b9f`, poussé sur `main`. Preuves Playwright FR/AR/EN (`e2e/vitrine-proofs.spec.ts`).

- ✅ Photos fournisseur propagées au miroir catalogue (`90ddaeb`) — `buildSupplierMirror` copie `photos → media/images` (@finance+@security GO)
- ✅ Prix à l'unité + total du contenant — **D1** (`aec0689`) — `priceWithUnit` + `PackBreakdown` sur cartes affilié
- ✅ Incitation affilié « 💰 Tu gagnes / vente » bloc or (`3803a01`) — réutilise `calculateNetAffiliateCommission`
- ✅ Description publique dédupliquée — `getMeaningfulDescription` sur `/products/[id]`
- ✅ **Fiche affilié — CONVERSION (LOT 1→5 + catalogue DH)** mergé prod `7cef65d` (2026-06-27) : bloc « Prix revendeur + frais » (DH), hook or + sous-titre + bloc vert, `CommissionCalculator` (refonte temps réel −/+, prix conseillé+60, persistance), 4 portes (Ajouter commande + présélection produit, WhatsApp, **QR fonctionnel** `qrcode.react`, Copier le lien), bloc Prix revendeur **pliable**, unité **DH** (`formatDH`). Affichage pur, **@finance + @security GO**. Dettes : `?ref=` UUID → code parrainage opaque ; WhatsApp masse (lots séparés). Détail → `ETAT_SYSTEME.md`.
- ✅ *(Socle vitrine déjà en prod, rangé ici)* : hook profit affilié (`ba4b2af`) · wording « Tu vends, tu encaisses » (`842acce`) · catalogue affilié 2 niveaux + thème noir & or + grille responsive + placeholder thémé · badges i18n (`0b18d10`) · marketplace RTL/format (`b007baa`) · P2 cosmétiques (`c14e172`) · unités de vente P1→P4 (mig 079/080) · conditionnement + RTL (`c1975c3`/`8ed3557`/`3dd81f2`/`75aff16`)

### ÉTAPE 2 — Publication propre ✅ **FAIT**
> Canal par catégorie + report paliers + rayons. Mergé `9862f96` (`--no-ff` ; sub-lots
> `17e4af7`/`42d98e4`/`cef7342`/`1794496`), poussé sur `main`. **@finance + @security GO ×2**
> sur chaque sub-lot argent. **Preuve runtime end-to-end** (approbation réelle → miroir :
> `affiliate_enabled=false` + paliers FX+marge entier MAD bornés). **Aucune migration** (flag TS + colonnes existantes).

- ✅ **Canal auto par catégorie — D2** (`42d98e4`) : `affiliate_enabled` forcé SERVEUR par la catégorie (fail-closed), allowlist anti-POST, **fix fuite miroir** (`affiliate_enabled=false` explicite). Taxonomie = 12 catégories (+ Électronique & gadgets / Sport & Fitness / Jouets & enfants / Accessoires & maroquinerie, toutes affilié, validées Abdou).
- ✅ **Rayons / familles + filtres** (`1794496`) : rail des 12 familles (icônes + libellés traduits) + filtre `?category=` sur catalogue affilié **et** grossiste interne, i18n FR/AR/EN + RTL.
- ✅ **LOT A — Entrée catalogue par rayon** (merge `d82c6e2`, `e320507`, **additif, affichage pur, zéro argent/migration, 1 fichier**) : `/wholesale/products` SANS `?category=` affiche la **grande grille de tous les rayons en images** (porte d'entrée commerçant peu lettré) ; AVEC `?category=` → **rail compact** des autres rayons + grille produit (pas de grande grille). Bascule serveur `inAisle = !!filters.category` ; rail masqué en entrée (décision Abdou). Réutilise `CategoryShowcase`/`CategoryRail`/12 WebP/i18n existants. Vérifié runtime FR/AR/EN mobile + RTL (@tester, `.nav-proofs/entree-rayons/`). 4 checks verts.
- ✅ **Report des paliers fournisseur → `products.wholesale_tiers`** (`cef7342`, D3) : `buildMirrorTiers` (FX+marge, **entier MAD**, `max_qty` bornés), **grossiste-only**.
- ✅ **Coordination des 2 flux** : Approuver = miroir grossiste (catégorie+paliers+canal) ; Finaliser = affilié si la catégorie l'autorise (anti-doublon P0-1 + anti-double-marge `isMirrorProduct` intacts).
- ✅ **Normalisation catégories** (`17e4af7`) : 117 lignes legacy → taxonomie canonique (backup avant, prérequis D2).
- ⬜ **(SUIVI → ÉTAPE 2b)** Traduction IA du contenu produit (nom+desc AR/EN à l'approbation) — lot dédié : migration `name_ar/en`+`desc_*` + fonction de traduction + affichage + coût IA. **Sorti volontairement de l'Étape 2.**
- ⬜ **(SUIVI)** Paliers du flux **Finaliser** = encore en **saisie manuelle admin** (l'auto-report FX+marge ne couvre que le flux Approuver/miroir) → **pré-remplir plus tard**, circuit @finance.

### 🏗️ CHANTIER EN COURS — Catégories dynamiques en base + panneau admin 🔄
> Branche `feat/categories-dynamiques`. **Objectif scalabilité mondiale** : sortir les
> catégories du code (`src/lib/taxonomy.ts`, figé au build) vers une **table DB éditable**
> + **panneau admin** pour créer/éditer/traduire/désactiver une catégorie SANS déploiement
> (encaisser des fournisseurs de tous pays : nouvelle branche métier = 2 clics, plus de
> produits noyés dans « Autres »). **PHASE A (cartographie + plan + verdicts) faite, GO Abdou.**
>
> **RÈGLE D'OR DU CHANTIER** : migration **ADDITIVE et réversible**, ne JAMAIS casser
> l'existant. Les 12 catégories + tous les produits fonctionnent **exactement pareil** pendant
> et après. **STOP avant merge.**
>
> **Décisions tranchées (Abdou)** : (1) slug = **nom canonique FR actuel** (match exact
> `products.category`, zéro backfill) ; (2) **table unique self-référencée** (`parent_id`) ;
> (3) i18n **hybride** (12 seed gardent leurs clés JSON, nouvelles via colonnes DB) ;
> (4) **fallback `taxonomy.ts` codé conservé EN PERMANENCE** comme filet fail-closed.

**Découpage en sous-lots** (chacun : 4 checks verts + checkpoint Abdou) :
- 🔄 **Sous-lot 1 — Table + migration + seed INERTE + test de parité** (`feat/categories-dynamiques`).
  Migration **081** : table `categories` (self-réf, slug nom canonique, `label_fr/ar/en`, `icon`,
  `image_url`, `affiliate_allowed` DEFAULT false, `active`, `sort_order`, `parent_id`). RLS : SELECT
  ouvert (non sensible), **aucune écriture client** → mutations service_role only. Seed **copie exacte**
  des 12 catégories + 48 sous-cats (9 parents `affiliate_allowed=true`). **Table INERTE** : rien dans
  l'app ne la lit, `taxonomy.ts` reste la source runtime. Test `tests/categories-seed-parity.test.ts`
  (parse le SQL ↔ taxonomy.ts, octet-pour-octet noms + flag, 12 valides / 9 affiliées / 48 sous-cats).
- 🔄 **Sous-lot 2 — Couche lecture serveur + IA avec fallback `taxonomy.ts`** (commité sur branche,
  non mergé). `src/lib/categories/read.ts` (cœur testable, fetcher injectable, fallback fail-closed) +
  `index.ts` (`unstable_cache` tag `categories`, `getCategoryContext`). Sanitizers `schema.ts` rendus
  paramétrables par `TaxonomySource` (défaut = `taxonomy.ts`, **purs/synchrones, tests inchangés**).
  `extract.ts` lit la taxonomie DB au runtime (prompt + normalisation). **D2 NON touché**, UI NON touchée.
  Fail-closed prouvé (tests : throw/vide → `taxonomy.ts`, jamais d'élargissement) + lecture live DB
  vérifiée (origin `db`, 12 cat, 9 affiliés). 4 checks verts (tsc 0 / build / 255 tests +11 / smoke 20/20).
- 🔄 🔴 **Sous-lot 3 — Bascule décision D2** (commité sur branche, non mergé). `products.ts:115-135`
  lit `getChannelDecision()` (lecture base FRAÎCHE non cachée, fail-closed) au lieu de `taxonomy.ts`.
  Décision POSITIVE (`affiliateAllowed === true`, zéro `?? true`). `taxonomy.ts` conservé en fallback ;
  `supplier-mirror.ts` non touché (garde `!isMirrorProduct` intacte). **PÉRIMÈTRE STRICT D2** : filtres/
  forms/UI + unif. icônes **SORTIS** vers un lot séparé NON-financier (décision Abdou). **Circuit complet
  respecté** : @finance GO + @security GO sur le code réel + preuve de parité (12 canaux identiques
  avant/après, octet pour octet, live prod 0 divergence : Alimentaire/Matières premières/Autres grossiste,
  9 affiliées affiliées) + GO Abdou. 4 checks verts (tsc 0 / build / 263 tests +8 / smoke 20/20).
- ⬜ **Lot séparé (NON-financier) — Affichage dynamique** : filtres `?category=`, forms admin/supplier,
  rails/grilles, unification des 3 `CATEGORY_ICONS` → lire la base au lieu de `taxonomy.ts`. Pas de circuit
  financier (aucune décision de canal). À faire après le panneau admin.
- 🔄 **Sous-lot 4 — Panneau admin CRUD** (commité sur branche, non mergé). `/admin/categories`
  (Server Component) + `category-actions.tsx` (Client) + `actions/categories.ts` + migration **082**.
  Créer/éditer/traduire (FR/AR/EN)/activer-désactiver/réordonner catégories + sous-catégories.
  **Point sensible `affiliate_allowed` (canal D2)** verrouillé : RPC `set_category_affiliate_allowed`
  (SECURITY DEFINER, gate admin, booléen explicite) = SEUL chemin ; trigger bloque tout rôle client ;
  **audit immuable append-only** `category_channel_audit` (qui/quand/ancien→nouveau, RLS admin-read +
  trigger anti-UPDATE/DELETE). `'Autres'` protégée (suppression + désactivation). Nouvelle catégorie naît
  grossiste (fail-closed). CRUD via RLS admin-only (jamais service_role exposé). i18n FR/AR/EN + RTL.
  **Circuit ROUGE complet** : @finance GO + @security GO sur le code réel + **preuves runtime en session
  admin** (toggle+restore audité, UPDATE direct bloqué, audit immuable 2 couches, RPC anon refusée,
  'Autres' protégée, canaux figés inchangés). 4 checks verts (tsc 0 / build / 263 tests / smoke 20/20).
  **Suivis MINEURS @security (non bloquants)** : (a) `getCategoryChannelAudit` N+1 sur la page → batcher ;
  (b) `updateCategory` ne re-vérifie pas l'existence de l'id (0 ligne → ok silencieux) ; (c) valider
  `image_url` en zod `url()` côté action. **Suivi @finance** : `category_channel_audit.changed_by` est
  `ON DELETE SET NULL` → si rétention nominative exigée (conformité), stocker un libellé acteur en plus.
- ⬜ **Sous-lot 5 (option)** — retrait progressif du figé / nettoyage i18n (garder le fallback codé).

**CONDITIONS OBLIGATOIRES avant tout sous-lot touchant D2 (3/4) — verdicts @security + @finance :**
1. **Décision D2 = positive** : `affiliate_enabled` autorisé **uniquement** si `affiliate_allowed === true`
   sur ligne `active=true`. Tout le reste (DB down/vide, ligne absente, bool null, slug inactif) → `false`.
   **Jamais `?? true`, jamais `!isBlocked`** (la base est fail-OPEN par défaut : `affiliate_enabled NOT NULL
   DEFAULT true`, mig 007 — toute la sûreté repose sur le code).
2. **Fallback codé fail-closed permanent** : si DB injoignable/vide → repli sur `AFFILIATE_ALLOWED_CATEGORIES`
   (9 cats), jamais plus permissif. **Prouvé par test** (DB down + table vide).
3. **Décision D2 non-cachée** : lecture fraîche (ou TTL≈0) du flag pour l'écriture produit. Cache réservé
   à l'affichage.
4. **Toggle = invalidation synchrone bloquante** avant retour succès ; resserrement `true→false` prioritaire
   (test : toggle false → création immédiate refuse l'affilié).
5. **`active=true` filtré des DEUX côtés** (`isValidCategory` dynamique ET décision D2), même source.
6. **`affiliate_allowed` non mutable hors server action** : pas de policy UPDATE client → service_role only.
7. **Parité testée séparément** : 12 valides (anti-POST) ET 9 affiliées ; échec si divergence d'un caractère.
   Jointure D2 par **nom canonique == `products.category`** (octet-pour-octet, accents/casse/espaces).
8. **Catégories système protégées** : `'Autres'` (fail-safe `normalizeCategory`) + tout slug référencé par des
   `products` → non supprimables / non désactivables. Désactivation ne mute **aucun** `products.affiliate_enabled`.
9. **Audit immuable append-only** de chaque toggle `affiliate_allowed` (acteur, timestamp, ancien→nouveau,
   motif). Aucune mutation sans ligne d'audit corrélée. À concevoir AVANT le panneau admin.
10. **Garde miroir préservée** : le panneau admin ne peut JAMAIS forcer `affiliate_enabled=true` sur un produit
    `source_supplier_product_id != null` (`!isMirrorProduct` reste la dernière barrière, anti double-marge 14/06).
11. **Pas de re-dérivation rétroactive** : passer une catégorie `false→true` ne recalcule/réécrit aucun capital
    ni commission de produits existants sans re-save explicite et tracé.
12. **service_role jamais au client** (règle d'or 6) : lecture via client anon/auth (RLS SELECT), mutations en
    service_role cantonnées aux server actions.
> **Dettes signalées hors-scope (NE PAS aggraver)** : (a) `products.ts:184-187` permet déjà `marge=0` en affilié
> sans blocage (règle « marge>0 » non appliquée) — dette finance pré-existante ; (b) `affiliate_enabled NOT NULL
> DEFAULT true` (mig 007) fail-OPEN base — envisager `DEFAULT false` à terme.

### ÉTAPE 3 — Échelle ⬜ *(plus tard — un seul chantier à la fois)*
> Industrialiser l'entrée produit, les commandes et la logistique.

- ⬜ **Import multi-produits** : album Telegram (`media_group_id`) · vrai `.xlsx` · IA appliquée au bulk · extraction catalogue PDF
- ⬜ **Bot Telegram conversationnel** (relance le fournisseur quand une info manque)
- 🔄 **Gestion commandes « Deliveroo » B2B** : LOTs 1-4 ✅ (FSM, assignation, lien fournisseur, moteur cash livraison) · **LOT 5** alertes visuelles retard/bloqué ⬜ · **LOT 6** cloche notifications UI ⬜ (notif assignée/admin/pays déjà en prod) · automatisation + escalade hiérarchique (worker cron) ⬜
- 🔄 **Agents de sourcing par pays** (SECTION 2) : `agent_countries` (mig 078) ✅ · perf/alertes/compte-rendu ⬜
- ⬜ Stock multi-entrepôt par pays · commande sourcing 2 lignes · branchement courier API · transport DDP variable/auto-calculé
- ⬜ **Commande directe SANS lien d'affiliation** (saisie manuelle + import Sheet/CSV) — B1
- ⬜ **WMS** — traçabilité stock par scan QR · **Relevés/rapports partenaires** PDF + QR de vérification
- ⬜ Système d'abonnement / paiement automatique (Stripe)

---

### 🔄 CHANTIER V5-bis — stock fournisseur multi-modes (branche `feat/supplier-stock-multimodes`, NON mergé)
- **V5-bis.1** ✅ `e795de0` (mig 104, additif, @security GO, LOCAL only) — `stock_mode`/`stock_quantity_updated_at`/`variant_id` + vue redacted étendue.
- **V5-bis.2/C2** ✅ `081cada` — fraîcheur 3 paliers (frais/surveille gris/confirmer orange), seuils 72h/336h. @security léger GO.
- **V5-bis.2/C4** ✅ `3e7a771` — affichage séparé « Dispo immédiate » (propre miroir) + « Dispo fournisseur », badge « Sur commande ». Jamais de somme. @finance GO + @security GO.
- **V5-bis.3** ✅ `739ffd2` — bot Telegram (`stock_mode='telegram'`) + saisie manuelle fournisseur (`updateSupplierStock`, isolation double-clé) + `StockUpdateForm`. @security plein GO + @finance GO.
- **V5-bis — RUNTIME VERTS** ✅ 2026-06-26 — vérif runtime LOCAL (règle #8) : tester n°1 marketplace C2/C4 ×FR/AR/EN = 21/21 Playwright + 10/10 unit ; tester n°2 Telegram/manuel/recalcul 20j→frais = 20/20. Checks règle #3 : tsc 0 · build OK · vitest 315/315 · **smoke 16/16 VERT** (`marketplace/[id]` 200). **Mig 104 appliquée PROD le 2026-06-26 par Abdou.** Tests : `e2e/v5bis-c2c4.spec.ts`, `playwright.v5bis.config.ts`. Captures `scratchpad/v5bis-tester1+2/`. **Prêt pour merge — en attente accord Abdou (pas de merge/push sans son OK).**

## 🔒 DÉCISIONS FIGÉES — NE JAMAIS ROUVRIR
> Gravées avec Abdou. Toute évolution les respecte ; ce qui touche l'argent passe par
> `@finance` + `@security` + GO Abdou. *(Sources détaillées dans l'ARCHIVE + `ETAT_SYSTEME.md`.)*

- **Capital affilié (mig 073)** : prix catalogue = coût usine + marge plateforme + **emballage 10 + confirmation 10 + provision livraison 35** ; `commission = prix_vente − capital` ; au prix catalogue la commission = **0 pile**.
- **Provision livraison = 35** (fixe, incluse dans le capital, comptée **une seule fois**). Plancher livraison par ville = **Casablanca 25 / national 35**. **La livraison est TOUJOURS payée par l'affilié, JAMAIS zéro.**
- **D1** — Prix affiché à l'**UNITÉ + TOTAL du contenant** (« 40 MAD/m — Rouleau de 100 m : 4 000 MAD »).
- **D2** — Canal déterminé par la **CATÉGORIE** (affilié possible vs grossiste seul). Textile fini = affilié OUI ; tissu brut (au mètre) = grossiste seul.
- **D3** — **Paliers dégressifs = GROSSISTE UNIQUEMENT.** L'affilié ne voit JAMAIS les paliers.
- **2 CANAUX = 2 MODÈLES ÉCONOMIQUES SÉPARÉS** : grossiste = paliers dégressifs, **zéro frais COD** ; affilié = capital COD (emballage/confirmation/livraison), **zéro palier**, **marge plateforme > 0 OBLIGATOIRE** (« commission incluse » interdite en affilié). **Paliers = grossiste-only, frais COD = affilié-only — JAMAIS mélangés.**
- **Marge fournisseur (Option B)** = **affichage vitrine marketplace UNIQUEMENT**, jamais le prix facturé (le facturé vient TOUJOURS du miroir catalogue).
- **Stock** : on ne bloque **JAMAIS** une commande pour stock indisponible → livraison **sur commande**. Blocage = force majeure seulement (+ excuse WhatsApp). Afficher tous les paliers même au-dessus du stock = **voulu**.
- **Livraison/ramassage** : **Mozouna ne supporte JAMAIS ce coût de sa poche** — 3 cas exclusifs (refacturé client / fournisseur facture / fournisseur offert).
- **Argent** : `numeric`/centimes entiers, **zéro `parseFloat`** sur l'argent ; ledger append-only + idempotence ; snapshots de commande immuables.

---

## 🔧 DETTES TECHNIQUES & GO-LIVE PUBLIC
> Ni features ni étapes produit, mais à solder avant ouverture grand public.
> *(Détail complet : ARCHIVE « SECTION 3 — DETTES », « GO-LIVE PUBLIC », « BLOC B ».)*

- 🔄 **Dette 073 (authenticated)** — **ADRESSÉE sur `feat/durcissement-beta-vitrine` (PRÊTE, non mergée)** : vue redacted `products_catalog_read` (mig 089, appliquée) + 10 reads non-admin repointés (calcul commission via service_role, INCHANGÉ) + policy SELECT `products` → staff-only (mig **091, à appliquer AU MERGE**). @security+@finance GO. Détail : `ETAT_SYSTEME.md`.
- ⬜ Rate-limiting sur `placeOrder` (flux public COD) *(note : routes auth/reset couvertes par le rate-limit natif GoTrue)*
- 🔄 **Durcir la confiance `metadata.role` au signup** — **ADRESSÉE sur `feat/durcissement-beta-vitrine`** : trigger `handle_new_user` durci (mig 090, appliquée) = allowlist DB {affiliate,wholesaler,supplier}, admin/agent non auto-déclarables.
- 🔄 **Reset mot de passe self-service** — **CONSTRUIT sur `feat/durcissement-beta-vitrine`** (`/forgot-password` + `/auth/callback` + `/reset-password`, anti-énumération, i18n FR/AR/EN). Note ops : ajouter `${NEXT_PUBLIC_APP_URL}/auth/callback` à l'allowlist Redirect URLs Supabase.
- ⬜ Signatures webhooks + logs d'audit
- ⬜ Import CSV `publishBulkImport` : idempotence + reporting des lignes échouées
- ⬜ **Ménage secrets de test** : comptes `TelegramTest2026!`/`AgentDemo2026!`/`AdminTest2026!` + authtoken ngrok à régénérer
- ⬜ **Rotation `SUPABASE_SERVICE_ROLE_KEY`** : la clé a été codée en clair dans un fichier de test local le 2026-06-20 (JAMAIS poussée — GitHub push protection l'a bloquée, commit réécrit) ; régénérer par prudence avant go-live (Supabase Dashboard → API keys + `.env.local` + Vercel). Cf. [[project-dette-rotation-service-role-key]].
- ⬜ Test d'intégration DB de l'idempotence réelle de `create_payout`
- ⬜ **Dette test CAT-IA-SUGGEST** : scénarios C (créer) & D (rejeter) de `e2e/cat-ia-suggest.spec.ts` = faux négatifs (Playwright + `next start` perd la session SSR après `revalidatePath`) → ajouter un **re-login `beforeEach`**. Les RPC sous-jacentes sont validées en DB (invariant `affiliate_allowed=false` confirmé). Hors gate `pnpm smoke`.
- 🔴 **ROTATION URGENTE clé Supabase** : une **Supabase Secret Key** (`sb_secret_…`) a été hardcodée par le @tester dans `e2e/sourcing-affectation.spec.ts:40` (2026-06-22). **JAMAIS poussée** (GitHub push protection a bloqué le push), commit **réécrit** (clé retirée de l'historique, remplacée par `process.env`). **La clé est néanmoins compromise (présente en local/transcript) → RÉGÉNÉRER avant tout usage** (Supabase Dashboard → API keys + `.env.local` + Vercel). Cumule avec [[project-dette-rotation-service-role-key]] (incident similaire du 2026-06-20).
- ⬜ **Dette P2 SOURCING — champ `notes` / PII auto-saisie** (lot AFFECTATION AGENTS PAR PAYS, mig 086) : le champ libre `notes` d'une demande de sourcing, saisi par le grossiste, peut contenir de la PII (tél/nom) et est visible par l'agent via `list_agent_sourcing_requests()`. Risque de **contenu** (pas de schéma — l'agent n'a aucun moyen de contacter le grossiste). @security = P2 non bloquant. À terme : champ « specs produit » structuré, OU retrait de `notes` de la RPC, OU disclaimer.
- ⬜ Stratégie i18n du **contenu DB** (noms/descriptions produits)
- 🔄 Logistique B2B grossiste = manuelle par commande (pas de moteur auto)
- 🔄 Merge/PR vers `main` (à jour ce jour ; process « un lot à la fois, GO explicite »)
- ✅ Dette 012 (anon `factory_cost`) fermée (vue `products_public_read`, mig 072) · ✅ Dette UX recensée (8 points) corrigée · ✅ Régression design `stockAvailable` + blindage qualité (husky/smoke/CI)

---

## 📦 BACKLOG / VISION — *(ne pas construire maintenant, conçu un à la fois)*
> Idées et grands chantiers conservés intacts. Détail complet dans l'ARCHIVE.

- **VISION marketplace affiliation multi-partenaires** (cœur financier 3-4 parties)
- **VIS-CANAL** — contrôle de visibilité produit par canal (levier monétisation/exclusivité)
- **PREMIUM-DIRECT** — plan « accès direct fournisseur » (~10 000 DH/mois)
- **SECTION 1** — refonte parcours fournisseur (ajout produit sans rien taper, IA)
- **SECTION 2bis-B** — fidélité grossistes (points/cadeaux, même prix de vente) → @finance
- **Galerie créatives** (Palier 2) + **génération créatives IA par crédits** (Palier 3, n8n/Remotion)
- **Filtre par niche/catégorie** (catalogue affilié) · **facturation à la sous-unité** (vendre « à la boîte »)
- **Nouveau secteur — grossistes locaux Maroc** (B2B local)
- **BACKLOG B1-B5** : saisie manuelle commande affilié · précommande usine · sourcing par upload photo · affichage par secteur · comptes fournisseurs via bot
- **Choix code-barres vs QR** (au moment du WMS)

#### ⬜ FIDÉLITÉ GROSSISTE PAR PALIERS + POINTS PONDÉRÉS MARGE — *(GROS LOT, `@finance` OBLIGATOIRE ; développe la ligne « SECTION 2bis-B » ci-dessus)*
> Programme de fidélité **B2B**, conçu pour être **AUTO-FINANCÉ** et **protéger la marge**. **Rien n'est codé.**
> Lot dédié à cadrer avec **`@finance` + `@architect`** AVANT tout code. **Statut ⬜.**

- **PALIERS (tiers)** : **Bronze / Argent / Or / Platine** selon le **CA ET la MARGE** générés par le grossiste sur une période (**trimestre / an**).
- **POINTS pondérés par la marge** : chaque commande rapporte des points **proportionnels à la MARGE générée** (pas juste le CA) → pousse les grossistes vers les **produits rentables**. **RÈGLE CLÉ** : la **valeur des récompenses** est **toujours alignée sur des seuils de marge** — **jamais offrir un cadeau qui dépasse la marge générée**.
- **AUTO-FINANCEMENT** : seuils fixés **juste au-dessus du point de rentabilité** → l'achat supplémentaire pour débloquer la récompense **paie la récompense**. **Minimum d'achat** pour participer (protège la marge).
- **RÉCOMPENSES échelonnées** : petits paliers = **coupons / bons d'achat partenaires / livraison offerte** ; gros paliers (top grossistes) = **téléphone, billet d'avion, Omra, voyage**.
- **AVANTAGE COMPTABLE** : cadeaux passés en **frais / dépenses déductibles**.
- **PARTENAIRES** : sous-système **coupons / bons d'achat** chez des partenaires.
- **AFFICHAGE** : zone **« Mon compte / Fidélité »** du dashboard grossiste (**place déjà prévue** par la refonte HUB 3 zones) — **niveau actuel, points, prochain palier, barre de progression**.
- **⚠️ POINTS SENSIBLES (argent réel)** : calcul **sur marge par commande** (donnée capital / coût usine **déjà en base**), récompenses à **forte valeur** (Omra / billet), **ratio points ↔ valeur**, **intégration comptable**. **`@finance` doit cadrer le ratio AVANT tout code** et garantir que le programme reste **profit-positif** (chaque récompense **< marge incrémentale générée**).
- **Cible** : grossistes à **fort CA / marge**, fidélisation **long terme**.
- **Dépend de** : commandes + **données de marge**, profil grossiste.

#### ✅ CAT-IA-SUGGEST + PERMISSIONS MODULABLES — *(EN PROD, merge `--no-ff` `cbc1aaa`, 2026-06-22)*
> Construit en 5 sous-lots (L1-L5), 4 checks verts / sous-lot, **@security GO ×2**, **runtime @tester PASS (12/14, 2 faux négatifs d'infra de test)**. **Non-financier.** **MERGÉ + poussé `origin/main`.** Détail complet dans `ETAT_SYSTEME.md` → section dédiée.

- **Quoi** : à l'ingestion, si l'IA ne trouve **aucune** catégorie, elle **propose** une nouvelle catégorie → **file de validation** (le produit garde `'Autres'`, **filet intouché**, jamais bloqué). Un **valideur** (permission modulable) tranche : créer / ranger / rejeter.
- **Fondation** : système de **permissions attribuables/retirables** par l'admin en 1 clic, réversible (table `staff_permissions` + audit immuable + `has_capability` + RPC grant/revoke admin-only + `requireCapability`). Capacité initiale `validate_categories`. **Conçu pour héberger d'autres permissions** (→ AFFECTATION SOURCING ci-dessous).
- **Panneaux** : `/admin/categories/suggestions` (file, valideur) + `/admin/permissions` (admin attribue/retire) — i18n FR/AR/EN + RTL + mobile.
- **🛑 Argent/canal INTOUCHÉ** : nouvelle catégorie **naît `affiliate_allowed=false`** (confirmé DB) ; le toggle canal D2 reste **admin-only** (RPC `set_category_affiliate_allowed` mig 082). Migrations 083/084/085 **déjà appliquées en prod** (additives) ; `main` non mergé.
- **Décisions prises seule** (non-financières) : (a) suggestion = **sidecar** (table dédiée, pas de pollution de `categories`) ; (b) permissions = **table générique dédiée** (pas l'extension de `team_members`) ; (c) écriture valideur via **RPC SECURITY DEFINER capability-gated** (pas d'élargissement RLS de base) ; (d) lecture file = **RPC redacted** (mig 085) car l'agent n'a pas la RLS `supplier_products`. **Dette test** : re-login `beforeEach` aux scénarios C/D de `e2e/cat-ia-suggest.spec.ts`.

#### ✅ AFFECTATION AGENTS DE SOURCING PAR PAYS — *(EN PROD, merge `--no-ff` `4751d5f`, 2026-06-22 ; NON-FINANCIER)*
> Construit en 3 sous-lots (A DB / B UI admin / C vue agent). **Migration 086 appliquée en prod.** **@security GO ×2** (DB + couche UI/actions, 0 P0/P1). **@tester runtime PASS 6/6 + 24 tests unitaires** (isolation pays prouvée, zéro PII, réaffectation CN→TR temps réel, i18n FR/AR/EN+RTL+mobile). **4 checks verts.** **MERGÉ + poussé `origin/main`.**

- **AFFECTATION AGENTS DE SOURCING PAR PAYS** — l'admin **affecte un agent à un pays** (Chine / Turquie / Égypte / Dubaï) ; les **demandes de sourcing de ce pays arrivent automatiquement à l'agent affecté**. **Réaffectable à tout moment** (un agent passe de Chine à Turquie **en un clic**, le flux suit). Repose sur le **système de rôles/permissions modulables de CAT-IA-SUGGEST**. **Non-financier. Lot dédié.**
- **Réutilise** `agent_countries` (mig **078**, RLS admin-only, déjà EN PROD pour la notif superviseur pays `257ae51`) — référentiel unique agent↔pays pour les 2 flux. **Rien reconstruit.**
- **Mig 086** : colonne `sourcing_requests.target_country_code` (ISO, dérivée server-side du nom FR + backfill) ; capability **`manage_country_sourcing`** (attribuable/retirable admin, comme `validate_categories`) ; RPCs admin-gated **`link_/unlink_agent_country`** auditées (table `agent_country_audit` append-only immuable) ; RPC redactée **`list_agent_sourcing_requests()`** (gate capability, filtre pays live, **ZÉRO PII grossiste**) + `list_agent_country_codes()`.
- **UI** : `/admin/sourcing/agents` (admin : toggle capability + cases pays CN/TR/EG/AE par agent, réaffectation 1 clic) + `/admin/sourcing/my-requests` (agent : demandes de SES pays uniquement, redactées). i18n FR/AR/EN + RTL + mobile.
- **Décisions prises seul** (non-financières) : (a) pays normalisé en **code ISO server-side** (pas de table d'alias) ; (b) routage = **lecture live `agent_countries`** (agent NON stocké sur la demande → réaffectation temps réel sans migration de données) ; (c) agent passe **exclusivement par RPC redactée** (pas de policy SELECT de base sur `sourcing_requests`) ; (d) panneau = **2ᵉ toggle codé en dur** (pas de généralisation du panneau permissions) ; (e) `MA` reste en allowlist DB (défense profondeur) mais **UI = 4 pays internationaux**.
- **Dette notée** (P2, non bloquant) : le champ libre `notes` d'une demande (saisi par le grossiste) peut véhiculer de la PII auto-saisie, visible par l'agent — risque de **contenu** (l'agent n'a aucun moyen de contacter le grossiste, ni id/nom/tél exposés). À terme : champ structuré séparé ou disclaimer. À traiter dans un lot ultérieur.

#### ⬜ PROGRAMME WMS — CONTRÔLE STOCK & ANTI-FRAUDE — *(PROGRAMME structurant, plusieurs lots ORDONNÉS, à construire LOT PAR LOT ; @architect AVANT chaque lot)*
> **Rien codé. Tous les lots ⬜.** Vrai **WMS** (Warehouse Management System). **CONTEXTE** : **3 canaux de demande sur le MÊME stock physique** — **ecom perso** (géré dans **Egrow CRM**, qui ne gère PAS le stock), **affilié** (COD), **gros** (sortira le plus). **Plusieurs sociétés de livraison** possibles (Ozone OU autre). **Tout repose sur le système de permissions modulables** (`CAT-IA-SUGGEST`, **FAIT/EN PROD**). **Objectif global : 0 fuite, personne en confiance aveugle** (personnel / transporteur / fournisseur). **Construire WMS-1 D'ABORD** (socle). **WMS-5 touche l'argent → circuit `@finance` + `@security`.**

- **🔄 WMS-1 — STOCK CENTRAL UNIFIÉ** *(socle, PRÉREQUIS de tout le reste — branche PRÊTE + 3 ajouts finalisés, NON MERGÉE, attend GO Abdou)* : un **compteur de stock UNIQUE par produit**, **décrémenté par les 3 canaux** de vente (ecom perso, affilié, grossiste), **chaque sortie attribuée à son canal**. **Empêche la survente.** **CARTO D'ABORD** : vérifier si une gestion de stock existe déjà (champs `stock_quantity`/réservations/mouvements) — **si oui, l'étendre ; sinon construire le socle** (table de mouvements append-only + stock dérivé). Ne pas reconstruire l'existant.
  - **🔄 CARTO FAITE (2026-06-23) + 🛑 STOP DÉCISION ABDOU — aucun code écrit, aucune branche.** L'existant couvre DÉJÀ une grande partie : compteur central `products.stock_count` (`001:35`, `CHECK >= 0`), décrément **atomique** `reserve_stock` (`004:70`, `SELECT … FOR UPDATE`, retourne false si insuffisant), réintégration `restore_stock` (`004:83`), câblés COD (`orders.ts:531-548`, RPC `confirm_cod_order` 088) + gros (RPC `transition_wholesale_order_status` 061/065) — décrément au passage `pending→confirmed`, jamais à la création. **MANQUE réellement** : table **mouvements append-only** (n'existe pas), **attribution par canal** (pas de colonne `channel`/`source` sur les commandes ; seul `affiliate_id` discrimine), canal **ecom_perso/Egrow** (100 % externe = WMS-2), capacité **stock** dans `staff_permissions` (083/087). `supplier_products.stock_quantity` = stock fournisseur déclaré, **jamais décrémenté par les ventes** (snapshot figé à l'approbation miroir `supplier-mirror.ts:134`).
  - **✅ DÉCISION ABDOU = OPTION A** (jamais refuser une vente + tracer/alerter) → conforme à la règle gravée `ETAT_SYSTEME.md:201-211`. **Unification colonne = ÉCARTÉE** (non nécessaire : `stock_count` est déjà le compteur de vente unique ; `supplier_products.stock_quantity` = concept distinct).
  - **🔄 CONSTRUIT SUR BRANCHE `feat/wms-1-stock-central`, NON MERGÉ, NON POUSSÉ (attend GO Abdou).** Migrations **092** (table `stock_movements` append-only RLS deny + `record_stock_movement` SECURITY DEFINER + capacité `manage_stock`/volet `stock`), **093** (`DROP CHECK stock_count>=0` ; `reserve_stock`/`restore_stock` étendus canal+order+actor, ne refusent plus, journalisent, oversell→alerte `notifications` ; `confirm_cod_order` 088 + `transition_wholesale_order_status` 065 ne RAISE plus `insufficient_stock` ; **zéro colonne financière touchée**), **094** (`adjust_stock_manual` gardé `manage_stock`, actor=`auth.uid()`). Code : `src/app/actions/orders.ts` (blocs stock only), `stock.ts` (action `adjustStock` zod+capability), `_guards.ts`, `catalog.ts`. Canal `ecom_perso` **provisionné dans l'enum, NON câblé** (= WMS-2). **@finance GO** (zéro impact prix/commission/ledger) · **@security GO** (atomicité FOR UPDATE conservée, RLS append-only, P1-A forge ledger + P1-B alerte affilié + P2-B actor corrigés) · **@tester 7/7 PASS runtime** sur Supabase LOCAL (décrément ; anti-race no-lost-update stock final -1 exact ; never-refuse ; alerte oversell affilié `order_id`=NULL+payload ET gros `order_id` rempli ; réintégration ; forge ledger bloquée 401 ; actor non falsifiable). **4 checks verts** (tsc 0 / build / vitest 305 / smoke 20/20). Scripts : `scripts/test-wms1-stock-runtime.mjs`. **Migrations appliquées en LOCAL uniquement — `supabase db push` prod = GO Abdou.**
  - **✅ 3 AJOUTS FINALISÉS (2026-06-24) — migration `095` + frontend** (commits `495ffed` + `2570c7b`) :
    - **AJOUT 2 — taxonomie métier des raisons** : `vente_affilie`/`vente_gros`/`vente_ecom` (ventes système, par canal) + `cadeau`/`casse`/`echantillon`/`perte`/`retour`/`reappro` (manuelles). **L'oversell n'est plus une reason** (condition `balance_after<0`). `reserve_stock`/`restore_stock`/`adjust_stock_manual` recréés ; `adjustStock` valide `reason` (zod+RPC, `vente_*` rejetées).
    - **AJOUT 1 — jamais refuser, jamais en silence** : pré-checks de création RETIRÉS (`orders.ts`, `cart.ts`) → flag `warning:'restocking'` + **bannière frontend non bloquante** (noir & or) sur les 3 flux (COD/affilié/panier ×2), **i18n FR/AR/EN + RTL**, affichage pur. → **résout l'ancienne incohérence Option A « pré-checks de création ».**
    - **AJOUT 3 — socle Gardien IA** : table `stock_anomalies` append-only immuable (RLS deny, SELECT admin/`manage_stock`) + `record_anomaly()` DEFINER REVOKE total + 3 hooks (`oversell`, `abnormal_loss` ≥20/24h, `repeated_adjust` ≥10/24h) → notif admins `event='stock_anomaly'` sans PII/montant.
    - **@finance GO** (zéro impact argent) · **@security GO zéro P0/P1** (deny par défaut, immutabilité, REVOKE record_anomaly, actor non falsifiable, RLS isolée, pas de fuite PII ; 2 nitpicks corrigés) · **@tester** runtime : `test-wms1-stock-runtime.mjs` **7/7** (taxonomie 095) + `test-wms1-095-runtime.mjs` **35/35**. **4 checks verts** (tsc 0 / build / vitest 305 / smoke 20/20).
  - **⬜ RESTE (post-GO)** : (1) `supabase db push` prod + régénérer `supabase-generated.ts` ; (2) **WMS-2 Egrow** = câblage canal `ecom_perso` ; (3) **seuils Gardien IA** (20 / 10) à affiner sur données réelles ; (4) `repeated_adjust` à couvrir en runtime.
- **⬜ WMS-2 — SYNCHRO EGROW** *(dépend WMS-1)* : les **commandes ecom perso** (gérées dans **Egrow CRM**, qui **ne gère pas le stock**) doivent **décrémenter le stock central**. **⚠️ Dépend de ce qu'Egrow EXPOSE (API / webhook) — à VÉRIFIER EN PREMIER** ; **sinon saisie / scan manuel** (fallback dégradé). Cadrage technique Egrow avant tout code.
- **⬜ WMS-3 — TRAÇABILITÉ + ANTI-FRAUDE SCAN** *(dépend WMS-1, MULTI-TRANSPORTEUR)* : **scan à chaque maillon** avec **qui / quand / quoi**, **scan UNIQUE anti-fraude**. Points de contrôle :
  - **ENTRÉE fournisseur/usine** : scan réception, **quantité reçue vs facturée → alerte écart** (anti-fraude **fournisseur**).
  - **SORTIE personnel** : chaque sortie scannée **+ attribuée à l'employé** (anti-fraude **interne**).
  - **SORTIE transporteur** : **remise officielle horodatée** à **UN** transporteur (Ozone OU autre — **multi-sociétés de livraison**).
  - **RETOUR transporteur** : **scan à la réception réelle** pour **re-rentrer en stock** (anti-fraude **transporteur sur les retours**).
- **⬜ WMS-4 — RÉCONCILIATION & AUDIT GLOBAL TEMPS RÉEL** *(dépend WMS-3)* : **tableau de bord stock toujours juste** (**théorique vs réel**), **réconciliation PAR fournisseur ET PAR transporteur** (**sorti = livré + retourné**, **tout écart = alerte**), **audit immuable horodaté**, **« main totale » sur le stock**. Objectif : **0 fuite**, personne en **confiance aveugle**.
- **⬜ WMS-5 — DOSSIER COMMANDE GROS AUDITÉ + QR PROTÉGÉ** *(`@finance` + `@security` OBLIGATOIRE)* : **QR par commande gros** donnant accès aux **détails** (quantité, prix, **commission**, **fournisseur**, qui a **confirmé/validé/sourcé**, règlement, livraison). **⚠️ Données ULTRA-SENSIBLES** (commission/marge/identité fournisseur) **protégées par permission** — **jamais exposées au scan non autorisé**, **rien de sensible dans le QR/URL** (le QR porte un identifiant opaque, les données restent derrière une autorisation serveur).
- **Dépendances** : WMS-1 → (WMS-2, WMS-3) → WMS-4 ; WMS-5 indépendant côté flux mais **gros + argent**. **S'appuie sur** les **permissions modulables** (CAT-IA-SUGGEST) pour qui-scanne-quoi et qui-voit-quoi.

#### 🔄 VITRINE GROSSISTE INTELLIGENTE — *(branche `feat/vitrine-grossiste-perso` PRÊTE, NON MERGÉE ; AFFICHAGE/PERSO, ZÉRO argent)*
> 3 parties sur `/wholesale/marketplace`, **affichage/personnalisation pur — zéro migration, zéro écriture, lecture seule, argent intouché**. **P1** carte Maroc refondue (avantages asymétriques ⚡/🛡/💳, 3 chiffres réels câblés, bouton or pleine largeur). **P2** reclassement par **niche** détectée depuis le comportement réel du grossiste (achats/panier/devis/échantillons) via `src/lib/wholesale/detect-niche.ts` — **RLS-safe (auth.uid() seul, jamais de buyer_id client, pas de service_role)** ; boost de tri **borné (+10) actif uniquement sans filtre catégorie/origin** ; cold-start → fallback neutre. **P3** bannière de tête personnalisée (niche) / générique (cold-start). **@security GO** (isolation inter-grossistes structurelle), **@tester 7/7 PASS** runtime mobile (clics réels, perso A=Textile / B=Cosmétique distinctes, cold-start générique, i18n FR/AR/EN + RTL). **4 checks verts** (tsc 0 / build / vitest 305 / smoke 20/20). Infra test opt-in (`scripts/seed-niche-test-buyers.mjs`, `e2e/vitrine-grossiste.spec.ts`, hors `pnpm smoke`) ; comptes test supprimés après run. Détail dans `ETAT_SYSTEME.md`. **MERGE EN ATTENTE GO ABDOU.**

#### 🔄 SYSTÈME DE RÔLES À 2 ÉTAGES — *(branche `feat/roles-2-etages` PRÊTE, NON MERGÉE ; volets non-financiers)*
> Construit en 6 sous-lots A-F (mig **087 + 088** en prod). **@security GO ×2**, **@finance GO ×2**, **4 checks verts**. Superviseur de volet = **bundle de capacités** (pas de table de rôle). Panneau `/admin/permissions` **data-driven** + **audit en cartes** mobiles + toggle factorisé `CapabilitySwitch`. Confirmation superviseur = **statut seul** via RPC SECURITY DEFINER `confirm_cod_order` (modèle wholesale 061) — argent/`delivered`/commission **inatteignables**, admin inchangé. **✅ E2E spec runtime FINALISÉE (2026-06-23)** : `e2e/roles-2-etages-v2.spec.ts` commité, **9/9 PASS** mobile réel + throttling (assertions E/F finalisées : E scopée à la ligne affiliée, F isolation RPC `errors.forbidden`) ; config dédiée `playwright.roles.config.ts`. **✅ Données de test prod VÉRIFIÉES PROPRES** (`scripts/cleanup-roles-test-data.mjs` : 0 résidu, 0 confirmation collatérale). 4 checks verts (tsc 0 / build / vitest 295 / smoke 20/20). Détail complet dans `ETAT_SYSTEME.md`. **MERGE EN ATTENTE GO ABDOU.**

- **SYSTÈME DE RÔLES À 2 ÉTAGES** — étend les permissions modulables existantes. **Étage 1 = SUPERVISEUR DE VOLET** (main complète sur un domaine). **Étage 2 = TÂCHE FINE** (une capacité précise). Volets : **Commandes** (confirmer COD/affilié/gros = statut, non-financier), **Sourcing** (par pays, déjà fait), **Stock** (via WMS, plus tard), **Finance** (séparé, `@finance`). L'admin attribue/retire soit un rôle de volet, soit des tâches fines, par salarié. **Audit immuable.** Repose sur `staff_permissions` (mig 083).

#### ⬜ GARDIEN IA — SURVEILLANCE 24/24 + 3 POUVOIRS — *(vision sommet, en COURONNEMENT ; `@finance` + `@security`)*
> Se branche sur tous les volets une fois construits. **Rien codé. Statut ⬜.**

- **GARDIEN IA — SURVEILLANCE 24/24 + 3 POUVOIRS** (vision sommet, se branche sur tous les volets une fois construits ; `@finance` + `@security`).
  - **POUVOIR 1 — SUPPLÉANCE** : si un superviseur humain ne fait pas sa tâche dans un délai défini, l'agent IA la fait à sa place (ou signale qu'il l'a faite).
  - **POUVOIR 2 — CALCULS AUTOMATIQUES EXACTS** : tous les chiffres (stock théorique vs réel, montants, commissions, écarts) calculés par le système, jamais à la main, exacts.
  - **POUVOIR 3 — BLOQUER + TRACER + ALERTER** : à toute anomalie (fraude, complot, écart stock, anomalie argent, retard), l'IA **BLOQUE l'action AVANT qu'elle passe** (pas constater après), identifie la **SOURCE** (quel salarié/transporteur/fournisseur), et envoie une **NOTIFICATION PERSO à l'admin seul**.
  - **NOTE D'ARCHITECTURE** : chaque volet (rôles, WMS, Finance) doit, dès sa construction, produire des **calculs exacts** et des **événements horodatés/tracés** que le Gardien consommera. **Ordre : rôles → WMS → Finance → Gardien en couronnement.**

### 🛍️ AMÉLIORATIONS UX GROSSISTE / MARKETPLACE / EXPORT — *(décidées session 2026-06-21)*
> Toutes en ⬜. **Affichage pur** sauf mention. Plusieurs dépendent des **catégories dynamiques**
> (chantier en cours) → à faire APRÈS. Aucune ne rouvre de règle financière (prix export = prix grossiste).

- ✅ **UX-G1 + UX-G2 — Refonte dashboard grossiste en HUB 3 ZONES** *(EN PROD, merge `--no-ff` de `feat/dashboard-grossiste-hub`, session 2026-06-21, affichage pur, 0 argent, 0 migration ; rendu thème clair assumé = règle dashboards clairs)*.
  **Carto existant** (`src/app/(wholesale)/wholesale/dashboard/page.tsx`, server component, 10 blocs à plat) :
  navbar · welcome · stats×4 (Total orders / En cours / Panier / **Total dépensé**) · catalogue→`/products` ·
  panier→`/cart` · commandes→`/orders` · marketplace→`/marketplace` · devis→`/quote-requests` (+3 compteurs) ·
  échantillons→`/samples` (badge) · sourcing→`/sourcing` (badge) · compte→`/account`. **Tous les liens validés existants.**
  **PLAN — réorganisation en 3 zones, mobile-first 390px, thème noir&or via tokens (`bg-primary`=or #c9a227 dark, `gold-300/500`), AUCUN lien changé de cible :**
  - **ZONE 1 ACHETER** (haut) : 2 boutons or `Stock Maroc`→`/products` + `Marché mondial`→`/marketplace` (drapeaux 🇲🇦🇨🇳🇹🇷🇪🇬🇦🇪 sous le nom) ; entrée mise en avant `Sourcing intelligent`→`/sourcing` (flux existant remonté, badge Nouveau).
  - **ZONE 2 MON ACTIVITÉ** : 2 chips chiffres réels (En cours=pendingOrders, Panier=cartItemCount→`/cart`) ; liens Mes commandes→`/orders`, Mes devis→`/quote-requests` (+3 compteurs préservés), Mes échantillons→`/samples` (badge pendingSampleCount préservé).
  - **ZONE 3 MON COMPTE** : seul lien réel `Mon compte & facturation`→`/account` (profil ICE/RC/adresse). **Aucune fausse feature** (pas de fidélité/Bronze, pas de Mes factures).
  - **RETIRÉ** : stat « Total dépensé ». **i18n** : nouvelles clés zone*/buyLocal*/buyGlobal* FR/AR/EN, reste réutilise clés existantes.
  - **Décision prise seule** : conserver les 3 compteurs devis + badge échantillons (chiffres réels existants) dans Zone 2 plutôt que les supprimer → aucune perte de donnée. Tokens sémantiques conservés (pas de couleur en dur) → pas de casse light/dark.
- ⬜ **UX-M1 — Restructuration marketplace en 3 zones (priorité mobile)** : Zone 1 *Stock Maroc*
  (1 carte + 1 bouton) / Zone 2 *Importer depuis* (pays en cartes 2 colonnes) / Zone 3 *Sourcing +
  produits*. **Supprimer** la rangée de 6 badges répétitifs + les stats en double. Thème noir & or.
  **Reporté APRÈS les catégories dynamiques** (dépend de l'affichage des catégories). *Affichage pur.*
- ✅ **UX-M2 — Filtre PAYS × CATÉGORIE sur marketplace** + réutiliser les **grandes cartes-images de
  rayon** (navigation à l'image pour acheteurs étrangers). **EN PROD (merge `9e1e4b0`)** — Partie 2 ci-dessous.
  *Affichage pur.*
- ✅ **CAT-AFF — Lot affichage dynamique des catégories** (filtres `?category=` / forms admin+supplier /
  rails / grilles / unif. des 3 `CATEGORY_ICONS`) : lire la base au lieu de `taxonomy.ts`. **Sorti
  volontairement du sous-lot 3 (D2)** pour rester **non-financier**. **EN PROD (merge `9e1e4b0`)** — Partie 1
  ci-dessous. *Affichage pur, aucun circuit financier.*

> ✅ **LOT `feat/categories-affichage-marketplace` — EN PROD (merge `--no-ff` `9e1e4b0`, 2026-06-22). 4 checks verts + runtime PASS.**
> **Affichage pur, zéro argent, zéro migration. Canal D2 / `getChannelDecision` / `isValidCategory` / capital INTOUCHÉS.**
> **PARTIE 1 (CAT-AFF)** : enrichissement du chemin de lecture public `src/lib/categories/read.ts`
> (ajoute `label_fr/ar/en/icon/image_url`, colonnes déjà seedées mig 081, RLS SELECT ouverte → **0 migration**) ;
> nouveau résolveur **server-only** `src/lib/categories/display.ts` (`getCategoryDisplayList`/`subcategoriesOf`)
> → liste 100 % sérialisable. Ordre de fallback **non-régressif** : label `i18n → DB(locale) → slug`, icône
> `CATEGORY_ICONS figé → DB → 📦`, image `CATEGORY_IMAGES → DB → ∅` → **les 12 catégories seedées rendent
> pixel-identique**, une catégorie créée en admin apparaît partout avec ses libellé/icône/image DB. Consommateurs
> branchés : `/affiliate/products`, `/wholesale/products`, `/wholesale/products/categories`, **forms admin
> (`product-form` via parents `new`+`[id]/edit`) et supplier (`submit-product-form` via `products/new`)** — les
> Client Components reçoivent la liste en **prop sérialisable** (RÈGLE #2 ✅, legacy value préservée).
> **Unification des 3 `CATEGORY_ICONS`** en une source canonique (`taxonomy.ts`) : `product-card-image.tsx`
> (prop optionnelle `fallbackIcon`) + `branding.tsx` (icônes alignées sur le canonique, volontaire).
> **PARTIE 2 (UX-M2)** : refonte `src/app/(wholesale)/wholesale/marketplace/page.tsx` en **3 zones** mobile-first
> (ZONE 1 Stock Maroc · ZONE 2 Importer depuis = 4 pays en `grid-cols-2` mobile · ZONE 3 Sourcing + nav catégorie
> en grandes cartes-images + grille produit, **filtre combiné PAYS×CATÉGORIE** `?origin=…&category=…`).
> **SUPPRIMÉS** : rangée de 6 badges trust répétitifs + stats en double. Libellés pays passés en i18n
> (`countryTurkey/China/Egypt/Dubai*` FR/AR/EN). **PROTÉGÉ/INTACT** : `MarketplaceProductCard` (cartes/CTA/prix),
> sources de données, discriminant `__source` server-only, routage détail. Thème noir & or conservé.
> **Vérif** : tsc 0 / build OK / **263 tests** (dont parité D2 + seed + read) / smoke **20/20** ; `@tester` runtime
> **PASS** mobile 390px FR/AR/EN + RTL (`dir=rtl` OK, 0 débordement), 22 captures `.nav-proofs/cat-marketplace/`.
> **Note `@backend-db` (non bloquant, pré-existant)** : `__source` apparaît dans le payload RSC inline (valeur
> `supplier`/`internal`, **pas de donnée sensible**, jamais visible/attribut) — si exclusion totale souhaitée,
> reconstruire l'objet passé à la carte sans `__source` (passer `productUrl` déjà calculé). **MERGÉ EN PROD `9e1e4b0`.**
- ⬜ **EXPORT-VISION — Marketplace = vitrine Maroc + hubs vers le monde** : **prix export = MÊME prix
  grossiste qu'au Maroc** (confirmé Abdou, pas de @finance lourd). Idées : badge **« Stock Maroc —
  disponible à l'international / livraison mondiale »** ; **détection du pays de l'acheteur** pour
  adapter le wording (*Import vers [pays]*). ⚠️ La **détection pays = lot dédié plus profond** (touche
  profil / inscription), à cadrer séparément.
- ⬜ **CAT-IA-SUGGEST — Détection & suggestion de catégorie par l'IA à l'ingestion** (Telegram + upload
  catalogue). *Dépend du chantier **catégories dynamiques** (FAIT).* Lot dédié à cadrer (**@architect +
  @security** pour le rôle superviseur).
  - À l'ingestion, l'IA vérifie si le produit correspond à une **catégorie existante** (lecture base) →
    si oui, elle le **lie**.
  - Si **AUCUNE catégorie ne correspond**, au lieu de tomber dans « Autres », l'IA **PROPOSE une nouvelle
    catégorie** (ex. « Électroménager », « Construction/BTP ») et met le produit dans une **FILE DE
    VALIDATION** en attente.
  - Un **VALIDEUR** — l'admin (Abdou) **OU un SUPERVISEUR dédié** (nouveau rôle avec droit de valider les
    catégories) — voit la suggestion dans un panneau et **tranche** : créer la nouvelle catégorie, ou
    ranger le produit dans une catégorie existante.
  - **But** : encaisser un max de fournisseurs sans rien perdre dans « Autres », tout en gardant une liste
    de catégories **PROPRE** (zéro doublon, validation humaine).
  - ⚠️ **Implique** : une **file de suggestions de catégories** + un **nouveau rôle « superviseur »**
    (droits intermédiaires). Le **toggle `affiliate_allowed` reste réservé à l'admin** (sensible/argent).

---
---

# 📚 ARCHIVE / HISTORIQUE DÉTAILLÉ (verbatim — NE RIEN SUPPRIMER)

> ⬇️ Ci-dessous : **l'intégralité du contenu d'origine** de la feuille de route, conservé
> **mot pour mot** (états de session, lots Deliveroo détaillés, audits, journal purge money,
> dette UX, transport DDP, PHASES, ROADMAP multi-pays, BACKLOG, VISION, SECTION 3 dettes).
> Le sommaire en tête de fichier indexe ces sections. **Aucune ligne n'a été retirée.**

# FEUILLE DE ROUTE — Finir le SaaS d'affiliation comme un pro

**Principe :** une phase à la fois. Chaque phase finit par un checkpoint où **tu valides** avant de passer à la suite. On ne reconstruit jamais ce qui marche.

---

## === 📸 BILAN PLATEFORME + PLAN (19/06) ===
> Vue d'ensemble « patron », en français simple. Photo réelle de Mozouna au 19/06.

### ✅ CE QUI MARCHE (en prod, utilisable aujourd'hui)
- **Réception de produits par Telegram** : le fournisseur envoie photo + description (FR/AR/darija), l'**IA devine nom / prix / catégorie / stock / unité de vente** ; produit en attente de validation.
- **L'IA distingue bien le produit du conditionnement** (« carton de 50 boîtes », « sac de 10 kg », « rouleau de 100 m ») — plus d'inversions ni de doublons.
- **Validation → mise au catalogue automatique** : approuver un produit Maroc en stock crée un vrai produit commandable, avec prix + unité (**miroir réparé le 19/06**).
- **Commandes reçues sur Telegram** (admin + superviseur pays), sans données privées acheteur.
- **Espace grossiste** : quantité min, stock, prix, **paliers dégressifs + économies** (« tu économises X »).
- **Espace affilié** : **commission** + **prix de revente conseillé**.
- **Affichage prix à l'unité + conditionnement** (« carton de 50 boîtes — ≈ X / boîte »).
- **3 langues FR / AR / EN**, arabe propre (sens de lecture, prix bien placés).
- **Moteur d'argent** (commission / capital / paiement à la livraison) + **import CSV fournisseur**.

### ⚠️ À FINIR (impact client)
- **Photos ne suivent pas le miroir d'approbation** → catalogue avec **initiales au lieu d'images** ; parfois photo liste ≠ détail. → **MOYEN, sans argent.**
- **Prix unité vs total trompeur** : un rouleau de 100 m = 4 000 MAD pas toujours montré → risque de malentendu/litige. **Décision 1 prise** (montrer unité ET total), **à construire**. → **MOYEN, touche l'affichage prix.**
- **Paliers fournisseur non reportés** automatiquement au catalogue → **re-saisie manuelle**. → **MOYEN, touche l'argent.**
- **Deux flux de publication non coordonnés** (Approuver = prix B2B vs Finaliser = prix affilié) → **sécurisé (ne plante plus)** mais **modèle propre à décider**. → **MOYEN/GROS, touche l'argent.**

### ❌ PAS ENCORE FAIT
- **Envoi multi-produits** (album Telegram / Excel réel / extraction PDF). → GROS, sans argent.
- **Bot conversationnel** qui relance le fournisseur quand une info manque. → GROS, sans argent.
- **Canal auto par catégorie** (Décision 2 : textile fini = affilié, tissu brut/agro = grossiste seul). → MOYEN/GROS, touche l'argent.
- **Rayons de navigation par familles** (Agroalimentaire, Textile, Électronique…). → MOYEN, sans argent.
- **Facturation à la sous-unité** (vendre « à la boîte » plutôt qu'au carton ; aujourd'hui affichage seulement). → GROS, touche l'argent.

### 🎯 PLAN — 3 PRIORITÉS DANS L'ORDRE
1. **Faire suivre les photos au catalogue** (ce que le client voit en premier). → **sans argent, MOYEN.**
2. **Prix unité + total clair** (éviter les litiges rouleau/carton). → **affichage prix, prudent.**
3. **Canal par catégorie** (range la publication, supprime le doublon 2 prix). → **touche l'argent, prudent.**

---

## === 🗓️ ÉTAT FIN DE SESSION 16/06 ===
> Code prod = **`628d8c7`**, base = **migration 073**.

### ✅ DÉPLOYÉ EN PROD (`628d8c7`, base migration 073)
1. **Catalogue affilié 2 niveaux** — catalogue léger (grille) + **fiche détaillée `[id]`**, thème **noir & or** cohérent avec le marketplace.
2. **Garde-fou pre-push build à froid** — `rm -rf .next && next build` dans le hook pre-push pour attraper avant push les erreurs type Vercel (régression `no-html-link-for-pages` du merge Palier 1).
3. **RÈGLE CAPITAL AFFILIÉ corrigée** (audits `@finance` + `@security` GO, **migration 073**) :
   - **prix catalogue = usine + marge% + emballage + confirmation + provision livraison 35**.
   - **commission affilié = prix_vente − capital** ; **au prix catalogue = 0 pile** (Option B : marge arrondie comme le capital, aucune fraction versée par erreur).
   - **coût usine obligatoire** pour un produit affilié ; **découplage impossible** (prix catalogue **dérivé serveur**, champ form ignoré anti-POST).
   - **livraison comptée une seule fois** (provision fixe 35 dans le capital, plus de livraison par ville dans la commission).
   - **24 produits recalibrés** (table d'audit `products_sell_price_audit`), **non rétroactif** (snapshots commandes immuables).

### ⚠️ DETTE MINEURE notée (non bloquante)
- **Preview commission du formulaire admin** (`product-form.tsx`) calcule encore avec la **livraison saisie / `sell_price` libre** → peut afficher une commission ≠ 0 alors que le **serveur stocke 0**. **Affichage admin seulement, aucun impact ledger.** À corriger plus tard.

### 🔜 RESTE BACKLOG
- **Frais emballage/confirmation** à finaliser (confirmation conditionnelle, cf. commande directe).
- **Commande directe SANS lien d'affiliation** (saisie manuelle + import CSV/Sheet).
- **Traduction IA du contenu produits** (nom + description, à l'approbation).
- **Galerie créatives** (Palier 2).
- **Génération IA payante par crédits** (Palier 3).
- **Mobile / images** (A5).
- **OTP WhatsApp** (inscription, P3).
- **🏗️ CHANTIER DÉDIÉ (différé) — dette factory_cost AUTHENTICATED** : la policy `"products: authenticated read active"` (migr. 001) laisse tout utilisateur **authentifié** (affilié/grossiste) lire `factory_cost_mad`/marge/coût directement sur la table `products`. **Sévérité : exposition authenticated-only — RÉELLE mais NON critique** (l'anon est déjà fermé par la vue `products_public_read`, migr. 072 ; **aucun trou d'argent** — audit e2e `AUDIT_FINANCIER_E2E.md` = finance saine).
  - **Tentative 2026-06-16 ARRÊTÉE (option C, Abdou)** : approche « vue redacted + resserrement policy `→ my_role()='admin'` » (migration **075**, branche locale `feat/dette-factory-cost-authenticated` — **NON mergée, NON poussée, 075 NON appliquée**). **Rayon de souffle trop large** découvert : resserrer la policy casse **toutes** les lectures `products` en session user — **directes ET imbriquées** (`product:products(...)`, PostgREST applique la RLS aux embeds) — pour affilié/grossiste **ET agent**. **~13+ fichiers** : panier grossiste (`wholesale/cart` → **crash**), `affiliate/orders`, `wholesale/orders`+`[id]`, 3 pages `quote-requests`, + **chemin agent** (`createWholesaleOrderFromCart` `allowAgent` + pages `(admin)/*` à embed produit vues par un agent).
  - **À reprendre comme chantier dédié** avec **CARTOGRAPHIE EXHAUSTIVE en amont** : recenser TOUS les reads `products` (directs `.from('products')` **+ embeds `product:products(...)`**) × chaque rôle (affilié / grossiste / **agent** / admin) AVANT de toucher la policy. Re-router chaque read non-admin via `createAdminClient()` (colonnes non sensibles) ou la vue whitelistée. Alternative à évaluer : **GRANT/REVOKE niveau colonne** (plus chirurgical, à re-valider @finance+@security). Travail de la tentative 1 préservé sur la branche locale.
- **Dette — transport devisé non refacturé** : à la conversion d'un devis (`convertQuoteToOrder`), le `total_amount` ne couvre que la marchandise (`quoted_unit_price_mad × quoted_quantity`) ; le **transport devisé** (`quoted_transport_total_mad`) n'est **PAS** refacturé à l'acheteur dans `total_amount` (il reste capté côté coûts via le trigger 025). **Décision produit à trancher** : refacturer le transport à l'acheteur, ou le garder en coût interne uniquement. Signalé par @finance lors de l'audit M-1 (2026-06-16).

---

## 📋 REMARQUES CATALOGUE AFFILIÉ (à traiter) — ne pas oublier
> Cible : **catalogue affilié** = `src/app/(affiliate)/affiliate/products/page.tsx`.
> Consigné le **2026-06-16**. **Rien n'est codé** ici — c'est un backlog permanent à traiter plus tard.
> Les points 8-10 touchent l'**argent** → circuit `@finance` + `@security-reviewer` + validation Abdou AVANT tout commit (cf. RÈGLES ABSOLUES).

### 🪝 HOOK PROFIT AFFILIÉ — corriger l'incitation du catalogue (PRIORITÉ HAUTE — Sprint 3 conversion)

> Problème réel constaté par Abdou. **UI/affichage uniquement — aucun calcul d'argent modifié.** Lié au simulateur de profit affilié déjà prévu au Sprint 3.

- **PROBLÈME** : sur la fiche produit affilié (`/affiliate/products/[id]`), le champ « Mon prix de vente » dit « Min. 149 MAD / Laissez vide pour réinitialiser au prix catalogue ». **Au prix catalogue, la commission affilié = 0.** L'UI actuelle incite donc l'affilié à vendre **sans marge** — absurde, décourage la vente.
- **OBJECTIF** : remplacer cette incitation par un **HOOK** qui pousse l'affilié à fixer un prix **AU-DESSUS** du catalogue et à voir son gain. Le fait que **livraison + emballage + confirmation soient déjà inclus** dans le prix catalogue doit **MOTIVER** (l'affilié n'a rien à payer, il n'ajoute que sa marge), et **non** servir de plancher à 0.
- **À CADRER (emplacements)** :
  - (a) **Fiche produit affilié** : mini-simulateur « mets ton prix → voilà ton bénéfice par vente » + un **PRIX CONSEILLÉ** motivant.
  - (b) **Haut du catalogue affilié général** : message d'accroche « fixe ton prix, garde la différence ».
  - (c) **Supprimer/reformuler** la phrase « laissez vide = prix catalogue » qui incite à la marge zéro.
- **Nature** : UI/affichage (pas de calcul d'argent modifié). Si le simulateur **dérive** un montant de bénéfice → vérifier qu'il réutilise les calculs existants (zéro nouveau calcul de commission) ; sinon circuit `@finance`.

### 🎨 Thème & layout
1. **Thème clair (blanc) au lieu du noir & or premium** du marketplace → appliquer `theme-dark` (même fix que marketplace).
   **DÉCISION ABDOU : oui, mettre le catalogue affilié en noir & or comme le marketplace** (cohérence de marque).
2. **Cartes affichées 1 par ligne** → passer en **grille multi-colonnes responsive** comme le marketplace (plusieurs produits par ligne).
3. **Images manquantes** : gros vide gris avec initiales (SC, DM…) quand pas d'image → **placeholder élégant** cohérent avec le thème.

### 🧾 Contenu & infos de la carte affilié
4. **Description redondante** : le titre et la description répètent le nom du produit (« Sac Cuir Artisan Cabas » écrit 2 fois) → nettoyer, éviter la répétition.
5. ✅ **FAIT** (lot mobile-vitrine, `35aa5d6` + incitation Étape 1) — gain mis en avant (bloc or « Tu gagnes »), ligne « tout compris » neutralisée pour ne plus noyer l'info clé.
6. ✅ **RÉSOLU/OBSOLÈTE** — l'« encadré gris » n'existe plus : c'est aujourd'hui un encadré **vert** « tout inclus » déjà lisible (décision Abdou : ne pas toucher).
7. ✅ **DÉJÀ GROUPÉ** — sur la fiche affilié ET la fiche publique, « Stock Maroc » + « Stock : X unités » sont déjà dans un même conteneur flex (vérifié runtime).

### 💸 Logique frais (valeurs corrigées par Abdou — à implémenter via process argent / `@finance`)
> ⚠️ **Touche le calcul de commission** → circuit `@finance` + `@security-reviewer` + validation Abdou AVANT tout commit. Affichage seul interdit ici tant que la logique n'est pas validée.
8. **Emballage = 10 DH, OBLIGATOIRE toujours** (la marchandise sort du stock Abdou = coût systématique).
9. **Confirmation = 10 DH, OPTIONNELLE** : appliquée **seulement si la commande doit être confirmée** ; **PAS** appliquée si la commande est **déjà confirmée** (client déjà connu, nom + adresse en main).
10. **À CORRIGER** — actuellement affiché : **Confirmation 10 / Emballage 5 / Livraison 35**. → Porter **emballage à 10 DH** et rendre la **confirmation conditionnelle** (cf. #8-9). C'est une **correction de valeurs/logique de frais**, donc **process `@finance`** (pas un simple correctif d'affichage).

### 🆕 Commande directe SANS lien d'affiliation (NOUVELLE FONCTIONNALITÉ — priorité business)
> Consigné le **2026-06-16**. **Rien n'est codé.** Touche les **commandes = argent** → **conception validée + audit `@finance`** obligatoires AVANT tout code.
- **Cas** : un vendeur ne veut **PAS** promouvoir via lien/ads. Il a **DÉJÀ** ses clients avec leurs infos (nom, prénom, adresse).
- **Besoin** :
  - **(a) Saisie manuelle** d'une commande client — formulaire **nom / prénom / adresse / produit / quantité**.
  - **(b) Import de fichier** (Google Sheet / CSV) d'une base clients déjà constituée.
- **Frais** : ces commandes sont **DÉJÀ CONFIRMÉES** → **pas de frais de confirmation** (cohérent avec la règle confirmation optionnelle, #9). Emballage reste dû (#8).
- **À cadrer (conception requise avant code)** :
  - **Parcours UI** : où dans l'espace affilié ? (nouvelle entrée dédiée ? extension de `affiliate/orders/new` ?)
  - **Format d'import** : colonnes attendues (mapping nom/prénom/adresse/produit/quantité), gabarit CSV/Sheet.
  - **Validation** des lignes (champs requis, ville reconnue pour la livraison, produit existant).
  - **Dédoublonnage** des clients/commandes importés.
  - **Lien avec le calcul commission/frais** (confirmation OFF, emballage ON, livraison selon ville).
- ⛔ **NE PAS coder sans conception validée + audit `@finance`.**

### 💡 VISION FICHE PRODUIT AFFILIÉ — par paliers (idée fondateur Abdou)
> Vision long terme pour la **fiche produit affilié**. Consigné le **2026-06-16**. **Rien n'est codé.**
> On avance **palier par palier** — ne pas mélanger les paliers entre eux.

**PALIER 1 — Fiche produit affilié de base** *(✅ LIVRÉ 2026-06-16)*
- Lien d'affiliation + détails produit + définir son prix de vente + stats.
- **Architecture** : catalogue léger (liste) → **fiche détaillée `[id]`**.
- **Fait** : catalogue `theme-dark` noir & or, grille responsive (2 mobile → 4 xl), carte simple (image placeholder thémé + nom + commission + prix + « Voir / Promouvoir ») → `affiliate/products/[id]` (fiche : retour catalogue, image, dispo+stock regroupés, description dédupliquée, bloc commission/prix mis en avant, `AffiliatePriceForm` + `CopyLinkButton` réutilisés tels quels, frais titrés, stats, lien affilié).
- **Affichage uniquement** : `calculateNetAffiliateCommission` réutilisé à l'identique, aucun calcul argent touché. Traite les remarques visuelles #1-7 ci-dessus ; #8-9-10 (logique frais) restent réservés au process `@finance`.
- **Décision prise seule** : composant partagé `ProductThumbnail` thémé (`bg-surface-2` + initiales `text-faint` au lieu de gris codés en dur) plutôt que dupliqué → cohérent partout, bénéfique aussi en thème clair, 0 régression (marketplace n'utilise pas ce composant).
- **i18n** FR/AR/EN : `viewPromote`, `backToCatalog`, `feesTitle`, `statsTitle`, `affiliateLinkTitle`. Nouveau helper `getMeaningfulDescription` (+ test). Checks verts : tsc, vitest (162), build, smoke (20/20).

**PALIER 2 — Galerie créatives** *(ensuite)*
- Dans la fiche produit, afficher les **créatives (photos / vidéos) DÉJÀ disponibles** pour ce produit, que l'affilié peut **télécharger / utiliser** pour ses pubs **Meta / TikTok**.
- Nécessite une **bibliothèque de créatives liée aux produits**.

**PALIER 3 (RÉVISÉ) — Studio de créatives IA payant** *(module dédié — monétisation / passive income plateforme)* — *révisé le 2026-06-20*
- **CIBLE** : **affiliés ET grossistes** (pas seulement les affiliés) — chacun peut générer ses créatives pub selon sa demande.
- **PRODUIT** : une **galerie** + une option **« créer une vidéo / image IA »** directement dans l'app, en **libre-service**.
- **MODÈLE DE REVENU** : facturation **À CHAQUE génération** (par vidéo / par image) → **revenu récurrent** pour Abdou. Modèle **crédits** ou **paiement à l'unité** — **à cadrer**.
- **STACK TECHNIQUE = À DÉFINIR SELON RENTABILITÉ** (ne plus figer l'ancienne infra) : options à évaluer = **API Claude** (texte / script créatif) + un **générateur vidéo / image** (ex. **Higgsfield**, ou autre) ; l'**ancienne infra n8n + Remotion + Hostinger** reste **une option parmi d'autres**. Le choix final dépendra du **COÛT par génération vs prix facturé** (**marge**).
- **ARGUMENT DE VENTE / VISION** : **tout-en-un dans une seule app** — sourcing produit + stock + livraison + emballage + **CRÉATION DE PUB**. Le **combo complet** qui différencie Mozouna.
- **À CADRER SÉPARÉMENT (module business dédié, NE PAS mélanger avec paliers 1-2)** : modèle **prix / crédits**, **paiement**, **coût par génération** (**marge**), **file d'attente**, **connexion plateforme ↔ outil de génération**. **Process argent → audit `@finance` obligatoire avant tout code.**

### 🧭 FILTRE PAR NICHE / CATÉGORIE — catalogue affilié (idée Abdou, pour scaler avec plusieurs niches)
> Consigné le **2026-06-16**. **Rien n'est codé.** Affichage uniquement (pas d'argent touché). À faire **après les chantiers en cours**.
- **Besoin** : quand le catalogue aura beaucoup de produits dans plusieurs niches, l'affilié doit pouvoir **filtrer / choisir ses niches** pour ne voir que ce qui l'intéresse (un affilié cosmétique ne veut pas scroller le gaming).
- **Niches / catégories citées par Abdou** : cosmétique, textile homme, textile femme, gadgets, compléments alimentaires, décoration, gaming. *(Liste extensible.)*
- **2 niveaux à concevoir** :
  - **(a) Catégorisation produits** : chaque produit rangé dans une/des catégorie(s). **Vérifier si un champ `category`/`subcategory` existe déjà dans `products`** (vu dans la vue `products_public_read`) — **réutiliser plutôt que recréer**.
  - **(b) Filtre côté affilié** : barre de filtres par catégorie dans le catalogue + éventuellement préférence **« mes niches »** par affilié (profil) pour un affichage par défaut personnalisé.
- **À cadrer** : **taxonomie figée** des niches (liste admin), **UI filtre** (chips/dropdown), **filtre combinable** avec Maroc/import, **persistance** de la préférence affilié.

---

## 🚀 VISION STRATÉGIQUE — Marketplace affiliation multi-partenaires (idée fondateur Abdou)
> Consigné le **2026-06-16**. **Rien n'est codé.** **Chantier MAJEUR** (presque un produit dans le produit), **cœur financier** → conception complète + **`@finance` + `@architect` obligatoires** AVANT tout code. À planifier **après stabilisation des bases actuelles**.

**CONCEPT** : ouvrir l'affiliation à des produits de **PARTENAIRES FOURNISSEURS** (pas seulement le stock d'Abdou). Le **fournisseur** apporte produit + stock ; **Abdou/plateforme** orchestre ; l'**affilié** promeut/vend. Abdou devient **marketplace / intermédiaire**, plus seulement vendeur.

**BASE EXISTANTE À RÉUTILISER** (ne pas reconstruire) :
- **Rôle fournisseur** (marketplace fournisseurs déjà en place).
- **Miroir catalogue** (lien produit fournisseur ↔ catalogue).
- **`factory_cost`** dans le calcul de commission.
- **Règle capital** (migration 073).
- **Ledger / snapshots** (immutabilité des montants par commande).

**POINTS À CONCEVOIR / TRANCHER** (cœur financier → `@finance` + `@architect`) :
1. **Partage financier à 3-4 parties** : fournisseur (son prix) / plateforme Abdou (**commission : % ou fixe ? qui la fixe ?**) / affilié (sa marge) / frais. **Définir le modèle.**
2. **Tracking & traçabilité** : chaque commande relie **produit → fournisseur → affilié → client → montants → part de chacun**. **Ledger par commande.**
3. **Gestion stock partenaire** : mise à jour **manuelle / import / synchro** ? Que faire si **rupture côté fournisseur après une vente affilié** ?
4. **Confidentialité** (cohérent avec la règle existante) : le **fournisseur ne voit PAS les coordonnées du client final** (client d'Abdou) ; l'**affilié ne voit PAS le coût fournisseur réel**. **Cloisonnement strict des données par rôle.**
5. **Payout** : Abdou **encaisse le COD** puis **reverse fournisseur + affilié**, garde sa part. **Système de versements traçable + idempotent.**

**NATURE** : chantier majeur, **pas une feature** — concevoir **entièrement** avant tout code. À planifier après stabilisation des bases actuelles.

---

## 🔗 PRODUIT TELEGRAM → CATALOGUE COMPLET (2 canaux affilié + grossiste)
> Consigné le **2026-06-18**. Cadrage lecture seule fait (aucun code). Issue du constat : un produit
> ajouté par le bot Telegram vit dans `supplier_products` (canal grossiste-fournisseur, prix unique
> sans paliers) et **n'a aucune présence affilié** (pas de ligne `products`, pas de capital, pas de
> commission). Décision Abdou = **OPTION 1** (manuelle) maintenant ; **OPTION 3** (intégrée) plus tard.

**RAPPEL ARCHITECTURE (vérifié runtime sur `b6340464` « Pack 3 boxers MAWRI ») :**
- `supplier_products` = canal **grossiste marketplace fournisseur** : `suggested_wholesale_price_mad`
  (+ marge vitrine `final_wholesale_price_mad`). **PAS** de `factory_cost`, `sell_price`/capital,
  `commission_amount`, `wholesale_tiers`, `affiliate_enabled` (ces colonnes n'existent pas sur cette table).
- `products` = canal **affilié** (capital usine+marge+frais → commission, règle mig 073) **+ grossiste
  interne** (paliers `wholesale_tiers`). Le **formulaire admin** (`ProductForm` → `upsertProduct`)
  saisit **les deux jeux de champs** sur une seule ligne ; le pré-remplissage marche via la prop `product`.
- Pont = **miroir** `buildSupplierMirror` à l'approbation (ligne `products` minimale : nom, `sell_price=final`,
  `factory_cost=suggested`, stock). Il **ne porte ni affiliation, ni paliers**.

**🐞 BUG À CORRIGER (séparé) — miroir silencieusement cassé :** `approveSupplierProduct` fait
`upsert(..., { onConflict: 'source_supplier_product_id' })` mais l'index unique (mig 069) est **PARTIEL**
(`WHERE source_supplier_product_id IS NOT NULL`). Un `ON CONFLICT (col)` **sans prédicat** ne matche pas un
index partiel → Postgres **42P10** → upsert en erreur, attrapé en **non-fatal** (`console.error`) → **aucun
miroir créé pour AUCUN supplier_product** depuis la mig 069 (vérifié : `b6340464` n'a pas de miroir).
À confirmer via logs Vercel ou test ciblé. Correctif probable = `onConflict` avec prédicat / `merge-duplicates`
adapté. **Hors argent** (plomberie d'idempotence) — mais à valider car touche la commande directe grossiste.

**OPTION 1 (retenue maintenant — manuelle, minimale) :** depuis `/admin/supplier-products/[id]` (produit
Telegram validé), un bouton **« Finaliser dans le catalogue »** ouvre le **formulaire admin produit complet**
(le même que « Pull ref 5 »), **pré-rempli** avec ce que Telegram a déjà capté (nom, photo, catégorie,
sous-catégorie, origine, stock). L'admin complète **coût usine, marge, frais, paliers, `affiliate_enabled`**.
- **Ce qui EXISTE déjà :** `ProductForm` pré-remplissable (prop `product`) ; `upsertProduct` gère tous les
  champs + calcule capital/commission/paliers (déjà audité @finance, mig 073) ; `buildSupplierMirror` mappe
  déjà supplier_product → ébauche `products` (réutilisable comme graine).
- **Ce qui MANQUE (le plus petit ajout) :** (a) le **bouton** « Finaliser » sur la page d'approbation ;
  (b) la page `products/new` doit lire un param `?from_supplier=<id>`, charger le supplier_product et
  **mapper seulement les basiques NON-argent** (nom→`name`, `photos`→`images/media`, `category`/`subcategory`,
  `origin_country`, `stock_quantity`→`stock_count`) dans une graine `Product` passée à `<ProductForm>` —
  **id vide** (créer une NOUVELLE ligne `products`, surtout pas réutiliser l'id du supplier_product) ;
  laisser **tous les champs argent VIDES** pour saisie admin. (c) Optionnel : lien retour
  `source_supplier_product_id` + archivage/masquage du supplier_product pour éviter le **double-listing
  grossiste** (apparaît sinon 2× : branche fournisseur + branche interne).
- **PÉRIMÈTRE ARGENT :** le **pré-remplissage des basiques = plomberie UI pure** (hors @finance). Les
  **valeurs** coût/marge/frais/paliers saisies passent par le form déjà audité. **Ne PAS** auto-dériver
  `sell_price`/`factory_cost` depuis `suggested_wholesale_price_mad` sans **circuit @finance** (ce serait une
  décision de prix). Tant qu'on seede uniquement les basiques et qu'on laisse l'argent vide → pas de @finance.

**OPTION 3 (chantier FUTUR — écran de finalisation INTÉGRÉ à l'approbation) :** au lieu d'un saut vers un
form séparé, **enrichir l'étape d'approbation `/admin/supplier-products/[id]`** pour qu'elle ajoute, dans le
même écran, la **mécanique capital/commission/paliers** et des **cases à cocher de canaux** (affilié /
grossiste / marketplace), produisant directement la ligne `products` complète + le lien
`source_supplier_product_id` + le dédoublonnage grossiste. **Cœur financier** (capital, commission, paliers,
prix facturé) → **conception + circuit `@finance` + `@security-reviewer` + validation Abdou obligatoires AVANT
tout code.** Englobe aussi le correctif du miroir et la matrice produit × canal (cf. « Contrôle de visibilité
produit par canal », `ETAT_SYSTEME.md`). **NE PAS coder maintenant.**

---

## 📥 VARIER LES MODES D'IMPORT PRODUITS (s'adapter à tous les fournisseurs — à CADRER, rien codé)
> Gravé le **2026-06-18**. Idée à cadrer plus tard. **NE PAS construire maintenant.**

**EXISTANT** : l'**import CSV fournisseur** existe déjà (pipeline complet : template → validation
ligne par ligne → publication par lot → modération admin groupée). Fichiers : `src/lib/bulk-import.ts`
(Papaparse), `src/app/actions/supplier-bulk.ts`, `src/app/(supplier)/supplier/products/import/*`,
`src/lib/csv-sanitize.ts`, mig 035.

**IDÉE** : offrir **plusieurs canaux d'import** selon le **profil du fournisseur** (tous n'ont pas le
même niveau technique). Pistes à cadrer, par ordre de praticité à évaluer :
1. **Album Telegram multi-produits** : plusieurs photos d'un coup → plusieurs produits, via
   `media_group_id`. **Le plus accessible** pour fournisseurs peu techniques. (Aujourd'hui : aucune
   gestion d'album → 1 message = 1 photo = 1 produit.)
2. **Vrai support Excel (`.xlsx`)** en plus du CSV. ⚠️ Aujourd'hui le `.xlsx` est **accepté à l'upload
   mais PAS réellement parsé** (parser = Papaparse/CSV) = **piège à corriger**.
3. **IA appliquée au bulk** : le CSV **ne passe pas par l'IA** aujourd'hui (contrairement au Telegram
   1-produit où l'IA devine nom/prix/unité/catégorie).
4. **Extraction auto d'un catalogue PDF** uploadé → produits. Aujourd'hui le catalogue fournisseur est
   **seulement stocké** (bucket `supplier-catalogs`, mig 036), **pas extrait**.

**À CADRER** : lequel est le plus pratique/prioritaire, faisabilité, impact. **NE PAS construire maintenant.**

---

## 💬 BOT TELEGRAM CONVERSATIONNEL (fournisseurs analphabètes / descriptions incomplètes) — besoin Abdou, à CADRER, rien codé
> Gravé le **2026-06-19**. Chantier `@architect`. **NE PAS construire maintenant.**

Beaucoup de fournisseurs sont **peu lettrés** et envoient juste une **PHOTO sans description**, ou une
description **confuse/incomplète**. Aujourd'hui l'IA extrait **passivement** ce qu'elle trouve ; si le
prix/l'unité manque, le produit est **incomplet**.

**IDÉE** : rendre le bot **CONVERSATIONNEL** — quand une info essentielle manque ou est ambiguë (prix
absent, unité pas claire, nom vague, photo seule), le bot **RÉPOND au fournisseur** sur Telegram pour
lui demander de préciser (« Quel est le prix ? », « Ça se vend au kg ou à la pièce ? », « Combien
d'unités dans le carton ? »). Le bot **attend la réponse**, **complète** le produit, et **confirme**.
Gérer aussi : signaler **poliment** ce qui cloche, accepter des **réponses vocales/courtes**, rester
**simple** pour un public peu lettré.

**À CADRER** : machine à états du dialogue (quoi demander, dans quel ordre), gestion des réponses,
quelles infos sont **'essentielles' vs 'optionnelles'**, langue (**darija/arabe/français**), intégration
avec l'**extraction IA actuelle**. Chantier `@architect`. **NE PAS construire maintenant.**

---

## 🧭 DÉCISIONS MÉTIER Abdou — affichage catalogue + canaux (2026-06-19, à CADRER/construire)
> Gravé le **2026-06-19** suite à l'audit affichage catalogue. Décisions ACTÉES par Abdou ;
> implémentation à cadrer (certaines touchent l'argent → circuit `@finance`). **NE PAS construire
> sans valider chaque lot.** Réf. constats d'audit : P1-4 (unité/total), P1-6 (canaux), P1-2/P1-3 (paliers).

### DÉCISION 1 — Prix de l'UNITÉ-DE-VENTE + prix sous-pièce dérivé À L'AFFICHAGE
> ✅ **TRANCHÉ (Abdou, 2026-06-24) — OPTION A : AFFICHAGE UNIQUEMENT, calculs financiers INTOUCHÉS.**
> `sell_price` reste le **prix de l'UNITÉ-DE-VENTE facturée** (ce que fait déjà le code : `total =
> sell_price × quantité` ; commission par unité ; `sale_unit`/`pack_size` = affichage pur). On NE change
> RIEN aux calculs/facturation. On AFFICHE simplement, EN PLUS, le prix par sous-pièce **dérivé** via
> `pack_size` (`packPerUnitPrice = sell_price ÷ pack_size`) pour ne jamais tromper le grossiste.

L'affichage montre **le prix de l'unité-de-vente ET le prix par sous-pièce dérivé** :
- Ex. : **« Carton 4 000 MAD — soit ≈ 40 MAD / m (100 m) »** ; **« Carton 280 MAD — soit ≈ 5,60 MAD / boîte (50 boîtes) »**.
- Le client voit **CE QU'IL ACHÈTE** (l'unité-de-vente facturée) **ET le prix ramené à la sous-pièce**.
- ✅ **Pas d'inversion de sémantique, pas de changement financier** : la base facturée (`sell_price ×
  quantité`) est **inchangée**. Le prix sous-pièce est **dérivé uniquement à l'affichage** (jamais stocké,
  jamais facturé). **Aucun circuit `@finance` requis** (zéro impact code financier).
- Reste à faire (affichage seulement) : un **nom de contenant** (« rouleau », « sac », « carton ») —
  dérivation i18n depuis `pack_unit`/`sale_unit`, ou colonne additive `pack_container`. *(option B —
  facturer à la sous-pièce — écartée : nécessiterait recalibration catalogue + `@finance`.)*

### DÉCISION 2 — Canal déterminé par la CATÉGORIE (automatique, zéro coche manuelle)
Le canal (**affilié possible** vs **grossiste seul**) découle **automatiquement de la catégorie** du produit
(plus de toggle `affiliate_enabled` manuel à la finalisation).
- **PEUVENT aller en AFFILIÉ (dropshipping COD)** : textile/vêtements **(produits finis)**, cosmétique,
  électronique, gadgets/accessoires.
- **GROSSISTE UNIQUEMENT (jamais affilié)** : agroalimentaire, **TISSU BRUT** (au mètre/rouleau),
  matières premières, et **tout le reste par défaut**.
- **Nuance taxonomie clé** : **TEXTILE FINI (vêtements) = affilié OUI** ; **TISSU BRUT (au mètre) = grossiste
  seul** → il faut **distinguer ces deux dans la taxonomie** (sous-catégories séparées).
- **À CADRER** : table de mapping `catégorie → canal(aux)` (source de vérité), application **à la
  création/finalisation ET au miroir d'approbation** (cohérence des 2 flux, cf. audit P1-6), migration de
  la taxonomie pour séparer textile fini / tissu brut, et reprise des produits existants. Affichage pur côté
  canal, mais `affiliate_enabled` pilote la commission COD → **vérifier avec `@finance`**.

### DÉCISION 3 — Paliers dégressifs = GROSSISTE UNIQUEMENT
Les **paliers** sont réservés au **canal grossiste**. **L'affilié ne voit JAMAIS les paliers** (cohérent
2-canaux : affilié = vente à l'unité, pas de volume).
- Confirme le constat d'audit **P1-3** : ne PAS ajouter le hook économie côté affilié (c'est **voulu**).
- Reste ouvert (audit **P1-2**, 💶 `@finance`) : **reporter les paliers fournisseur** (`supplier_product_moq_tiers`)
  → `products.wholesale_tiers` (conversion FX + marge) pour le canal **grossiste**, aujourd'hui jamais reportés.

### NOUVEAU — Cartes de FAMILLES / filtres catégories (navigation « rayons de magasin »)
Créer de **grandes familles visuelles** de navigation sur le catalogue (comme des rayons) pour que le
**grossiste ne se perde pas** : ex. **Agroalimentaire, Textile, Électronique, Matières premières, Bricolage…**
Le grossiste **filtre par famille**.
- **À CADRER** : taxonomie des **familles** (regroupement des catégories existantes), **UI cartes/filtres**
  (catalogue grossiste + affilié), et **lien avec la règle canal-par-catégorie (Décision 2)** — une famille
  peut conditionner le canal. i18n FR/AR/EN obligatoire, RTL. Chantier `@architect` + `@frontend`.

---

## 📏 UNITÉS DE VENTE MULTIPLES (besoin Abdou — à CADRER, rien codé)
> Gravé le **2026-06-18**. Chantier à concevoir (touche affichage + extraction IA + peut-être
> calcul paliers). **NE PAS construire maintenant.**

**PROBLÈME** : les fournisseurs vendent dans des **unités différentes** — au **MÈTRE** (tissu), au
**KG** (boucher, légumes, riz, sucre, blé), au **PAQUET/PIÈCE** (sucre en paquet, unitaire), au
**CARTON/CAISSE** (sardines, conserves). Aujourd'hui **tout est en « pièce »** → inadapté.

**BESOIN** :
1. Le fournisseur décrit en **Telegram en langage naturel** (ex. « riz basmati 12 dh le kg, sac 25 kg »
   / « tissu coton 40 dh le mètre » / « sardines 8 dh le carton de 50 »).
2. L'**IA d'extraction** (caption Telegram) **DEVINE l'unité de vente** (mètre / kg / paquet / pièce /
   carton) et la **renseigne automatiquement**.
3. Le produit est rangé dans la **BONNE CATÉGORIE** pour le filtre/recherche (alimentaire, textile, etc.).

**À CADRER** :
- Champ **« unité de vente »** sur les produits (enum : mètre / kg / paquet / pièce / carton…).
- Impact **affichage prix** : `12 dh/kg` vs `40 dh/m` vs `8 dh/carton` (le suffixe d'unité partout où un
  prix est montré).
- Impact **paliers grossiste** : paliers en **kg** ? en **cartons** ? (quantité_palier exprimée dans
  l'unité de vente → le hook « économie » et le calcul lot/paliers doivent suivre l'unité).
- **Extraction IA de l'unité** depuis la caption (mapping langage naturel → enum unité ; gérer le
  « sac de 25 kg » = conditionnement vs unité de prix).
- **Taxonomie de catégories** alimentaires/textiles (étendre la taxo existante).

**NATURE** : conception transverse (affichage + extraction IA + éventuel calcul paliers). À planifier
avec `@architect` ; **si un calcul de prix/palier change de résultat → circuit `@finance`**. NE PAS
construire maintenant.

---

## === 🗓️ ÉTAT FIN DE SESSION 15/06 (nuit) ===
> État réel, sans embellissement. Code prod = **`f748732`**, base = **migration 072**.

### ✅ Déployé en prod ce soir
1. **Fix design cartes marketplace** (`theme-dark`) — commit `b9d7973`.
2. **Règle A1 affichage** : Maroc `local_stock` + stock > 0 → « Commander » (découplé du miroir) + auto-miroir & coût fournisseur pré-rempli + **migration 069** — commit `71e893d`.
3. **Fix upload preuve de paiement** : policy RLS storage bucket `order-proofs` + **migration 070** — commit `4707bb3`.
4. **Fix « Non rentable » → « Ajuste ton prix de vente »** (FR/AR/EN, affichage) — commit `ed520ab`.
5. **Affichage prix import honnête** : « hors transport et douane » + « Marge selon devis » + champ mode aérien/maritime au devis import + **migration 071** — commit `028d790`.
6. **Dette sécurité 012 (anon) fermée** : vue `products_public_read` whitelistée + **migration 072** — commit `f748732`.

### 📱 À VÉRIFIER PAR ABDOU SUR IPHONE (une fois Vercel vert)
- Cartes marketplace = design noir & or propre.
- Produit Maroc en stock = bouton « Commander ».
- Upload preuve de paiement (grossiste sur SA commande) = succès, plus d'erreur RLS.
- Plus de « Non rentable » affiché aux affiliés.
- Produit import = « hors transport et douane » + « Marge selon devis » + champ aérien/maritime au devis.
- Fiche produit publique (non connecté) = s'affiche normalement.

### 🔜 RESTE AU BACKLOG (prochaine session, à tête reposée)
- **P3** : inscription **téléphone + OTP WhatsApp (PAS SMS)** — nécessite choix fournisseur + coût, **décision business**.
- **Dette 073 (authenticated)** : `factory_cost_mad` exposé aux affiliés/grossistes — délicat, **touche le calcul de commission**, à cadrer avec prudence.
- **A5** : amélioration mobile / images iPhone.
- **A3** : sélecteur type d'activité reste en FR en mode arabe → traduire.
- **Produits actuels = FAUX** → à remplacer par les vrais.

---

## === 🗓️ ÉTAT FIN DE SESSION 15/06 ===
> État réel, sans embellissement.

### ✅ Déployé en prod (commit `71e893d`, poussé ; pre-push smoke 20/20)
- **Fix design cartes marketplace** (`theme-dark`) — liste + fiche cohérentes (plus de mix clair/noir).
- **Règle A1 affichage** : Maroc `local_stock` + stock > 0 → « Commander » (commande directe), **découplé du miroir catalogue** ; import / rupture / qty > stock → « Demander un devis ».
- **Auto-miroir catalogue** à l'approbation du `supplier_product` (`sell_price=final`, `factory_cost_mad=suggested`, marge captée une fois, idempotent) + **coût fournisseur `supplier_cost_mad` pré-rempli** à la commande directe.
- **Migration `069` APPLIQUÉE en prod** (`owvtfzxvirttrbcsiveg`, additive : `source_supplier_product_id` + index unique partiel + FK `ON DELETE SET NULL`). Code + base alignés (Local=Remote=069).
- Antérieurs même journée : merge `feat/habillage-premium` → `main` (`3ee9530`), hotfix marketplace (`894fa06`).
- Filets : backups prod du jour `~/AI-FACTORY/backups/` (schéma + data) ; rollback Vercel possible (Promote to Production d'un déploiement antérieur — la base reste à 069, un rollback de code ne la touche pas).

### 🔜 RESTE À FAIRE — prioritaire prochaine session
1. **Script backfill miroirs** pour les produits Maroc **déjà approuvés** : le miroir naît à l'approbation → les produits antérieurs n'en ont pas. Sans backfill, ils affichent « Commander » mais le serveur renvoie « pas encore dispo → devis » (repli sûr, pas un crash). Script idempotent (réutilise `buildSupplierMirror` + UPSERT onConflict), à auditer avant exécution.
2. **Produits actuels = FAUX (données de test)** → à **SUPPRIMER** pour mettre les vrais produits.
3. **Chantier A5 — mobile / images (iPhone)** : amélioration expérience mobile + optimisation images. **PAS encore commencé.**
4. **Dette 012** (`factory_cost_mad` exposé à `anon`) : à fermer **AVANT go-live public** (BLOC B).

## === 🔴 RETOURS PROD 15/06 (soir) — à traiter, sans casser le déployé ===
> Retours d'Abdou après test prod du soir. Classés par priorité. **Rien codé** — documentation
> seule. À traiter prochaine session SANS régresser le déployé (`71e893d` + migr. 069).

1. **[P1] BUG upload preuve de paiement — `new row violates row-level security policy`** (storage).
   Le client COD **ne peut pas envoyer sa preuve de paiement** → **BLOQUANT**. Cause probable :
   policy RLS du **bucket storage** manquante/incorrecte pour l'INSERT par l'utilisateur authentifié.
   → Corriger la policy storage (insert par `auth.uid()` sur le bon bucket/chemin), **tester un
   upload réel**. ⚠️ Touche RLS → audit `@security`.

2. **[P1] « Non rentable » affiché à l'affilié** (badge rouge « Commission de base : Non rentable »).
   Message **interne** qui ne doit **JAMAIS** être montré tel quel (impression amateur). Solution :
   masquer ce libellé côté affilié **OU** le reformuler en message constructif (« Ajuste ton prix de
   vente pour dégager une marge »). **Wording à décider avec Abdou.** Pur affichage (pas de calcul).

3. **[P2] Produits IMPORTÉS — ne PAS afficher prix de vente ferme + marge estimée** tant que
   transport + douane sont inconnus (la marge affichée est **fausse**, trompe l'affilié). Cible :
   produit import → afficher **« Prix sur devis »** sans marge chiffrée ; la demande de devis exige
   **quantité souhaitée + mode d'expédition (aérien/maritime)** ; le devis renvoyé inclut transport +
   douane. **Chantier UX devis import à cadrer** — touche l'affichage prix/marge des produits
   non-`local_stock`. ⚠️ Touche argent (marge) → circuit `@finance` au cadrage.

4. **[P3] Inscription par TÉLÉPHONE + OTP SMS** (comme les SaaS pro), en plus de email/Google.
   Amélioration conversion onboarding. À cadrer (fournisseur SMS, coût, vérif OTP, anti-abus).

---

## === 🎯 PLAN D'ACTION MAÎTRE — source unique de vérité ===
> Sommaire consolidé créé le 2026-06-15. **NE duplique PAS** le détail : chaque point renvoie
> à sa section existante (TITRE + ligne `≈` indicative — les lignes glissent à chaque édition,
> se fier au TITRE). **Aucun contenu existant supprimé** : ceci n'est qu'un index ordonné.

### 🥇 RÈGLE D'OR
> **Un seul chantier à la fois, jamais en parallèle.** Ordre strict : **BLOC A → BLOC B → BLOC C**.
> Ne pas démarrer un nouveau chantier tant que le précédent n'est pas fini ET validé.

### BLOC A — CORRECTIONS PROD (retours test 15/06, priorité immédiate)
> Détail : « === RETOURS TEST PROD MOBILE (15/06) === » (≈ L58).
- **A0** ✅ **[FAIT]** Bug serveur `/wholesale/marketplace/[id]` (digest 3098525211) → mergé `main` `894fa06`, en prod.
- **A1** Règle métier Maroc (qty ≤ stock → **commande directe** / qty > stock → **devis / confirmation équipe**, **jamais « pas disponible »**) + Import (Chine / Turquie / Égypte / Dubai) → **toujours devis** + mention « transport calculé après, variable » + **supprimer la contradiction UI** (bloc « Commander » + message rouge affichés ensemble). → cf. RETOURS TEST pt 2 + « CHANTIER TRANSPORT DDP » (≈ L318) + DETTE UX [P0] (≈ L148).
- **A2** Prix = fournisseur + commission, **hors cargo**, mention « hors transport » + **vérifier cohérence prix fiche ↔ panier**. → cf. RETOURS TEST pt 3 + LOT T0/T1 transport (≈ L333).
- **A3** ✅ **FAIT** (lot mobile-vitrine, `696ab44`) — i18n sélecteur type d'activité + volumes FR/AR/EN (8 clés, résolu serveur).
- **A4** ✅ **FAIT** (`696ab44` + fix `992fcb0`) — « Stock local Maroc » → « Stock Maroc — livraison rapide »/« Stock Maroc » (48 remplacements FR/AR/EN).
- **A5** ✅ **FAIT** (`3d07571`) — polish mobile (cible tactile ≥44px, stats 2×2, lazy-load, wrap AR ; cartes/ligne + taille inchangées, desktop intact). *(Optim images approfondie via `next/image` reste différée — risque URLs Supabase signées.)*
  - (a) images produits/hero non adaptées/optimisées sur mobile → cadrage + compression + composant `next/image`.
  - (b) organisation, hiérarchie visuelle et design général à hisser au standard d'un SaaS international.
  - (c) cohérence du design sur toutes les pages clés (fiche produit, marketplace, catalogue, dashboards).
  - (d) diagnostiquer la lenteur/lourdeur perçue (cf. SECTION 4 perfs).

### BLOC B — DETTES TECHNIQUES (à solder AVANT go-live public)
> Détail : « SECTION 3 — DETTES & SUJETS EN ATTENTE » (≈ L589) + checklist « GO-LIVE PUBLIC » (≈ L126) + PHASE 5 (≈ L401).
- 🛡️ RLS `products` expose `factory_cost_mad` à `anon` (migr. 012) → vue/colonne masquée. (≈ L592)
- ⏱️ Rate-limiting manquant sur `placeOrder` (flux public COD). (≈ L593)
- 🔑 Durcir la confiance `metadata.role` au signup (rôle non auto-déclarable). (≈ L598)
- 🛡️ Signatures webhooks + logs d'audit. → cf. PHASE 5 (≈ L401).
- 📥🔁 Import CSV `publishBulkImport` : idempotence + reporting des lignes échouées. (≈ L596-597)
- 🧽 MÉNAGE TEST — retirer secrets/comptes (`TelegramTest2026!`, `AgentDemo2026!`, `AdminTest2026!`) + régénérer authtoken ngrok. (≈ L599-603)
- 🔎 Audit sécurité `@security` final avant go-live. → cf. PHASE 5 (≈ L401) + ROADMAP pt 10 (≈ L461).
- *(Aussi en attente, cf. SECTION 3 : 🧪 test idempotence `create_payout` ≈L594 · 🧾 i18n contenu DB ≈L591 · 🚚 logistique B2B manuelle ≈L604 · 💰 purge money résiduelle ≈L68/L88 · 🔀 merge `main` ≈L605.)*

### BLOC C — GRANDES FEATURES (vision, UN chantier à la fois)
> Détail : « VISION ABDOU — grands chantiers » (≈ L511) + BACKLOG B1-B5 (≈ L481) + ROADMAP multi-pays (≈ L436).
- **C1** Parcours fournisseur + IA (photo → l'IA remplit nom/catégorie/prix). → SECTION 1 (≈ L515).
- **C2** Agents sourcing par pays + isolation données client (tél/adresse masqués, audit RLS). → SECTION 2 (≈ L527).
- **C3** Gestion commandes Deliveroo + alertes/notifs (cycle, assignation, FSM, escalade auto). → SECTION 2bis-A (≈ L543) + PRIORITÉ N°1 LOT 5/6 (≈ L304).
- **C4** Fidélité grossistes (points/cadeaux, même prix de vente) — **ARGENT → circuit @finance**. → SECTION 2bis-B (≈ L552).
- **C5** Features B1-B5 (saisie commande affilié, précommande usine, upload photo sourcing, affichage par secteur, bot WhatsApp/Telegram fournisseur). → BACKLOG (≈ L481).
- **C6** Stock multi-entrepôt par pays + commande sourcing 2 lignes + courier API (`courier_*`) + signup téléphone (migr. 056) + secteur grossistes locaux Maroc. → ROADMAP pts 5-8 (≈ L453) + secteur B2B local (≈ L463).
- **C7** Transport DDP auto-calculé (capture poids/volume produit + paliers dégressifs) — **ARGENT → circuit @finance**. → LOT T3 futur (≈ L340) + ROADMAP pt 8 (≈ L459).
- **C8** **[NOUVEAU]** Demande de contenu créatif par les affiliés : un affilié demande **photos + vidéos** d'un produit pour ses pubs Meta/TikTok ; à terme brancher sur la **machine créative existante (n8n / Remotion / voix Darija)**. → à cadrer `@architect`, AUCUN code. *(Nouveau — pas encore de section détaillée.)*
- **C9** WMS scan QR + relevés/rapports partenaires PDF (post-lancement). → WMS (≈ L560) + Relevés PDF/QR (≈ L573).

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
  - **DESTINATAIRES (TÂCHE 2 — à cadrer)** : destinataires **ESSENTIELS toujours notifiés** = **Abdou** + le **fournisseur** concerné (nouvelle commande → préparer). Le **commercial/agent pays** = **optionnel, cochable** (notifié seulement si activé pour la commande/le pays). **Design fin des destinataires (par type d'événement, par rôle, par canal) à finaliser par Abdou** avant implémentation. Respecte la RÈGLE D'OR : le fournisseur reçoit l'info commande sans données acheteur sensibles (PII masquée, cf. vues redacted).

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
     - **TRADUCTION CONTENU PRODUITS (nom + description) — décidé avec Abdou : Option 2 = traduction automatique par IA.** Aujourd'hui le nom/description produit restent en **français** même en mode AR/EN (seule l'**interface** est traduite, pas le **contenu saisi**). Solution retenue : **à l'approbation d'un produit, traduire automatiquement nom + description en AR et EN via l'API Claude** (déjà branchée dans le projet), **stocker les 3 versions en base**, **afficher selon la langue active**. Abdou saisit une fois en **FR**, l'IA fait le reste, **correction manuelle possible**. Rejoint cette dette « DB content translation strategy ». **À cadrer plus tard** (pas urgent vs les sujets argent). **Coût IA minime par produit.**
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

## SECTION VIS-CANAL — CONTRÔLE DE VISIBILITÉ PRODUIT PAR CANAL (idée stratégique Abdou)

> Feature **future**, levier business. **À NE PAS construire maintenant** (Sprint 2 = vrais produits en cours).

- **Besoin** : pour chaque produit, des boutons pour activer/désactiver son affichage sur **chaque canal** (catalogue affilié, catalogue grossiste, marketplace, vitrine publique). Aujourd'hui c'est binaire (`affiliate_enabled` + toujours visible grossiste si actif).
- **Objectifs business** :
  1. **CONTRÔLE** fin de la visibilité par Abdou ;
  2. **EXCLUSIVITÉ** — réserver un produit à certains sellers/grossistes, les protéger de la concurrence interne ;
  3. **MONÉTISATION** — « produit visible sur toutes les plateformes » devient une feature **PREMIUM payante par abonnement** (le premium est partout, le basique restreint) ;
  4. distinguer les **niveaux d'abonnement**.
- **Nature** : chantier de **conception** (matrice **visibilité produit × canal × niveau d'abonnement**). À cadrer avec `@architect`. Pertinent surtout au moment de l'**ouverture publique + système d'abonnement (Sprint 4+)**, quand il y aura de vrais sellers à qui vendre de l'exclusivité.
- **À NE PAS construire maintenant** (Sprint 2 = vrais produits en cours).

## SECTION PREMIUM-DIRECT — PLAN PREMIUM « ACCÈS DIRECT FOURNISSEUR » (~10 000 DH/mois)

> Vision **future**, **exception payante à la RÈGLE D'OR**. **NE PAS construire maintenant.**

- **Principe** : un palier d'abonnement **ultra-haut de gamme (~10 000 DH/mois)** qui **lève le cloisonnement** : le grossiste premium accède **directement** au fournisseur (identité / contact), court-circuitant l'intermédiation Mozouna.
- **Pourquoi si cher** : ça contredit volontairement la règle « **aucun contact direct grossiste/affilié ↔ fournisseur** ». Le prix élevé est précisément la contrepartie de cette exclusivité.
- **Nature** : changement **du modèle de confidentialité ET du modèle de revenu** → à concevoir avec **`@architect` + `@finance` + `@security-reviewer`** (le trio complet : argent + RLS/données sensibles).
- **Quand** : lié au **système d'abonnement (Sprint 4+)**, après l'ouverture publique.
- **À NE PAS construire maintenant.**

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
- 🛡️ **Dette 012 (ANON) — fermée côté code (migration 072), à APPLIQUER en prod** : `factory_cost_mad` & coût/marge étaient lisibles par `anon` (RLS filtre les lignes, pas les colonnes). Correctif : vue `products_public_read` whitelistée (security_invoker au défaut) + GRANT anon/authenticated + DROP de la policy `"products: anon read active"` + page `/products/[id]` repointée. Additif, audit @security GO. ⏳ Reste : `supabase db push` de la migration 072 en prod (sur GO Abdou).
- 🛡️ **Dette 073 (AUTHENTICATED) — SÉPARÉE, à traiter AVEC PRUDENCE** : la policy `"products: authenticated read active"` (migr. 001) expose aussi `factory_cost_mad`/coût/marge à **tout utilisateur authentifié** (affiliés/grossistes), pas seulement anon. ⚠️ **Touche le calcul de commission affilié** (`calculateNetAffiliateCommission` dérive la commission de `factory_cost_mad` côté serveur) → corriger via vue redacted + policy authenticated restreinte **sans casser ce calcul serveur**. NON traité par 072. À cadrer séparément.
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

## 📦 BACKLOG / VISION — session 2026-06-20 (idées à cadrer, rien codé)
> Consigné le **2026-06-20**. **Rien n'est codé.** À cadrer un à la fois. Aucune suppression : ajout pur.

- ⬜ **(1) SAISIE DES PALIERS FOURNISSEUR VIA TELEGRAM — PRIORITÉ.** Constat : la table `supplier_product_moq_tiers` est **VIDE (0/469)** → aucun produit import n'a de paliers, donc l'auto-report `buildMirrorTiers` n'a **rien à reporter**. Solution voulue : permettre au fournisseur de **saisir/compléter ses paliers de prix directement via le bot Telegram** (homogène avec l'envoi produit). But : **alimenter la table** → l'auto-report **FX + marge** fonctionne enfin. ⚠️ **Touche le prix grossiste → audit `@finance` OBLIGATOIRE avant tout code.**
- ⬜ **(2) HOMOGÉNÉITÉ TELEGRAM.** Objectif global : la **gestion produit** (ajout, paliers, infos manquantes) passe de façon **cohérente par le bot Telegram**, pas en bouts dispersés. Cadre de référence pour tout futur chantier produit côté fournisseur.
- ✅ **(3) RAIL CATÉGORIES SUR LE MARKETPLACE GROSSISTE GÉNÉRAL.** Constat : `CategoryRail` existe sur `/affiliate/products` et `/wholesale/products` mais **MANQUE sur `/wholesale/marketplace`** (seulement un dropdown). À ajouter en **réutilisant `CategoryRail` + `CATEGORY_ICONS` existants**. **Affichage pur, zéro argent.** → **✅ DÉJÀ NATIF sur le CATALOGUE `/wholesale/products`** (le rail y existe depuis `1794496`). **RECADRAGE 2026-06-21** : la cible de la navigation visuelle est le **CATALOGUE produits** (stock local Maroc, commande directe — là où va le commerçant analphabète), **PAS le marketplace global** (import multi-hubs sur devis). Le rail ajouté par erreur sur `/wholesale/marketplace` a été **retiré** (marketplace remis byte-identique à l'origine). **✅ EN PROD (merge `128131c`, 2026-06-21).**
- ✅ **(4) PAGE D'ENTRÉE « GRANDES CARTES-IMAGES » PAR RAYON (vision UX forte).** Pour clients **analphabètes / petits commerçants** : page d'accueil catalogue avec de **GRANDES cartes visuelles par famille** (vraie image parlante : nourriture, viande, électrique…) → clic → produits de la niche. Sur le **marketplace général** (dispo + import). Réutilise `PRODUCT_CATEGORIES`, `resolveCategoryLabel`, i18n, drill-down niche. **MANQUE** : vraies **images par catégorie** (pas emojis) + composant `CategoryGrid`/`CategoryCard`. **Affichage pur, zéro argent.** → **🔄 CONSTRUIT sur `feat/navigation-marketplace`** (2026-06-21, **RECADRÉ vers le CATALOGUE**) : section **cartes-rayons EN HAUT du CATALOGUE `/wholesale/products`** (au-dessus des onglets Disponible/Import, carrousel horizontal mobile / grille desktop, additif strict) **+ route bonus `/wholesale/products/categories`** (grille pleine). Cartes → `/wholesale/products?category=` (onglet + filtres préservés). Composant `CategoryShowcase`/`CategoryCard` (Server Component pur, strings sérialisables, fallback emoji CSS). **12 vraies images self-hostées WebP** dans `public/categories/` (Unsplash libre de droit, validées Abdou, cf. `CREDITS.md`) + mapping `CATEGORY_IMAGES` dans `taxonomy.ts`. i18n FR/AR/EN + RTL vérifiés (captures catalogue mobile+desktop). 4 checks verts. **✅ EN PROD (merge `128131c`, 2026-06-21).**
  - **Décisions / recadrage** : cible = **CATALOGUE produits** (stock local Maroc, commande directe), **PAS le marketplace global** (correction de cible Abdou 2026-06-21) ; cartes **EN HAUT, au-dessus des onglets** ; images **self-hostées WebP optimisées** (robustesse/perf, pas de hotlink ni modif `next.config`) ; #2 Matières premières = blé doré (opt. A), #12 Autres = entrepôt (opt. A). Le 1er essai posé sur le marketplace a été **retiré** (marketplace byte-identique à l'origine, preuve diff vide).
- ⬜ **(5) DETTE COHÉRENCE ICÔNES — non bloquant.** `CATEGORY_ICONS` **dupliqué en 3 endroits** (`taxonomy.ts` = source de vérité + `branding.tsx` + `product-card-image.tsx`, emojis divergents) → **unifier plus tard**. Non bloquant.
