<!--
  SCHÉMA DIRECTEUR — SOURCE DE VÉRITÉ UNIQUE. À ouvrir à CHAQUE session.
  Tenu à jour par Claude Code. Dernière MAJ : 2026-06-24.
  Compléments détaillés : docs/ARCHI_VARIANTES_STOCK.md (carto variantes + statuts).
  Registres opérationnels : ETAT_SYSTEME.md, FEUILLE_DE_ROUTE.md.
  Ce fichier = documentation pure. Aucun code applicatif ici.
-->

# 🧭 ROADMAP MASTER — Mozouna Group (SaaS affiliation + B2B + ecom perso)

## 1. VISION

SaaS marchand **multi-canal à niveau international** : **affiliation COD Maroc**, **B2B gros**, et **ecom perso (Egrow)** s'appuyant tous sur **UN stock central unique** par produit/variante, avec **traçabilité anti-fraude** de bout en bout (personne en confiance aveugle : personnel, transporteur, fournisseur). Multi-pays / multi-devises (pivot **MAD**). Objectif : zéro fuite de stock, zéro fuite d'argent, et un catalogue très varié (mode, maison, alimentaire) géré par **variantes à attributs flexibles**.

## 2. DÉCISIONS FIGÉES (ne jamais rouvrir)

- **Stock à 2 ORIGINES** : (1) **propre Abdou** — entrepôt, temps réel, partagé par les 3 canaux ; (2) **fournisseur** — déclaré, multi-modes (API + manuel + Telegram + hebdo), avec **date de MAJ + indicateur de fraîcheur**.
- **VARIANTES** : attributs **flexibles** (taille / couleur / format / pointure / poids…), data-driven (pas codés en dur). **Le stock est porté par la VARIANTE.** Produit simple = **1 variante "défaut"**. Tailles de référence Abdou : **T1 = S-M, T2 = L-XL, T3 = 2XL**.
- **FINANCE INTOUCHABLE par les variantes** : prix / commission / marge / paliers restent au **PRODUIT**. `variant_id` n'entre **jamais** dans un calcul d'argent.
- **`sell_price` = prix de l'UNITÉ-DE-VENTE facturée** (option A figée, 2026-06-24) : `total = sell_price × quantité`. `sale_unit` / `pack_size` = **affichage pur** ; le prix par sous-pièce est **dérivé à l'affichage** (`sell_price ÷ pack_size`), **jamais facturé**. Facturer à la sous-pièce (option B) = écartée. Zéro impact calcul financier.
- **7 STATUTS de stock par variante** : `au dépôt` → `réservé` → `parti` → `livré` ; et `retour attendu` → `retour reçu` → (redevient `au dépôt`) ; plus `endommagé/invendable` (séparé du vendable).
- **MODÈLE = LEDGER (option B)** : le **statut est porté par chaque mouvement** d'un journal **append-only** (`stock_movements`), les quantités par statut sont une **projection recalculée**. **Le journal fait foi, rien ne s'efface.**
- **RETOURS SCANNÉS** : une annulation/refus passe en **"retour attendu" (PAS dispo)** ; le **scan du colis revenu** le passe en **"retour reçu" → redevient dispo**. **Fini le retour instantané** au stock.
- **ON NE REFUSE JAMAIS UNE VENTE (Option A)** : stock insuffisant/périmé → on affiche avec **signal "à confirmer"** + **alerte admin**, jamais de blocage.
- **DOUBLE-ÉCRITURE transitoire** : pendant la migration du stock vers la variante, on écrit l'ancien (produit) ET le nouveau (variante) ; on **coupe l'ancien seulement quand le nouveau est prouvé**.
- **SCAN générique multi-transporteur** : `carrier` / `tracking` = **texte libre**, **aucun transporteur câblé** ; **idempotence anti-fraude** (un colis ne peut être scanné deux fois).
- **RÉCONCILIATION argent transporteur = REPORTÉE** : attend les **vrais formats de fichiers transporteurs** + **export Egrow** (pas en main). Mentionnée, jamais conçue pour l'instant.

## 3. FAIT / EN PROD (avec n° de migration)

| Domaine | État | Ancrage |
|---|---|---|
| Socle **auth + rôles + RLS deny par défaut** | ✅ EN PROD | `001` + RLS sur chaque table |
| **Finance — ledger append-only** | ✅ | `048` |
| **Finance — payout atomique idempotent** | ✅ | `049` |
| **Finance — moteur COD** (commande, frais, snapshots) | ✅ | `009` |
| **Finance — modèle prix/commission** + factory cost & auto-commission | ✅ | `013`, `016` |
| **Finance — multi-devise** (pivot MAD) | ✅ | `050`, `051`, `052` |
| **Finance — règle capital affilié** | ✅ | `073` |
| **Produits + upload images/media** | ✅ | `001`, `002`, `007` |
| **Fournisseurs (marketplace) + bot Telegram d'ingestion** | ✅ | `030`, `035`, `053` |
| **Wholesale FSM** (cycle commande gros type "Deliveroo") | ✅ | `057`, `059`, `065` + `src/lib/wholesale-fsm.ts` |
| **Affilié 2 modes** : lien d'attribution `?ref=` + saisie commande (`createAffiliateOrder`) + prix custom | ✅ | `011` + `src/app/actions/orders.ts` |
| **Catégories dynamiques** (table + CRUD admin + suggestion IA) | ✅ | `081`, `082`, `084`, `085` |
| **Permissions 2 étages** (superviseur de volet + tâches fines) | ✅ | `083`, `087` |
| **Vitrine grossiste intelligente** (carte Maroc + perso par niche) | ✅ | frontend (mergé) |
| **Durcissement go-live beta vitrine** (signup, reset MDP, pending) | ✅ | `090`, `091` |
| **WMS-1 — stock central unifié** (ledger `stock_movements`, `reserve/restore_stock`, `adjust_stock_manual`, taxonomie raisons, `stock_anomalies` + socle Gardien, Option A never-refuse) | ✅ EN PROD | `092`, `093`, `094`, `095` |
| **Écran admin stock** `/admin/stock` (journal, ajustement, anomalies) + carte dashboard | ✅ | code (merge `573b23e`) |
| **Garde-fous tests anti-prod** (`assertLocalSupabase`/`getLocalSupabaseEnv`, configs Playwright forcées local) | ✅ | `e2e/assert-local-supabase.ts` + règle CLAUDE.md #8 |

## 4. 🚧 GRAND CHANTIER EN COURS — "STOCK PAR VARIANTE + STATUTS DE CYCLE DE VIE"

> Détail technique complet : `docs/ARCHI_VARIANTES_STOCK.md`. Tout est **additif** (la prod ne casse pas), filet = **double-écriture**.

> **LOT A (étapes 1→5) = ✅ MERGÉ dans `main` (`3900b74`, 2026-06-24). LOT B Étape 6 = ✅ COMPLÈTE ET MERGÉE : variant_id commandes + RPCs sécurisées (`0b427f4`) PUIS C1 UI admin CRUD variantes (`a3ad7b0`) + C2 affichage grossiste (`6782472`) + C3 sélecteur affilié (`d9e4d79`), 2026-06-25. Migrations 096→103 APPLIQUÉES EN PROD (confirmé `supabase migration list` : Local 103 | Remote 103).**

| # | Étape | Objet | Risque | État |
|---|---|---|---|---|
| **1** | **Créer les variantes** | Table `product_variants` (attributs jsonb) + variante défaut rétro-remplie 1:1 ; RLS deny | NUL | ✅ **FAIT** (mig 096) — @security GO · @tester 26/26 |
| **2** | **Créer les statuts sur le ledger** | `+from_status/to_status/variant_id` (nullable) sur `stock_movements` (7 statuts) + projection `variant_status_balance` (vue security_invoker) | NUL | ✅ **FAIT** (mig 097) — @security GO · @tester 19/19 |
| **3** | **Afficher choix taille/couleur** | Vue client `product_variants_read` + sélecteur (caché si 1 variante) ; i18n FR/AR/EN | Faible | ✅ **FAIT** (mig 098) — @security GO · @tester 18/18 |
| **4** | **Fonctions stock comprennent variante + statuts** | RPC `reserve/restore_stock`/`adjust_stock_manual`/`record_stock_movement` + `p_variant_id`/`p_from_status`/`p_to_status` DEFAULT NULL ; **double-écriture** ; trigger auto-variante + mouvement d'ouverture | Moyen | ✅ **FAIT** (mig 099) — @security GO · @tester 58/58 |
| **5** | **Scan entrée dépôt + retour** | Table `scan_events` (carrier/tracking texte libre, idempotence anti-fraude) + `record_scan` + transitions retour (attendu→reçu→dépôt) et endommagé | Moyen | ✅ **FAIT** (mig 100) — @security GO · @tester 46/46 |
| **6** | **Commandes 3 canaux portent la variante** | `variant_id` sur `orders`/`wholesale_order_items`/panier + transitions de statut câblées sur les flux commande ; restore→return_expected (staging scanné) | **ÉLEVÉ** | ✅ **FAIT** (mig 101+102 + C1 `a3ad7b0` / C2 `6782472` / C3 `d9e4d79`) — câblé sur les 3 canaux (affilié, COD public, wholesale) avec double défense cross-product (TS + DB) ; @security GO · @finance GO |
| **7** | **Bascule finale du compteur sur la variante** | Le stock devient la source de vérité au niveau variante ; on **coupe l'ancien** `products.stock_count` une fois le nouveau prouvé | **MAXIMAL** | ⬜ à faire — **@finance + @security + Abdou** |

- **EN PARALLÈLE (dès étapes 1-2 faites) — F3 stock fournisseur multi-modes + fraîcheur** (`stock_mode`, `stock_quantity_updated_at`, « dispo réel » pondéré). ✅ **FAIT, MERGÉ DANS `main` (`c3b7f07`, 2026-06-26) + mig 104 APPLIQUÉE PROD (Local 104 | Remote 104). Runtime LOCAL vérifié (tester n°1 marketplace 21/21 Playwright + 10/10 unit ×FR/AR/EN ; tester n°2 Telegram/manuel/recalcul fraîcheur 20j→frais 20/20 ; tsc 0 · build OK · vitest 315/315 · smoke 16/16).** :
  - **V5-bis.1** ✅ (commit `e795de0`, mig **104**) — colonnes additives `stock_mode` (api/manuel/telegram/hebdo) + `stock_quantity_updated_at` + `variant_id` FK nullable NON câblée ; backfill ; vue redacted `supplier_products_wholesaler_read` étendue (2 colonnes non sensibles). **@security GO**. **Mig 104 APPLIQUÉE PROD le 2026-06-26.**
  - **V5-bis.2** ✅ helper fraîcheur + affichage marketplace. **C2 — 3 paliers** (commit `081cada`) : frais <3j (rien) / surveille 3-14j (badge gris « Mis à jour il y a X jours ») / >14j ou inconnu (badge orange « À confirmer »). **C4 — affichage SÉPARÉ** (commit `3e7a771`) : « Dispo immédiate » (stock propre miroir via `products_catalog_read`) + « Dispo fournisseur » ; badge « Sur commande » si propre=0 & fournisseur>0 ; JAMAIS de somme (zéro double-comptage). @finance GO + @security GO ; runtime LOCAL 3 langues.
  - **V5-bis.3** ✅ (commit `739ffd2`) — alimentation fraîcheur : bot Telegram (`ingest.ts` → `stock_mode='telegram'` + horodatage) + saisie manuelle fournisseur (action `updateSupplierStock` isolation double-clé + composant `StockUpdateForm`). @security plein GO + @finance GO. Seuils C2 (72h/336h) provisoires.
- **REPORTÉS** : **Egrow / WMS-2** (ecom perso câblé) ; **réconciliation argent transporteur** (attend formats fichiers transporteurs + export Egrow) ; **C4 pack grossiste** (courbe de tailles fixe type Alibaba/Faire — cadrage @finance requis avant tout code).

---

### LOTS FUTURS — SAISIE STOCK VARIANTES PAR LE FOURNISSEUR *(cadrage @architect + @security requis, NE PAS CODER avant validation Abdou)*

#### LOT "Variantes via Telegram"
Le fournisseur déclare son stock par taille/couleur via le bot Telegram interne.

**Périmètre fonctionnel :**
- Commande bot : `/stock [ref_produit] [taille] [quantité]` (ou formulaire conversationnel guidé)
- Le bot met à jour `product_variants.stock_count` + appelle `syncProductStockCount` (B3)
- Confirmation de lecture avec résumé au fournisseur

**Points de sécurité OBLIGATOIRES à cadrer :**
- Authentification fournisseur : liaison `telegram_user_id` ↔ `supplier_id` dans la DB (token enregistré par admin, pas d'auto-enregistrement)
- **Isolation fournisseur** : un fournisseur ne peut modifier QUE les variantes de SES produits (vérification `product.supplier_id = supplier.id` côté serveur, jamais côté bot)
- Rate-limiting par `telegram_user_id` (anti-spam/flood)
- Pas de secret partagé dans le code — clé bot via variable d'environnement
- Validation stricte des entrées (ref_produit = UUID valide, quantité = entier ≥ 0, taille = valeur présente dans les variantes existantes)

> ⬜ **Statut : à cadrer** — @architect plan + @security audit AVANT toute ligne de code.

---

#### LOT "Variantes via fichier (CSV/Excel)"
Le fournisseur uploade un fichier de stock par variante (batch update).

**Périmètre fonctionnel :**
- Upload depuis l'espace fournisseur (`/supplier/stock/import`)
- Colonnes attendues : `product_ref`, `taille`, `couleur`, `stock_count`
- Preview + diff avant confirmation (pas d'application aveugle)
- Résultat : rapport de validation (lignes OK / erreurs / ignorées)

**Sécurité OBLIGATOIRE — checklist @security avant tout code :**
- **Anti-CSV-injection** : toute cellule commençant par `=`, `+`, `-`, `@`, `\t`, `\r` doit être sanitisée ou rejetée (formules Excel malveillantes)
- **Validation magic-bytes** : vérifier les octets de signature du fichier (`.csv` = UTF-8 ou BOM UTF-8 ; `.xlsx` = PK\x03\x04) — rejeter si le contenu ne correspond pas à l'extension déclarée
- **Isolation fournisseur** : chaque ligne est validée contre `product.supplier_id = session.supplier_id` côté serveur — un fournisseur ne peut pas écraser le stock d'un autre
- **Validation d'appartenance produit** : `product_ref` doit exister ET appartenir au fournisseur connecté (pas de lookup par name ou SKU seul, utiliser UUID)
- **Pas de SSRF** : aucune URL dans le fichier n'est résolue côté serveur
- **Taille max** : limiter le fichier (ex. 5 Mo, 10 000 lignes max) pour éviter les DoS
- **Pas d'exécution de code** : la lib de parsing (ex. `xlsx`) tourne en mode lecture seule, sans évaluation de macros

> ⬜ **Statut : à cadrer** — @architect plan + @security audit AVANT toute ligne de code.

---
- **ÉTAT ACTUEL (2026-06-26)** : LOT A (mig 096→100) **MERGÉ + APPLIQUÉ PROD** (`3900b74`). LOT B Étape 6 (mig 101→102 + C1 `a3ad7b0` / C2 `6782472` / C3 `d9e4d79`) **MERGÉE + APPLIQUÉE PROD** — câblée sur les 3 canaux. **F3 V5-bis stock fournisseur multi-modes + fraîcheur ✅ FAIT, MERGÉ PROD (`c3b7f07`, mig 104 Local 104 | Remote 104, runtime verts).** DB prod à **104 migrations**. `npm run check` exit 0. Décisions figées : synchro B3 (server action admin recalcule `products.stock_count = SUM(variants actives)`) ; affichage grossiste tous les axes ; C4 pack cadré plus tard. **Prochaine** : **F2 LOT B Étape 7 — bascule finale du compteur sur la variante** (couper l'ancien `products.stock_count`), enjeu **MAXIMAL** → circuit **@finance + @security + Abdou** obligatoire avant tout code, **+ F4 nettoyage sécu restant** (dont rotation `SUPABASE_SERVICE_ROLE_KEY` avant go-live, compte fournisseur dédié smoke prod).

## 4bis. DASHBOARD STOCK PATRON — ⬜ à construire APRÈS Lot B

> Vision d'Abdou : un **VRAI tableau de bord de patron** (chiffres clés en un coup d'œil), **pas** l'outil basique actuel `/admin/stock`. **PRIORITÉ : construire APRÈS le Lot B** (étapes 6-7 = les commandes portent les statuts réservé/envoyé/livré) — sinon les cartes seraient vides. ⬜ **à construire post-Lot B.**

**Vue d'ensemble EN CARTES (chiffres clés, en haut) :**
- Stock **RÉEL au dépôt** (dispo vendable, par produit/variante) — `variant_status_balance.qty_at_warehouse`
- Stock **RÉSERVÉ** (commandé, pas encore expédié) — `qty_reserved`
- Stock **ENVOYÉ** (en livraison) — `qty_in_transit`
- Stock **LIVRÉ** (mois en cours, par canal) — `qty_delivered` / ledger
- Retours **ATTENDUS** (annulés non encore revenus) — `qty_return_expected`
- Retours **REÇUS** (scannés, mois en cours) — `scan_events` / `qty_return_received`
- Stock **ENDOMMAGÉ / CASSE** (perte) — `qty_damaged`
- **Valeur totale du stock** (en MAD au **prix de revient** — lecture serveur, jamais exposée au client)
- **ARGENT COLLECTÉ** (mois, par canal)
- **ARGENT EN ATTENTE** (livré mais transporteur n'a pas encore versé)

**ALERTES en haut** : stocks bas, anomalies (`stock_anomalies`), casse anormale, **écart argent/livraison (anti-fraude)**.
**VUE PAR PRODUIT** : triable par stock bas, ventes, retours.
**JOURNAL DES MOUVEMENTS** : déjà construit (`/admin/stock`), placé **en bas**.
**AJUSTEMENT MANUEL** : déplacé **dans un coin** (plus en pleine page).

**DESIGN** : admin **noir & or**, **FR/AR/EN + RTL**, hiérarchie claire (chiffres clés en haut, détails en bas). Strings i18n résolues côté serveur (jamais de fonction passée à un Client Component).

**DÉPENDANCES** :
- **~80 % des chiffres viennent du Lot B** (commandes portent les statuts : réservé / envoyé / livré). Sans Lot B → cartes vides.
- **Retours reçus** viennent de l'usage opérationnel du **scan** (`scan_events` existe déjà, Étape 5 ✅).
- **« Argent collecté »** et **« argent en attente »** viennent de la **réconciliation transporteur** (REPORTÉE — attend les vrais formats de fichiers transporteurs + export Egrow). Tant qu'elle n'existe pas, ces 2 cartes restent en placeholder.

**PRIORITÉ** : **construire APRÈS Lot B** (étapes 6-7). Audit : `@security` (lecture serveur des données sensibles prix de revient/marge — jamais au client) ; `@finance` pour les cartes argent (collecté / en attente).

## 5. RESTE DE LA ROADMAP (après le grand chantier), par priorité

1. **Stock fournisseur multi-modes + fraîcheur** (peut démarrer en parallèle tôt).
2. **Egrow / WMS-2** — ecom perso : décrémenter le stock central depuis les ventes Egrow (canal `ecom_perso` déjà provisionné, non câblé).
3. **Scan anti-fraude / WMS-3** — scan à chaque maillon, écart reçu vs facturé, scan unique.
4. **Réconciliation argent / WMS-4** — théorique vs réel par fournisseur ET par transporteur (sorti = livré + retourné), audit immuable.
5. **Gardien IA** — surveillance 24/24, 3 pouvoirs (détecter / tracer / bloquer avant), se branche sur tous les volets (socle anomalies déjà posé en WMS-1).
6. **Cycle commission COD** — automatisation fine du cycle de commission.
7. **Fidélité grossiste** — programme de fidélité B2B.
8. **Stripe** — encaissement en ligne.

## 6. RÈGLES DE TRAVAIL (non négociables)

- **Gros lots cohérents** mais découpés ; **CARTO avant build** (cartographier l'existant de bout en bout, ne jamais reconstruire ni doublonner).
- **Branche dédiée** par chantier ; **STOP avant merge** → **GO explicite d'Abdou** (jamais de merge/push sans accord).
- **`@finance`** sur tout ce qui touche l'argent ; **`@security`** sur tout ce qui est sensible (RLS, écritures, secrets) — **avant** merge.
- **`@tester` clique en LOCAL uniquement** (Supabase `127.0.0.1:54321`), **JAMAIS la prod** (garde-fou `assertLocalSupabase` obligatoire — incident 2026-06-24).
- **i18n FR + AR (فصحى) + EN + RTL** sur tout texte visible ; chiffres en numéraux latins ; **jamais de texte en dur** ; **jamais de fonction passée à un Client Component** (régression `stockAvailable`).
- **DOUBLE-ÉCRITURE** pour toute migration de stock (couper l'ancien seulement quand le nouveau est prouvé).
- **4 checks verts** avant chaque commit (`tsc` 0 / `next build` / `vitest` / `pnpm smoke`) ; **commit après chaque sous-lot** ; migration de chaque lot **appliquée immédiatement** en base.
- **Traçabilité** : toute étape (faite ou à moitié) reflétée dans `ETAT_SYSTEME.md` + `FEUILLE_DE_ROUTE.md` + ce fichier.

## 7. PROCHAINE ÉTAPE EXACTE

➡️ **LOT A + LOT B Étape 6 + F3 V5-bis (stock fournisseur multi-modes + fraîcheur) MERGÉS ET APPLIQUÉS EN PROD. DB prod à 104 migrations (Local 104 | Remote 104).** F3 mergé le 2026-06-26 (`c3b7f07`, mig 104), runtime LOCAL vérifié (testers 41/41 + tsc/build/vitest 315/315/smoke 16/16 verts).

**Prochaine étape exacte** : **F2 — LOT B Étape 7 : bascule finale du compteur sur la variante.** Le stock variante devient la source de vérité ; on **coupe l'ancien** `products.stock_count` une fois le nouveau prouvé. Enjeu **MAXIMAL** → **circuit complet obligatoire AVANT tout code : `@finance` + `@security-reviewer` + validation Abdou** (plan d'abord, pas de précipitation). **En parallèle : F4 — nettoyage sécurité restant** (rotation `SUPABASE_SERVICE_ROLE_KEY` avant go-live, compte fournisseur dédié pour smoke prod). C4 pack grossiste = reporté.
