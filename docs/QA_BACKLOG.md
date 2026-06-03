# QA Backlog — Mozouna Group Platform

> **Status:** Manual QA in progress — documentation only.  
> **Last updated:** 2026-06-02 (BUG-052 added — gap fill)  
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
| **BUG-051** | Marketplace RFQ routed away from “Demandes de devis” | Wholesaler clicks **Demander un devis** on a marketplace product → success toast; admin checks **Demandes de devis** → request not found. QA reports request visible under **Sourcing intelligent** instead. | Clearly separate **marketplace RFQ** (existing product) from **sourcing request** (product not found). Marketplace RFQ must appear in **Admin → Demandes de devis** or a unified **Demandes commerciales** module with `type = marketplace_rfq`. Admin must see: source, product name, product ID, wholesaler, quantity/MOQ, target/listed price, notes, status; actions: prepare quote / reply / convert to order. **Impact:** ops confusion — team searches wrong module and misses requests. Related: BUG-002, BUG-031, BUG-047, BUG-054, **BUG-052**. See [BUG-051 technical note](#bug-051-technical-note-code-audit). |
| **BUG-052** | Admin sourcing/RFQ row is not actionable | **Admin → Sourcing intelligent** (and related RFQ lists) show request rows as static cards — no dedicated detail page, no clear primary action to open, assign, reply, prepare quote, or convert. Rows display data but ops cannot process a single request professionally from the list. | Each sourcing/RFQ row must be **actionable**: open detail; assign agent; change status; add notes; contact wholesaler/supplier; prepare/send quote; convert to order. Distinct actions for **custom sourcing** vs **marketplace RFQ** misrouted here (see BUG-051). **Impact:** ops blocker — requests visible but not processable. Related: BUG-031, BUG-033, BUG-041, BUG-051, BUG-057. |
| **BUG-054** | Wholesaler cannot see submitted marketplace RFQ in “Mes demandes de devis” | After marketplace **Demander un devis**, success toast shown but **Wholesale → Demandes de devis → Mes devis** shows 0 requests (“Aucune demande de devis pour le moment.”). QA reports admin sees request under Sourcing intelligent (see BUG-051). | Wholesaler must see submitted marketplace RFQ in their dashboard: product, date, quantity/MOQ, origin, status (pending / in review / quote prepared / sent / accepted / refused), admin reply, attachments, actions (detail, reply, accept/refuse quote). **Impact:** critical CX — confirmation with no tracking, no proof, forces WhatsApp dependency. **Business decision:** (1) route marketplace RFQ into existing **Mes demandes de devis**, or (2) unified **Mes demandes commerciales** (marketplace RFQ + sourcing + samples + import). Related: BUG-051, BUG-008, BUG-031. See [BUG-054 technical note](#bug-054-technical-note-code-audit). |
| **BUG-055** | Sample/document request on direct-order product not traceable enough | On local-stock marketplace product, wholesaler can submit **Demander un échantillon / document** and sees success (“Notre équipe traitera votre demande…”). Unclear whether request appears in **Mes demandes d’échantillons**, **Admin → Médiation échantillons**, or is linked to product/wholesaler; unclear if admin can open, reply, upload, or mark received. | Every sample/document request must create a **visible tracked record** for wholesaler and admin. **Wholesaler:** product name, request type (photo / video / PDF / fiche technique / échantillon physique), status, date, admin reply, downloadable approved files. **Admin:** product, wholesaler, request type, message, product link/image, status; actions: open, reply, upload file, approve, reject, mark sent, mark received. **Impact:** high ops risk — confirmation without clear tracking path. Related: BUG-012, BUG-054, BUG-010. See [BUG-055 technical note](#bug-055-technical-note-code-audit). |
| **BUG-056** | Direct-order local stock mixes order and RFQ/sample logic unclearly | Product can show local stock, known price, MOQ, **Ajouter au panier**, and **Demander échantillon/document** simultaneously — acceptable — but platform does not clearly separate **direct purchase**, **sample/document**, **quote/RFQ**, and **sourcing**. RFQ may appear as default or equal-weight CTA on stock-local products. | **Stock-local products:** primary CTA = **Ajouter au panier / Commander en gros**; secondary = **Demander document / échantillon**; RFQ only if price/stock unknown or qty exceeds available stock. **Import/custom products:** primary = **Demander un devis**; secondary = sample/document. Clear visual hierarchy and copy so grossistes know buy vs quote vs sample vs WhatsApp. **Impact:** conversion risk — users unsure whether to buy, RFQ, sample, or wait. Related: BUG-001, BUG-013, BUG-017, BUG-042, BUG-055, BUG-009. |
| **BUG-057** | Dashboard counters and modules not connected clearly | After submitting requests/orders, counters update inconsistently across modules. Observed: admin **Commandes gros à traiter** increases; **Sourcing intelligent** shows count; **Demandes de devis** stays 0; wholesaler **Mes devis** stays 0; **Mes demandes d’échantillons** may stay 0. | Each user action must update the **correct dashboard counter** and land in the **correct module**. Explicit mapping: direct stock order → **Commandes grossiste**; marketplace RFQ → **Demandes de devis** or unified **demandes commerciales**; custom sourcing → **Sourcing intelligent**; sample/document → **Médiation échantillons** + **Mes demandes d’échantillons**; payment proof → **Paiements / Finance**. **Impact:** critical ops confusion — admin and wholesaler cannot tell where each request went. Related: BUG-051, BUG-054, BUG-055, BUG-056, BUG-053, BUG-047. See [BUG-057 routing map](#bug-057-routing-map). |
| **BUG-058** | Wholesaler sample requests page route broken or inconsistent | Dashboard CTA **Demandes d’échantillons → Mes demandes** exists, but `/wholesale/sample-requests` returns **404**. Admin **Médiation échantillons** does show the submitted request — wholesaler cannot reach or use the expected tracking route. | Working **Mes demandes d’échantillons** page at a consistent URL. Show: product name, request type (photos / video / PDF / fiche technique / échantillon physique), message, date, status (pending / approved / rejected / files_available / shipped / received), admin reply, downloadable approved files, physical-sample tracking if applicable. **Impact:** CX blocker — submit works, admin sees it, wholesaler cannot track from expected route. Related: BUG-055, BUG-057, BUG-012. See [BUG-058 technical note](#bug-058-technical-note-code-audit). |
| **BUG-059** | Admin sample mediation lacks professional processing workflow | **Admin → Médiation échantillons** lists sample/document requests but admin can effectively only **approve or reject** supplier files. Missing: detail page, product link/image, wholesaler contact, admin upload (photo/video/PDF/catalogue/certificate), reply to wholesaler, assign agent, internal notes, status history, shipping/tracking, SLA alerts. | Professional request-processing module. Admin can: open detail; view product + buyer; upload requested files; approve/reject with reason; reply to wholesaler; assign to team member; mark physical sample prepared/sent/received; track history and deadlines. **Impact:** high ops blocker — request exists but cannot be processed professionally or return files to wholesaler. Related: BUG-055, BUG-058, BUG-012, BUG-031, BUG-034, BUG-035, BUG-053. See [BUG-059 technical note](#bug-059-technical-note-code-audit). |
| **BUG-016** | No higher-tier incentive | No nudge toward better tier pricing. | Message: *“Add X units to reach next price tier and save Y MAD.”* |

---

## Tier 3 — Operations and finance

Back-office, roles, cash, profit truth, sourcing ops, and compliance. Not launch-day UI blockers but required for professional operations.

| ID | Title | Observed / gap | Expected |
|----|-------|----------------|----------|
| **BUG-024** | Missing Owner role | No superadmin override layer. | **Owner / superadmin** with override and correction permissions. Related: BUG-045, BUG-048. |
| **BUG-045** | Role permissions need hardening | Roles lack fine-grained boundaries. | **Owner, Admin, Manager, Agent sourcing, Agent confirmation, Supplier, Wholesaler** with correct permissions. Related: BUG-024, **BUG-053** (full role matrix). |
| **BUG-048** | No correction window / audit trail | Mistakes hard to fix with accountability. | Owner can correct mistakes; **all edits logged** (before/after, timestamp, reason). |
| **BUG-023** | Admin stats may be wrong | Metrics mix real, test, inactive users. | Distinguish **real active**, **test/demo**, **deleted/inactive**, **approved** users. |
| **BUG-025** | No operational alert system | Ops discovers problems late. | **Orange / red / critical** alerts: blocked orders, late sourcing, missing payments, supplier delays. Related: BUG-030, BUG-035, **BUG-053**. |
| **BUG-026** | No internal task center | Follow-ups live in heads/WhatsApp. | Tasks: follow supplier, verify payment, confirm stock, send quote, call client, blocked order. Related: BUG-030, **BUG-053**. |
| **BUG-027** | Payment method / caisse missing | No structured payment channel recording. | Record: cash, CIH, Attijari, company bank, UAE company, Turkey company, USDT, other caisse. Related: BUG-028, BUG-044, **BUG-061**. |
| **BUG-028** | Multi-caisse finance missing | No cashbox by currency/account. | Cashbox system: **MAD, AED, TRY, USD, USDT, RMB, EGP**. Related: BUG-027. |
| **BUG-029** | Profit calculation is misleading | Margin excludes real costs. | Profit includes: supplier cost, delivery, packaging, customs/import, platform commission, affiliate commission, other costs. Related: **BUG-060**. |
| **BUG-060** | Affiliate payout marks all approved commissions as paid without granular selection | **Admin → Paiements affiliés:** select affiliate + enter amount; page states all **approved** commissions for that affiliate are **automatically marked paid**. No per-commission selection. | Admin selects **exactly which commissions** are included in a payout. Required: list approved unpaid commissions; checkbox per commission; total selected; amount actually paid; remaining balance if partial; payment method; payment reference; optional proof upload; audit trail. **Impact:** high finance risk — accidental bulk mark-paid; amount entered may not match commissions included; partial payouts untraceable. Related: BUG-027, BUG-028, BUG-044, BUG-048, BUG-029, **BUG-061**. See [BUG-060 technical note](#bug-060-technical-note-code-audit). |
| **BUG-061** | Affiliate payout lacks payment method and cashbox/caisse tracking | **Admin → Paiements affiliés** captures amount and transfer reference only — no structured **payment method** or **caisse** selection. | Every payout records: payment method (cash, bank transfer, CIH, Attijari, company bank, PayPal, Wise, USDT, other); **cashbox/caisse** used; currency; reference number; payment date; paid-by user; owner approval if required. **Impact:** finance/accounting risk — outflows not tied to a specific caisse or payment channel. Related: BUG-027, BUG-028, BUG-060, BUG-048, BUG-053. See [BUG-061 technical note](#bug-061-technical-note-code-audit). |
| **BUG-030** | Missing owner dashboard | No single ops/finance command view. | Critical alerts, blocked orders, cash balances, real profit, pending payments, late sourcing, top suppliers, cancellation risk. Related: BUG-025, BUG-026, **BUG-057**. |
| **BUG-049** | No cancellation/return workflow for wholesale | No structured post-submit lifecycle. | Statuses: cancellation requested, cancelled by admin, returned, partially delivered, refund/credit note if needed. Related: BUG-019. |
| **BUG-031** | Sourcing admin cannot process requests professionally | Admin sourcing is a static list. | Detail page: assign agent, create quote, contact supplier, notes, files, status changes, reply to client. Related: BUG-033–BUG-037, BUG-041, **BUG-052**. |
| **BUG-032** | Sourcing status workflow missing | No defined sourcing lifecycle. | Statuses: pending, assigned, supplier_search, offers_received, quote_created, quote_sent, accepted, rejected, blocked, cancelled. |
| **BUG-033** | Sourcing detail page missing | No rich request view. | Client info, phone, email, product, quantity, budget, origin, deadline, notes, attachments, timeline. |
| **BUG-034** | Sourcing assignment missing | Requests not routed to team. | Assign request to **team member / agent**. Related: **BUG-053**. |
| **BUG-035** | Sourcing SLA / alarms missing | No timeliness tracking. | On time / late / critical with owner/admin alerts. Related: BUG-025, **BUG-053**. |
| **BUG-036** | Internal sourcing notes missing | No private ops notes. | Private notes visible only to **owner / admin / assigned agent**. |
| **BUG-037** | Cannot create quote from sourcing | Sourcing → quote → order chain broken. | Sourcing request → supplier offers → create quote → send to grossiste → accept/refuse → order. |
| **BUG-041** | Admin sourcing module too static | Not a workable mini-CRM. | Professional **mini-CRM**, not static list. Related: BUG-031, **BUG-059** (parallel gap for samples). |
| **BUG-053** | Role-based alerts, permissions, and task routing missing | Alert/notification logic not designed for real team ops. Owner would receive every notification in production; no role-based routing, assignment, or escalation. | **Role-based notifications, permissions, and task assignment** for a multi-person ops team. Required roles: Owner/Super Admin, Admin, Supervisor/Manager, Sourcing Agent, Client Support Agent, Confirmation Agent, Finance/Cashier, Supplier, Wholesaler. Per-event routing with SLA timers and escalation (assigned agent → supervisor → owner by severity). Modules: notification center, task center, assigned-to field, RBAC, SLA timers, escalation rules, audit trail. **Impact:** critical operational scalability — owner noise, missed tasks, unescalated blockers, uncontrolled financial actions. Related: BUG-024, BUG-025, BUG-026, BUG-034, BUG-035, BUG-040, BUG-045, BUG-048. See [BUG-053 specification](#bug-053-specification). |

---

## Tier 4 — UX / conversion

Improves clarity, attachment, and conversion. Safe to schedule after Tier 1–2 purchase flows work.

| ID | Title | Observed / gap | Expected |
|----|-------|----------------|----------|
| **BUG-003** | “Profil d’achat” wording unclear | Label confuses wholesalers. | Replace with **Type d’activité**: Boutique physique, Instagram/Facebook Shop, E-commerce, Distributeur, Importateur. |
| **BUG-011** | Sourcing intelligent missing attachments | Free-form sourcing lacks media. | Allow: photo, video, PDF, links, screenshots, Alibaba/1688/TikTok links. |
| **BUG-012** | Sample/document request missing file types | Sample flow too limited. | Allow: PDF, catalogue, certificate, lab report, technical sheet. Related: **BUG-055**. |
| **BUG-015** | No upsell/cross-sell after add to cart | Missed basket expansion. | Show similar products, bundles, complementary items after add-to-cart. |
| **BUG-043** | Product images / placeholders inconsistent | Marketplace quality uneven. | Enforce at least **one clean product image** for marketplace-quality display. |

---

## Tier 5 — Later improvements

Valuable but defer until core purchase, ops, and finance foundations exist.

| ID | Title | Observed / gap | Expected |
|----|-------|----------------|----------|
| **BUG-038** | Sourcing has no conversation thread | No structured client comms history. | Internal conversation with client, separate from internal notes. Related: BUG-036. |
| **BUG-039** | No supplier research tracking | Sourcing research not captured. | Track: supplier contacted, price, MOQ, lead time, response status, files/photos, reliability score. |
| **BUG-040** | Notifications missing | No in-app/event notifications. | Notify on: new order, new sourcing request, RFQ, payment update, quote ready, blocked order, delayed supplier. Related: BUG-010, BUG-025, **BUG-053** (superseded by full role-based routing spec). |
| **BUG-050** | No production / overstock logic | Low stock = hard stop. | If stock low but production possible: show available stock, production delay, preorder/production order option. Related: BUG-021, BUG-022. |

---

## Implementation strategy (summary)

### Priority groups for execution

| Group | Bug IDs | Rationale |
|-------|---------|-----------|
| **Critical launch blocker** | BUG-017, BUG-042, BUG-001, BUG-013, BUG-004, BUG-005, BUG-044, BUG-022 | Core rule: stock = buy, import = RFQ; payment stays human-approved; stock guards. |
| **High ROI** | BUG-002, BUG-008, BUG-009, BUG-006, BUG-007, BUG-014, BUG-046, BUG-018, BUG-010, BUG-019, BUG-020, BUG-021, BUG-047, BUG-051, BUG-054, BUG-055, BUG-056, BUG-057, **BUG-058**, BUG-016 | Catalog clarity, CTAs, dashboard routing, **wholesaler sample page**, quote tracking. |
| **Medium (operations & finance)** | BUG-023–BUG-030, BUG-024, BUG-045, BUG-048, BUG-049, BUG-031–BUG-037, BUG-041, BUG-052, BUG-053, BUG-059, BUG-060, BUG-061 | Roles, cashboxes, profit truth, affiliate payout controls, **actionable sourcing/RFQ rows**, alerts, tasks, sample mediation CRM, audit trail. |
| **Later** | BUG-003, BUG-011, BUG-012, BUG-015, BUG-043, BUG-038, BUG-039, BUG-040, BUG-050 | Wording polish, attachments, upsell, images, basic notifications (see BUG-053 for full ops routing), advanced stock/production. |

### Suggested fix order (do not batch all 50)

1. **Define and lock business rule** (BUG-017, BUG-042) — document `availability_type` → UX mapping; approve schema if supplier cart needed.
2. **Local direct purchase path** (BUG-001, BUG-004, BUG-013, BUG-009, BUG-006) — marketplace + catalog CTAs, cart, checkout.
3. **Catalog IA** (BUG-002, BUG-008, BUG-047) — naming, nav, admin source labels.
4. **Stock & location truth** (BUG-007, BUG-014, BUG-046, BUG-021, BUG-022) — filters, origin vs stock, guards.
5. **Payment proof** (BUG-005, BUG-044) — upload + admin validation only.
6. **Buyer post-submit** (BUG-019, BUG-010, BUG-020) — edit window, notes, fee disclaimers.
7. **Operations layer** (BUG-024–BUG-030, BUG-031–BUG-037, BUG-041, **BUG-053**) — roles, finance, sourcing CRM, alerts, **role-based task routing**.
8. **Conversion & polish** (Tier 4–5) — attachments, upsell, notifications, production logic.

### Explicit non-goals for first pass

- Full unified catalog merge (address confusion via copy/signposting first — BUG-002, BUG-008).
- AI/OCR auto-payment validation (BUG-005).
- Complete owner dashboard before direct purchase works (BUG-030).
- Notification system before core flows are stable (BUG-040 — basic; **BUG-053** is full ops routing, defer until Phase 7).

---

## Cross-reference index

| Theme | Bug IDs |
|-------|---------|
| Direct purchase vs RFQ | BUG-001, BUG-004, BUG-013, BUG-017, BUG-042, **BUG-056** |
| Two catalogs / IA | BUG-002, BUG-008, BUG-009 |
| Stock & location | BUG-007, BUG-014, BUG-021, BUG-022, BUG-046, BUG-050 |
| Payment & proof | BUG-005, BUG-027, BUG-028, BUG-044, BUG-060, **BUG-061** |
| Wholesale order lifecycle | BUG-010, BUG-019, BUG-047, BUG-049 |
| Quote / RFQ admin & wholesaler routing | BUG-051, BUG-052, BUG-054, BUG-047, BUG-031, BUG-037, **BUG-057** |
| Sample & document requests | BUG-012, BUG-055, BUG-056, BUG-057, BUG-058, **BUG-059** |
| Dashboard & counter routing | **BUG-057**, BUG-030, BUG-053 |
| Sourcing ops | BUG-011, BUG-031–BUG-041, **BUG-052** |
| Roles & audit | BUG-024, BUG-045, BUG-048, **BUG-053** |
| Finance & profit | BUG-029, BUG-030, BUG-060, **BUG-061** |
| UX / conversion | BUG-003, BUG-006, BUG-012, BUG-015, BUG-016, BUG-043 |
| Alerts, tasks & routing | BUG-025, BUG-026, BUG-034, BUG-035, BUG-040, **BUG-053** |

---

## QA session log

| Date | Action |
|------|--------|
| 2026-06-02 | Initial backlog documented (BUG-001–BUG-050) from manual QA collection. |
| 2026-06-02 | BUG-051 added — marketplace RFQ vs admin module routing (ops confusion). |
| 2026-06-02 | BUG-053 added — role-based alerts, permissions, task routing (ops scalability). |
| 2026-06-02 | BUG-054 added — wholesaler cannot track marketplace RFQ in “Mes devis”. |
| 2026-06-02 | BUG-055 added — sample/document request traceability gaps. |
| 2026-06-02 | BUG-056 added — local stock CTA hierarchy (buy vs RFQ vs sample). |
| 2026-06-02 | BUG-057 added — dashboard counters not mapped to correct modules. |
| 2026-06-02 | BUG-058 added — wholesaler sample route 404 / inconsistent URL. |
| 2026-06-02 | BUG-059 added — admin sample mediation lacks full workflow. |
| 2026-06-02 | BUG-060 added — affiliate payout lacks per-commission selection. |
| 2026-06-02 | BUG-061 added — affiliate payout lacks payment method/caisse tracking. |
| 2026-06-02 | BUG-052 added — admin sourcing/RFQ row not actionable (gap fill). |

---

## Technical notes (code audit, documentation only)

### BUG-051 technical note (code audit)

**Wholesaler action:** `MarketplaceQuoteForm` → `requestSupplierProductQuote()` in `src/app/actions/supplier-products.ts`.

**Current insert target:** `supplier_quote_requests` (not `quote_requests`, not `sourcing_requests`).

**Current admin surfaces (fragmented):**

| Admin route | Label | Table | Scope |
|-------------|-------|-------|-------|
| `/admin/quote-requests` | Demandes de devis | `quote_requests` | Internal catalog import products (`products.product_id`) |
| `/admin/supplier-quotes` | Devis fournisseurs | `supplier_quote_requests` | **Marketplace product RFQ** (`supplier_products`) |
| `/admin/sourcing` | Sourcing intelligent | `sourcing_requests` | Free-form sourcing (`/wholesale/sourcing`) — product **not** in catalog |

**Gap vs QA expectation:** Marketplace RFQ is **not** listed under “Demandes de devis”. `/admin/supplier-quotes` exists but is **not linked from the admin dashboard** (unlike quote-requests and sourcing). Ops naturally check “Demandes de devis” first and find nothing.

**If request appears under Sourcing:** Code path does not insert into `sourcing_requests` on marketplace devis submit — verify repro (separate sourcing submission vs misidentified module). Fix either way: unified commercial-requests inbox with explicit `request_type`.

**Suggested fix direction (when approved):** Unified admin queue or redirect marketplace RFQ into “Demandes de devis” with type badge; keep sourcing for unfound products only; add dashboard link + badge count for marketplace RFQs. **Wholesaler side:** mirror in “Mes demandes de devis” or unified “Mes demandes commerciales” (BUG-054).

### BUG-054 technical note (code audit)

**Wholesaler list page:** `/wholesale/quote-requests` queries **`quote_requests`** only (`product:products!product_id`).

**Marketplace submit:** `requestSupplierProductQuote()` inserts into **`supplier_quote_requests`** — no wholesaler-facing list or detail route exists for this table today.

**Gap:** Success UI implies the request is trackable under “Mes demandes de devis”, but that page cannot show marketplace RFQs. Wholesaler has separate pages for sourcing (`/wholesale/sourcing`) and samples (`/wholesale/samples`) — marketplace RFQ falls through the cracks.

**Business decision (pending approval):**

| Option | Description |
|--------|-------------|
| **A** | Extend `/wholesale/quote-requests` to include `supplier_quote_requests` (marketplace RFQ) with type badge |
| **B** | New unified `/wholesale/requests` (“Mes demandes commerciales”): marketplace RFQ, sourcing, samples, import quotes |

**Fix together with:** BUG-051 (admin-side routing) — same data model, both sides of the inbox.

### BUG-055 technical note (code audit)

**Submit path:** `SampleRequestClient` → `submitSampleRequest()` → inserts into **`sample_requests`** (`wholesaler_id`, `supplier_product_id`, `request_type`, `message`).

**Wholesaler list:** `/wholesale/samples` queries `sample_requests` for `wholesaler_id = auth.uid()` — **should** show submitted requests if insert + RLS succeed.

**Admin list:** `/admin/samples` (“Médiation échantillons & catalogues”) queries `sample_requests` — mixed UI with catalog/attachment moderation, no dedicated detail page.

**Known gaps vs QA expectation (even if record exists):**

| Gap | Detail |
|-----|--------|
| **No post-success wayfinding** | Success on product page does not link to `/wholesale/samples` or show request ID |
| **Wholesaler cannot see admin reply** | `admin_notes` shown on admin list only, not on wholesaler page |
| **No detail pages** | List-only on both sides; no open/reply/thread workflow |
| **Admin wholesaler identity** | Admin sample list shows product name but not wholesaler profile (by design in migration 036 — may block ops) |
| **No admin file upload action** | Supplier uploads → admin approves files; no admin-direct upload/reply in UI |
| **Request types limited** | `photos`, `video`, `technical_sheet`, `sample` only — missing catalogue/certificate/lab report (BUG-012) |
| **RLS / role guard** | Action + RLS require `my_role() = 'wholesaler'` — users with `wholesale_access` only may fail silently or not see rows |
| **Discoverability** | Dashboard links to samples exist but easy to miss after marketplace submit |

**QA verification needed:** Confirm whether request is missing from DB or present but hard to find / incomplete in UI.

**Fix direction (when approved):** Post-submit link to tracking page; detail view both sides; show admin reply to wholesaler; admin row with wholesaler + product link; full status actions; extend types (BUG-012); consider unified “Mes demandes commerciales” (BUG-054).

### BUG-057 routing map

Explicit action → module → counter mapping (target state):

| User action | Data target | Admin module | Admin counter/badge | Wholesaler module | Wholesaler counter |
|-------------|-------------|--------------|---------------------|-------------------|-------------------|
| Direct stock order (cart submit) | `wholesale_orders` | Commandes grossiste | Commandes gros à traiter | Mes commandes | Commandes / panier |
| Internal catalog import RFQ | `quote_requests` | Demandes de devis | Demandes de devis (new) | Mes demandes de devis | Mes devis |
| Marketplace product RFQ | `supplier_quote_requests` | Demandes de devis **or** Devis fournisseurs **or** unified demandes commerciales | Same module badge | Mes devis **or** unified demandes commerciales | Same |
| Custom sourcing (product not found) | `sourcing_requests` | Sourcing intelligent | Sourcing pending | Sourcing intelligent | Sourcing |
| Sample / document request | `sample_requests` | Médiation échantillons | Échantillons en attente | Mes demandes d’échantillons | Échantillons |
| Payment proof upload | payment history / proof table | Paiements / Finance | Pending validation | Order payment status | — |

**Current gaps (QA-observed):** Marketplace RFQ increments wrong admin module (Sourcing vs Devis); wholesaler devis counter reads `quote_requests` only (BUG-054); sample counter may not refresh or RLS may hide row (BUG-055).

**Fix together with:** BUG-051, BUG-054, BUG-055, BUG-056 — one routing spec for data, UI, and dashboard badges on both sides.

### BUG-058 technical note (code audit)

**Route mismatch:**

| URL | Status |
|-----|--------|
| `/wholesale/sample-requests` | **404** — no route file (QA-expected URL) |
| `/wholesale/samples` | **Exists** — `src/app/(wholesale)/wholesale/samples/page.tsx` |

**Dashboard CTA:** links to `/wholesale/samples` (not `/wholesale/sample-requests`) — label says “Mes demandes →” under “Demandes d’échantillons”.

**Naming inconsistency:** Other wholesaler modules use plural resource names with hyphens: `/wholesale/quote-requests`, `/wholesale/sourcing` — samples uses `/wholesale/samples` only; `sample-requests` alias missing.

**Page content gaps** (even on `/wholesale/samples`): no admin reply display; statuses differ from QA spec (`pending`, `supplier_reply`, `approved`, `rejected`, `shipped`, `delivered` — no `files_available` / `received`); no physical-sample tracking; list-only (no detail page).

**If wholesaler sees empty list on `/wholesale/samples`:** see BUG-055 (RLS requires `role = wholesaler`; post-submit no redirect/link).

**Fix direction (when approved):** Add redirect `/wholesale/sample-requests` → `/wholesale/samples` or rename route; align URL naming; post-submit link from marketplace; complete page fields per BUG-055.

### BUG-059 technical note (code audit)

**Current admin page:** `/admin/samples` — combined “Médiation échantillons & catalogues” (sample requests + supplier catalog moderation + attachment moderation in one view).

**What exists today:**

| Capability | Status |
|------------|--------|
| List sample requests | ✅ Inline list |
| Product name (text) | ✅ Via join |
| Wholesaler identity | ❌ Not shown (privacy design in migration 036) |
| Product link / image | ❌ |
| Dedicated detail page (`/admin/samples/[id]`) | ❌ |
| Admin upload file to wholesaler | ❌ DB supports `uploader_role = 'admin'` on `sample_request_files` but no UI/action |
| Supplier file upload | ✅ Supplier-side only |
| Approve/reject supplier files | ✅ `FileApprovalButton` |
| Update request status | ✅ `SampleStatusButton` (pending → approved/rejected/shipped/delivered) |
| Reply to wholesaler | ❌ `admin_notes` field exists but no reply workflow; not shown to wholesaler (BUG-055) |
| Assign to agent | ❌ |
| Internal notes (private) | ⚠️ `admin_notes` on row only, no thread |
| Status history / timeline | ❌ |
| Shipping / tracking fields | ❌ |
| SLA / urgent / late alerts | ❌ (BUG-035 pattern for sourcing not applied) |

**Gap vs BUG-031 (sourcing CRM):** Same class of problem — list exists, professional processing workflow missing.

**Fix direction (when approved):** Dedicated `/admin/samples/[id]` detail; admin file upload action; wholesaler-visible reply; assignment + SLA (BUG-053); split catalog moderation from sample requests; physical-sample tracking statuses.

### BUG-060 technical note (code audit)

**UI copy** (`/admin/payouts`): *“Toutes ses commissions approuvées seront automatiquement marquées comme payées.”*

**Server action:** `createPayout()` in `src/app/actions/payouts.ts`:
1. Fetches **all** `commissions` where `affiliate_id`, `status = approved`, `reversed = false`
2. Inserts `payouts` row with admin-entered `amount` (no link to which commissions)
3. Updates **all** fetched commission IDs to `status = paid`

**Known risks:**
- Entered amount can differ from sum of commissions marked paid (partial payment not modeled)
- No `payout_id` FK on `commissions` — no junction table
- No payment method field on payout (only `reference`, `notes`)
- No proof upload
- No audit trail beyond payout row timestamp

**Previously noted in PROJECT_STATE as DB-2** (deferred): needs schema redesign (e.g. `payout_commissions` junction) or amount-sum constraint.

**Fix direction (when approved):** Junction table linking payout ↔ commission IDs; checkbox UI; validate `sum(selected) >= amount_paid` or explicit partial rules; payment method + proof (BUG-044); audit log (BUG-048); caisse fields (BUG-061).

### BUG-061 technical note (code audit)

**Current `payouts` schema** (`001_initial_schema.sql`): `affiliate_id`, `amount`, `status`, `reference`, `notes`, `created_at`, `paid_at` — no `payment_method`, `cashbox_id`, `currency`, `paid_by`, or `approved_by`.

**Current UI** (`CreatePayoutForm`): affiliate select, amount, reference (free text), notes — no method/caisse dropdown.

**Gap vs BUG-027/028:** Platform-wide multi-caisse finance not built; affiliate payouts are first concrete outflow that needs channel + caisse linkage.

**Fix direction (when approved):** Extend `payouts` or link to `cashbox_transactions` (BUG-028); method enum; caisse FK; currency; `paid_by` / `approved_by` audit fields; owner approval gate for high amounts (BUG-053). Fix together with BUG-060.

### BUG-053 specification

**Problem:** Current alert/notification logic is not designed around real team operations. In production, the owner must not be the only person receiving every notification.

#### Required roles

| Role | Scope summary |
|------|----------------|
| **Owner / Super Admin** | Full access; override/correction; all financial and operational data |
| **Admin** | Manage operations; approve users/products/orders; most dashboards; no sensitive finance override without owner |
| **Supervisor / Manager** | Monitor team tasks; assign requests; view alerts; escalate blockers; limited financial visibility |
| **Sourcing Agent** | Assigned sourcing/RFQ tasks only; supplier offers, notes, attachments; no payment/finance |
| **Client Support Agent** | Client comms, order status, notes; reply to client; no financial records |
| **Confirmation Agent** | Confirm/update order status within workflow; no override of cancelled/paid/financial states |
| **Finance / Cashier** | Validate payment proof; payment method/caisse; inflow/outflow; no product/order logic unless authorized |
| **Supplier** | Own products/orders/requests only; no buyer private details unless allowed |
| **Wholesaler** | Own orders, quotes, payment status, requests; no supplier internal/private data |

#### Notification routing rules

| Event | Routing |
|-------|---------|
| **1. New sourcing request** | Assigned sourcing agent (if assigned) → sourcing supervisor if unassigned after **X hours** → owner only if delayed/critical |
| **2. New quote/RFQ request** | Sourcing or sales agent → supervisor if no action after **24h** → owner if blocked or overdue |
| **3. Payment proof uploaded** | Finance/cashier → supervisor if not validated after **X hours** → owner for high-value or suspicious payments |
| **4. Order blocked** | Responsible agent → supervisor after **24h** → owner after **48h/72h** (by severity) |
| **5. Supplier delay** | Sourcing agent → supervisor if delay continues → owner only for critical/high-value orders |
| **6. Client waiting too long** | Client support agent → supervisor → owner if unresolved |

#### Alert severity

| Level | Recipients |
|-------|------------|
| **Normal** | Assigned person only |
| **Warning** | Assigned person + supervisor |
| **Critical** | Supervisor + owner |
| **Blocked** | Owner-visible until resolved |

#### Permission matrix (summary)

- **Owner:** full access; override payments, costs, orders, roles, permissions; all financial/operational data.
- **Admin:** operations management; approvals; most dashboards; no sensitive finance override without owner.
- **Supervisor/Manager:** team monitoring, assignment, alerts, escalation; limited finance visibility.
- **Sourcing Agent:** assigned tasks only; supplier offers/notes/files; no payment validation or finance edits.
- **Client Support Agent:** client-facing comms and order visibility; no financial record changes.
- **Confirmation Agent:** status updates within allowed workflow only.
- **Finance/Cashier:** payment proof validation, caisse, inflow/outflow; no unauthorized order/product edits.
- **Supplier / Wholesaler:** scoped to own data; privacy boundaries as listed above.

#### Required modules (when implemented)

- Notification center
- Task center
- `assigned_to` field on requests/orders/tasks
- Role-based access control (extends BUG-045)
- SLA timers
- Escalation rules engine
- Audit trail: who did what, when (extends BUG-048)

**Consolidates / extends:** BUG-024, BUG-025, BUG-026, BUG-034, BUG-035, BUG-040, BUG-045, BUG-048.

---

*End of backlog — awaiting further QA findings before implementation.*
