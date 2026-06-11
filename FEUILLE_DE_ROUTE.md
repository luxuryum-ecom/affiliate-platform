# FEUILLE DE ROUTE — Finir le SaaS d'affiliation comme un pro

**Principe :** une phase à la fois. Chaque phase finit par un checkpoint où **tu valides** avant de passer à la suite. On ne reconstruit jamais ce qui marche.

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
   - **Hors périmètre Phase A (à faire plus tard)** : espace **admin** (non traduit, volontaire) ; quelques constantes métier (`PURCHASE_PROFILE_LABELS`, `VOLUME_TIER_LABELS`, `getDeliveryEstimate` côté grossiste/affilié) ; page `bootstrap` (interne).
   - 🧾 **DETTE — i18n du CONTENU DB** : noms/descriptions produits, libellés saisis (catégories, notes, pays texte) viennent de la base → **non traduisibles par i18n**. Nécessite une stratégie séparée (colonnes traduites `name_ar/name_en`, ou table de traductions, ou traduction à la saisie). À cadrer plus tard.
5. **Raccord colonnes pays texte → codes ISO** — normaliser `import_tariffs.country`, `origin_country`, `destination_country`, `countries_served[]` via `country_aliases` (+ `resolve_country_code`). Ajouter colonnes `*_country_code` (FK), sans casser l'existant.
6. **Stock multi-entrepôt par pays** — rattacher le stock aux pays `has_warehouse` ; notions réservé / provisoire / en transit / retour (aujourd'hui : `stock_count` scalaire mono-pays).
7. **Commande sourcing 2 lignes** — marchandise + transport séparés, pays_source + pays_destination, suivi paiement/échéances (mini-compta sur le ledger Phase 2).
8. **Branchement transport / courier (API)** — activer les champs `courier_*` préparés (table `cities`, migr. 015) + `logistics_settings.api_config` ; sync transporteur.
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

## SECTION 3 — DETTES & SUJETS EN ATTENTE (consolidation)

- 🧾 **i18n contenu DB** : noms/descriptions produits (et libellés saisis) non traduisibles par i18n → stratégie à cadrer (**colonnes `name_ar`/`name_en`** ou **table de traductions**, ou traduction à la saisie/IA).
- 🛡️ **Dette sécurité — RLS `products`** : expose `factory_cost_mad` à `anon` (migr. 012) → à corriger (vue/colonne masquée).
- ⏱️ **Dette — rate-limiting manquant** sur `placeOrder` (flux public COD).
- 🧪 **Dette — test d'intégration DB** de l'idempotence réelle de `create_payout` (RPC Postgres : rejeu/atomicité/ON CONFLICT) ; les tests unitaires couvrent seulement le contrat JS.
- 🌐 **Espace ADMIN non traduit** (hors périmètre Phase A) — à faire si besoin.
- 📥 **Dette — reporting des lignes CSV échouées** (`publishBulkImport`) : le `continue` silencieux masque chaque insert raté → un fournisseur croit ses N produits importés alors que certains ont pu échouer. Ajouter un **compteur d'échecs + rapport** remonté à l'utilisateur (avec la raison). Signalée par l'audit @finance du lot multi-devise (Phase 5 CSV).
- 🔁 **Dette — idempotence import CSV** (`publishBulkImport`) : pas de clé d'idempotence → un retry / double-clic **recréerait tous les produits en doublon** (RÈGLE D'OR n°5). Ajouter une **clé d'idempotence** (ex. hash `csv_text` + `import_id`, ou verrouiller le statut de l'import avant insertion).
- 🔑 **Dette préexistante — confiance `metadata.role` au signup** : `handle_new_user` lit `role` depuis `raw_user_meta_data` → un appel direct à `auth.signUp` avec `role:'admin'` créerait un profil admin (mitigé par `status='pending'` + validation admin obligatoire). Signalée Phase 4, **non introduite** par le lot multi-devise. À durcir (rôle non auto-déclaré au signup).
- 🧽 **MÉNAGE TEST — secrets temporaires à RETIRER** (posés pour les tests multi-devise Telegram, à nettoyer) :
  - `supplier-morocco-03@affipartner.ma` : mot de passe temporaire **`TelegramTest2026!`** → réinitialiser ou retirer.
  - `admin@affipartner.ma` : mot de passe temporaire **`AdminTest2026!`** (posé pour corriger le pays via session admin) → réinitialiser ou retirer.
  - **authtoken ngrok** passé en clair dans la conversation de dev → **régénérer** sur https://dashboard.ngrok.com/get-started/your-authtoken.
- 🔀 **MERGE vers `main`** : `origin/main` est figé/en retard ; **`MERGE_PLAN.md` prêt** (Option B, jalonnée `--no-ff`). Merger `feat/habillage-premium` → `main` = **décision séparée, sur GO explicite d'Abdou** (un seul commit/lot à la fois, jamais auto).
