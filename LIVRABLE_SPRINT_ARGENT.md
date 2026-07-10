# LIVRABLE — SPRINT CŒUR ARGENT (automatisation grand livre + machine à états)

> **Branche :** `feat/b3-mig122-ledger-auto-wiring` — **✅ GO MERGE donné par Abdou (2026-07-10)** après TEST RÉEL de bout en bout @tester (finance équilibrée prouvée chiffrée, zéro régression, étanchéité prouvée). **Mergée `main` `--no-ff`. NON poussée** (Abdou pousse). **Seuil anti-fraude 70 = GARDÉ (décision Abdou).**
> **Suite de B2** (grand livre double-entrée mig 121, déjà en prod). Ici : le **branchement AUTOMATIQUE** (122), la **machine à états des commissions + règle N1** (123), et l'**anti-fraude sur la payabilité** (124, LOT 3).
> **Date :** 2026-07-10. **Modèle :** Opus (cœur argent). **Circuit règle #5 respecté** : @finance + @security AVANT commit.

---

## 🎯 Objectif du sprint
Fermer le trou où « l'argent se perdait » : tracer AUTOMATIQUEMENT chaque dirham du cycle COD affilié dans le grand livre double-entrée (121), et garantir qu'une **commission n'est payable qu'après réconciliation réelle du versement livreur** (règle N1) — non contournable, gravé en base.

---

## ✅ LOT 1 — mig 122 : branchement AUTO du grand livre (double-entrée)

**Fichier :** `supabase/migrations/122_ledger_auto_wiring.sql` (additif, idempotent, non destructif).

**Ce qui est branché automatiquement :**
- **Commande LIVRÉE** (`status→delivered`) → transaction `cod_collected` : débit `cash_in_transit_courier` (+ total encaissé) réparti EXACTEMENT en crédits (`supplier_payable`, `delivery_income`, `confirmation_income`, `packaging_income`, `affiliate_commission_payable`, `platform_margin_income`). **La marge plateforme = RÉSIDU** qui absorbe l'arrondi → somme des écritures = 0 par construction (revérifiée par la contrainte différée 121 au COMMIT).
- **Retour / annulation après livraison** → transaction `commission_reversal` = **contre-passation exacte** (toutes lignes inversées).
- **Versement livreur réconcilié** (RPC admin `reconcile_courier_remittance`, bordereau `courier_remittances`/`courier_remittance_orders`) → transaction `courier_remittance` : débit `platform_cash` (+ reçu) / crédit `cash_in_transit_courier` (− reçu). **Le manque (attendu − reçu) reste chiffré dans `cash_in_transit_courier` = créance livreur = fin de la fuite invisible.** Vue `v_courier_cash_in_transit`.

**Snapshots figés (coût usine + marge plateforme) :** table dédiée **`order_financial_snapshots`** (RLS **staff-only**), peuplée par trigger `snapshot_order_financials()` AFTER INSERT ON orders (réplique `calculatePlatformPrice`, atomique). *(cf. correctif P0 sécurité ci-dessous — ces montants ne sont JAMAIS sur `orders` lisible par l'affilié.)*

**Coexistence sans régression :** `ledger_entries` (048) et `create_payout` (049) **INCHANGÉS**. Zéro double-comptage.

**🐞 Bugs interceptés et corrigés avant commit :**
1. **Régression mig 052 (interception @moi, avant audit)** : le brouillon avait DROPPÉ les colonnes devise 052 (`currency, amount_source, fx_rate_to_mad`) des INSERT `ledger_entries` dans les 2 triggers → régression silencieuse (`amount_source=NULL`). **Restaurées à l'identique de 052.**
2. **P0 @security — fuite de marge** : les snapshots étaient en colonnes sur `orders` → l'affilié pouvait lire coût fournisseur + marge plateforme par REST (la RLS filtre les lignes, pas les colonnes). **Corrigé** : déplacés dans `order_financial_snapshots` RLS staff-only (plutôt que restreindre `orders`, qui aurait cassé en cascade les policies affilié référençant `orders` — régression type mig 116). orders.ts reverté (le trigger SQL est l'unique source).
3. **P1 @security — forge d'écriture ledger** : les 3 fonctions `ledger2_*` SECURITY DEFINER n'avaient pas de `REVOKE ... FROM PUBLIC` → appelables en RPC par tout `authenticated` pour forger des écritures hors du chemin livraison. **Corrigé** : `REVOKE ALL FROM PUBLIC` (triggers owner + service_role gardent l'exécution).

**Preuve LOCALE : 15/15** (snapshot staff-only figé factory 200/marge 40 ; décomposition exacte usine 200 + marge 40 + livraison 70 + confirmation 20 + emballage 20 + commission 50 = 400 ; somme=0 ; réconciliation reçu 380 → platform_cash +380, créance livreur résiduelle +20 ; contre-passation net 0 ; idempotence cod_collected + bordereau).

**Audits :** @finance 🟢 GO (décomposition équilibrée, résidu marge, numeric, idempotence, snapshot figé) · @security 🟢 GO (P0 fuite marge + P1 forge REVOKE fermés et prouvés en base). **Commit `18f794b`.**

---

## ✅ LOT 2 — mig 123 : machine à états commissions + RÈGLE N1

**Fichiers :** `supabase/migrations/123_commission_payable_state_machine.sql`, `src/app/actions/commissions.ts`, `src/components/admin/commission-status-form.tsx`, `messages/{fr,en,ar}.json`.

**Machine à états gravée EN BASE (non contournable) :** `pending → approved → paid` (+ `reversed` orthogonal).
- **GARDE `commissions_enforce_payable_gate()`** (BEFORE UPDATE, SECURITY DEFINER) :
  - `→approved` REFUSÉ si la commande n'est PAS couverte par un bordereau `courier_remittances` **reconciled** (= **RÈGLE N1**), ou si la commission est `reversed`.
  - `→paid` REFUSÉ sauf depuis `approved` non contre-passée (ferme le raccourci `pending→paid`).
  - `paid` **terminal**.
- **AUTO-APPROBATION `commissions_auto_approve_on_remittance()`** (AFTER INSERT ON courier_remittance_orders) : à la réconciliation, les commissions `pending` non-reversées des commandes couvertes passent AUTOMATIQUEMENT `→approved`. **La réconciliation EST l'événement qui rend la commission payable.**
- `create_payout` (049) **INCHANGÉ** : paie toujours seulement `approved AND reversed=false` (atomique, idempotent, écrit le ledger).

**Côté application (ceinture + bretelles) :**
- `updateCommissionStatus` n'accepte plus `'paid'` (que `approved`/`pending`). `paid` posé EXCLUSIVEMENT par `create_payout`.
- Bouton « Marquer payée » **retiré** (il permettait `pending→paid` en 1 clic) → règlement uniquement via `/admin/payouts`. i18n FR/AR/EN (`approvedAwaitingPayout`).

**🐞 Bug intercepté (@finance Q1) et corrigé :** la garde initiale ne gardait que `→approved`, pas `→paid` → un admin/agent pouvait `pending→paid` direct via `updateCommissionStatus` (court-circuit N1 + create_payout). **Fermé** sur les 3 barrières (garde DB + action + UI).

**Preuve LOCALE : 8/8** (garde N1 refuse approve pré-réconciliation ; auto-approbation `pending→approved` ; `create_payout→paid` ; `paid` terminal ; reversed non approuvable auto NI manuel ; `pending→paid` direct REFUSÉ ; `approved+reversed→paid` REFUSÉ).

**Audits :** @finance 🟢 GO (Q1 fermé, exhaustivité `→paid` vérifiée, zéro régression `create_payout`) · @security 🟢 GO (garde/auto-approbation DEFINER non contournables, TS sain). **Commit `2caa2a5`.**

---

## 🪵 Dettes tracées (non bloquantes — @finance)
- **D-N1a** : `reconciled` au niveau bordereau (pas par commande) → un versement livreur **court** auto-approuve tout le lot (payable sur cash partiellement non reçu). À traiter : réconciliation/tolérance par commande.
- **D-N1b** : commission **payée puis retour** = argent sorti sans clawback automatique ; le solde négatif est tracé au ledger (048) mais la récupération est manuelle (compensation sur commissions futures).
- **D-N1c** (pré-existant) : `affiliate_commission_payable` du grand livre GLOBAL (121/122) n'est pas soldé par `create_payout` (qui n'écrit que le ledger face-affilié 048) → réconcilier les deux livres.
- Conformité KYC/AML/licence de paiement : hors périmètre technique (professionnel dédié).

---

## ✅ LOT 3 — mig 124 : ANTI-FRAUDE sur la payabilité (B7)

**Fichiers :** `supabase/migrations/124_fraud_gate_commission_payable.sql`, `src/app/actions/fraud.ts`, `src/components/admin/fraud-hold-control.tsx`, `src/app/(admin)/admin/orders/[id]/page.tsx`, `src/lib/order-analytics.ts`, `src/types/database.ts`, `messages/{fr,en,ar}.json`.

**Le score de fraude était SCORÉ mais jamais APPLIQUÉ** (juste affiché). Ici on le branche sur l'argent.
**Règle B7 (complète N1) :** commission payable ⇔ commande **RÉCONCILIÉE** (N1) **ET** (`fraud_score < 70` **OU** retenue levée par un admin).

- `orders.fraud_cleared_at/by` : trace la levée admin.
- `is_order_fraud_held(order_id)` : `fraud_score >= 70` ET non levée (**seuil centralisé**, aligné avec `FRAUD_HOLD_THRESHOLD` côté TS).
- **GARDE N1 (123) étendue** : `→approved` refusé aussi si la commande est retenue.
- **AUTO-APPROBATION (123) étendue** : n'approuve PAS une commande retenue (`AND NOT is_order_fraud_held`) → elle reste `pending` sans faire échouer la réconciliation de tout le lot.
- **RPC admin `clear_order_fraud_hold()`** : lève la retenue + **rattrapage** (approuve si déjà réconciliée). Garde admin/service_role ; `is_order_fraud_held` = helper interne (REVOKE public/anon/authenticated).
- **UI admin** `/admin/orders/[id]` : bloc retenue + bouton « lever » (server action `clearOrderFraudHold` requireAdmin), badge « levée » ; i18n FR/AR/EN. **0 montant/ledger modifié** (gate d'état pur).

**⚙️ DÉCISION MÉTIER — SEUIL DE RETENUE = `fraud_score >= 70`.** Choix conservateur (ne retient que le risque franc ; l'admin lève après revue). **À valider/ajuster par Abdou** — centralisé (SQL `is_order_fraud_held` + TS `FRAUD_HOLD_THRESHOLD`).

**Preuve LOCALE : 6/6** (commande fraude score 80 NON auto-approuvée + approbation manuelle REFUSÉE ; levée admin → rattrapage approuve ; fraude faible 10 auto-approuvée ; levée avant/après réconciliation). **mig122 16/16 + mig123 8/8 re-verts** (zéro régression LOT 2).

**Audits :** @finance 🟢 GO (ferme le trou « fraude → payable », 0 montant modifié, N1+B7 cohérent, idempotent) · @security 🟢 GO (grants corrects, non-admin ne peut pas contourner, écriture serveur, 0 fuite). **Commit `af55dfe`.**

**Dette tracée D-B7a :** le bloc `→paid` ne re-vérifie pas la fraude (non exploité — le scoring précède l'approbation ; à revoir si un score peut monter tardivement).

---

## 📋 État & prochaine action
- **3 lots COMMITÉS** sur `feat/b3-mig122-ledger-auto-wiring` (chaque commit pre-commit vert) :
  `18f794b` LOT 1 · `2caa2a5` LOT 2 · `af55dfe` LOT 3.
- **4 checks verts** (état final combiné) : `tsc` 0 · `vitest` 669 · `build` OK · `smoke` 16. Tests SQL LOCAL : mig122 16/16 · mig123 8/8 · mig124 6/6.
- **Migrations 122/123/124 appliquées en LOCAL uniquement** (121 déjà en prod). **À appliquer en prod APRÈS push + Vercel Ready**, méthode **pooler pg** (`backups/.db_password`), lockstep — **JAMAIS le Supabase CLI**.
- **NON poussé / NON mergé** — attente **GO Abdou** (règle : pas de merge/push sans accord explicite).
- **Circuit financier (règle #5) respecté** : @finance + @security 🟢 sur les 3 lots.

### ✅ Test réel @tester (2026-07-10, LOCAL, tout en ROLLBACK)
- **POINT 1 finance ✅** : décomposition chiffrée équilibrée à 0 (cash_in_transit +400 vs crédits −400), versement partiel 380/400 → créance livreur 20 chiffrée, N1 prouvée (payable seulement après réconciliation) + contre-preuve (approbation refusée en base sans versement). 30 assertions vertes.
- **POINT 2 non-régression ✅** : vitest 668/669 (le 1 échec = `lot1b-notif` flaky, 7/7 en isolation), parcours acheteur/facture/réassort/nudge/bot/marketplace tous verts, smoke 16/16, trigger snapshot ne casse aucune création de commande.
- **POINT 3 étanchéité ✅** : `order_financial_snapshots` staff-only (affilié → 0 ligne, admin → visible), `ledger2_*`/`is_order_fraud_held` non exécutables anon/authenticated, RPC admin refusent les non-admin, bordereaux invisibles à l'affilié.

### ⚠️ À faire APRÈS le push d'Abdou (Vercel Ready)
1. **Appliquer 122 → 123 → 124 en prod DANS L'ORDRE** (pooler pg via `backups/.db_password`, **jamais le CLI**), lockstep, **vérif AVANT/APRÈS de chacune**.
2. **Régénérer les types** (`supabase-generated.ts`) une fois les migrations en prod, puis retirer le cast ciblé dans `src/app/actions/fraud.ts`. *(`npm run types` vise la PROD `--project-id` — à lancer SEULEMENT après application prod.)*
3. **Traiter les dettes** D-N1a/b/c + D-B7a quand prioritaire.
- **Seuil anti-fraude `fraud_score >= 70` : GARDÉ (décision Abdou 2026-07-10).**

## 🪵 Dette additionnelle (LOT 3)
- **D-B7a** : le bloc `→paid` de la garde ne re-vérifie pas `is_order_fraud_held` (non exploité dans le flux nominal — le scoring fraude précède l'approbation). À durcir si un `fraud_score` peut monter APRÈS approbation.
