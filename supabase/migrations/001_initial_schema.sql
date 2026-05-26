-- =============================================================================
-- Migration: 001_initial_schema
-- Project:   Affiliate + Wholesale Platform
-- Created:   2026-05-26
--
-- Run this in: Supabase dashboard → SQL Editor → New query → Run
--
-- Tables (8):
--   profiles, products, orders,
--   wholesale_cart_items, wholesale_orders, wholesale_order_items,
--   commissions, payouts
-- =============================================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- =============================================================================
-- TABLES
-- =============================================================================

-- 1. profiles ─────────────────────────────────────────────────────────────────
--    One row per authenticated user. Created automatically by the
--    handle_new_user trigger when a user signs up via Supabase Auth.
create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  role         text        not null
                           check (role in ('admin', 'affiliate', 'wholesaler', 'agent')),
  full_name    text        not null default '',
  phone        text,
  city         text,
  bank_account text,
  status       text        not null default 'pending'
                           check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now()
);

-- 2. products ─────────────────────────────────────────────────────────────────
--    Single product table shared by both journeys.
--    commission_amount is shown to affiliates only.
--    wholesale_tiers (JSONB) is shown to wholesale buyers only.
create table public.products (
  id                uuid          primary key default uuid_generate_v4(),
  name              text          not null,
  description       text,
  sell_price        numeric(10,2) not null check (sell_price > 0),
  commission_amount numeric(10,2) not null default 0 check (commission_amount >= 0),
  -- Array of {min_qty, max_qty?, price_per_unit} objects.
  -- Last tier always omits max_qty (open-ended).
  wholesale_tiers   jsonb         not null default '[]'::jsonb,
  wholesale_min_qty integer       not null default 1 check (wholesale_min_qty >= 1),
  stock_count       integer       not null default 0 check (stock_count >= 0),
  images            text[]        not null default '{}',
  type              text          not null check (type in ('local', 'imported')),
  active            boolean       not null default true,
  created_at        timestamptz   not null default now()
);

-- 3. orders ───────────────────────────────────────────────────────────────────
--    COD affiliate orders. No wholesale fields here.
create table public.orders (
  id                uuid          primary key default uuid_generate_v4(),
  affiliate_id      uuid          not null references public.profiles(id),
  product_id        uuid          not null references public.products(id),
  customer_name     text          not null,
  customer_phone    text          not null,
  customer_city     text          not null,
  customer_address  text          not null,
  quantity          integer       not null default 1 check (quantity > 0),
  total_amount      numeric(10,2) not null check (total_amount > 0),
  commission_amount numeric(10,2) not null check (commission_amount >= 0),
  status            text          not null default 'pending'
                                  check (status in (
                                    'pending', 'confirmed', 'shipped',
                                    'delivered', 'returned', 'cancelled'
                                  )),
  notes             text,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

-- 4. wholesale_cart_items ─────────────────────────────────────────────────────
--    DB-backed cart (not localStorage). Persists across sessions.
--    UNIQUE constraint prevents duplicate product rows per buyer.
create table public.wholesale_cart_items (
  id         uuid        primary key default uuid_generate_v4(),
  buyer_id   uuid        not null references public.profiles(id) on delete cascade,
  product_id uuid        not null references public.products(id) on delete cascade,
  quantity   integer     not null check (quantity > 0),
  added_at   timestamptz not null default now(),
  unique (buyer_id, product_id)
);

-- 5. wholesale_orders ─────────────────────────────────────────────────────────
--    Order header. Line items are in wholesale_order_items.
--    agent_id is set by admin after submission.
create table public.wholesale_orders (
  id                  uuid          primary key default uuid_generate_v4(),
  buyer_id            uuid          not null references public.profiles(id),
  agent_id            uuid          references public.profiles(id),
  delivery_preference text          not null
                                    check (delivery_preference in ('pickup', 'delivery')),
  city                text,
  address             text,
  buyer_notes         text,
  -- agent_notes: internal only, never shown to the buyer
  agent_notes         text,
  total_amount        numeric(10,2) not null default 0 check (total_amount >= 0),
  status              text          not null default 'submitted'
                                    check (status in (
                                      'submitted', 'contacted', 'validated',
                                      'awaiting_payment', 'paid', 'ready',
                                      'completed', 'cancelled'
                                    )),
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

-- 6. wholesale_order_items ────────────────────────────────────────────────────
--    Line items with price snapshot. unit_price_snapshot and tier_label_snapshot
--    are written once at submission and NEVER updated — price changes to products
--    do not retroactively affect existing orders.
create table public.wholesale_order_items (
  id                  uuid          primary key default uuid_generate_v4(),
  order_id            uuid          not null references public.wholesale_orders(id) on delete cascade,
  product_id          uuid          not null references public.products(id),
  quantity            integer       not null check (quantity > 0),
  unit_price_snapshot numeric(10,2) not null check (unit_price_snapshot > 0),
  subtotal            numeric(10,2) not null check (subtotal > 0),
  -- Human-readable tier label captured at submission, e.g. "10–49 unités @ 120 MAD/u"
  tier_label_snapshot text          not null
);

-- 7. commissions ──────────────────────────────────────────────────────────────
--    Created automatically by the handle_order_delivered trigger.
--    One row per delivered COD order. Affiliate journey only.
create table public.commissions (
  id           uuid          primary key default uuid_generate_v4(),
  affiliate_id uuid          not null references public.profiles(id),
  order_id     uuid          not null references public.orders(id),
  amount       numeric(10,2) not null check (amount > 0),
  status       text          not null default 'pending'
                             check (status in ('pending', 'approved', 'paid')),
  created_at   timestamptz   not null default now(),
  paid_at      timestamptz
);

-- 8. payouts ──────────────────────────────────────────────────────────────────
--    Manually created by admin when transferring commission funds.
--    Affiliate journey only. Wholesale payments are tracked outside the app.
create table public.payouts (
  id           uuid          primary key default uuid_generate_v4(),
  affiliate_id uuid          not null references public.profiles(id),
  amount       numeric(10,2) not null check (amount > 0),
  status       text          not null default 'pending'
                             check (status in ('pending', 'processing', 'paid')),
  reference    text,
  notes        text,
  created_at   timestamptz   not null default now(),
  paid_at      timestamptz
);

-- =============================================================================
-- INDEXES
-- =============================================================================

create index idx_orders_affiliate_id      on public.orders(affiliate_id);
create index idx_orders_product_id        on public.orders(product_id);
create index idx_orders_status            on public.orders(status);
create index idx_orders_created_at        on public.orders(created_at desc);

create index idx_cart_buyer_id            on public.wholesale_cart_items(buyer_id);

create index idx_wo_buyer_id              on public.wholesale_orders(buyer_id);
create index idx_wo_agent_id              on public.wholesale_orders(agent_id);
create index idx_wo_status                on public.wholesale_orders(status);
create index idx_wo_created_at            on public.wholesale_orders(created_at desc);

create index idx_woi_order_id             on public.wholesale_order_items(order_id);

create index idx_commissions_affiliate_id on public.commissions(affiliate_id);
create index idx_commissions_order_id     on public.commissions(order_id);
create index idx_commissions_status       on public.commissions(status);

create index idx_payouts_affiliate_id     on public.payouts(affiliate_id);
create index idx_payouts_status           on public.payouts(status);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- updated_at: auto-bump on any row update ─────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.handle_updated_at();

create trigger wholesale_orders_updated_at
  before update on public.wholesale_orders
  for each row execute function public.handle_updated_at();

-- handle_new_user: create profile row on auth signup ──────────────────────────
--
-- When a user signs up via supabase.auth.signUp(), they pass metadata:
--   { full_name: '...', role: 'affiliate' | 'wholesaler' }
-- This trigger reads that metadata and inserts the profile row.
-- Admin and agent accounts are created directly in the DB (no public signup).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'affiliate'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'pending'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- handle_order_delivered: auto-create commission when order is delivered ───────
--
-- This runs as a DB trigger (not application code) to guarantee
-- commission creation is atomic with the status change and cannot be skipped.
-- Uses ON CONFLICT DO NOTHING to prevent duplicate commissions if the trigger
-- fires more than once (e.g. delivered → other status → delivered again).
create or replace function public.handle_order_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'delivered' and old.status <> 'delivered' then
    insert into public.commissions (affiliate_id, order_id, amount, status)
    values (new.affiliate_id, new.id, new.commission_amount, 'pending')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_order_delivered
  after update on public.orders
  for each row execute function public.handle_order_delivered();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.products             enable row level security;
alter table public.orders               enable row level security;
alter table public.wholesale_cart_items enable row level security;
alter table public.wholesale_orders     enable row level security;
alter table public.wholesale_order_items enable row level security;
alter table public.commissions          enable row level security;
alter table public.payouts              enable row level security;

-- Helper function: returns the current user's role from profiles.
-- STABLE: result is constant within a single query, so Postgres can cache it.
-- SECURITY DEFINER: bypasses RLS on profiles so the function always works.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ─── profiles ─────────────────────────────────────────────────────────────────

-- Users can read their own profile; admins can read all.
create policy "profiles: read own or admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');

-- Users can update their own non-sensitive fields.
-- The WITH CHECK prevents any user from changing their own role or status.
create policy "profiles: update own (no role/status change)"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role   = (select role   from public.profiles where id = auth.uid())
    and status = (select status from public.profiles where id = auth.uid())
  );

-- Admin can update any profile (role and status changes go through here).
create policy "profiles: admin update any"
  on public.profiles for update
  to authenticated
  using (public.my_role() = 'admin');

-- ─── products ─────────────────────────────────────────────────────────────────

-- All authenticated users can read active products.
create policy "products: authenticated read active"
  on public.products for select
  to authenticated
  using (active = true or public.my_role() = 'admin');

create policy "products: admin insert"
  on public.products for insert
  to authenticated
  with check (public.my_role() = 'admin');

create policy "products: admin update"
  on public.products for update
  to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

create policy "products: admin delete"
  on public.products for delete
  to authenticated
  using (public.my_role() = 'admin');

-- ─── orders (COD affiliate) ───────────────────────────────────────────────────

create policy "orders: affiliates read own"
  on public.orders for select
  to authenticated
  using (affiliate_id = auth.uid() or public.my_role() = 'admin');

create policy "orders: affiliates insert own"
  on public.orders for insert
  to authenticated
  with check (
    affiliate_id = auth.uid()
    and public.my_role() = 'affiliate'
  );

create policy "orders: admin update status"
  on public.orders for update
  to authenticated
  using (public.my_role() = 'admin');

-- ─── wholesale_cart_items ──────────────────────────────────────────────────────

create policy "cart: wholesalers read own"
  on public.wholesale_cart_items for select
  to authenticated
  using (buyer_id = auth.uid() or public.my_role() = 'admin');

create policy "cart: wholesalers insert"
  on public.wholesale_cart_items for insert
  to authenticated
  with check (buyer_id = auth.uid() and public.my_role() = 'wholesaler');

create policy "cart: wholesalers update own"
  on public.wholesale_cart_items for update
  to authenticated
  using  (buyer_id = auth.uid() and public.my_role() = 'wholesaler')
  with check (buyer_id = auth.uid());

create policy "cart: wholesalers delete own"
  on public.wholesale_cart_items for delete
  to authenticated
  using (buyer_id = auth.uid() and public.my_role() = 'wholesaler');

-- ─── wholesale_orders ─────────────────────────────────────────────────────────

-- Buyers see their own orders; agents see their assigned orders; admin sees all.
create policy "wholesale_orders: read"
  on public.wholesale_orders for select
  to authenticated
  using (
    buyer_id = auth.uid()
    or agent_id = auth.uid()
    or public.my_role() = 'admin'
  );

create policy "wholesale_orders: buyers insert"
  on public.wholesale_orders for insert
  to authenticated
  with check (buyer_id = auth.uid() and public.my_role() = 'wholesaler');

-- Agents can update their assigned orders (status, agent_notes).
-- Admin can update any order (including assigning agents).
create policy "wholesale_orders: agents and admin update"
  on public.wholesale_orders for update
  to authenticated
  using (agent_id = auth.uid() or public.my_role() = 'admin');

-- ─── wholesale_order_items ────────────────────────────────────────────────────

-- Read: buyer who owns the order, assigned agent, or admin.
create policy "wholesale_order_items: read"
  on public.wholesale_order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.wholesale_orders wo
      where wo.id = order_id
        and (
          wo.buyer_id = auth.uid()
          or wo.agent_id = auth.uid()
          or public.my_role() = 'admin'
        )
    )
  );

-- Insert: only the buyer who owns the parent order (at cart submission time).
create policy "wholesale_order_items: buyers insert"
  on public.wholesale_order_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.wholesale_orders wo
      where wo.id = order_id and wo.buyer_id = auth.uid()
    )
  );

-- ─── commissions ──────────────────────────────────────────────────────────────

-- Commissions are created by the handle_order_delivered trigger (service role).
-- Affiliates can read their own; admin can read and update all.
create policy "commissions: affiliates read own"
  on public.commissions for select
  to authenticated
  using (affiliate_id = auth.uid() or public.my_role() = 'admin');

create policy "commissions: admin update"
  on public.commissions for update
  to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- ─── payouts ──────────────────────────────────────────────────────────────────

create policy "payouts: affiliates read own"
  on public.payouts for select
  to authenticated
  using (affiliate_id = auth.uid() or public.my_role() = 'admin');

create policy "payouts: admin insert"
  on public.payouts for insert
  to authenticated
  with check (public.my_role() = 'admin');

create policy "payouts: admin update"
  on public.payouts for update
  to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- =============================================================================
-- FIRST ADMIN SETUP (run manually after applying this migration)
-- =============================================================================
--
-- 1. Go to Supabase dashboard → Authentication → Users → Add user
--    Email: your-admin@email.com, Password: (strong password)
--    Copy the UUID of the created user.
--
-- 2. Run this SQL with your UUID:
--
--    UPDATE public.profiles
--    SET role = 'admin', status = 'approved'
--    WHERE id = 'PASTE-YOUR-UUID-HERE';
--
-- Now you can log in as admin and approve other users.
-- =============================================================================
