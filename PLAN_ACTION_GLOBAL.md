# 🗺️ PLAN D'ACTION GLOBAL — MOZOUNA / ABDOU BABA (consolidé 2026-07-04)

> UN SEUL document de pilotage. Consolide : l'existant en prod (ne pas casser), les branches
> prêtes (à merger), les chantiers roadmap existants (WMS, Gardien, fidélité, créas payantes…),
> les 15 améliorations AM, le volet AGRO (7 items), les idées V1-V7.
> Logique : paliers de sortie marché. À chaque palier, une partie du SaaS SORT et rapporte,
> pendant que le palier suivant se construit derrière. Jamais tout bloqué en attendant tout.

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
- ⬜ A2 — Fix bug max_qty (surfacturation). ⚠️ ARGENT.
- ⬜ A3 — Test A→Z gros complet, calculs signés @finance. Verdict GO/NO-GO.
- ⬜ Audit RLS ciblé tables gros/fournisseur (périmètre réduit du futur B1 complet).

Bloc 1B — Merger l'existant prêt (décisions Abdou, une branche à la fois)
- ⬜ MERGE WMS-1 stock central (mig 092-095, GO ×2 déjà obtenus) → socle custody. Candidat n°1.
- ⬜ MERGE Vitrine grossiste intelligente (perso par niche comportementale, @security GO).
- ⬜ MERGE Rôles 2 étages (base du futur rôle « livreur » + permissions employés).
- ⬜ DÉCISION V5-bis stock multimodes (mig 104 déjà prod).

Bloc 1C — Ouverture
- ⬜ Onboarding fournisseurs réels TR/AE (Telegram, 1er test réel de l'ingestion). Délai humain.
- ⬜ Niche déclarée à l'inscription grossiste (couche 1 perso — contenu servi, PAS la grille 🔒).
- ⬜ 🚀 LANCEMENT GROS Maroc : commandes directes paliers + devis international. Paiements
  virement/COD manuels (volume faible OK).

Quick win glissé dans le palier : ⬜ AM-2 NUDGE DE PALIER au panier (« ajoute X → économise Z DH »).
Petit, gros effet panier moyen. Vérif @finance légère (affichage d'un calcul existant).

## 🔨 PALIER 2 — RÉTENTION GROS + SOCLE ARGENT (S+2 à S+5, pendant que le gros tourne)
> But : les grossistes du Palier 1 REVIENNENT (récurrence), et le moteur financier de
> l'affiliation se construit derrière, testé sur les vraies commandes gros.

Bloc 2A — Rétention & canal WhatsApp (affichage/notifs, risque faible)
- ⬜ AM-1 RÉASSORT 1-CLIC (« recommander ma dernière commande »).
- ⬜ AM-8 NOTIFICATIONS WHATSAPP grossistes/affiliés (WhatsApp Business API ; Telegram reste fournisseur).
- ⬜ AM-3 RELANCE PANIER ABANDONNÉ WhatsApp (2h).
- ⬜ AM-4 WIN-BACK 30 jours (promo sur SA niche — s'appuie sur la table d'événements).
- ⬜ V5 ALERTE PRIX / LISTE DE SUIVI (prix baisse / promo / retour stock → WhatsApp).
- ⬜ V3 FACTURE PDF AUTO conforme Maroc (ICE/RC déjà en profil grossiste).
- ⬜ AM-10 PWA installable (icône écran d'accueil).

Bloc 2B — Le cœur argent (séquentiel, ⚠️ chaque lot @finance + @security)
- ⬜ B1 — Audit RLS COMPLET (toutes tables × tous rôles, deny par défaut). Prérequis.
- ⬜ B2 — GRAND LIVRE double entrée : comptes internes dont « cash en transit chez livreur X »,
  append-only, idempotent, somme=0, rapprochement nocturne + alertes. (= Phase 2 finance existante.)
- ⬜ B3 — MACHINE À ÉTATS COMMISSIONS liée aux versements (règle N1 : « livré » ≠ « payable » ;
  disponible = bordereau livreur rapproché ligne à ligne). Écran affilié = NOUVEL écran, maquette validée.
- ⬜ N2 — MODULE LIVREURS : API Ozone + Cathedis (config déjà sur Egrow → récupérer clés/doc via
  contact WhatsApp), webhooks signés idempotents, RÉCONCILIATION BORDEREAUX (où l'argent se perdait),
  alertes créances, scoring livreur par société/ville. + Livreur local Casa : rôle « livreur » limité,
  gros boutons Livré/Retourné FR/darija, saisies signées.
- ⬜ WMS-2 (synchro Egrow canal ecom_perso) + WMS-3 (scans custody) + QR interne muet (identifiant
  opaque, données derrière autorisation, affichage par rôle) + étiquettes PDF QR+code128, scan caméra.
- ⬜ WMS-4 — RÉCONCILIATION GLOBALE temps réel (théorique vs réel, par fournisseur ET transporteur).
- ⬜ B7 — ANTI-FRAUDE v1 : score commande pré-expédition, taux de livraison par affilié + seuil de
  revue, anti auto-achat, multi-comptes, blocage modif prix post-approbation.
- ⬜ B8 — Suppression compte RGPD (dette bloquante documentée).
- ⬜ Sous-lots stock (au lancement affiliation) AVEC AGRO-5 gravé dès le cadrage : DLC/DLUO par lot +
  FIFO strict + statut chaîne du froid dans la custody.

## 🌊 PALIER 3 — SORTIE MARCHÉ : L'AFFILIATION (S+5 à S+7)
> But : ouvrir l'affiliation sur un socle financier prouvé par les commandes gros réelles.

- ⬜ Liens trackés + STATS TEMPS RÉEL branchées sur le ledger (solde par état, centime par centime).
- ⬜ AM-15 SUB-IDs influenceurs (?sub=…) + volet INFLUENCEURS (codes promo nominatifs, dashboard dédié).
- ⬜ V1 BOUTIQUE WHATSAPP DE L'AFFILIÉ : mini-vitrine publique partageable en un lien.
- ⬜ Matériel marketing AUTO par produit (visuels + textes FR/AR/Darija) — version GRATUITE de base
  (la version payante à la carte = PB-4, Palier 5).
- ⬜ AM-14 LEADERBOARD + bonus de série affiliés. ⚠️ bonus = argent → @finance.
- ⬜ AM-7 PAGE TRANSPARENCE VERSEMENTS (délai moyen de paiement public, calculé du ledger).
- ⬜ 🚀 OUVERTURE AFFILIATION (règle N1 active, anti-fraude v1 actif).

En continu pendant le palier (petits lots indépendants) :
- ⬜ C1 Unités universelles (champ libre + phase conversationnelle 'detail').
- ⬜ C2 BRIQUE 2 — contrôle qualité photo IA à la réception (textes validés Abdou 🔒).
- ⬜ C3 Échantillons payants (mini-commande qty 1).
- ⬜ C4 RFQ asynchrone via bot Telegram existant (chat intégré = plus tard, bouton WhatsApp en attendant).
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
- ⬜ AM-6 NOTES FOURNISSEURS post-livraison (conformité/délai/qualité) affichées sur fiche.
- ⬜ V7 BADGE « USINE VÉRIFIÉE — visitée par Abdou Baba » (photo/date des visites TR/CN). Coût zéro.
- ⬜ V6 QR FOURNISSEUR mode foire/salon (scan stand → catalogue du fournisseur → inscription grossiste).
- ⬜ V4 MULTI-UTILISATEURS par compte grossiste (patron + employé, permissions — étend staff_permissions).

## 🧠 PALIER 5 — INTELLIGENCE + MONÉTISATION + COURONNEMENT (S+10 et au-delà)
> But : les revenus additionnels et l'IA qui pilote — sur des données réelles accumulées.

Monétisation (chantiers roadmap existants) :
- ⬜ PB-4 CRÉAS PAYANTES affilié/grossiste (visuels/vidéos marketing à la carte = revenu passif).
  ⚠️ ARGENT → @finance + @security. Stack à choisir par rentabilité.
- ⬜ PB-3 « MANNEQUIN » : photo fournisseur non-pro → régénérée portée/présentée par IA.
- ⬜ PB-9 CRUD PLANS ADMIN (créer/modifier plans premium sans SQL).
- ⬜ PB-10 FACTURATION AUTO Stripe (abonnements récurrents, webhooks signés, downgrade auto impayé).
  ⚠️ GROS chantier ARGENT.
- ⬜ VIS-CANAL (visibilité produit par canal = premium) + PREMIUM-DIRECT (accès direct fournisseur
  ~10 000 DH/mois) — après ouverture publique, trio @architect+@finance+@security.

Intelligence (architecturée depuis le Palier 2 via la table d'événements) :
- ⬜ AM-11 PRIX INTELLIGENT fournisseur (fourchette marché à la soumission). ⚠️ @finance.
- ⬜ AM-12 PRÉVISION DE RÉASSORT (rupture dans N jours → alerte fournisseur).
- ⬜ AM-13 SCORE DE SANTÉ GROSSISTE (qui monte / qui décroche).
- ⬜ Personnalisation couches 2-3 (scoring comportemental complet + IA de recommandation).
- ⬜ AGRO-6 CRÉDIT COURT TERME 7/15 jours pour les fidèles, adossé ledger + AM-13.
  ⚠️ GROS chantier ARGENT + décision Abdou.
- ⬜ COCKPIT PERFORMANCE HUMAINE complet (KPI temps réel par employé sur scans + audit).
- ⬜ 🏔️ GARDIEN IA — LE COURONNEMENT (3 pouvoirs : suppléance, calculs exacts, bloquer+tracer+alerter).
  Ordre gravé : rôles → WMS → Finance → Gardien.

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
