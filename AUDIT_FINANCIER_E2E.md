# AUDIT FINANCIER BOUT-EN-BOUT — 5 types de commande

> Audit lecture seule du code réel (migrations à jour 073/074, base @finance).
> Aucun fichier de code/base modifié. Chaque affirmation est citée `fichier:ligne`.
> Date : 2026-06-16.

## Constantes et formules vérifiées dans le code (pas supposées)

- `DELIVERY_PROVISION_MAD = 35` — `src/lib/utils.ts:49`. Provision livraison fixe incluse dans le capital.
- `calculatePlatformPrice(usine, type, valeur)` = `Math.round(usine × (1+pct/100))` ou `Math.round(usine + fixe)` — `src/lib/utils.ts:18-28`. **Arrondi half-up à l'entier MAD**.
- Capital (prix catalogue affilié local) = `calculatePlatformPrice(usine, marge) + packaging + confirmation + 35` — dérivé serveur `src/app/actions/products.ts:262-270` ; aligné en base par migrations 073 (`073:78-91`) et 074 (`074:71-88`). Le `sell_price` du formulaire est **ignoré** pour les affiliés locaux (anti-POST direct, `products.ts:211/268`).
- Commission nette/unité (Option B) = `affiliateSellPrice − calculatePlatformPrice(arrondi) − deliveryFee − confirmationFee − packagingFee` — `src/lib/utils.ts:87-92`. La soustraction porte sur le **prix plateforme ARRONDI**, pas `usine + marge_non_arrondie` → garantit commission = 0 pile au prix catalogue (`utils.ts:76-85`).
- Packaging affilié local planché à 10 MAD (D2) — `products.ts:259` ; migration 074.
- `is_pre_confirmed` : flag **purement tracé**, ne modifie aucun montant — `074:5-9,22-26` ; côté COD `confirmation_fee_snapshot` reste `?? 10` que la commande soit pré-confirmée ou non (`orders.ts:184,414`).

## Cycle de vie COD et ledger (vérifié)

1. Commande créée `pending_confirmation` (`orders.ts:231,418`), snapshots figés à l'insert.
2. `delivered` → trigger `handle_order_delivered()` insère `commissions(status='pending')` + ledger `commission_earned` (positif), idempotent `ON CONFLICT (order_id)` / `ON CONFLICT (idempotency_key)` — `048:104-130`. Commission **uniquement si `v_commission > 0`** (`048:115`).
3. Admin approuve `pending → approved` — `commissions.ts:53` (bulk) / `:18` (unitaire).
4. Payout : RPC `create_payout` atomique + idempotent, montant **dérivé = SUM(commissions approved)** jamais saisi, `FOR UPDATE` anti-concurrence, ledger `payout` négatif par commission — `049:55-147`.
5. `returned`/`cancelled` après `delivered` → `handle_order_status_reversal()` passe `reversed=true` + ledger `commission_reversed` négatif — `048:142-164`.
6. Ledger append-only strict : UPDATE/DELETE/TRUNCATE bloqués par trigger — `048:64-85`.

---

## CAS CHIFFRÉS RÉELS

### Hypothèses produit communes (cas 1-3)
Produit affilié local : **usine = 183 MAD**, marge **20 % (percentage)**, packaging = 10, confirmation = 10.
- `platformPrice = Math.round(183 × 1.20) = Math.round(219,6) = 220` (`utils.ts:27`).
- **Capital (prix catalogue) = 220 + 10 + 10 + 35 = 275 MAD** (`products.ts:262-267`).
- Décomposition de Z (plateforme) au prix catalogue : marge = `220 − 183 = 37` ; + packaging 10 + confirmation 10 + provision livraison 35 = **92 MAD** ; usine Y = 183.

---

### CAS 1 — Maroc local stock, commande PUBLIQUE COD (sans affilié)
Flux `placeOrder` (`orders.ts:38`). `affiliate_id = null` → **commission = 0** (`orders.ts:161,174`), `is_pre_confirmed: false` (`orders.ts:233`).
Client paie le prix catalogue (sans majoration affilié) : **275 MAD** × 1 = `cod_expected = total_amount = 275,00` (`orders.ts:159-160,230`).

| Poste | Montant | Où |
|---|---|---|
| Client paie (X) | 275,00 | `total_amount`/`cod_expected` `orders.ts:159,230` |
| Usine (Y) | 183,00 | `factory_cost_mad` |
| Plateforme (Z) | 92,00 | marge 37 + pack 10 + conf 10 + prov.livr 35 |
| Affilié (W) | 0,00 | pas d'affilié `orders.ts:174` |
| Livraison réelle | financée par la provision 35 incluse dans Z | — |
| **Bouclage** | X = Y + Z + W → 275 = 183 + 92 + 0 ✓ | — |

Note : la provision livraison (35) est **dans Z**. La plateforme l'encaisse et règle le transporteur réel ; tant que la livraison réelle ≤ 35 (Casa min 25, défaut 35 — `utils.ts:39-40`) la plateforme est à l'équilibre, au-delà elle absorbe l'écart. **Aucune livraison comptée deux fois** : `placeOrder` n'appelle plus `resolveDeliveryFeeByCity` (`orders.ts:138-144`).

---

### CAS 2 — Affilié COD avec majoration (prix_vente > catalogue)
Flux `createAffiliateOrder` (`orders.ts:265`). L'affilié fixe **sell_price = 320 MAD** (> base 275, garde `orders.ts:352`). Quantité 1.
- Commission = `320 − 220 − 35 − 10 − 10 = 45,00` (`calculateNetAffiliateCommission`, `utils.ts:87-92`, appelée `orders.ts:375`).

| Poste | Montant | Où |
|---|---|---|
| Client paie (X) | 320,00 | `total_amount`/`cod_expected` `orders.ts:373-374,416` |
| Usine (Y) | 183,00 | `factory_cost_mad` |
| Plateforme (Z) | 92,00 | marge 37 + pack 10 + conf 10 + prov.livr 35 |
| Affilié (W) | 45,00 | `commission_amount` `orders.ts:409` |
| Livraison réelle | financée par les 35 (dans Z) | — |
| **Bouclage** | 320 = 183 + 92 + 45 ✓ | — |

La **majoration (45) va intégralement à l'affilié** : X augmente de 45 vs cas catalogue, Z et Y inchangés. Commission créée seulement à `delivered` (`048:115`), approuvée puis payée (`049`). Si retour → reversée (`048:142`).

---

### CAS 3 — Affilié COD au prix catalogue EXACT (commission = 0 pile, marge non entière)
Même produit, **sell_price = 275 (= capital)**, quantité 1. Le cas usine 183 / 20 % donne une marge **non entière** (219,6) — preuve de l'arrondi Option B.
- Commission Option B = `275 − Math.round(219,6)=220 − 35 − 10 − 10 = 0,00` exactement (`utils.ts:81-92`).
- **Sans** l'arrondi (si on soustrayait 219,6) : `275 − 219,6 − 55 = +0,40` → **0,40 MAD versés par erreur**. L'arrondi du prix plateforme dans la commission (`utils.ts:81`) ferme exactement ce trou. Vérifié arithmétiquement.

| Poste | Montant | Où |
|---|---|---|
| Client paie (X) | 275,00 | `orders.ts:373-374` |
| Usine (Y) | 183,00 | — |
| Plateforme (Z) | 92,00 | marge 37 + pack 10 + conf 10 + prov.livr 35 |
| Affilié (W) | **0,00 pile** | `utils.ts:81-92` (arrondi) |
| **Bouclage** | 275 = 183 + 92 + 0 ✓ | — |

Au prix catalogue exact, `createAffiliateOrder` accepte la commande (commission = 0, non négatif ; le blocage `< 0` est `orders.ts:390`). Le trigger ne crée **aucune** commission (`v_commission > 0` requis, `048:115`) → pas de ledger inutile. Sain.

---

### CAS 4 — Import on-demand (devis)
Flux quote (`src/app/actions/quote-requests.ts`). `affiliate_enabled` **forcé false** pour import_on_demand (`products.ts:68`) ; les deux entrées COD le **rejettent** (`orders.ts:90,348`). **Aucune commission affilié, aucune écriture ledger possible** sur ce type (triggers ledger/commission branchés exclusivement sur la table `orders` COD — `048`, `049`).
Le client paie un **montant négocié** : `prepareQuote` fige `quoted_unit_price_mad = Math.round(prix_source × fx × 100)/100` (`quote-requests.ts:148`) + transport. Le devient une `wholesale_orders` à la conversion. Coût/marge matérialisés **après** par le trigger `compute_wholesale_order_costs` (gross_profit = total − coûts, `025:27`), renseigné par l'admin.

| Poste | Montant (exemple : devis 1 200 MAD marchandise négociée, coût admin 900) | Où |
|---|---|---|
| Client paie (X) | montant **devisé** (négocié) | `quoted_unit_price_mad` `quote-requests.ts:148-171` |
| Fournisseur/import (Y) | `supplier_cost_mad` + transport/douane saisis admin | `wholesale_orders`, trigger `025:22-25` |
| Plateforme (Z) | `gross_profit_mad = total − total_cost` | trigger `025:27` |
| Affilié (W) | **0 — aucun affilié sur import** | `products.ts:68`, `orders.ts:90,348` |
| **Bouclage** | X = Y + Z (modèle wholesale), W=0 ✓ par construction | — |

**ANOMALIE (voir M-1 ci-dessous)** : à la conversion, `convertQuoteToOrder` **n'utilise PAS** le prix négocié — il recalcule `total_amount` depuis `wholesale_tiers` : `unitPrice = tier?.price_per_unit ?? 0` (`quote-requests.ts:270`), `total_amount = subtotal` (`:300`). Si la quantité demandée **ne matche aucun palier** → `unitPrice = 0` → **commande à 0 MAD facturée** alors que le client avait accepté un devis non nul.

---

### CAS 5 — Wholesale / achat gros
Flux `submitWholesaleOrder` (`orders.ts:646`) ou `createWholesaleOrderFromCart` (`orders.ts:550`). Prix par palier `getWholesaleTier` ; **repli `sell_price`** si qty < plus petit palier (`orders.ts:577,702`). `platform_margin` **non utilisé**. Coût = `factory_cost_mad` agrégé.

**Cas palier qui matche** — produit : `factory_cost_mad = 60`, paliers `[{min:50, prix:80}]`, commande 50 unités.
- `unitPrice = 80` (palier, `orders.ts:702`), `total = Math.round(80×100)×50 / 100 = 4 000,00` (centimes entiers, `orders.ts:703-714`).
- `supplier_cost_mad = Σ(60 × 50) = 3 000,00` (`computeSupplierCostMad`, `supplier-mirror.ts:90-99`).
- Trigger : `gross_profit = 4 000 − 3 000 = 1 000` (transport/additional = 0 par défaut, `025:8-9,22-27`).

| Poste | Montant | Où |
|---|---|---|
| Client/grossiste paie (X) | 4 000,00 | `total_amount` `orders.ts:714,729` |
| Fournisseur (Y) | 3 000,00 | `supplier_cost_mad` `orders.ts:721-723` |
| Plateforme (Z) | 1 000,00 | `gross_profit_mad` trigger `025:27` |
| Affilié (W) | 0,00 | pas d'affilié en wholesale |
| Livraison | hors prix marchandise ; gérée séparément (`set_wholesale_delivery_config`/refacturation `065`, CHECK no-loss `062`) | — |
| **Bouclage** | 4 000 = 3 000 + 1 000 + 0 ✓ (avant transport/douane que l'admin ajoute ensuite) | — |

**Cas repli `sell_price`** (qty 30 < plus petit palier 50) : `unitPrice = sell_price` (`orders.ts:577,702`). Le `sell_price` d'un produit affilié local capte déjà le capital (marge incluse). Pour un produit **purement gros** (non affilié), `sell_price` peut ne PAS être au-dessus de `factory_cost_mad` → marge potentiellement faible/nulle, mais **jamais double-comptée** : `gross_profit = total − supplier_cost`, une seule marge. Acceptable mais à surveiller (voir L-2).

---

## VÉRIFICATIONS TRANSVERSALES

### Double comptage — AUCUN
- **Livraison comptée une seule fois** en COD : provision 35 incluse dans le capital ET passée comme seul `deliveryFee` à la commission (`orders.ts:169,182,382,412`) ; `resolveDeliveryFeeByCity` retiré du flux (`orders.ts:138-140`). Le commentaire `utils.ts:42-47` interdit explicitement le cumul.
- **Marge plateforme comptée une seule fois** : commission soustrait `calculatePlatformPrice` (= usine+marge) une fois (`utils.ts:81-92`) ; les miroirs fournisseur sont **exclus** de la dérivation capital pour ne pas doubler la marge déjà dans leur `sell_price` (`products.ts:218-231`, `supplier-mirror.ts:8-9`).
- **Wholesale** : `gross_profit = total − coûts`, une seule marge (`025:27`).

### `?? 0` dangereux — inventaire
| Site | Statut |
|---|---|
| `orders.ts:165,378` `factory_cost_mad as number` | **SÛR** — précédé d'une garde fail-closed qui **refuse la commande** si `factory_cost_mad == null` et qu'un affilié est attribué (`orders.ts:149-155`, `360-366`). Jamais de calcul sur 0. |
| `orders.ts:167,380` `platform_margin_value ?? 0` | **SÛR** — marge nulle = vente au coût, intentionnel ; défaut produit = 20 (`products.ts:124`). |
| `orders.ts:170-171,183-184,383-384,413-414` `confirmation/packaging ?? 10` | **SÛR** — défaut cohérent avec le défaut produit (`products.ts:150-151`) et le capital. |
| `supplier-mirror.ts:95` `factory_cost_mad ?? 0` (coût wholesale pré-rempli) | **TOLÉRÉ** — pré-remplissage ajustable par l'admin (`updateWholesaleOrderCosts`) ; pour un miroir le coût est toujours posé (`supplier-mirror.ts:85-88`). Risque résiduel : produit catalogue legacy sans `factory_cost_mad` → coût ligne 0 → `gross_profit` surévalué jusqu'à correction admin. **Voir L-2.** |
| **`quote-requests.ts:270` `tier?.price_per_unit ?? 0`** | **DANGEREUX** — produit un `total_amount = 0` facturé si aucun palier ne matche. **Voir M-1.** |

### Commission jamais négative versée — OK
- COD public : `Math.max(0, commissionAmount)` aux deux écritures (`orders.ts:215,217`) ; la vente passe, l'affilié touche 0 (`orders.ts:176-179`).
- COD affilié : **blocage strict** `commissionAmount < 0` → refus (`orders.ts:390-396`) + `Math.max(0,…)` défensif (`orders.ts:409,411`).
- Préview produit : `Math.max(0, raw)` (`products.ts:303`).
- Trigger : commission créée seulement si `> 0` (`048:115`).

### Snapshots cohérents — OK
- `commission_amount` = `affiliate_commission_mad_snapshot` = `Math.max(0, commission)` (`orders.ts:215-217,409-411`) ; le trigger lit `COALESCE(snapshot, commission_amount)` (`048:113`).
- `delivery_fee_snapshot = 35` (= provision, cohérent avec capital, `orders.ts:182,412`).
- `packaging/confirmation_fee_snapshot` = valeurs produit (`?? 10`) figées à l'insert.
- `cod_expected = total_amount` = prix vendu × qty (`orders.ts:230,416`).
- Snapshots **immuables après création** (jamais réécrits par `updateOrderStatus`, `orders.ts:516-531`) ; migrations 073/074 **non-rétroactives** sur `orders` (`073:10-11`, `074:15`).

### COD — qui encaisse, qui porte le risque d'impayé
- Le **transporteur COD** encaisse le cash client (`cod_expected`), le reverse à la plateforme ; l'admin saisit `cod_received` (chaîne validée `money.ts`, `orders.ts:486-491`).
- La **commission affilié n'est créée qu'à `delivered`** (`048:109-115`) → un impayé/retour avant livraison ne génère aucune commission ; après `delivered` un `returned`/`cancelled` la **reverse** (`048:142-164`). **L'affilié ne porte pas le risque d'impayé** (il n'est payé que sur encaissement effectif via le cycle approved→payout admin).
- La **plateforme porte** : (a) l'écart livraison réelle vs provision 35, (b) le risque que `cod_received < cod_expected` (non rapproché automatiquement — voir L-3). L'usine est payée hors de ce flux (achat stock en amont).

---

## VERDICT GLOBAL — Finance saine : **OUI pour le cœur affilié/COD (cas 1-3-5), avec UNE anomalie moyenne hors de ce cœur (cas 4 import)**

Le moteur **commission / COD / ledger / payout** (cas 1, 2, 3, et wholesale cas 5) est **sain** : montants `numeric`/centimes entiers (zéro `parseFloat` sur l'argent), arrondi Option B prouvé (commission = 0 pile au catalogue, pas de 0,40 fantôme), livraison et marge comptées une seule fois, commission jamais négative versée, gardes fail-closed sur le coût usine, ledger append-only immuable, payout atomique + idempotent. Tous les bouclages X = Y + Z + W ferment exactement.

### Anomalies / risques par sévérité

**MOYEN**
- **M-1 — Prix de devis perdu à la conversion + `?? 0` silencieux.** `convertQuoteToOrder` (`quote-requests.ts:269-274,300,319-321`) ignore le prix négocié (`quoted_unit_price_mad`) et recalcule `total_amount` depuis `wholesale_tiers` ; si la quantité demandée ne matche aucun palier, `unitPrice = tier?.price_per_unit ?? 0` → **commande facturée 0 MAD**. Le client a accepté un devis non nul, la plateforme peut créer une commande à 0. Hors du cœur affilié (pas de commission/ledger en jeu) mais c'est de l'argent réel. **Reco : facturer le `quoted_unit_price_mad` figé, ou refuser la conversion si aucun palier ne matche (jamais `?? 0`).** Changement financier → circuit `@finance` + `@security-reviewer` + GO Abdou avant toute correction.

**FAIBLE**
- **L-2 — `supplier_cost_mad` pré-rempli à 0 pour catalogue legacy.** `computeSupplierCostMad` retourne 0 par ligne si `factory_cost_mad` est null (`supplier-mirror.ts:95`), gonflant `gross_profit_mad` jusqu'à correction admin (`updateWholesaleOrderCosts`). Pour les miroirs auto-provisionnés le coût est toujours posé → impact limité aux produits catalogue manuels sans coût usine. **Reco : alerter (pas bloquer) si une ligne wholesale a un coût 0.**
- **L-3 — Pas de rapprochement automatique `cod_received` vs `cod_expected`.** L'écart d'encaissement COD (sous-paiement transporteur, livraison partielle) n'est ni calculé ni alerté côté commande COD (la commission, elle, ne dépend pas de l'encaissement — elle se déclenche au statut `delivered`). **Reco : exposer l'écart `cod_expected − cod_received` au tableau admin.**
- **L-4 — Écart provision livraison.** La provision fixe 35 dans le capital peut être < coût transporteur réel hors hubs ; la plateforme absorbe l'écart. C'est un choix métier assumé (`utils.ts:42-47`), pas un bug, mais à monitorer par ville.

### Hors périmètre (signalé par devoir)
La rigueur **technique** (atomicité, idempotence, immuabilité, numeric) est couverte. La **conformité légale/fiscale** (KYC, AML, licences d'établissement de paiement, encaissement COD pour compte de tiers) relève d'un professionnel et n'est PAS traitée ici — cf. notes `048:24-26`, `049:37-39`.
