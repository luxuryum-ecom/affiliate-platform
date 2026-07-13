# CORRECTIF FINANCE — X-1 (commission empoisonnée) + C-1 (clawback non récupéré) + C-2

> **Statut : GO-ready.** Branche `fix/finance-x1-c1`. **Rien commité, prod intouchée.**
> Migration `132_finance_fix_x1_c1.sql` = **LOCAL uniquement** (appliquée en base locale
> `127.0.0.1:54322` pour les tests, jamais poussée en prod). Date : 2026-07-13.
> Réf audit : `AUDIT_SAAS_2026-07-12.md` (findings X-1 P0/P1, C-1 P1, C-2 P2).

---

## 1. CE QUI A CHANGÉ

### Migration `supabase/migrations/132_finance_fix_x1_c1.sql` (additive uniquement)
Aucun trigger financier existant supprimé ni modifié destructivement. On **ajoute** :

1. **Fonctions helper pures** (parité EXACTE avec le TS, `IMMUTABLE`, testables) :
   `calc_platform_price_mad`, `calc_affiliate_commission_mad` (miroirs de
   `calculatePlatformPrice` / `calculateNetAffiliateCommission`, `src/lib/utils.ts`),
   `score_duplicate_order`, `score_spam_order`, `score_fraud_order` (miroirs de
   `src/lib/order-analytics.ts`).

2. **Garde structurelle X-1 + C-2** — trigger `BEFORE INSERT` SECURITY DEFINER
   `enforce_affiliate_order_financials` sur `orders` :
   - **Scopé au SEUL vecteur non fiable** : `NEW.affiliate_id IS NOT NULL AND
     my_role() = 'affiliate'`. Les inserts service_role/admin (flux public
     `placeOrder`, seeds, tests, RPC) → trigger **inerte** → **zéro régression**.
   - **X-1** : recalcule la commission maximale côté serveur depuis `products` et
     **REFUSE** (RAISE, rollback) toute commande dont la commission **dépasse** ce
     recalcul (+ tolérance d'arrondi `0.01×qté + 0.01`). Une commande légitime
     (commission = recalcul) **passe inchangée, jamais réécrite**.
   - **C-2** : recalcule `fraud_score`/`duplicate_risk_score`/`spam_score` côté
     serveur (écrase toute valeur cliente) → un affilié ne peut plus forcer
     `fraud_score=0` via PostgREST pour échapper au gate B7 (mig 124).
   - Les affiliés n'ayant **aucune policy UPDATE** sur `orders` (RLS deny), le
     vecteur d'empoisonnement est l'INSERT → trigger INSERT-only suffisant, aucune
     interférence avec les flux de mise à jour de statut (livraison/réconciliation).

3. **C-1 clawback** :
   - Colonne additive `commissions.clawed_back boolean DEFAULT false`.
   - Élargissement **additif** de la CHECK `ledger_entries.entry_type` : ajout du
     type `clawback_recovery` (montant positif qui neutralise la contre-passation).
   - **Redéfinition NON destructive** de `create_payout` (`CREATE OR REPLACE`) :
     verse le **SOLDE NET** = `SUM(approuvé payable) − SUM(clawback en attente)`,
     `MAX(0, net)`. Solde net ≤ 0 → **reporté** au prochain versement (RAISE, aucun
     versement négatif). Écrit `clawback_recovery (+montant)` + marque `clawed_back`
     → grand livre 048 équilibré (somme = 0 après solde complet).
   - **Garde payout X-1 (défense en profondeur)** : refuse une commission approuvée
     dépassant `total − coût_usine − frais×qté` (rattrape une éventuelle commission
     empoisonnée créée AVANT le déploiement du trigger).
   - **Sans clawback en attente : comportement IDENTIQUE à l'existant** (mig 052) —
     montant = `SUM(approuvé)`, mêmes clés d'idempotence `payout:<id>`, même ledger.

### Code applicatif `src/app/actions/orders.ts` (C-2)
`createAffiliateOrder` ne force plus `fraud_score=0` : il **score** le self-order
comme le flux public (`scoreDuplicateOrder`/`scoreSpamOrder`/`scoreFraudOrder`,
`hasAffiliate=true`). Cohérence app/UI + défense en profondeur (le trigger reste la
garantie structurelle).

---

## 2. PREUVES DES TESTS D'ATTAQUE (LOCAL, `assertLocalSupabase`)

### X-1 — `tests/audit-adversarial.integration.test.ts` (+3 tests, JWT affilié réel)
| Test | Scénario | Résultat |
|---|---|---|
| **X1a** | Scénario X-1 exact : INSERT direct `commission=99999` sur ~50 MAD | **INSERT REFUSÉ côté base** + `rows.length===0` ✅ |
| **X1b** | Non-régression : commande affilié **légitime** (commission 112 correcte) | **PASSE**, commission conservée à 112 ✅ |
| **X1c** | Empoisonnement partiel : voler la marge (commission 167 > recalcul 112) | **REFUSÉ** ✅ |

### C-1 — `tests/payout-clawback-c1.integration.test.ts` (+4 tests, admin JWT)
| Test | Scénario | Résultat |
|---|---|---|
| **C1-A** | Non-régression : payout **sans retour** = `SUM(approuvé)` | montant = 40 (inchangé) ✅ |
| **C1-B** | Commission payée (40) puis **retour post-paiement** → versement suivant | 100 − 40 = **60** (déduit) ✅ |
| **C1-C** | Grand livre équilibré | solde ledger affilié = **0** ✅ |
| **C1-D** | Clawback (30) ≥ gains approuvés (10) → net ≤ 0 | **versement refusé/reporté**, 0 payout négatif ✅ |

---

## 3. LES 4 CHECKS — TOUS VERTS

| Check | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** ✅ |
| `npx next build` | **OK** (exit 0) ✅ |
| `npx vitest run` | **749 passed / 0 failed** (71 fichiers) — 731 existants + 11 adversariaux + 3 X-1 + 4 C-1 ✅ |
| `npx playwright test` (smoke) | **16 passed**, 4 skipped ✅ |

**Aucune régression** : les 731 tests existants + les 11 tests adversariaux restent verts.

---

## 4. VERDICTS AUDIT

### @finance — 🟢🟢🟢🟢 (les 4 invariants du mandat PROUVÉS)
- **(a)** Une commission ne peut plus dépasser `total − usine − frais` : garde INSERT
  (recalcul + refus > recalcul) + garde payout 2bis. **Parité SQL↔TS exacte** sur le
  domaine réel (montants positifs → `round` SQL == `Math.round` JS) ; tolérance
  d'arrondi correctement dimensionnée → aucune commande légitime cassée.
- **(b)** Retour post-paiement déduit du versement suivant, **jamais compté deux fois**
  (filtre `clawed_back=false` + marquage `true`, report si net ≤ 0).
- **(c)** Grand livre équilibré : `+earned − payout − reversed + clawback_recovery = 0` ;
  vue `ledger_balances` (`SUM(amount)`) correcte avec le nouveau type.
- **(d)** Zéro régression : payout sans clawback bit-identique à mig 052 ; commande
  légitime jamais refusée ni modifiée.
- **Reco GO** avec : synchro du `35` (commentaire ajouté ✅), confirmation aucun trigger
  BEFORE INSERT concurrent ne réécrit `fraud_score` (**vérifié : seul le nôtre existe** ✅).

### @security-reviewer — 🟢 VERT (0 critique, 0 important, 2 notes mineures)
- INSERT empoisonné **refusé côté base** (trigger de table s'exécute pour tout INSERT,
  y compris PostgREST direct en JWT affilié ; RAISE → rollback). Prouvé X1a/X1c.
- **Aucun contournement** : `affiliate_id=NULL` bloqué par RLS (`= auth.uid()`) ;
  `my_role()` non spoofable (JWT signé) ; rôle affilié figé (E1) ; se faire passer pour
  admin/service_role **retire** la permission d'insérer → impasse.
- SECURITY DEFINER sain (`search_path=public` figé, params liés, pas de SQL dynamique) ;
  **le coût usine ne fuit pas** (le message d'erreur n'expose que `v_floor` = la propre
  commission de l'affilié, déjà visible dans son UI).
- Vecteur UPDATE déjà fermé par RLS (affiliés sans policy UPDATE sur `orders`).
- C-2 fermé (fraud_score écrasé serveur). Aucun chemin d'écriture non autorisé sur
  `clawed_back` / `clawback_recovery` / `create_payout` (RLS deny + garde admin interne).
- **Secrets tests : conforme** (clés via `getLocalSupabaseEnv()`, LOCAL only, aucune clé en dur).

---

## 5. POINTS À REMONTER À ABDOU (avant application prod)

1. **Exposition legacy prod (à valider).** Le trigger ne s'applique qu'aux INSERT
   **futurs** ; `create_payout` protège les versements futurs. Si des commissions
   **déjà empoisonnées** existent en prod, la garde payout 2bis rattrape la *création
   de monnaie* (commission > total − usine − frais) mais **pas** un vol de marge pur
   déjà enregistré. → vérifier en prod (lecture seule) s'il existe des commissions
   anormales avant application.
2. **Premier payout post-déploiement** : tous les retours COD post-paiement historiques
   (`paid` + `reversed` + `clawed_back=false`) seront récupérés d'un coup au prochain
   versement de l'affilié concerné (comportement correct, mais à anticiper).
3. **Application prod = migration 132** à jouer **sur GO explicite d'Abdou** (règle
   absolue n°5 : changement financier), via le pooler `pg` (jamais le CLI), après merge.

---

## 6. FICHIERS

| Fichier | Nature |
|---|---|
| `supabase/migrations/132_finance_fix_x1_c1.sql` | **Nouveau** (LOCAL only) — garde X-1/C-2 + create_payout C-1 |
| `src/app/actions/orders.ts` | Modifié — C-2 (scoring self-order) |
| `tests/audit-adversarial.integration.test.ts` | +3 tests X-1 (X1a/b/c) |
| `tests/payout-clawback-c1.integration.test.ts` | **Nouveau** — 4 tests C-1 |
| `CORRECTIF_FINANCE_X1_C1.md` | Ce bilan |

**Prochaine action** : validation Abdou → merge `fix/finance-x1-c1` → application mig 132
en prod sur GO (avec vérif legacy point 5.1). Rien n'est commité ni poussé à ce stade.
