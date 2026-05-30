-- ─── Quote Requests ──────────────────────────────────────────────────────────
-- Wholesale buyers can request a quote for import_on_demand products.
-- Admin reviews, studies, quotes, negotiates, approves or rejects.

CREATE TABLE IF NOT EXISTS quote_requests (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id              uuid        NOT NULL REFERENCES profiles(id),
  product_id            uuid        NOT NULL REFERENCES products(id),
  quantity_requested    integer     NOT NULL CHECK (quantity_requested > 0),
  destination_country   text        NOT NULL,
  destination_city      text,
  preferred_shipping_mode text,
  colors_or_variants    text,
  sizes                 text,
  buyer_notes           text,
  whatsapp_number       text        NOT NULL,
  status                text        NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','studying','quoted','negotiating','approved','rejected','converted_to_order')),
  admin_notes           text,
  admin_notes_public    boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_requests_admin_all ON quote_requests;
CREATE POLICY quote_requests_admin_all ON quote_requests
  FOR ALL TO authenticated
  USING (my_role() = 'admin')
  WITH CHECK (my_role() = 'admin');

DROP POLICY IF EXISTS quote_requests_buyer_own ON quote_requests;
CREATE POLICY quote_requests_buyer_own ON quote_requests
  FOR ALL TO authenticated
  USING (buyer_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid());

-- ── updated_at trigger ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_quote_requests_updated_at ON quote_requests;
CREATE TRIGGER set_quote_requests_updated_at
  BEFORE UPDATE ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
