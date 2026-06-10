-- Migration 041: Public RPC for customer order tracking by phone number
-- Safe SECURITY DEFINER function — no affiliate, fraud, or commission data is exposed.
-- Anon and authenticated users can call this; RLS on orders table is bypassed intentionally.

CREATE OR REPLACE FUNCTION public.get_orders_by_phone(p_phone text)
RETURNS TABLE (
  id          uuid,
  status      text,
  customer_name text,
  customer_city text,
  quantity    integer,
  total_amount numeric,
  product_name text,
  tracking_number text,
  delivery_company text,
  created_at  timestamptz,
  confirmed_at timestamptz,
  shipped_at  timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  returned_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.status,
    o.customer_name,
    o.customer_city,
    o.quantity,
    o.total_amount,
    COALESCE(p.name, 'Produit') AS product_name,
    o.tracking_number,
    o.delivery_company,
    o.created_at,
    o.confirmed_at,
    o.shipped_at,
    o.delivered_at,
    o.cancelled_at,
    o.returned_at
  FROM orders o
  LEFT JOIN products p ON p.id = o.product_id
  WHERE o.customer_phone = trim(p_phone)
    AND trim(p_phone) <> ''
  ORDER BY o.created_at DESC
  LIMIT 20;
$$;

-- Grant execute to both anon and authenticated roles so the Next.js server
-- component (which uses the anon key) can call it without authentication.
GRANT EXECUTE ON FUNCTION public.get_orders_by_phone(text) TO anon, authenticated;
