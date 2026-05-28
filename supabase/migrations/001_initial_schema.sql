-- =============================================================================
-- Migration: 001_initial_schema  (idempotent — safe to re-run)
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLES (all CREATE TABLE IF NOT EXISTS)
-- =============================================================================

-- 1. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text        NOT NULL
                           CHECK (role IN ('admin', 'affiliate', 'wholesaler', 'agent')),
  full_name    text        NOT NULL DEFAULT '',
  phone        text,
  city         text,
  bank_account text,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2. products
CREATE TABLE IF NOT EXISTS public.products (
  id                uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              text          NOT NULL,
  description       text,
  sell_price        numeric(10,2) NOT NULL CHECK (sell_price > 0),
  commission_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  wholesale_tiers   jsonb         NOT NULL DEFAULT '[]'::jsonb,
  wholesale_min_qty integer       NOT NULL DEFAULT 1 CHECK (wholesale_min_qty >= 1),
  stock_count       integer       NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  images            text[]        NOT NULL DEFAULT '{}',
  type              text          CHECK (type IN ('local', 'imported')),
  active            boolean       NOT NULL DEFAULT true,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

-- 3. orders
CREATE TABLE IF NOT EXISTS public.orders (
  id                uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id      uuid          REFERENCES public.profiles(id),
  product_id        uuid          NOT NULL REFERENCES public.products(id),
  customer_name     text          NOT NULL,
  customer_phone    text          NOT NULL,
  customer_city     text          NOT NULL,
  customer_address  text          NOT NULL,
  quantity          integer       NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_amount      numeric(10,2) NOT NULL CHECK (total_amount > 0),
  commission_amount numeric(10,2) NOT NULL CHECK (commission_amount >= 0),
  status            text          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN (
                                    'pending', 'confirmed', 'shipped',
                                    'delivered', 'returned', 'cancelled'
                                  )),
  notes             text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- 4. wholesale_cart_items
CREATE TABLE IF NOT EXISTS public.wholesale_cart_items (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity   integer     NOT NULL CHECK (quantity > 0),
  added_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, product_id)
);

-- 5. wholesale_orders
CREATE TABLE IF NOT EXISTS public.wholesale_orders (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id            uuid          NOT NULL REFERENCES public.profiles(id),
  agent_id            uuid          REFERENCES public.profiles(id),
  delivery_preference text          NOT NULL
                                    CHECK (delivery_preference IN ('pickup', 'delivery')),
  city                text,
  address             text,
  buyer_notes         text,
  agent_notes         text,
  total_amount        numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status              text          NOT NULL DEFAULT 'pending'
                                    CHECK (status IN (
                                      'pending', 'confirmed', 'sourcing',
                                      'shipped', 'delivered', 'cancelled'
                                    )),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- 6. wholesale_order_items
CREATE TABLE IF NOT EXISTS public.wholesale_order_items (
  id                  uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id            uuid          NOT NULL REFERENCES public.wholesale_orders(id) ON DELETE CASCADE,
  product_id          uuid          NOT NULL REFERENCES public.products(id),
  quantity            integer       NOT NULL CHECK (quantity > 0),
  unit_price_snapshot numeric(10,2) NOT NULL CHECK (unit_price_snapshot > 0),
  subtotal            numeric(10,2) NOT NULL CHECK (subtotal > 0),
  tier_label_snapshot text          NOT NULL
);

-- 7. commissions
CREATE TABLE IF NOT EXISTS public.commissions (
  id           uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id uuid          NOT NULL REFERENCES public.profiles(id),
  order_id     uuid          NOT NULL REFERENCES public.orders(id),
  amount       numeric(10,2) NOT NULL CHECK (amount > 0),
  status       text          NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'paid')),
  created_at   timestamptz   NOT NULL DEFAULT now(),
  paid_at      timestamptz
);

-- 8. payouts
CREATE TABLE IF NOT EXISTS public.payouts (
  id           uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id uuid          NOT NULL REFERENCES public.profiles(id),
  amount       numeric(10,2) NOT NULL CHECK (amount > 0),
  status       text          NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'processing', 'paid')),
  reference    text,
  notes        text,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  paid_at      timestamptz
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_id      ON public.orders(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id        ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status            ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at        ON public.orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_buyer_id            ON public.wholesale_cart_items(buyer_id);

CREATE INDEX IF NOT EXISTS idx_wo_buyer_id              ON public.wholesale_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_wo_agent_id              ON public.wholesale_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_wo_status                ON public.wholesale_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_created_at            ON public.wholesale_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_woi_order_id             ON public.wholesale_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_commissions_affiliate_id ON public.commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commissions_order_id     ON public.commissions(order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status       ON public.commissions(status);

CREATE INDEX IF NOT EXISTS idx_payouts_affiliate_id     ON public.payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status           ON public.payouts(status);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'affiliate'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_order_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status <> 'delivered'
     AND NEW.affiliate_id IS NOT NULL
     AND NEW.commission_amount > 0
  THEN
    INSERT INTO public.commissions (affiliate_id, order_id, amount, status)
    VALUES (NEW.affiliate_id, NEW.id, NEW.commission_amount, 'pending')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- =============================================================================
-- TRIGGERS  (DROP IF EXISTS → CREATE)
-- =============================================================================

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS wholesale_orders_updated_at ON public.wholesale_orders;
CREATE TRIGGER wholesale_orders_updated_at
  BEFORE UPDATE ON public.wholesale_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_order_delivered ON public.orders;
CREATE TRIGGER on_order_delivered
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_delivered();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_cart_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts               ENABLE ROW LEVEL SECURITY;

-- ── profiles ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles: read own or admin" ON public.profiles;
CREATE POLICY "profiles: read own or admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.my_role() = 'admin');

DROP POLICY IF EXISTS "profiles: update own (no role/status change)" ON public.profiles;
CREATE POLICY "profiles: update own (no role/status change)"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role   = (SELECT role   FROM public.profiles WHERE id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "profiles: admin update any" ON public.profiles;
CREATE POLICY "profiles: admin update any"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.my_role() = 'admin');

-- ── products ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "products: authenticated read active" ON public.products;
CREATE POLICY "products: authenticated read active"
  ON public.products FOR SELECT TO authenticated
  USING (active = true OR public.my_role() = 'admin');

DROP POLICY IF EXISTS "products: admin insert" ON public.products;
CREATE POLICY "products: admin insert"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "products: admin update" ON public.products;
CREATE POLICY "products: admin update"
  ON public.products FOR UPDATE TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "products: admin delete" ON public.products;
CREATE POLICY "products: admin delete"
  ON public.products FOR DELETE TO authenticated
  USING (public.my_role() = 'admin');

-- ── orders ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "orders: affiliates read own" ON public.orders;
CREATE POLICY "orders: affiliates read own"
  ON public.orders FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() OR public.my_role() = 'admin');

DROP POLICY IF EXISTS "orders: affiliates insert own" ON public.orders;
CREATE POLICY "orders: affiliates insert own"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    affiliate_id = auth.uid()
    AND public.my_role() = 'affiliate'
  );

DROP POLICY IF EXISTS "orders: admin update status" ON public.orders;
CREATE POLICY "orders: admin update status"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.my_role() = 'admin');

-- ── wholesale_cart_items ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cart: wholesalers read own" ON public.wholesale_cart_items;
CREATE POLICY "cart: wholesalers read own"
  ON public.wholesale_cart_items FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR public.my_role() = 'admin');

DROP POLICY IF EXISTS "cart: wholesalers insert" ON public.wholesale_cart_items;
CREATE POLICY "cart: wholesalers insert"
  ON public.wholesale_cart_items FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid() AND public.my_role() = 'wholesaler');

DROP POLICY IF EXISTS "cart: wholesalers update own" ON public.wholesale_cart_items;
CREATE POLICY "cart: wholesalers update own"
  ON public.wholesale_cart_items FOR UPDATE TO authenticated
  USING  (buyer_id = auth.uid() AND public.my_role() = 'wholesaler')
  WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "cart: wholesalers delete own" ON public.wholesale_cart_items;
CREATE POLICY "cart: wholesalers delete own"
  ON public.wholesale_cart_items FOR DELETE TO authenticated
  USING (buyer_id = auth.uid() AND public.my_role() = 'wholesaler');

-- ── wholesale_orders ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "wholesale_orders: read" ON public.wholesale_orders;
CREATE POLICY "wholesale_orders: read"
  ON public.wholesale_orders FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid()
    OR agent_id = auth.uid()
    OR public.my_role() = 'admin'
  );

DROP POLICY IF EXISTS "wholesale_orders: buyers insert" ON public.wholesale_orders;
CREATE POLICY "wholesale_orders: buyers insert"
  ON public.wholesale_orders FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid() AND public.my_role() = 'wholesaler');

DROP POLICY IF EXISTS "wholesale_orders: agents and admin update" ON public.wholesale_orders;
CREATE POLICY "wholesale_orders: agents and admin update"
  ON public.wholesale_orders FOR UPDATE TO authenticated
  USING (agent_id = auth.uid() OR public.my_role() = 'admin');

-- ── wholesale_order_items ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "wholesale_order_items: read" ON public.wholesale_order_items;
CREATE POLICY "wholesale_order_items: read"
  ON public.wholesale_order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = order_id
        AND (
          wo.buyer_id = auth.uid()
          OR wo.agent_id = auth.uid()
          OR public.my_role() = 'admin'
        )
    )
  );

DROP POLICY IF EXISTS "wholesale_order_items: buyers insert" ON public.wholesale_order_items;
CREATE POLICY "wholesale_order_items: buyers insert"
  ON public.wholesale_order_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = order_id AND wo.buyer_id = auth.uid()
    )
  );

-- ── commissions ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "commissions: affiliates read own" ON public.commissions;
CREATE POLICY "commissions: affiliates read own"
  ON public.commissions FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() OR public.my_role() = 'admin');

DROP POLICY IF EXISTS "commissions: admin update" ON public.commissions;
CREATE POLICY "commissions: admin update"
  ON public.commissions FOR UPDATE TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');

-- ── payouts ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "payouts: affiliates read own" ON public.payouts;
CREATE POLICY "payouts: affiliates read own"
  ON public.payouts FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() OR public.my_role() = 'admin');

DROP POLICY IF EXISTS "payouts: admin insert" ON public.payouts;
CREATE POLICY "payouts: admin insert"
  ON public.payouts FOR INSERT TO authenticated
  WITH CHECK (public.my_role() = 'admin');

DROP POLICY IF EXISTS "payouts: admin update" ON public.payouts;
CREATE POLICY "payouts: admin update"
  ON public.payouts FOR UPDATE TO authenticated
  USING (public.my_role() = 'admin')
  WITH CHECK (public.my_role() = 'admin');
