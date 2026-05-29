// ─── ENUMS ───────────────────────────────────────────────────────────────────
// These mirror the CHECK constraints in the SQL schema exactly.
// If you change a constraint in SQL, update the union type here too.

export type UserRole = 'admin' | 'affiliate' | 'wholesaler' | 'agent'

/** How the platform margin is applied to factory cost. */
export type PlatformMarginType = 'percentage' | 'fixed'
export type UserStatus = 'pending' | 'approved' | 'rejected'

/** Legacy source type — kept for backward compat. Use availability_type + origin_detail instead. */
export type ProductSourceType = 'local_production' | 'imported'

/** Commercial availability of the product. */
export type ProductAvailabilityType = 'local_stock' | 'import_on_demand'

/** Origin detail — only relevant when availability_type = 'local_stock'. */
export type ProductOriginDetail = 'locally_produced' | 'imported_but_in_morocco_stock'

/** How the product was submitted into the system. */
export type ProductSubmittedVia = 'admin_dashboard' | 'telegram_future' | 'supplier_future'

/** Product review workflow state. active can only be true when this is 'approved'. */
export type ProductApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected'

/** Media type for product media items. */
export type MediaType = 'image' | 'video' | 'telegram_link' | 'external_link'

/** A single media entry in the product's media array. */
export interface MediaItem {
  url: string
  type: MediaType
}

export type OrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'shipped'
  | 'delivered'
  | 'returned'
  | 'cancelled'

/** Simplified 5-state lifecycle for wholesale orders (updated in migration 004). */
export type WholesaleOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'sourcing'
  | 'shipped'
  | 'delivered'
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

  // ── Commercial availability (migration 007) ───────────────────────────────
  /** 'local_stock' = in Morocco stock; 'import_on_demand' = B2B wholesale only */
  availability_type: ProductAvailabilityType
  /** Only set when availability_type = 'local_stock' */
  origin_detail: ProductOriginDetail | null
  /** Affiliates can promote this product. Always false when import_on_demand. */
  affiliate_enabled: boolean

  // ── Legacy source type (kept for backward compat) ─────────────────────────
  source_type: ProductSourceType

  // ── Sourcing & traceability ───────────────────────────────────────────────
  supplier_id: string | null
  supplier_name: string | null
  origin_country: string | null
  submitted_by: string | null
  submitted_via: ProductSubmittedVia

  // ── Cost inputs ───────────────────────────────────────────────────────────
  purchase_price: number | null
  /** Restricted to MAD | USD | AED */
  purchase_currency: string
  exchange_rate_to_mad: number
  /** Computed: purchase_price in MAD (factory cost). Stored for audit. */
  purchase_price_mad: number | null
  /** Legacy margin column kept for backward compat. Use platform_margin_value instead. */
  margin_percentage: number
  /** Computed: factory_cost + platform_margin, stored for audit. */
  calculated_sale_price_mad: number | null
  source_notes: string | null

  // ── Platform margin (migration 013) ───────────────────────────────────────
  /** 'percentage' — platform_price = factory_cost × (1 + value/100).
   *  'fixed' — platform_price = factory_cost + value (MAD). */
  platform_margin_type: PlatformMarginType
  /** The margin amount. % when type='percentage', MAD when type='fixed'. */
  platform_margin_value: number | null
  /** JSONB reserved for future courier API integration.
   *  Shape: {carrier_code?, zone_overrides?: [{city, fee_mad}], api_enabled?: bool} */
  delivery_fee_config: Record<string, unknown>

  // ── Factory cost (migration 016) ──────────────────────────────────────────
  /** Explicit admin-set factory cost in MAD. Used as the commission base.
   *  commission = sell_price − factory_cost_mad − platform_margin − delivery_fee_mad − confirmation_fee_mad − packaging_fee_mad */
  factory_cost_mad: number | null

  // ── Approval workflow ─────────────────────────────────────────────────────
  approval_status: ProductApprovalStatus
  approved_by: string | null
  approved_at: string | null

  // ── Sales / catalog ───────────────────────────────────────────────────────
  active: boolean
  sell_price: number
  commission_amount: number
  /** Fixed operational cost per confirmed affiliate order (default 10 MAD). */
  confirmation_fee_mad: number
  /** Fixed packaging cost per confirmed affiliate order (default 10 MAD). */
  packaging_fee_mad: number
  /** Estimated delivery company fee per order (default 0, varies by product/weight). */
  delivery_fee_mad: number
  wholesale_tiers: WholesaleTier[]
  wholesale_min_qty: number
  stock_count: number
  /** Structured media array (migration 007). Use this instead of images[]. */
  media: MediaItem[]
  /** Legacy image URL array (kept for backward compat). Use media instead. */
  images: string[]

  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  /** Null when customer orders directly (no referral link). */
  affiliate_id: string | null
  product_id: string
  customer_name: string
  customer_phone: string
  customer_city: string
  customer_address: string
  quantity: number
  total_amount: number
  commission_amount: number

  /** Immutable unit sell price at order time. */
  product_price_snapshot: number | null
  /** Immutable affiliate commission total at order time. */
  affiliate_commission_mad_snapshot: number | null
  /** Operational fee snapshots (per order, frozen at insert). */
  delivery_fee_snapshot: number | null
  packaging_fee_snapshot: number | null
  confirmation_fee_snapshot: number | null
  /** Return fee snapshot from logistics_settings at order creation. */
  return_fee_snapshot: number | null
  /** Link to the affiliate click that led to this order. */
  attribution_click_id: string | null

  /** AI-ready risk scores (0–100, nullable until computed). */
  fraud_score: number | null
  duplicate_risk_score: number | null
  spam_score: number | null
  signals_metadata: Record<string, unknown>

  status: OrderStatus
  notes: string | null

  // ── COD traceability (added migration 004) ────────────────────────────────
  delivery_company: string | null
  tracking_number: string | null
  /** Expected cash-on-delivery amount (= total_amount at confirmation). */
  cod_expected: number | null
  /** Actual COD amount received by admin. */
  cod_received: number | null
  /** Anomaly flag: cod_received < cod_expected. Computed at reconciliation. */
  return_reason: string | null
  /** Gap: delivered_at → cod_transfer_received_at = COD payment delay. */
  cod_transfer_received_at: string | null

  // ── Audit timestamps ──────────────────────────────────────────────────────
  confirmed_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  returned_at: string | null
  /** Set when order status transitions to 'cancelled'. Added migration 013. */
  cancelled_at: string | null

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
  /** Delivery cost for the whole order in MAD. Separate from product tier prices.
   *  total_amount = sum(line subtotals) + delivery_cost. Added migration 013. */
  delivery_cost: number
  status: WholesaleOrderStatus

  // ── Audit timestamps (added migration 004) ────────────────────────────────
  confirmed_at: string | null
  sourcing_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null

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
  /** True when the related order was returned or cancelled after delivery.
   *  Reversed commissions are excluded from payout calculations. Added migration 013. */
  reversed: boolean
  /** Timestamp when the commission was reversed. Null for active commissions. */
  reversed_at: string | null
  created_at: string
  paid_at: string | null
}

// ─── CITIES ───────────────────────────────────────────────────────────────────
// Admin-managed city list with per-city COD delivery fees.
// courier_* fields are populated by future courier API sync jobs.

export interface City {
  id: string
  name: string
  /** Operative delivery fee in MAD — always used for commission calculation. */
  delivery_fee_mad: number
  is_active: boolean

  // ── Future courier API integration ──────────────────────────────────────────
  /** Carrier city code (e.g. "CMN" for Casablanca). */
  courier_code: string | null
  /** Carrier zone classification. */
  courier_zone: string | null
  /** Fee last reported by courier API (advisory only — admin overrides via delivery_fee_mad). */
  courier_fee_mad: number | null
  courier_sync_enabled: boolean
  courier_last_synced_at: string | null
  courier_metadata: Record<string, unknown>

  created_at: string
  updated_at: string
}

// ─── LOGISTICS SETTINGS ───────────────────────────────────────────────────────
// Singleton row (id = 'default') — global COD delivery and return fee config.

export interface LogisticsSettings {
  id: string
  /** Delivery fee in MAD for Casablanca orders. */
  casablanca_delivery_fee_mad: number
  /** Delivery fee in MAD for all other Moroccan cities. */
  default_delivery_fee_mad: number
  /** Return fee in MAD applied to returned orders regardless of city. */
  return_fee_mad: number
  /** Reserved for future courier API integration. */
  api_config: Record<string, unknown>
  updated_at: string
  updated_by: string | null
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

export type ProofType =
  | 'bank_receipt'
  | 'transfer_proof'
  | 'delivery_receipt'
  | 'return_receipt'
  | 'stock_reception_proof'
  | 'other'

/** Attachment-ready proof/receipt record. Added in migration 005. */
export interface OrderProof {
  id: string
  proof_type: ProofType
  file_url: string
  uploaded_by: string
  /** Linked to a COD order (nullable). */
  related_order_id: string | null
  /** Linked to a wholesale order (nullable). */
  related_wholesale_order_id: string | null
  /** Linked to a product (e.g. stock reception proof) (nullable). */
  related_product_id: string | null
  notes: string | null
  uploaded_at: string
}

export interface AffiliateProductPrice {
  id: string
  affiliate_id: string
  product_id: string
  /** Custom sell price set by the affiliate (MAD). Must be >= product.sell_price. */
  custom_sell_price_mad: number
  created_at: string
  updated_at: string
}

export interface AffiliateClick {
  id: string
  affiliate_id: string
  product_id: string
  session_id: string | null
  referrer_path: string | null
  user_agent: string | null
  created_at: string
}

export type OrderSignalType = 'fraud' | 'duplicate' | 'spam' | 'conversion'

export interface OrderSignal {
  id: string
  order_id: string
  signal_type: OrderSignalType
  score: number
  metadata: Record<string, unknown>
  created_at: string
}

// ─── JOINED / EXTENDED TYPES ─────────────────────────────────────────────────
// Used in query results that join related tables.

export interface OrderWithProduct extends Order {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media'>
}

export interface OrderWithAffiliate extends Order {
  affiliate: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
}

export interface OrderFull extends Order {
  product: Pick<Product, 'id' | 'name' | 'images' | 'media' | 'sell_price' | 'commission_amount'>
  affiliate: Pick<Profile, 'id' | 'full_name' | 'phone'> | null
  commission: Pick<Commission, 'id' | 'status' | 'amount'> | null
}

export interface WholesaleOrderWithItems extends WholesaleOrder {
  items: (WholesaleOrderItem & { product: Pick<Product, 'id' | 'name' | 'images' | 'media'> })[]
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
      order_proofs: TableDef<
        OrderProof,
        Omit<OrderProof, 'id' | 'uploaded_at'>,
        Partial<OrderProof>
      >
      affiliate_product_prices: TableDef<
        AffiliateProductPrice,
        Omit<AffiliateProductPrice, 'id' | 'created_at' | 'updated_at'>,
        Partial<AffiliateProductPrice>
      >
      affiliate_clicks: TableDef<
        AffiliateClick,
        Omit<AffiliateClick, 'id' | 'created_at'>,
        never
      >
      order_signals: TableDef<
        OrderSignal,
        Omit<OrderSignal, 'id' | 'created_at'>,
        never
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
