-- =============================================================================
-- Migration 005 — Proof/receipt schema · Search indexes · Architecture notes
-- =============================================================================

-- =============================================================================
-- 1. ORDER PROOFS TABLE
-- =============================================================================
-- Purpose: attachment-ready storage for any receipt/proof document linked
--          to a COD order, wholesale order, or product reception.
--
-- Storage approach for MVP:
--   file_url stores a Supabase Storage URL (manual upload via admin UI in a
--   future day). No OCR, no AI, no automated processing.
--
-- Linkage strategy:
--   A proof can be linked to a COD order, a wholesale order, OR a product —
--   at most one of the three. The CHECK constraint below enforces this.
--   linked_entity views are determined by proof_type:
--
--   proof_type               | typically linked to
--   ─────────────────────────┼─────────────────────────────────────────
--   bank_receipt             | order or wholesale_order (payment in)
--   transfer_proof           | order (COD affiliate payout proof)
--   delivery_receipt         | order or wholesale_order
--   return_receipt           | order (returned goods)
--   stock_reception_proof    | product (supplier delivery)
--   other                    | any or none
-- =============================================================================

CREATE TABLE public.order_proofs (
  id                       uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  proof_type               text        NOT NULL
                                       CHECK (proof_type IN (
                                         'bank_receipt',
                                         'transfer_proof',
                                         'delivery_receipt',
                                         'return_receipt',
                                         'stock_reception_proof',
                                         'other'
                                       )),
  file_url                 text        NOT NULL,
  uploaded_by              uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Exactly one of these three should be non-null (soft constraint, enforced by app)
  related_order_id         uuid        REFERENCES public.orders(id) ON DELETE CASCADE,
  related_wholesale_order_id uuid      REFERENCES public.wholesale_orders(id) ON DELETE CASCADE,
  related_product_id       uuid        REFERENCES public.products(id) ON DELETE CASCADE,

  notes                    text,
  uploaded_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_proofs_order_id      ON public.order_proofs(related_order_id)
  WHERE related_order_id IS NOT NULL;
CREATE INDEX idx_proofs_wo_id         ON public.order_proofs(related_wholesale_order_id)
  WHERE related_wholesale_order_id IS NOT NULL;
CREATE INDEX idx_proofs_product_id    ON public.order_proofs(related_product_id)
  WHERE related_product_id IS NOT NULL;
CREATE INDEX idx_proofs_uploaded_by   ON public.order_proofs(uploaded_by);
CREATE INDEX idx_proofs_uploaded_at   ON public.order_proofs(uploaded_at DESC);
CREATE INDEX idx_proofs_type          ON public.order_proofs(proof_type);

-- RLS
ALTER TABLE public.order_proofs ENABLE ROW LEVEL SECURITY;

-- Admin can see and create all proofs
CREATE POLICY "proofs: admin full access"
  ON public.order_proofs
  FOR ALL TO authenticated
  USING  (public.my_role() IN ('admin', 'agent'))
  WITH CHECK (public.my_role() IN ('admin', 'agent'));

-- Affiliates can see proofs for their own orders (e.g. transfer proofs)
CREATE POLICY "proofs: affiliates read own order proofs"
  ON public.order_proofs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = related_order_id
        AND o.affiliate_id = auth.uid()
    )
  );

-- Wholesale buyers can see proofs for their own wholesale orders
CREATE POLICY "proofs: buyers read own wholesale proofs"
  ON public.order_proofs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wholesale_orders wo
      WHERE wo.id = related_wholesale_order_id
        AND wo.buyer_id = auth.uid()
    )
  );

-- =============================================================================
-- 2. SEARCH OPTIMIZATION INDEXES
-- =============================================================================
-- Trigram-based search for product names/descriptions and customer data.
-- These use pg_trgm extension for fast ILIKE / similarity queries.
-- If CREATE EXTENSION fails (not installed), the ilike queries still work
-- but slightly slower (full sequential scan).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Products: fast name/supplier search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_supplier_trgm
  ON public.products USING GIN (supplier_name gin_trgm_ops)
  WHERE supplier_name IS NOT NULL;

-- Orders: fast customer search
CREATE INDEX IF NOT EXISTS idx_orders_customer_name_trgm
  ON public.orders USING GIN (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone_trgm
  ON public.orders USING GIN (customer_phone gin_trgm_ops);

-- Low-stock partial index (most queried subset of products)
CREATE INDEX IF NOT EXISTS idx_products_low_stock
  ON public.products (stock_count)
  WHERE stock_count < 5 AND active = true;

-- =============================================================================
-- 3. WHATSAPP OPERATIONAL WORKFLOWS — ARCHITECTURE NOTES
-- =============================================================================
-- These notes describe the future integration surface.
-- Nothing is implemented here. All fields needed already exist in the schema.
--
-- ─── 3.1  Order confirmation to customer ────────────────────────────────────
--   Trigger:  orders.status transitions to 'confirmed'
--   Target:   orders.customer_phone
--   Content:  order ref, product, total, expected delivery window
--   Storage:  message log table (future: wa_messages) with status tracking
--   API:      Meta WhatsApp Business API (POST /messages)
--             or Twilio WhatsApp API as fallback
--
-- ─── 3.2  Delivery status update ────────────────────────────────────────────
--   Trigger:  orders.status transitions to 'shipped'
--   Target:   orders.customer_phone
--   Content:  tracking number, delivery company, expected delivery date
--   Requires: orders.tracking_number, orders.delivery_company (already in schema)
--
-- ─── 3.3  COD payment reminder to affiliate ─────────────────────────────────
--   Trigger:  Scheduled job — orders where:
--               status = 'delivered'
--               AND delivered_at + 3 days < NOW()
--               AND cod_transfer_received_at IS NULL
--   Target:   profiles.phone WHERE id = orders.affiliate_id
--   Content:  order ref, cod_expected amount, due date, admin bank details
--   Requires: orders.delivered_at, orders.cod_expected, orders.cod_transfer_received_at
--             (all already in schema from migration 004)
--
-- ─── 3.4  Wholesale order update to buyer ───────────────────────────────────
--   Trigger:  wholesale_orders.status transitions (any meaningful transition)
--   Target:   profiles.phone WHERE id = wholesale_orders.buyer_id
--   Content:  order ref, new status, expected timeline
--   Note:     buyer notes / agent notes can be included
--
-- ─── 3.5  Supplier communication ────────────────────────────────────────────
--   Trigger:  wholesale_orders.status transitions to 'sourcing'
--   Target:   products.supplier_name / future suppliers table
--   Content:  product requirements, quantities, delivery address
--   Requires: wholesale_order_items joined with products.supplier_name
--             (supplier_name already in products table from migration 003)
--
-- ─── Implementation pattern (Day N) ─────────────────────────────────────────
--   1. Create wa_messages table:
--        id, direction (in/out), to_phone, content, status (pending/sent/failed),
--        related_order_id, related_wholesale_order_id, sent_at, error_message
--   2. Server action sendWhatsApp(phone, message, relatedId)
--        → inserts wa_messages row, calls external API, updates status
--   3. Status transition hooks in updateOrderStatus / updateWholesaleOrderStatus
--        → call sendWhatsApp() after successful status change
--   4. Cron-based reminder (Vercel Cron or pg_cron)
--        → SELECT overdue COD orders → sendWhatsApp reminder
-- =============================================================================
