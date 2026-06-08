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

> ⛔ **1. PRIORITAIRE — CORRECTION MOTEUR COMMISSION AFFILIÉ** (argent — à **planifier + auditer `@finance`/`@security-reviewer` AVANT commit**). Diagnostics déjà faits.
> 1. **Garde-fou livraison JAMAIS zéro** : validation `fee > 0` (pas `≥ 0`) dans `addCity` / `updateCity` / `updateLogisticsSettings`, **+** plancher `Math.max(MIN_DELIVERY, …)` dans `resolveDeliveryFeeByCity`, **+** fallback jamais 0. **Règle métier : la livraison est TOUJOURS payée par l'affilié, déduite de sa commission.** (Aujourd'hui aucun plancher → un 0 sur une ville ou sur le défaut ferait absorber le transport par la plateforme.)
> 2. **Commission de base affichée périmée** : ex. « Portefeuille » affiche **25** au lieu de **~116** réel (colonne `commission_amount` figée avant le rétro-remplissage `factory_cost_mad`, migr. 016). → Afficher la **commission recalculée en direct** par la formule (`calculateNetAffiliateCommission`) au lieu de la colonne stockée.
> - **Fichiers identifiés** : `src/app/actions/cities.ts` (`resolveDeliveryFeeByCity`), `src/app/actions/logistics.ts`, `src/app/actions/orders.ts`, `src/lib/utils.ts` (`calculateNetAffiliateCommission`), `src/app/actions/products.ts`, page `src/app/(affiliate)/affiliate/products/page.tsx`.

2. **Reconnexion comptes test** — diagnostiquer/rétablir l'accès aux comptes de test (cloud Supabase) : 86 comptes intacts ; vérifier flux auth, retrouver/réinitialiser les mots de passe de seed des comptes démo.
3. **Relecture des traductions arabes** — 🟡 *en partie fait* : `messages/ar.json` réécrit en arabe pro naturel (فصحى marketing, sans darija) — calques supprimés, accord duel corrigé, CTAs directs ; parité 40/40 clés avec `fr.json`, JSON valide. **Reste** : relecture `en.json` + validation humaine par un locuteur natif sur le rendu RTL avant prod. Modifs limitées aux fichiers JSON, aucun code touché.
4. **Extension multilingue aux autres pages** — extraire les textes page par page (auth → marketplace + fiche produit → dashboards → admin/fournisseur), convertir les classes directionnelles en logiques (RTL propre) à chaque page.
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
