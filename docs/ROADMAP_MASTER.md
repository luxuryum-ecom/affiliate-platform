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

| # | Étape | Objet | Risque | Audit | Dépend de |
|---|---|---|---|---|---|
| **1** | **Créer les variantes** | Table `product_variants` (attributs jsonb) + **variante défaut rétro-remplie** 1:1 sur chaque produit existant ; RLS deny | **NUL** (additif) | @security | — |
| **2** | **Créer les statuts sur le ledger** | `+ from_status/to_status` (nullable) sur `stock_movements` (7 statuts) + projection recalculée `variant_status_balance` | **NUL** (additif) | @security | 1 |
| **3** | **Afficher choix taille/couleur** | Sélecteur de variante sur pages produit (caché si 1 seule variante) ; i18n FR/AR/EN résolu serveur | Faible | — | 1 |
| **4** | **Fonctions stock comprennent variante + statuts** | RPC `reserve/restore_stock`, `adjust_stock_manual`, `record_stock_movement` étendus `p_variant_id`/`p_from_status`/`p_to_status` **DEFAULT NULL** (rétro-compatible) | Moyen | @security | 2 |
| **5** | **Scan entrée dépôt + retour** | Table `scan_events` (carrier/tracking texte libre, idempotence anti-fraude) + transitions retour (attendu→reçu→dépôt) et endommagé | Moyen | @security | 4 |
| **6** | **Commandes 3 canaux portent la variante** | `variant_id` sur `orders` / `wholesale_order_items` / panier + transitions de statut (réservé/parti/livré/retour) câblées sur les flux commande | **ÉLEVÉ** | **@finance + @security** | 4 |
| **7** | **Bascule finale du compteur sur la variante** | Le stock devient la source de vérité au niveau variante ; on **coupe l'ancien** `products.stock_count` une fois le nouveau prouvé | **MAXIMAL** | **@finance + @security + Abdou** | 6 |

- **EN PARALLÈLE (dès étapes 1-2 faites)** : **stock fournisseur multi-modes + fraîcheur** (`stock_mode`, `stock_quantity_updated_at`, « dispo réel » pondéré).
- **REPORTÉS** : **Egrow / WMS-2** (ecom perso câblé) ; **réconciliation argent transporteur** (attend formats fichiers).
- **ÉTAT ACTUEL** : carto variantes **FAITE**, carto statuts **FAITE**, **AUCUN build commencé**. Décisions **VALIDÉES** : modèle **ledger (option B)**, **retours scannés**, **réconciliation reportée**, **double-écriture**.

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

➡️ **Lancer le build de l'Étape 1 — créer les variantes (table `product_variants` + variante défaut rétro-remplie), socle additif zéro risque, audit `@security`** — sur une branche dédiée, après GO d'Abdou.
