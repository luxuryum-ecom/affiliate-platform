# LIVRABLE P0 — Débloquer le cœur argent + Dashboards

> Chantier autonome démarré le 2026-07-10. Branche : `feat/p0-tresorerie-reconciliation` (NON mergée — GO Abdou requis).
> Ce fichier est mis à jour au fil des lots pour survivre à une coupure de session.
> **Statuts par lot : ✅ prêt / 🟡 partiel / ⏭️ sauté / 🔄 en cours.**

---

## RÉSUMÉ EXÉCUTIF (état vivant)

| Lot | Sujet | Statut |
|---|---|---|
| P0-A | Couche données (mig 125 + actions remittances/treasury) | ✅ prêt |
| P0-B | Écran Réconciliation livreur | ✅ prêt (capturé FR/AR/EN) |
| P0-C | Cockpit Trésorerie | ✅ prêt (capturé FR/AR/EN, fixes finance appliqués) |
| P0-D | Preuve réconciliation→commission + 4 checks + audits | ✅ prêt (6/6, 4 checks verts, @finance 🟢 @security 🟡) |
| P2 | Audit dashboards + complétion + cohérence | 🟡 audit fait + 1 écran construit ; reste scopé |

**PARTIE 1 = ✅ MERGÉE `main` `--no-ff` (GO Abdou 2026-07-10, NON poussé — Abdou pousse). Migration 125 = PROD après push + Vercel Ready.** Le point le plus important est **PROUVÉ de bout en bout** : la
réconciliation d'un versement livreur débloque automatiquement la commission (garde N1). Test
d'intégration LOCAL **6/6 vert**. Les 2 écrans sont construits, audités (@finance + @security),
et capturés en FR/AR(RTL)/EN. **4 checks verts** (tsc 0 · build · vitest 675 · smoke 16).

**Captures réelles** : `p0-captures/{remittances,treasury}-{fr,ar,en}.png` (6 fichiers, à la racine du repo).

---

## PARTIE 1 — CŒUR ARGENT

### P0-A — Couche données ✅
**Migration `supabase/migrations/125_treasury_reconciliation_views.sql`** (idempotente, additive, 0 donnée modifiée, appliquée LOCAL — **prod = après GO Abdou via pooler**) :
- `v_courier_remittance_pending` : commandes COD `delivered` pas encore couvertes par un bordereau (à verser). Colonnes opérationnelles + montant attendu + commission affilié. **Zéro colonne marge/coût** (interdit). Livreur dérivé via `cities` (jointure sur `customer_city`).
- `v_treasury_overview` : solde agrégé par compte actif du grand livre (`SUM(amount)` signé + nb mouvements).
- Sécurité : `security_invoker=true` (pas d'élévation), accès réel garanti par RLS des tables + server actions admin-only.

**Server actions** (toutes `requireAdmin({allowAgent:false})`, zod, zéro parseFloat, zéro fuite marge) :
- `src/app/actions/remittances.ts` : `listPendingRemittances()`, `reconcileRemittance(input)` (idempotence sha256 déterministe → RPC `reconcile_courier_remittance`), `listRemittanceHistory()`.
- `src/app/actions/treasury.ts` : `getTreasuryOverview()` (soldes comptes + créance livreur + commissions par statut hors reversed + commandes en attente).

Types régénérés depuis LOCAL (`supabase-generated.ts`).

### P0-B — Écran Réconciliation livreur ✅
`src/app/(admin)/admin/remittances/page.tsx` (Server Component) + `src/components/admin/remittance-reconcile-form.tsx` (Client, aucune fonction passée en prop — règle absolue respectée).
- Commandes livrées en attente **groupées par livreur** ; sélection + montant reçu pré-rempli ; **écart en direct** ; versement partiel → **badge créance chiffrée** ; historique des bordereaux (écart en orange).
- i18n FR/AR/EN (`admin.remittances`, 52 clés) + RTL. Thème admin (tokens sémantiques).
- Accès admin-only (redirect agents), cohérent avec les server actions.
- **Capture vérifiée** : 8 commandes en attente / 2 livreurs / historique avec écart partiel 40 MAD en orange, statuts « Réconcilié » verts. Rendu niveau SaaS pro.

### P0-C — Cockpit Trésorerie ✅
`src/app/(admin)/admin/treasury/page.tsx` (Server Component).
- KPIs : cash plateforme, **cash en transit livreur (créance, highlight si >0)**, dettes fournisseurs, commissions à payer, marge accumulée. Sous-KPI : commandes en attente de réconciliation (lien vers l'écran).
- Commissions par statut (barres hand-rolled) + tableau des soldes de comptes (libellés humains i18n `admin.treasury.accounts.<code>`) + note pédagogique double-entrée.
- i18n FR/AR/EN (`admin.treasury`, 33 clés) + RTL. Lit `v_treasury_overview`/`v_courier_cash_in_transit` = source unique (grand livre).
- **Fixes @finance appliqués** : (P2-2) couleur rouge du tableau des soldes déclenchée par ANOMALIE (écart au sens normal du compte), plus par le simple signe négatif → un passif/revenu sain n'est plus rouge ; (P2-3) KPI « Commissions à payer » = commissions **approuvées** (définition unique et actionnable) au lieu du solde ledger ambigu ; `Math.abs()` cohérent sur les 3 KPI de magnitude.
- **Capture vérifiée** (post-fix) : KPIs positifs cohérents (Commissions à payer 27 130 MAD = approuvées, Marge 131 488 MAD), tableau signé + légende double-entrée.

**Découvrabilité** : 2 cartes d'action ajoutées au dashboard admin (`Trésorerie`, `Réconciliation livreur`).

---

## PARTIE 2 — AUDIT DASHBOARDS

### Audit des features (écran admin ✅ / orpheline ⬜ / partiel 🟡)
| Feature | Verdict | Écran |
|---|---|---|
| Réassort AM-1 | ⬜ orpheline (pas nécessaire — self-service) | — |
| Alerte prix V5 / watchlist | ⬜ orpheline (nice-to-have) | — |
| **Suppression RGPD B8** | ⬜ orpheline **(priorité haute — conformité)** | manque écran demandes/anonymisés |
| Photo IA C2 | ⬜ orpheline (moyenne) | flag `photo_quality` non exposé en admin |
| Niche déclarée signup | ⬜ orpheline (faible) | `declared_niche` jamais affiché/filtré |
| **Facture PDF V3** | 🟡 partiel **(priorité haute)** | admin voit la demande, pas de génération PDF |
| Nudge AM-2 | ✅ (auto, pas d'écran attendu) | s/o |
| PWA AM-10 | ✅ (pas d'écran attendu) | s/o |
| Échantillons C3 | ✅ a son écran | `/admin/samples` (+[id]) |
| Stats affilié | 🟡 partiel (moyenne) | commissions/payouts/analytics OK ; pas de perf par affilié dans `users/[id]` |

### Complétion (par bon sens business, priorité décroissante)
1. **Stats affilié** — ✅ **CONSTRUIT**. Bloc « Performance affilié » dans `admin/users/[id]` (visible si role=affiliate) : commissions payées/approuvées/en attente, commandes totales/livrées, taux de conversion, CA COD généré, contre-passées. Agrégation serveur read-only de données existantes (commissions + orders par `affiliate_id`), **aucun nouveau calcul financier, aucune migration**. i18n FR/AR/EN (10 clés) + RTL, thème admin, tsc 0. **Pilotage quotidien par affilié débloqué.**
2. **RGPD B8** — ⏭️ **SCOPÉ, non construit** (décision autonomie : budget + priorité). Précision issue du code : la suppression B8 anonymise **immédiatement** (pas de file d'attente à valider) → l'écran utile = un **REGISTRE de conformité** en lecture (`profiles` `status='deleted'` + `anonymized_at`), pas un workflow d'approbation. Lot suivant recommandé (petit, @security léger pour l'accès à la liste). **Priorité conformité : à faire tôt.**
3. **Photo IA C2** — ⏭️ **SCOPÉ, non construit**. Exposer le flag `photo_quality` (déjà calculé par `telegram/photo-quality.ts`) dans la liste/fiche de modération `supplier-products`. Petit lot d'affichage (moitié du terrain déjà là via la section modération). Faible risque.
4. **Facture PDF V3** — ⏭️ **SCOPÉ, non construit** (plus gros lot). Génération/téléchargement du PDF depuis la fiche commande grossiste (ICE/RC déjà capturés). Touche l'affichage de montants → **circuit @finance** requis. Lot dédié.
> Volontairement NON construits (inutiles) : réassort AM-1, watchlist V5, nudge AM-2, PWA AM-10.

### Cohérence globale dashboard
- Les 2 nouveaux écrans + le bloc stats affilié **répliquent exactement** le header et les tokens sémantiques du dashboard admin (vérifié sur captures) → cohérence assurée avec l'existant.
- 2 cartes d'accès ajoutées au dashboard admin (découvrabilité).
- ⏭️ Un **refactor nav complet des ~39 pages** (cohérence directionnelle RTL admin, uniformisation fine) dépasse le périmètre de ce run autonome → lot de polish séparé recommandé (déjà tracé en dette « RTL admin » dans ETAT_SYSTEME).

---

## PARTIE 3 — VÉRIFICATIONS

### 4 checks (branche `feat/p0-tresorerie-reconciliation`) — ✅ TOUS VERTS
- `tsc --noEmit` : ✅ 0 erreur
- `next build` : ✅ OK (routes `/admin/remittances` + `/admin/treasury` buildées)
- `vitest run` : ✅ **675/675 verts** (les 6 tests P0 inclus ; le flaky `lot1b-notif` est passé aussi)
- `pnpm smoke` : ✅ 16 passed (4 skipped supplier — baseline habituelle)

### Preuve de bout en bout — réconciliation → commission débloquée ✅
Test `tests/p0-remittance-unblocks-commission.integration.test.ts` — **6/6 vert** en LOCAL (`assertLocalSupabase`) :
1. Livraison COD → commission `pending` (trigger mig 122).
2. AVANT réconciliation : `UPDATE commission → approved` **ÉCHOUE** (garde N1 mig 123, même en service_role).
3. La commande figure dans `v_courier_remittance_pending`.
4. `reconcile_courier_remittance` → commission **AUTO-APPROUVÉE** + sortie du pending + txn `courier_remittance` au grand livre.
5. Idempotence : rejeu même clé → pas de doublon.
6. Versement PARTIEL → **créance livreur chiffrée** (`v_courier_cash_in_transit.balance_mad > 0`).

### Audits (règle #5 — argent/accès) — FAITS
- **@finance : 🟢 GO** (aucun P0/P1). Lot authentiquement additif : source unique = grand livre, idempotence sha256 OK, versement partiel → créance chiffrée OK, zéro nouveau calcul de marge, zéro régression (`create_payout`/`updateCommissionStatus`/triggers intacts). 4 findings P2 → 2 corrigés (P2-2 couleur, P2-3 KPI), 2 documentés (P2-1 sommes JS = non-problème pour centimes entiers < 2^53 ; P2-4 correction d'un bordereau = flux contre-passation futur).
- **@security : 🟡 GO** (aucun P0/P1). Design `security_invoker` sain (RLS `orders` row-scoped + `ledger_postings` staff-or-own-party → un non-staff ne voit au pire que SES lignes, jamais autrui ni les marges), garde admin solide, RPC paramétrée (pas d'injection), zéro service_role client, Client Component conforme. **P2-1 CORRIGÉ** : rempart staff ajouté DANS les 2 vues (`AND (my_role() IN ('admin','agent') OR service_role)`) → défense en profondeur, un non-staff obtient 0 ligne indépendamment de la RLS sous-jacente. **P2-3 CORRIGÉ** : `reconcileRemittance` refuse tout orderId hors périmètre pending (non livré / déjà réconcilié). P2-2 (idempotence sans montant) = documenté.

### Captures réelles ✅
6 fichiers dans `scratchpad/p0-captures/` : `remittances-{fr,ar,en}.png`, `treasury-{fr,ar,en}.png`. RTL AR confirmé (`html[dir=rtl]`, layout miroir), chiffres en numéraux latins. Rendu niveau SaaS pro validé visuellement (voir P0-B/P0-C).

---

## ✅ LIVRÉ EN PROD (2026-07-10)

**Lot P0 + P2 MERGÉS `main` `--no-ff`, POUSSÉS, déployés Vercel (04d5172).**
**✅ Migration 125 APPLIQUÉE EN PROD** (pooler `backups/.db_password`, transaction atomique lockstep APRÈS déploiement — jamais le CLI). Vérifié AVANT (2 vues absentes) / APRÈS (2 vues créées, colonnes correctes, **rempart staff `my_role`+`service_role` dans les définitions**, `security_invoker` actif, historique `schema_migrations` **001→125 sans trou**). **Rempart prouvé live** : contexte service_role → 8 comptes visibles ; contexte non-staff → 0. Types prod régénérés = **identiques** au fichier commité (aucun changement). **Le cœur argent est désormais pilotable en prod : `/admin/treasury` + `/admin/remittances` lisent les vraies vues.**

### Manifeste des fichiers (branche `feat/p0-tresorerie-reconciliation`)
**Lot P0 — CŒUR ARGENT (financier → GO Abdou requis, puis mig prod) :**
- `supabase/migrations/125_treasury_reconciliation_views.sql` (nouveau)
- `src/app/actions/remittances.ts`, `src/app/actions/treasury.ts` (nouveaux)
- `src/app/(admin)/admin/remittances/` , `src/app/(admin)/admin/treasury/` (nouveaux)
- `src/components/admin/remittance-reconcile-form.tsx` (nouveau)
- `src/app/(admin)/admin/dashboard/page.tsx` (2 cartes d'accès)
- `src/types/supabase-generated.ts` (types des 2 vues, régénéré LOCAL)
- `tests/p0-remittance-unblocks-commission.integration.test.ts`, `e2e/p0-captures.spec.ts`, `playwright.p0.config.ts`, `scripts/seed-p0-captures-local.mjs`
- `messages/{fr,ar,en}.json` (sections `admin.remittances`, `admin.treasury`)

**Lot P2 — STATS AFFILIÉ (non financier, additif display) :**
- `src/app/(admin)/admin/users/[id]/page.tsx` (bloc perf affilié)
- `messages/{fr,ar,en}.json` (clés `admin.userDetail.*`)

**Docs :** `LIVRABLE_P0_DASHBOARDS.md`, `ETAT_REEL_2026-07-10.md`.

### Checklist GO
- [ ] **GO Lot P0** (réconciliation + trésorerie) — @finance 🟢 + @security 🟡 (P2 corrigés) + 4 checks verts + captures OK. **Prêt.**
- [ ] Après GO P0 : **appliquer la migration 125 en PROD** (pooler `backups/.db_password`, lockstep, vérif AVANT/APRÈS — jamais le CLI) puis régénérer les types depuis la prod.
- [ ] **GO Lot P2 stats affilié** (non financier) — peut être mergé indépendamment.
- [ ] Lots suivants recommandés (non construits) : registre RGPD, flag photo IA, facture PDF.

### Confirmation de bout en bout ✅
**Réconciliation → commission débloquée : PROUVÉ** (test 6/6). En prod, une fois la mig 125 appliquée :
livraison COD → commission `pending` → l'admin enregistre le versement livreur sur `/admin/remittances`
→ la commission passe **automatiquement `approved`** (payable via `/admin/payouts`). Le cash et la créance
livreur sont visibles sur `/admin/treasury`. Le maillon manquant du cœur argent est refermé.

*Dernière mise à jour : chantier P0 terminé + P2 stats affilié. Reste = GO Abdou.*
