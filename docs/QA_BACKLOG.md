# QA Backlog — Mozouna Group Platform

> **Status:** Manual QA in progress — documentation only.  
> **Last updated:** 2026-06-02 (BUG-069 added)  
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
| **BUG-005** | Payment validation must remain human-approved | Risk of auto-validation or unclear proof flow. | Upload proof + **admin manual validation**; AI/OCR later **assistance only**, never auto-approve. Related: BUG-044, **BUG-065**. |
| **BUG-044** | Payment proof workflow missing | No structured buyer upload + admin validation path. | Grossiste uploads proof → admin validates manually → status update; OCR/AI optional assistant later. Related: BUG-005, BUG-027, **BUG-065**. |
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
| **BUG-061** | Affiliate payout lacks payment method and cashbox/caisse tracking | **Admin → Paiements affiliés** captures amount and transfer reference only — no structured **payment method** or **caisse** selection. | Every payout records: payment method (cash, bank transfer, CIH, Attijari, company bank, PayPal, Wise, USDT, other); **cashbox/caisse** used; currency; reference number; payment date; paid-by user; owner approval if required. **Impact:** finance/accounting risk — outflows not tied to a specific caisse or payment channel. Related: BUG-027, BUG-028, BUG-060, BUG-048, BUG-053, **BUG-062**. See [BUG-061 technical note](#bug-061-technical-note-code-audit). |
| **BUG-062** | Affiliate payout lacks owner approval and correction workflow | **Admin → Paiements affiliés:** admin can record a payout (amount + reference) and commissions are immediately marked **paid** — no owner/supervisor approval step, no correction after submit, no reversal/void, no before/after audit log, no locked final validation state. | Payout lifecycle with finance controls: **draft / pending approval → approved → paid (locked)**; **owner or supervisor approval** required before commissions flip to paid; **correction window** with reason; **reversal/void** with commission rollback; **audit trail** (before/after values, actor, timestamp, reason); sensitive payouts flagged for owner-only final validation. **Impact:** high finance risk — erroneous or premature payouts cannot be corrected with accountability. Related: BUG-048, BUG-053, BUG-060, BUG-061, BUG-064. See [BUG-062 technical note](#bug-062-technical-note-code-audit). |
| **BUG-063** | Delivered COD order shows COD received as empty | Admin order detail: status **Livrée**, tracking shows **COD attendu = 400 MAD** but **COD reçu = —**. Delivered orders can exist with no COD collection recorded. | Delivered COD orders must clearly track collection state: **COD collected** / **pending reconciliation** / **missing** / **partially received**. Admin sees: collected amount, collection date, courier/agent, payment method, caisse/cashbox, reconciliation status. **Impact:** critical finance — delivered-but-unpaid COD creates accounting gaps. Related: BUG-005, BUG-027, BUG-028, BUG-029, BUG-048, BUG-053. See [BUG-063 technical note](#bug-063-technical-note-code-audit). |
| **BUG-064** | Commission marked paid while COD collection not confirmed | Order detail: status **Livrée**, **COD reçu = —**, affiliate commission **140 MAD**, yet **“Commission payée le 29/05/2026”**. Payout can finalize before revenue is reconciled. | Commission payout must not be final until order revenue is reconciled **or** owner manually overrides. Rules: **pending** until delivered → **approved** after delivered + COD/revenue confirmed → **payable** after finance reconciliation → **paid** only after actual payout recorded → **owner override** required if paid before COD reconciled. **Impact:** critical finance — affiliates paid before cash collected. Related: BUG-063, BUG-060, BUG-061, **BUG-062**, BUG-005, BUG-048, BUG-053. See [BUG-064 technical note](#bug-064-technical-note-code-audit). |
| **BUG-065** | Proof upload uses URL only — no file upload or verification workflow | **Admin → order detail → Preuves & justificatifs:** type selector, **URL du fichier**, note, **Ajouter une preuve**. No direct upload for receipt/photo/PDF; no inline preview; no validation status; no approval chain. Existing proofs render as external links only (`proof_type` + date). | Admin (and later wholesaler/finance) can **upload or attach** proofs directly. Required: receipt / delivery proof / bank transfer / WhatsApp screenshot / supplier invoice / courier slip; **uploaded by** user; **timestamp**; **validation status** (pending / approved / rejected); **owner or supervisor approval** for sensitive proofs; **audit trail** (status changes, approver, reason). Inline **preview** for images/PDF. **Impact:** high operational and finance risk — external URLs can be lost, manipulated, or hard to verify. Related: BUG-005, BUG-044, BUG-048, BUG-053, BUG-063. See [BUG-065 technical note](#bug-065-technical-note-code-audit). |
| **BUG-066** | Admin COD order search cannot find displayed short reference | **Admin → Commandes COD** list shows short ref e.g. **#14C20579**, but searching `14C20579` or `#14C20579` returns **0 results**. Searching customer name (e.g. “abdou”) works. | Search must find orders by the **exact short reference shown in the UI**. Support: `14C20579`, `#14C20579`, full order UUID, customer name, phone, city, affiliate name, product name. **Impact:** high ops friction — admins copy refs from WhatsApp, screenshots, support tickets, and commission pages; failed lookup slows order handling and increases errors. Related: BUG-010, BUG-047, BUG-063, BUG-064. See [BUG-066 technical note](#bug-066-technical-note-code-audit). |
| **BUG-067** | Analytics payment counters are inconsistent | **Admin → Analytics → Grossiste — Paiements** shows **Acomptes reçus: 500,00 MAD** but **0 cmdes avec acompte** — amount and count contradict each other. | Analytics payment counters must be **internally consistent**. Required: **Acomptes reçus** amount matches count of orders with received deposits; **cmdes avec acompte** counts orders where `deposit_received_amount > 0`; **Soldes en attente** equals total order amount minus confirmed deposits/payments; payment-status breakdown counts match actual order payment states. **Impact:** critical finance reporting — owner may make wrong cashflow decisions when amounts and counts diverge. Related: BUG-029, BUG-030, BUG-048, BUG-027, BUG-044, **BUG-068**. See [BUG-067 technical note](#bug-067-technical-note-code-audit). |
| **BUG-068** | Analytics COD revenue may count delivered orders without COD reconciliation | **Admin → Analytics** shows **COD encaissé = 700 MAD**. Separately, an order detail showed status **Livrée**, **COD attendu: 400 MAD**, **COD reçu: —** — delivered but not reconciled. | Analytics must separate: **delivered orders**, **COD expected**, **COD actually collected**, **COD pending reconciliation**, **COD missing**. **COD encaissé** must include only **confirmed collected/reconciled** COD — not delivered order totals alone. **Impact:** critical finance risk — analytics may overstate collected revenue if delivered orders are counted as cash received before COD reconciliation. Related: BUG-063, BUG-064, BUG-067, BUG-029, BUG-030, BUG-048. See [BUG-068 technical note](#bug-068-technical-note-code-audit). |
| **BUG-069** | Supplier reliability score defaults to 100/100 without enough history | **Admin → Performance fournisseurs** shows many suppliers with **score fiabilité = 100/100** despite **0 orders**, **0 revenue**, no average delivery time, no delay data, and no incident data. | Reliability must **not** default to 100/100 when there is no operational history. Expected states: **New supplier / no data**, **Insufficient data**, **Reliable**, **Warning**, **Risky**, **Blocked**. Score from real signals: completed orders, delivery delays, incidents, cancellations, sample/document quality, response time, dispute rate, stock accuracy, refund/return issues, admin manual incidents. If insufficient data → display **“Données insuffisantes”** (not 100/100). **Impact:** high operational risk — admin may trust suppliers as reliable with no evidence. Related: BUG-039, BUG-031, BUG-035, BUG-053. See [BUG-069 technical note](#bug-069-technical-note-code-audit). |
| **BUG-030** | Missing owner dashboard | No single ops/finance command view. | Critical alerts, blocked orders, cash balances, real profit, pending payments, late sourcing, top suppliers, cancellation risk. Related: BUG-025, BUG-026, **BUG-057**, **BUG-067**, **BUG-068**. |
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
| **BUG-039** | No supplier research tracking | Sourcing research not captured. | Track: supplier contacted, price, MOQ, lead time, response status, files/photos, reliability score. Related: **BUG-069**. |
| **BUG-040** | Notifications missing | No in-app/event notifications. | Notify on: new order, new sourcing request, RFQ, payment update, quote ready, blocked order, delayed supplier. Related: BUG-010, BUG-025, **BUG-053** (superseded by full role-based routing spec). |
| **BUG-050** | No production / overstock logic | Low stock = hard stop. | If stock low but production possible: show available stock, production delay, preorder/production order option. Related: BUG-021, BUG-022. |

---

## Implementation strategy (summary)

### Priority groups for execution

| Group | Bug IDs | Rationale |
|-------|---------|-----------|
| **Critical launch blocker** | BUG-017, BUG-042, BUG-001, BUG-013, BUG-004, BUG-005, BUG-044, BUG-022 | Core rule: stock = buy, import = RFQ; payment stays human-approved; stock guards. |
| **High ROI** | BUG-002, BUG-008, BUG-009, BUG-006, BUG-007, BUG-014, BUG-046, BUG-018, BUG-010, BUG-019, BUG-020, BUG-021, BUG-047, BUG-051, BUG-054, BUG-055, BUG-056, BUG-057, **BUG-058**, BUG-016 | Catalog clarity, CTAs, dashboard routing, **wholesaler sample page**, quote tracking. |
| **Medium (operations & finance)** | BUG-023–BUG-030, BUG-024, BUG-045, BUG-048, BUG-049, BUG-031–BUG-037, BUG-041, BUG-052, BUG-053, BUG-059, BUG-060, BUG-061, **BUG-062**, BUG-063, **BUG-064**, **BUG-065**, **BUG-066**, **BUG-067**, **BUG-068**, **BUG-069** | Roles, cashboxes, profit truth, affiliate payout controls, **payout approval + correction workflow**, **COD ↔ commission gating**, **proof upload + validation workflow**, **admin COD order search**, **analytics payment/COD consistency**, **supplier reliability scoring**, actionable sourcing/RFQ rows, alerts, tasks, sample mediation CRM, audit trail. |
| **Later** | BUG-003, BUG-011, BUG-012, BUG-015, BUG-043, BUG-038, BUG-039, BUG-040, BUG-050 | Wording polish, attachments, upsell, images, basic notifications (see BUG-053 for full ops routing), advanced stock/production. |

### Suggested fix order (do not batch all 50)

1. **Define and lock business rule** (BUG-017, BUG-042) — document `availability_type` → UX mapping; approve schema if supplier cart needed.
2. **Local direct purchase path** (BUG-001, BUG-004, BUG-013, BUG-009, BUG-006) — marketplace + catalog CTAs, cart, checkout.
3. **Catalog IA** (BUG-002, BUG-008, BUG-047) — naming, nav, admin source labels.
4. **Stock & location truth** (BUG-007, BUG-014, BUG-046, BUG-021, BUG-022) — filters, origin vs stock, guards.
5. **Payment proof** (BUG-005, BUG-044, **BUG-065**) — Supabase Storage upload, preview, validation status, owner approval for sensitive proofs.
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
| Payment & proof | BUG-005, BUG-027, BUG-028, BUG-044, BUG-060, BUG-061, **BUG-062**, BUG-063, **BUG-064**, **BUG-065** |
| Wholesale order lifecycle | BUG-010, BUG-019, BUG-047, BUG-049, **BUG-066** |
| Admin COD ops & search | **BUG-066**, BUG-063, BUG-064, BUG-010, **BUG-068** |
| Quote / RFQ admin & wholesaler routing | BUG-051, BUG-052, BUG-054, BUG-047, BUG-031, BUG-037, **BUG-057** |
| Sample & document requests | BUG-012, BUG-055, BUG-056, BUG-057, BUG-058, **BUG-059** |
| Dashboard & counter routing | **BUG-057**, BUG-030, BUG-053 |
| Sourcing ops | BUG-011, BUG-031–BUG-041, **BUG-052**, **BUG-069** |
| Roles & audit | BUG-024, BUG-045, BUG-048, **BUG-053**, **BUG-062**, **BUG-065** |
| Finance & profit | BUG-029, BUG-030, BUG-060, BUG-061, **BUG-062**, BUG-063, **BUG-064**, **BUG-065**, **BUG-067**, **BUG-068** |
| Analytics & reporting | **BUG-067**, **BUG-068**, BUG-029, BUG-030, BUG-023, BUG-063, BUG-064 |
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
| 2026-06-02 | BUG-063 added — delivered COD order missing COD received tracking. |
| 2026-06-02 | BUG-064 added — commission paid before COD reconciliation. |
| 2026-06-02 | BUG-065 added — proof upload URL-only, no file upload or validation workflow. |
| 2026-06-02 | BUG-066 added — admin COD search cannot find displayed short order reference. |
| 2026-06-02 | BUG-062 added — affiliate payout lacks owner approval and correction workflow (gap fill). |
| 2026-06-02 | BUG-067 added — analytics payment counters inconsistent (amount vs order count). |
| 2026-06-02 | BUG-068 added — analytics COD encaissé may count delivered orders without reconciliation. |
| 2026-06-02 | BUG-069 added — supplier reliability score defaults to 100/100 without history. |

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

**Fix direction (when approved):** Extend `payouts` or link to `cashbox_transactions` (BUG-028); method enum; caisse FK; currency; `paid_by` / `approved_by` audit fields; owner approval gate for high amounts (BUG-053, **BUG-062**). Fix together with BUG-060.

### BUG-062 technical note (code audit)

**Current flow** (`createPayout()` in `src/app/actions/payouts.ts`):
1. Any admin calls action with affiliate + amount + optional reference/notes
2. Inserts `payouts` row with `status: 'paid'` and `paid_at` set immediately
3. Bulk-updates **all** approved commissions for affiliate → `status: 'paid'` (BUG-060)
4. No approval queue, no `paid_by` / `approved_by`, no edit-after-save, no void/reversal path

**Schema gaps:** `payouts` has no `approval_status`, `approved_by`, `corrected_at`, `reversed_at`, or linked audit table. Commission `paid` flip is one-way with no rollback workflow.

**Gap vs BUG-048:** Platform-wide correction/audit spec exists but payout module does not implement before/after logging or owner override for financial corrections.

**Gap vs BUG-053:** Finance role matrix defines owner approval for sensitive outflows — not enforced on affiliate payouts today.

**Fix direction (when approved):** Payout state machine (`pending_approval` → `approved` → `paid` locked); owner/supervisor approve action; `payout_audit_log` with before/after fields; void/reversal restores commission status; integrate with granular commission selection (BUG-060), caisse/method (BUG-061), COD gating (BUG-064). Fix together with BUG-048 audit trail pattern.

### BUG-063 technical note (code audit)

**Schema:** `orders.cod_expected` and `orders.cod_received` exist (migration `004_order_tracking.sql`). `cod_expected` set at order placement; `cod_received` optional.

**UI:** Admin order detail shows COD attendu / COD reçu; reçu displays **—** when `cod_received` is null (`/admin/orders/[id]/page.tsx`).

**Status update:** `OrderStatusForm` shows “Montant COD reçu” only when selecting **delivered** — field is **optional**; admin can mark delivered without entering amount → commission trigger still fires on delivery.

**Gap:** No `cod_reconciliation_status`, collection date, courier remittance link, caisse, or partial-collection workflow. Delivered + empty COD is a valid state today.

**Fix direction (when approved):** Require COD reconciliation sub-state on deliver (or warn/block commission until collected); partial/missing states; link to caisse inflow (BUG-027/028); finance alerts (BUG-053). Gate commission **approved/paid** on COD confirmed (BUG-064).

### BUG-064 technical note (code audit)

**Commission lifecycle today** (business model + code):
1. Order → `delivered` → `handle_order_delivered` trigger creates `commissions` row (`status = pending`) — **no check** on `cod_received`
2. Admin approves commission → `approved`
3. `createPayout()` marks **all** approved commissions for affiliate → `paid` (BUG-060) — **no check** on linked order COD reconciliation

**Observed QA case:** `delivered` + `cod_received = null` + commission already `paid` — valid under current logic, invalid under finance rules.

**Target state machine:**
```
pending (pre-delivery)
  → pending (delivered, COD unreconciled)
  → approved (delivered + COD/revenue confirmed)
  → paid (payout recorded + linked)
Exception: owner override with audit reason (BUG-048)
```

**Fix together with:** BUG-063 (COD collection), BUG-060/061 (granular payout + caisse), BUG-053 (finance role gates).

### BUG-065 technical note (code audit)

**Schema** (`supabase/migrations/005_proofs_and_search.sql`): `order_proofs` table exists with `proof_type`, `file_url` (text, required), `uploaded_by`, `uploaded_at`, `notes`, and optional FKs to order / wholesale order / product. No `storage_path`, `mime_type`, `validation_status`, `approved_by`, or audit history table.

**Current proof types** (DB CHECK): `bank_receipt`, `transfer_proof`, `delivery_receipt`, `return_receipt`, `stock_reception_proof`, `other`. Missing QA-expected types: WhatsApp screenshot, supplier invoice, courier slip (may map to `other` today without semantics).

**Admin UI** (`src/components/admin/order-proof-form.tsx` on `/admin/orders/[id]`):
- Form fields: type `<select>`, **URL du fichier** (`type="url"`, required), optional note.
- Existing proofs: plain `<a href={file_url}>` link with type label + date — **no thumbnail/PDF preview**, no validation badge.

**Server action** (`addOrderProof` in `src/app/actions/commissions.ts`): inserts `file_url` string as provided — **no Supabase Storage upload**, no file type/size validation, no virus/MIME check, no approval workflow.

**RLS:** Admin full access; affiliates/buyers read-only on related proofs — no finance-role gate or approval permissions.

**Gap vs expected workflow:**
| Capability | Today | Required |
|------------|-------|----------|
| Direct file upload | ❌ URL paste only | Supabase Storage bucket + signed URLs |
| Preview | ❌ external link | Image inline; PDF viewer or download |
| Validation status | ❌ none | pending → approved / rejected |
| Sensitive-proof approval | ❌ none | Owner/supervisor gate (BUG-053) |
| Audit trail | ❌ insert-only | Status change log (BUG-048) |
| Proof types | 6 generic enums | receipt, delivery, bank transfer, WhatsApp, supplier invoice, courier slip |

**Fix direction (when approved):** Storage bucket `order-proofs` with RLS; extend schema with `validation_status`, `approved_by`, `rejected_reason`, optional `storage_path`; proof-type enum expansion; `OrderProofForm` file input + preview; finance validation UI; link COD reconciliation proofs (BUG-063) and wholesale payment proof (BUG-044); notification on upload (BUG-053 event #3).

### BUG-066 technical note (code audit)

**Displayed reference** (`src/app/(admin)/admin/orders/page.tsx`, `OrderRow`):
```typescript
const ref = order.id.slice(0, 8).toUpperCase()  // UI: #{ref} e.g. #14C20579
```
Short ref is **not a stored column** — it is the first 8 hex chars of the order UUID, uppercased. Same pattern used on order detail, commissions list, affiliate orders, and customer tracking pages.

**Current search** (`AdminOrdersPage`, `?search=` param):
```typescript
query = query.or(`customer_name.ilike.${term},customer_phone.ilike.${term}`)
```
Only **customer name** and **customer phone** are searched (pg_trgm indexes on those columns in migration `005_proofs_and_search.sql`). No match on:
- UUID prefix / short ref (with or without `#`)
- Full order UUID
- `customer_city`
- Affiliate name (joined `profiles`, not in filter)
- Product name (joined `products`, not in filter)

**Root cause:** UI shows a derived ID fragment admins treat as the order number; backend search ignores `orders.id` entirely.

**Fix direction (when approved):**
1. Normalize input: strip leading `#`, trim, uppercase for prefix match.
2. If term looks like UUID or 8-char hex prefix → `id.ilike.{prefix}%` (or exact UUID eq).
3. Extend `.or()` to include `customer_city.ilike`, and join-based filters for affiliate/product (RPC or denormalized search column).
4. Optional: persist `short_ref` generated column for index-friendly lookup; apply same search pattern to affiliate admin order lists if they gain search later.

**Quick win:** UUID-prefix + full UUID + city in existing query — unblocks the reported repro immediately.

### BUG-067 technical note (code audit)

**Page:** `/admin/analytics` — section **Grossiste — Paiements** (`src/app/(admin)/admin/analytics/page.tsx`).

**Observed inconsistency (QA):** **Acomptes reçus** shows **500,00 MAD** while subtitle shows **0 cmdes avec acompte**.

**Root cause — mixed data sources:**

| Metric | Current logic | Problem |
|--------|---------------|---------|
| **Acomptes reçus** (amount) | `sum(deposit_received_amount)` over all non-cancelled wholesale orders | Uses numeric field regardless of `payment_status` |
| **cmdes avec acompte** (subtitle count) | `payment_status === 'deposit_received'` **OR** `'fully_paid'` | Ignores orders with `deposit_received_amount > 0` but stale/wrong `payment_status` |

If admin records `deposit_received_amount = 500` without setting `payment_status` to `deposit_received` (or leaves `no_deposit` / `deposit_requested`), **amount > 0** but **count = 0** — exact QA repro.

**Soldes en attente:** `sum(max(0, total_amount - deposit_received_amount))` — amount-based, consistent with deposit field; subtitle **non soldées** uses `payment_status !== 'fully_paid'` — can diverge from balance math if status and amounts disagree.

**Payment status breakdown:** Counts by `payment_status` enum only — does not reconcile against `deposit_received_amount`.

**Schema** (migration `029_wholesale_payment_tracking.sql`): `payment_status`, `deposit_amount`, `deposit_received_amount`, timestamps — no DB constraint tying amount > 0 to status.

**Fix direction (when approved):**
1. Single source of truth: derive display metrics from **amount fields** with status as secondary label, or enforce status ↔ amount sync on save (`updateWholesalePayment` in `orders.ts`).
2. **cmdes avec acompte** → `deposit_received_amount > 0` (or status in `deposit_received`, `fully_paid` **iff** amounts match).
3. Add consistency guard in analytics: if `wsTotalDepositsReceived > 0` then order count must be ≥ 1; log/warn on mismatch.
4. Optional: DB check or trigger — `deposit_received_amount > 0` implies `payment_status IN ('deposit_received', 'fully_paid')`.
5. Owner dashboard (BUG-030) should reuse same aggregation helpers to avoid duplicate drift.

### BUG-068 technical note (code audit)

**Page:** `/admin/analytics` — section **Revenus (commandes livrées)** (`src/app/(admin)/admin/analytics/page.tsx`).

**Observed (QA):** **COD encaissé = 700 MAD** while a delivered order shows **COD attendu: 400 MAD**, **COD reçu: —** (not reconciled).

**Current logic:**
```typescript
const deliveredOrders = orders.filter((o) => o.status === 'delivered')
const totalCodCollected = deliveredOrders.reduce((s, o) => s + o.total_amount, 0)
```
UI label: **COD encaissé** · subtitle: **Montant total des livraisons** — sums `total_amount` for all **delivered** affiliate COD orders.

**Gap:** Analytics query does **not** select `cod_expected` or `cod_received` (migration `004_order_tracking.sql`). Delivered status alone is treated as cash collected. Profit (**Profit brut plateforme**) and top-product **revenue** use the same delivered + `total_amount` assumption — downstream metrics inherit the overstatement.

**Relationship to BUG-063/064:** Order detail can show delivered + empty COD reçu; analytics still counts full order value as encaissé; commissions may still progress to paid (BUG-064).

**Expected analytics breakdown (when approved):**
| Metric | Source |
|--------|--------|
| Commandes livrées | `status = delivered` (count) |
| COD attendu | `sum(cod_expected ?? total_amount)` for delivered |
| COD encaissé | `sum(cod_received)` where `cod_received IS NOT NULL` |
| COD en attente | delivered with `cod_received IS NULL` |
| COD manquant / partiel | reconciliation sub-states (BUG-063) |

**Fix direction (when approved):** Extend analytics `orders` select with `cod_expected`, `cod_received`; replace **COD encaissé** with reconciled sum; add separate stat cards for expected / pending / missing; gate profit-on-cash metrics on confirmed COD or show dual view (delivered vs collected); align with owner dashboard (BUG-030) and shared finance helpers (BUG-067).

### BUG-069 technical note (code audit)

**Page:** `/admin/supplier-performance` — **Performance fournisseurs** (`src/app/(admin)/admin/supplier-performance/page.tsx`).

**Current score formula:**
```typescript
function reliabilityScore(issueCount: number, delayedCount: number): number {
  return Math.max(0, 100 - 5 * issueCount - 3 * delayedCount)
}
```
With **0 incidents** and **0 delays** → score is always **100**, regardless of order history.

**Seeding behavior:** All **approved suppliers** are pre-seeded into the performance map *“so they appear even with 0 orders”* — zero-history suppliers render with **100/100** in green (`scoreColor` ≥ 80).

**Data sources today:**
| Signal | Used for score? |
|--------|----------------|
| `supplier_issues` (manual admin incidents) | ✅ penalties only |
| Delay issues (`issue_type === 'delay'`) | ✅ penalties only |
| Quote requests (`supplier_quote_requests`) | Orders/revenue counts only — not score input |
| Completed deliveries, cancellations, disputes | ❌ not tracked |
| Sample/document quality, response time, stock accuracy | ❌ not tracked |

**RFQ matching (downstream):** `supplier_matching_profiles.reliability_score` defaults to **100** in DB (migration `037_rfq_matching_engine.sql`); used in `rfq-engine.ts` / `sourcing.ts` matching — new suppliers get max reliability weight without history.

**Gap vs expected:** No **insufficient data** state; no minimum sample size before scoring; no lifecycle labels (New / Warning / Risky / Blocked); perfect score implies trust without evidence.

**Fix direction (when approved):**
1. Return `null` or enum state when `totalOrders < N` and `issueCount === 0` → UI shows **Données insuffisantes** instead of `100/100`.
2. Expand signal ingestion (orders, samples, disputes, response SLA) per BUG-039.
3. Separate **computed score** from **admin status override** (Blocked).
4. Sync `supplier_matching_profiles.reliability_score` from computed stats — remove DEFAULT 100 for profiles with zero offers.
5. Color/badge rules: insufficient data = neutral gray, not green.

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
