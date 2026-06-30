# SESSION_HANDOFF.md — Reprise sans contexte

> **Dernière mise à jour :** 2026-06-30
> **Branche prod :** `main` @ `39ae0d4`
> **Migrations prod :** 001→**110** appliquées (104→110 confirmées en **Remote** le 2026-06-30)
> **URL prod :** https://affiliate-platform-gamma.vercel.app
> **Projet Supabase :** `owvtfzxvirttrbcsiveg`

Lire aussi : `ETAT_SYSTEME.md` (registre de vérité — POINT DE REPRISE en tête), `FEUILLE_DE_ROUTE.md`, `CLAUDE.md`.

---

## 🎉 ÉTAT : BETA-READY — périmètre bloquant COMPLET en prod

**Tous les lots bloquants beta sont mergés `main` ET appliqués en prod Supabase Remote.**
La plateforme est **fonctionnellement prête pour la beta**. Il ne reste **qu'une seule condition technique** avant l'ouverture publique : les **backups auto prod** (voir « Prochaine action » ci-dessous).

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

## 🎯 PROCHAINE ACTION — backups auto prod (SEULE condition go-live public)

**La base prod `owvtfzxvirttrbcsiveg` n'a AUCUN backup automatique actif.** Le LaunchAgent local `com.mozouna.backup-prod` existe mais **dépend du PC allumé + Docker** → non fiable comme unique filet pour une ouverture publique.

**Activer l'un des deux avant le go-live :**
- **(a) Supabase PITR** (Point-In-Time Recovery) — dashboard Supabase, plan **Pro** (payant). Voie la plus sûre : backups continus côté serveur, restauration à la minute. **Recommandé.**
- **(b) Cron `pg_dump` hébergé** — sur un serveur/CI indépendant du PC, dump quotidien vers stockage hors-PC.

→ **C'est la seule chose qui reste avant d'ouvrir au public.** Voir `ETAT_SYSTEME.md` → section 🛟 SÉCURITÉ / BACKUP (en tête de section, marqué BLOQUANT GO-LIVE).

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

## ⬜ Autres dettes go-live (déjà tracées avant cette session)

Voir `FEUILLE_DE_ROUTE.md` → « 🔧 DETTES TECHNIQUES & GO-LIVE PUBLIC » et `ETAT_SYSTEME.md` pour le détail. Principales :
- **Rotation des clés** `SUPABASE_SERVICE_ROLE_KEY` + `sb_secret_…` (incidents 2026-06-20/22/27) — action ops dashboard Supabase/Vercel. Cf. incident `NEXT_PUBLIC_APP_URL` (mig garde-fou `next.config.ts` en place).
- **Ménage secrets de test** + reset MDP `admin@affipartner.ma`.
- **Allowlist Redirect URLs** Supabase (`${NEXT_PUBLIC_APP_URL}/auth/callback`) pour le reset MDP self-service.

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

*Fin handoff — périmètre beta complet en prod. Ouvrir un chat frais ; LA prochaine action = backups auto prod (PITR ou cron pg_dump) avant go-live public.*
