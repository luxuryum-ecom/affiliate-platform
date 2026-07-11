# LIVRABLE — MODULE LIVREURS & TRAÇABILITÉ COMPLÈTE

> Chantier autonome démarré 2026-07-10 (repris après reset session). Branche par lot. NON mergé (GO Abdou requis).
> Ce fichier est mis à jour au fil des lots pour survivre à une coupure. **Statuts : ✅ prêt / 🟡 partiel / ⏭️ à faire / 🔄 en cours.**

## RÉSUMÉ EXÉCUTIF (état vivant)
| Lot | Sujet | Branche | Statut |
|---|---|---|---|
| 0 | Cartographie anti-fausse-dette | — | ✅ fait |
| A | Registre + comptes livreurs + /admin/couriers | `feat/livreurs-lot-a` | ✅ **PRÊT (GO-ready)** — @finance 🟢 + @security 🟢, 4 checks verts, captures |
| B | QR + code128 + étiquettes PDF + /courier/scan | `feat/livreurs-lot-b` | ✅ **LIVRÉ EN PROD** — mergé main (65668fc) + poussé + **mig 127 appliquée prod 2026-07-11** |
| C | Dashboard livreur mobile cloisonné | `feat/livreurs-lot-c` | ✅ **PRÊT (GO-ready)** — @finance 🟢 + @security 🟢, 4 checks verts, captures FR/AR |
| D | Tournées + retours 3 cas | `feat/livreurs-lot-d` | ⏭️ spécifié |
| E | Notifications instantanées | `feat/livreurs-lot-e` | ⏭️ spécifié |
| F | Relevé PDF affilié au payout | `feat/livreurs-lot-f` | ⏭️ spécifié |

> **CADRAGE HONNÊTE** : la limite de session a coupé 2× sur ce très gros module (6 lots, chacun = migration + backend + frontend + tester + @finance + @security + captures). Décision d'autonomie : **livrer le Lot A (la FONDATION dont B→F dépendent tous) jusqu'au bout GO-ready**, et **spécifier B→F précisément** ci-dessous pour un enchaînement propre lot par lot. Mieux vaut 1 lot solide et vérifié + 5 cadrés que 6 à moitié. Chaque lot suivant = 1 session dédiée.

## PHASE 0 — CARTOGRAPHIE (anti-fausse-dette) ✅
Existant réutilisable vérifié dans le code réel :
- **scan_events (mig 100)** : table append-only immuable + RPC `record_scan`. `scan_type` ∈ {`inbound_reception`,`return_received`} → **À ÉTENDRE** pour le scan livraison (nouveaux types livré/refusé). RLS admin/manage_stock.
- **Grand livre (121-122)** : comptes `cash_in_transit_courier` (asset, actif), `courier_payable` (liability, **réservé inactif**). Helper `ledger2_add_posting(txn, code, amount, party_type, party_id)` SECURITY DEFINER interne (REVOKE public/anon/auth). Écriture COD `ledger2_post_cod_collected` pose `cash_in_transit_courier` party_id=NULL (pas encore par livreur).
- **Réconciliation P0 (122/125)** : `courier_remittances`(courier_id uuid **non relié**), `courier_remittance_orders`, RPC `reconcile_courier_remittance`, vues `v_courier_remittance_pending`/`v_treasury_overview`, écrans `/admin/remittances` + `/admin/treasury`.
- **Notifications (076/109)** : `notifications` (recipient-own RLS) + helpers `src/lib/notifications/{new-signup,order-assigned,order-created}.ts` (in-app + Telegram admin best-effort). **RÉUTILISER** pour Lot E.
- **Payout (049)** : `create_payout(affiliate_id, idempotency_key, reference, notes)`, table `payouts`(affiliate_id, amount, status, reference, notes, paid_at, idempotency_key) — **pas de colonne méthode** → Lot F l'ajoute + PDF.
- **PDF** : `pdf-lib ^1.17.1` présent, `src/lib/invoice/pdf.ts` + `src/app/actions/invoice.ts` = pattern réutilisable (Lot B étiquettes, Lot F relevé).
- **Auth par lien/code** : pattern `telegram-link.ts` (codes TTL usage unique) → base de l'accès livreur cloisonné (`/courier/*`).
- **Routes** : groupes `(admin)(affiliate)(auth)(supplier)(wholesale)`, PAS de `(courier)` → à créer, mobile-first. Design ref = écrans P0 (`/admin/remittances`, `/admin/treasury`).

## DÉCISIONS D'ARCHITECTURE (tranchées seul, notées — autonomie)
1. **`couriers` = table dédiée** (pas un rôle profiles) : livreur = acteur externe (société Ozone/Cathedis OU perso), accès par LIEN/CODE cloisonné (`access_code`), pas de compte auth classique.
2. **Solde livreur temps réel calculé SANS modifier les triggers financiers en prod** (additif, @finance-safe) : `solde = cash dû (Σ commandes livrées assignées non réconciliées) + créance produit (retours manquants)`. Vue `v_courier_balances`.
3. **`orders.courier_id`** (FK nullable) : assignation d'un livreur à une livraison (relie la réconciliation P0 par livreur).
4. **Créance PRODUIT (retour manquant = fuite)** : table `courier_product_debts` + poste grand livre dédié, chiffré sur le solde livreur.
5. **scan_events étendu** (Lot B) : nouveaux `scan_type` livraison (`delivered_collected`, `delivery_refused`) au lieu d'une 2ᵉ table.

---
## 🔒 CHAÎNE DE GARDE — décisions Abdou VERROUILLÉES (pour lots D enrichi + G)
> Gravé le 2026-07-11 (décision Abdou). À respecter dans tous les lots suivants du module Livreurs.

**PRINCIPE FONDATEUR** : chaque **colis** et chaque **dirham** a TOUJOURS un responsable identifié. Tout **transfert de responsabilité** = **DOUBLE CONFIRMATION** — 2 personnes, 2 comptes distincts, **JAMAIS de compte partagé** (l'équipe dépôt n'est pas fixe → chaque salarié scanne avec SON propre code).

**Lot D ENRICHI — ramassage tracé** :
- **Scan de RAMASSAGE OBLIGATOIRE** à la sortie du dépôt, effectué par un **salarié dépôt avec SON code** (compte personnel), pour les livreurs **perso ET** les chauffeurs sociétés (Ozone/Cathedis). C'est le 1er maillon de la chaîne de garde (dépôt → livreur).
- **Bordereau de ramassage PDF** (liste des colis remis à un livreur/chauffeur, horodaté, 2 signatures/scans).
- **Comptes salariés dépôt** : réutiliser le système de **permissions salariés existant** (staff_permissions / capacités), pas de nouveau modèle d'auth.

**Lot G — AGENT GARDIEN (surveillance anti-fuite)** :
- **Retour déclaré par livreur** → **notif INSTANTANÉE Abdou** + état **`RETOUR_DÉCLARÉ_NON_CONFIRMÉ`** ; la **dette du livreur reste INCHANGÉE** jusqu'au **scan de réception par un salarié dépôt** (2ᵉ confirmation). Escalade **48h** sans réception = alerte **« retour fantôme »**.
- **Réception SANS déclaration préalable** du livreur = alerte **« collusion »** (salarié + livreur).
- **Cash encaissé** → la dette ne tombe qu'à **validation Abdou** ; **virement** → **validation bancaire Abdou**.
- **Blocage** : **AUTO** pour livreurs perso (plafond dépassé / fraude) ; **alerte + blocage MANUEL** pour les sociétés (on ne bloque pas une société automatiquement).
- **Alertes** : Telegram admin + cloche in-app + **email récap quotidien**.
- **Détection de pattern** : paire **livreur ↔ salarié** anormalement récurrente = signal.
- **Réconciliation stock continue** + **inventaire physique mensuel guidé**.

---
## LOTS (détail au fil de l'eau)

### Lot A — Registre + comptes livreurs 🔄 (code+build OK, audits en cours)
**Migration `126_couriers_registry.sql`** (LOCAL, additive, 0 trigger financier prod touché — @finance-safe) :
- `couriers` (id, name, courier_type company/personal, company_name, phone, notes, status active/blocked, balance_cap_mad, access_code unique, created_at). RLS SELECT staff-only, écriture service_role.
- `courier_product_debts` (append-only immuable, trigger calque scan_events) : créance PRODUIT (retour manquant). RLS staff.
- `orders.courier_id` (FK nullable) : assignation livreur.
- Vue `v_courier_balances` (security_invoker + rempart staff) : `cash_owed_mad` (Σ commandes livrées assignées non réconciliées) + `product_debt_mad` + `total_balance_mad` + `over_cap`.
**Actions** `src/app/actions/couriers.ts` : listCouriers, getCourierDetail, createCourier (génère access_code base32), setCourierStatus. Admin-only, service_role après garde, zéro fuite marge.
**Écrans** : `/admin/couriers` (liste + stats + créer + tableau soldes, ligne rouge si over_cap + bloquer/débloquer) + `/admin/couriers/[id]` (fiche : identité, soldes, **lien d'accès livreur cloisonné** `/courier?code=`, historique bordereaux/commandes/créances). Composants `courier-create-form`, `courier-status-toggle`, `courier-copy-link-button`. Carte nav dashboard ajoutée.
**i18n** FR/AR/EN (72 clés `admin.couriers` + 2 nav) + RTL. **Test** `lot-a-courier-balances` 6/6. **tsc 0 · build OK** (routes couriers générées).
**Décisions** : solde calculé par vue (pas de compte ledger par livreur → pas de modif des triggers prod). Accès livreur par `access_code` (lien cloisonné, pas compte profiles).
**@finance 🟢 (après corrections)** : additif pur confirmé (0 trigger financier touché), numeric partout, 0 fuite marge. **2 P1 CORRIGÉS** : (P1-1) `cash_owed` recalculé en **résidu pro-rata par commande** (`total − received×total/expected`) → un versement PARTIEL laisse désormais le manque chiffré dans le solde (prouvé : livré 150 / reçu 100 → cash_owed 50) ; (P1-2) `courier_product_debts` CHECK `amount_mad <> 0` → créance erronée **contre-passable par ligne négative** (append-only conservé). P2 documentés : `courier_remittances.courier_id` = `couriers.id` (sémantique), complétude des orderIds à la réconciliation (contrôle applicatif Lot D).
**@security 🟢** : cloisonnement non-staff **étanche** (RLS + rempart → 0 ligne pour non-staff), service_role confiné post-garde admin, immutabilité créance (triggers y compris service_role), Client Components conformes. **P2 corrigés** : RLS alignée **admin-only** (P2-1/P2-2 : `access_code` non lisible par un agent) + `getCourierDetail` valide l'uuid (P2-4). **P2-3 CONSIGNÉ pour Lot C** : `access_code` (~40 bits, clair, sans TTL) doit être durci AVANT d'ouvrir le portail `/courier` (hash au repos, rate-limit, TTL/rotation, entropie ≥128 bits, scope strict au seul livreur).
**4 checks verts** : tsc 0 · build OK · vitest **681** · smoke 16. Test `lot-a-courier-balances` 6/6 + preuve P1-1 (livré 150/reçu 100→cash_owed 50). Captures FR/AR : `couriers-captures/`.
**Lot A = PRÊT POUR GO.** Migration 126 = LOCAL — PROD après GO via pooler.

---
## Lot B — Scan livraison + étiquettes 🔄 (code + 4 checks verts, audits en cours)
**Migration `127_courier_scan_and_access_hardening.sql`** (LOCAL, additive, 0 trigger financier prod touché) :
- **Durcissement accès (@security P2-3)** : `couriers.access_code_hash` (SHA-256) + `access_code_expires_at` (TTL 30j) ; table `courier_access_attempts` + fonction `resolve_courier_by_access_code` (hash + TTL + **rate-limit** 10/min/ip, service_role only, erreur générique). L'ancien `access_code` clair est vidé à la régénération.
- **Scan livraison** : `scan_type` étendu (`delivered_collected`/`delivery_refused`), RPC `record_delivery_scan` (change le statut → les **triggers 122 EXISTANTS postent le ledger**, pas de duplication ; pose `orders.courier_id` pour l'attribution solde), vue `v_courier_scan_queue` (non sensible, rempart staff).
- Actions `courier-scan.ts` (resolveCourierSession, getCourierScanQueue, recordDeliveryScan — cloisonné, service_role après auth par code) + `courier-access.ts` (regenerateCourierAccessCode, code en clair 1 seule fois).
**Portail `/courier/scan`** (groupe `(courier)`, mobile-first, cloisonné) : file des commandes (réf, ville, montant COD), lecture caméra `BarcodeDetector` (QR + code128) + **fallback saisie manuelle**, boutons « Livré+encaissé » / « Refusé-retour ». Fiche admin : bouton « régénérer le lien » (code hashé).
**Étiquettes PDF** : `src/lib/courier/code128.ts` (encodeur Code128B canonique, pur, testé) + `labels-pdf.ts` (planche A4, réf+ville+COD+code-barres) + route `/admin/couriers/labels` + lien sur la page couriers.
**i18n** FR/AR/EN (`courier.scan` 25 clés + `admin.couriers` régénération/étiquettes) + RTL. **Tests** : `lot-b-courier-scan` 6/6 (scan→ledger sans double-poste, rate-limit, TTL) + `code128` 6/6. **4 checks verts** : tsc 0 · build · vitest **693** · smoke 16.
**Décisions** : le scan réutilise les triggers ledger 122 (anti-double-poste) ; QR labels = code128 seul pour l'instant (scannable ; QR nécessiterait une lib serveur `qrcode`, noté).
**@finance 🟢 (après fix)** : additif pur confirmé (0 objet financier redéfini, 0 double-poste, 0 fuite marge, scan réutilise les triggers 122). **P1 CORRIGÉ** : `record_delivery_scan` cloisonnée (`courier_id=p_courier_id OR courier_id IS NULL`) → un livreur ne peut transitionner QUE ses commandes ou non assignées (re-testé 6/6). P2 documentés : attribution COALESCE (réglée par le fix), dédup scan_events par tracking_ref, file = pool partagé (intentionnel).
**@security 🟢** : portail **étanche** (aucun accès sans code valide, code non bruteforçable ~80 bits, résolution avant tout affichage), hash SHA-256 au repos + TTL + code clair 1 fois, cloisonnement livreur confirmé, service_role serveur-only, RPC REVOKE public/anon/authenticated, RLS deny + rempart vue. **P2 corrigés** : (P2-C) un code valide ne consomme plus de quota → plus d'auto-blocage ; (P2-A) rate-limit sur les ÉCHECS même IP nulle (par préfixe). **P2 consignés pré-go-live public** (non bloquants merge) : rétention `courier_access_attempts` (purge >48h), code en query-string → échanger contre cookie httpOnly, TTL 30j long (révocation rapide). (Commentaire entropie 80 bits corrigé.)
**Captures FR/AR (mobile) + écran verrouillé** : `couriers-captures/lot-b/` (portail file cloisonnée, RTL, 🔒 sans code). **4 checks verts** : tsc 0 · build · vitest **693** · smoke 16.
**✅ Lot B = PRÊT POUR GO.** Fichiers (branche `feat/livreurs-lot-b`, NON commité) : mig `127_courier_scan_and_access_hardening.sql` · `src/app/actions/{courier-scan,courier-access}.ts` · `src/app/(courier)/{layout.tsx,courier/scan/page.tsx}` · `src/components/courier/scan-panel.tsx` · `src/components/admin/courier-regenerate-link.tsx` · `src/lib/courier/{code128,labels-pdf}.ts` · `src/app/(admin)/admin/couriers/labels/route.ts` · `tests/{lot-b-courier-scan.integration,code128}.test.ts` · i18n `messages/*` · captures. Migration 127 = LOCAL — PROD après GO (pooler, lockstep).

---
## Lot C — Dashboard livreur mobile cloisonné 🔄 (code + 4 checks verts, audits en cours)
**AUCUNE migration** — réutilise l'existant (règle « pas de nouvelle surface de données »).
- **Action** `src/app/actions/courier-dashboard.ts` : `getCourierDashboard(code)` — auth par `resolveCourierSession` (mig 127, même que /courier/scan), lit `v_courier_balances` (solde EXACT du grand livre, filtré au livreur) + ses commandes en cours (orders scopées `courier_id=lui`, avec contact client de SES livraisons) + ses retours. Service_role APRÈS résolution du code. 100 % lecture.
- **Page** `src/app/(courier)/courier/page.tsx` (mobile-first) : carte « à déposer » (cash encaissé) + créance produit + solde total (chiffres grand livre), gros bouton « Scanner mes livraisons » → /courier/scan, liste de SES livraisons (réf, nom, ville, adresse, **tél cliquable `tel:`**, montant COD), retours à rendre. Thème 🔒, i18n FR/AR/EN (`courier.dashboard`, 14 clés) + RTL, libellés courts (darija/arabe).
- **Cloisonnement** : zéro marge/prix d'achat/autre livreur/total plateforme ; contact client UNIQUEMENT pour SES livraisons.
- **Test** `lot-c-courier-dashboard` 5/5 (A ne voit pas B, solde === v_courier_balances, contact scopé, code invalide→erreur). **4 checks verts** : tsc 0 · build · vitest **698** · smoke 16.
**@finance 🟢 VERT** (aucun P0/P1) : solde livreur = grand livre EXACT (`total_balance_mad` de la vue, pas de somme JS parallèle), zéro écriture financière, zéro float, zéro fuite marge, **cohérence garantie avec la trésorerie admin** (même vue `v_courier_balances`, divergence impossible). P2 informationnels : log d'échec d'auth (sécurité, non-financier), cloisonnement applicatif via `.eq(courier_id)` post-résolution (voulu).
**@security 🟢 GO** : **cloisonnement absolu confirmé** — un livreur ne peut PAS voir un autre livreur ni la plateforme (seul input = le code, qui résout de façon déterministe/unique vers son propre livreur ; toutes lectures scopées `courier_id=lui` côté serveur ; zéro marge/coût/total plateforme ; PII bornée à SES livraisons). Auth par code robuste (hash+TTL+rate-limit mig 127). **P2-1 corrigé** (erreurs DB génériques + log serveur). P2-2 (code en URL, = Lot B) + P2-3 (tel: non validé) documentés, non bloquants.
**Captures FR/AR (mobile)** : `couriers-captures/lot-c/` + `Desktop/p0-ecrans/livreurs-lot-c/` (dashboard : à déposer 300 MAD, solde total, livraisons avec contact + tél, retours, bouton scan ; RTL ; solde vérifié contre le grand livre).
**✅ Lot C = PRÊT POUR GO.** Fichiers (branche `feat/livreurs-lot-c`, NON commité) : `src/app/actions/courier-dashboard.ts` · `src/app/(courier)/courier/page.tsx` · i18n `messages/*` (`courier.dashboard`) · `tests/lot-c-courier-dashboard.integration.test.ts` · captures + scripts. **AUCUNE migration** (lecture seule sur l'existant). + section CHAÎNE DE GARDE gravée (décisions Abdou pour D enrichi + G).

---
## SPÉCIFICATIONS D→F (prêtes à coder, 1 lot = 1 session)

### Lot B — QR + code128 + étiquettes PDF + scan mobile ⏭️
- **Étendre `scan_events` (mig 100)** : nouveaux `scan_type` `delivered_collected` (livré+encaissé) et `delivery_refused` (refusé→retour). Étendre le CHECK. RPC `record_scan` déjà idempotente (unique index) → réutiliser/étendre.
- **Étiquettes PDF en lot** : réutiliser `pdf-lib` (`src/lib/invoice/pdf.ts` pattern). QR (encode order id/ref) + code-barres **code128** (ajouter un encodeur code128 léger, ou lib). Action admin génère un PDF multi-étiquettes imprimable.
- **Page mobile `/courier/scan`** (groupe `(courier)` à créer, mobile-first) : accès par `access_code` (⚠️ durcir d'abord P2-3). Lecture caméra QR **ET** code128 (lib navigateur type `@zxing/browser` ou BarcodeDetector natif). Scan → action `recordDeliveryScan` → `record_scan` + écriture grand livre auto (réutiliser le pattern `ledger2_*` SECURITY DEFINER pour poster l'encaissement/retour). Fallback saisie manuelle du numéro.
- @finance (écritures grand livre) + @security (portail cloisonné non authentifié = surface critique, cf. P2-3).

### Lot C — Dashboard livreur mobile-first cloisonné ⏭️
- **Groupe `(courier)` + garde par `access_code`** (⚠️ P2-3 durcissement PRÉALABLE OBLIGATOIRE : hash, rate-limit, TTL). Le livreur voit UNIQUEMENT ses données via son code.
- Vue livreur : SES colis (assignés/livrés), encaissé, à déposer, **solde** (`v_courier_balances` filtré à lui), retours à rendre. **Ultra-cloisonné** : zéro marge, zéro autre livreur, PII client minimale (ville/point de livraison, pas plus que nécessaire).
- Action `getCourierSelfDashboard(code)` : résout le livreur par code (hashé), scope strict. @security STRICT (étanchéité).

### Lot D — Tournées + retours 3 cas tracés ⏭️
- **Tournée** : table `courier_tours` (groupement de colis d'un livreur), dépôt groupé OU unitaire.
- **Retours 3 cas** (étend `scan_events` / une table `courier_returns`) : (1) déposé au dépôt, (2) rendu au lot société, (3) **MANQUANT/PERTE** → crée une `courier_product_debts` (créance PRODUIT chiffrée sur le solde livreur — table Lot A déjà prête). État retour par colis.
- Contrôle applicatif : complétude des orderIds à la réconciliation (P2-2 finance). @finance + @security.

### Lot E — Notifications instantanées ⏭️
- **Réutiliser l'infra** `src/lib/notifications/*` (in-app `notifications` + Telegram admin `ADMIN_TELEGRAM_CHAT_ID`, pattern `order-created.ts`). Chaque état (livré/encaissé/retourné/manquant/dépôt/**plafond dépassé**) → cloche admin + Telegram admin + confirmation au livreur (in-app dans son portail Lot C). Best-effort (n'altère jamais l'opération). @security (zéro PII/marge dans payloads).

### Lot F — Relevé PDF affilié au payout ⏭️
- **Colonne `payouts.payment_method`** (cash/virement/…) — additive (mig). `create_payout` (049) : soit ajouter un param méthode, soit une table annexe.
- À la création d'un payout : générer un **PDF détaillé** (période, commandes couvertes, montants, total, méthode) via `pdf-lib` (pattern `invoice/pdf.ts`). Notif affilié (infra Lot E). Archivage : lien du PDF sur la fiche payout admin (+ Supabase storage ou génération à la volée). @finance (montants = commissions payées) + @security.

---
## VÉRIFS & GO (par lot)
Chaque lot : @finance + @security + 4 checks verts + captures AVANT proposition de GO. Rien mergé sans GO Abdou.
Migrations LOCAL puis PROD via pooler `backups/.db_password` (jamais le CLI) APRÈS GO + déploiement.

### GO à donner par Abdou
- [x] **Lot A** (registre livreurs) — ✅ **LIVRÉ EN PROD** : @finance 🟢 + @security 🟢, 4 checks verts, captures FR/AR. **MERGÉ main `--no-ff` (28b0ca7) + POUSSÉ + déployé Vercel. ✅ Migration 126 APPLIQUÉE EN PROD le 2026-07-10** (pooler `backups/.db_password`, transaction atomique lockstep APRÈS déploiement — jamais le CLI). Vérifié AVANT (objets absents) / APRÈS (3 objets + orders.courier_id créés, **tables VIDES**, RLS admin-only, trigger append-only, rempart staff, historique 001→126). Types déjà à jour (schéma prod = commité).
- [ ] **Lots B→F** : spécifiés ci-dessus, à coder 1 par 1 (1 session/lot). **Pré-requis Lot C** : durcir `access_code` (P2-3) avant d'ouvrir le portail `/courier`.

### Fichiers Lot A (branche `feat/livreurs-lot-a`, non commité)
- `supabase/migrations/126_couriers_registry.sql`
- `src/app/actions/couriers.ts`
- `src/app/(admin)/admin/couriers/page.tsx` + `[id]/page.tsx`
- `src/components/admin/courier-create-form.tsx`, `courier-status-toggle.tsx`, `courier-copy-link-button.tsx`
- `src/app/(admin)/admin/dashboard/page.tsx` (carte nav), `src/types/supabase-generated.ts` (types régénérés)
- `messages/{fr,ar,en}.json` (72 clés `admin.couriers` + 2 nav)
- `tests/lot-a-courier-balances.integration.test.ts`
- (captures) `scripts/seed-couriers-captures-local.mjs`, `e2e/couriers-captures.spec.ts`, `playwright.couriers.config.ts`, `couriers-captures/*.png`

*Dernière mise à jour : Lot A GO-ready (data+UI+finance+security+tests+captures), B→F spécifiés.*
