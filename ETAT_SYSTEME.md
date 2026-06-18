# ETAT_SYSTEME.md — REGISTRE DE VÉRITÉ UNIQUE

> **⚠️ RÈGLE DE TRAVAIL — À LIRE AVANT TOUT CHANTIER.**
> **Avant de construire quoi que ce soit, lire ce fichier.** Une feature validée s'inscrit
> ici et **ne se reconstruit jamais**. **Mettre à jour ce fichier à chaque feature finie.**
> Ce registre fait foi : il est rempli à partir du **code et de git** (pas de mémoire).
>
> **🩺 RÈGLE DIAGNOSTIC — déploiement d'abord.** Si l'agent voit le **bon comportement dans le code** (vérifié runtime sur build local) mais que l'utilisateur voit **autre chose en prod**, **VÉRIFIER LE DÉPLOIEMENT VERCEL EN PREMIER** (souvent en retard sur `main` / cache). Ne PAS conclure « ergonomie » ou « non reproduit » avant ça. Trancher en **forçant un redeploy** : `git commit --allow-empty -m "chore: force redeploy" && git push` sur `main`. Cas réel : recherche grossiste « Pull ref 5 » = 0 en prod alors que le code était correct → déploiement périmé (résolu par `6dc0244`).

**Dernière synchro :** 2026-06-17 — `main` @ `5c54544` — 74 migrations (001→074).

## Légende des statuts
- ✅ **FAIT ET EN PROD** — mergé dans `main` (+ migration appliquée si concerné)
- 📄 **DOCUMENTÉ / SPÉCIFIÉ** — décrit dans la roadmap, **pas de code**
- ⏸️ **BRANCHE NON MERGÉE** — code existant mais pas dans `main`
- ❌ **PAS FAIT** — n'existe nulle part (ni code, ni branche, ni stash)

---

## 🔔 NOTIFICATIONS — cas « Deliveroo » fournisseur (TRANCHÉ)

| Feature | Statut | Commit / Branche | Preuve (fichier clé) |
|---|---|---|---|
| **Notif fournisseur LOT 6 — commande assignée → fournisseur + admin(s) (+ agent optionnel) avertis** (in-app + Telegram best-effort, zéro PII acheteur, RLS étanche own-only) | ✅ **EN PROD** | migrations **076+077** | table `notifications` + helper `src/lib/notifications/order-assigned.ts` (appelé dans `assignSupplierToOrder`) ; @security GO ; test runtime : 5 lignes créées, payload sans PII, RLS étanche, idempotent |
| Notif RFQ fournisseurs (matching sourcing) | ⚠️ Partiel (flag DB, **PULL**) | `2825927`, `29f859d` | `src/app/actions/rfq-engine.ts:250` `notifyMatchedSuppliers` = met `rfq_matches.status='notified'` + `revalidatePath`, **n'envoie sur aucun canal** |
| Envoi Telegram sortant lié à une commande | ✅ **EN PROD (LOT 6, best-effort)** | migrations 076+077 | `notifyOrderAssigned` push `telegramSendMessage` au fournisseur lié + `ADMIN_TELEGRAM_CHAT_ID` ; échec silencieux, n'altère jamais l'assignation |
| In-app infra (table `notifications`) | ✅ **EN PROD** | migrations **076+077** | table append-only, RLS read/maj own-only, insert service-role only, idempotence `(order_id,event,recipient_id)` |
| Email / SMS / push web infra | ❌ PAS FAIT | aucun | aucune lib (`resend/nodemailer/twilio/web-push/fcm`) |

> **📌 DESTINATAIRES (TÂCHE 2, à cadrer)** : essentiels **toujours notifiés** = **Abdou + le fournisseur** ; **commercial/agent pays = optionnel cochable**. Design fin des destinataires (par événement/rôle/canal) **à finaliser par Abdou**. PII acheteur masquée côté fournisseur (vues redacted). Détail : `FEUILLE_DE_ROUTE.md` → LOT 6.

> **⚠️ PIÈGE DE NOMMAGE :** « **Deliveroo** » dans le code **n'est PAS** un système de notification.
> C'est la **machine à états (FSM) des commandes B2B** (suivi de statuts, façon tracking Deliveroo) —
> voir section Wholesale/B2B. La recherche `deliveroo|notifySupplier|sendOrderNotification|lot6`
> sur **tout l'historique + toutes les branches + stash** ne révèle **aucune** implémentation de notif.

---

## 💸 FINANCE (cœur — le plus critique)

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Ledger append-only + commissions + COD Maroc | ✅ EN PROD | migrations 009+ | `src/app/actions/orders.ts`, mig. `009_cod_order_engine.sql` |
| Multi-devise (pivot MAD) — pays/devise, devis, ledger | ✅ EN PROD | `feat/etape1/2/3-*` (mergées) | mig. ledger currency, `008_delivery_fee_and_costs.sql` |
| Règle capital affilié (prix catalogue = usine+marge+emballage+conf+provision livr. 35) | ✅ EN PROD | `628d8c7` / mig. **073** | `073_affiliate_catalog_capital_rule.sql` |
| Confirmation conditionnelle (`is_pre_confirmed`) + packaging min 10 | ✅ EN PROD | `4e2127b` / mig. **074** | `074_orders_pre_confirmed_and_packaging_fix.sql` |
| Fix M-1 — `convertQuoteToOrder` facture le devis figé (fail-closed, jamais 0 MAD) | ✅ EN PROD | `6a33573` / `fix/m1-quote-conversion-price` | `src/app/actions/orders.ts` (convertQuoteToOrder) |
| Payout atomique + RLS prix/clics | ✅ EN PROD | `fix/phase2-ledger-atomic-payout` | mig. ledger / RPC |
| Audit financier E2E (5 types de commande, bouclages X=Y+Z+W) | ✅ DOC | `2fab7b5` | `AUDIT_FINANCIER_E2E.md` |
| **Dette `factory_cost` authenticated** | ⏸️ **NON MERGÉE (différée option C)** | `feat/dette-factory-cost-authenticated` | `a081622` (roadmap : chantier dédié différé) |

---

## 🛒 PRODUITS

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| CRUD produits admin (liste / création / édition) | ✅ EN PROD | — | `src/app/(admin)/admin/products/{page,new,[id]/edit}.tsx` |
| Upload image produit (compression canvas → WebP/JPEG, bucket `product-images`) | ✅ EN PROD | mig. **002** | `src/lib/product-image-upload.ts`, `src/lib/image-compress.ts` |
| **Support HEIC/HEIF (photo iPhone) à l'upload** | ✅ **FAIT ET EN PROD** | `5c54544` | `image-compress.ts` `isHeic()` + `decodeHeicToJpeg()` (heic2any, import dynamique) → conversion JPEG avant canvas ; `accept` élargi sur les 2 inputs |
| Catalogue affilié 2 niveaux (P1 fiche produit) | ✅ EN PROD | `f920834` / `feat/affiliate-catalog-detail-p1` | `src/app/(affiliate)/affiliate/products/...` |
| Vue publique products whitelistée (ferme fuite coût/marge ANON — dette 012) | ✅ EN PROD | `f748732` / mig. **072** | `072_products_public_read_view.sql` |
| **Bug « catégorie/sous-catégorie non persistée à la création/édition produit »** (le formulaire admin les saisissait mais `upsertProduct` les jetait → produits internes non filtrables) | ✅ **CORRIGÉ** | `2ce7406` | `src/app/actions/products.ts` — lecture `category`/`subcategory` du formData + ajout au payload `base` (insert+update) |

## 🏭 FOURNISSEURS

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Espace fournisseur (dashboard, products, orders, catalogs, samples, opportunities, analytics, premium) | ✅ EN PROD | — | `src/app/(supplier)/supplier/*` |
| Miroir catalogue + coût fournisseur + marge plateforme | ✅ EN PROD | mig. **068/069** | `src/lib/supplier-mirror.ts`, `069_products_supplier_mirror_link.sql` |
| Modération supplier-products (admin) | ✅ EN PROD | — | `src/app/(admin)/admin/supplier-products/*` |
| Onboarding « Pays non configuré » (flag + action admin) | ✅ EN PROD | `41ee0b9` (LOT UX-3a) / mig. 066 | `src/app/actions/users.ts` |
| Telegram — liaison compte + ingestion produits (ENTRANT) | ✅ EN PROD | mig. **053** | `src/lib/telegram/ingest.ts`, `webhook/route.ts` |
| **Bot Telegram ingestion produit EN PROD** (webhook prod, extraction IA caption, image upload Storage, produit créé en attente validation admin) | ✅ **EN PROD** | webhook re-pointé 2026-06-18 | Webhook Telegram pointe désormais sur **`https://affiliate-platform-gamma.vercel.app/api/telegram/webhook`** (plus ngrok dev). Test runtime bout-en-bout 2026-06-18 : message `608081527:13` → `telegram_inbound` status `inserted` → `supplier_products` `b6340464…` créé (« Pack 3 boxers en bambou MAWRI », Textile/Sous-vêtements, 40 MAD, stock 200, image uploadée HTTP 200, `approval_status='pending_review'`, `source='telegram'`). Secret webhook (Vercel) = `.env.local` vérifié (200/401). Barrière `checkProductLimit` active (3 canaux). 4 vars prod requises : `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`/`ANTHROPIC_API_KEY`/`TELEGRAM_BOT_USERNAME` |
| RFQ — moteur de matching automatique | ✅ EN PROD | `2825927` / mig. **037** | `src/app/actions/rfq-engine.ts` |

---

## 🤝 WHOLESALE / B2B (« Deliveroo » = FSM commande, PAS notif)

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| FSM cycle de vie commande B2B (états type Deliveroo) | ✅ EN PROD | `6fa1d23` (LOT 1) / mig. **057** | `src/lib/wholesale-fsm.ts:15` *« Cycle Deliveroo-style »* |
| Assignation commandes B2B + équipes + FSM stricte | ✅ EN PROD | `75021b5` (LOT 2) | `src/components/admin/wholesale-order-status-form.tsx` |
| Lien fournisseur + vue redacted (sans PII acheteur) | ✅ EN PROD | `896a4ad` (LOT 3a) | `wholesale_orders_supplier_read` (vue) |
| Transition de statut atomique | ✅ EN PROD | mig. **061** | `061_atomic_wholesale_status_transition.sql` |
| Paiement → collecte cash + détection E3-bis (sous-collatéral) | ✅ EN PROD | `3ff966a` (LOT 4.2-C) / mig. **065/067** | `065_wholesale_delivery_cash_rpcs.sql` |
| Affichage prix import honnête (aérien/maritime, marge selon devis) | ✅ EN PROD | `028d790` / mig. **071** | `071_supplier_quote_shipping_mode.sql` |
| **Catalogue grossiste UNIFIÉ** (2 onglets Disponible/À importer, interne+fournisseur fusionnés & cloisonnés, design noir & or) | ✅ **EN PROD** | `d379ca1` / mig. **075** | vue `wholesale_catalog_read` (`075_wholesale_catalog_read_view.sql`) ∪ `products_public_read`+`supplier_products_wholesaler_read` ; page `src/app/(wholesale)/wholesale/products/page.tsx` (`source` serveur only, @security GO, aucun coût/marge exposé) |
| **Marketplace grossiste GLOBAL** (`/wholesale/marketplace` inclut désormais les produits internes Mozouna + fournisseurs, source invisible) | ✅ **EN PROD** | `8ab5189` | additif : 2ᵉ source `wholesale_catalog_read` (source='internal') mappée en MarketplaceProduct (supplier_type='morocco', badges off) ; routage détail par discriminant `__source` SERVEUR-ONLY (interne → `/wholesale/products/[id]`). Runtime : internes présents, zéro fuite `__source`/supplier_id. Rappel : « disponible grossistes » = pas un flag (toujours activé) |
| **Filtre pays marketplace (Chine/Turquie/Égypte/Dubai) corrigé** — plantait en 500 (`origin_country` null des internes → `null.toLowerCase()`) | ✅ **EN PROD** | `c908809` | mapping interne coercé (`category`/`origin_country` ?? '') + guards `(p.x ?? '').toLowerCase()` sur filtres recherche/sous-cat/origine ; runtime 4 pays : 500→200 |
| **Thème grossiste `/wholesale/products`** (rendait en thème clair → corrigé en noir & or) | ✅ **CORRIGÉ** | `2ce7406` | wrapper `theme-dark bg-bg text-foreground min-h-screen` (`wholesale/products/page.tsx:125`, comme affilié/marketplace) |
| **Thème détail produit interne `/wholesale/products/[id]`** (rendait en thème clair → corrigé en noir & or) | ✅ **CORRIGÉ EN PROD** | `6dc0244` | wrapper `theme-dark bg-bg text-foreground min-h-screen` (`wholesale/products/[id]/page.tsx:72`, comme le détail fournisseur) |
| **Recherche grossiste `/wholesale/products` (« Pull ref 5 » = 0 résultat)** | ✅ **OK — pas un bug code** | — | prouvé runtime : Pull ref 5 = 1ʳᵉ carte de l'onglet Disponible + trouvé par le champ recherche. Le 0 venait d'un **déploiement Vercel périmé** (résolu par redeploy `6dc0244`), pas du code |
| **Message inter-onglets recherche grossiste** — quand l'onglet actif est vide mais l'autre a des résultats filtrés, lien « Aucun résultat ici — mais N produit(s) “terme” dans l'autre onglet → » (conserve recherche/filtres) | ✅ **EN PROD** | `b5251d1` | `wholesale/products/page.tsx` (réutilise localRows/importRows/tabHref) + i18n FR/AR/EN ; UI pur, aucune logique de filtre changée |

---

## 🧑‍💼 AFFILIÉS

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Catalogue affilié, liens, commissions | ✅ EN PROD | — | `src/app/(affiliate)/affiliate/*` |
| Message « Ajuste ton prix » (remplace « Non rentable ») | ✅ EN PROD | `ed520ab` | affichage affilié (FR/AR/EN) |
| **HOOK PROFIT AFFILIÉ** — simulateur gain temps réel (« Tu gagnes X/vente » = prix saisi − catalogue), prix conseillé catalogue × 1,25 (fourchette +20/+30 %) cliquable, accroche catalogue « fixe tes prix, garde la différence », phrase marge-zéro remplacée par encouragement | ✅ **EN PROD** | `ba4b2af` | `src/components/affiliate/affiliate-price-form.tsx` + `affiliate/products/{[id],}/page.tsx` ; AFFICHAGE PUR (calcul serveur commission inchangé, aucune donnée coût/marge au client) |
| **Wording affilié tout-inclus (vendeur/punchy)** — bloc « frais déduits » négatif remplacé par « 💰 Tu vends, tu encaisses. Le reste, c'est notre job. » (livraison/emballage/confirmation gérés, zéro avance) + mentions « prix tout compris » sous le prix (fiche + cartes) | ✅ **EN PROD** | `842acce` | `affiliate/products/{[id],}/page.tsx` + i18n FR/AR/EN ; AFFICHAGE PUR (frais déjà dans le capital, calcul serveur inchangé) |

---

## 🔐 AUTH & SÉCURITÉ

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Auth + rôles (admin/agent/affiliate/wholesaler/supplier) + RLS deny-default | ✅ EN PROD | mig. **001** | `src/app/(admin)/layout.tsx:23-31` (guard rôle/statut) |
| Gestion users admin (`updateUserById` via service_role) | ✅ EN PROD | — | `src/app/(admin)/admin/users/[id]/page.tsx` |
| **Page self-service « mot de passe oublié » / reset** | ❌ PAS FAIT | aucun | aucune route reset ; récupération admin = script `scripts/reset-admin-password.mjs` (hors app) |

---

## 🎨 DESIGN & i18n

| Feature | Statut | Commit / Branche | Preuve |
|---|---|---|---|
| Habillage premium (thème noir & or) | ✅ EN PROD | `3ee9530` / `feat/habillage-premium` | composants UI, `b9d7973` theme-dark |
| i18n FR / AR (فصحى) / EN + RTL | ✅ EN PROD | `3ee9530` | `messages/{fr,ar,en}.json`, `next-intl` |

---

## 🗄️ STORAGE (buckets)

| Bucket | Statut | Preuve |
|---|---|---|
| `product-images` (public) + policies admin/SELECT public | ✅ EN PROD | mig. **002** |
| `supplier-product-images` (public) | ✅ EN PROD | mig. **053** |
| `order-proofs` (public) + INSERT policy | ✅ EN PROD | mig. **070** |
| `supplier-catalogs`, `supplier-attachments`, `sample-files` (private) | ✅ EN PROD | mig. **036** |

---

## 🚀 FEATURES FUTURES / MONÉTISATION (à concevoir — NE PAS coder maintenant)

| Feature | Statut | Détail |
|---|---|---|
| **Contrôle de visibilité produit par canal** (idée stratégique Abdou) | 📄 DOCUMENTÉ — feature future | Boutons activer/désactiver l'affichage d'un produit **par canal** (catalogue affilié, catalogue grossiste, marketplace, vitrine publique). Aujourd'hui binaire (`affiliate_enabled` + grossiste toujours visible si actif). **Leviers** : (1) contrôle fin Abdou ; (2) **exclusivité** sellers/grossistes (protection concurrence interne) ; (3) **monétisation** — « visible partout » = feature **PREMIUM** payante par abonnement ; (4) distinguer les niveaux d'abonnement. **Nature** : conception d'une matrice **produit × canal × niveau d'abonnement**, à cadrer avec `@architect`. Pertinent à l'**ouverture publique + abonnements (Sprint 4+)**. Détail complet : `FEUILLE_DE_ROUTE.md` → SECTION VIS-CANAL. **À NE PAS construire maintenant** (Sprint 2 = vrais produits). |

---

## 🛟 SÉCURITÉ / BACKUP

- **CODE** : tout est sur **GitHub** (`origin`). `main` = prod. Branches de travail poussées (y compris `feat/dette-factory-cost-authenticated`, sauvegardée à distance).
- **BASE Supabase** (plan gratuit = **aucun backup auto** → critique) : dump complet schéma + données via le **CLI Supabase**, dans `~/AI-FACTORY/backups/` (fichiers datés `prod_backup_<date>.sql` + `_data.sql`).
- **Refaire un backup manuellement** : `bash ~/AI-FACTORY/backups/backup-prod.sh`
- **Backup hebdo automatique** : LaunchAgent macOS `com.mozouna.backup-prod` (lundi 9h) → `~/Library/LaunchAgents/com.mozouna.backup-prod.plist`, logs dans `~/AI-FACTORY/backups/backup.log`. (cron classique bloqué par macOS « Operation not permitted » → launchd à la place.)
  - Vérifier : `launchctl list | grep mozouna` · Désactiver : `launchctl unload ~/Library/LaunchAgents/com.mozouna.backup-prod.plist`
- **ROUTINE** : backup **AVANT chaque migration** (`supabase db push`) + **1×/semaine** (auto) + avant tout backfill de données. Copier `~/AI-FACTORY/backups/` **hors du PC** régulièrement.

---

## ⏸️ BRANCHES NON MERGÉES (état git au 2026-06-17)
- `feat/dette-factory-cost-authenticated` — chantier **différé (option C)**, pas dans `main` mais **poussé sur `origin`** (sauvegardé).

> Toutes les autres `feat/*` et `fix/*` listées par `git branch --merged main` sont **mergées et en prod**.
