# 🗺️ PLAN D'ACTION GLOBAL — MOZOUNA / ABDOU BABA (consolidé 2026-07-04)

> UN SEUL document de pilotage. Consolide : l'existant en prod (ne pas casser), les branches
> prêtes (à merger), les chantiers roadmap existants (WMS, Gardien, fidélité, créas payantes…),
> les 15 améliorations AM, le volet AGRO (7 items), les idées V1-V7.
> Logique : paliers de sortie marché. À chaque palier, une partie du SaaS SORT et rapporte,
> pendant que le palier suivant se construit derrière. Jamais tout bloqué en attendant tout.

> **🔍 AUDIT PLAN vs CODE RÉEL — 2026-07-06.** Chaque lot ⬜ a été vérifié contre le code réel (`src/`),
> les 116 migrations prod et git (5 agents Explore). Verdicts inscrits **inline** : ✅ = déjà fait (preuve
> fichier/migration) · 🟡 = fondations existantes + **RESTE** précisé — **NE PAS reconstruire l'existant** ·
> ⬜ = rien dans le code, vrai lot à coder. **Fausses dettes corrigées** (étaient ⬜, sont ✅ en prod) :
> **AM-2 nudge de palier**, **stats affilié trackées**, **C3 échantillons payants**.

## ⚖️ RÈGLES DE PILOTAGE (rappel, non négociables)
1. 🔒 Règles intouchables 2026-07-04 : thème, grille marketplace, textes validés, forme des paliers,
   acquis prod. Exception = AVANT/APRÈS + GO Abdou.
2. UN chantier lourd à la fois PAR domaine (un chantier argent + un chantier affichage peuvent
   avancer en parallèle ; jamais deux chantiers argent en même temps).
3. Tout ce qui touche l'argent : @finance + @security + GO Abdou. 4 checks verts. Tests LOCAL only.
4. Chaque palier se termine par un INCRÉMENT EXPLOITABLE (quelque chose sort vers le marché).
5. On MERGE l'existant prêt avant de builder du neuf (des semaines de travail dorment sur branches).

## 🟢 PALIER 0 — DÉJÀ EXPLOITABLE (en prod aujourd'hui, rien à builder)
Ingestion fournisseur Telegram 4 langues (BRIQUE 3 conversationnelle) · onboarding 1-clic ·
modération + éditeur paliers · auto-tiers (plancher 8%) · marketplace gros avec paliers ·
multi-devises · variantes/stock · devis international · parcours affilié COD (code) · notifications ·
audit log immuable · casiers dépôt · assignation COD · sécurité ops (A1 FAIT 2026-07-04 : clé rotée,
Pro+backups, migs propres, redirect OK).
→ Le canal FOURNISSEUR peut se remplir dès MAINTENANT (onboarder TR/AE, catalogue qui monte).

## 🌊 PALIER 1 — SORTIE MARCHÉ : LE GROS (J+7 à J+10)
> But : encaisser les premières commandes de gros. ~80 % existe déjà.

Bloc 1A — Verrouiller (séquentiel, cette semaine)
- ✅ A2 — Fix bug max_qty (surfacturation). ⚠️ ARGENT. FAIT 2026-07-04, mergé `main`. @finance 🟢 + @security 🟢. Diagnostic prod = 0 produit à risque.
- ✅ A3 — Test A→Z gros complet, calculs signés @finance. **Verdict GO** (2026-07-04). Chaîne gros prouvée bout-en-bout (auto-tiers → commande 4 quantités prix=facturé → COD affilié → devis international) ; preuve A2 en conditions réelles ; anti-régression verte.
- ✅ Audit RLS ciblé tables gros/fournisseur (périmètre réduit du futur B1 complet). **AUDIT FAIT 2026-07-05** (@security, 6 findings) **+ correctif fuites INTER-ACTEURS MERGÉ `main` `df8b1ce` + migration 115 APPLIQUÉE EN PROD 2026-07-05** (@finance🟢 @security🟢 @tester🟢 ; vérifié AVANT/APRÈS : 0 policy `wholesaler read` restante). **Fermé EN PROD** : C1/C2 (prix source USD fournisseur lisible par grossiste) + E2 (coût d'usine `products` → staff-only ; 091 déjà active). **✅ E1 + M1 FERMÉS (lot `fix/e1-m1-marge-propres-lignes`, mergé `main` `--no-ff` `a43491d`, 2026-07-06)** : E1 (acheteur voit marge sur SA commande via `wholesale_orders`) + M1 (fournisseur voit marge sur SA fiche via `supplier_products`) → SELECT base réservé staff + vues redacted owner (`wholesale_orders_buyer_read` existante / `supplier_products_owner_read` nouvelle, sans colonne de marge). Pattern mig 060/115. `submitWholesaleOrder` insert/rollback via service_role ; `getProductLimitStatus` garde self-only (IDOR fermé en bonus). @finance🟢 (0 calcul touché) @security🟢 (0 P0/P1). Test LOCAL 7/7, 4 checks verts (vitest 598). **✅ Migration 116 APPLIQUÉE EN PROD 2026-07-06** (pooler, transaction atomique, après push + déploiement Vercel — lockstep ; vérifié AVANT/APRÈS : branche `buyer_id` de `wholesale_orders: read` disparue, « supplier read own » → `admin read`, vue owner créée sans marge). **E1 + M1 FERMÉS EN PROD.** M2 (mutation paliers post-approbation, indicatif) → backlog. **Bloc 1A BOUCLÉ.**

Bloc 1B — Merger l'existant prêt — ✅ **FAIT & EN PROD** (resync 2026-07-06 : vérifié par git — chaque tip est ancêtre de `main` via son commit de merge, migrations dans l'arbre, `< 115` donc appliquées en prod. Le ⬜ précédent était une FAUSSE dette de doc.)
- ✅ MERGE WMS-1 stock central (mig 092-095 + variantes 096-099) → merge `40da1bd` + admin UI `d19513a`. Socle custody EN PROD.
- ✅ MERGE Vitrine grossiste intelligente (perso par niche, affichage pur 0 argent) → merge `1f7dd67`, resync `9c07146` « EN PROD ».
- ✅ MERGE Rôles 2 étages (superviseur de volet + tâches fines, non-financier ; mig 106-107) → merge `bc7e627`, resync `d8e0ab2` « EN PROD ».
- ✅ DÉCISION V5-bis stock multimodes (mig 104) → mergé `c3b7f07`, roadmap `83bca3f` « mergé prod ». Tranché & EN PROD.
- ℹ️ Branche `feat/etape7-7a-affichage-variante` = **OBSOLÈTE / superseded** (2 commits hors main mais Étape 7 déjà EN PROD via mig 105) → ne pas merger, candidate à suppression.

Bloc 1C — Ouverture
- ⬜ Onboarding fournisseurs réels TR/AE (Telegram, 1er test réel de l'ingestion). Délai humain.
- ✅ Niche déclarée à l'inscription grossiste (couche 1 perso — contenu servi, PAS la grille 🔒). **FAIT 2026-07-07** — mig 117 (`profiles.declared_niche` + trigger handle_new_user), champ `<select>` de catégories localisées au signup grossiste (facultatif, i18n FR/AR/EN, validé `isValidCategory`), fallback COLD-START dans la marketplace (niche = comportement ?? déclaration ; grille intouchée). Test intégration LOCAL 4/4. Mergé `main` `--no-ff`. **⚠️ Migration 117 = LOCAL seulement → à appliquer en PROD (lockstep après push+deploy).**
- ⬜ 🚀 LANCEMENT GROS Maroc : commandes directes paliers + devis international. Paiements
  virement/COD manuels (volume faible OK).

Quick win glissé dans le palier : ✅ **AM-2 NUDGE DE PALIER — FAIT + BLINDÉ** (`src/components/wholesale/add-to-cart-form.tsx:171` + clé i18n `addToCartNudge` fr/en/ar). « ajoute X → économise Z DH ». **✅ 2026-07-07 : logique extraite en helper pur `src/lib/wholesale/tier-nudge.ts` (comportement identique) + 11 tests unitaires** (unitsToNextTier/savingsPerUnit/nextTierReachable). Mergé `main` `--no-ff`.
Petit, gros effet panier moyen. Vérif @finance légère (affichage d'un calcul existant).

## 🔨 PALIER 2 — RÉTENTION GROS + SOCLE ARGENT (S+2 à S+5, pendant que le gros tourne)
> But : les grossistes du Palier 1 REVIENNENT (récurrence), et le moteur financier de
> l'affiliation se construit derrière, testé sur les vraies commandes gros.

Bloc 2A — Rétention & canal WhatsApp (affichage/notifs, risque faible)
- ⬜ AM-1 RÉASSORT 1-CLIC (« recommander ma dernière commande »).
- ⬜ AM-8 NOTIFICATIONS WHATSAPP grossistes/affiliés (WhatsApp Business API ; Telegram reste fournisseur). *(audit 2026-07-06 : seuls des liens de partage `wa.me` existent, aucune Business API — vrai lot à coder.)*
- ⬜ AM-3 RELANCE PANIER ABANDONNÉ WhatsApp (2h).
- ⬜ AM-4 WIN-BACK 30 jours (promo sur SA niche — s'appuie sur la table d'événements).
- ⬜ V5 ALERTE PRIX / LISTE DE SUIVI (prix baisse / promo / retour stock → WhatsApp).
- ✅ V3 FACTURE PDF conforme Maroc (ICE/RC déjà en profil grossiste). **FAIT 2026-07-07** — `src/lib/invoice/` (compute/config/pdf via **pdf-lib**) + route GET `/wholesale/orders/[id]/invoice` + bouton i18n. Invariant TTC facturé=`total_amount` (centimes entiers, 0 float). **@finance 🟢** (invariant testé) + **@security 🟢** (0 IDOR/fuite/service_role ; P1 WinAnsi U+202F/arabe corrigé). 16 tests. Mergé `main` `--no-ff`. **⚠️ Reste ops : renseigner env vendeur `INVOICE_SELLER_ICE/RC/IF` + `INVOICE_VAT_RATE` (défaut 20) dans Vercel avant vraies factures** (le code omet proprement les champs non renseignés).
- ⬜ AM-10 PWA installable (icône écran d'accueil).

Bloc 2B — Le cœur argent (séquentiel, ⚠️ chaque lot @finance + @security)
- 🟡 B1 — Audit RLS COMPLET (toutes tables × tous rôles, deny par défaut). Prérequis. **PARTIEL** (audit 2026-07-06) — EXISTE : RLS deny-par-défaut + vues redacted appliqués partout (migs 060/063-064/089-091/102/115/116 ; ~52 migs avec policies). RESTE : le document d'audit MATRICIEL consolidé (aujourd'hui = colmatage itératif de fuites, pas un audit exhaustif tables × rôles).
- ⬜ INFRA-1 — AUTOMATISATION DES MIGRATIONS DB (fin du copier-coller manuel). Problème constaté 2026-07-04 : l'historique de migrations local est DÉSYNCHRONISÉ de la prod (supabase db push veut rejouer 6 migrations 105-114 dont certaines déjà appliquées → dangereux). Tant que ce n'est pas nettoyé, chaque migration doit passer par le SQL Editor manuellement. OBJECTIF : (1) @backend-db + @security auditent l'état réel prod vs local (migration list + comparaison schéma), (2) réparer/marquer les migrations pour resynchroniser l'historique (supabase migration repair si besoin), (3) une fois aligné, mettre en place l'application des migrations en UNE commande sûre (db push avec dry-run préalable) OU migrations auto au déploiement Vercel. Résultat : Abdou n'a plus jamais à copier-coller de SQL à la main. ⚠️ touche la structure DB prod → @security + GO Abdou + backup avant chaque étape. À faire à tête reposée, PAS en fin de session.
- 🟡 B2 — GRAND LIVRE double entrée : comptes internes dont « cash en transit chez livreur X »,
  append-only, idempotent, somme=0, rapprochement nocturne + alertes. (= Phase 2 finance existante.) **PARTIEL** (audit 2026-07-06) — EXISTE : ledger payout append-only idempotent (mig 049), stock_movements (092), ledger_currency (052). RESTE : le vrai DOUBLE-ENTRÉE débit/crédit, contrainte somme=0, comptes internes, et le compte « cash en transit chez livreur ».
- 🟡 B3 — MACHINE À ÉTATS COMMISSIONS liée aux versements (règle N1 : « livré » ≠ « payable » ;
  disponible = bordereau livreur rapproché ligne à ligne). Écran affilié = NOUVEL écran, maquette validée. **PARTIEL** (audit 2026-07-06) — EXISTE : statuts commission pending/approved/paid + reversed (`database.ts`, mig 013, `updateCommissionStatus`). RESTE : l'état « payable » distinct de « livré » et le lien payable = bordereau livreur rapproché (aucun rapprochement bordereau).
- ⬜ N2 — MODULE LIVREURS : API Ozone + Cathedis (config déjà sur Egrow → récupérer clés/doc via
  contact WhatsApp), webhooks signés idempotents, RÉCONCILIATION BORDEREAUX (où l'argent se perdait),
  alertes créances, scoring livreur par société/ville. + Livreur local Casa : rôle « livreur » limité,
  gros boutons Livré/Retourné FR/darija, saisies signées.
- 🟡 WMS-2 (synchro Egrow canal ecom_perso) + WMS-3 (scans custody) + QR interne muet (identifiant
  opaque, données derrière autorisation, affichage par rôle) + étiquettes PDF QR+code128, scan caméra. **PARTIEL** (audit 2026-07-06) — EXISTE : `scan_events` (mig 100, append-only immuable = socle WMS-3). RESTE : synchro Egrow (0 occurrence), QR interne muet, étiquettes PDF code128, scanner caméra.
- ⬜ WMS-4 — RÉCONCILIATION GLOBALE temps réel (théorique vs réel, par fournisseur ET transporteur).
- 🟡 B7 — ANTI-FRAUDE v1 : score commande pré-expédition, taux de livraison par affilié + seuil de
  revue, anti auto-achat, multi-comptes, blocage modif prix post-approbation. **PARTIEL** (audit 2026-07-06) — EXISTE : `src/lib/order-analytics.ts` (`scoreDuplicateOrder`/`scoreSpamOrder`/`scoreFraudOrder` — ce dernier = placeholder). RESTE : taux de livraison par affilié, anti auto-achat, détection multi-comptes, blocage prix post-approbation.
- ⬜ B8 — Suppression compte RGPD (dette bloquante documentée).
- ⬜ Sous-lots stock (au lancement affiliation) AVEC AGRO-5 gravé dès le cadrage : DLC/DLUO par lot +
  FIFO strict + statut chaîne du froid dans la custody.

## 🌊 PALIER 3 — SORTIE MARCHÉ : L'AFFILIATION (S+5 à S+7)
> But : ouvrir l'affiliation sur un socle financier prouvé par les commandes gros réelles.

- ✅ Liens trackés + STATS TEMPS RÉEL branchées sur le ledger (solde par état, centime par centime). **DÉJÀ FAIT** (audit 2026-07-06) — `?ref=` + `recordAffiliateClick` → table `affiliate_clicks` ; dashboard affilié (`src/app/(affiliate)/affiliate/dashboard/page.tsx`) calcule clics/conversion/soldes pending-approved-paid depuis le ledger.
- ⬜ AM-15 SUB-IDs influenceurs (?sub=…) + volet INFLUENCEURS (codes promo nominatifs, dashboard dédié).
- ⬜ V1 BOUTIQUE WHATSAPP DE L'AFFILIÉ : mini-vitrine publique partageable en un lien.
- ⬜ Matériel marketing AUTO par produit (visuels + textes FR/AR/Darija) — version GRATUITE de base
  (la version payante à la carte = PB-4, Palier 5).
- ⬜ AM-14 LEADERBOARD + bonus de série affiliés. ⚠️ bonus = argent → @finance.
- ⬜ AM-7 PAGE TRANSPARENCE VERSEMENTS (délai moyen de paiement public, calculé du ledger).
- ⬜ 🚀 OUVERTURE AFFILIATION (règle N1 active, anti-fraude v1 actif).

En continu pendant le palier (petits lots indépendants) :
- ✅ C1a Unité de vente LIBRE par produit (champ libre réel + détection IA + confirmation fournisseur bot + affichage « prix / unité » 4 langues). Mergé `main` `75544f4`, migration 114 à appliquer en prod. ⬜ C1b (multi-unités carton+pièce) reporté.
- 🟡 C2 BRIQUE 2 — contrôle qualité photo IA à la réception (textes validés Abdou 🔒). **CODÉ 2026-07-07, EN ATTENTE VALIDATION WORDING** (branche `feat/c2-photo-quality-ai`, PAS mergé) — `photo_issue` ajouté à l'extraction Haiku (même appel, 0 coût) + `photo-quality.ts` (fail-open) + câblage `ingest.ts` : NON-PRODUIT → aucune fiche + guide ; FLOU → fiche créée + signal `blurry_photo` + revue admin + invitation photo nette. Messages bot 4 langues 🔒 **à valider par Abdou (capture RTL demandée)** avant merge. 9 tests. Pas de migration.
- ✅ C3 Échantillons payants (mini-commande qty 1). **DÉJÀ FAIT** (audit 2026-07-06) — flux complet : `wholesale/sample-requests` + `wholesale/samples`, côté fournisseur `supplier/samples`, table `sample_requests`.
- 🟡 C4 RFQ asynchrone via bot Telegram existant (chat intégré = plus tard, bouton WhatsApp en attendant). **PARTIEL** (audit 2026-07-06) — EXISTE : RFQ complet côté WEB (migs 023/034/037/043, `rfq-engine.ts`, pages wholesale + admin quote-requests). RESTE : le canal via BOT TELEGRAM (le webhook ne fait qu'ingestion produit).
- ⬜ PB-8 VRAI BAN FOURNISSEUR (masquage auto des produits d'un banni).

## 🥩 PALIER 4 — SORTIE MARCHÉ : VERTICAL AGRO + FIDÉLITÉ (S+7 à S+10)
> But : capturer la récurrence hebdo des snacks/viande/friterie/épiciers = le client 10x.
> ÉTEND le chantier fidélité existant (règles gravées : points ∝ marge, cadeau < marge générée,
> auto-financement, @finance cadre le RATIO AVANT tout code) + « Grossistes locaux Maroc ».

- ⬜ AGRO-1 PANIER RÉCURRENT « ma commande de la semaine » : liste sauvegardée → rappel hebdo
  WhatsApp « on prépare ? OUI / MODIFIER ». LE cœur du volet. (S'appuie sur AM-1 + AM-8 du Palier 2.)
- ⬜ V2 COMMANDE PAR NOTE VOCALE DARIJA : vocal → transcription IA (brique darija existante) →
  panier prêt → confirmation OUI. L'arme pour l'épicier qui ne tape pas.
- ⬜ AM-9 RECHERCHE VOCALE DARIJA : micro dans la barre de recherche → transcription IA (même brique
  darija que V2, à builder ensemble) → recherche produits. Feature que même Alibaba n'a pas.
- ⬜ AGRO-2 FIDÉLITÉ PAR STREAK : semaines consécutives = multiplicateur de points ; série cassée =
  multiplicateur perdu. Plafonné par la marge (règle gravée). ⚠️ @finance.
- ⬜ AGRO-3 CADEAUX-MÉTIER par palier : papier alu → bidon d'huile → friteuse pro → frigo vitrine
  (le cadeau augmente la capacité du client → il commande plus). Gros paliers : Omra/voyage (gravé).
- ⬜ AGRO-4 PARRAINAGE DE QUARTIER : points pour parrain + filleul à la 3e commande. Acquisition
  ~zéro coût + densité logistique par grappe géographique.
- ⬜ AGRO-7 DASHBOARD « PATRON DE SNACK » : acheté / économisé via paliers / points / barre vers le
  prochain cadeau (zone Fidélité du HUB déjà prévue).
- ⬜ AGRO-5 (suite) : promo flash AUTO avant péremption (DLC posée au Palier 2) ; commande par
  MONTANT (« remplis mon panier pour 2000 DH sur ma niche »).
- ⬜ AM-5 « PROTECTION ABDOU BABA » : centre de litiges structuré (photo → arbitrage → remboursement/
  avoir tracé + badge fiches). Équivalent Trade Assurance. ⚠️ ARGENT → @finance + @security.
- 🟡 AM-6 NOTES FOURNISSEURS post-livraison (conformité/délai/qualité) affichées sur fiche. **PARTIEL** (audit 2026-07-06) — EXISTE : journal d'incidents fournisseur INTERNE admin (`supplier_issues`, mig 033, `supplier-issues.ts`). RESTE : la NOTATION acheteur (conformité/délai/qualité) affichée sur la fiche.
- 🟡 V7 BADGE « USINE VÉRIFIÉE — visitée par Abdou Baba » (photo/date des visites TR/CN). Coût zéro. **PARTIEL** (audit 2026-07-06) — EXISTE : système de badges `is_verified`/`VerifiedBadge` (mig 040) mais = statut premium/vérifié marketplace. RESTE : le concept « usine VISITÉE par Abdou » (photo + date de visite).
- ⬜ V6 QR FOURNISSEUR mode foire/salon (scan stand → catalogue du fournisseur → inscription grossiste).
- 🟡 V4 MULTI-UTILISATEURS par compte grossiste (patron + employé, permissions — étend staff_permissions). **PARTIEL** (audit 2026-07-06) — EXISTE : `staff_permissions` (mig 083) + `team_members` (058) côté admin/plateforme. RESTE : l'extension côté COMPTE GROSSISTE (patron + employé, sous-comptes).

## 🧠 PALIER 5 — INTELLIGENCE + MONÉTISATION + COURONNEMENT (S+10 et au-delà)
> But : les revenus additionnels et l'IA qui pilote — sur des données réelles accumulées.

Monétisation (chantiers roadmap existants) :
- ⬜ PB-4 CRÉAS PAYANTES affilié/grossiste (visuels/vidéos marketing à la carte = revenu passif).
  ⚠️ ARGENT → @finance + @security. Stack à choisir par rentabilité.
- ⬜ PB-3 « MANNEQUIN » : photo fournisseur non-pro → régénérée portée/présentée par IA.
- 🟡 PB-9 CRUD PLANS ADMIN (créer/modifier plans premium sans SQL). **PARTIEL** (audit 2026-07-06) — EXISTE : table `premium_plans` (mig 038) + `assignPlan`/`getPremiumPlans`/`cancelSubscription` (`premium.ts`, l'ASSIGNATION est faite). RESTE : le CRUD des PLANS eux-mêmes (create/update/delete sans SQL).
- ⬜ PB-10 FACTURATION AUTO Stripe (abonnements récurrents, webhooks signés, downgrade auto impayé).
  ⚠️ GROS chantier ARGENT.
- ⬜ VIS-CANAL (visibilité produit par canal = premium) + PREMIUM-DIRECT (accès direct fournisseur
  ~10 000 DH/mois) — après ouverture publique, trio @architect+@finance+@security.

Intelligence (architecturée depuis le Palier 2 via la table d'événements) :
- ⬜ AM-11 PRIX INTELLIGENT fournisseur (fourchette marché à la soumission). ⚠️ @finance.
- ⬜ AM-12 PRÉVISION DE RÉASSORT (rupture dans N jours → alerte fournisseur).
- ⬜ AM-13 SCORE DE SANTÉ GROSSISTE (qui monte / qui décroche).
- 🟡 Personnalisation couches 2-3 (scoring comportemental complet + IA de recommandation). **PARTIEL** (audit 2026-07-06) — EXISTE : couche 1 (`detect-niche.ts`, scoring comportemental pondéré, AFFICHAGE seul). RESTE : couches 2-3 (scoring persisté + moteur reco IA) + la TABLE D'ÉVÉNEMENTS générique (prérequis, absente aujourd'hui).
- ⬜ AGRO-6 CRÉDIT COURT TERME 7/15 jours pour les fidèles, adossé ledger + AM-13.
  ⚠️ GROS chantier ARGENT + décision Abdou.
- ⬜ COCKPIT PERFORMANCE HUMAINE complet (KPI temps réel par employé sur scans + audit).
- 🟡 🏔️ GARDIEN IA — LE COURONNEMENT (3 pouvoirs : suppléance, calculs exacts, bloquer+tracer+alerter).
  Ordre gravé : rôles → WMS → Finance → Gardien. **SOCLE/PARTIEL** (audit 2026-07-06) — EXISTE : préfiguration (mig 095 `stock_anomalies` + seuils placeholder, mig 097 cohérence). RESTE : les 3 pouvoirs OPÉRATIONNELS (placeholders seulement aujourd'hui).

Reporté explicitement (ne pas builder avant) : chat négociation intégré (WhatsApp en attendant) ·
PayTabs Dubaï international · sous-affiliés · inscription 100 % Telegram (Option B) · douchettes
physiques.

## 🔗 DÉPENDANCES CLÉS
- Affiliation (P3) EXIGE ledger+B3+livreurs+anti-fraude (P2) → sinon argent perdu.
- AGRO fidélité (P4) EXIGE le moteur points/marge cadré @finance + AM-1/AM-8 (P2) + panier récurrent.
- AGRO-5 DLC/FIFO/froid se grave DANS le cadrage des sous-lots stock (P2) — sinon on reconstruit.
- Intelligence (P5) EXIGE la table d'événements posée dès P1-P2.
- Gardien IA en DERNIER (ordre gravé) : il consomme les événements de tous les autres.
- Accès API Ozone/Cathedis : externes → demander MAINTENANT (WhatsApp), config Egrow à rassembler.

## 📌 PARALLÉLISME AUTORISÉ
- P1 gros SORT pendant que P2 argent SE CONSTRUIT (backend sous l'UI, règles 🔒).
- Bloc 2A (rétention/notifs) avance EN PARALLÈLE du Bloc 2B (argent) — domaines différents.
- Les petits lots C1-C4 + PB-8 se glissent entre les gros lots.
- JAMAIS deux chantiers argent en parallèle. JAMAIS de merge sans GO Abdou.
