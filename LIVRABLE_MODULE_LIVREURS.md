# LIVRABLE — MODULE LIVREURS & TRAÇABILITÉ COMPLÈTE

> Chantier autonome démarré 2026-07-10 (repris après reset session). Branche par lot.
> **✅ RÉCONCILIATION RÉEL 2026-07-12** : les **Lots A→F sont TOUS mergés sur `main` ET EN PROD** — vérifié par `git log main` (A `28b0ca7`, B `65668fc`, C `0fff3bf`, D `e294897`, E `7267b41`, F `9344733`) et par requête LECTURE SEULE sur `supabase_migrations.schema_migrations` en prod (pooler `backups/.db_password`) : **migrations 126, 127, 128, 129, 130 toutes présentes**. Le **Lot G** (Agent Gardien anti-collusion) est désormais **construit et GO-ready** (branche `feat/livreurs-lot-g`, mig 131 LOCAL, RIEN commité, prod intouchée — @finance 🟢 + @security 🟢, 4 checks verts, 13 tests de fraude) — voir §🛡️ LOT G ci-dessous. Le module Livreurs A→G est complet, en attente du GO Abdou pour Lot G.
> Ce fichier est mis à jour au fil des lots pour survivre à une coupure. **Statuts : ✅ prêt / 🟡 partiel / ⏭️ à faire / 🔄 en cours.**

## RÉSUMÉ EXÉCUTIF (état vivant)
| Lot | Sujet | Branche | Statut |
|---|---|---|---|
| 0 | Cartographie anti-fausse-dette | — | ✅ fait |
| A | Registre + comptes livreurs + /admin/couriers | `feat/livreurs-lot-a` | ✅ **EN PROD** — mergé main (28b0ca7) + **mig 126 appliquée prod** — @finance 🟢 + @security 🟢, 4 checks verts, captures |
| B | QR + code128 + étiquettes PDF + /courier/scan | `feat/livreurs-lot-b` | ✅ **EN PROD** — mergé main (65668fc) + **mig 127 appliquée prod 2026-07-11** |
| C | Dashboard livreur mobile cloisonné | `feat/livreurs-lot-c` | ✅ **EN PROD** — mergé main (0fff3bf), **sans migration** — @finance 🟢 + @security 🟢, 4 checks verts, captures FR/AR |
| D | Tournées + scan ramassage + retours 3 cas | `feat/livreurs-lot-d` | ✅ **EN PROD** — mergé main (e294897) + **mig 128 appliquée prod 2026-07-11** |
| E | Notifications instantanées par état | `feat/livreurs-lot-e` | ✅ **EN PROD** — mergé main (7267b41) + **mig 129 appliquée prod** — @finance 🟢 + @security 🟢, 4 checks verts, captures |
| F | Relevés PDF figés (affilié au payout + livreur signable) | `feat/livreurs-lot-f` | ✅ **EN PROD** — mergé main (9344733) + **mig 130 appliquée prod** — @finance 🟢 + @security 🟢, 4 checks verts (vitest 718/718), captures PDF FR/AR/EN |
| G | Agent Gardien anti-collusion (RÈGLE DU PORTEUR + double confirmation + patterns) | `feat/livreurs-lot-g` | ✅ **PRÊT (GO-ready)** — @finance 🟢 + @security 🟢, 4 checks verts (tsc 0 · vitest 731 · build · smoke 16), 13 tests de fraude simulée, captures FR/AR + mobile 390×844. **Mig 131 LOCAL uniquement, RIEN commité, prod intouchée** (GO Abdou requis) |

> **BILAN 2026-07-12** : les **6 lots A→F sont terminés, mergés sur `main` et EN PROD** (migrations 126→130 appliquées, vérifiées en base). Le module de traçabilité livreurs (registre, scan livraison/ramassage, dashboard mobile cloisonné, tournées/retours 3 cas, notifications instantanées, relevés PDF figés) est **live**. **Seul reste le Lot G — Agent Gardien** (surveillance anti-fuite + RÈGLE DU PORTEUR), spécifié dans la section CHAÎNE DE GARDE, à traiter en session dédiée (@architect → @finance/@security → implémentation).

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

**🎯 RÈGLE DU PORTEUR — IMPUTATION AUTOMATIQUE (priorité Lot G, gravé 2026-07-11) :**
> But : rendre l'erreur ET la fraude par imputation croisée **STRUCTURELLEMENT IMPOSSIBLES** (pas juste détectées).
- Le **PORTEUR** d'un colis = le livreur/société qui a scanné le **RAMASSAGE** (`scan_events` `pickup_dispatch`, Lot D). Le système le **connaît déjà** (résolu à la source, jamais saisi).
- **SCAN DE RÉCEPTION AU DÉPÔT : le salarié NE CHOISIT JAMAIS le livreur.** Il scanne le colis, le système **résout AUTOMATIQUEMENT** le porteur enregistré et affiche en clair « **Colis [réf] — Porteur : [nom] — [montant] MAD** » pour **confirmation visuelle** uniquement. **Aucun menu déroulant, aucune saisie manuelle du livreur** → zéro erreur de frappe, zéro fraude par imputation. *(NB : diffère du scan de RAMASSAGE Lot D où le salarié choisit le livreur — à la RÉCEPTION, le porteur est déjà lié au colis, donc imposé.)*
- La **dette annulée est TOUJOURS celle du porteur enregistré**. Impossible d'imputer un retour à un autre livreur/société.
- **Colis scanné SANS porteur enregistré** (jamais ramassé) → **REFUS du scan** + alerte gardien « **colis fantôme — aucun ramassage enregistré** ».
- **Cas légitime (transporteur ≠ responsable)** : si un colis porté par X est physiquement rapporté par un camion Ozone, le retour reste **imputé à X** (SA dette tombe) ; Ozone n'est noté que comme « **transporteur du retour** » (information, PAS responsabilité). **La dette ne change JAMAIS de propriétaire.**
- **Même règle sur le CASH** : un versement n'éteint que la dette du **porteur qui l'a encaissé**. **Aucune compensation croisée** entre livreurs/sociétés.

**📱 RÈGLE CAPTURES — VIEWPORT MOBILE (gravé 2026-07-11) :**
- Toutes les captures des écrans **`/courier/*`** et **`/admin/couriers/pickup`** doivent être en **VIEWPORT MOBILE (390×844, iPhone)** — **98 % de l'usage réel est sur téléphone** (livreurs + salariés dépôt).
- Les écrans **admin de bureau** (`/admin/couriers`, `/admin/couriers/[id]`, `/admin/treasury`, `/admin/remittances`, etc.) restent en **desktop**.

---
## 🛡️ LOT G — AGENT GARDIEN ANTI-COLLUSION — ✅ GO-ready (2026-07-12, NON commité)

> Branche `feat/livreurs-lot-g`. **RIEN commité, prod intouchée, migration 131 appliquée en LOCAL uniquement.** GO Abdou requis pour commit + merge + prod. Le lot le plus critique du module : rend la fraude **structurellement impossible**, pas seulement détectée.

**Anti-fausse-dette (réutilise l'existant, zéro doublon)** : `scan_events`/`pickup_dispatch` (mig 128) = source du porteur ; trigger de contre-passation `handle_order_status_reversal` (mig 122, INCHANGÉ) ; `reconcile_courier_remittance` (mig 122, INCHANGÉE) appelée telle quelle ; `v_courier_balances` (126) lue en seule lecture ; infra notif Lot E (`notifyCourierEvent` + `computeCourierDigest` + email Resend + cron `/api/cron/courier-digest`) ÉTENDUE (pas dupliquée). **Aucun objet financier redéfini.**

**Migration 131 (`131_guardian_anti_collusion.sql`, LOCAL only)** — additive pure :
- Tables append-only : `guardian_alerts` (ineffaçable, résolution write-once), `courier_blocks`, `courier_staff_pairs`, `courier_cash_confirmations`, `inventory_snapshots` + `_lines`. RLS SELECT admin-only (inventaire : +`depot_supervision`), zéro policy write (deny), REVOKE public/anon/authenticated + GRANT service_role sur les 15 RPC.
- **RÈGLE DU PORTEUR** : `resolve_parcel_bearer` (porteur = scan ramassage, jamais saisi) + `record_depot_reception` (n'accepte AUCUN courier_id d'imputation ; colis fantôme → refus ; porteur confirmé ≠ réel → refus `cross_imputation` ; réception sans déclaration → alerte collusion + **dette gelée**).
- **DOUBLE CONFIRMATION ARGENT** : `declare_courier_cash` (pending, dette inchangée) → `confirm_cash_receipt` **admin-only, 2 comptes distincts imposés** (P2-1), garde d'appartenance des commandes au porteur (zéro compensation croisée, P1), clé d'idempotence stable (P0).
- **PATTERNS + SANCTIONS** : `detect_ghost_returns` (48h), `detect_courier_staff_patterns` (paires), `detect_debt_spikes`, `evaluate_courier_block` (perso = blocage AUTO / société = alerte seule), `block_courier` (manuel tracé), inventaire `open/record/close`.
- **Traçabilité du scanneur** : `p_actor_id` passé explicitement par le serveur (auth.uid()=NULL via service_role) → non falsifiable, socle de la détection de collusion.

**Server actions** (`src/app/actions/guardian.ts`) : recordDepotReception, declare/confirm/rejectCash, blockCourier, resolveGuardianAlert, runGuardianDetections, evaluateCourierBlock, inventaire. Gardes `requireCapability('depot_supervision')` / `requireAdmin`, notif best-effort après succès. Notif étendue (`courier-events.ts` : 7 events gardien, Telegram Abdou) + digest email étendu (alertes ouvertes).

**Écrans** (thème clair, i18n FR/AR/EN + RTL) : cockpit desktop `/admin/guardian` (alertes par gravité, versements à valider, retours >48h, livreurs à risque, paires suspectes) ; mobile `/admin/couriers/reception` (**porteur imposé, aucun menu déroulant**) et `/admin/couriers/inventory` (390×844) ; carte nav 🛡️.

**Audits** : **@finance 🟢 GO** (après correctifs P0 idempotence + P1 anti-compensation croisée + P2 réception idempotente ; 5 garanties tenues, dont « aucune alerte n'altère le ledger » et « blocage ne casse aucune transaction »). **@security 🟢 GO** (aucun P0/P1 ; toutes tentatives adversariales échouent : forge courier_id, imputation croisée, auto-encaissement, falsification d'acteur, effacement d'alerte ; P2-1/P2-3 appliqués, P2-2 accepté documenté).

**Preuves** : 4 checks verts (**tsc 0 · vitest 731 · build · smoke 16**) ; **13 tests de fraude simulée** (`tests/lot-g-guardian-fraud.integration.test.ts`) — F1 colis fantôme, F2 imputation croisée, F2b compensation croisée cash, F3 réception fantôme/collusion, F4 auto-encaissement, F4b idempotence cash, F4c 2 comptes distincts, sanctions perso/société, détection 48h, alertes ineffaçables — **toutes les fraudes obligatoires échouent comme voulu**. Captures FR/AR + mobile 390×844 dans `~/Desktop/p0-ecrans/livreurs-lot-g/`.

**Décisions prises seul (autonomie)** : (1) réception mobile en 1 seul appel = « confirmation visuelle uniquement » conforme au spec (porteur imposé serveur ; anti-tamper `confirmedCourierId` testé au niveau RPC via F2) ; (2) destinataire Abdou = Telegram via `ADMIN_TELEGRAM_CHAT_ID` + cloche in-app admins, champ superviseur délégable = TODO inactif de `courier-events.ts` (conforme spec) ; (3) email récap = extension du digest Lot E existant (aucune nouvelle infra cron).

**Reste (GO Abdou)** : commit branche → merge → **appliquer mig 131 en prod** (pooler `backups/.db_password`, lockstep APRÈS déploiement, jamais le CLI, vérif AVANT/APRÈS) → régénérer types depuis prod. **Ops non bloquantes** : env `CRON_SECRET`/`COURIER_DIGEST_EMAIL`/`RESEND_API_KEY`/`EMAIL_FROM` (déjà requises Lot E) pour l'email récap ; planifier le cron `/api/cron/courier-digest` (déjà routé).

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
## Lot D — Tournées + scan ramassage + retours 3 cas (chaîne de garde) 🔄 (code + 4 checks verts, audits en cours)
**Migration `128_courier_tours_pickup_returns.sql`** (LOCAL, additive, 0 trigger financier prod touché) :
- `scan_events.scan_type` +`pickup_dispatch`. Tables `courier_tours` + `courier_tour_orders` (tournées). `courier_returns` (machine à états `declared→confirmed_depot|confirmed_company|lost`, RLS staff).
- 5 RPC SECURITY DEFINER (REVOKE public/anon/authenticated, GRANT service_role) : `record_pickup_scan` (transfert de garde, **zéro ledger**), `declare_courier_return` (cloisonné livreur, **dette INCHANGÉE**), `confirm_return_depot`/`confirm_return_company` (state=declared exigé → status='returned' → **réutilise le trigger 122** pour la contre-passation), `mark_return_lost` (créance `courier_product_debts` append-only).
**Scan RAMASSAGE (le maillon manquant, priorité)** : page `/admin/couriers/pickup` (salarié dépôt, `requireCapability('depot_supervision')` + action `listActiveCouriersForDepot`) — sélection livreur + tournée + caméra `BarcodeDetector` + fallback manuel → `record_pickup_scan` (transfert de garde). Chaque colis scanné passe sous la responsabilité du livreur.
**Écran admin `/admin/couriers/[id]` enrichi** : section Tournées (créer, lister, **bordereau PDF** `/admin/couriers/tours/[tourId]/slip` via `pickup-slip-pdf.ts` — liste colis + valeur COD + double signature) + section Retours (badges état EN ATTENTE/CONFIRMÉ/PERTE, actions confirmer dépôt / société / marquer perte, note chaîne de garde).
**Mobile (chaîne de garde)** : le bouton « Refusé » du portail livreur appelle désormais `declareCourierReturn` (**déclaration**, dette inchangée) au lieu de l'ancien retour auto-validé — la validation (dette annulée) vient du scan de réception d'un salarié dépôt (DOUBLE CONFIRMATION).
**Tests** : `lot-d-tours-returns` 6/6 (pickup zéro-ledger, déclaration sans effet sur dette, CAS 1 exige déclaration + contre-passation, CAS 3 créance immuable, cloisonnement). **4 checks verts** : tsc 0 · build · vitest **704** · smoke 16. i18n FR/AR/EN (+44 admin.couriers, +29 admin.depotPickup) + RTL.
**Décision money** : pickup zéro MAD ; retour confirmé réutilise le trigger 122 ; PERTE = créance append-only (v_courier_balances).
**@finance 🟢 (après fixes)** : chaîne de garde respectée (pickup zéro-ledger, déclaration = dette inchangée, retour confirmé = contre-passation via trigger 122 idempotent, double confirmation exigée, créance immuable). **2 P1 CORRIGÉS + testés** : (P1-A) `delivery_refused` retiré de la surface de `recordDeliveryScan` → un livreur ne peut plus auto-annuler sa dette sans confirmation dépôt ; (P1-B) `mark_return_lost` refuse une commande `delivered` → pas de double-comptage cash+produit. **Point 6 TRANCHÉ** : la PERTE = créance `courier_product_debts` suffit (le grand livre global = livre de règlement cash, pas d'inventaire) ; **DETTE tracée** : aucun chemin n'éteint une créance produit au grand livre global → module « recouvrement créances produit » futur (2 comptes à créer : product_loss_expense / courier_product_receivable), hors Lot D. Test lot-d **8/8** (dont les 2 cas P1).
**@security 🟢 GO** : **double confirmation NON contournable** (3 barrières indépendantes : surfaces séparées livreur/staff, RPC REVOKE public/anon/authenticated = service_role only, machine à états `declared` exigée) ; cloisonnement livreur au niveau RPC (`orders.courier_id=p_courier_id`, id dérivé serveur) ; scan ramassage gardé `depot_supervision` ; RLS deny-write ; PDF admin-only sans marge ; Client Components conformes. **P2-1 corrigé** (gardes RPC dépôt alignées sur `admin OR depot_supervision`, moindre privilège). P2-2 (lecture agent tournées/retours) = **intentionnel** (le salarié dépôt EST un agent qui doit voir les retours à confirmer). P2-3 (collusion livreur↔salarié) = couvert par le contrôle organisationnel + **Lot G Agent Gardien**.
**Captures FR/AR** : `couriers-captures/lot-d/` + `Desktop/p0-ecrans/livreurs-lot-d/` (fiche enrichie : Tournées « En tournée » + bordereau, Retours 3 états EN ATTENTE/CONFIRMÉ/PERTE + note chaîne de garde + actions ; page scan ramassage). **4 checks verts** : tsc 0 · build · vitest **706** · smoke 16.
**✅ Lot D = PRÊT POUR GO.** Fichiers (branche `feat/livreurs-lot-d`, NON commité) : mig `128_courier_tours_pickup_returns.sql` · `src/app/actions/courier-tours.ts` (+`courier-scan.ts` declareCourierReturn) · `src/app/(admin)/admin/couriers/{pickup/page.tsx,[id]/page.tsx,tours/[tourId]/slip/route.ts}` · `src/components/admin/{depot-pickup-panel,courier-return-actions,courier-tour-create-form}.tsx` · `src/lib/courier/pickup-slip-pdf.ts` · `src/components/courier/scan-panel.tsx` (refus→déclaration) · `tests/lot-d-tours-returns.integration.test.ts` · i18n + captures. Migration 128 = LOCAL — PROD après GO (pooler, lockstep). **DETTE tracée** : module « recouvrement créances produit » (2 comptes ledger) pour éteindre les créances PERTE au grand livre global.

---
## Lot E — Notifications instantanées par état 🔄 (code + 4 checks verts, audits en cours)
**3 canaux, destinataire = Abdou/admins (champ superviseur prévu pour + tard) :**
- **Migration `129_courier_notifications.sql`** (LOCAL, additive) : `notifications.courier_id` (FK) + index unique dédup `(courier_id, event, recipient_id)`. event = texte libre (pas de CHECK à toucher).
- **Helper `src/lib/notifications/courier-events.ts`** : `notifyCourierEvent` **best-effort total (ne throw JAMAIS)**, calqué sur `order-created.ts`. Payload strict `{courierName, reference, city, amountMad}` — **zéro donnée sensible**. Cloche in-app (tous events) + **Telegram admin (🚨 SEULEMENT** `return_declared` / `return_lost` / `over_cap`**)**. Dédup anti-spam (upsert onConflict).
- **Câblage NON BLOQUANT** (APRÈS succès RPC, jamais dans une transaction) : recordPickupScan→pickup, recordDeliveryScan→delivered, **declareCourierReturn→return_declared 🚨** (moment critique), confirmReturnDepot/Company→return_confirmed, **markReturnLost→return_lost 🚨 + check over_cap 🚨**, reconcileRemittance→remittance.
- **Email récap quotidien** : `getCourierDailyDigest`/`computeCourierDigest` (données : retours en attente + ancienneté, over/near-cap, encours total, pertes du jour, colis ramassés non résolus) + `courier-digest-email.ts` (HTML) + `src/lib/email/send.ts` (**Resend en fetch, SANS dépendance**, best-effort, no-op si non configuré) + route cron `/api/cron/courier-digest` (sécurisée `CRON_SECRET`, service_role). *(Config prod à poser : CRON_SECRET, COURIER_DIGEST_EMAIL, RESEND_API_KEY, EMAIL_FROM + un cron Vercel.)*
- **Confirmations au livreur** sur `/courier` (dashboard Lot C enrichi) : « Mes retours » avec état (En attente de confirmation dépôt / Confirmé / Perte) + « Versements enregistrés ». Cloisonné (scopé au livreur).
- **Test** `lot-e-courier-notifications` 5/5 (dédup, over_cap dédup, **non-blocking : action réussit même si notif échoue**, digest). **4 checks verts** : tsc 0 · build · vitest **711** · smoke 16. i18n FR/AR/EN + RTL.
**@finance 🟢 VERT** (aucun P0/P1) : **aucune notif ne peut bloquer/altérer une écriture comptable** — émises APRÈS le succès RPC, double try/catch (helper + appelant), ne throw jamais ; jamais dans une transaction/trigger ; mig 129 additive (0 trigger) ; digest lecture pure (réutilise v_courier_balances). **P2-1 traité** (timeout 10s sur le fetch email). P2-2 (somme JS d'affichage du récap) = acceptable (non persisté).
**@security 🟢 GO** : **cloisonnement livreur correct** (confirmations retours/versements scopées `.eq('courier_id', session.courierId)` — un livreur ne voit jamais un autre), **zéro fuite marge/coût** (payload = réf/ville/nom/montant COD only), destinataires OK (cloche = admins via RLS recipient-own ; Telegram = ADMIN_TELEGRAM_CHAT_ID), email protégé CRON_SECRET, Telegram sans parse_mode (pas d'injection). **P2-1 corrigé** (échappement HTML des noms dans l'email) + **P2-2 corrigé** (comparaison constante du CRON_SECRET).
**Fix capture** : la cloche admin affichait l'event brut → ajout d'une branche `courier_*` + i18n (`notifications.courier`, 8 clés ×3) dans `getNotifications` → rendu « 🚨 Retour déclaré · [nom] · réf [ref] · [montant] » + lien `/admin/couriers/[id]`. Vérifié en capture.
**Captures** : `couriers-captures/lot-e/` + `Desktop/p0-ecrans/livreurs-lot-e/` — `/courier` **mobile 390×844** FR/AR (confirmations « Mes retours » états + « Versements enregistrés ») + cloche admin **desktop** (notif livreur rendue). **4 checks verts** : tsc 0 · build · vitest **711** · smoke 16.
**✅ Lot E = PRÊT POUR GO.** Fichiers (branche `feat/livreurs-lot-e`, NON commité) : mig `129_courier_notifications.sql` · `src/lib/notifications/{courier-events,courier-digest-email}.ts` · `src/lib/email/send.ts` · `src/app/actions/{courier-digest,courier-dashboard,notifications}.ts` + câblage `courier-tours/courier-scan/remittances` · `src/app/api/cron/courier-digest/route.ts` · `src/app/(courier)/courier/page.tsx` (confirmations) · tests + captures + i18n. Migration 129 = LOCAL — PROD après GO. **Config prod à poser** : `CRON_SECRET`, `COURIER_DIGEST_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM` + cron Vercel sur `/api/cron/courier-digest`.

---
## SPÉCIFICATIONS F (prêtes à coder, 1 lot = 1 session)

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

### Lot F — Relevés PDF figés (affilié + livreur signable) ✅ **GO-READY** (branche `feat/livreurs-lot-f`, NON commité, prod intouchée)
**Livré 2026-07-11.** @finance 🟢 GO + @security 🟢 GO (aucun P1/P2 ; P3 mineurs, P3-1 traités). 4 checks verts : `tsc` 0 · `next build` OK · `vitest` 718/718 · `smoke` 16.

**Migration 130 (LOCAL uniquement — À APPLIQUER EN PROD APRÈS GO + déploiement, pooler `backups/.db_password`, jamais le CLI, lockstep, vérif AVANT/APRÈS) :**
- `payouts.payment_method` (virement/cash/cheque/autre, CHECK, nullable) — **métadonnée d'affichage, n'entre dans AUCUN calcul de montant**.
- Tables `payout_statements` (1/payout, UNIQUE) + `courier_statements` (N/livreur) — **append-only immuables** (triggers), RLS : affilié voit SES relevés (`affiliate_id=auth.uid() OR admin`), relevés livreurs **admin-only**. Aucune policy INSERT/UPDATE/DELETE (écriture RPC/service_role only).
- RPC `generate_payout_statement(payout_id)` : snapshot FIGÉ construit DEPUIS LE GRAND LIVRE (`ledger_entries` payout→commissions→orders). **Garde-fou INCONTOURNABLE** : `total lignes = payouts.amount` sinon EXCEPTION (divergence structurellement impossible). Idempotent (`ON CONFLICT payout_id`).
- RPC `generate_courier_statement(courier_id, start, end)` : **SOLDE FINAL = `v_courier_balances`** (grand livre, aucun recalcul) + activité de période (ramassages, livraisons+cash, retours dépôt/société, pertes chiffrées, cash versé) bornée période+livreur (zéro double comptage). SECURITY DEFINER, garde `admin OR service_role`, `SET search_path`.

**Rendu PDF (à la volée depuis le snapshot figé — zéro calcul dans le renderer) :**
- `src/lib/statements/` : `pdf-fonts.ts` (Helvetica FR/EN + **Noto Sans Arabic embarqué base64 + reshaper** pour l'AR ; runs latins/chiffres → Helvetica), `pdf-i18n.ts` (libellés **FR/AR/EN**, `fmtMad` Intl sans /100), `pdf-core.ts` (primitives conscientes de la direction **LTR/RTL**), `payout-statement-pdf.ts`, `courier-statement-pdf.ts` (**zone de double signature** livreur + Mozouna, preuve anti-litige). **AR RTL vérifié visuellement** (lettres liées, ordre RTL correct).
- **Anti-fausse-dette** : réutilise `getSellerIdentity` (invoice/config), `pdf-lib`, grand livre (048/049/126), `create_payout` inchangée.

**Câblage & UI :**
- `createPayout` (payouts.ts) : après le paiement (money déjà écrit), pose `payment_method` + `generate_payout_statement` + notif affilié — **best-effort NON BLOQUANT** (double try/catch, jamais dans la transaction money).
- Routes RLS-scopées : `GET /api/statements/payout/[payoutId]?lang=` + `/api/statements/courier/[statementId]?lang=` (client RLS, **pas** service_role → IDOR impossible).
- Actions `src/app/actions/statements.ts` (générer + lister, gardes `requireAdmin` / RLS own). Notif `src/lib/notifications/payout-paid.ts` (payload sûr).
- UI : sélecteur méthode dans le formulaire payout, section « Relevés signables » (générateur période + liste) sur `/admin/couriers/[id]`, page `/affiliate/statements` (« Mes relevés »). i18n FR/AR/EN complet (parité vérifiée). Cloche : rendu `payout_paid`.

**Tests LOCAL verts :** `tests/lot-f-statements.integration.test.ts` (invariant grand-livre EXACT, garde-fou anti-divergence, snapshot figé, immuabilité, solde livreur = v_courier_balances) + `tests/lot-f-statements-render.test.ts` (rendu FR/AR/EN valides).
**Captures :** `Bureau/p0-ecrans/livreurs-lot-f/` — 6 PDF réels (affilié+livreur × FR/AR/EN) + 6 écrans (admin payouts, fiche livreur, affilié × FR/AR).

**⚠️ CONFIG PROD (Vercel) déjà en place pour ce lot** : aucune nouvelle variable requise (le PDF affilié utilise l'identité vendeur `INVOICE_SELLER_*` déjà prévue ; sinon défaut « Mozouna Group »).

---
## VÉRIFS & GO (par lot)
Chaque lot : @finance + @security + 4 checks verts + captures AVANT proposition de GO. Rien mergé sans GO Abdou.
Migrations LOCAL puis PROD via pooler `backups/.db_password` (jamais le CLI) APRÈS GO + déploiement.

### GO à donner par Abdou
- [x] **Lot A** (registre livreurs) — ✅ **LIVRÉ EN PROD** : @finance 🟢 + @security 🟢, 4 checks verts, captures FR/AR. **MERGÉ main `--no-ff` (28b0ca7) + POUSSÉ + déployé Vercel. ✅ Migration 126 APPLIQUÉE EN PROD le 2026-07-10** (pooler `backups/.db_password`, transaction atomique lockstep APRÈS déploiement — jamais le CLI). Vérifié AVANT (objets absents) / APRÈS (3 objets + orders.courier_id créés, **tables VIDES**, RLS admin-only, trigger append-only, rempart staff, historique 001→126). Types déjà à jour (schéma prod = commité).
- [x] **Lots B→F** — ✅ **TOUS EN PROD** (vérifié 2026-07-12) : B mergé `65668fc` (mig 127), C mergé `0fff3bf` (sans mig), D mergé `e294897` (mig 128), E mergé `7267b41` (mig 129), F mergé `9344733` (mig 130). Migrations 127→130 confirmées présentes dans `schema_migrations` prod (requête lecture seule pooler). Pré-requis Lot C (durcissement `access_code` P2-3) traité au Lot B.
- [x] **Lot G — Agent Gardien anti-collusion** — ✅ **PRÊT (GO-ready) 2026-07-12**, branche `feat/livreurs-lot-g`, **RIEN commité, prod intouchée, mig 131 LOCAL uniquement**. Voir bilan détaillé ci-dessous. @finance 🟢 + @security 🟢, 4 checks verts, 13 tests de fraude. **GO Abdou requis** pour commit + merge + application prod mig 131 (pooler `backups/.db_password`, jamais le CLI).

### Fichiers Lot A (branche `feat/livreurs-lot-a`, non commité)
- `supabase/migrations/126_couriers_registry.sql`
- `src/app/actions/couriers.ts`
- `src/app/(admin)/admin/couriers/page.tsx` + `[id]/page.tsx`
- `src/components/admin/courier-create-form.tsx`, `courier-status-toggle.tsx`, `courier-copy-link-button.tsx`
- `src/app/(admin)/admin/dashboard/page.tsx` (carte nav), `src/types/supabase-generated.ts` (types régénérés)
- `messages/{fr,ar,en}.json` (72 clés `admin.couriers` + 2 nav)
- `tests/lot-a-courier-balances.integration.test.ts`
- (captures) `scripts/seed-couriers-captures-local.mjs`, `e2e/couriers-captures.spec.ts`, `playwright.couriers.config.ts`, `couriers-captures/*.png`

*Dernière mise à jour : 2026-07-12 — RÉCONCILIATION RÉEL : Lots A→F TOUS EN PROD (migrations 126→130 vérifiées en base, lecture seule pooler ; 6 merges confirmés sur main). Seul reste le Lot G (Agent Gardien), non démarré.*
