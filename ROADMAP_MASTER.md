# ROADMAP_MASTER — Chantiers transverses (vision long terme)

> Document **maître** des grands chantiers transverses, découpés en lots pour **ne rien
> oublier**. Complète `FEUILLE_DE_ROUTE.md` (exécution court terme) et `ETAT_SYSTEME.md`
> (registre de vérité des features). **Rien ici n'est codé tant que le lot n'est pas pris
> en session dédiée.**
>
> Légende : ✅ Fait (en prod) · 🔄 En cours / partiel · ⬜ À faire / à cadrer.

---

## 🏬 CHANTIER — GESTION DÉPÔT & NOTIFICATIONS

> **Créé le 2026-06-29.** Découpé en **3 lots** (BETA → Traçabilité scans → Multi-dépôts).
> Issu de l'état des lieux 2026-06-29 (assignation + notifications + dépôt). Croisé avec
> `ETAT_SYSTEME.md`. **Rien n'est codé.** Tout ce qui touche l'argent/PII/RLS suit le
> circuit `@finance` + `@security-reviewer` + GO Abdou.

### 📌 Contexte métier (à garder en tête pour tous les lots)
- **Dépôt Casa** : **5 personnes polyvalentes**, rôles **interchangeables** (réception /
  emballage / envoi / confirmation tournent selon la charge du jour).
- **Dubaï bientôt** : un **2ᵉ dépôt** arrive → le modèle doit pouvoir devenir **multi-pays**
  (déclenche le LOT 3, pas avant).
- **Scans par téléphone** (pas de douchette dédiée au départ) : QR / code-barre lus depuis
  le mobile, **flexible n'importe où** dans le dépôt.
- **Notifs visibles façon Shopify / Deliveroo** : badge + liste, on voit tout de suite
  qu'une commande est tombée et qui la traite.

### 🧭 État des lieux qui motive ce chantier (constaté 2026-06-29, lecture seule)
- **COD affilié = AUCUNE notif** à la création (`orders.ts` `placeOrder`, zéro appel notif ;
  la table `notifications.order_id` ne pointe que sur `wholesale_orders`, jamais `orders`).
- **Cloche in-app non construite** : table `notifications` existe (mig `076`/`077`), mais
  **aucun composant UI** (badge + liste).
- **Assignation grossiste OK et réassignable** : `assignWholesaleOrder` (`orders.ts:1072`,
  RPC `assign_wholesale_order_atomic` mig `061`) écrit `agent_id`/`assigned_at` ; réassignation
  libre, tracée dans `wholesale_order_status_history`. **Assignation COD = inexistante**
  (`orders` n'a pas de champ responsable).
- **Permissions d'équipe granulaires existent déjà** : `team_members.permissions` (jsonb,
  mig `058`) + RPC `can_assign_orders` → **socle réutilisable** pour les casiers (Option A).
- **Responsable de dépôt par pays = n'existe pas** : seul un flag `countries.has_warehouse`
  (mig `050`), sans aucune personne rattachée. `agent_countries` (mig `078`) = **awareness
  notif uniquement**, pas une responsabilité.
- **Backup / remplaçant absence = n'existe pas** : pas de `is_active`/`backup_agent_id` sur
  `agent_countries` ; pas de réassignation en masse.

---

### 🟢 LOT 1 — BETA (essentiel) ⬜
> Objectif : qu'aucune commande COD ne passe inaperçue, et qu'on voie **qui traite quoi**
> en temps réel, façon Shopify. Réutilise l'existant au maximum (table `notifications`,
> `team_members.permissions`).

- ⬜ **Notif COD affilié sur 2 canaux** : **Telegram + in-app** à la création de commande COD
  (aujourd'hui le COD ne déclenche **aucune** notif). Réutiliser `telegramSendMessage`
  (`src/lib/telegram/client.ts`) + insert dans `notifications`. ⚠️ **PII** : payload sans
  données acheteur sensibles (suivre la règle existante `notifyOrderAssigned` : `ref`,
  `items[label, qty]`, `city`, `dueAt`) → **audit `@security-reviewer`**. Prévoir que
  `notifications.order_id` puisse référencer aussi `orders` (aujourd'hui wholesale-only).
- ⬜ **Cloche in-app 🔔 visible (modèle Shopify)** : badge compteur + liste déroulante +
  marquer-lu. La **table existe**, c'est **l'UI qui manque**. i18n FR/AR/EN + RTL obligatoires.
- ⬜ **Casiers de responsabilité (Option A — via `team_members.permissions`)** : cases à
  cocher **par compte personnel** du dépôt — **Réception / Emballage / Expédition /
  Confirmation / Supervision**. **Provisoires et réversibles** (on coche/décoche selon le
  jour). S'appuie sur le jsonb `team_members.permissions` **déjà en place** (pas de nouvelle
  table au LOT 1).
- ⬜ **« Qui traite quoi »** : chaque commande **affiche son responsable à l'instant T**,
  **réassignable en un clic**. Le socle réassignation grossiste existe déjà (`assignWholesaleOrder`) ;
  l'étendre à l'affichage + au COD.
- ⬜ **Destinataires de la cloche in-app (décision Abdou 2026-06-29)** :
  - **Admin (Abdou)** — tous pouvoirs, voit tout.
  - **Affiliés** — leurs **ventes / commissions** (leur propre activité uniquement).
  - **Personnel dépôt** — **leurs tâches** (selon les casiers cochés).
  - **PAS les grossistes externes** — n'existent pas encore (cf. chantier **MULTI-GROSSISTES**).
- ⬜ **Journal d'audit des actions super-admin (indispensable AVANT personnel à pouvoirs &
  grossistes externes)** : toute action admin de type **forcer / modifier / corriger /
  supprimer / backup** laisse une **trace automatique ineffaçable (append-only)** —
  **qui** (compte admin), **quand** (timestamp serveur), **quoi** (action + cible), et
  **ancienne valeur → nouvelle valeur**. Garde **serveur**, jamais d'UPDATE/DELETE sur le
  journal. Protection traçabilité : on ne donne pas de pouvoirs (personnel, futurs grossistes)
  sans piste d'audit. ⚠️ Touche données sensibles → **audit `@security-reviewer`**.

**Réutilise :** `notifications` (mig `076`/`077`), `team_members.permissions` (mig `058`),
`telegramSendMessage`, `assignWholesaleOrder` / `can_assign_orders`.
**Touche :** notif COD = **PII** + journal d'audit = sécurité → `@security-reviewer` avant commit.

---

### 🟠 LOT 2 — TRAÇABILITÉ SCANS (juste après la beta) ⬜
> Objectif : **sécurité anti-perte / anti-vol** — savoir **qui a fait quoi et quand**, de
> façon **ineffaçable**. S'inscrit dans la vision WMS déjà notée dans `FEUILLE_DE_ROUTE.md`
> (« WMS — Traçabilité stock par scan QR »), version **dépôt / personnes** ici.

- ⬜ **Scan par téléphone** (QR / code-barre), **flexible n'importe où** dans le dépôt (pas
  de poste fixe). Choix QR vs code-barre 1D : suivre la note `FEUILLE_DE_ROUTE.md` « Choix
  code-barres vs QR » (téléphone → QR probable).
- ⬜ **4 scans nominatifs + horodatés + ineffaçables (append-only)** :
  **réception → emballage → sortie/envoi → retour**. Table journal **append-only** (jamais
  d'UPDATE/DELETE), chaque ligne = qui (compte), quoi (étape), quand (timestamp serveur),
  quelle commande.
- ⬜ **Chaque action exige la capacité (casier) correspondante** : un scan « emballage »
  n'est accepté que si le compte a le **casier Emballage** coché (LOT 1). Garde **serveur**,
  jamais côté client.
- ⬜ **Objectif transverse** : traçabilité complète anti-perte/vol → croise la vision WMS
  (décrément stock par canal) à cadrer avec `@finance` au moment venu.

**Dépend de :** LOT 1 (casiers = capacités requises).
**Touche :** journal d'inventaire / stock → cadrage `@architect` + `@finance`.

---

### 🔵 LOT 3 — MULTI-DÉPÔTS & ABSENCE (quand Dubaï arrive) ⬜
> Objectif : passer de **1 dépôt (Casa)** à **N dépôts par pays**, et gérer les **absences**
> sans qu'une commande tombe dans un trou. **Ne s'ouvre que quand Dubaï est concret.**

- ⬜ **Concept dépôt / entrepôt avec responsable par pays** : **n'existe pas aujourd'hui**
  (seulement `countries.has_warehouse`, sans personne). À modéliser : table dépôts +
  pays + responsable(s), et brancher l'assignation / les notifs dessus.
- ⬜ **Push mobile App Store / Play Store (Firebase / APNs)** : quand **l'app mobile sera
  publiée**. Au LOT 1 on reste sur Telegram + cloche in-app ; le push natif vient avec l'app.
- ⬜ **Backup / remplaçant automatique en cas d'absence** (congé / maladie / départ) :
  aujourd'hui **rien** (`agent_countries` n'a ni `is_active` ni `backup_agent_id`). Prévoir
  un remplaçant qui prend la main automatiquement.
- ⬜ **Réassignation en masse** : transférer **tout le portefeuille** d'un agent absent vers
  un autre, en une opération (aujourd'hui : commande par commande, manuel).

**Dépend de :** LOT 1 (responsable/casiers) + LOT 2 (traçabilité).
**Déclencheur :** ouverture effective du **dépôt Dubaï** et/ou publication de l'app mobile.

---

---

## 🏪 CHANTIER — MULTI-GROSSISTES (vision proche, post-beta)

> **Créé le 2026-06-29 (décision Abdou).** **Rien n'est codé.** Chantier de **modèle de
> données / architecture**, pas une feature isolée → cadrage `@architect` + `@finance`
> (touche stock, marges, commissions) avant tout code.

### 📌 Constat aujourd'hui
- **Mono-grossiste = Abdou** : son stock, son dépôt, ses affiliés. Un seul propriétaire
  implicite de tout le catalogue / stock.

### 🎯 Évolution prévue
- **Plusieurs grossistes**, chacun avec **ses propres produits**, **son propre stock**,
  **son propre dépôt**, **ses propres affiliés** (ex. des amis d'Abdou qui ont leur stock).
- Chaque grossiste ne voit / ne gère **que son périmètre** (isolation stricte, même esprit
  anti-deals que l'isolation agents sourcing).

### 🧱 RÈGLE D'ARCHITECTURE — à appliquer DÈS LA BETA (mono-grossiste)
> **Critique pour ne pas réécrire plus tard.**
- **Même en mono-grossiste**, traiter **produits / stock / dépôt comme « appartenant à un
  grossiste »** (Abdou) **dès maintenant** : prévoir le **rattachement à un propriétaire
  grossiste** (ex. `wholesaler_id` / `owner_id`) sur les entités concernées, valorisé sur
  le compte d'Abdou par défaut.
- **NE PAS coder de raccourci** qui suppose **un seul grossiste en dur** (pas de « tout le
  stock = global », pas d'absence de propriétaire). L'ajout d'un grossiste externe doit être
  une **extension** (une ligne de plus), **pas une réécriture**.
- **Affiliés rattachés à leur grossiste** : prévoir dès la modélisation qu'un affilié dépend
  d'un grossiste (aujourd'hui tous → Abdou).

### 🔗 Liens avec les autres chantiers
- **Dépôt (LOT 3 Multi-dépôts)** : un dépôt appartiendra à un grossiste **dans un pays** →
  cohérent avec « responsable de dépôt par pays ». À concevoir **ensemble**.
- **Journal d'audit (LOT 1)** : prérequis avant d'ouvrir des pouvoirs à des grossistes externes.
- ⚠️ **ARGENT** : produits/stock par grossiste touchent marges & commissions → **circuit
  `@finance` + `@security-reviewer` obligatoire** avant tout code.

---

### 🔗 Fichiers de référence (état des lieux 2026-06-29)
| Sujet | Fichier / migration |
|---|---|
| Notifications (infra in-app) | `supabase/migrations/076_notifications.sql`, `077_notifications_unique_full.sql` |
| Notif assignation (modèle PII-safe) | `src/lib/notifications/order-assigned.ts` |
| Envoi Telegram | `src/lib/telegram/client.ts` (`telegramSendMessage`) |
| Création COD (zéro notif aujourd'hui) | `src/app/actions/orders.ts` (`placeOrder`) |
| Assignation grossiste (réassignable) | `src/app/actions/orders.ts:1072`, mig `061_atomic_wholesale_status_transition.sql` |
| Permissions d'équipe (casiers Option A) | `supabase/migrations/058_team_members_and_assignment.sql` |
| Awareness pays (≠ responsabilité) | `supabase/migrations/078_agent_countries.sql` |
| Flag dépôt par pays (sans responsable) | `supabase/migrations/050_country_currency_reference.sql` (`has_warehouse`) |
| Historique transitions (append-only) | `supabase/migrations/057_wholesale_order_lifecycle.sql` |
