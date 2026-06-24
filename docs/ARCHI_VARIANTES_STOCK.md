<!--
  Document d'architecture — LOT 0 (cartographie lecture seule).
  Auteur : @architect (Opus), orchestré par Claude Code. Date : 2026-06-24.
  Statut : RAPPORT DE CARTOGRAPHIE — découpage en sous-lots À VALIDER PAR ABDOU avant tout build.
  Aucun code écrit. Aucune branche créée. Ce fichier est de la documentation pure.

  CORRECTION FACTUELLE (orchestrateur) : le rapport mentionne par endroits WMS-1 (migrations
  092-095) comme étant « sur la branche non mergée feat/wms-1-stock-central ». C'EST PÉRIMÉ.
  WMS-1 a été MERGÉ sur main (merge 40da1bd) et les migrations 092→095 sont APPLIQUÉES EN PROD
  (confirmé par Abdou le 2026-06-24). Le reste du rapport (chemins, lignes, schéma) reste valide.
  → Le sous-lot V0 peut donc s'appuyer sur WMS-1 en prod sans réserve d'application.
-->

# ARCHI — VARIANTES PRODUIT & DOUBLE ORIGINE DE STOCK

Document d'architecture (lecture seule). Aucun fichier de code modifié. Cible : introduire des variantes à attributs flexibles avec stock porté par la variante, et deux origines de stock (propre + fournisseur). Périmètre financier (prix/commission/marge/paliers) NON touché.

## Synthèse exécutive

1. **Aucun embryon de variante n'existe.** Recherche exhaustive (`variant`, `sku`, `attribute`, `size`, `color`, `taille`, `couleur`, `pointure`, `option_value`, `product_option`) : zéro table, zéro colonne, zéro champ UI. Les fichiers remontés sont des faux positifs (« SKU » au sens « produit catalogue » dans des commentaires ; `color` en CSS ; `option` au sens `<option>` HTML). Le terrain est vierge — avantage : on construit sans déconstruire.

2. **Le stock vit sur `products.stock_count` (integer)**, défini en `001_initial_schema.sql:35`. Le CHECK `>= 0` a été **supprimé** par WMS-1 (`093_option_a_never_refuse_stock.sql:42`) → le solde peut être négatif (Option A). Tout le ledger WMS-1 (`stock_movements`, `stock_anomalies`) et les RPC (`reserve_stock`, `restore_stock`, `adjust_stock_manual`, `record_stock_movement`, `record_anomaly`) référencent **`product_id`** en dur. Porter le stock à la variante impose de propager `variant_id` à travers cette chaîne, sans casser les produits simples.

3. **Le stock fournisseur est un snapshot figé : `supplier_products.stock_quantity`** (integer, `CHECK >= 0`, `035_supplier_catalog_bulk.sql:10`). Sa seule trace de fraîcheur est `supplier_products.updated_at` (générique). Le miroir (`src/lib/supplier-mirror.ts:134`) copie `stock_quantity ?? 0` vers `products.stock_count` à l'approbation, **puis ne le redécrémente jamais**. Il manque tout : modèle multi-modes (API/manuel/Telegram/hebdo), horodatage de fraîcheur dédié, et lien variante.

4. **Les lignes de commande ne portent que `product_id`** : `orders.product_id` (commande mono-produit, `001:46`) et `wholesale_order_items.product_id` (`001:99`), avec leurs snapshots de prix. Aucun `variant_id`. C'est le point d'injection obligatoire pour que le décrément frappe la bonne variante.

5. **Le « dispo » affiché est purement `stock_count`** (page publique `src/app/products/[id]/page.tsx:84`, page affilié `affiliate/products/[id]/page.tsx:189-191`). Aucune logique de pondération par origine ni de signal « à confirmer ». À construire.

6. **L'affilié fait DEUX choses** : il partage un lien d'attribution (`?ref=<user.id>`, `affiliate/products/[id]/page.tsx:134`) ET il saisit lui-même des commandes COD (`createAffiliateOrder`, `src/app/actions/orders.ts:270`). Le « trou » n'est pas dans le parcours affilié mais dans le **choix de variante** : ni le lien, ni le formulaire, ni le COD public ne savent qu'une variante existe.

7. **Le canal `ecom_perso` est provisionné mais non câblé.** Il existe comme valeur de `channel` dans `stock_movements` (`092:33`) et comme branche dans `confirm_cod_order` (`affiliate_id IS NULL → 'ecom_perso'`, `093:296`) et `updateOrderStatus` (`orders.ts:547`). Mais aucune surface Egrow ne crée de commandes ecom_perso distinctes — c'est WMS-2, non branché.

8. **Risque dominant : prod vivante + ledger append-only + finance intacte.** Stratégie sûre = **expand-then-contract** avec **variante « défaut » rétro-remplie** pour chaque produit existant, **RPC à signature étendue rétro-compatible** (`variant_id` optionnel, défaut = variante par défaut), et **aucune migration de données financières**. Le découpage va du socle additif (zéro risque) au basculement du décrément sur la variante (risque maximal, audit `@finance` + `@security`).

---

## 1. PRODUITS — structure réelle & recherche d'embryon de variante

### Structure de `products`

Table créée en `supabase/migrations/001_initial_schema.sql:27-40`. Colonnes pertinentes :

- `id uuid PK` (`001:28`)
- `name text NOT NULL` (`001:29`)
- `sell_price numeric(10,2)` — **FINANCE, NE PAS TOUCHER** (`001:31`)
- `commission_amount numeric(10,2)` — FINANCE (`001:32`)
- `wholesale_tiers jsonb` — paliers grossiste, FINANCE (`001:33`)
- `wholesale_min_qty integer` (`001:34`)
- `stock_count integer NOT NULL DEFAULT 0` — **le stock vit ici** (`001:35`). `CHECK (stock_count >= 0)` **DROP** en `093:42-43`.
- `images text[]`, `type`, `active`, `created_at` (`001:36-39`)

Ajouts ultérieurs pertinents : `availability_type ('local_stock'|'import_on_demand')` (`007`), `affiliate_enabled boolean` (`007`), `factory_cost_mad` (FINANCE, `016`), `platform_margin_type/value` (FINANCE, `013`), `confirmation_fee_mad`/`packaging_fee_mad`/`delivery_fee_mad` (FINANCE, `007`/`008`), `media jsonb` (`007`), `sale_unit` (`079`), `pack_size`/`pack_unit` (`080`, affichage pur), `source_supplier_product_id uuid` (`069`).

### Embryon de variante : NÉANT

Recherche large insensible à la casse sur tout le dépôt : `variant|variante|sku|attribute|attribut|size|color|taille|couleur|pointure|option_value|product_option`. **Aucun objet de données.** Faux positifs : `cart.ts:87` (« SKU » = produit catalogue), `messages/*.json`/`globals.css` (`color`, `<option>`).

**Conclusion** : modèle actuel strictement « 1 produit = 1 stock = 1 prix ». Construction additive pure, sans risque de doublon.

---

## 2. STOCK PROPRE (WMS-1) — chaîne `product_id` & impact d'un passage à `variant_id`

### Ledger & RPC (tous indexés sur `product_id`)

**`stock_movements`** (`092_stock_movements_ledger.sql:27-47`) : `product_id uuid NOT NULL REFERENCES products(id)` (`092:29`) ; `channel CHECK IN ('affiliate','wholesale','ecom_perso','manual_adjust','return','system')` (`092:30-34`) ; `qty_delta`, `reason`, `order_id`, `order_type`, `balance_after`, `actor_id`, `note`, `created_at`. RLS deny, **aucune policy INSERT/UPDATE/DELETE** → append-only ; trigger `stock_movements_immutable()` (`092:81-91`). Taxonomie `reason` remplacée en `095:73-88` : `vente_affilie|vente_gros|vente_ecom` + `cadeau|casse|echantillon|perte|retour|reappro`.

**`stock_anomalies`** (`095:433-446`) : `product_id uuid REFERENCES products(id)` **nullable** (`095:438`) ; `anomaly_type CHECK IN ('oversell','abnormal_loss','repeated_adjust')` ; append-only + trigger immuable (`095:484-487`).

**RPC (`SECURITY DEFINER`)** :
- `record_stock_movement(p_product_id, p_qty_delta, p_channel, p_reason, p_order_id, p_order_type, p_actor, p_note)` — `092:104`. Lit `products.stock_count` après UPDATE pour `balance_after` (`092:122-124`). `REVOKE` total.
- `reserve_stock(p_product_id, p_qty, p_channel, p_order_id, p_order_type, p_actor) RETURNS integer` — `095:105`. `SELECT ... FOR UPDATE` (`095:124-128`), `UPDATE products SET stock_count` (`095:135-137`), reason par canal (`095:140-145`), hook oversell → `record_anomaly` (`095:161-182`).
- `restore_stock(...) RETURNS void` — `095:206`, reason forcée `'retour'`.
- `adjust_stock_manual(p_product_id, p_qty_delta, p_actor, p_note, p_reason) RETURNS integer` — `095:268`. Gate `has_capability('manage_stock')` (`095:295`), `FOR UPDATE` (`095:316-320`).
- `record_anomaly(...)` — `095:500`, `REVOKE` total.

### Qui appelle quoi

- **`confirm_cod_order(p_order_id)`** (`093:244`) : lit `orders.product_id, quantity` (`093:267`), canal selon `affiliate_id`, `reserve_stock(...)` (`093:298-305`).
- **`transition_wholesale_order_status(...)`** (`093:348`) : boucle `wholesale_order_items (product_id, quantity)` (`093:431-444`) → `reserve_stock(r.product_id, r.quantity, 'wholesale', ...)` ; restauration symétrique au `cancelled` (`093:451-465`).
- **`updateOrderStatus`** (`src/app/actions/orders.ts:460`) : `reserve_stock`/`restore_stock` via `supabase.rpc` avec `order.product_id` (`orders.ts:549-571`).
- **`adjustStock`** (`src/app/actions/stock.ts:39`) : `adjust_stock_manual` avec `p_product_id` (`stock.ts:58-64`).

### Impact d'un passage à `variant_id` — ce qu'il faut pour NE PAS casser

1. **Compat ascendante des RPC (expand)** : ajouter `p_variant_id uuid DEFAULT NULL` en **fin** de signature. `NULL` ⇒ « variante par défaut du produit ». `DROP FUNCTION IF EXISTS` de la signature exacte avant `CREATE` (Postgres ne distingue pas une surcharge par paramètre nullable au milieu).
2. **Colonne `variant_id` nullable sur `stock_movements`/`stock_anomalies`** : `ADD COLUMN` additif, aucune réécriture des lignes historiques (interdit par le trigger d'immutabilité).
3. **Variante par défaut rétro-remplie** : chaque `products` reçoit une `product_variants` « défaut » 1:1 — invariant qui rend le simple = cas particulier du variant.
4. **Lieu du compteur (décision structurante)** : (A) stock sur `product_variants.stock_count`, `products.stock_count` dérivé/déprécié ; (B) stock reste sur `products` tant qu'une seule variante. **Recommandation : (A) avec double-écriture transitoire** (`reserve_stock` décrémente la variante ET maintient `products.stock_count` = somme, le temps de migrer les lecteurs). À valider — conditionne `balance_after`.
5. **FK & RLS** : `product_variants` avec RLS deny par défaut alignée sur `products`. `stock_movements`/`stock_anomalies` gardent leur RLS append-only.
6. **`balance_after`** : `record_stock_movement` lit `products.stock_count` (`092:122`). Si le stock passe sur la variante, cette lecture doit cibler `product_variants.stock_count` — **point critique** (un `balance_after` faux corromprait l'audit). À auditer `@security`.

---

## 3. STOCK FOURNISSEUR — structure, miroir, Telegram, fraîcheur & multi-modes

### `supplier_products`

Table `030_supplier_marketplace.sql:17-57`. Champs : `stock_quantity integer CHECK (>= 0)` — **snapshot déclaré jamais décrémenté** (`035_supplier_catalog_bulk.sql:10`) ; `lead_time_days` (`035`) ; `unit` (`035`) ; `availability_type` (`030:31-32`) ; `suggested_wholesale_price_mad` (FINANCE) ; `updated_at` + trigger (`030:56,69-72`, **seule fraîcheur, générique**) ; `source CHECK IN ('web','telegram','bulk_csv')` (`053:16-24`) + `telegram_message_id` (idempotence, index unique `053:27-29`).

**Manque** : `stock_quantity_updated_at` dédié, `stock_mode` (API/manuel/Telegram/hebdo), indicateur de fiabilité/fraîcheur exploitable, `variant_id`.

### Miroir catalogue (copie figée)

`src/lib/supplier-mirror.ts` — `buildSupplierMirror` (`:92`). Règle `stock_count: sp.stock_quantity ?? 0` (`:134`). À l'approbation, le stock fournisseur est **gelé** dans `products.stock_count`, puis WMS-1 le décrémente comme un stock propre. **Pas de réalimentation auto** ensuite.

### Ingestion Telegram

`src/lib/telegram/ingest.ts` : insert `supplier_products` avec `stock_quantity` (`:289`), idempotence par `telegram_message_id` (`:302`, double-garde `UNIQUE_VIOLATION` `:308-312`). Staging append-only `telegram_inbound` (`053:122-141`). Extraction IA `stock_quantity` optionnel `>= 0` (`schema.ts:73,295,323` ; `extract.ts`). Toujours `pending_review` (`ingest.ts:300`).

### Relier au modèle cible — ce qui manque

1. **Lien variante** : `supplier_products` (ou table de liaison `supplier_variant_stock`) doit cibler une variante.
2. **Multi-modes** : `stock_mode text CHECK IN ('api','manual','telegram','weekly')` + `stock_quantity_updated_at timestamptz` dédié.
3. **Fraîcheur exploitable** : horodatage propre au stock → « âge » → pondération « dispo réel » + déclenchement « à confirmer » au-delà d'un seuil.
4. **Découplage de la copie figée** : pour un stock fournisseur temps réel, lire `supplier_products.stock_quantity` (+ fraîcheur) plutôt que le `products.stock_count` figé, ou resynchroniser le miroir. Décision structurante, financièrement neutre tant qu'on ne touche pas aux prix.

---

## 4. COMMANDES — où est stocké le produit acheté, et l'injection `variant_id`

### COD / affilié — `orders` (mono-produit)

`001:43-62`. `product_id uuid NOT NULL REFERENCES products(id)` (`001:46`) ; `quantity` (`001:51`) ; `total_amount`, `commission_amount` (FINANCE) ; snapshots `009_cod_order_engine.sql` (`product_price_snapshot`, `affiliate_commission_mad_snapshot`, `delivery/packaging/confirmation_fee_snapshot` — FINANCE immuables). **Aucun `variant_id`.**

### Grossiste — `wholesale_order_items` (multi-lignes)

`001:96-104`. `product_id uuid NOT NULL REFERENCES products(id)` (`001:99`) ; `quantity`, `unit_price_snapshot`, `subtotal`, `tier_label_snapshot` (FINANCE/snapshot). **Aucun `variant_id`.**

### À ajouter + impact RPC

1. `orders.variant_id` / `wholesale_order_items.variant_id` **nullables** (compat ascendante).
2. **Décrément** : `confirm_cod_order` (`093:267`) lit `orders.variant_id` → `reserve_stock` ; `transition_wholesale_order_status` (`093:432`) sélectionne `variant_id` dans la boucle ; `updateOrderStatus` (`orders.ts:549`) passe `p_variant_id`.
3. **Résolution** : `variant_id` NULL ⇒ variante par défaut du `product_id` dans le RPC (anciennes commandes cohérentes).
4. **Snapshots financiers inchangés** : prix/commission au niveau produit. `variant_id` **jamais** dans un calcul de marge — frontière à ne pas franchir.

---

## 5. PANIER + VITRINE + AFFICHAGE — sélection de variante & « dispo réel »

### Où s'afficherait le choix de variante

- **COD public** : `src/app/products/[id]/page.tsx` (`inStock = stock_count > 0` `:84`, low-stock `:85`, `maxQty` `:174`) ; form `src/components/customer/cod-order-form.tsx` → alimente `placeOrder` (`orders.ts:39`).
- **Affilié** : `src/app/(affiliate)/affiliate/products/[id]/page.tsx` (stock `:189-191`, lien `?ref=` `:134`) ; saisie `src/components/affiliate/create-order-form.tsx` (`ProductOption` `:10-19`) → `createAffiliateOrder` (`orders.ts:270`).
- **Grossiste / marketplace** : `src/app/(wholesale)/wholesale/products/[id]/page.tsx`, `.../marketplace/page.tsx` ; panier `addToCart`/`addMarketplaceToCart` (`cart.ts:28,89`) → `wholesale_cart_items` (devra porter `variant_id`).

### « Dispo » actuel

Purement local : `product.stock_count > 0` (public `:84`, affilié `:189`). Panier lit `stock_count`/`availability_type` via vues redacted `products_catalog_read` (`cart.ts:48-52`) et `supplier_products_wholesaler_read` (`cart.ts:108-112`). Option A : insuffisance → `warning='restocking'`, jamais de refus (`cart.ts:70-73`, `orders.ts:96-97,360-361`).

### Logique « dispo réel » proposée (financièrement neutre)

```
dispo_réel(variant) =
    stock_propre(variant.stock_count, temps réel)        // source fiable
  + stock_fournisseur_pondéré(variant)                   // déclaré, pondéré fraîcheur

stock_fournisseur_pondéré =
    si fraîcheur(stock_quantity_updated_at) <= seuil_frais   → stock_quantity
    si fraîcheur entre seuil_frais et seuil_périmé           → stock_quantity + signal "à confirmer"
    si fraîcheur > seuil_périmé OU mode peu fiable           → 0 affiché + signal "à confirmer"
```

- **Signal « à confirmer »** = string i18n résolue **côté serveur** (FR/AR/EN), conformément à la RÈGLE ABSOLUE n°2 (jamais de fonction passée à un Client Component ; cf. régression `stockAvailable`). Pattern : `stockLabel: count != null ? t('key',{count}) : ''`.
- **Option A préservée** : « à confirmer » ne bloque jamais — il colore l'UX et alimente l'alerte admin (`record_anomaly`).
- Respecter `feedback-dashboards-theme-clair` (thème clair encre & or) pour toute UI admin.

---

## 6. AFFILIÉ — état réel du parcours & localisation du « trou »

Deux modes, tous deux fonctionnels :

1. **Lien d'attribution** : `${APP_URL}/products/${product.id}?ref=${user.id}` (`affiliate/products/[id]/page.tsx:134`), `CopyLinkButton` (`:5,:288`). Le client commande sur la page publique → `placeOrder` (`orders.ts:39`) valide l'affilié via `?ref=`, prix custom (`affiliate_product_prices`, `orders.ts:117-122`), `attribution_click_id` (`orders.ts:131-139`).
2. **Saisie directe COD** : `createAffiliateOrder` (`orders.ts:270`) — client + prix de vente ; commission `calculateNetAffiliateCommission`, blocage si négative (`orders.ts:401-407`). Page `affiliate/orders/new/page.tsx`, form `create-order-form.tsx`.

**Le « trou »** : ni le lien, ni le formulaire, ni le COD public ne transportent de **variante**. `placeOrder`/`createAffiliateOrder` insèrent dans `orders` sans `variant_id`. Point d'extension n°4 + sélecteur UI (point 5).

---

## 7. EGROW / ECOM PERSO — existant & décrément du stock central

- **Canal provisionné, surface non câblée.** `ecom_perso` = valeur `stock_movements.channel` (`092:33`), reason `vente_ecom` (`095:143`), branche dans `confirm_cod_order` (`affiliate_id IS NULL → 'ecom_perso'`, `093:296`) et `updateOrderStatus` (`orders.ts:547`).
- Une commande sans affilié est traitée « ecom_perso » par défaut, mais aucune surface Egrow distincte ne crée ces commandes intentionnellement = **WMS-2, non branché**.
- **Décrément cible** : une vente ecom perso appellera `reserve_stock(..., p_channel='ecom_perso', ...)` → stock central partagé décrémenté atomiquement, journalise `vente_ecom`. Avec variantes : passer `variant_id`. Infra prête ; manque la surface de création Egrow et son mapping `orders`/`reserve_stock`.

---

## 8. RISQUES MAJEURS & DÉCOUPAGE EN SOUS-LOTS

### Risques transverses

- **Ledger append-only** : UPDATE/DELETE interdits (triggers `092:81-91`, `095:477-487`). Évolution = colonnes nullables additives, jamais de réécriture. Un back-fill `variant_id` sur l'historique échouerait sur le trigger.
- **Finance intacte** : aucune touche à `sell_price`, `commission_amount`, `wholesale_tiers`, `factory_cost_mad`, `platform_margin_*`, ni aux snapshots. `variant_id` jamais dans un calcul de marge. Approche de cette frontière → circuit `@finance` + `@security` + Abdou (RÈGLE ABSOLUE n°5).
- **RLS deny par défaut** : `product_variants` naît avec RLS + policies alignées sur `products` dès la migration de création.
- **Régression invisible** : changement de signature RPC ou fonction passée à un Client Component peut casser sans que `tsc`/build/tests le voient (cf. `stockAvailable`). → `pnpm smoke` obligatoire ; i18n côté serveur.
- **Migration par lot** : appliquer chaque migration en base immédiatement (`supabase db push`). (WMS-1 092-095 désormais **mergé + en prod** — cf. correction en tête de doc.)

### Sous-lots ordonnés (du PLUS SÛR au PLUS RISQUÉ)

**SOUS-LOT V0 — Socle `product_variants` additif (zéro risque)**
- *Objectif* : créer `product_variants` (`id`, `product_id FK`, `attributes jsonb` data-driven, `stock_count integer`, `is_default boolean`, `active`, timestamps), RLS deny par défaut alignée `products`. Rétro-remplir **une variante défaut 1:1** par produit existant. Aucune lecture ne change.
- *Peut casser* : rien (additif). Risque résiduel : oubli de RLS.
- *Éviter* : RLS + policies dans la même migration ; test que chaque produit a exactement une variante défaut.
- *@finance/@security* : revue `@security` (RLS). Pas de `@finance`.

**SOUS-LOT V1 — Affichage variantes (lecture seule, UI)**
- *Objectif* : exposer les variantes en lecture (public/affilié/grossiste) ; sélecteur désactivé/invisible tant qu'une seule variante défaut. Strings i18n FR/AR/EN côté serveur.
- *Peut casser* : régression de rendu type `stockAvailable`.
- *Éviter* : RÈGLE ABSOLUE n°2 ; `pnpm smoke` sur les 3 surfaces ; lots ≤ 3-4 pages.
- *@finance/@security* : aucun (design + lecture).

**SOUS-LOT V2 — RPC stock à signature étendue rétro-compatible (expand)**
- *Objectif* : `p_variant_id uuid DEFAULT NULL` en fin de `reserve_stock`/`restore_stock`/`adjust_stock_manual`/`record_stock_movement` ; colonnes nullables `variant_id` sur `stock_movements`/`stock_anomalies`. Comportement inchangé tant que `variant_id` non fourni. Pas de bascule du compteur.
- *Peut casser* : surcharge de fonction Postgres mal gérée ; `balance_after` incohérent.
- *Éviter* : `DROP FUNCTION IF EXISTS` signature exacte ; paramètre en fin ; lecture `balance_after` inchangée jusqu'à V4 ; tests RPC.
- *@finance/@security* : **`@security`** (intégrité ledger, RLS, REVOKE). `@finance` léger (zéro touche montant).

**SOUS-LOT V3 — `variant_id` sur lignes de commande + panier (double-écriture)**
- *Objectif* : `orders.variant_id`, `wholesale_order_items.variant_id`, `wholesale_cart_items.variant_id` (nullables). Câbler `placeOrder`, `createAffiliateOrder`, `addToCart`/`addMarketplaceToCart`, soumission grossiste pour porter la variante. `confirm_cod_order`/`transition_wholesale_order_status`/`updateOrderStatus` passent `p_variant_id` (défaut si NULL).
- *Peut casser* : décrément sur mauvaise variante ; rupture des snapshots ; `UNIQUE(buyer_id, product_id)` du panier (`001:71`) → `UNIQUE(buyer_id, product_id, variant_id)` (migration de contrainte sensible).
- *Éviter* : `variant_id` jamais dans les calculs prix/commission ; back-fill contrainte panier en transaction ; tests bout-en-bout 3 canaux.
- *@finance/@security* : **`@finance` + `@security` obligatoires** (lignes de commande + décrément = frontière financière).

**SOUS-LOT V4 — Bascule du compteur sur la variante (risque maximal)**
- *Objectif* : `reserve_stock`/`restore_stock`/`adjust_stock_manual` décrémentent `product_variants.stock_count` ; `record_stock_movement.balance_after` lit la variante. `products.stock_count` maintenu en somme (double-écriture) jusqu'à migration de tous les lecteurs, puis déprécié.
- *Peut casser* : tout le WMS-1 en prod (Option A, oversell, anomalies), tous les lecteurs de `products.stock_count`, cohérence `balance_after`.
- *Éviter* : double-écriture variante↔produit ; bascule lecteur par lecteur ; invariant `products.stock_count == Σ variantes` vérifié par test ; rollback = relire le produit ; lot isolé + smoke complet + surveillance anomalies.
- *@finance/@security* : **`@finance` + `@security` + validation Abdou** (cœur du ledger stock).

**SOUS-LOT V5 — Stock fournisseur multi-modes & fraîcheur (parallélisable après V0)**
- *Objectif* : `supplier_products.stock_quantity_updated_at`, `stock_mode`, lien variante ; alimenter la fraîcheur depuis Telegram (`ingest.ts:289`) et la saisie manuelle ; calculer le « dispo réel » pondéré + signal « à confirmer ».
- *Peut casser* : miroir figé (`supplier-mirror.ts:134`) si resynchro non maîtrisée ; sur-affichage de stock périmé.
- *Éviter* : ne pas modifier la règle de prix du miroir ; fraîcheur = champ additif ; seuils configurables ; tests sur les 4 modes.
- *@finance/@security* : `@security` (RLS nouveaux champs, vue redacted) ; `@finance` seulement si l'on touchait `suggested_wholesale_price_mad` (à éviter).

**SOUS-LOT V6 (futur, hors périmètre immédiat) — Egrow / ecom perso câblé**
- *Objectif* : surface de création de commande ecom perso → `orders` (channel `ecom_perso`) avec `variant_id` → décrément stock central via `reserve_stock`.
- *@finance/@security* : `@finance` + `@security` (nouveau flux de vente).

### Ordre recommandé

`V0 → V1 → V2 → V3 → V4`, avec **V5 parallélisable dès V0 terminé**, **V6 reporté** (WMS-2). Chaque lot : ≤ 3-4 pages, 4 checks verts (`tsc`, `build`, `vitest`, `smoke`), migration appliquée immédiatement, traçabilité `FEUILLE_DE_ROUTE.md` + `ETAT_SYSTEME.md`. V3 et V4 = seuls à exiger le circuit financier complet.

### Deux décisions à valider par Abdou AVANT V0

1. **Emplacement final du compteur de stock** : variante seule vs double-écriture transitoire (recommandation = **double-écriture**).
2. ~~État réel d'application des migrations 092-095~~ → **RÉSOLU** : WMS-1 mergé + appliqué en prod (cf. correction en tête).

---

## Fichiers de référence (chemins absolus)

- `supabase/migrations/001_initial_schema.sql` — `products`, `orders`, `wholesale_order_items`, `wholesale_cart_items`, RLS.
- `supabase/migrations/092_stock_movements_ledger.sql` — ledger + `record_stock_movement`.
- `supabase/migrations/093_option_a_never_refuse_stock.sql` — `reserve_stock`/`restore_stock`/`confirm_cod_order`/`transition_wholesale_order_status`, DROP CHECK `stock_count>=0`.
- `supabase/migrations/094_adjust_stock_manual_rpc.sql`, `095_wms1_taxonomy_anomalies.sql` — `adjust_stock_manual`, taxonomie, `stock_anomalies`, `record_anomaly`.
- `supabase/migrations/030_supplier_marketplace.sql`, `035_supplier_catalog_bulk.sql` (`stock_quantity`), `053_telegram_product_ingestion.sql`.
- `src/lib/supplier-mirror.ts` — miroir figé (`stock_quantity ?? 0` → `stock_count`, ligne 134).
- `src/app/actions/orders.ts` — `placeOrder` (39), `createAffiliateOrder` (270), `updateOrderStatus` (460).
- `src/app/actions/cart.ts` — `addToCart` (28), `addMarketplaceToCart` (89).
- `src/app/actions/stock.ts` — `adjustStock` (39).
- `src/lib/telegram/ingest.ts` (289), `schema.ts` (73, 295, 323), `extract.ts`.
- Pages produit : `src/app/products/[id]/page.tsx` (84), `src/app/(affiliate)/affiliate/products/[id]/page.tsx` (134, 189), `src/app/(affiliate)/affiliate/orders/new/page.tsx`, `src/components/affiliate/create-order-form.tsx`, `src/components/customer/cod-order-form.tsx`.

---

<!-- LOT 0bis (2026-06-24) — cartographie ajoutée par @architect : dimension STATUTS de stock. Lecture seule. -->

## STATUTS DE STOCK + CYCLE DE VIE + SCAN

> Section additive à la cartographie « Variantes & double origine de stock » ci-dessus. Mêmes noms de tables/RPC, même Option A (never-refuse), même filet de double-écriture transitoire. Le stock à 2 origines (propre/fournisseur) reste celui décrit plus haut — non réinventé. **Réconciliation argent transporteur = REPORTÉE** (formats fichiers transporteurs + export Egrow non disponibles) : seulement mentionnée comme étape future, jamais conçue ici.

### Rappel du contexte figé : les 7 statuts de cycle de vie d'une pièce

Chaque pièce d'une **variante** (`product_variants`) traverse 7 statuts :

| # | Statut | Sens métier | Vendable ? |
|---|--------|-------------|------------|
| 1 | `at_warehouse` (au dépôt) | réel disponible, scanné en réception | OUI |
| 2 | `reserved` (réservé) | commandé, pas encore expédié | NON (engagé) |
| 3 | `in_transit` (parti) | remis au transporteur, en livraison | NON |
| 4 | `delivered` (livré) | reçu par le client | sorti du stock |
| 5 | `return_expected` (retour attendu) | annulé/refusé, pas encore revenu physiquement | NON |
| 6 | `return_received` (retour reçu) | scanné au retour → bascule en dépôt | redevient OUI |
| 7 | `damaged` (endommagé/invendable) | séparé du vendable | NON |

Les 3 canaux (`affiliate`, `wholesale`, `ecom_perso`) consomment le **même** stock propre par variante et font transiter les pièces entre ces statuts.

### 1. Poser les 7 statuts — Option A (colonnes mutables) vs Option B (ledger) → **Option B recommandée**

- **Option A (colonnes-quantité par statut, table mutable)** : lecture directe MAIS **MUTABLE** → casse l'invariant append-only de WMS-1 (`stock_movements` trigger immuable `092:81-91`), perd reconstruction/audit, expose aux races. **Rejetée.**
- **Option B (statut sur chaque mouvement du ledger + quantités DÉRIVÉES) ✅** : extension naturelle de l'existant append-only. Chaque mouvement porte `from_status`/`to_status` ; les quantités par statut sont agrégées ; une **projection reconstructible** sert de cache (jamais source de vérité = le ledger fait foi). C'est le pattern double-écriture déjà retenu.

**Modèle additif recommandé :**
```sql
ALTER TABLE public.stock_movements
  ADD COLUMN variant_id  uuid REFERENCES public.product_variants(id),  -- nullable (lignes historiques)
  ADD COLUMN from_status text,   -- NULL = entrée externe (réception, oversell)
  ADD COLUMN to_status   text;   -- NULL = sortie définitive (livré)
-- CHECK additifs sur from_status/to_status ∈ (at_warehouse,reserved,in_transit,delivered,
--   return_expected,return_received,damaged) OR NULL. NE PAS toucher CHECK reason (095:73) ni channel (092:30).
```
Projection cache `variant_status_balance(variant_id, qty_at_warehouse, qty_reserved, qty_in_transit, qty_return_expected, qty_damaged)` — reconstructible : `qty_S = Σ(entrants vers S) − Σ(sortants de S)`. Stock vendable = `qty_at_warehouse` (= `product_variants.stock_count` désagrégé par statut).

### 2. Transitions — mappage sur flux & statuts de commande existants

Statuts réels vérifiés : `orders.status` (`009:63-70`) = `pending_confirmation→confirmed→shipped→delivered` + `returned`/`cancelled` ; `wholesale_orders.status` FSM `src/lib/wholesale-fsm.ts:14-30` (cycle Deliveroo) répliquée SQL `093:404-417`.

| Transition pièce | Déclencheur | RPC/action | Statut ledger |
|---|---|---|---|
| dépôt→réservé (1→2) | confirmed | `confirm_cod_order` (`093:298`), `transition_wholesale_order_status` (`093:436`), `updateOrderStatus` (`orders.ts:549`) → `reserve_stock` | `at_warehouse`→`reserved` |
| réservé→parti (2→3) | shipped/dispatched | `updateOrderStatus` (`orders.ts:587`), FSM (`093:474`) | `reserved`→`in_transit` — **MANQUANT** (pas de mvt stock au shipped) |
| parti→livré (3→4) | delivered | idem | `in_transit`→NULL — **MANQUANT** |
| →retour attendu (→5) | returned/cancelled | `updateOrderStatus` needsRestore (`orders.ts:561`), FSM cancelled (`093:448-465`) | →`return_expected` — **PARTIEL** : `restore_stock` rebascule DIRECT au dépôt |
| retour attendu→reçu (5→6) | SCAN retour | **AUCUN** | `return_expected`→`return_received` — **MANQUANT** |
| reçu→dépôt (6→1) | SCAN/QC OK | **AUCUN** (`restore_stock` fait 5→1 d'un coup) | `return_received`→`at_warehouse` |
| →endommagé (→7) | QC retour / casse | `adjust_stock_manual casse` (`095:346`) sans statut | →`damaged` — **MANQUANT** (pool invendable distinct) |
| entrée dépôt (ext→1) | SCAN réception/réappro | `adjust_stock_manual reappro` (`095:268`) | NULL→`at_warehouse` — base existe, manque le scan |

**Manques** : (1) aucun mvt stock au shipped/delivered ; (2) `restore_stock` court-circuite « retour attendu » (5→1 instantané au lieu de 5→6→1 scanné) ; (3) pas de pool `damaged` distinct ; (4) pas d'entité scan ; (5) **réversion commission** `handle_order_status_reversal()` (`013:107-119`) → **NE PAS TOUCHER** (financier).

### 3. Impact WMS-1 (092-095, mergé + en prod) — additif only

**S'étend** : `stock_movements +variant_id/+from_status/+to_status` (nullables, CHECK additifs, trigger immuable préservé) ; `reserve_stock`/`restore_stock`/`record_stock_movement`/`adjust_stock_manual` signatures étendues `p_variant_id/p_from_status/p_to_status DEFAULT NULL` en fin (appelants actuels inchangés) ; nouvelles tables `scan_events` + projection `variant_status_balance` (RLS deny, append-only). **Reste intact** : CHECK reason/channel, RLS+REVOKE des RPC internes, Option A (oversell→`record_anomaly` `095:161`), `stock_anomalies`+Gardien, tout le financier (snapshots, `handle_order_status_reversal`).

### 4. SCAN (entrée dépôt + retour) — générique multi-transporteur

Table append-only `scan_events` (RLS deny, trigger immuable) : `scan_type ('inbound_reception'|'return_received')`, `variant_id`, `order_id?`, `carrier_name`/`carrier_tracking_ref` (**texte libre — aucun transporteur câblé**), `scanned_qty`, `condition ('sellable'|'damaged')`, `stock_movement_id`, `actor_id`, `scanned_at`. **Idempotence anti-fraude** : `UNIQUE(scan_type, carrier_tracking_ref, order_id)` + `ON CONFLICT DO NOTHING` (pas de double-comptage). Écriture via RPC SECURITY DEFINER `record_scan(...)` qui, dans la même transaction, valide l'idempotence, appelle `restore_stock`/`adjust_stock_manual` avec les bons statuts, et lie le mouvement. Gate `has_capability('manage_stock')`. Scan orphelin → `record_anomaly`. C'est ici que se branchera plus tard la réconciliation argent transporteur.

### 5. « Stock réel disponible » par variante & statut

```
stock_propre_vendable(variant) = qty_at_warehouse
   = Σ(ledger to_status='at_warehouse') − Σ(ledger from_status='at_warehouse')
stock_engagé        = qty_reserved + qty_in_transit        // sorti du vendable, pas livré
retours_en_cours    = qty_return_expected                  // PAS vendable tant que non scanné reçu
dispo_réel(variant) = stock_propre_vendable + stock_fournisseur_pondéré(fraîcheur)   // cf. section précédente
```
Les 3 canaux lisent le même `qty_at_warehouse` ; vente confirmée → `reserved` (atomique, `FOR UPDATE` `095:124`). Option A : insuffisance → signal « stock à confirmer » (i18n FR/AR/EN **résolu serveur**), jamais de refus ; solde négatif → `record_anomaly('oversell')`. **`return_expected` jamais compté vendable** (corrige le court-circuit `restore_stock`) : le stock ne revient qu'au SCAN `return_received→at_warehouse`. Affichage : badges statut sur pages produit + tableau de bord dépôt (thème clair encre & or).

### 6. Risques + découpage combiné variantes ⊕ statuts (du + sûr au + risqué)

Risques statuts : divergence projection/ledger (ledger fait foi + job recalcul + test invariant) ; changement de timing retour (5→6→1 scanné vs restore instantané — **décision métier Abdou**) ; pas de CHECK `≥0` sur quantités par statut (cohérent `093:42`) ; régression RPC (DROP FUNCTION exact + params en fin + smoke).

| Lot | Objet | Finance ? |
|---|---|---|
| **V0** | Socle `product_variants` + variante défaut 1:1 | non (@security RLS) |
| **V0-bis** | Socle STATUTS : `+from_status/to_status` ledger + projection (fusionnable avec V2) | non (@security) |
| **V1** | Affichage variantes (lecture) | non |
| **V2** | RPC signatures étendues `+p_variant_id/+p_from_status/+p_to_status DEFAULT NULL` | non (@security ; @finance léger) |
| **V3** | `variant_id` lignes commande/panier + transitions 1→2→3→4 et →5 (ajout mvt shipped/delivered ; `restore_stock` s'arrête à `return_expected`) | **OUI @finance+@security+Abdou** |
| **V5 (scan)** | `scan_events` + `record_scan` + transitions 5→6→1 et →7 (anti-fraude, multi-transporteur générique) | non (@security) |
| **V4** | Bascule compteur sur variante + statuts source de vérité | **OUI @finance+@security+Abdou** |
| **V5-bis** | Stock fournisseur multi-modes + fraîcheur (//able dès V0) | non (sauf prix) |
| **V6** | Egrow/ecom perso câblé (reporté = WMS-2) | OUI |
| **Futur** | Réconciliation ARGENT transporteur (branchée sur `scan_events`) — REPORTÉE (formats fichiers manquants) | OUI quand elle viendra |

**Ordre recommandé** : `V0 + V0-bis → V1 → V2 → V3 → V5(scan) → V4`, **V5-bis parallélisable** dès V0, **V6 + réconciliation argent reportés**. Seuls V3/V4 (et V6 futur) exigent le circuit financier complet. Chaque lot : ≤ 3-4 pages, 4 checks verts, migration appliquée immédiatement, traçabilité registres.

### Décisions à valider par Abdou AVANT V0-bis
1. **Modèle = Option B** (ledger + statuts dérivés) — recommandation forte.
2. **Changement de timing retour** accepté (5→6→1 scanné au lieu de `restore_stock` instantané) — impact opérationnel (le stock met plus de temps à redevenir vendable), pas financier.
3. **Réconciliation argent transporteur** reste hors périmètre jusqu'à obtention des vrais formats de fichiers transporteurs + export Egrow.
