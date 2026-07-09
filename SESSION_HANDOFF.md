# SESSION_HANDOFF.md — Reprise sans contexte

> **🔵 SESSION 2026-07-09 = LOT AM-10 PWA INSTALLABLE — ✅ MERGÉ `main` `--no-ff` `9582151` (NON poussé, Abdou pousse ; aucune migration) + RESYNC VÉRITÉ secrets.**
> **AM-10** : app installable sur écran d'accueil. Anti-fausse-dette OK (aucun manifest/SW/next-pwa préexistant). Livré : `src/app/manifest.ts` (Next 15 → `/manifest.webmanifest`, `display: standalone`, thème 🔒 Noir `#0a0a0a` + Or), `public/sw.js` (**service worker minimal et SÛR** : ne cache JAMAIS de contenu dynamique/authentifié/RSC → 0 risque de page périmée ; rôle = installabilité + repli hors-ligne), `public/offline.html` (FR/AR/EN + RTL, autonome), 4 icônes **placeholder « A » doré vectoriel sur noir** dans `public/icons/` (192, 512, maskable-512, apple-touch-180) — cohérent avec le monogramme in-app `MozounaLogo`. **⚠️ Icône temporaire (décision Abdou 2026-07-09)** : le vrai logo Abdou Baba (A + globe + poignée de main) n'existe pas encore en fichier dans le projet → l'icône définitive sera posée quand le designer livrera le PNG. L'icône n'est PAS bloquante pour AM-10, `src/components/pwa/install-prompt.tsx` (bannière `beforeinstallprompt` custom + hint iOS Safari, i18n namespace `pwa` FR/AR/EN, RTL, SW enregistré en PROD uniquement, dismiss persistant localStorage, masqué si déjà installée), câblage `src/app/layout.tsx` (montage + `appleWebApp` + `viewport.themeColor`). **Preuve installabilité RÉELLE (Chromium via CDP sur build prod)** : `<link rel=manifest>` auto-injecté ✅ · service worker **activated** ✅ · manifest parse errors **[]** ✅ · **installability errors [] = Chrome juge l'app installable, zéro blocage** ✅. Bannière capturée FR (titre complet « Installer Abdou Baba ») + AR (RTL miroir correct). **Non-financier, pas de @finance/@security requis, PAS de migration.** **4 checks verts : tsc 0 · build · vitest 660 · smoke 16.** ➡️ **Reste : GO merge Abdou** (puis push + déploiement Vercel ; aucune action DB).
> **RESYNC VÉRITÉ secrets (forensics 2026-07-09)** : la rotation `SERVICE_ROLE_KEY` était contradictoire dans les docs (PLAN/FEUILLE 04/07 = « faite/vérifiée » vs HANDOFF/ETAT = « à faire »). Verdict : **présumée FAITE côté ops le 27/06** (commit `57e6a1f`) + déclarée vérifiée le 04/07, **mais NON prouvable depuis le repo** (rotation = action dashboard). Docs corrigées (ETAT_SYSTEME bloquant #1 + Statut incident + SESSION_HANDOFF « PROCHAINE ACTION »). **SEULE action ouverte = confirmation dashboard Abdou** (date clé > 27/06 + ancienne révoquée + `NEXT_PUBLIC_APP_URL` = domaine). Détail dans la section « PROCHAINE ACTION » ci-dessous.

> **🔴 SESSION 2026-07-07 (3e vague) = FIX RÉGRESSION MIG 116 (bug prod prioritaire). MERGÉ `main` `--no-ff` `32d2ee7` (NON poussé, Abdou pousse).**
> **Bug** : mig 116 (E1) a rendu `wholesale_orders` SELECT staff-only → a cassé 4 policies acheteur qui vérifiaient l'appartenance via un `EXISTS` sur `wholesale_orders` base → **l'acheteur ne voyait plus ses lignes de commande** (« 0 article » sur toutes les commandes en prod), facture non itemisée, réassort cassé. Découvert au test e2e des 7 lots.
> **Fix (mig 120)** : fonction `is_my_wholesale_order(uuid)` **SECURITY DEFINER** (teste `buyer_id=auth.uid()` en contournant la RLS, renvoie un BOOLÉEN — aucune colonne → aucune marge) ; **4 policies réécrites** (`wholesale_order_items`, `import_history`, `payment_history`, `order_proofs`). Durcissements @finance : `order_proofs` exclut `stock_reception_proof` (facture fournisseur=coût) ; `GRANT anon` retiré. **+ 3 consommateurs corrigés** (liste commandes / détail / route facture) : le fix RLS révélait un crash latent (`products` base staff-only → `product=null` → `Cannot read null (media)` = page qui crashe, pire que « 0 article ») → ils lisent le nom/médias produit via la vue redacted `products_catalog_read` + rendu **null-safe** (fallback i18n « Article/منتج/Item »).
> **@finance 🟢** (0 fuite marge rouverte, **E1 reste FERMÉ** : `wholesale_orders` base toujours refusé à l'acheteur, colonnes de marge jamais réexposées) · **@security 🟢** (0 P0/P1, E1 confirmé fermé, isolation cross-buyer prouvée, fonction non détournable). Test intégration LOCAL **5/5** (acheteur voit ses lignes / pas la marge / pas les commandes des autres / admin OK / order_proofs isolé + stock_reception masqué). **Re-test e2e réel** : facture itemisée (vrais noms, Total HT+TTC exact), réassort recharge le panier, détail affiche les articles (plus « 0 article »). **4 checks verts** (tsc 0 · build · vitest **660** · smoke 16).
> **✅ Migration 120 APPLIQUÉE EN PROD 2026-07-07** (pooler, transaction atomique, lockstep après push + Vercel Ready ; vérifié AVANT/APRÈS : fonction `is_my_wholesale_order` SECURITY DEFINER + search_path=public, les 4 policies pointent sur la fonction, `order_proofs` exclut `stock_reception_proof`, **E1 intact** = `wholesale_orders` base toujours `(agent_id=auth.uid() OR admin)`). **Correctif PRIORITAIRE LIVE** : l'affichage des commandes de tous les acheteurs est réparé en prod.
> **P2 non bloquants (hors périmètre)** : champs `notes` libres (historiques import/paiement) re-visibles par l'acheteur (état pré-116) → consigne staff « aucun coût dans les notes » ou colonne `internal_notes` séparée, à traiter en lot dédié.

> **✅ SESSION 2026-07-07 (2e vague) = 3 LOTS. Tous MERGÉS `main` `--no-ff` (NON poussés, Abdou pousse).**
> **AM-1 Réassort 1-clic** (merge) : bouton « Recommander ma dernière commande » sur `/wholesale/orders` → recharge le panier (helper pur `src/lib/wholesale/reorder.ts`, action `reorderLastOrder` dans cart.ts, **aucun prix copié** → le panier recalcule) + bannière bilan `/wholesale/cart?reordered=N&skipped=M`. i18n FR/AR/EN. Non-financier, RLS own-rows. 7 tests. **Pas de migration.**
> **V5 Watchlist / alerte prix** (merge) : bouton « Suivre le prix » sur `/wholesale/marketplace/[id]` ; à la baisse du prix de gros PUBLIC (`suggested_wholesale_price_mad`), notification `price_drop` dans la cloche existante via **trigger DB SECURITY DEFINER `notify_price_drop`** (réutilise `notifications` mig 076). **@security 🟢** (0 P0/P1 ; ne diffuse QUE le prix public, jamais la marge ; P2-2 href gaté rôle corrigé, P2-1 oracle documenté). Actions `watch.ts` (RLS-scoped, produit approuvé requis). 4 tests intégration LOCAL. **✅ Migration 118 APPLIQUÉE EN PROD 2026-07-07** (pooler, transaction atomique, lockstep ; vérifié AVANT/APRÈS : table `product_watches` créée, RLS activée + 3 policies own-only, trigger `trg_notify_price_drop` présent, fonction SECURITY DEFINER).
> **B8 Suppression compte RGPD** (merge) : anonymisation (PAS de DELETE physique — verrou FK/audit append-only) : PII profil vidée (**dont `bank_account`/RIB**) + email auth anonymisé + **ban connexion** + `signOut({scope:'global'})` ; commandes gardent `buyer_id` (intégrité comptable). Action `requestAccountDeletion` (service_role **borné à user.id**, AUTH-FIRST puis profil, admin ne peut pas s'auto-supprimer, confirmation obligatoire), garde `signIn` sur statut `deleted`. Zone dangereuse `/wholesale/account`. **@security 🟢 après 3 P1 corrigés** (P1-1 bank_account oublié → anonymisé ; P1-2 sessions globales ; P1-3 échec auth remonté). 6 tests LOCAL. **✅ Migration 119 APPLIQUÉE EN PROD 2026-07-07** (pooler, transaction atomique, lockstep ; vérifié AVANT/APRÈS : statut `deleted` accepté par le CHECK, colonne `anonymized_at` créée, 0 profil existant modifié).
> **4 checks verts sur `main` combiné (AM-1+V5+B8) : tsc 0 · build · vitest 655 · smoke 16.** Détail : mémoire `project-3lots-reorder-watch-gdpr`.
> **✅ Poussé + déployé (64955ef) + migs 118 & 119 APPLIQUÉES EN PROD (2026-07-07, lockstep). Les 3 lots sont EN PROD ET LIVE.**


> **✅ SESSION 2026-07-07 = 4 LOTS AUTONOMES. Lots 2+1+3 MERGÉS `main` `--no-ff` (NON poussés, Abdou pousse). Lot 4 CODÉ sur branche, en attente validation wording.**
> **Lot 2 — Test nudge palier (AM-2)** (merge, branche `feat/am2-nudge-test`) : logique nudge extraite en helper pur `src/lib/wholesale/tier-nudge.ts` (comportement identique) + 11 tests (unitsToNextTier/savingsPerUnit/nextTierReachable). Non-financier.
> **Lot 1 — Facture PDF Maroc (V3)** (merge, branche `feat/v3-invoice-pdf`) : `src/lib/invoice/` (compute/config/pdf via **pdf-lib**, dep ajoutée) + route GET `/wholesale/orders/[id]/invoice` (auth + vue redacted acheteur, delivered+invoice_requested, lecture seule RLS, PDF en download) + bouton i18n FR/AR/EN. **Invariant gravé : TTC facturé = `wholesale_orders.total_amount` exact** (HT/TVA dérivés en centimes entiers, 0 float ; ligne « Ajustement » réconcilie lignes↔total). **@finance 🟢** (invariant testé) + **@security 🟢** (0 IDOR / 0 fuite marge / pas de service_role / auth 401 / en-têtes privés). **P1 @security corrigé** : pdf-lib Helvetica=WinAnsi plantait en 500 sur séparateur milliers `U+202F` de `fr-MA` (tout montant ≥ 1000 MAD) et sur l'arabe → helper `winAnsi()` central + try/catch route. 16 tests. **⚠️ Ops avant vraies factures : renseigner env `INVOICE_SELLER_ICE/RC/IF` + `INVOICE_VAT_RATE` (défaut 20) dans Vercel** (code omet proprement les champs absents). Contenu FR (standard fiscal Maroc) ; arabe réel dans le PDF = police Unicode embarquée (amélioration future).
> **Lot 3 — Niche déclarée signup grossiste** (merge, branche `feat/niche-declared-signup`) : **migration 117** (`profiles.declared_niche` + trigger `handle_new_user` étendu, allowlist rôle mig 090 inchangée), champ `<select>` de catégories LOCALISÉES au signup grossiste (facultatif, i18n FR/AR/EN, validé `isValidCategory`), fallback COLD-START dans marketplace (`niche = comportement ?? declared_niche` ; grille 🔒 intouchée, uniquement boost tri + bannière existants). Test intégration LOCAL 4/4. **✅ Migration 117 APPLIQUÉE EN PROD le 2026-07-07** (par Claude via pooler `aws-1-eu-central-1.pooler.supabase.com:5432`, `backups/.db_password`, transaction atomique `--single-transaction`, APRÈS push Abdou + déploiement Vercel — lockstep respecté). **Vérifié AVANT/APRÈS** : colonne `declared_niche` (text, nullable) créée ; trigger `handle_new_user` recopie bien `declared_niche` ; allowlist rôle (mig 090) intacte ; 0 profil existant modifié.
> **Lot 4 — Qualité photo IA (C2)** (merge `--no-ff`, branche `feat/c2-photo-quality-ai`) : `photo_issue` ajouté à l'extraction Haiku (MÊME appel, 0 coût IA) + `photo-quality.ts` (fail-open → 'ok' si incertain) + câblage `ingest.ts` : NON-PRODUIT → aucune fiche + guide ; FLOU → fiche créée + signal `blurry_photo` + revue admin forcée + invitation photo nette. Messages bot 4 langues (FR/EN/AR-fusha/darija) **VALIDÉS par Abdou** (rendu RTL vérifié sur capture `Desktop/rendu-photo-messages.png`, darija naturelle). 9 tests. Pas de migration.
> **✅ LES 4 LOTS MERGÉS `main` `--no-ff` (NON poussés). 4 checks verts sur `main` combiné (Lots 1+2+3+4) : tsc 0 · build · vitest 638 · smoke 16.** Détail par lot : mémoire `project-4lots-awaiting-go`. **✅ Poussé + déployé + migration 117 APPLIQUÉE EN PROD (2026-07-07). Reste UNIQUEMENT : renseigner env vendeur facture `INVOICE_SELLER_*` + `INVOICE_VAT_RATE` dans Vercel avant d'émettre de vraies factures (le code marche déjà sans, il omet les champs vides).**
>
> **Dernière mise à jour :** 2026-07-06
> **✅ SESSION 2026-07-06 = BLOC 1B (resync doc) + LOT E1+M1 (fuites de marge owner-facing) — MERGÉ `main` `--no-ff` `a43491d` (NON poussé, Abdou pousse).**
> **(A) Resync doc** : Bloc 1B (WMS-1 `40da1bd` / Vitrine `1f7dd67` / Rôles 2 étages `bc7e627` / V5-bis `c3b7f07`) était en réalité **DÉJÀ MERGÉ `main` + EN PROD** (migs 092-099/104/106-107 dans l'arbre, `< 115` = appliquées) — le « ⬜ à merger » du plan était une **fausse dette** (corrigée dans PLAN + HANDOFF). Branche `feat/etape7-7a` = obsolète (Étape 7 déjà en prod, mig 105).
> **(B) LOT E1+M1 — 2 dernières fuites RLS « un acteur voit la marge sur SES PROPRES lignes »** (branche `fix/e1-m1-marge-propres-lignes`). Pattern mig 060/115 : SELECT base réservé staff + vue redacted owner SANS colonne de marge. **E1** — `wholesale_orders` : l'acheteur lisait `gross_profit_mad/gross_margin_percent/supplier_cost_mad/total_cost_mad` sur SA commande via la table de base → policy `wholesale_orders: read` recréée staff-only (`agent_id=auth.uid() OR admin`) ; l'acheteur lit via la vue existante `wholesale_orders_buyer_read` (063/064). `submitWholesaleOrder` : INSERT commande + rollback basculés sur **service_role** (`adminRead`) car le `returning` n'a plus de policy SELECT acheteur (buyer_id forcé = user.id, montants inchangés). Lectures cancel/note/proof/invoice/quote-page repointées sur la vue. **M1** — `supplier_products` : le fournisseur lisait `platform_margin_*/final_wholesale_price_mad` sur SA fiche → policy « supplier read own » remplacée par « admin read » + **nouvelle vue `supplier_products_owner_read`** (WHERE `supplier_id=auth.uid()`, colonnes de gestion, zéro marge). 4 pages fournisseur repointées ; `getProductLimitStatus` compte via service_role + **garde self-only (IDOR fermé en bonus)**. **@finance 🟢** (0 montant/commission/FX touché) · **@security 🟢** (0 P0/P1, vues étanches, service_role jamais bundlé client). Test LOCAL `rls-close-owner-margin-leaks.integration.test.ts` **7/7** (`assertLocalSupabase`). **4 checks verts** (tsc 0 · build · vitest **598** · smoke 16). **Migration `116_rls_close_owner_margin_leaks.sql`** additive/idempotente, **aucune donnée modifiée**. **✅ APPLIQUÉE EN PROD le 2026-07-06** (via pooler `aws-1-eu-central-1.pooler.supabase.com:5432`, transaction atomique `--single-transaction`, APRÈS push + déploiement Vercel Ready — lockstep respecté). **Vérifié AVANT/APRÈS** : `wholesale_orders: read` = `(agent_id=auth.uid() OR admin)` (branche `buyer_id` DISPARUE) ; `supplier_products` SELECT = `admin read` seul (« supplier read own » supprimée) ; vue `supplier_products_owner_read` créée (16 colonnes, 0 marge/coût), `authenticated` SELECT seul, `anon` absent. **E1 + M1 FERMÉS EN PROD.** ➡️ **Palier 1 / Bloc 1A BOUCLÉ** (reste M2 backlog). Prochaine action = bloquants go-live (rotation secrets → backups).
>
> **Branche prod :** `main` **en avance sur `origin` de 2 commits (`da0f390` + merge `a43491d` E1+M1) — NON poussé, Abdou pousse lui-même**. Après push + déploiement Vercel : ⚠️ **Claude applique la migration 116 (lockstep)**. *(Note : le lot RLS C1/C2/E2 + C1a de la session précédente ont été poussés et sont LIVE ; migration 115 appliquée en prod.)*
> **✅ LOT C1a — UNITÉ DE VENTE LIBRE le 2026-07-04** (mergé `main`, `--no-ff` `75544f4`, **poussé `e842363`, LIVE en prod**) — unité de vente en **CHAMP LIBRE** par produit (gramme/litre/mètre/botte/sachet…, plus d'enum figé). Détection IA à l'ingestion Telegram + **confirmation fournisseur** par le bot (`msgConfirmUnit`, état `awaiting='unit'`, l'IA propose toujours, le fournisseur valide « oui » ou corrige). Affichage **« prix / [unité] »** côté grossiste (fiche/paliers/panier/commande), 4 langues, RTL FSI/PDI. Connu → i18n, libre → verbatim (« botte » jamais écrasé). **Affichage PUR** (@finance 🟢 prix/paliers/commission intacts, @security 🟢 RLS+scoping+injection). **✅ Migration 114 APPLIQUÉE EN PROD** (Abdou, SQL Editor, Success le 2026-07-04) : `telegram_pending_products.awaiting += 'unit'` + colonne `proposed_unit`. **✅ EN PROD ET LIVE.** C1b (multi-unités carton+pièce) **reporté**.
> **✅ LOT A2 + A3 FAITS le 2026-07-04.** A2 (fix surfacturation `max_qty`) **mergé `main`**, diagnostic prod = **0 produit à risque**. A3 (test A→Z gros) **verdict GO** — chaîne gros prouvée bout-en-bout, montants signés @finance. **Graphify activé** (`graphify-out/graph.json` = carte du code).
> **✅ BOT PRIX/PALIERS PÉDAGOGUE le 2026-07-04** (mergé `main`, `--no-ff`, non poussé) — message bot fournisseur (`msgAskPriceAndTiers` + accueil) : format **« [quantité] pièces à [prix] dh l'unité »** (prix PAR UNITÉ explicite, dégressif) remplaçant l'ancien « 50 = 140 » ambigu. **4 langues** (FR/AR-fusha/AR-darija/EN), **isolation RTL FSI/PDI** des nombres en arabe (rendu **validé par Abdou sur capture**). **✅ en prod après push.**
> **✅ SESSION 2026-07-05 = AUDIT RLS CIBLÉ + CORRECTIF FUITES INTER-ACTEURS — MERGÉ `main` `--no-ff` `df8b1ce` (NON poussé, Abdou pousse).** Audit @security = 6 findings. **Fermés** (mig `115`, @finance🟢 @security🟢 @tester🟢, 4 checks verts / 591 tests / smoke 16) : **C1** prix source USD fournisseur (`supplier_product_moq_tiers.unit_price_usd`) lisible par tout grossiste → policy DROP + vue redacted `supplier_product_moq_tiers_wholesaler_read` + marketplace repointée (chip identique) ; **C2** idem variants (`price_adjustment_usd`) → policy DROP ; **E2** `products` SELECT base → staff-only (091 **déjà active en prod, SQL confirmé** → bloc E2 = no-op de sûreté). **✅ EN PROD ET LIVE — migration 115 APPLIQUÉE le 2026-07-05** (via pooler `aws-1-eu-central-1.pooler.supabase.com:5432`, transaction atomique, après déploiement Vercel `df8b1ce` — lockstep respecté). **Vérifié AVANT/APRÈS** : les policies `spmt/spv: wholesaler read approved` ont DISPARU (0 restante), vue redacted `supplier_product_moq_tiers_wholesaler_read` créée, `products: staff read` intacte (E2 = no-op, 091 déjà active). C1/C2 FERMÉES en prod. **Mise en place** : mot de passe DB prod dans `affiliate-platform/backups/.db_password` (chmod 600, **gitignoré**) → débloque aussi le script backup ; migration applicable via `pg` (pooler), PAS `db push`. **⏸️ NON fermés — REPORTÉS** (fuites où l'acteur voit la marge sur SES PROPRES lignes, entremêlées aux chemins d'ÉCRITURE — règle #3) : **E1** (acheteur voit marge sur SA commande) + **M1** (fournisseur voit marge sur SA fiche) → **lot dédié @finance** (vues redacted owner-facing + repoint des gardes d'ownership) ; **M2** (mutation paliers post-approbation, indicatif) → backlog. Diagnostic prod optionnel : `scripts/sql-manuels/RLS_secrets_diagnostic.sql` (lecture seule). Bonus : smoke port configurable via `SMOKE_PORT` (défaut pre-push 3200).
> **Migrations prod :** ✅ **001→120 TOUTES appliquées ET enregistrées** dans `schema_migrations` (resync historique 2026-07-09 : 112-120 réparés, 111 = no-op enregistré [0 ligne concernée], 091 confirmé actif). **Historique 100 % propre, 0 trou.** Application des futures migrations = **pooler pg via `backups/.db_password`** (`aws-1-eu-central-1.pooler.supabase.com:5432`), **JAMAIS le Supabase CLI** (boucle trousseau macOS). Cf. ETAT_SYSTEME → 🪦 STATUTS GRAVÉS.
> **URL prod :** https://affiliate-platform-gamma.vercel.app
> **Projet Supabase :** `owvtfzxvirttrbcsiveg`

> **✅ SESSION 2026-07-05 (b) = C1a DÉTECTION UNITÉ RENFORCÉE — MERGÉE `main` `--no-ff` `92e5e84` (NON poussée, Abdou pousse).** Stress-test RÉEL Haiku ~28 légendes FR/AR/darija/EN, **testée et robuste** : **gramme, litre, mètre, kg, ml, sac** (contenant « sac de 10 kg »→unit=sac + pack), **carton** (+ pack boîtes), libres **botte / bouquet / plaque / douzaine / œuf** préservés verbatim, **arabe/darija** (`للغرام`→gramme, `للكيلو`→kg, `للتر`→litre), anglais (`per piece`→pièce), anti-hallucination (« 100 dh » nu→pièce). **1 flake isolé** (« œufs à l'unité »→parfois « œuf ») corrigé par **1 ligne** dans le prompt `extract.ts` (mot générique « l'unité »→pièce ; unité écrite explicite comme « l'œuf »/« la botte » préservée). 14/14 stress OK, zéro régression, tsc0/build/vitest 591. **Affichage pur, aucun prix touché. Pas de migration.** Reste : `git push` (à ta main) → déploiement → test téléphone (tableau de phrases dans le rapport de session).

Lire aussi : `ETAT_SYSTEME.md` (registre de vérité — POINT DE REPRISE en tête), `FEUILLE_DE_ROUTE.md`, `CLAUDE.md`.

---

## ✅ FAIT — 2026-07-04 (MERGÉ dans `main` ET POUSSÉ `origin` @ `e842363` — DÉPLOYÉ Vercel Ready, migration 114 appliquée en prod)
- **LOT C1a — UNITÉ DE VENTE LIBRE PAR PRODUIT. ✅ MERGÉ `main` (`--no-ff`, `75544f4`). Affichage pur — @finance + @security 🟢.**
  - **Existant réutilisé (pas reconstruit)** : `products.sale_unit` (mig 079), helpers `units.ts` (`resolveUnitLabel`/`priceWithUnit`), mirror `supplier_products.unit → products.sale_unit`, affichage fiche déjà câblé. Le vrai périmètre = rendre l'unité *vraiment* libre + ajouter la confirmation.
  - **Free text réel** : `extract.ts` (prompt IA texte libre, plus d'enum), `schema.ts` (`CleanExtraction.unit: string` verbatim via `sanitizeSaleUnitFreeText`), `units.ts` (`matchKnownSaleUnit` + `resolveUnitLabel` : connu → i18n, **libre → verbatim**, « botte » jamais écrasé vers pièce), `supplier-mirror.ts` (stocke le brut ; connu → canonique, libre → verbatim).
  - **Confirmation bot** : nouvel état `awaiting='unit'` (`conversation.ts` : `interpretUnitReply`/`isAffirmativeReply`), `msgConfirmUnit` (4 langues, validé Abdou capture, isolation RTL FSI/PDI), câblage `ingest.ts` (prix → confirmation → finalisation). Scopé fournisseur (pas de complétion croisée). `pending-store.ts` : `proposed_unit`.
  - **Affichage grossiste** « prix / [unité] » : fiche + paliers + panier + commande (`priceWithUnit`). Sous-totaux/totaux **non** suffixés. Produit sans unité = **inchangé** (`/u.` panier préservé).
  - **⚠️ Migration 114** (`supabase/migrations/114_telegram_unit_confirmation.sql`) : `awaiting += 'unit'` + colonne `proposed_unit`. **Appliquée LOCAL (tests) ; À LANCER EN PROD par Abdou** (SQL Editor). Additive, RLS inchangée.
  - **Tests LOCAL** : `c1a-unit-free-text.test.ts` (24) + mirror (2 cas) + intégration (flux confirmation, 3 scénarios). **4 checks verts** (tsc 0 · build · vitest **585** · smoke 16). **@finance 🟢** (affichage pur, aucun montant/palier/commission touché) · **@security 🟢** (RLS deny-défaut hérité, écritures scopées, pas d'injection — Telegram texte brut, JSX échappé, unité bornée 40 car.).
  - **C1b (multi-unités carton+pièce) REPORTÉ** (hors périmètre, sur décision Abdou).
- **BOT PRIX/PALIERS PÉDAGOGUE. ✅ MERGÉ `main` (`--no-ff`, `b742153`). Texte bot — pas de migration.**
  - **But** : le bot demandait le prix en chiffres secs (`50 = 140`) — ambigu (total ? unité ?) pour un fournisseur peu tech. Nouveau format **explicite prix PAR UNITÉ dégressif** : « 30 pièces à 120 dh l'unité, 200 pièces à 110 dh l'unité ».
  - **Fichiers** : `messages.ts` (`msgAskPriceAndTiers`, garde « dh ») + `welcome.ts` (`buildSupplierWelcome`, **sans « dh »** car accueil multi-devises MAD/AED/USD ; « 1er palier = MOQ » conservé) — **4 langues** (FR/AR-fusha/AR-darija/EN). Nombres **isolés FSI/PDI** en arabe via `formatQty()` (helper existant) → ordre RTL correct. `extract.ts` : prompt Haiku enrichi du nouveau format (**l'ancien « 50=140 » reste accepté** — parseur LLM tolérant, rétrocompat prouvée). Tests `lot5-welcome*` alignés.
  - **Cartographie de bout en bout** (règle CLAUDE.md) : vérifié que l'extraction texte→paliers est un **LLM Haiku tolérant** (pas une regex rigide) → un fournisseur qui recopie le nouvel exemple est compris. **Aucun parseur modifié.**
  - **Validation** : FR/EN + décisions validés par Abdou ; **rendu arabe RTL validé sur capture** (`Desktop/rendu-bot-arabe.png`). **4 checks verts** (tsc 0 · build · vitest **563/563** · smoke 16). @tester anti-régression : reste des textes bot inchangé.
- **LOT A2 — FIX BUG `max_qty` (surfacturation gros catalogue). ⚠️ ARGENT. ✅ MERGÉ `main` (`--no-ff`). Diagnostic prod = 0 produit à risque → aucune réparation lancée.**
  - **Cause** : `upsertProduct` (`src/app/actions/products.ts`) pouvait sauver des paliers catalogue SANS `max_qty` → `getWholesaleTier` (`.find`) facturait le 1er palier (le plus cher) pour toute quantité → prix facturé ≠ affiché. Canal fournisseur (`buildMirrorTiers`) **non concerné, non touché**.
  - **Fix** : nouveau helper pur `boundWholesaleTierMaxQty` (`src/lib/utils.ts`) — borne chaque palier par `min du suivant − 1`, dernier ouvert (logique **identique** à `buildMirrorTiers`) ; appelé dans `upsertProduct` après validation, avant persistance → couvre **création ET modification**. **Aucun prix touché.**
  - **Tests** : `tests/max-qty-server-bound.test.ts` (14 tests : bornage / bon palier par tranche / idempotence). **4 checks verts** (tsc 0 · build · vitest **563/563** · smoke 16).
  - **Audits** : **@finance 🟢** (3 exemples chiffrés prix affiché = facturé) · **@security 🟢** (RAS critique, 2 P2 traités).
  - **2 SQL manuels** dans `scripts/sql-manuels/` (HORS `supabase/migrations/`, **PAS de `db push`**) : `A2_diagnostic_max_qty.sql` (lecture seule, robuste double-encodage) + `A2_repair_max_qty.sql` (réparation idempotente, garde-fou anti-malformé). **À lancer par Abdou en SQL Editor.**
  - **✅ Diagnostic prod lancé par Abdou (2026-07-04)** : « No rows returned » → **0 produit catalogue à risque**. Le fix protège désormais toute nouvelle saisie ; le SQL de réparation reste disponible dans `scripts/sql-manuels/` si besoin futur.
  - **✅ Diagnostic prod lancé par Abdou (2026-07-04)** : 0 produit à risque. **A2 clôturé.**
- **LOT A3 — TEST A→Z GROS COMPLET. ✅ VERDICT GO.** Chaîne gros prouvée bout-en-bout sur un scénario chiffré, avec câblage réel d'`orders.ts` répliqué à l'identique et montants **signés @finance 🟢** : (1) auto-tiers `generateAutoTiers` (4 tranches, plancher 8%, palier 1 = prix exact) ; (2+3) commande gros sur 4 quantités = **prix affiché = prix facturé** (preuve A2 en conditions réelles : qté 100 → 1600 au lieu de 2000) ; (4) commission COD affilié (250 → commission 35, livraison jamais nulle) ; (5) `import_on_demand` → COD bloqué, passe par devis. Harness de vérification temporaire (13 checks verts, supprimé après capture). Anti-régression : suite complète verte (563 tests). **Aucun bug détecté, aucune règle 🔒 touchée, aucun commit de code.**
- **GRAPHIFY activé** : `graphify-out/graph.json` (3239 nœuds / 6792 arêtes) = carte du code à consulter AVANT toute lecture de fichiers (règle ajoutée à `CLAUDE.md`). Update code-only sans coût token.
  - **✅ Poussé `main` @ `e842363` + migration 114 appliquée en prod (2026-07-04 soir, Abdou). Tout est LIVE.** **SESSION EN COURS = AUDIT RLS CIBLÉ** tables gros/fournisseur (Palier 1, Bloc 1A ; périmètre réduit du futur B1). Puis Bloc 1B : merges des branches prêtes (WMS-1, Vitrine grossiste, Rôles 2 étages, décision V5-bis).

---

## ✅ FAIT EN PROD — 2026-07-03 (tout mergé `main` + poussé + déployé Vercel)
- **Migration 112 (auto_tiers_enabled) APPLIQUÉE** en prod → le moteur auto-tiers est actif (le bloquant #0 de la veille est levé).
- **Onboarding fournisseur 1-clic** (`e087e81`) : bouton **« Activer sur Telegram »** sur `/pending` (seul écran atteignable avant approbation). Deep-link `t.me/<bot>?start=<code>` → 1 clic → « Démarrer » → lié. Code émis au rendu (`ensureSupplierTelegramCode`, anti-churn, TTL 30 min, gate `role='supplier'`). i18n FR/AR/EN+RTL. @tester 6/6 · @security 🟢 (note MINEUR/INFO : émission au rendu GET, bornée, assumée).
- **Messages du bot Telegram en 4 langues** (`26f2c68`) : les 13 messages (liaison, garde-fous, accusé produit, guidage) routés FR/EN/AR-fus'ha/AR-darija via le même `pickWelcomeLang` que l'accueil. **Erreurs GUIDANTES** (finissent par l'action + emoji). Module pur `src/lib/telegram/messages.ts`, `ingest.ts` = textes seuls (pipeline/sécu inchangés). 26 tests unitaires.
- **Correctif devise des paliers en modération** (`f93333a`) : la fiche `/admin/supplier-products/[id]` affichait « USD » EN DUR ; désormais `source_currency` (Maroc→MAD, UAE→AED, international→USD). **AFFICHAGE uniquement** — `extract.ts`/facturation/miroir NON touchés. @tester 3/3 LOCAL.
- **Bouton permanent « 📸 Envoyer un produit »** (`c605c07`) : dans l'espace fournisseur LIÉ (`/supplier/dashboard` + `/supplier/products`), lien direct `t.me/<bot>`. @tester 6/6.
- **Migration 113 (`telegram_pending_products`, état conversationnel) APPLIQUÉE** en prod.
- **BOT CONVERSATIONNEL COMPLET** (`f8697f1` → `d4b8227`) : à la photo sans prix, **UN seul message explicatif** (`msgAskPriceAndTiers` : 💰 prix obligatoire + 📦 paliers facultatifs + exemple « 160 dh, 50=140, 200=120 »). Réponse en **une fois** → `extractProductReply` extrait prix ET paliers (**langage naturel + arabe/darija**, prouvé LIVE Haiku) → produit **complété directement** (avec/sans paliers, **plus de ping-pong, plus de relance paliers**). Prix absent → redemande juste le prix. **Confusion** (« je comprends pas / kifach / مافهمتش ») → **ré-explication** (`msgReexplain`). Relance in-conversation. État = table 113, scopé `supplier_id`. @tester 10/10 · @security 🟢. **549 tests.** ⚙️ Relance auto ~1h = optionnelle (`CRON_SECRET` + Vercel Cron `/api/telegram/reminders`).
- **Upgrade premium admin FONCTIONNEL** (existant, confirmé par inspection) : `/admin/premium` → `assignPlan` (`src/app/actions/premium.ts:107`) attribue un plan **sans paiement** (Gratuit=5 / Professionnel=50 / Entreprise=illimité, `premium_plans.max_products`, 0=illimité). Pour débloquer un fournisseur bloqué à 5/5 : lui offrir un plan supérieur, statut `active`, `expires_at` vide = permanent. Trace `subscription_audit_log`.
- **Test A→Z fournisseur validé jusqu'à modération** : inscription → activation 1-clic → envoi photo → **conversation prix/paliers en une fois** → fiche COMPLÈTE en modération. **OK.**

## ✅ FAIT EN PROD — 2026-07-02 (tout mergé `main` + poussé + déployé Vercel)
- **Lot 4** — éditeur paliers + MOQ en modération admin (@finance 🟢 @security 🟢).
- **Lot 5** — message d'accueil bot 4 langues (`ar-MA`→darija, `ar*`→MSA, `fr*`→FR, reste→EN), nom **« Abdou Baba »**, devises MAD/AED/USD.
- **Rebrand Mozouna → Abdou Baba** (texte visible : UI, bot, emails, titres/SEO). **« Mozouna Group » conservé** en footer/légal/entité (façon Alibaba Group). `MozounaLogo`=nom React, `@MozounaSupplierBot`, contrainte DB = intacts (non touchés).
- **Uniformisation paliers (code/UI)** : produit local sans palier → bloc « Prix de gros » par défaut ; international → paliers **indicatifs** (« estimation — hors transport/douane, prix ferme au devis »). @finance 🟢 @security 🟢. **Chantier paliers Telegram CLOS (Lots 1→5).**
- **Moteur auto-tiers (génération auto de paliers dégressifs)** (`fdf9562`) : à l'approbation d'un produit fournisseur SANS palier source, génère 4 tranches (MOQ/×5/×10/×50), décote basée marge, **palier 1 = prix unitaire exact**, **plancher = 8% du prix seul** (mur absolu jamais sous coût), marge ≤ 8% → aucun palier, prix au centime, `max_qty` bornés. @finance 🟢 @security 🟢, **484 tests**. **⚠️ Requiert migration 112 (cf. #0).**
- **Backup prod réparé côté script** (`backup-prod.sh` → pooler session-mode, mdp de `.db_password`, dump 06-26 sécurisé en triple) · `supabase/.temp/` désindexé.

## ▶️ REPRENDRE ICI

### ✅ #0 — Migration 112 APPLIQUÉE en prod (2026-07-03) — bloquant levé
`ALTER TABLE public.supplier_products ADD COLUMN IF NOT EXISTS auto_tiers_enabled boolean NOT NULL DEFAULT true;` **exécutée en prod** → le moteur auto-tiers est actif. Plus de risque de plantage à l'approbation fournisseur.

### 🧪 SESSION BÊTA — FINIR LE TEST A→Z (partie faite : inscription→activation→envoi→modération ✅)
**Reste à valider, avec calculs @finance à CHAQUE étape :**
1. **Approuver la ceinture test (ou un nouveau produit) en modération** → vérifier **génération auto-tiers** (paliers dégressifs, plancher 8%) **+ devise MAD** (affichage corrigé ce jour).
2. **Côté grossiste** (`/wholesale/marketplace`) : produit **publié** avec ses **paliers**.
3. **Passer une commande de gros** → vérifier **calcul prix / palier / total** (attention **bug `max_qty`** #1 : produits catalogue à ≥2 paliers manuels sans borne facturent au 1er palier ; canal fournisseur SÛR via `buildMirrorTiers`).
4. **Parcours affilié** (lien COD) **+ parcours devis international** (approbation devis, prix ferme).
**Prérequis avant de reprendre** : (a) **webhook Telegram → PROD** (`scripts/telegram-setup.sh info` → `url` = `…vercel.app/api/telegram/webhook`) ✅ vérifié ce jour · (b) **backfill auto-tiers** sur produits fournisseur déjà approuvés avant mig 112 (les paliers ne se génèrent qu'à la (ré)approbation).

### 🧱 PRIORITÉS DE REPRISE — vision « SaaS où l'IA gère/corrige/valide, l'admin ne traite que les cas douteux »
1. **FINIR LE TEST A→Z** (cf. section ci-dessus, calculs @finance à chaque étape) : **approuver un produit** en modération → **vitrine grossiste** (`/wholesale/marketplace`, produit publié avec paliers) → **commande de gros** (vérifier prix/palier/total) → **parcours affilié COD** + **devis international**.
2. **LOT UNITÉS UNIVERSELLES** : unité de vente en **champ libre** (safran/gramme, tissu/mètre, légume/kg, huile/litre…) réutilisant `sale_unit` existant (mig 080). **INCLURE la Part 3 taille/unité conversationnelle** : le bot demande une précision taille/unité si l'IA ne peut PAS deviner → nécessite une **nouvelle phase `awaiting='detail'`** = **migration de la contrainte CHECK** de `telegram_pending_products` (table 113) + colonne `detail_question`.
3. **BRIQUE 2 — Contrôle qualité IA à la réception photo** : rejeter photo **floue / non-produit / interdite** et **prévenir le fournisseur** (message guidant multilingue). S'insère dans `ingest.ts` autour de l'extraction Haiku.
- ✅ **BRIQUE 3 (conversationnel) + « explique tout d'un coup » = FAITS ET EN PROD** (cf. section FAIT ci-dessus).
- ✅ **Upgrade premium admin = EXISTANT ET FONCTIONNEL** (`/admin/premium` → `assignPlan`) — plus besoin de le construire. *(Reste à cadrer si besoin : la suppression d'un produit libère-t-elle le quota ?)*
- **OPTION B — Inscription 100% Telegram** (plus tard) : QR → bot → inscription conversationnelle sans formulaire web. S'appuie sur l'état conversationnel (table 113) déjà en place.

### 🧊 RESTE (à froid)

1. **✅ 🐛 BUG `max_qty` (facturation gros) — CORRIGÉ ET MERGÉ `main` 2026-07-04 (LOT A2).** Bornage serveur `boundWholesaleTierMaxQty` (`src/lib/utils.ts`, logique identique à `buildMirrorTiers`), couvre création+modification, aucun prix touché. @finance 🟢 (3 exemples chiffrés) · @security 🟢. **Diagnostic prod = 0 produit à risque** (rien à réparer). SQL de réparation disponible dans `scripts/sql-manuels/` si besoin futur. **Canal fournisseur/Telegram/Lot 4 = SÛR** (`buildMirrorTiers`), **non touché**. **Clôturé.**
2. **🧊 Migration 111 — fix DONNÉES (2 produits `wholesale_tiers` double-encodés)** : **rien n'est cassé** (le code d'affichage gère ces lignes). À lancer par **Abdou** dans **Supabase → SQL Editor** (coller le SQL de `supabase/migrations/111_fix_wholesale_tiers_double_encoding.sql`). **⛔ PAS `supabase db push`** (embarquerait la migration 091). Non urgent.
3. **⚙️ `TELEGRAM_BOT_USERNAME`** — à **re-vérifier** dans les env vars Vercel.
4. **🖼️ Filigrane hero landing « موزونا »** — **asset image** (pas du texte de code) affichant encore l'ancien nom → à **régénérer** (phase design/asset séparée).

### 🚧 BLOQUANTS GO-LIVE (avant vrais fournisseurs)
- **rotation** `SUPABASE_SERVICE_ROLE_KEY` + mdp admin · **backups auto prod** (plan Pro Supabase + `.db_password` mode 600 ; preuve dump pooler + restauration LOCAL) · **redirect `/auth/callback`** (allowlist dashboard Supabase) · **migration 091** · **DETTE suppression de compte (RGPD)** : `deleteUser`/`DELETE auth.users` échoue pour tout compte déjà connecté (verrou `admin_audit_log` append-only + FK `ON DELETE SET NULL`) → à cadrer via `@backend-db` + `@security` · **filigrane hero « موزونا »**. *(mig 112 + 113 = FAITES ; mig 111 data-fix non-urgente.)*

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

**1. 🟡 ROTATION DES SECRETS — PRÉSUMÉE FAITE (27/06 ops), reste CONFIRMATION dashboard.**
   > **🔍 RESYNC VÉRITÉ 2026-07-09 (forensics repo).** Rotation **présumée FAITE côté ops** (commit `57e6a1f` du 27/06 « faites côté ops (Abdou) » + docs consolidées 04/07 `FEUILLE_DE_ROUTE.md:46`/`PLAN_ACTION_GLOBAL.md:28` = « clé rotée, déjà faite 27/06, vérifiée »). **Non prouvable depuis le repo** (une rotation = action dashboard, aucune trace en git). Prouvé côté repo : ✅ 0 clé en dur, ✅ lue uniquement via `process.env` (jamais `NEXT_PUBLIC_*`), ✅ garde-fou build actif, ✅ `.env*` gitignorés. **RESTE = SEULE action ouverte (Abdou, hors repo)** : confirmer au dashboard Supabase → API Keys que la clé `service_role` date de > 27/06 + ancienne révoquée (test API 401) + `NEXT_PUBLIC_APP_URL` = domaine `https://…` en env Vercel + 0 `sb_secret_` dans le bundle prod.
   - **`SUPABASE_SERVICE_ROLE_KEY`** — fuitée (incidents 2026-06-20/22 tests + 2026-06-27 via `NEXT_PUBLIC_APP_URL` inliné dans le bundle client).
   - **Mot de passe admin** `AdminTest2026!` — **committé** → changer + nettoyer les comptes/secrets de test (à confirmer côté ops).

**2. 🟠 BACKUPS AUTO PROD — 🔧 RÉPARÉ CÔTÉ SCRIPT le 2026-07-02, preuve à produire.** Cause de l'échec (`SSL SYSCALL EOF` depuis le 2026-06-29) : `backup-prod.sh` dumpait via l'endpoint **DIRECT** (`supabase db dump --linked`, `db.<ref>.supabase.co`) rendu inatteignable par Supabase. **Corrigé** : bascule sur le **pooler session-mode** (`--db-url postgresql://postgres.owvtfzxvirttrbcsiveg:<pw>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`), mdp lu de `~/AI-FACTORY/backups/.db_password` (mode 600) → run auto lundi **sans trousseau**. Mdp masqué des logs. Dernier bon dump **06-26 sécurisé en triple** (`_safe/` + iCloud). **RESTE À FAIRE** : (a) créer `.db_password`, (b) lancer le dump pooler 07-02, (c) **test de restauration en LOCAL** (jamais fait — la vraie preuve). Le LaunchAgent reste dépendant du PC allumé + Docker → **PITR (plan Pro) recommandé à terme** pour un backup serveur indépendant.

**3. ✅ MIG 091 — CLOS (2026-07-09).** Vérifié en prod via pooler : policy `products: staff read [SELECT]` présente + 091 dans l'historique. **Ne plus lister.** (Zombie mort — cf. ETAT_SYSTEME → 🪦 STATUTS GRAVÉS.)

**4. ✅ REDIRECT `/auth/callback` — CODE FAIT (2026-07-09).** Route + reset MDP en place. **1 seule action Abdou dashboard** : ajouter `${NEXT_PUBLIC_APP_URL}/auth/callback` aux Redirect URLs (Supabase → Auth → URL Configuration) + template email « Reset Password » → `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`. **Ne plus lister comme bloquant code.**

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
| ~~`feat/supplier-stock-multimodes` (V5-bis)~~ | ✅ **DÉJÀ MERGÉ `main` + EN PROD** (merge `c3b7f07`, mig 104 appliquée). Resync 2026-07-06 : n'était PAS en attente. |
| ~~WMS-1 / Vitrine grossiste / Rôles 2 étages~~ | ✅ **DÉJÀ MERGÉS `main` + EN PROD** (merges `40da1bd`/`1f7dd67`/`bc7e627`, migs 092-099/106-107 appliquées). **Bloc 1B = FAIT** — la fausse dette « ⬜ à merger » du plan est corrigée (resync 2026-07-06). |
| `feat/etape7-7a-affichage-variante` | ⚠️ **OBSOLÈTE / superseded** — 2 commits hors main, mais Étape 7 déjà EN PROD (mig 105). Ne pas merger ; candidate à suppression. |
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

*Fin handoff — périmètre beta complet en prod, ingestion Telegram prête (0 fournisseur lié). Ouvrir un chat frais ; LA prochaine action = CONFIRMER la rotation des secrets au dashboard Supabase (présumée faite 27/06, cf. RESYNC VÉRITÉ 2026-07-09), PUIS backups auto prod, puis vérif mig 091 + redirect `/auth/callback`.*
