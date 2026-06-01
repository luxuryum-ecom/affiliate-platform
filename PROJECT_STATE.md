# PROJECT_STATE.md — Mozouna Group Platform

> Source of truth: generated from repository inspection on 2026-05-31.  
> Branch: `chore/agent-operating-system`  
> Last agent update: 2026-06-01 — commit `3bdf177` (wholesale marketplace QA fixes: image error handling, Morocco hero country selection, conversion product cards)  
> Do not edit manually — regenerate from codebase when the state changes.

---

## 1. Project Overview

**Mozouna Group** is a Morocco-focused B2B affiliate and wholesale platform built as a single Next.js 15 App Router application backed by Supabase (PostgreSQL + Auth + RLS + Storage) and deployed on Vercel (region `cdg1`, Paris).

**Primary currency:** MAD (Moroccan dirham).  
**Primary language:** French (UI), Arabic intended for customers.

### Two core revenue flows

| Flow | Who | Mechanism |
|------|-----|-----------|
| **Affiliate COD** | Affiliates share referral links; customers pay cash on delivery | Referral → COD order → delivery → commission |
| **Wholesale B2B** | Wholesalers browse catalog and supplier marketplace | Cart → WhatsApp or admin-confirmed order → payment tracking |

### Five user roles

| Role | Status |
|------|--------|
| `admin` | Full platform access, product/order approval |
| `affiliate` | COD referral links, commissions, own orders |
| `wholesaler` | Wholesale catalog, cart, marketplace, quotes, sourcing |
| `supplier` | Submit products, receive RFQ offers, track payouts |
| `agent` | Reserved — no routes or functionality built |

### Technology stack

- **Next.js 15** (App Router, Turbopack dev) + **React 19**
- **Supabase** — PostgreSQL, RLS, Auth, Storage
- **Tailwind CSS v4** — utility-first, no external UI libraries
- **Vercel** — CI/CD via GitHub Actions on `main`
- **TypeScript 5.8** — strict, no `any` types

---

## 2. Completed Modules

### 2.1 Auth & Onboarding
- Sign up with role selection (`affiliate` / `wholesaler` / `supplier`)
- Sign in / sign out
- `/pending` holding page for accounts awaiting approval
- One-time `/bootstrap` page for localhost admin promotion
- Middleware session refresh

### 2.2 Admin Dashboard (`/admin/*`)
- **Products**: list, create, edit (with image upload and cover), approve/reject, toggle active
- **COD Orders**: list with filters, status updates (pending_confirmation → confirmed → shipped → delivered → cancelled), order proofs, fraud/duplicate signals
- **Wholesale Orders**: list, detail with cost breakdown, import status tracking, payment tracking
- **Commissions**: list, approve/reject individual commissions
- **Payouts**: create payout batches for affiliates
- **Users**: list, view detail, toggle wholesale access, update user status
- **Cities**: CRUD with per-city delivery fee override
- **Logistics settings**: global confirmation fee, packaging fee, delivery fee defaults
- **Import tariffs**: global and per-product tariff rules (HS codes, rate, per-unit or percent)
- **Analytics**: order stats (basic)
- **Quote requests**: list, detail, prepare structured quote document, approve/reject, convert to wholesale order
- **Sourcing requests**: list, match suppliers, convert to quote
- **Supplier products**: review submitted products, approve/reject, view detail
- **Supplier quotes**: manage platform quotes to suppliers
- **Supplier analytics / performance**: per-supplier stats, issue notes (admin-only)
- **Samples**: manage sample requests across suppliers
- **RFQ engine**: run automatic supplier matching, view matches, send offers
- **Premium subscriptions**: manage plans and assign subscriptions to suppliers

### 2.3 Affiliate Area (`/affiliate/*`)
- **Dashboard**: earnings summary (earned, paid, pending), commission history — Mozouna Group branding ✓
- **Products catalogue**: all `affiliate_enabled` products with referral link generator, custom sell-price setter, per-product performance stats (clicks, orders, conversion rate, earned) — Mozouna Group branding ✓
- **Orders**: list of orders attributed to the affiliate — Mozouna Group branding ✓
- **New order**: self-entry form for manual order creation
- **Commissions**: detailed commission ledger — Mozouna Group branding ✓

### 2.4 Wholesale Area (`/wholesale/*`)
- **Dashboard**: overview stats, quick links
- **Products catalog** (`/wholesale/products`): products from the internal `products` table with tier pricing display, add-to-cart
- **Cart**: view items, update quantities, submit order via WhatsApp or admin confirmation
- **Orders**: list and detail (status, cost breakdown, payment tracking, import status, invoice request)
- **Account**: billing info management
- **Quote requests**: submit for `import_on_demand` products, view prepared quote document, accept/reject
- **Sourcing**: submit free-form sourcing requests
- **Samples**: request product samples from suppliers
- **Marketplace** (`/wholesale/marketplace`): supplier product catalog with full filtering (category, subcategory, origin, MOQ, lead time, availability, stock), country-first buying journey, premium badge display
- **Marketplace product detail** (`/wholesale/marketplace/[id]`): full product page with photo gallery, wholesale tier pricing, quantity stepper, logistics info, attachments/documents, related products, WhatsApp CTA, mobile sticky bar, sample request

### 2.5 Supplier Area (`/supplier/*`)
- **Dashboard**: overview
- **Products**: list own submitted products, submit new product, bulk CSV import
- **Catalogs**: upload PDF catalogs and attachments
- **Samples**: manage sample requests received
- **Opportunities**: view RFQ matches and submit offers
- **Analytics**: own performance stats
- **Premium**: view plans and subscribe (Mozouna monetization)

### 2.6 Public Pages
- **Home** (`/`): Mozouna Group B2B landing with stats, country-first sourcing cards, quick filters, trust strip, WhatsApp sourcing CTA, signup/login CTAs
- **Product COD page** (`/products/[id]?ref=[affiliateId]`): customer-facing COD order form, attribution tracking, product gallery, WhatsApp COD button
- **Order tracking** (`/orders/track?phone=...`): public COD order status page — phone-number lookup, visual status timeline, tracking number display; no auth required

### 2.7 Core Business Logic (Server Actions)
- COD order placement with referral attribution (30-day localStorage + session)
- Fraud/duplicate/spam scoring on COD orders (`order-analytics.ts`)
- Stock reservation and restoration RPCs
- Commission calculation: `commission_amount` (fixed per product, net of fees)
- Wholesale tier pricing: `getWholesaleTier()` (10+/50+/100+/500+ units at cost+30/25/20/15%)
- City-based delivery fee resolution
- Global logistics settings singleton
- Import tariff computation (`tariff-utils.ts`)
- Supplier payout tracking and commission breakdown
- RFQ matching engine (automatic supplier-to-buyer matching)
- Premium plan limits enforcement

### 2.8 Database Schema (40 migrations)
Complete schema through `041_order_tracking_rpc.sql`. All migrations are idempotent. All 41 migrations fully in sync between local and remote as of 2026-05-31.

---

## 3. Partially Completed Modules

### 3.1 Marketplace Product Detail — Hardcoded Placeholders
`/wholesale/marketplace/[id]/page.tsx` (1,110 lines, recently rewritten):

- **Social proof stats** are hardcoded: `4.9 ★`, `32 avis vérifiés`, `148 commandes sur 12 mois`, `Taux de réponse 98%`. These are not pulled from any database table.
- **Variants section** (`#variants`) shows hardcoded color swatches (Blanc, Noir, Beige, Marine, Bordeaux, Gris anthracite) and size grid (XS → XXL). No variant data model exists for supplier products.
- **Packaging section** (`#packaging`) shows entirely generic, hardcoded values not tied to any product attribute.
- **OEM/marque blanche** availability is stated universally without a product-level flag.
- The **"Première commande"** callout and **"Conseiller dédié"** messaging are marketing copy, not connected to any real onboarding system.

### 3.2 Untracked Client Components (not committed)
The following files exist on disk but are not tracked by git:

| File | Purpose |
|------|---------|
| `src/app/(wholesale)/wholesale/marketplace/[id]/ProductGalleryClient.tsx` | Image gallery with thumbnail strip |
| `src/app/(wholesale)/wholesale/marketplace/[id]/QuantityStepperClient.tsx` | Interactive quantity/price stepper |
| `src/app/(wholesale)/wholesale/marketplace/[id]/MobileStickyBarClient.tsx` | Mobile sticky CTA bar |
| `src/components/wholesale/category-nav.tsx` | Horizontal category navigation bar |

All four are imported by committed pages and required for the pages to build.

### 3.3 Migration 040 — Untracked
`supabase/migrations/040_wholesaler_badges_rls.sql` is untracked (not committed). It adds a read policy so wholesalers can query active subscriptions for premium badge display in the marketplace. The marketplace page already depends on this data.

### ~~3.4 Affiliate Branding Divergence~~ ✅ DONE (commit `5510f52`)
All affiliate pages (`/affiliate/products`, `/affiliate/orders`, `/affiliate/commissions`) now display `MozounaLogo` in their headers, consistent with admin and wholesale areas.

### 3.5 Admin Analytics
`/admin/analytics` exists but covers only basic COD order stats. No wholesale analytics, supplier analytics, or commission trend charts are present in the admin analytics view (those exist as separate dedicated pages, not unified).

### 3.6 Seed Scripts (Untracked)
Three seed scripts exist on disk but are not committed:

| File | Language | Purpose |
|------|----------|---------|
| `scripts/seed-demo.ts` | TypeScript | Demo data seeding |
| `scripts/seed_marketplace.py` | Python | Marketplace supplier product seeding |
| `scripts/seed_mvp.py` | Python | MVP product/order seeding |

No README or documentation exists for running these scripts.

### 3.7 Wholesale Products Page vs. Marketplace — Two Catalogs
The platform currently has two separate product catalogs:
- `/wholesale/products` — sourced from the `products` table (internal admin-managed products)
- `/wholesale/marketplace` — sourced from the `supplier_products` table (supplier-submitted products)

These are presented as separate sections. There is no unified search or cross-catalog discovery.

---

## 4. Missing Modules

### 4.1 Not Built (by design — constraints.mdc)
| Feature | Reason |
|---------|--------|
| Payment gateway (CMI, Stripe) | Explicitly deferred |
| WhatsApp Business API | Only `href` links used |
| Delivery API integration | Manual status updates only |
| Real-time subscriptions | Server refresh on action only |
| Email notifications | Not built |
| AI/OCR/n8n automation | Deferred |
| Telegram bot | Deferred |

### 4.2 Missing but Not Explicitly Deferred
| Feature | Impact |
|---------|--------|
| **README.md** | No onboarding documentation at repo root |
| **Supplier public profile page** | Supplier identity is hidden from wholesalers (by design per migration 030, but no profile page even for admins) |
| **Affiliate dashboard charts/graphs** | Earnings shown as numbers only; no trend visualization |
| **Order notification system** | No email/SMS when a COD order is placed or status changes |
| **Stock depletion alerts** | No admin notification when `stock_count` hits zero |
| ~~**Automated commission approval**~~ | ✅ Bulk-approve button built on `/admin/commissions` (commit `5510f52`) |
| **Payout scheduling** | Payouts are manual batch operations; no schedule or automatic release |
| **Affiliate link QR codes** | Not built (common affiliate feature) |
| **Wholesale order PDF export** | Quote document exists via `shared/quote-document.tsx`; no direct PDF download for standard wholesale orders |
| **Admin bulk order status update** | Orders must be updated one at a time |
| ~~**Customer order status page**~~ | ✅ Built — `/orders/track` (commit `53f6824`) |
| **Rate limiting / abuse protection** | COD form has heuristic spam scoring but no actual rate limiting at the route level |
| **`agent` role implementation** | Role exists in DB and auth but has zero routes or functionality |

---

## 5. Important Business Rules

### 5.1 COD Affiliate Flow
1. Affiliate generates a referral URL: `/products/[id]?ref=[affiliateId]`
2. Customer visits the link; attribution is stored in localStorage (30-day window) and a session ID
3. Customer submits name, phone, city, address, quantity — no account needed
4. `placeOrder` server action creates an order with `status = 'pending_confirmation'`
5. The order is scored for fraud/duplicate/spam (`order-analytics.ts`) and signals stored in `order_signals`
6. Admin confirms → ships → marks delivered
7. `handle_order_delivered` trigger fires: creates a `commissions` row
8. Admin approves commission → affiliate is paid manually via `payouts`

### 5.2 Affiliate Pricing
- Affiliates set their own sell price via `affiliate_product_prices` table
- Custom sell price overrides the platform `sell_price` on the public product page
- `commission_amount` is a fixed MAD amount per product, not a percentage
- Net commission formula: `commission_amount - operational_fees` (confirmation + packaging + delivery)

### 5.3 Wholesale Tier Pricing
Standard platform tiers (cost markup, rounded to whole MAD):

| Min qty | Markup over cost |
|---------|-----------------|
| 10+ | +30% |
| 50+ | +25% |
| 100+ | +20% |
| 500+ | +15% |

Marketplace detail page applies different discount tiers from base price: 0% / 5% / 10% / 15%.

### 5.4 Product Availability Types
| Type | Affiliates | Wholesale | Marketplace |
|------|-----------|-----------|-------------|
| `local_stock` | Yes (if `affiliate_enabled`) | Yes | Yes |
| `import_on_demand` | Never | Yes | Yes |

### 5.5 Commission Lifecycle
`pending` → `approved` → `paid`  
Commission is created only after an order reaches `delivered` status. Payment is manual (admin creates payout record).

### 5.6 Wholesale Order Lifecycle
`pending` → `confirmed` → (import tracking) → `completed` or `cancelled`  
Payment: `unpaid` → `deposit_paid` → `paid`  
Import: `not_started` → `ordered` → `in_transit` → `customs` → `delivered`

### 5.7 Quote Request Lifecycle
`pending` → `in_review` → `quote_prepared` → `accepted` / `rejected` → (if accepted) converted to wholesale order

### 5.8 Supplier Premium Subscriptions
Suppliers can subscribe to premium plans. Plans grant:
- `featured_badge` — shown on marketplace cards
- `verified_badge` — gold supplier status, priority sorting in marketplace

Premium features are monetized by Mozouna Group via `premium_plans` and `supplier_subscriptions` tables.

### 5.9 Operational Cost Model (COD)
Per-order costs tracked on `products`:
- `confirmation_fee_mad` (default 10 MAD)
- `packaging_fee_mad` (default 10 MAD)
- `delivery_fee_mad` (default 0, overridable per city via `cities` table)

Platform margin per COD order: `sell_price - cost_price - confirmation_fee - packaging_fee - delivery_fee`

---

## 6. Database and Migration Status

### 6.0 Migration Sync Status

**As of 2026-05-31:** All 41 migrations are fully in sync (`Local = Remote` for 001–041). `supabase migration list` confirms no drift.

### 6.1 Migration File Inventory

| # | File | Description |
|---|------|-------------|
| 001 | `001_initial_schema.sql` | Core tables: profiles, products, orders, wholesale, commissions, payouts; RLS; triggers |
| 002 | `002_product_image_storage.sql` | Storage RLS for `product-images` bucket |
| 003 | `003_product_sourcing.sql` | Product sourcing fields, approval workflow, purchase/margin pricing |
| 004 | `004_order_tracking.sql` | COD tracking fields, wholesale status lifecycle, stock RPCs |
| 005 | `005_proofs_and_search.sql` | `order_proofs` table, search/low-stock indexes |
| 006 | `006_stabilization.sql` | Audit fixes, `products.updated_at` trigger |
| 007 | `007_product_model_correction.sql` | `availability_type`, `affiliate_enabled`, `media` jsonb |
| 008 | `008_delivery_fee_and_costs.sql` | `delivery_fee_mad` on products |
| 009 | `009_cod_order_engine.sql` | Order snapshots, `affiliate_clicks`, `order_signals`, delivery trigger |
| 010 | `010_drop_duplicate_order_trigger.sql` | Drop duplicate `on_order_delivered` |
| 011 | `011_affiliate_custom_price.sql` | `affiliate_product_prices` table |
| 012 | `012_fix_products_anon_read_policy.sql` | Anon read policy for active+approved products |
| 013 | `013_pricing_commission_model.sql` | Platform margin, commission reversal, wholesale delivery cost |
| 014 | `014_logistics_settings.sql` | `logistics_settings` singleton, return fee snapshot on orders |
| 015 | `015_cities.sql` | `cities` table + Morocco seed cities |
| 016 | `016_factory_cost_and_auto_commission.sql` | `factory_cost_mad` on products |
| 017 | `017_affiliate_order_source_and_wholesaler_billing.sql` | `order_source`, wholesaler billing columns |
| 018 | `018_wholesale_access_and_invoice_request.sql` | `wholesale_access` flag, invoice fields |
| 019 | `019_import_on_demand_fields.sql` | `estimated_cost_mad`, `estimated_delivery_days` |
| 020 | `020_import_cost_model.sql` | Import pricing mode, estimated price, unit, notes |
| 021 | `021_import_tariffs.sql` | `import_tariffs` table, `tariff_mode` on products |
| 022 | `022_import_tariffs_shipping_modes.sql` | Shipping mode, customs price, `import_shipping_mode` |
| 023 | `023_quote_requests.sql` | `quote_requests` for import-on-demand |
| 024 | `024_wholesale_order_quote_link.sql` | `quote_request_id` FK on wholesale orders |
| 025 | `025_wholesale_order_cost_breakdown.sql` | Cost/profit columns + trigger on wholesale orders |
| 026 | `026_wholesale_order_import_status.sql` | `import_status`, `wholesale_order_import_history` |
| 027 | `027_quote_prepared_fields.sql` | Structured quote document fields, `quote_prepared` status |
| 028 | `028_quote_client_decision.sql` | Client accept/reject statuses, `client_decision_at` |
| 029 | `029_wholesale_payment_tracking.sql` | Payment status, deposits, `wholesale_order_payment_history` |
| 030 | `030_supplier_marketplace.sql` | `supplier` role, `supplier_products`, `supplier_quote_requests` |
| 031 | `031_supplier_type_and_categories.sql` | `supplier_type` (morocco / international) |
| 032 | `032_supplier_payout_tracking.sql` | Supplier financials + `supplier_payout_history` |
| 033 | `033_supplier_performance_and_issues.sql` | `supplier_issues` (admin-only) |
| 034 | `034_intelligent_sourcing.sql` | `sourcing_requests` |
| 035 | `035_supplier_catalog_bulk.sql` | Variants, MOQ tiers, bulk import tables |
| 036 | `036_supplier_samples_and_catalogs.sql` | Catalogs, attachments, sample requests |
| 037 | `037_rfq_matching_engine.sql` | `supplier_matching_profiles`, `rfq_matches`, `rfq_offers` |
| 038 | `038_premium_monetization.sql` | `premium_plans`, `supplier_subscriptions`, `subscription_audit_log` |
| 039 | `039_category_subcategory.sql` | `category` / `subcategory` fields on products |
| 040 | `040_wholesaler_badges_rls.sql` | RLS so wholesalers read active subscriptions for badge display ✓ committed 2026-05-31 |
| 041 | `041_order_tracking_rpc.sql` | `get_orders_by_phone(text)` SECURITY DEFINER RPC for public customer order tracking |

### 6.2 Key Tables

| Table | Purpose |
|-------|---------|
| `profiles` | All users; `role`, `wholesale_access`, billing fields |
| `products` | Internal platform products (COD + wholesale catalog) |
| `orders` | COD customer orders |
| `commissions` | Per-order affiliate commission records |
| `payouts` | Affiliate payout batches |
| `wholesale_cart_items` | Wholesaler cart |
| `wholesale_orders` / `wholesale_order_items` | B2B confirmed orders |
| `affiliate_clicks` | Click attribution for COD referral links |
| `affiliate_product_prices` | Affiliate custom sell prices |
| `order_signals` | Fraud/duplicate/spam signals per COD order |
| `cities` | Morocco cities with per-city delivery fee |
| `logistics_settings` | Global fee defaults singleton |
| `import_tariffs` | HS code tariff rules |
| `quote_requests` | Import-on-demand wholesale quote requests |
| `sourcing_requests` | Wholesale free-form sourcing |
| `supplier_products` | Supplier-submitted marketplace products |
| `supplier_product_attachments` | Files (PDF, video, images) per supplier product |
| `supplier_subscriptions` / `premium_plans` | Supplier premium tiers |
| `rfq_matches` / `rfq_offers` | RFQ engine output |
| `supplier_payout_history` | Supplier payment ledger |
| `wholesale_order_import_history` | Import status changelog |
| `wholesale_order_payment_history` | Payment changelog |

### 6.3 RLS Pattern
- `my_role()` helper function returns the authenticated user's role
- Policies are role-gated: `admin` sees everything; other roles see only their own data
- Anon access is limited to active+approved products (for public COD pages)
- Migration 040 (untracked) adds a read policy for wholesalers to query badge data

### 6.4 Key Database Functions / Triggers
| Name | Trigger point | Effect |
|------|--------------|--------|
| `handle_new_user` | `auth.users` insert | Creates `profiles` row |
| `handle_updated_at` | any row update | Stamps `updated_at` |
| `handle_order_delivered` | `orders.status` → `delivered` | Creates `commissions` row; idempotency guard |
| `reserve_stock` / `restore_stock` | RPC | Stock decrement / increment with floor guard |
| `update_wholesale_order_costs` | wholesale order update | Recalculates cost and profit |

---

## 7. Known Issues

### Fixed — commit `3dcbaad` (2026-05-31)

| # | Issue | Fix |
|---|-------|-----|
| — | `placeOrder` used `purchase_price_mad` instead of `factory_cost_mad` for commission calculation | Fetch and use `factory_cost_mad`, fall back to `purchase_price_mad` |
| — | `placeOrder` inserted raw `commissionAmount` (could be negative), violating DB `CHECK >= 0` | Wrapped with `Math.max(0, ...)` |
| — | `attribution_click_id` stored without validating it belongs to the claimed affiliate + product | Added server-side cross-check before insert |
| — | `NEXT_PUBLIC_APP_URL` fell back to `'https://yourapp.com'` — broken referral links on misconfigured deploy | Now falls back to `NEXT_PUBLIC_VERCEL_URL` then `localhost:3000` |
| — | `updateSupplierFinancials`, `updateSupplierPayoutStatus` missing `requireAdmin()` — any authenticated user could invoke them | Added `requireAdmin()` guard |
| — | `approveSupplierProduct`, `rejectSupplierProduct` missing `requireAdmin()` guard | Added `requireAdmin()` guard |

### Deferred — require DB migration or RPC redesign

| # | Issue | Blocker |
|---|-------|---------|
| DB-1 | `wholesale_access` users allowed by app layer but blocked by cart/orders RLS | Needs additive RLS policy migration |
| DB-2 | `createPayout` marks ALL approved commissions paid regardless of entered amount | Needs schema redesign (junction table) or amount sum constraint |
| DB-3 | `updateOrderStatus` has no server-side status transition guard — can skip `confirmed` | Needs state machine enforcement in action |
| DB-4 | Wholesale stock reserve loop has no rollback on partial failure | Needs transactional RPC |
| DB-5 | COD order overselling race: stock checked but not reserved at submit time | Design trade-off; fix requires reserve-on-insert RPC |
| DB-6 | Phone-based order tracking: no rate limiting — enumeration possible | Needs middleware IP rate limiting |
| DB-7 | `createWholesaleOrderAction` returns `void` — errors swallowed silently for admin | Needs caller refactor to `useActionState` |



### 7.1 Hardcoded Social Proof in Marketplace Product Detail
`/wholesale/marketplace/[id]/page.tsx` displays `4.9 ★`, `32 avis vérifiés`, `148 commandes sur 12 mois`, and `Taux de réponse 98%` as literal strings. No review, order count, or response-rate tables exist in the database. These numbers are cosmetic placeholders.

### 7.2 Hardcoded Variants Section
The "Variantes & personnalisation" section (colors and sizes) in the marketplace product detail page shows a fixed list of generic options unrelated to any product attribute. The `supplier_products` table has no variant column tied to this UI.

### 7.3 Untracked Files Required for Build
Four new client components (`ProductGalleryClient`, `QuantityStepperClient`, `MobileStickyBarClient`, `SampleRequestClient`) and `category-nav.tsx` are imported by committed pages but are themselves untracked. The app will fail to build from a clean checkout of this branch without these files.

### 7.4 Migration 040 Not Committed
`supabase/migrations/040_wholesaler_badges_rls.sql` is untracked. Without applying it (or the equivalent SQL), wholesalers will receive a Supabase RLS error when the marketplace page tries to fetch active subscription data for premium badges.

### 7.5 `NEXT_PUBLIC_APP_URL` Placeholder Fallback
In `src/app/(affiliate)/affiliate/products/page.tsx`, the referral URL construction falls back to `'https://yourapp.com'` if `NEXT_PUBLIC_APP_URL` is not set. If this env var is missing in any environment, all affiliate referral links will be broken.

### 7.6 Affiliate Area Not Rebranded
The affiliate area (`/affiliate/*`) uses a plain text header, while all other areas use `MozounaLogo` and the branding component suite added in migration-adjacent commit `94d2610`. Affiliate pages are visually inconsistent with the rest of the platform.

### 7.7 Duplicate Product Catalogs Without Cross-Discovery
Wholesalers have two separate browsing surfaces — `/wholesale/products` (internal products) and `/wholesale/marketplace` (supplier products) — with no shared search, unified listing, or cross-linking between them. This creates a fragmented buying experience.

### 7.8 `SampleRequestClient` — Committed Dependency, Untracked File
`SampleRequestClient.tsx` in the marketplace detail directory is imported by `page.tsx` but exists only on disk (untracked). It is not the same as the `sample-requests` server action; it is a client-side form component.

### 7.9 No README at Repository Root
There is no `README.md`. New developers or agents have no entry point documentation. The equivalent content is spread across `.cursor/rules/`, `docs/AGENT_WORKFLOW.md`, and `docs/PROJECT_ARCHITECTURE.md` (the latter is partially outdated relative to current routes).

### 7.11 Migration 040 Still Needs Applying
`040_wholesaler_badges_rls.sql` remains untracked and unapplied. Migration 041 (`get_orders_by_phone` RPC) has been written and committed but also needs to be applied to Supabase via `npm run migrate` before `/orders/track` will function on the live database.

### 7.10 `agent` Role Has No Routes
The `agent` role is defined in `src/types/database.ts` and the `profiles` table but has no route group, no layout, and no pages. Any user promoted to `agent` would see nothing after login.

---

## 8. Recommended Next Priorities

Ordered by business impact and build stability:

### Priority 1 — Commit and stabilize WIP (immediate)
1. Commit the four untracked client components (`ProductGalleryClient`, `QuantityStepperClient`, `MobileStickyBarClient`, `SampleRequestClient`) and `category-nav.tsx` to unblock a clean build from git checkout
2. Commit migration `040_wholesaler_badges_rls.sql` and apply it via `npm run migrate`
3. Commit the three seed scripts or delete them to keep the working tree clean
4. Run `npm run safe-check` to confirm the build passes

### Priority 2 — Remove hardcoded placeholders
5. Remove or clearly mark the hardcoded social proof stats (reviews, order count, response rate) in the marketplace product detail; either hide them or replace with real aggregate queries
6. Remove the hardcoded variants section or implement a real variant model on `supplier_products`

### ~~Priority 3 — Affiliate area alignment~~ ✅ DONE (commit `5510f52`)
~~7. Rebrand the affiliate area header with `MozounaLogo`~~ — Done for products, orders, commissions pages.
8. Ensure `NEXT_PUBLIC_APP_URL` is documented in `.env.production.example` and validated on startup (throw early if missing) — still pending.

### ~~Priority 4 — Customer order tracking~~ ✅ DONE (commit `53f6824`)
~~9. Build a public order status lookup page for COD customers~~ — **Built**: `/orders/track?phone=...` is live. Phone lookup, status timeline, tracking number display.

### Priority 5 — Operations
~~10. Add automated commission approval trigger or at minimum a bulk-approve UI~~ — ✅ DONE (commit `5510f52`): `BulkApproveButton` on `/admin/commissions` — one click approves all pending commissions in the current view.
11. Add stock depletion notification (admin alert when `stock_count` reaches 0) — still pending.

### Priority 6 — Documentation
12. Create a `README.md` at the repository root with: local setup steps, env var reference, migration workflow, and role descriptions

### Priority 7 — Unified catalog
13. Evaluate merging `/wholesale/products` and `/wholesale/marketplace` into a single browsing experience, or add clear navigation signposting between them

---

*Last updated: 2026-05-31 — commit `0cc345c`. Branch: `chore/agent-operating-system` (41 migrations, 65 routes, 25 server action modules, 50 components).*
