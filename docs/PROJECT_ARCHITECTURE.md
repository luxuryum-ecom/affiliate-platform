# Project Architecture — AffiPartner Morocco

Morocco-focused affiliate COD + wholesale B2B platform. MVP-first, single Next.js app.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, React 19, Tailwind CSS v4 |
| Backend | Supabase (PostgreSQL, Auth, RLS, Storage) |
| Deployment | Vercel (region: `cdg1` — Paris) |
| Language | TypeScript (strict, no `any`) |

## User journeys

```
┌─────────────────────────────────────────────────────────────────┐
│  AFFILIATE COD FLOW                                             │
│  Affiliate → shares /products/[id]?ref=[affiliateId]            │
│  Customer  → places COD order (no login)                        │
│  Admin     → confirms, ships, marks delivered                   │
│  System    → commission created on delivery                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  WHOLESALE B2B FLOW                                             │
│  Wholesaler → browses catalog, adds to cart                     │
│  Wholesaler → submits via WhatsApp link                         │
│  Admin      → confirms, creates wholesale order internally      │
│  Admin      → tracks: pending → confirmed → sourcing →        │
│               shipped → delivered                               │
└─────────────────────────────────────────────────────────────────┘
```

## Route map

### Public (no auth)
| Route | Purpose |
|---|---|
| `/` | Landing |
| `/login`, `/signup` | Auth |
| `/products/[id]?ref=[affiliateId]` | Public COD product page + order form |

### Admin (`role = admin`)
| Route | Purpose |
|---|---|
| `/admin/dashboard` | Overview |
| `/admin/products` | Product list + filters |
| `/admin/products/new` | Create product |
| `/admin/products/[id]/edit` | Edit product |
| `/admin/orders` | COD order management |
| `/admin/orders/[id]` | Order detail + status |
| `/admin/wholesale-orders` | Wholesale order list |
| `/admin/wholesale-orders/[id]` | Wholesale order detail |

### Affiliate (`role = affiliate`, `status = approved`)
| Route | Purpose |
|---|---|
| `/affiliate/dashboard` | Stats: orders by status, commission balance |
| `/affiliate/products` | Catalog (affiliate_enabled=true) + copy link |
| `/affiliate/orders` | Own order history |

Legacy: `/dashboard` redirects to `/affiliate/dashboard`.

### Wholesale (`role = wholesaler`, `status = approved`)
| Route | Purpose |
|---|---|
| `/wholesale/dashboard` | Overview stats |
| `/wholesale/products` | Full catalog |
| `/wholesale/products/[id]` | Product detail + add to cart |
| `/wholesale/cart` | Cart + WhatsApp submit |
| `/wholesale/orders` | Order history |

## Folder structure

```
src/
  app/
    (admin)/           Route group — admin layout guard
    (affiliate)/       Route group — affiliate layout guard
    (wholesale)/       Route group — wholesale layout guard
    (auth)/            Login, signup, pending
    actions/           Server actions (mutations)
    products/[id]/     Public COD page
  components/
    admin/             Product form, filters, status forms
    affiliate/         Copy link button
    wholesale/         Cart, add-to-cart, WhatsApp
    customer/          COD order form
    shared/            Order timeline, badges
  lib/
    supabase/server.ts Server Supabase client
    supabase/client.ts Browser Supabase client (uploads)
    utils.ts           formatMAD, getWholesaleTier, cn
  types/
    database.ts        Hand-written types (source of truth for app)
  middleware.ts        Session refresh

supabase/
  migrations/          001–008 sequential SQL files
  config.toml          Supabase CLI config

.cursor/rules/         AI agent rules (always read agent-operating-system.mdc)
docs/                  Human + agent documentation
scripts/               safe-check.sh verification gate
```

## Data model (core tables)

```
profiles ──────────────┬── orders (affiliate_id)
                       ├── commissions
                       ├── wholesale_cart_items
                       └── wholesale_orders ── wholesale_order_items

products ──────────────┬── orders (product_id)
                       ├── wholesale_cart_items
                       └── wholesale_order_items

order_proofs ────────── linked to orders / wholesale_orders / products
payouts ─────────────── affiliate commission payouts (admin-created)
```

## Key business fields (products)

| Field | Purpose |
|---|---|
| `availability_type` | `local_stock` \| `import_on_demand` |
| `origin_detail` | `locally_produced` \| `imported_but_in_morocco_stock` |
| `affiliate_enabled` | false when import_on_demand |
| `sell_price` | Platform base price (MAD) |
| `commission_amount` | Fixed MAD per delivered order |
| `confirmation_fee_mad` | Operational cost (default 10) |
| `packaging_fee_mad` | Operational cost (default 10) |
| `delivery_fee_mad` | Delivery estimate (default 0) |
| `wholesale_tiers` | JSONB `[{min_qty, max_qty?, price_per_unit}]` |
| `media` | JSONB `[{url, type}]` — images, video, telegram links |
| `approval_status` | draft → pending_review → approved → rejected |

## Coding patterns

### Server components (default)
```typescript
const supabase = await createClient()
const { data } = await supabase.from('products').select('*') as { data: Product[] | null; error: unknown }
```

### Server actions (all mutations)
```typescript
'use server'
export async function upsertProduct(state, formData) { ... }
```

### Client components (interactivity only)
```typescript
'use client'
const [state, action, isPending] = useActionState(serverAction, initialState)
```

### Route guards
Each role route group has `layout.tsx` that checks `profiles.role` and `profiles.status`.

## RLS summary

| Role | Access |
|---|---|
| `admin` | Full access via `my_role() = 'admin'` |
| `affiliate` | Own orders, commissions, payouts |
| `wholesaler` | Own cart, wholesale orders |
| `anon` | Read active+approved products, insert COD orders |

## External services (current)

| Service | Status |
|---|---|
| Supabase Auth | ✅ Active |
| Supabase Storage (`product-images`) | ✅ Active (manual bucket setup) |
| WhatsApp | ✅ Link-only (`NEXT_PUBLIC_WHATSAPP_PHONE`) |
| Payment gateway | ❌ Not yet |
| Delivery API | ❌ Not yet |
| Telegram bot | ❌ Not yet |
| AI orchestration | ❌ Not yet |

## Environment variables

| Variable | Scope | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Yes |
| `NEXT_PUBLIC_APP_URL` | Public | Yes |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | Public | Yes |

See `.env.production.example` for Vercel checklist.

## Migrations (current)

| # | File | Purpose |
|---|---|---|
| 001 | `initial_schema` | Core tables, RLS, triggers |
| 002 | `product_image_storage` | Storage bucket policies |
| 003 | `product_sourcing` | Sourcing, traceability, approval |
| 004 | `order_tracking` | COD fields, stock RPCs, anon orders |
| 005 | `proofs_and_search` | order_proofs, pg_trgm indexes |
| 006 | `stabilization` | Commission guard, products.updated_at |
| 007 | `product_model_correction` | availability_type, media, fees |
| 008 | `delivery_fee_and_costs` | delivery_fee_mad |

All migrations are idempotent. Apply via `npm run migrate`.

## Agent documentation index

| Document | Purpose |
|---|---|
| `docs/AGENT_WORKFLOW.md` | How agents execute tasks |
| `docs/RISK_APPROVAL_MATRIX.md` | What requires user approval |
| `docs/PROJECT_ARCHITECTURE.md` | This file |
| `.cursor/rules/agent-operating-system.mdc` | Master agent rules |
