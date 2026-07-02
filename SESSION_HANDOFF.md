# SESSION_HANDOFF.md — Reprise sans contexte

> **Dernière mise à jour :** 2026-07-02
> **Branche prod :** `origin/main` @ `7eba3d6` — **à jour, 0 commit d'avance**. Tout est poussé & déployé Vercel.
> **Migrations prod :** 001→**110** appliquées. ⚠️ **Migration 111 (fix données) NON appliquée** (à lancer par Abdou dans Supabase SQL Editor — PAS `supabase db push`, cf. REPRENDRE ICI). 091 toujours en attente.
> **URL prod :** https://affiliate-platform-gamma.vercel.app
> **Projet Supabase :** `owvtfzxvirttrbcsiveg`

Lire aussi : `ETAT_SYSTEME.md` (registre de vérité — POINT DE REPRISE en tête), `FEUILLE_DE_ROUTE.md`, `CLAUDE.md`.

---

## ✅ FAIT EN PROD — 2026-07-02 (tout mergé `main` + poussé + déployé Vercel)
- **Lot 4** — éditeur paliers + MOQ en modération admin (@finance 🟢 @security 🟢).
- **Lot 5** — message d'accueil bot 4 langues (`ar-MA`→darija, `ar*`→MSA, `fr*`→FR, reste→EN), nom **« Abdou Baba »**, devises MAD/AED/USD.
- **Rebrand Mozouna → Abdou Baba** (texte visible : UI, bot, emails, titres/SEO). **« Mozouna Group » conservé** en footer/légal/entité (façon Alibaba Group). `MozounaLogo`=nom React, `@MozounaSupplierBot`, contrainte DB = intacts (non touchés).
- **Uniformisation paliers (code/UI)** : produit local sans palier → bloc « Prix de gros » par défaut ; international → paliers **indicatifs** (« estimation — hors transport/douane, prix ferme au devis »). @finance 🟢 @security 🟢. **Chantier paliers Telegram CLOS (Lots 1→5).**
- **Backup prod réparé côté script** (`backup-prod.sh` → pooler session-mode, mdp de `.db_password`, dump 06-26 sécurisé en triple) · `supabase/.temp/` désindexé.

## ▶️ REPRENDRE ICI — RESTE (à froid, pas urgent)

0. **🐛 BUG `max_qty` (facturation gros) — trouvé par la recette bout-en-bout 2026-07-02.** Le **formulaire catalogue admin** (`ProductForm` + `products.ts:476-508`) peut sauver des paliers **sans `max_qty`** : `max_qty` est optionnel et **non calculé serveur**. Or `getWholesaleTier` (`src/lib/utils.ts:104-120`, `.find` 1er match) renvoie alors **le 1er palier (le plus cher)** quelle que soit la quantité → **prix facturé ≠ prix affiché (surfacturation grossiste)**. **Périmètre : UNIQUEMENT** produits catalogue à **≥2 paliers saisis à la main sans borne**. **Canal fournisseur/Telegram/Lot 4 = SÛR** (`buildMirrorTiers` `supplier-pricing.ts:144-146` borne toujours). **Pas urgent** : pas d'ouverture grossiste, personne facturé. **Avant correction** : lancer le SQL de vérif prod (compter/lister les produits à risque — CTE `MATERIALIZED`, robuste au double-encodage). **Correction prévue** : borner `max_qty` serveur dans `products.ts` (comme `buildMirrorTiers`) via **@finance + @security**.
1. **🧊 Migration 111 — fix DONNÉES (2 produits `wholesale_tiers` double-encodés)** : **rien n'est cassé** (le code d'affichage gère ces lignes). À lancer par **Abdou** dans **Supabase → SQL Editor** (coller le SQL de `supabase/migrations/111_fix_wholesale_tiers_double_encoding.sql`). **⛔ PAS `supabase db push`** (embarquerait la migration 091). Non urgent.
2. **⚙️ `TELEGRAM_BOT_USERNAME`** — à **re-vérifier** dans les env vars Vercel.
3. **🖼️ Filigrane hero landing « موزونا »** — **asset image** (pas du texte de code) affichant encore l'ancien nom → à **régénérer** (phase design/asset séparée).
4. **🚧 4 bloquants go-live** : (a) **rotation secrets** `SUPABASE_SERVICE_ROLE_KEY` + mdp admin `AdminTest2026!` · (b) **backups auto prod** (preuve dump pooler 07-02 + restauration LOCAL ; plan Pro/PITR recommandé + `.db_password` mode 600) · (c) **migration 091** en prod · (d) **redirect `/auth/callback`** dans l'allowlist dashboard Supabase.

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
| **Magic-link fournisseur** | Onboarding ultra-simple : lien magique `t.me/<bot>?start=CODE` + QR (fournisseur) ; admin génère lien + QR + partage WhatsApp (`/admin/users/[id]`) ; TTL admin 15 min ; notif in-app à la liaison + cloche fournisseur (`e50b1f0`) | — (code) | ✅ EN PROD (Vercel) — ⚙️ `TELEGRAM_BOT_USERNAME` posé, **à re-vérifier** |
| **Paliers Telegram (Lots 1-2-3)** | Extraction IA des paliers de gros dégressifs depuis Telegram, COMPLÈTE : sanitizer (`6977e6d`) + helper `insertMoqTiers` (`f075e4f`) + extraction IA branchée `ingest.ts` (vrai MOQ, `cfa6eed`). @finance 🟢 · @tester 3/3 LOCAL | — (code) | ✅ EN PROD (Vercel) — canal Telegram (0 fournisseur lié) |
| **Paliers Telegram (Lot 4)** | Éditeur paliers + MOQ en **modération admin** (module pur `moq-editor.ts` + `approveSupplierProduct` + UI) : l'admin corrige une extraction douteuse. Devise fournisseur + MAD lecture seule ; palier optionnel ; `sanitizeMoqTiers` seul juge ; write idempotent delete-then-insert scopé ; flag @finance base<1er palier. @finance 🟢 · @security 🟢 · @tester **405/405 LOCAL** | — (code) | ✅ **EN PROD** — poussé `origin/main` @ `5c4d03c` (auto-deploy Vercel, succès à confirmer dashboard) |
| **Paliers Telegram (Lot 5)** | **Message d'accueil bot 4 langues** (`welcome.ts` pur + `ingest.ts` sur `/start`/`/link` sans code) : guide l'envoi produit + **recommande le format des paliers**. `ar-MA`→darija, `ar*`→MSA, `fr*`→FR, reste→EN. Nom **« Abdou Baba »**, devises **MAD/AED/USD**, WhatsApp via env, chiffres latins ; linking + ingestion inchangés. @tester 453/453 LOCAL | — (code) | 🔄 **MERGÉ `main` LOCAL** (`7bb5c57`) — **NON POUSSÉ** (pas live côté bot en prod) |

**Qualité :** @finance 🟢 · @security 🟢 sur tous les lots financiers/sensibles ; 4 checks verts (tsc 0 / build / vitest / smoke) à chaque lot. Détail complet par lot dans `ETAT_SYSTEME.md`.

---

## 🏗️ CHANTIER PALIERS TELEGRAM — ✅ COMPLET & CLOS (Lots 1→5, session 2026-07-02)

> **But** : que les **paliers de prix dégressifs + le minimum de commande** viennent du **fournisseur automatiquement** (Telegram), pour scaler à des milliers de produits sans saisie admin manuelle.
> **⚖️ RÈGLE MÉTIER GRAVÉE (Abdou)** : 1er palier = **minimum de commande** ; prix **strictement décroissant** quand la quantité monte (`10→20, 50→18, 100→16, 500→14`). Format `{ min_quantity, unit_price }`.
> **✅ Pipeline COMPLET de bout en bout** : extraction Telegram → sanitizer → insert → modération (**+ correction éditeur admin, Lot 4**) → auto-report catalogue (`buildMirrorTiers`) → panier dégressif + MOQ imposé. Tout passe par le **mur de modération** — aucune piste ne publie un prix seule.

- ✅ **Lot 1 — sanitizer `sanitizeMoqTiers`** (schema.ts) : strict (rejette croissant/égal/doublon/aberrant/>20), **33 tests**, **@finance 🟢**. Mergé `main` `6977e6d`.
- ✅ **Lot 2 — helper `insertMoqTiers` factorisé** (web + CSV, refactor pur prouvé identique, @tester 4/4). Mergé `main` `f075e4f`.
- ✅ **Lot 3 — extraction IA** (`extract.ts`/`schema.ts` + branchement `ingest.ts` : vrai MOQ = 1er palier, désambiguïsation stock/palier). **⚠️ ARGENT — @finance 🟢**, @tester 3/3 LOCAL, purement additif. Mergé `main` `cfa6eed`.
- ✅ **Lot 4 — éditeur paliers + MOQ en modération admin** : module pur `src/lib/supplier/moq-editor.ts` (parse/juge, testable) + `approveSupplierProduct` (write **idempotent delete-then-insert scopé**, mirror sur nouveaux paliers) + UI `supplier-product-review.tsx` (N paliers dynamiques ≤20, pré-rempli, MOQ éditable, **MAD lecture seule**, i18n FR/AR/EN+RTL). Palier **optionnel** ; `sanitizeMoqTiers` = **seul juge** (basePrice=null + flag @finance séparé, non bloquant) ; prix source **verbatim**. **⚠️ ARGENT — @finance 🟢 · @security 🟢**, @tester **405/405 LOCAL** (round-trip 6 paliers + delete scopé non-fuyant prouvés), 4 checks verts. **✅ EN PROD — poussé `origin/main` @ `5c4d03c` le 2026-07-02** (pre-push vert ; deploy Vercel à confirmer dashboard). **🪵 Dette connue** : séquence UPDATE+delete/insert+miroir **non transactionnelle** (échec INSERT après DELETE → « MOQ à jour + 0 palier », repli sûr/idempotent, zéro impact ledger) → **RPC atomique si les paliers deviennent un prix facturé critique**.
- ✅ **Lot 5 — message d'accueil bot 4 langues** (`welcome.ts` + `ingest.ts` + `language_code` schéma) : `/start`/premier contact → guide envoi produit + recommande le format des paliers. `ar-MA`→darija (avant `ar`), `ar*`→MSA, `fr*`→FR, reste→EN. Nom **« Abdou Baba »**, devises MAD/AED/USD, WhatsApp via env, chiffres latins. Linking + ingestion inchangés. @tester 453/453 LOCAL, 4 checks verts. Mergé `main` LOCAL `--no-ff` (`7bb5c57`), **NON POUSSÉ**.

**➡️ Chantier paliers CLOS (Lots 1→5).** Prochain chantier dev = **rebrand Mozouna → Abdou Baba** (Phase 0 cartographie ; cf. REPRENDRE ICI #2 + `FEUILLE_DE_ROUTE.md`). *(Distinct des bloquants go-live ci-dessous, qui sont des actions ops.)*

**ℹ️ Vérifié cette session (hors code)** : l'affichage acheteur d'un produit fournisseur **international** est **conforme, pas de bug** — prix affiché en **MAD** (label « Prix final TTC », jamais la devise source), mention explicite **hors transport** + « transport et douane calculés dans le devis » (FR/AR/EN, `importPriceNote`), **aucun tableau de paliers dégressifs** (produit international = **devis/RFQ**, pas de commande directe). Flags d'affichage : `supplier_type` (badge/label/mention) + `availability_type` (stock + CTA direct vs devis).

---

## 🎯 PROCHAINE ACTION — 4 bloquants go-live, dans l'ordre

> **Action conseillée : (1) rotation des secrets, PUIS (2) backups auto prod.** Le reste (3 + 4) sont des actions ops courtes.

**1. 🔴 ROTATION DES SECRETS COMPROMIS (le plus urgent).** Une clé / un mot de passe compromis = contournement total du RLS, donc à faire AVANT tout le reste.
   - **`SUPABASE_SERVICE_ROLE_KEY`** — fuitée (incidents 2026-06-20/22 tests + 2026-06-27 via `NEXT_PUBLIC_APP_URL` inliné dans le bundle client) → **régénérer** (Supabase Dashboard → API Keys), reposer **uniquement** dans `SUPABASE_SERVICE_ROLE_KEY` (Vercel + `.env.local`), jamais en `NEXT_PUBLIC_*`, puis redeploy.
   - **Mot de passe admin** `AdminTest2026!` — **committé** → changer + nettoyer les comptes/secrets de test.

**2. 🟠 BACKUPS AUTO PROD — 🔧 RÉPARÉ CÔTÉ SCRIPT le 2026-07-02, preuve à produire.** Cause de l'échec (`SSL SYSCALL EOF` depuis le 2026-06-29) : `backup-prod.sh` dumpait via l'endpoint **DIRECT** (`supabase db dump --linked`, `db.<ref>.supabase.co`) rendu inatteignable par Supabase. **Corrigé** : bascule sur le **pooler session-mode** (`--db-url postgresql://postgres.owvtfzxvirttrbcsiveg:<pw>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`), mdp lu de `~/AI-FACTORY/backups/.db_password` (mode 600) → run auto lundi **sans trousseau**. Mdp masqué des logs. Dernier bon dump **06-26 sécurisé en triple** (`_safe/` + iCloud). **RESTE À FAIRE** : (a) créer `.db_password`, (b) lancer le dump pooler 07-02, (c) **test de restauration en LOCAL** (jamais fait — la vraie preuve). Le LaunchAgent reste dépendant du PC allumé + Docker → **PITR (plan Pro) recommandé à terme** pour un backup serveur indépendant.

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
