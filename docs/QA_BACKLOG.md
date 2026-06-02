# QA Backlog — Mozouna Group Platform

> **Status:** Manual QA in progress — documentation only.  
> **Last updated:** 2026-06-02  
> **Do not implement from this file without explicit approval.**

---

## How to use this document

- Each item is a **documented issue**, not a fix commitment.
- **Expected** describes the target behavior after fix.
- Related bugs are cross-linked where they overlap.
- **Implementation strategy:** do not fix everything at once. Work top-down by tier, then by dependency (business rules → schema → flows → UX polish → ops/finance).

---

## Tier 1 — Critical launch blockers

Issues that block a coherent wholesale purchase flow or violate non-negotiable business rules.

| ID | Title | Observed / gap | Expected |
|----|-------|----------------|----------|
| **BUG-017** | Main business rule missing | Platform does not consistently enforce purchase mode by product type. | **Stock available** → direct purchase (quantity, tiers, cart, checkout). **Import / sourcing / OEM / private label** → RFQ only. |
| **BUG-042** | Direct order vs RFQ schema needs final business rule | `availability_type` and UX are not aligned end-to-end across catalog + marketplace. | `local_stock` → direct cart/order; `import_on_demand` / private label / custom sourcing → RFQ workflow. Schema and UI must match. |
| **BUG-001** | Marketplace supplier products force RFQ despite price/stock/MOQ | Supplier marketplace shows price, stock, MOQ but always routes to devis. | Local stock with known price, MOQ, and stock → **direct order** (not RFQ). Related: BUG-013, BUG-004. |
| **BUG-013** | Marketplace Morocco stock has no direct buy CTA | Local-stock marketplace products lack add-to-cart / buy path. | Stock available → **Acheter / Ajouter au panier**; import/custom → RFQ. Related: BUG-001, BUG-009. |
| **BUG-004** | Local order workflow unclear | Wholesalers cannot clearly complete local-stock purchase (tiers, qty, cart, checkout). | Local-stock products: quantity selector, wholesale tiers, cart, checkout → wholesale order. Related: BUG-006, BUG-009. |
| **BUG-005** | Payment validation must remain human-approved | Risk of auto-validation or unclear proof flow. | Upload proof + **admin manual validation**; AI/OCR later **assistance only**, never auto-approve. Related: BUG-044. |
| **BUG-044** | Payment proof workflow missing | No structured buyer upload + admin validation path. | Grossiste uploads proof → admin validates manually → status update; OCR/AI optional assistant later. Related: BUG-005, BUG-027. |
| **BUG-022** | Stock quantity guard not intelligent | Orders can exceed available stock without business-aware rules. | Hard cap at available stock unless `production_possible = true` (see BUG-050). |

---

## Tier 2 — High ROI / business flow issues

High impact on revenue, conversion, and wholesaler trust. Fix after Tier 1 core purchase path is stable.

| ID | Title | Observed / gap | Expected |
|----|-------|----------------|----------|
| **BUG-002** | Wholesale catalog and supplier marketplace overlap | Two surfaces with unclear roles. | Clear separation: **direct-order catalog** (Mozouna stock) vs **RFQ/import marketplace** (supplier sourcing). Related: BUG-008. |
| **BUG-008** | Two catalogues confuse wholesalers | Users don't know which catalog to use for what. | User-facing clarity: direct stock catalog vs sourcing/import marketplace; signposting on dashboard and nav. Related: BUG-002. |
| **BUG-009** | No CTA on catalog cards | List cards are browse-only. | Cards show **Ajouter au panier** or **Commander** when product is stock-available; **Demander un devis** when RFQ-only. Related: BUG-013, BUG-004. |
| **BUG-006** | Quantity input UX is bad | Quantity controlled only via +/- buttons. | **Editable quantity field** plus +/-; respect min qty and stock cap. Related: BUG-004, BUG-022. |
| **BUG-007** | Morocco / stock filter incoherent | “Stock disponible” filter shows wrong products. | **Stock disponible au Maroc** → only products **physically stocked in Morocco**. Related: BUG-014, BUG-046. |
| **BUG-014** | Origin vs stock location mixed | Product origin conflated with where stock sits. | Separate **product origin** from **current stock location** in data model and UI. Related: BUG-046, BUG-007. |
| **BUG-046** | Marketplace “Maroc stock disponible” copy imprecise | Wording does not distinguish origin vs stock. | Label: **Stock disponible au Maroc**; show both origin and current stock location. Related: BUG-014, BUG-007. |
| **BUG-018** | Sale unit is not dynamic | Unit display/validation is generic. | Per-product unit: pcs, kg, g, L, ml, m, m², carton, palette, lot, pair, pack. |
| **BUG-010** | Client order notes visibility unclear | Buyer notes may be missed by ops. | Notes **clearly visible** on admin order detail; **notification/highlight** for new notes. Related: BUG-040. |
| **BUG-019** | Submitted wholesale order cannot be modified by buyer | No pre-processing edit window. | Before admin processing: allow **edit, cancel, add product, update note**. Related: BUG-049. |
| **BUG-020** | Additional costs not explained clearly | Fees surprise buyers at checkout. | Disclaimer for **delivery, packaging, insurance, service fees** before submit. |
| **BUG-021** | Out-of-stock handling too rigid | Binary in-stock / out-of-stock only. | Distinguish: **unavailable**, **production possible**, **partial stock**, **preorder**. Related: BUG-050, BUG-022. |
| **BUG-047** | Wholesale order source not visible enough | Admin cannot quickly see order provenance. | Admin order detail shows source: **internal catalog**, **supplier marketplace local stock**, **import quote**, **sourcing request**, **RFQ**. |
| **BUG-016** | No higher-tier incentive | No nudge toward better tier pricing. | Message: *“Add X units to reach next price tier and save Y MAD.”* |

---

## Tier 3 — Operations and finance

Back-office, roles, cash, profit truth, sourcing ops, and compliance. Not launch-day UI blockers but required for professional operations.

| ID | Title | Observed / gap | Expected |
|----|-------|----------------|----------|
| **BUG-024** | Missing Owner role | No superadmin override layer. | **Owner / superadmin** with override and correction permissions. Related: BUG-045, BUG-048. |
| **BUG-045** | Role permissions need hardening | Roles lack fine-grained boundaries. | **Owner, Admin, Manager, Agent sourcing, Agent confirmation, Supplier, Wholesaler** with correct permissions. Related: BUG-024. |
| **BUG-048** | No correction window / audit trail | Mistakes hard to fix with accountability. | Owner can correct mistakes; **all edits logged** (before/after, timestamp, reason). |
| **BUG-023** | Admin stats may be wrong | Metrics mix real, test, inactive users. | Distinguish **real active**, **test/demo**, **deleted/inactive**, **approved** users. |
| **BUG-025** | No operational alert system | Ops discovers problems late. | **Orange / red / critical** alerts: blocked orders, late sourcing, missing payments, supplier delays. Related: BUG-030, BUG-035. |
| **BUG-026** | No internal task center | Follow-ups live in heads/WhatsApp. | Tasks: follow supplier, verify payment, confirm stock, send quote, call client, blocked order. Related: BUG-030. |
| **BUG-027** | Payment method / caisse missing | No structured payment channel recording. | Record: cash, CIH, Attijari, company bank, UAE company, Turkey company, USDT, other caisse. Related: BUG-028, BUG-044. |
| **BUG-028** | Multi-caisse finance missing | No cashbox by currency/account. | Cashbox system: **MAD, AED, TRY, USD, USDT, RMB, EGP**. Related: BUG-027. |
| **BUG-029** | Profit calculation is misleading | Margin excludes real costs. | Profit includes: supplier cost, delivery, packaging, customs/import, platform commission, affiliate commission, other costs. |
| **BUG-030** | Missing owner dashboard | No single ops/finance command view. | Critical alerts, blocked orders, cash balances, real profit, pending payments, late sourcing, top suppliers, cancellation risk. Related: BUG-025, BUG-026. |
| **BUG-049** | No cancellation/return workflow for wholesale | No structured post-submit lifecycle. | Statuses: cancellation requested, cancelled by admin, returned, partially delivered, refund/credit note if needed. Related: BUG-019. |
| **BUG-031** | Sourcing admin cannot process requests professionally | Admin sourcing is a static list. | Detail page: assign agent, create quote, contact supplier, notes, files, status changes, reply to client. Related: BUG-033–BUG-037, BUG-041. |
| **BUG-032** | Sourcing status workflow missing | No defined sourcing lifecycle. | Statuses: pending, assigned, supplier_search, offers_received, quote_created, quote_sent, accepted, rejected, blocked, cancelled. |
| **BUG-033** | Sourcing detail page missing | No rich request view. | Client info, phone, email, product, quantity, budget, origin, deadline, notes, attachments, timeline. |
| **BUG-034** | Sourcing assignment missing | Requests not routed to team. | Assign request to **team member / agent**. |
| **BUG-035** | Sourcing SLA / alarms missing | No timeliness tracking. | On time / late / critical with owner/admin alerts. Related: BUG-025. |
| **BUG-036** | Internal sourcing notes missing | No private ops notes. | Private notes visible only to **owner / admin / assigned agent**. |
| **BUG-037** | Cannot create quote from sourcing | Sourcing → quote → order chain broken. | Sourcing request → supplier offers → create quote → send to grossiste → accept/refuse → order. |
| **BUG-041** | Admin sourcing module too static | Not a workable mini-CRM. | Professional **mini-CRM**, not static list. Related: BUG-031. |

---

## Tier 4 — UX / conversion

Improves clarity, attachment, and conversion. Safe to schedule after Tier 1–2 purchase flows work.

| ID | Title | Observed / gap | Expected |
|----|-------|----------------|----------|
| **BUG-003** | “Profil d’achat” wording unclear | Label confuses wholesalers. | Replace with **Type d’activité**: Boutique physique, Instagram/Facebook Shop, E-commerce, Distributeur, Importateur. |
| **BUG-011** | Sourcing intelligent missing attachments | Free-form sourcing lacks media. | Allow: photo, video, PDF, links, screenshots, Alibaba/1688/TikTok links. |
| **BUG-012** | Sample/document request missing file types | Sample flow too limited. | Allow: PDF, catalogue, certificate, lab report, technical sheet. |
| **BUG-015** | No upsell/cross-sell after add to cart | Missed basket expansion. | Show similar products, bundles, complementary items after add-to-cart. |
| **BUG-043** | Product images / placeholders inconsistent | Marketplace quality uneven. | Enforce at least **one clean product image** for marketplace-quality display. |

---

## Tier 5 — Later improvements

Valuable but defer until core purchase, ops, and finance foundations exist.

| ID | Title | Observed / gap | Expected |
|----|-------|----------------|----------|
| **BUG-038** | Sourcing has no conversation thread | No structured client comms history. | Internal conversation with client, separate from internal notes. Related: BUG-036. |
| **BUG-039** | No supplier research tracking | Sourcing research not captured. | Track: supplier contacted, price, MOQ, lead time, response status, files/photos, reliability score. |
| **BUG-040** | Notifications missing | No in-app/event notifications. | Notify on: new order, new sourcing request, RFQ, payment update, quote ready, blocked order, delayed supplier. Related: BUG-010, BUG-025. |
| **BUG-050** | No production / overstock logic | Low stock = hard stop. | If stock low but production possible: show available stock, production delay, preorder/production order option. Related: BUG-021, BUG-022. |

---

## Implementation strategy (summary)

### Priority groups for execution

| Group | Bug IDs | Rationale |
|-------|---------|-----------|
| **Critical launch blocker** | BUG-017, BUG-042, BUG-001, BUG-013, BUG-004, BUG-005, BUG-044, BUG-022 | Core rule: stock = buy, import = RFQ; payment stays human-approved; stock guards. |
| **High ROI** | BUG-002, BUG-008, BUG-009, BUG-006, BUG-007, BUG-014, BUG-046, BUG-018, BUG-010, BUG-019, BUG-020, BUG-021, BUG-047, BUG-016 | Catalog clarity, CTAs, filters, units, notes, pre-processing edits, cost transparency. |
| **Medium (operations & finance)** | BUG-023–BUG-030, BUG-024, BUG-045, BUG-048, BUG-049, BUG-031–BUG-037, BUG-041 | Roles, cashboxes, profit truth, alerts, tasks, sourcing CRM, audit trail. |
| **Later** | BUG-003, BUG-011, BUG-012, BUG-015, BUG-043, BUG-038, BUG-039, BUG-040, BUG-050 | Wording polish, attachments, upsell, images, notifications, advanced stock/production. |

### Suggested fix order (do not batch all 50)

1. **Define and lock business rule** (BUG-017, BUG-042) — document `availability_type` → UX mapping; approve schema if supplier cart needed.
2. **Local direct purchase path** (BUG-001, BUG-004, BUG-013, BUG-009, BUG-006) — marketplace + catalog CTAs, cart, checkout.
3. **Catalog IA** (BUG-002, BUG-008, BUG-047) — naming, nav, admin source labels.
4. **Stock & location truth** (BUG-007, BUG-014, BUG-046, BUG-021, BUG-022) — filters, origin vs stock, guards.
5. **Payment proof** (BUG-005, BUG-044) — upload + admin validation only.
6. **Buyer post-submit** (BUG-019, BUG-010, BUG-020) — edit window, notes, fee disclaimers.
7. **Operations layer** (BUG-024–BUG-030, BUG-031–BUG-037, BUG-041) — roles, finance, sourcing CRM, alerts.
8. **Conversion & polish** (Tier 4–5) — attachments, upsell, notifications, production logic.

### Explicit non-goals for first pass

- Full unified catalog merge (address confusion via copy/signposting first — BUG-002, BUG-008).
- AI/OCR auto-payment validation (BUG-005).
- Complete owner dashboard before direct purchase works (BUG-030).
- Notification system before core flows are stable (BUG-040).

---

## Cross-reference index

| Theme | Bug IDs |
|-------|---------|
| Direct purchase vs RFQ | BUG-001, BUG-004, BUG-013, BUG-017, BUG-042 |
| Two catalogs / IA | BUG-002, BUG-008, BUG-009 |
| Stock & location | BUG-007, BUG-014, BUG-021, BUG-022, BUG-046, BUG-050 |
| Payment & proof | BUG-005, BUG-027, BUG-028, BUG-044 |
| Wholesale order lifecycle | BUG-010, BUG-019, BUG-047, BUG-049 |
| Sourcing ops | BUG-011, BUG-031–BUG-041 |
| Roles & audit | BUG-024, BUG-045, BUG-048 |
| Finance & profit | BUG-029, BUG-030 |
| UX / conversion | BUG-003, BUG-006, BUG-012, BUG-015, BUG-016, BUG-043 |
| Alerts & tasks | BUG-025, BUG-026, BUG-035, BUG-040 |

---

## QA session log

| Date | Action |
|------|--------|
| 2026-06-02 | Initial backlog documented (BUG-001–BUG-050) from manual QA collection. |

---

*End of backlog — awaiting further QA findings before implementation.*
