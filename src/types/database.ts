// ─── ENUMS ───────────────────────────────────────────────────────────────────
// These mirror the CHECK constraints in the SQL schema exactly.
// If you change a constraint in SQL, update the union type here too.

export type UserRole = 'admin' | 'affiliate' | 'wholesaler' | 'agent' | 'supplier'

/** How the platform margin is applied to factory cost. */
export type PlatformMarginType = 'percentage' | 'fixed'
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'deleted'

/** Legacy source type — kept for backward compat. Use availability_type + origin_detail instead. */
export type ProductSourceType = 'local_production' | 'imported'

/** Commercial availability of the product. */
export type ProductAvailabilityType = 'local_stock' | 'import_on_demand'

/** Origin detail — only relevant when availability_type = 'local_stock'. */
export type ProductOriginDetail = 'locally_produced' | 'imported_but_in_morocco_stock'

/** How the product was submitted into the system. */
export type ProductSubmittedVia = 'admin_dashboard' | 'telegram_future' | 'supplier_future'

/** Approval status for supplier-submitted products. */
export type SupplierProductStatus = 'pending_review' | 'approved' | 'blocked'
export type SupplierModerationFlag = 'approved' | 'review_required' | 'blocked'

/** Target buyer type for supplier products. */
export type SupplierTargetBuyerType = 'wholesaler' | 'both'

/**
 * Morocco supplier: local stock, no customs, wholesale only, price shown directly.
 * International supplier: supplier cost hidden, platform adds margin + transport/customs, final price only.
 */
export type SupplierType = 'morocco' | 'international'

/** Predefined supplier product parent categories (mirrors CATEGORY_TAXONOMY in lib/taxonomy.ts). */
export const SUPPLIER_CATEGORIES = [
  'Textile',
  'Matières premières',
  'Chaussures',
  'Cosmétique & hygiène',
  'Alimentaire',
  'Maison & packaging',
  'Artisanat',
  'Autres',
] as const

export type SupplierCategory = typeof SUPPLIER_CATEGORIES[number]

/** Import pricing mode for import_on_demand products (migration 020). */
export type ImportPricingMode = 'door_to_door_per_kg' | 'sea_freight_cbm_or_kg'

/** Unit used for import price (migration 020). */
export type ImportPriceUnit = 'kg' | 'cbm'

/** Allowed origin country values for import_on_demand products. */
export type ImportOriginCountry = 'Turquie' | 'Chine' | 'Égypte' | 'Dubai' | 'Autre' | 'Mixte'

/** How a product resolves its import tariff. */
export type TariffMode = 'global' | 'custom'

/** Allowed country values for import_tariffs table. */
export type TariffCountry = 'Turquie' | 'Chine' | 'Égypte' | 'Dubai' | 'Autre'

/**
 * Shipping/transport modes for import_tariffs (migration 022).
 * Each mode implies a fixed unit:
 *   air_door_to_door_kg → kg
 *   sea_textile_kg      → kg
 *   sea_volume_cbm      → cbm
 */
export type ImportShippingMode = 'air_door_to_door_kg' | 'sea_textile_kg' | 'sea_volume_cbm'

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

/** How the affiliate captured the order. Null for legacy public-page orders. */
export type OrderSource = 'whatsapp' | 'phone' | 'manual' | 'sheet_import' | 'api'

/**
 * Full lifecycle for wholesale orders.
 * Legacy states (confirmed, sourcing, shipped) kept for backward compat — migration 004.
 * New Deliveroo-style states added in migration 057 (LOT 1).
 */
export type WholesaleOrderStatus =
  // ── Legacy states (migration 004) ────────────────────────────────────────
  | 'pending'
  | 'confirmed'
  | 'sourcing'
  | 'shipped'
  // ── New states — Deliveroo-style lifecycle (migration 057) ────────────────
  | 'assigned'
  | 'supplier_confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'dispatched'
  // ── Terminal states (unchanged) ───────────────────────────────────────────
  | 'delivered'
  | 'cancelled'

/** Payment workflow status for wholesale orders (migration 029). */
export type WholesalePaymentStatus =
  | 'no_deposit'
  | 'deposit_requested'
  | 'deposit_received'
  | 'fully_paid'

/**
 * Mode d'acheminement physique de la commande wholesale (migration 062).
 *   pickup_by_runner : coursier envoyé par Mozouna.
 *   supplier_fleet   : flotte du fournisseur.
 */
export type WholesaleLogisticsMode = 'pickup_by_runner' | 'supplier_fleet'

/**
 * Qui supporte le coût de livraison wholesale (migration 062).
 * Règle business : Mozouna ne porte JAMAIS un coût sans contrepartie.
 *   rebilled_client : Mozouna paie le livreur, refacture au client (delivery_rebill_mad >= delivery_cost_mad).
 *   supplier_billed : fournisseur facture — coût Mozouna = 0.
 *   supplier_free   : livraison gratuite — coût Mozouna = 0.
 */
export type WholesaleDeliveryCostHandling =
  | 'rebilled_client'
  | 'supplier_billed'
  | 'supplier_free'

/**
 * Types d'écriture dans le ledger transport wholesale (migration 062).
 *   delivery_cost_incurred    : décaissement Mozouna → amount_mad <= 0.
 *   delivery_rebill_collected : encaissement client  → amount_mad >= 0.
 */
export type WholesaleDeliveryLedgerEntryType =
  | 'delivery_cost_incurred'
  | 'delivery_rebill_collected'

/** Import progress tracking for wholesale orders (migration 026). */
export type WholesaleImportStatus =
  | 'awaiting_supplier'
  | 'purchased'
  | 'in_production'
  | 'ready_to_ship'
  | 'shipped'
  | 'customs_clearance'
  | 'delivered'

export type DeliveryPreference = 'pickup' | 'delivery'
export type CommissionStatus = 'pending' | 'approved' | 'paid'
export type PayoutStatus = 'pending' | 'processing' | 'paid'

/**
 * Formal response of a supplier assigned to a wholesale order (migration 059).
 *   available  — stock available immediately
 *   preparing  — item is being prepared / assembled
 *   on_order   — item must be ordered from upstream / lead time applies
 */
export type SupplierResponse = 'available' | 'preparing' | 'on_order'

/** Commission model for supplier marketplace payouts. */
export type SupplierCommissionType = 'percent' | 'fixed'

/** Lifecycle of a supplier payout per quote request. */
export type SupplierPayoutStatus = 'not_due' | 'pending' | 'partially_paid' | 'paid'

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

  /** Pays du compte (FK countries). Pour role=supplier : devise de saisie des
   *  prix via countries.operational_currency. Choisi au signup, figé (mig 054/055). */
  country_code: string | null
  /** Fournisseur sans country_code ayant demandé sa configuration à l'admin
   *  (migration 066). Signal d'onboarding, hors chaîne devise. */
  country_setup_requested: boolean

  // ── Wholesaler billing fields (migration 017) ─────────────────────────────
  /** Optional company name for wholesale invoices. */
  company_name: string | null
  /** Identifiant Commun de l'Entreprise — optional. */
  ice: string | null
  /** Registre de commerce number — optional. */
  registre_commerce: string | null
  /** Billing address for wholesale invoices — optional. */
  billing_address: string | null
  /** When true, user has access to wholesale features regardless of role.
   *  Allows a user to be both affiliate and wholesaler simultaneously. */
  wholesale_access: boolean

  // ── Wholesaler declared niche (migration 117) ─────────────────────────────
  /** Niche déclarée par le grossiste au signup (catégorie canonique ==
   *  products.category). Fallback cold-start de la perso comportementale
   *  (detect-niche.ts). AFFICHAGE seul — jamais un prix/marge. Nullable. */
  declared_niche: string | null

  // ── Account deletion / RGPD (migration 119) ───────────────────────────────
  /** Horodatage de l'anonymisation RGPD. Non null = compte supprimé (PII vidée,
   *  statut 'deleted', connexion bloquée). La ligne subsiste pour l'intégrité
   *  comptable des commandes (buyer_id conservé). */
  anonymized_at: string | null
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
  /** Non-NULL = miroir catalogue auto-provisionné d'un supplier_product (migr. 069).
   *  sell_price = final_wholesale_price_mad ; factory_cost_mad = suggested_wholesale_price_mad. */
  source_supplier_product_id: string | null

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

  // ── Import-on-demand display fields (migration 019) ──────────────────────
  /** Estimated door-to-door import cost in MAD. Null for local_stock products. */
  estimated_cost_mad: number | null
  /** Estimated delivery delay in days. Null for local_stock products. */
  estimated_delivery_days: number | null

  // ── Import cost model (migration 020) ────────────────────────────────────
  /** Structured pricing mode. Only for import_on_demand products. */
  import_pricing_mode: ImportPricingMode | null
  /** Estimated import price in MAD per unit (per kg or cbm). Only for import_on_demand. */
  estimated_import_price_mad: number | null
  /** Unit for estimated_import_price_mad: 'kg' | 'cbm'. Only for import_on_demand. */
  import_price_unit: ImportPriceUnit | null
  /**
   * Unité de VENTE pour affichage (mètre/kg/paquet/pièce/carton). NULL = pièce
   * implicite. AFFICHAGE PUR — aucun calcul n'en dépend. DISTINCT de
   * import_price_unit (unité du coût transport import). Normalisé via lib/units.ts.
   */
  sale_unit: string | null
  /**
   * Conditionnement DESCRIPTIF (P3) : nb d'unités de cond. par unité de vente
   * (ex. 50) + nom de l'unité de cond. (ex. « boîte »). NULL = aucun. AFFICHAGE
   * SEUL — prix/boîte DÉRIVÉ (prix÷pack_size), jamais stocké ni facturé.
   */
  pack_size: number | null
  pack_unit: string | null
  /** Optional notes shown to wholesalers. Recommended when origin_country = 'Mixte'. */
  import_notes: string | null

  // ── Tariff mode (migration 021) ───────────────────────────────────────────
  /** 'global' = inherit from import_tariffs by origin_country + shipping_mode. 'custom' = use product fields. */
  tariff_mode: TariffMode

  // ── Import shipping mode (migration 022) ──────────────────────────────────
  /**
   * Shipping/transport mode for import_on_demand products.
   * Used to look up the matching global tariff (country + shipping_mode).
   * Also determines the unit for custom transport costs.
   */
  import_shipping_mode: ImportShippingMode | null

  // ── Taxonomy (migration 039) ──────────────────────────────────────────────
  /** Parent category from CATEGORY_TAXONOMY. Empty string if not set. */
  category: string
  /** Subcategory within the parent category. Empty string if not set. */
  subcategory: string

  created_at: string
  updated_at: string
}

// ─── IMPORT TARIFFS ───────────────────────────────────────────────────────────
// Admin-managed table of per-country import pricing rates.
// Products with tariff_mode = 'global' inherit from here by origin_country.

export interface ImportTariff {
  id: string
  country: TariffCountry

  // ── New fields (migration 022) — primary ──────────────────────────────────
  /** Transport/shipping mode. Unit is auto-derived: kg for air+sea_textile, cbm for sea_volume. */
  shipping_mode: ImportShippingMode
  /** Total transport + customs cost in MAD per unit. Does NOT include product purchase cost. */
  transport_customs_price_mad: number

  // ── Legacy fields (kept for backward compat) ─────────────────────────────
  /** @deprecated Use shipping_mode instead. */
  pricing_mode: ImportPricingMode | null
  /** @deprecated Use transport_customs_price_mad instead. */
  price_mad: number | null

  unit: ImportPriceUnit
  delivery_days: number | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  /** Null when customer orders directly (no referral link). */
  affiliate_id: string | null
  product_id: string
  /** Variante commandée (Lot B mig 101). NULL = commande antérieure au chantier variantes. */
  variant_id: string | null
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
  /** Anti-fraude B7 (mig 124) : levée admin de la retenue fraude. NULL = non levée. */
  fraud_cleared_at: string | null
  fraud_cleared_by: string | null

  status: OrderStatus
  /** Agent en charge du traitement (LOT 1F, mig 110). NULL = non assignée. Orthogonal au statut. */
  assigned_to: string | null
  assigned_at: string | null
  /** How the affiliate captured this order. Null for legacy public-page orders. */
  order_source: OrderSource | null
  notes: string | null
  /** True when the vendor pre-confirmed the order — platform keeps the 10 MAD confirmation fee (Option A). Commission unchanged. */
  is_pre_confirmed: boolean

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
  /** Variante dans le panier (Lot B mig 101). */
  variant_id: string | null
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

  // ── Lifecycle flags (added migration 057 — LOT 1) ─────────────────────────
  /** Timestamp when the order was assigned to a field agent. */
  assigned_at: string | null
  /** Expected delivery deadline. Order is late if this is past and status != 'delivered'. */
  due_at: string | null
  /** Set when the order is blocked (red signal). Not a status — a flag. */
  blocked_at: string | null
  /** Human-readable reason for the block. Null when not blocked. */
  blocked_reason: string | null

  // ── Invoice request (added migration 018) ────────────────────────────────
  /** True when buyer has submitted an invoice request. */
  invoice_requested: boolean
  /** Timestamp when the invoice was requested. */
  invoice_requested_at: string | null
  /** Company name provided at invoice request time. */
  invoice_company_name: string | null
  /** ICE provided at invoice request time. */
  invoice_ice: string | null
  /** Registre de commerce at invoice request time. */
  invoice_registre_commerce: string | null
  /** Billing address at invoice request time. */
  invoice_billing_address: string | null

  // ── Quote request link (added migration 024) ──────────────────────────────
  /** Set when this order was created from a quote request conversion. */
  quote_request_id: string | null

  // ── Multi-devise snapshot propagé du devis (migration 051) ────────────────
  /** Devise source figée recopiée du devis d'origine. */
  source_currency: string | null
  /** Taux source→MAD figé recopié du devis d'origine. */
  fx_rate_source_to_mad: number | null
  /** Montant marchandise en devise source (prix unit. source × quantité). */
  merchandise_source_amount: number | null

  // ── Import progress tracking (migration 026) ─────────────────────────────
  /** Current import progress status. Null until admin first sets it. */
  import_status: WholesaleImportStatus | null

  // ── Import cost breakdown (added migration 025) ───────────────────────────
  /** Supplier/purchase cost in MAD for this order. Admin-entered. */
  supplier_cost_mad: number
  /** Transport + customs cost in MAD. Admin-entered. */
  transport_customs_cost_mad: number
  /** Any other additional cost in MAD. Admin-entered. */
  additional_cost_mad: number
  /** Auto-computed: supplier + transport + additional. */
  total_cost_mad: number | null
  /** Auto-computed: total_amount − total_cost_mad. */
  gross_profit_mad: number | null
  /** Auto-computed: (gross_profit_mad / total_amount) × 100. */
  gross_margin_percent: number | null

  // ── Payment tracking (migration 029) ─────────────────────────────────────
  /** Current payment status. Default 'no_deposit'. */
  payment_status: WholesalePaymentStatus
  /** Deposit amount requested by admin in MAD. Null until set. */
  deposit_amount: number | null
  /** Deposit amount actually received in MAD. Default 0. */
  deposit_received_amount: number
  /** Timestamp when deposit was requested. */
  deposit_requested_at: string | null
  /** Timestamp when deposit was received. */
  deposit_received_at: string | null
  /** Timestamp when order was fully paid. */
  fully_paid_at: string | null

  // ── Supplier link (migration 059 — LOT 3a) ───────────────────────────────
  /** Profile id of the supplier assigned to fulfil this order. Null until admin assigns. */
  supplier_id: string | null
  /** Formal supplier response to the assignment. Null until supplier responds via RPC. */
  supplier_response: SupplierResponse | null
  /** Lead time in days announced by the supplier. Null until supplier responds. */
  supplier_lead_time_days: number | null
  /** Timestamp of the supplier's last response (via respond_to_wholesale_order RPC). */
  supplier_responded_at: string | null
  /** Timestamp when admin assigned the supplier to this order. */
  supplier_assigned_at: string | null

  // ── Delivery logistics (migration 062 — LOT 4.1) ─────────────────────────
  /** Physical routing mode. Null until admin sets it. */
  logistics_mode: WholesaleLogisticsMode | null
  /**
   * Who bears the delivery cost. Null for legacy orders (pre-062).
   * Business rule: Mozouna never bears a cost without a counterpart.
   */
  delivery_cost_handling: WholesaleDeliveryCostHandling | null
  /**
   * Real cost paid by Mozouna to the carrier, in MAD. Default 0.
   * Only meaningful when delivery_cost_handling = 'rebilled_client'.
   * NOT injected into total_cost_mad (orthogonal to trigger 025).
   */
  delivery_cost_mad: number
  /**
   * Amount rebilled to the client, in MAD. Default 0.
   * Invariant: delivery_rebill_mad >= delivery_cost_mad (profit transport allowed).
   * Only meaningful when delivery_cost_handling = 'rebilled_client'.
   */
  delivery_rebill_mad: number

  created_at: string
  updated_at: string
}

/**
 * Vue acheteur : wholesale_orders_buyer_read (migration 063).
 * Sous-ensemble de WholesaleOrder sans les 8 colonnes coût/marge internes
 * exclues pour raison de confidentialité plateforme :
 *   supplier_cost_mad, transport_customs_cost_mad, additional_cost_mad,
 *   total_cost_mad, gross_profit_mad, gross_margin_percent,
 *   delivery_cost_mad, delivery_rebill_mad.
 * Exclut également les colonnes internes agent/fournisseur :
 *   agent_id, agent_notes, supplier_id, supplier_response,
 *   supplier_lead_time_days, supplier_responded_at, supplier_assigned_at.
 * À utiliser pour toutes les pages acheteur (orders list, detail, dashboard).
 */
export type WholesaleOrderBuyerView = Omit<
  WholesaleOrder,
  | 'supplier_cost_mad'
  | 'transport_customs_cost_mad'
  | 'additional_cost_mad'
  | 'total_cost_mad'
  | 'gross_profit_mad'
  | 'gross_margin_percent'
  | 'delivery_cost_mad'
  | 'delivery_rebill_mad'
  | 'agent_id'
  | 'agent_notes'
  | 'supplier_id'
  | 'supplier_response'
  | 'supplier_lead_time_days'
  | 'supplier_responded_at'
  | 'supplier_assigned_at'
>

export interface WholesaleOrderItem {
  id: string
  order_id: string
  product_id: string
  /** Variante de la ligne (Lot B mig 101). NULL = lignes antérieures au chantier. */
  variant_id: string | null
  quantity: number
  unit_price_snapshot: number
  subtotal: number
  tier_label_snapshot: string
}

/** Single import status change entry (migration 026). */
export interface WholesaleOrderImportHistory {
  id: string
  order_id: string
  import_status: WholesaleImportStatus
  changed_by: string | null
  notes: string | null
  changed_at: string
}

/** Single payment status change entry (migration 029). */
export interface WholesaleOrderPaymentHistory {
  id: string
  order_id: string
  payment_status: WholesalePaymentStatus
  deposit_amount: number | null
  deposit_received_amount: number | null
  changed_by: string | null
  notes: string | null
  changed_at: string
}

/**
 * Ledger append-only dédié aux flux transport wholesale (migration 062 — LOT 4.1).
 * Écritures SIGNÉES : décaissement Mozouna (< 0) et encaissement client (> 0).
 * Solde cash transport d'une commande = SUM(amount_mad) WHERE wholesale_order_id = X.
 * Format idempotency_key : 'wdl:<order_id>:<entry_type>:<event_uuid>'.
 * Immuable : trigger anti-UPDATE/DELETE/TRUNCATE. Écriture via RPC SECURITY DEFINER (LOT 4.2).
 */
export interface WholesaleDeliveryLedger {
  id: string
  wholesale_order_id: string
  /**
   * Type d'écriture.
   *   delivery_cost_incurred    : décaissement Mozouna → amount_mad <= 0.
   *   delivery_rebill_collected : encaissement client  → amount_mad >= 0.
   */
  entry_type: WholesaleDeliveryLedgerEntryType
  /**
   * Montant SIGNÉ en MAD.
   * delivery_cost_incurred <= 0 | delivery_rebill_collected >= 0.
   * SUM(amount_mad) par commande = solde net transport Mozouna.
   */
  amount_mad: number
  /** Devise (toujours 'MAD' à date). */
  currency: string
  /**
   * Identifie l'ÉVÉNEMENT, pas la valeur.
   * Format : 'wdl:<order_id>:<entry_type>:<event_uuid>'.
   * Une correction crée une nouvelle écriture (nouvel event_uuid), jamais un UPDATE.
   */
  idempotency_key: string
  /** Profile id de l'utilisateur ayant déclenché l'écriture. Null si non authentifié (service_role). */
  created_by: string | null
  created_at: string
}

/** Single order status transition entry — append-only (migration 057, LOT 1). */
export interface WholesaleOrderStatusHistory {
  id: string
  order_id: string
  /** Previous status. Null for the first entry (order creation). */
  from_status: WholesaleOrderStatus | null
  to_status: WholesaleOrderStatus
  /** Profile id of the user who triggered the transition. */
  changed_by: string | null
  note: string | null
  created_at: string
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

/** Status pipeline for wholesale quote requests. */
export type QuoteRequestStatus =
  | 'new'
  | 'studying'
  | 'quoted'
  | 'quote_prepared'
  | 'accepted_by_client'
  | 'rejected_by_client'
  | 'negotiating'
  | 'approved'
  | 'rejected'
  | 'converted_to_order'

export interface QuoteRequest {
  id: string
  buyer_id: string
  product_id: string
  quantity_requested: number
  destination_country: string
  destination_city: string | null
  preferred_shipping_mode: string | null
  colors_or_variants: string | null
  sizes: string | null
  buyer_notes: string | null
  whatsapp_number: string
  status: QuoteRequestStatus
  admin_notes: string | null
  admin_notes_public: boolean
  /** Structured quote document fields — set by admin via "Préparer le devis" */
  quoted_unit_price_mad: number | null
  quoted_quantity: number | null
  quoted_transport_total_mad: number | null
  quoted_shipping_mode: string | null
  quoted_delivery_delay: string | null
  quote_validity_date: string | null
  quote_public_note: string | null
  quote_prepared_at: string | null
  /** Multi-devise (migration 051) — taux figés sur le devis (pivot interne = MAD) */
  source_currency: string | null
  quoted_unit_price_source: number | null
  fx_rate_source_to_mad: number | null
  display_currency: string | null
  fx_rate_display_vs_mad: number | null
  /** Client decision — set by wholesaler after reviewing quote_prepared document */
  client_decision_at: string | null
  created_at: string
  updated_at: string
}

// ─── SUPPLIER PRODUCTS ───────────────────────────────────────────────────────
// Submitted by suppliers — supplier identity is never exposed to wholesalers.
// Admin approves, edits public fields, and sets platform margin.

export interface SupplierProduct {
  id: string
  /** Supplier user id — admin only, never exposed to wholesalers. */
  supplier_id: string
  /**
   * morocco: local stock, no customs, wholesale only, price shown directly.
   * international: supplier cost hidden, admin sets final price incl. margin + transport/customs.
   */
  supplier_type: SupplierType

  // Supplier submission fields
  product_name: string
  category: string
  /** Structured subcategory from taxonomy (migration 039). Backfilled from niche. */
  subcategory: string
  niche: string
  description: string | null
  photos: string[]
  min_quantity: number
  origin_country: string
  availability_type: ProductAvailabilityType
  target_buyer_type: SupplierTargetBuyerType
  suggested_wholesale_price_mad: number | null
  /** Internal supplier notes — admin only, never shown to wholesalers. */
  supplier_private_notes: string | null

  // Extended catalog fields (migration 035)
  unit: string
  stock_quantity: number | null
  // Stock fournisseur multi-modes + fraîcheur (migration 104, V5-bis.1).
  // Optionnels : absents des produits internes du catalogue fusionné (Omit→Public).
  stock_mode?: 'api' | 'manuel' | 'telegram' | 'hebdo'
  stock_quantity_updated_at?: string | null
  variant_id?: string | null
  lead_time_days: number | null
  export_countries: string[]
  supplier_unit_price_usd: number | null

  // Approval workflow
  approval_status: SupplierProductStatus
  moderation_flag: SupplierModerationFlag | null
  ai_risk_score: number | null
  moderation_reason: string | null
  moderation_signals: string[]
  admin_notes: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_at: string | null
  /** Set when admin archives a product. */
  archived_at: string | null

  // Ingestion source + Telegram traceability (migration 053)
  source: 'web' | 'telegram' | 'bulk_csv'
  telegram_message_id: string | null

  // Admin-editable public fields
  public_name: string | null
  public_description: string | null

  // Platform margin (admin-set)
  platform_margin_type: PlatformMarginType
  platform_margin_value: number | null
  // Marge plateforme fournisseur — canal DIRECT (migration 056). Toggle par produit +
  // prix final (marge incluse si ON). Calcul serveur, jamais exposé au grossiste.
  apply_platform_margin: boolean
  final_wholesale_price_mad: number | null
  // Toggle génération auto de paliers dégressifs à l'approbation (migration 112) — ON par
  // défaut ; ne se déclenche que si le produit n'a AUCUN palier source. cf. generateAutoTiers.
  // OPTIONNEL au type : la vue redacted grossiste ne l'expose PAS (interne admin uniquement).
  auto_tiers_enabled?: boolean

  // Devise source + taux figé → MAD (migration 054). source_currency='MAD' ⇒ taux 1.
  // fx_rate NULL avec devise étrangère = « no_rate » : prix MAD non calculé (Sur devis).
  source_currency: string | null
  price_source: number | null
  fx_rate_source_to_mad: number | null

  created_at: string
  updated_at: string
}

/**
 * A variant of a catalogue product (migration 096).
 * Attributes are flexible JSONB key-value pairs, e.g. { taille: "M", couleur: "rouge" }.
 * A simple product has exactly one default variant with attributes = {}.
 * Finance (price/commission/tiers) stays at the product level — never on the variant.
 */
export interface ProductVariantRow {
  id: string
  product_id: string
  attributes: Record<string, string>
  sku: string | null
  is_default: boolean
  stock_count: number
  active: boolean
  created_at: string
  updated_at: string
}

/** A color/size/model variant of a supplier product (migration 035). */
export interface SupplierProductVariant {
  id: string
  supplier_product_id: string
  color: string | null
  size: string | null
  model: string | null
  stock_quantity: number | null
  price_adjustment_usd: number
  created_at: string
}

/** MOQ pricing tier for a supplier product (migration 035). */
export interface SupplierProductMoqTier {
  id: string
  supplier_product_id: string
  min_quantity: number
  unit_price_usd: number
  created_at: string
}

/** Bulk import session created when supplier uploads CSV/XLSX (migration 035). */
export type BulkImportStatus = 'pending' | 'validated' | 'imported' | 'failed'

export interface BulkImportReportRow {
  row: number
  product_name: string
  status: 'valid' | 'invalid'
  errors: string[]
  product_id?: string
}

export interface SupplierBulkImport {
  id: string
  supplier_id: string
  filename: string
  rows_total: number
  rows_valid: number
  rows_invalid: number
  rows_imported: number
  status: BulkImportStatus
  report: BulkImportReportRow[]
  created_at: string
}

/** Safe public view of a supplier product — strips all supplier identity fields. */
export type SupplierProductPublic = Omit<
  SupplierProduct,
  'supplier_id' | 'supplier_private_notes' | 'admin_notes' | 'approved_by' | 'platform_margin_type' | 'platform_margin_value'
>

/** Supplier dashboard list — no moderation scores, admin notes, or platform margin. */
export type SupplierProductSupplierView = Pick<
  SupplierProduct,
  | 'id'
  | 'product_name'
  | 'category'
  | 'origin_country'
  | 'min_quantity'
  | 'suggested_wholesale_price_mad'
  | 'source_currency'
  | 'fx_rate_source_to_mad'
  | 'supplier_type'
  | 'approval_status'
  | 'created_at'
  | 'stock_quantity'
  | 'stock_mode'
  | 'stock_quantity_updated_at'
>

/** Status for supplier marketplace quote requests. */
export type SupplierQuoteRequestStatus = 'new' | 'studying' | 'quoted' | 'approved' | 'rejected'

export type BuyerPurchaseProfile =
  | 'physical_store'
  | 'social_reseller'
  | 'wholesaler'
  | 'importer'

export type BuyerVolumeTier =
  | 'test_20_50'
  | 'small_100_300'
  | 'active_500_1000'
  | 'importer_1000_plus'

/** Quote request from a wholesaler for a marketplace supplier product. Supplier identity hidden. */
export interface SupplierQuoteRequest {
  id: string
  supplier_product_id: string
  buyer_id: string
  quantity_requested: number
  /** Admin-only intake — not selected in supplier-facing queries. */
  buyer_purchase_profile: BuyerPurchaseProfile | null
  /** Admin-only intake — not selected in supplier-facing queries. */
  buyer_volume_tier: BuyerVolumeTier | null
  /** Mode d'expédition souhaité (import) : air_door_to_door_kg | sea_textile_kg | sea_volume_cbm. NULL = à déterminer. */
  preferred_shipping_mode: string | null
  destination_country: string
  destination_city: string | null
  buyer_notes: string | null
  whatsapp_number: string
  status: SupplierQuoteRequestStatus
  /** Admin internal notes — never shown to buyer or supplier. */
  admin_notes: string | null
  quoted_unit_price_mad: number | null

  // ── Supplier financial fields (migration 032) ─────────────────────────────
  /** What the platform pays the supplier for this order in MAD. Admin-set. */
  supplier_cost_mad: number | null
  /** How the platform commission is computed. */
  platform_commission_type: SupplierCommissionType
  /** Commission rate (% when type=percent) or fixed MAD amount. */
  platform_commission_value: number | null
  /** Computed commission amount in MAD. Admin-computed and stored. */
  platform_commission_amount_mad: number | null
  /** Transport + customs cost in MAD. Admin-set. */
  transport_customs_cost_mad: number
  /** Final payout to supplier = total_client_amount − commission − transport_customs. Admin-computed. */
  supplier_payout_amount_mad: number | null
  /** Payout lifecycle status. Default 'not_due'. */
  supplier_payout_status: SupplierPayoutStatus

  created_at: string
  updated_at: string
}

/** Audit trail for supplier payout status changes (migration 032). */
export interface SupplierPayoutHistory {
  id: string
  supplier_quote_request_id: string
  previous_status: SupplierPayoutStatus | null
  new_status: SupplierPayoutStatus
  changed_by: string | null
  notes: string | null
  changed_at: string
}

// ─── RFQ MATCHING ENGINE (migration 037) ─────────────────────────────────────

export type SupplierMatchingType = 'morocco' | 'international'

export type RfqMatchStatus =
  | 'new'
  | 'notified'
  | 'offer_received'
  | 'declined'
  | 'clarification'
  | 'selected'
  | 'expired'

export type RfqOfferResponseType = 'offer' | 'decline' | 'clarification'

/** Supplier's self-declared capabilities used by the scoring engine. */
export interface SupplierMatchingProfile {
  id: string
  supplier_id: string
  categories: string[]
  countries_served: string[]
  moq_min: number | null
  moq_max: number | null
  production_capacity: number | null
  lead_time_days_min: number | null
  lead_time_days_max: number | null
  export_capable: boolean
  supplier_type: SupplierMatchingType
  response_rate: number
  reliability_score: number
  total_offers_sent: number
  total_offers_accepted: number
  active: boolean
  created_at: string
  updated_at: string
}

/** One match record per (sourcing_request | quote_request) × supplier. */
export interface RfqMatch {
  id: string
  sourcing_request_id: string | null
  quote_request_id: string | null
  supplier_id: string
  total_score: number
  score_category: number
  score_country: number
  score_moq: number
  score_lead_time: number
  score_reliability: number
  score_response_rate: number
  status: RfqMatchStatus
  notified_at: string | null
  created_at: string
  updated_at: string
}

/** Supplier's response to an RFQ match. */
export interface RfqOffer {
  id: string
  rfq_match_id: string
  supplier_id: string
  response_type: RfqOfferResponseType
  unit_price_usd: number | null
  moq_offered: number | null
  lead_time_days: number | null
  notes: string | null
  message: string | null
  admin_notes: string | null
  admin_reviewed: boolean
  created_at: string
}

// ─── SUPPLIER CATALOGS & SAMPLE REQUESTS (migration 036) ─────────────────────

export type CatalogFileType = 'pdf' | 'xlsx' | 'zip'
export type AttachmentType = 'pdf_datasheet' | 'pdf_catalog' | 'image' | 'video'
export type AttachmentAdminStatus = 'pending' | 'approved' | 'rejected'
export type SampleRequestType = 'sample' | 'photos' | 'video' | 'technical_sheet'
export type SampleRequestStatus = 'pending' | 'supplier_reply' | 'approved' | 'rejected' | 'shipped' | 'delivered'

/** Company-level catalog uploaded by supplier (PDF/XLSX/ZIP). Admin-only + supplier-own. */
export interface SupplierCatalog {
  id: string
  supplier_id: string
  filename: string
  storage_path: string
  file_type: CatalogFileType
  file_size: number | null
  admin_status: AttachmentAdminStatus
  admin_notes: string | null
  created_at: string
}

/** Per-product attachment (datasheet, catalog, image, video). Wholesaler sees approved only. */
export interface SupplierProductAttachment {
  id: string
  supplier_product_id: string
  filename: string
  storage_path: string
  attachment_type: AttachmentType
  file_size: number | null
  admin_status: AttachmentAdminStatus
  admin_notes: string | null
  created_at: string
}

/** Sample/photo/video/tech-sheet request from a wholesaler. */
export interface SampleRequest {
  id: string
  wholesaler_id: string
  supplier_product_id: string
  request_type: SampleRequestType
  message: string | null
  status: SampleRequestStatus
  admin_notes: string | null
  created_at: string
  updated_at: string
}

/** File uploaded by supplier (or admin) in response to a sample request. */
export interface SampleRequestFile {
  id: string
  sample_request_id: string
  uploader_role: 'supplier' | 'admin'
  filename: string
  storage_path: string
  file_type: 'image' | 'video' | 'pdf'
  file_size: number | null
  admin_approved: boolean
  admin_notes: string | null
  created_at: string
}

// ─── INTELLIGENT SOURCING (migration 034) ────────────────────────────────────

export type SourcingRequestStatus = 'pending' | 'matching' | 'matched' | 'quoted' | 'closed'

/** Wholesaler sourcing request — supplier identity is hidden from wholesaler via RLS. */
export interface SourcingRequest {
  id: string
  wholesaler_id: string
  product_name: string
  category: string
  quantity: number
  target_budget_mad: number
  target_country: string | null
  delivery_deadline: string | null
  notes: string | null
  status: SourcingRequestStatus
  admin_notes: string | null
  /** Admin-only — never returned to wholesaler. */
  selected_supplier_id: string | null
  quote_request_id: string | null
  created_at: string
  updated_at: string
}

/** Scored supplier match computed at query time for admin sourcing UI. */
export interface ScoredSupplier {
  supplierId: string
  supplierName: string
  supplierType: string | null
  countries: string
  categories: string
  reliabilityScore: number
  /** Lowest MOQ across their approved products. */
  minMoq: number | null
  /** Total score 0–100 based on category, country, reliability, MOQ, performance. */
  matchScore: number
  scoreBreakdown: {
    categoryMatch: number
    countryMatch: number
    reliability: number
    moqCompatibility: number
    performance: number
  }
}

/** Wholesaler-visible view of a sourcing request (no supplier identity). */
export type SourcingRequestPublic = Omit<SourcingRequest, 'selected_supplier_id' | 'admin_notes'>

/** Issue types that admin can log against a supplier (migration 033). */
export type SupplierIssueType =
  | 'delay'
  | 'quality_problem'
  | 'wrong_quantity'
  | 'communication_problem'
  | 'other'

/** Admin-only issue note logged against a supplier (migration 033).
 *  Never exposed to supplier or wholesaler. */
export interface SupplierIssue {
  id: string
  supplier_id: string
  issue_type: SupplierIssueType
  notes: string | null
  /** Optional delivery duration in days — used to compute avg_delivery_days per supplier. */
  delivery_days: number | null
  created_by: string | null
  created_at: string
}

/** Computed performance snapshot for a supplier — built at query time. */
export interface SupplierPerformance {
  supplierId: string
  supplierName: string
  /** Most recent supplier_type found on their products ('morocco' | 'international'). */
  supplierType: string | null
  /** Comma-joined unique origin_country values from their products. */
  countries: string
  /** Comma-joined unique category values from their products. */
  categories: string
  /** Comma-joined unique niche values from their products. */
  niches: string
  totalOrders: number
  totalRevenueMad: number
  totalCommissionMad: number
  averageDeliveryDays: number | null
  delayedOrdersCount: number
  issueCount: number
  /** 0–100. Formula: max(0, 100 − 5×issueCount − 3×delayedOrdersCount). */
  reliabilityScore: number
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

// ─── PREMIUM MONETIZATION (migration 038) ────────────────────────────────────

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial'

/** Platform-defined subscription tier. */
export interface PremiumPlan {
  id: string
  slug: string
  name: string
  price_mad_monthly: number
  /** Maximum number of active supplier products allowed. 0 = unlimited. */
  max_products: number
  /** Score points added to RFQ matching total_score for this supplier (0–40). */
  rfq_priority_boost: number
  /** Show a "Vedette" badge in the wholesaler marketplace. */
  featured_badge: boolean
  /** Show a "Vérifié" badge — credibility signal. */
  verified_badge: boolean
  /** Unlocks the full analytics page for the supplier. */
  full_analytics: boolean
  priority_support: boolean
  description: string | null
  active: boolean
  display_order: number
  created_at: string
}

/** Links one supplier to their current plan. One row per supplier (UNIQUE). */
export interface SupplierSubscription {
  id: string
  supplier_id: string
  plan_id: string
  status: SubscriptionStatus
  started_at: string
  /** Null = open-ended (manually managed). */
  expires_at: string | null
  notes: string | null
  assigned_by: string | null
  created_at: string
  updated_at: string
}

/** Immutable audit record for every plan change. */
export interface SubscriptionAuditLog {
  id: string
  supplier_id: string
  old_plan_slug: string | null
  new_plan_slug: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  notes: string | null
  changed_at: string
}

/** Admin view: subscription joined with plan and supplier profile. */
export interface SupplierSubscriptionWithDetails extends SupplierSubscription {
  plan: PremiumPlan
  supplier: Pick<Profile, 'id' | 'full_name' | 'phone' | 'city'>
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

export interface QuoteRequestWithDetails extends QuoteRequest {
  buyer: Pick<Profile, 'id' | 'full_name' | 'phone' | 'company_name'>
  product: Pick<Product, 'id' | 'name' | 'origin_country' | 'availability_type'>
}

export interface CommissionWithOrder extends Commission {
  order: Pick<Order, 'id' | 'customer_name' | 'quantity' | 'total_amount' | 'status' | 'created_at'>
}

// ─── WHOLESALE UNIFIED CATALOG VIEW (migration 075) ──────────────────────────
// Shape of `public.wholesale_catalog_read`.
// `source` is SERVER-ONLY — never pass it to a Client Component.
// Route the detail link server-side and transmit only the resolved `href` string.

export interface WholesaleCatalogRow {
  id: string
  /** SERVER ONLY — used to resolve the detail href. Never sent to client components. */
  source: 'internal' | 'supplier'
  name: string
  description: string | null
  /** Already-computed "from" price in MAD. Display directly via formatMAD. */
  from_price_mad: number
  min_qty: number
  stock: number | null
  image: string | null
  category: string
  subcategory: string
  origin_country: string
  availability_type: 'local_stock' | 'import_on_demand'
  is_featured: boolean
  is_verified: boolean
  created_at: string
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
        Omit<Profile, 'created_at' | 'wholesale_access'> & { wholesale_access?: boolean },
        Partial<Profile>
      >
      products: TableDef<
        Product,
        Omit<Product, 'id' | 'created_at' | 'category' | 'subcategory'> & {
          category?: string
          subcategory?: string
        },
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
        Omit<WholesaleOrder, 'id' | 'created_at' | 'updated_at' | 'invoice_requested' | 'quote_request_id' | 'supplier_cost_mad' | 'transport_customs_cost_mad' | 'additional_cost_mad' | 'total_cost_mad' | 'gross_profit_mad' | 'gross_margin_percent' | 'import_status' | 'payment_status' | 'deposit_amount' | 'deposit_received_amount' | 'deposit_requested_at' | 'deposit_received_at' | 'fully_paid_at' | 'delivery_cost_mad' | 'delivery_rebill_mad'> & {
          invoice_requested?: boolean
          quote_request_id?: string | null
          supplier_cost_mad?: number
          transport_customs_cost_mad?: number
          additional_cost_mad?: number
          import_status?: WholesaleImportStatus | null
          payment_status?: WholesalePaymentStatus
          deposit_amount?: number | null
          deposit_received_amount?: number
          deposit_requested_at?: string | null
          deposit_received_at?: string | null
          fully_paid_at?: string | null
          // migration 062 — defaults appliqués en DB (NOT NULL DEFAULT 0)
          delivery_cost_mad?: number
          delivery_rebill_mad?: number
          // nullable — non renseigné en création (legacy)
          logistics_mode?: WholesaleLogisticsMode | null
          delivery_cost_handling?: WholesaleDeliveryCostHandling | null
        },
        Partial<WholesaleOrder>
      >
      wholesale_delivery_ledger: TableDef<
        WholesaleDeliveryLedger,
        // Append-only : pas d'Insert exposé côté client — l'écriture viendra
        // exclusivement d'une RPC SECURITY DEFINER (LOT 4.2).
        // On expose le type Insert minimal pour les tests unitaires.
        Omit<WholesaleDeliveryLedger, 'id' | 'created_at'> & { created_at?: string },
        never  // Immuable : aucun Update autorisé
      >
      wholesale_order_items: TableDef<
        WholesaleOrderItem,
        Omit<WholesaleOrderItem, 'id'>,
        never
      >
      wholesale_order_import_history: TableDef<
        WholesaleOrderImportHistory,
        Omit<WholesaleOrderImportHistory, 'id' | 'changed_at'> & { changed_at?: string },
        never
      >
      wholesale_order_payment_history: TableDef<
        WholesaleOrderPaymentHistory,
        Omit<WholesaleOrderPaymentHistory, 'id' | 'changed_at'> & { changed_at?: string },
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
      import_tariffs: TableDef<
        ImportTariff,
        Omit<ImportTariff, 'id' | 'created_at' | 'updated_at' | 'pricing_mode' | 'price_mad'> & {
          pricing_mode?: ImportPricingMode | null
          price_mad?: number | null
        },
        Partial<ImportTariff>
      >
      quote_requests: TableDef<
        QuoteRequest,
        Omit<QuoteRequest, 'id' | 'created_at' | 'updated_at' | 'status' | 'admin_notes' | 'admin_notes_public' | 'quoted_unit_price_mad' | 'quoted_quantity' | 'quoted_transport_total_mad' | 'quoted_shipping_mode' | 'quoted_delivery_delay' | 'quote_validity_date' | 'quote_public_note' | 'quote_prepared_at' | 'client_decision_at'> & {
          status?: QuoteRequestStatus
          admin_notes?: string | null
          admin_notes_public?: boolean
          quoted_unit_price_mad?: number | null
          quoted_quantity?: number | null
          quoted_transport_total_mad?: number | null
          quoted_shipping_mode?: string | null
          quoted_delivery_delay?: string | null
          quote_validity_date?: string | null
          quote_public_note?: string | null
          quote_prepared_at?: string | null
          client_decision_at?: string | null
        },
        Partial<QuoteRequest>
      >
      supplier_quote_requests: TableDef<
        SupplierQuoteRequest,
        Omit<SupplierQuoteRequest, 'id' | 'created_at' | 'updated_at' | 'status' | 'admin_notes' | 'quoted_unit_price_mad' | 'supplier_cost_mad' | 'platform_commission_type' | 'platform_commission_value' | 'platform_commission_amount_mad' | 'transport_customs_cost_mad' | 'supplier_payout_amount_mad' | 'supplier_payout_status' | 'preferred_shipping_mode'> & {
          status?: SupplierQuoteRequestStatus
          preferred_shipping_mode?: string | null
          admin_notes?: string | null
          quoted_unit_price_mad?: number | null
          supplier_cost_mad?: number | null
          platform_commission_type?: SupplierCommissionType
          platform_commission_value?: number | null
          platform_commission_amount_mad?: number | null
          transport_customs_cost_mad?: number
          supplier_payout_amount_mad?: number | null
          supplier_payout_status?: SupplierPayoutStatus
        },
        Partial<SupplierQuoteRequest>
      >
      supplier_payout_history: TableDef<
        SupplierPayoutHistory,
        Omit<SupplierPayoutHistory, 'id' | 'changed_at'> & { changed_at?: string },
        never
      >
      supplier_issues: TableDef<
        SupplierIssue,
        Omit<SupplierIssue, 'id' | 'created_at'>,
        Partial<SupplierIssue>
      >
      sourcing_requests: TableDef<
        SourcingRequest,
        Omit<SourcingRequest, 'id' | 'created_at' | 'updated_at' | 'status' | 'admin_notes' | 'selected_supplier_id' | 'quote_request_id'> & {
          status?: SourcingRequestStatus
          admin_notes?: string | null
          selected_supplier_id?: string | null
          quote_request_id?: string | null
        },
        Partial<SourcingRequest>
      >
      supplier_products: TableDef<
        SupplierProduct,
        Omit<SupplierProduct, 'id' | 'created_at' | 'updated_at' | 'approval_status' | 'admin_notes' | 'approved_by' | 'approved_at' | 'rejected_at' | 'archived_at' | 'public_name' | 'public_description' | 'platform_margin_type' | 'platform_margin_value' | 'supplier_type' | 'subcategory'> & {
          supplier_type?: SupplierType
          approval_status?: SupplierProductStatus
          admin_notes?: string | null
          approved_by?: string | null
          approved_at?: string | null
          rejected_at?: string | null
          archived_at?: string | null
          public_name?: string | null
          public_description?: string | null
          platform_margin_type?: PlatformMarginType
          platform_margin_value?: number | null
          subcategory?: string
        },
        Partial<SupplierProduct>
      >
      supplier_product_variants: TableDef<
        SupplierProductVariant,
        Omit<SupplierProductVariant, 'id' | 'created_at'>,
        Partial<SupplierProductVariant>
      >
      supplier_product_moq_tiers: TableDef<
        SupplierProductMoqTier,
        Omit<SupplierProductMoqTier, 'id' | 'created_at'>,
        Partial<SupplierProductMoqTier>
      >
      supplier_bulk_imports: TableDef<
        SupplierBulkImport,
        Omit<SupplierBulkImport, 'id' | 'created_at' | 'rows_total' | 'rows_valid' | 'rows_invalid' | 'rows_imported' | 'status' | 'report'> & {
          rows_total?: number
          rows_valid?: number
          rows_invalid?: number
          rows_imported?: number
          status?: BulkImportStatus
          report?: BulkImportReportRow[]
        },
        Partial<SupplierBulkImport>
      >
      supplier_catalogs: TableDef<
        SupplierCatalog,
        Omit<SupplierCatalog, 'id' | 'created_at' | 'admin_status' | 'admin_notes'> & {
          admin_status?: AttachmentAdminStatus
          admin_notes?: string | null
        },
        Partial<SupplierCatalog>
      >
      supplier_product_attachments: TableDef<
        SupplierProductAttachment,
        Omit<SupplierProductAttachment, 'id' | 'created_at' | 'admin_status' | 'admin_notes'> & {
          admin_status?: AttachmentAdminStatus
          admin_notes?: string | null
        },
        Partial<SupplierProductAttachment>
      >
      sample_requests: TableDef<
        SampleRequest,
        Omit<SampleRequest, 'id' | 'created_at' | 'updated_at' | 'status' | 'admin_notes'> & {
          status?: SampleRequestStatus
          admin_notes?: string | null
        },
        Partial<SampleRequest>
      >
      sample_request_files: TableDef<
        SampleRequestFile,
        Omit<SampleRequestFile, 'id' | 'created_at' | 'admin_approved' | 'admin_notes'> & {
          admin_approved?: boolean
          admin_notes?: string | null
        },
        Partial<SampleRequestFile>
      >
      supplier_matching_profiles: TableDef<
        SupplierMatchingProfile,
        Omit<SupplierMatchingProfile, 'id' | 'created_at' | 'updated_at' | 'response_rate' | 'reliability_score' | 'total_offers_sent' | 'total_offers_accepted'> & {
          response_rate?: number
          reliability_score?: number
          total_offers_sent?: number
          total_offers_accepted?: number
        },
        Partial<SupplierMatchingProfile>
      >
      rfq_matches: TableDef<
        RfqMatch,
        Omit<RfqMatch, 'id' | 'created_at' | 'updated_at' | 'status' | 'notified_at'> & {
          status?: RfqMatchStatus
          notified_at?: string | null
        },
        Partial<RfqMatch>
      >
      rfq_offers: TableDef<
        RfqOffer,
        Omit<RfqOffer, 'id' | 'created_at' | 'admin_notes' | 'admin_reviewed'> & {
          admin_notes?: string | null
          admin_reviewed?: boolean
        },
        Partial<RfqOffer>
      >
      premium_plans: TableDef<
        PremiumPlan,
        Omit<PremiumPlan, 'id' | 'created_at' | 'active' | 'display_order' | 'rfq_priority_boost' | 'featured_badge' | 'verified_badge' | 'full_analytics' | 'priority_support' | 'max_products' | 'price_mad_monthly'> & {
          price_mad_monthly?: number
          max_products?: number
          rfq_priority_boost?: number
          featured_badge?: boolean
          verified_badge?: boolean
          full_analytics?: boolean
          priority_support?: boolean
          active?: boolean
          display_order?: number
        },
        Partial<PremiumPlan>
      >
      supplier_subscriptions: TableDef<
        SupplierSubscription,
        Omit<SupplierSubscription, 'id' | 'created_at' | 'updated_at' | 'status' | 'started_at' | 'expires_at' | 'notes' | 'assigned_by'> & {
          status?: SubscriptionStatus
          started_at?: string
          expires_at?: string | null
          notes?: string | null
          assigned_by?: string | null
        },
        Partial<SupplierSubscription>
      >
      subscription_audit_log: TableDef<
        SubscriptionAuditLog,
        Omit<SubscriptionAuditLog, 'id' | 'changed_at'> & { changed_at?: string },
        never
      >
    }
    Views: Record<never, never>
    Functions: {
      my_role: { Args: Record<string, never>; Returns: UserRole }
      get_supplier_plan: { Args: { p_supplier_id: string }; Returns: string }
      get_orders_by_phone: {
        Args: { p_phone: string }
        Returns: {
          id: string
          status: OrderStatus
          customer_name: string
          customer_city: string
          quantity: number
          total_amount: number
          product_name: string
          tracking_number: string | null
          delivery_company: string | null
          created_at: string
          confirmed_at: string | null
          shipped_at: string | null
          delivered_at: string | null
          cancelled_at: string | null
          returned_at: string | null
        }[]
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
