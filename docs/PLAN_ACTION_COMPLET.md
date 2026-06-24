<!--
  PLAN D'ACTION COMPLET — audit exhaustif lecture seule (2026-06-24).
  Fusion de : docs/ROADMAP_MASTER.md (+ §4bis), docs/ARCHI_VARIANTES_STOCK.md,
  FEUILLE_DE_ROUTE.md, ETAT_SYSTEME.md, CLAUDE.md, état git + migration list.
  Source de priorisation. Aucun code. Tenir à jour à chaque session.
-->

# 🗺️ PLAN D'ACTION COMPLET — Mozouna Group

> Réconciliation de fraîcheur : **ROADMAP_MASTER.md fait foi**. Plusieurs statuts « non mergé / 🔄 » de FEUILLE_DE_ROUTE.md / ARCHI sont **périmés** (WMS-1, vitrine, rôles 2 étages, durcissement, catégories dynamiques, **et le Lot A variantes**) → désormais **EN PROD**. Vérifié via `supabase migration list` : **migrations 001→100 appliquées en prod** ; URL prod `https://affiliate-platform-gamma.vercel.app`.

---

## A. ÉTAT EN PROD (exhaustif, avec n° migration)

**Auth / rôles / sécurité**
- Auth + 5 rôles (admin/agent/affiliate/wholesaler/supplier) + RLS deny-default — `001`
- Rôles à 2 étages (superviseur de volet + tâches fines, audit immuable) — `083/087/088`
- Permissions modulables data-driven (`staff_permissions`, `has_capability`) — `083`
- Durcissement go-live beta (signup allowlist DB, reset MDP self-service, flux `/pending`) — `089/090/091`
- Vue redacted `products_catalog_read` (ferme dette 073 coût/marge) — `089` ; vue publique `products_public_read` (ferme dette 012 anon) — `072`

**Finance** (cœur, intangible)
- Ledger append-only — `048` ; payout atomique idempotent — `049`
- Moteur COD + frais + snapshots — `009` ; confirmation conditionnelle + packaging — `074`
- Prix/commission + factory cost + auto-commission — `013/016` ; capital affilié — `073`
- Multi-devise pivot MAD — `050/051/052` ; `confirm_cod_order` DEFINER — `088`
- Règle figée : grossiste = paliers / zéro COD ; affilié = capital / zéro palier

**Produits** : CRUD + upload (WebP + HEIC iPhone) — `002` ; `sale_unit` — `079` ; pack `pack_size/pack_unit` — `080` ; extraction IA unités/conditionnement

**Catégories** : dynamiques en base + CRUD admin + toggle canal audité — `081/082` ; suggestion IA (CAT-IA) + validation — `084/085` ; 12 cat + 48 sous-cat

**Fournisseurs** : espace complet + miroir catalogue (coût+marge) — `068/069` ; **bot Telegram ingestion EN PROD** (webhook prod) — `053` ; modération + RFQ matching — `037/044` ; agents sourcing par pays — `078/086`

**Wholesale B2B (FSM Deliveroo)** : FSM cycle — `057/059/061/065` ; équipes/assignation — `058` ; collecte cash + sous-collatéral — `065/067` ; catalogue unifié — `075` ; marketplace global + filtres pays ; hook économie 3 colonnes

**Affiliés** : catalogue + liens `?ref=` + commissions ; saisie COD directe ; prix custom — `011` ; hook profit (simulateur ×1,25)

**Vitrine** : vitrine grossiste intelligente (carte Maroc + perso niche RLS-safe) ; dashboard HUB 3 zones ; entrée par rayon ; mobile/RTL

**WMS / Stock**
- **WMS-1 stock central** : ledger `stock_movements` append-only, `reserve/restore_stock`, `adjust_stock_manual`, taxonomie raisons, `stock_anomalies` + socle Gardien, **Option A never-refuse** — `092/093/094/095`
- Écran admin `/admin/stock` (journal/ajustement/anomalies)
- **LOT A variantes (étapes 1→5)** — `096/097/098/099/100` — **MERGÉ (`3900b74`) + APPLIQUÉ EN PROD** : `product_variants` + variante défaut, statuts ledger + projection `variant_status_balance`, vue client `product_variants_read` + sélecteur, RPC variante-aware + double-écriture, `scan_events` + `record_scan`
- Garde-fous tests anti-prod (`assertLocalSupabase`, règle CLAUDE.md #8)

**Notifications** : infra in-app (`notifications`) — `076/077` ; notif fournisseur LOT 6 ; Telegram sortant best-effort ; notif superviseur pays

**Design / infra** : noir & or (dashboards thème CLAIR) ; i18n FR/AR/EN + RTL ; buckets storage ; 305 tests vitest + smoke 20/20

---

## B. DETTES OUVERTES (classées)

### 🔴 Sécurité — BLOQUANT avant ouverture beta
1. **Rotation `SUPABASE_SERVICE_ROLE_KEY`** (compromise, incident 2026-06-20)
2. **Rotation `sb_secret_…`** (Supabase Secret Key, incident 2026-06-22) + **authtoken ngrok**
3. **Rotation MDP admin** (`AdminTest2026!` committé)
4. **Supprimer comptes/secrets de test** : `TelegramTest2026!`, `AgentDemo2026!`, `AdminTest2026!`
5. **Retirer l'abonnement "Entreprise" de TEST** sur fournisseur `cec673db…` (DELETE → retour `free`)
6. **Tester runtime (navigateur, Vercel)** : reset MDP (spec S3) + flux `/pending` (S4)
7. **Allowlist Redirect URLs Supabase** : ajouter `${NEXT_PUBLIC_APP_URL}/auth/callback` (sinon reset MDP échoue)
8. **Backup prod frais** (celui du 2026-06-23 a échoué — Docker éteint)

### 🟠 Dettes techniques
1. Saisie manuelle **paliers fournisseur** (flux Finaliser) — table `supplier_product_moq_tiers` VIDE (0/469)
2. **parseFloat argent restant** : `bulk-import.ts`, `products.ts`, `orders.ts` (plusieurs sites) → helper `money.ts`
3. **Idempotence + reporting lignes échouées import CSV** (`publishBulkImport` recrée des doublons au retry)
4. **PII `notes` sourcing** (mig 086) visible par l'agent
5. **Régénérer `supabase-generated.ts`** (types) après push variantes (096-100)
6. Décision **FX half-up `factory_cost_mad`** reportée ; N+1 `getCategoryChannelAudit` ; `image_url` zod `url()` ; `updateCategory` re-check id ; `changed_by` ON DELETE SET NULL
7. **Backfill catégories** des produits internes créés avant le fix
8. Dette test : re-login `beforeEach` C/D CAT-IA ; test DB idempotence `create_payout` ; **`repeated_adjust` non testé runtime**
9. Audit `wholesale_tiers` hérités non re-validés ; `bulkApproveProducts` n'écrit ni toggle ni canal ; preview commission product-form

### ❌ Manquants structurels
1. **Email / SMS / push** : aucune lib (resend/twilio/web-push/fcm)
2. **UI cloche notifications in-app** (table se remplit, zéro composant front)
3. **Stripe / paiement abonnement auto** (3 plans existent, attribution 100% manuelle)
4. **Rate-limiting `placeOrder`** (COD public, anti-abus)
5. **Signatures webhooks + logs d'audit**
6. **Notif RFQ = PULL seulement** (`notifyMatchedSuppliers` n'envoie sur aucun canal)
7. **Worker cron escalade / alertes retard B2B**

---

## C. CHANTIER EN COURS — Variantes / Statuts / Scan

- ✅ **Lot A (étapes 1→5)** — **FAIT, MERGÉ (`3900b74`), EN PROD (mig 096-100)** : variantes + statuts ledger + projection + vue client + sélecteur + RPC variante-aware double-écriture + scan_events/record_scan. @security GO partout, @tester verts (26+19+18+58+46), 4 checks verts.
- ⏳ **Lot B (étapes 6-7)** — **TOUCHE L'ARGENT, circuit @finance + @security + Abdou** :
  - **Étape 6** (ÉLEVÉ) : `variant_id` sur `orders`/`wholesale_order_items`/panier ; les 3 canaux portent la variante + transitions de statut câblées (réservé/parti/livré/retour) ; `restore_stock` → staging `return_expected` (scanné, fin du restore instantané).
  - **Étape 7** (MAXIMAL) : bascule du compteur sur la variante (la variante devient source de vérité) ; couper `products.stock_count` une fois le nouveau prouvé.
- ⏳ **Dashboard patron stock** (ROADMAP §4bis) — **APRÈS Lot B** (sinon cartes vides) : 10 chiffres clés en cartes + alertes anti-fraude + vue par produit ; @security (prix de revient serveur) + @finance (cartes argent).

---

## D. VISIONS GRAVÉES À CONSTRUIRE (exhaustif)

**Stock / WMS**
1. **Stock 2 origines** — fournisseur multi-modes (API/manuel/Telegram/hebdo) + `stock_quantity_updated_at` + fraîcheur + « dispo réel » pondéré *(parallélisable dès maintenant)*
2. **WMS-2 — Egrow / ecom perso câblé** (décrémenter stock central depuis ventes Egrow ; canal `ecom_perso` provisionné non câblé)
3. **WMS-3 — Scan anti-fraude multi-transporteur** (scan chaque maillon, écart reçu vs facturé, scan unique)
4. **WMS-4 — Réconciliation argent** (théorique vs réel par fournisseur ET transporteur, audit immuable) — *attend formats fichiers transporteurs + export Egrow*
5. **WMS-5 — Dossier commande gros audité + QR protégé** (@finance + @security)
6. **Dashboard patron stock** (10 chiffres clés) — cf. C
7. **Stock multi-entrepôt par pays** (+ sourcing 2 lignes, courier API, DDP auto)

**IA / Gardien**
8. **Gardien IA — 3 pouvoirs** : (1) suppléance/calculs exacts, (2) détecter+tracer horodaté, (3) **bloquer la fraude AVANT** + notif admin perso (socle anomalies posé en WMS-1 ; seuils 20/10 à affiner)
9. **Traduction IA contenu produit** (nom+desc AR/EN à l'approbation)
10. **Bot Telegram conversationnel** (relance fournisseur si info manque, darija/vocal)
11. **Saisie paliers fournisseur via Telegram** *(PRIORITÉ, @finance)*
12. **Import multi-produits** : album `media_group_id`, `.xlsx` parsé, IA sur le bulk, extraction catalogue PDF

**Commandes / canaux**
13. **Parcours affilié complet** : saisie commande **avec variante** (dépend Lot B)
14. **Commande directe SANS lien d'affiliation** (saisie manuelle + import Sheet/CSV)
15. **Précommande usine** (jamais bloquer)
16. **Marketplace affiliation multi-partenaires** (cœur financier 3-4 parties)
17. **VIS-CANAL** : visibilité produit par canal (matrice produit × canal × abonnement, exclusivité, premium)
18. **Facturation à la sous-unité** (« à la boîte »)
19. **EXPORT-VISION** : vitrine Maroc + hubs monde, prix export = grossiste, détection pays acheteur

**Monétisation fournisseur**
20. **Stripe** (encaissement + abonnement auto + checkout)
21. **PREMIUM-DIRECT** : accès direct fournisseur (~10 000 DH/mois)
22. **Refonte parcours fournisseur** (ajout produit sans saisie, IA)

**Fidélité / créatives**
23. **Fidélité grossiste** par paliers + points pondérés marge (Bronze/Argent/Or/Platine → Omra/billet)
24. **Galerie créatives** + **studio créatives IA payant** (crédits, n8n/Remotion/Higgsfield) ; demande contenu par affiliés

**Logistique / infra / notif**
25. **Personnalisation grossiste intelligente avancée** (niveau 1 fait ; filtre par niche + « mes niches »)
26. **Cycle commission COD anti-fraude** (encaissement réel)
27. **Alertes retard transporteur B2B** + worker cron + escalade hiérarchique auto
28. **Cloche notifications UI** in-app
29. **Email / SMS / push** (infra notif réelle)
30. **OTP WhatsApp/SMS** inscription par téléphone
31. **Relevés/rapports partenaires PDF + QR de vérification**
32. **Choix code-barres vs QR** (au moment du WMS)
33. **Sourcing par upload photo** ; **affichage par secteur** ; **comptes fournisseurs via bot WhatsApp/Telegram**
34. **Nouveau secteur grossistes locaux Maroc** (B2B local)
35. **EXPORT-VISION** (cf. 19) ; nom de domaine perso ; optimisation `next/image` (différée)

---

## E. CHEMIN VERS LA BETA FERMÉE

### 🔴 BLOQUANT (à finir avant ouverture)
1. **Lot B (étapes 6-7)** — les commandes portent la variante + bascule compteur (sinon le stock par variante n'est pas réellement opérationnel sur les ventes).
2. **Stock fournisseur multi-modes + fraîcheur** — **6 fournisseurs en ont besoin** (déclaration multi-canaux).
3. **Nettoyage sécurité** — toutes les dettes 🔴 de la section B (rotations clés/MDP, suppression comptes test, abonnement test, redirect URLs, backup frais, tests reset MDP/pending).

### 🟢 NON BLOQUANT (peut venir après ouverture)
- Tout le reste de la section D (WMS-2..5, Gardien IA, Stripe, fidélité, créatives, dashboard patron, traduction IA, import CSV avancé, alertes B2B, cloche notif, etc.) — sauf ce qui devient bloquant par décision Abdou.

---

## F. ORDRE D'EXÉCUTION RECOMMANDÉ

> Estimations en « charge » indicative (S = session de travail ~focalisée), à affiner. Tout ce qui touche l'argent = circuit @finance + @security + Abdou.

1. **Lot B — Étape 6 : commandes 3 canaux portent la variante**
   - *Objet* : `variant_id` sur `orders`/`wholesale_order_items`/`wholesale_cart_items` ; sélecteur câblé à la soumission ; `confirm_cod_order`/FSM/`updateOrderStatus` passent `p_variant_id` ; transitions statut (réservé/parti/livré) ; `restore_stock` → `return_expected`.
   - *Dépend de* : Lot A (fait). *Audit* : **@finance + @security + Abdou**. *Risque* : **ÉLEVÉ** (lignes commande + décrément + staging retour). *Charge* : ~2-3 S.
2. **Lot B — Étape 7 : bascule du compteur sur la variante**
   - *Objet* : variante = source de vérité ; double-écriture maintenue puis `products.stock_count` déprécié ; migrer les lecteurs.
   - *Dépend de* : Étape 6 prouvée. *Audit* : **@finance + @security + Abdou**. *Risque* : **MAXIMAL**. *Charge* : ~2 S.
3. **Stock fournisseur multi-modes + fraîcheur**
   - *Objet* : `stock_mode` (api/manuel/telegram/hebdo) + `stock_quantity_updated_at` + lien variante + « dispo réel » pondéré + signal « à confirmer ».
   - *Dépend de* : Lot A (fait) — parallélisable avec Lot B. *Audit* : @security (RLS) ; @finance si prix touché (à éviter). *Risque* : Moyen. *Charge* : ~2 S.
4. **Nettoyage sécurité (dettes 🔴)**
   - *Objet* : rotations (service_role, secret key, ngrok, MDP admin), suppression comptes/abonnement test, redirect URLs, backup frais, tests reset MDP/pending.
   - *Dépend de* : rien (peut se faire en parallèle). *Audit* : @security. *Risque* : opérationnel (manipulations prod par Abdou). *Charge* : ~1 S.
5. **🚀 OUVERTURE BETA FERMÉE** (jalon — après 1-4).
6. **Dashboard patron stock** (ROADMAP §4bis)
   - *Dépend de* : Lot B (statuts sur commandes). *Audit* : @security + @finance (cartes argent). *Risque* : Faible-Moyen. *Charge* : ~2 S.
7. **WMS-2 — Egrow / ecom perso câblé**
   - *Dépend de* : Lot B + cadrage Egrow (API/webhook/export). *Audit* : @finance + @security. *Risque* : Moyen (dépend Egrow). *Charge* : ~2-3 S.
8. **WMS-3 — Scan anti-fraude multi-transporteur** (étend `scan_events`)
   - *Dépend de* : Lot A scan (fait). *Audit* : @security. *Risque* : Moyen. *Charge* : ~2 S.
9. **WMS-4 — Réconciliation argent transporteur**
   - *Dépend de* : **vrais formats fichiers transporteurs + export Egrow** (REPORTÉ tant qu'absents). *Audit* : @finance + @security + Abdou. *Risque* : Élevé. *Charge* : ~3 S.
10. **Gardien IA (3 pouvoirs)**
    - *Dépend de* : volets produisant événements tracés (WMS, finance). *Audit* : @finance + @security. *Risque* : Élevé. *Charge* : ~3+ S.
11. **RESTE** (priorité à arbitrer Abdou) : Stripe + premium fournisseur, fidélité grossiste, traduction IA, import CSV avancé, bot Telegram conversationnel, cloche notif + email/SMS/push, alertes retard B2B, multi-entrepôt, commande directe sans lien, WMS-5 QR, export-vision, etc.

---

## G. RÈGLES DE TRAVAIL (rappel CLAUDE.md)

- **CARTO avant build** (de bout en bout, ne jamais reconstruire/doublonner) ; **lots petits** (≤ 3-4 pages) ; **plan validé** avant écriture.
- **Branche dédiée** ; **STOP avant merge/push** → **GO explicite Abdou**.
- **ARGENT** : `numeric`/entiers, jamais de float ; idempotence + ledger append-only ; circuit **@finance + @security + Abdou** avant commit.
- **@security** sur tout sensible (RLS deny-default, secrets, écritures serveur + zod).
- **@tester en LOCAL uniquement** (`127.0.0.1:54321`, `assertLocalSupabase`), **JAMAIS la prod** (incident 2026-06-24, règle #8).
- **i18n FR/AR/EN + RTL** sur tout texte ; jamais de texte en dur ; **jamais de fonction passée à un Client Component** (régression `stockAvailable`).
- **DOUBLE-ÉCRITURE** pour toute migration de stock.
- **4 checks verts** avant commit (tsc 0 / build / vitest / smoke) ; **migration appliquée par lot** ; **traçabilité** dans les registres.

---

## H. DÉCISIONS DU BLOC H — tranché par Abdou (2026-06-24)

1. **H1 — Retour scanné** : ✅ **VALIDÉ.** Annulation → `return_expected` ; le stock ne redevient vendable qu'au **scan** (fin du restore instantané). À implémenter en Lot B Étape 6.
2. **H2 — Étape 7 source de vérité** : ✅ **VALIDÉ.** Variante = source de vérité ; `products.stock_count` déprécié quand le nouveau est prouvé ; double-écriture maintenue pendant la transition.
3. **H3 — Réconciliation argent transporteur** : ✅ **REPORTÉE** (attend formats fichiers transporteurs + export Egrow).
4. **H4 — Sémantique `sell_price`** : ⏳ **EN ANALYSE (décision Abdou en attente).** Le code traite **DÉJÀ** `sell_price` comme le prix de l'**unité-de-vente facturée** : `total = sell_price × quantité` (`orders.ts:163/638/763`), commission par unité-de-vente (`016`), `sale_unit`/`pack_size` = **affichage pur** (`pack_size` sert à AFFICHER un prix/sous-unité dérivé `÷`, jamais à facturer). **Option A** (recommandée) = garder l'unité-de-vente, satisfaire la DÉCISION 1 purement à l'affichage (zéro impact calcul). **Option B** (facturer à la sous-unité) = changement financier + recalibration du catalogue → circuit @finance + @security + Abdou. **→ Abdou tranche A vs B.**
5. **H5 — `affiliate_enabled` DEFAULT** : ✅ **TRANCHÉ → `DEFAULT false` (fail-closed).** Migration additive. *(nouvelle action)*
6. **H6 — marge=0 affilié** : ✅ **TRANCHÉ → corriger en marge>0 STRICT.** Migration de cohérence + audit @finance. *(nouvelle action — financier)*
7. **H7 — TVA refacturation** : ✅ **HORS PÉRIMÈTRE beta fermée** (validation comptable plus tard).
8. **H8 — Destinataires notifications** : ✅ **REPORTÉ** au chantier « cloche notif + email/SMS ».
9. **H9 — Transport devisé non refacturé** : ✅ **TRANCHÉ → REFACTURÉ au client** (à câbler proprement, `convertQuoteToOrder`). *(nouvelle action — financier)*
10. **H10 — Migration 072** : ✅ **RÉSOLU → EN PROD** (confirmé `supabase migration list` : Local 072 | Remote 072). Statut désormais sans ambiguïté.
11. **H11 — « 6 fournisseurs »** : ✅ **CONFIRMÉ par Abdou** — 6 fournisseurs prêts hors système, arrivent dès la beta ouverte. **Besoin multi-modes RÉEL** → confirme « stock fournisseur multi-modes » comme **bloquant beta** (section E).
12. **H12 — Relecture AR native** : ✅ **TRANCHÉ → OPTIONNELLE pour beta fermée, OBLIGATOIRE pour ouverture publique.**
13. **H13 — Branches non mergées restantes** : ⏳ **DÉCISION ABDOU EN ATTENTE** (contenu fourni) :
    - `chore/ai-operating-contract` (1 commit) — contrat opérationnel IA + safety gates (`.claude/settings.json` hooks) ; reste = captures `.nav-proofs`. *Intérêt : éventuels garde-fous hooks.*
    - `chore/project-skills` (2 commits) — 6 skills projet (`.claude/skills/` : finance-cod-payout, marketplace-ux-review, qa-backlog-executor, release-readiness, security-rls-review, supabase-migration-safety). *Intérêt : skills réutilisables pour le workflow.*
    - `feat/dette-factory-cost-authenticated` (1 commit) — WIP **différé (option C)** ; surtout `.mobile-proofs` + `.env.example`. *Intérêt : faible (chantier volontairement différé).*
    **→ Abdou tranche garde / merge / supprime pour chacune.**

> **Nouvelles actions issues du bloc H** (à intégrer dans l'ordre d'exécution, section F) : **H5** (migration `affiliate_enabled DEFAULT false`), **H6** (migration marge>0 strict + audit @finance), **H9** (refacturation transport devisé, @finance). H4 et H13 en attente d'arbitrage Abdou.

---

*Fin du plan. Document de priorisation — relire à chaque début de session avec ROADMAP_MASTER.md.*
