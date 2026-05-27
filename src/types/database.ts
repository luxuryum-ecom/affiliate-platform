// ─── ENUMS ───────────────────────────────────────────────────────────────────
// These mirror the CHECK constraints in the SQL schema exactly.
// If you change a constraint in SQL, update the union type here too.

export type UserRole = 'admin' | 'affiliate' | 'wholesaler' | 'agent'
export type UserStatus = 'pending' | 'approved' | 'rejected'
export type ProductType = 'local' | 'imported'

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | 'cancelled'

export type WholesaleOrderStatus =
  | 'submitted'
  | 'contacted'
  | 'validated'
  | 'awaiting_payment'
  | 'paid'
  | 'ready'
  | 'completed'
  | 'cancelled'

export type DeliveryPreference = 'pickup' | 'delivery'
export type CommissionStatus = 'pending' | 'approved' | 'paid'
export type PayoutStatus = 'pending' | 'processing' | 'paid'

// ─── WHOLESALE TIER ───────────────────────────────────────────────────────────
// Stored as a JSONB array in products.wholesale_tiers.
// The last tier in the array always has max_qty = undefined (open-ended).

export interface WholesaleTier {
  min_qty: number
  max_qty?: number
  price_per_unit: number
}

// ─── TABLE TYPES ─────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  phone: string | null
  city: string | null
  bank_account: string | null
  status: UserStatus
  created_at: string
}

export interface Product {
  id: string
  name: string
  description: string | null
  sell_price: number
  commission_amount: number
  wholesale_tiers: WholesaleTier[]
  wholesale_min_qty: number
  stock_count: number
  images: string[]
  type: ProductType
  active: boolean
  created_at: string
}

export interface Order {
  id: string
  affiliate_id: string
  product_id: string
  customer_name: string
  customer_phone: string
  customer_city: string
  customer_address: string
  quantity: number
  total_amount: number
  commission_amount: number
  status: OrderStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface WholesaleCartItem {
  id: string
  buyer_id: string
  product_id: string
  quantity: number
  added_at: string
}

export interface WholesaleOrder {
  id: string
  buyer_id: string
  agent_id: string | null
  delivery_preference: DeliveryPreference
  city: string | null
  address: string | null
  buyer_notes: string | null
  agent_notes: string | null
  total_amount: number
  status: WholesaleOrderStatus
  created_at: string
  updated_at: string
}

export interface WholesaleOrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price_snapshot: number
  subtotal: number
  tier_label_snapshot: string
}

export interface Commission {
  id: string
  affiliate_id: string
  order_id: string
  amount: number
  status: CommissionStatus
  created_at: string
  paid_at: string | null
}

export interface Payout {
  id: string
  affiliate_id: string
  amount: number
  status: PayoutStatus
  reference: string | null
  notes: string | null
  created_at: string
  paid_at: string | null
}

// ─── JOINED / EXTENDED TYPES ─────────────────────────────────────────────────
// Used in query results that join related tables.

export interface OrderWithProduct extends Order {
  product: Pick<Product, 'id' | 'name' | 'images'>
}

export interface OrderWithAffiliate extends Order {
  affiliate: Pick<Profile, 'id' | 'full_name' | 'phone'>
}

export interface WholesaleOrderWithItems extends WholesaleOrder {
  items: (WholesaleOrderItem & { product: Pick<Product, 'id' | 'name' | 'images'> })[]
  buyer: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'>
  agent: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
}

export interface WholesaleCartItemWithProduct extends WholesaleCartItem {
  product: Product
}

export interface CommissionWithOrder extends Commission {
  order: Pick<Order, 'id' | 'customer_name' | 'quantity' | 'total_amount' | 'status' | 'created_at'>
}

// ─── DATABASE TYPE (for Supabase client generics) ─────────────────────────────
// Hand-written stub that satisfies the shape @supabase/supabase-js v2 expects.
// Replace with the generated output of:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/supabase.ts
// once the Supabase project is connected.
//
// Each table entry requires Row, Insert, Update, AND Relationships.
// Views, Enums, CompositeTypes must be present (can be empty objects).

type TableDef<R, I, U> = {
  Row: R
  Insert: I
  Update: U
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<
        Profile,
        Omit<Profile, 'created_at'>,
        Partial<Profile>
      >
      products: TableDef<
        Product,
        Omit<Product, 'id' | 'created_at'>,
        Partial<Product>
      >
      orders: TableDef<
        Order,
        Omit<Order, 'id' | 'created_at' | 'updated_at'>,
        Partial<Order>
      >
      wholesale_cart_items: TableDef<
        WholesaleCartItem,
        Omit<WholesaleCartItem, 'id' | 'added_at'>,
        Partial<WholesaleCartItem>
      >
      wholesale_orders: TableDef<
        WholesaleOrder,
        Omit<WholesaleOrder, 'id' | 'created_at' | 'updated_at'>,
        Partial<WholesaleOrder>
      >
      wholesale_order_items: TableDef<
        WholesaleOrderItem,
        Omit<WholesaleOrderItem, 'id'>,
        never
      >
      commissions: TableDef<
        Commission,
        Omit<Commission, 'id' | 'created_at'>,
        Partial<Commission>
      >
      payouts: TableDef<
        Payout,
        Omit<Payout, 'id' | 'created_at'>,
        Partial<Payout>
      >
    }
    Views: Record<never, never>
    Functions: {
      my_role: { Args: Record<string, never>; Returns: UserRole }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
