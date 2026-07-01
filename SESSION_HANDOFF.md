# SESSION_HANDOFF.md — Reprise sans contexte

> **Dernière mise à jour :** 2026-06-30
> **Branche prod :** `main` @ `39ae0d4`
> **Migrations prod :** 001→**110** appliquées (104→110 confirmées en **Remote** le 2026-06-30)
> **URL prod :** https://affiliate-platform-gamma.vercel.app
> **Projet Supabase :** `owvtfzxvirttrbcsiveg`

Lire aussi : `ETAT_SYSTEME.md` (registre de vérité — POINT DE REPRISE en tête), `FEUILLE_DE_ROUTE.md`, `CLAUDE.md`.

---

## 🎉 ÉTAT : BETA-READY — périmètre bloquant COMPLET en prod

**Tous les lots bloquants beta sont mergés `main` ET appliqués en prod Supabase Remote** (109/110 vérifiées présentes en Remote par sondage direct le 2026-06-30 : `orders.assigned_to` ✅ + `notifications.cod_order_id` ✅).
La plateforme est **fonctionnellement prête pour la beta**. Il reste **4 bloquants techniques go-live** (voir « Prochaine action » ci-dessous) ; aucun n'est une feature manquante.

**🤖 Ingestion Telegram fournisseur : PRÊTE en prod, mais 0 fournisseur lié à ce jour.** Le bot (`/link <code>` → photo + légende → extraction IA → fiche `pending_review` → modération admin) est fonctionnel et déployé (webhook Vercel), mais **jamais utilisé en réel** : le 1er fournisseur (TR/AE, comptes à créer de zéro) sera le test bout-en-bout. Devises de saisie en place et conformes (MA→MAD, AE→AED, TR/EG→USD) ; taux FX présents en prod mais valeurs seed indicatives (cf. PB-7).

| Lot | Contenu | Migration(s) | Statut prod |
|-----|---------|--------------|-------------|
| **Étape 7** | Bascule stock → variante (variante = source de vérité ; double-écriture maintenue/réversible) | **105** | ✅ EN PROD |
| **LOT 1C/1G** | Casiers dépôt (5 capacités) + personnel dépôt (`promoteToAgent` + capacité `assign_orders`, `can_assign_orders` rebranché sur `staff_permissions`, `team_members` = coquille morte abandonnée) | **106 + 107** | ✅ EN PROD |
| **fix-admin** | `promoteToAdmin` garde anti-escalade **fail-closed** (bootstrap one-time, @security GO 2026-06-29, prouvé e2e) | — (code) | ✅ EN PROD |
| **LOT 1E** | Journal d'audit GLOBAL append-only (`admin_audit_log`, triggers immuables anti UPDATE/DELETE, UI `/admin/audit` filtrable, FR/AR/EN+RTL) | **108** | ✅ EN PROD |
| **LOT 1B** | Notifications commande COD affilié — in-app (admins + affilié concerné + personnel dépôt à casier COD) + Telegram admin, zéro PII | **109** | ✅ EN PROD |
| **LOT 1F** | Assignation des commandes COD à un agent (RPC atomique `assign_cod_order_atomic`, casier `assign_orders`, UI + i18n + audit) | **110** | ✅ EN PROD |
| **Cloche 1A** | UI cloche notifications in-app (badge + dropdown sur table `notifications`, FR/AR/EN + RTL) | — | ✅ EN PROD |

**Qualité :** @finance 🟢 · @security 🟢 sur tous les lots financiers/sensibles ; 4 checks verts (tsc 0 / build / vitest / smoke) à chaque lot. Détail complet par lot dans `ETAT_SYSTEME.md`.

---

## 🎯 PROCHAINE ACTION — 4 bloquants go-live, dans l'ordre

> **Action conseillée : (1) rotation des secrets, PUIS (2) backups auto prod.** Le reste (3 + 4) sont des actions ops courtes.

**1. 🔴 ROTATION DES SECRETS COMPROMIS (le plus urgent).** Une clé / un mot de passe compromis = contournement total du RLS, donc à faire AVANT tout le reste.
   - **`SUPABASE_SERVICE_ROLE_KEY`** — fuitée (incidents 2026-06-20/22 tests + 2026-06-27 via `NEXT_PUBLIC_APP_URL` inliné dans le bundle client) → **régénérer** (Supabase Dashboard → API Keys), reposer **uniquement** dans `SUPABASE_SERVICE_ROLE_KEY` (Vercel + `.env.local`), jamais en `NEXT_PUBLIC_*`, puis redeploy.
   - **Mot de passe admin** `AdminTest2026!` — **committé** → changer + nettoyer les comptes/secrets de test.

**2. 🚧 BACKUPS AUTO PROD.** La base prod `owvtfzxvirttrbcsiveg` n'a **aucun backup automatique actif**. Le LaunchAgent local `com.mozouna.backup-prod` dépend du PC allumé + Docker → non fiable. Activer **l'un** :
   - **(a) Supabase PITR** (plan Pro, payant) — backups continus côté serveur, restauration à la minute. **Recommandé.**
   - **(b) Cron `pg_dump` hébergé** hors-PC (serveur/CI indépendant), dump quotidien.

**3. ⚙️ VÉRIFIER / APPLIQUER MIG 091** (resserrage policy SELECT `products` → staff-only). Statut incohérent dans les docs (« appliquée » vs « reste à appliquer ») → **confirmer en prod** et `supabase db push` si absente. Sans elle, la table de base `products` reste lisible par les authentifiés (les pages passent déjà par la vue redacted, donc pas de fuite UI, mais policy à fermer).

**4. 🔧 CONFIG REDIRECT `/auth/callback` SUPABASE** (non-code). Ajouter `${NEXT_PUBLIC_APP_URL}/auth/callback` à l'allowlist « Redirect URLs » du dashboard Supabase Auth, sinon le reset mot de passe self-service ne boucle pas.

→ Détail backups : `ETAT_SYSTEME.md` → section 🛟 SÉCURITÉ / BACKUP. Détail rotation/incident : `ETAT_SYSTEME.md` → POINT DE REPRISE (🚨 INCIDENT SÉCURITÉ + NOTES OPS GO-LIVE).

---

## 🪵 Dettes post-beta connues (non bloquantes, après ouverture)

| # | Dette | Note |
|---|-------|------|
| 1 | **RTL admin** — refresh RTL complet | Cohérence directionnelle de toutes les pages admin |
| 2 | **Libellé cloche events sans i18n** | Certains événements de la cloche s'affichent en libellé brut → câbler FR/AR/EN |
| 3 | **MAD → DH espace grossiste** | Affiche `MAD` au lieu de `DH` sans décimales (vs `formatDH` affilié) ; affichage pur, zéro argent |
| 4 | **Mock `makeClient`** | Étendre le mock de `tests/orders.test.ts` pour couvrir `notifyOrderCreated` (LOT 1B) |
| 5 | **Désactivation double-écriture stock (7.D)** | Double-écriture `products.stock_count` ↔ `product_variants.stock_count` MAINTENUE (réversible) ; désactivation = GO séparé post-beta |

---

## ⬜ Autres dettes go-live (non bloquantes — après les 4 ci-dessus)

> Rotation des clés, backups, mig 091 et redirect `/auth/callback` sont **remontés en bloquants** (section « Prochaine action »). Le reste, non bloquant :

Voir `FEUILLE_DE_ROUTE.md` → « 🔧 DETTES TECHNIQUES & GO-LIVE PUBLIC » et `ETAT_SYSTEME.md` pour le détail. Principales :
- **Rate-limiting** sur `placeOrder` (flux public COD ; routes auth/reset déjà couvertes par GoTrue).
- **Signatures webhooks** + logs d'audit ; idempotence/reporting du CSV `publishBulkImport`.
- **Garde-fou anti-récidive en place** : `next.config.ts` refuse le build si un `NEXT_PUBLIC_*` commence par `sb_secret_`.

---

## ⏸️ Branches non mergées / chantiers en attente

| Branche / chantier | État |
|--------------------|------|
| `feat/supplier-stock-multimodes` (V5-bis) | Prêt pour merge, **mig 104 déjà appliquée prod** ; en attente GO Abdou |
| `feat/categories-dynamiques` | Chantier scalabilité catégories en base + panneau admin — sous-lots 1-4 faits, STOP avant merge |
| C4 pack grossiste / C5 bascule finale stock variante | Reportés, cadrage @finance |

---

## Règles agent (rappel court)

1. **Lire `ETAT_SYSTEME.md` avant tout chantier** — ne pas reconstruire l'existant.
2. **Lots petits** → `npm run check` / `safe-check` → commit sur branche dédiée. Jamais sur `main`.
3. **Argent** (ledger/commission/COD/devises/livraison) → @finance + @security + validation Abdou avant merge.
4. **Tests écriture** → Supabase LOCAL `127.0.0.1:54321` uniquement (`assertLocalSupabase()`). Jamais la prod.
5. **i18n** FR/AR/EN obligatoire sur tout texte visible + RTL.
6. **Jamais** passer de fonction à un Client Component (règle CLAUDE.md #2).
7. **Comptes test** → soft-ban uniquement, jamais hard DELETE.
8. **Backup AVANT chaque `supabase db push`** + ne jamais push/merge sans GO explicite d'Abdou.

---

## Commandes utiles

```bash
npm run check          # tsc + lint
npm run safe-check     # check + build + tests + smoke (arrêter dev server avant)
supabase db push       # appliquer migrations
supabase migration list
npm run types          # regénérer supabase-generated.ts après migration
```

---

*Fin handoff — périmètre beta complet en prod, ingestion Telegram prête (0 fournisseur lié). Ouvrir un chat frais ; LA prochaine action = rotation des secrets compromis, PUIS backups auto prod, puis vérif mig 091 + redirect `/auth/callback`.*
