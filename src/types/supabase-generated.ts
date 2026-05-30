export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affiliate_clicks: {
        Row: {
          affiliate_id: string
          created_at: string
          id: string
          product_id: string
          referrer_path: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          id?: string
          product_id: string
          referrer_path?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          id?: string
          product_id?: string
          referrer_path?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_clicks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_product_prices: {
        Row: {
          affiliate_id: string
          created_at: string
          custom_sell_price_mad: number
          id: string
          product_id: string
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          custom_sell_price_mad: number
          id?: string
          product_id: string
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          custom_sell_price_mad?: number
          id?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_product_prices_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          courier_code: string | null
          courier_fee_mad: number | null
          courier_last_synced_at: string | null
          courier_metadata: Json
          courier_sync_enabled: boolean
          courier_zone: string | null
          created_at: string
          delivery_fee_mad: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          courier_code?: string | null
          courier_fee_mad?: number | null
          courier_last_synced_at?: string | null
          courier_metadata?: Json
          courier_sync_enabled?: boolean
          courier_zone?: string | null
          created_at?: string
          delivery_fee_mad?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          courier_code?: string | null
          courier_fee_mad?: number | null
          courier_last_synced_at?: string | null
          courier_metadata?: Json
          courier_sync_enabled?: boolean
          courier_zone?: string | null
          created_at?: string
          delivery_fee_mad?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          affiliate_id: string
          amount: number
          created_at: string
          id: string
          order_id: string
          paid_at: string | null
          reversed: boolean
          reversed_at: string | null
          status: string
        }
        Insert: {
          affiliate_id: string
          amount: number
          created_at?: string
          id?: string
          order_id: string
          paid_at?: string | null
          reversed?: boolean
          reversed_at?: string | null
          status?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          paid_at?: string | null
          reversed?: boolean
          reversed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      import_tariffs: {
        Row: {
          active: boolean
          country: string
          created_at: string
          delivery_days: number | null
          id: string
          notes: string | null
          price_mad: number
          pricing_mode: string
          shipping_mode: string
          transport_customs_price_mad: number
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          country: string
          created_at?: string
          delivery_days?: number | null
          id?: string
          notes?: string | null
          price_mad: number
          pricing_mode: string
          shipping_mode: string
          transport_customs_price_mad: number
          unit: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          country?: string
          created_at?: string
          delivery_days?: number | null
          id?: string
          notes?: string | null
          price_mad?: number
          pricing_mode?: string
          shipping_mode?: string
          transport_customs_price_mad?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      logistics_settings: {
        Row: {
          api_config: Json
          casablanca_delivery_fee_mad: number
          default_delivery_fee_mad: number
          id: string
          return_fee_mad: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_config?: Json
          casablanca_delivery_fee_mad?: number
          default_delivery_fee_mad?: number
          id?: string
          return_fee_mad?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_config?: Json
          casablanca_delivery_fee_mad?: number
          default_delivery_fee_mad?: number
          id?: string
          return_fee_mad?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      order_proofs: {
        Row: {
          file_url: string
          id: string
          notes: string | null
          proof_type: string
          related_order_id: string | null
          related_product_id: string | null
          related_wholesale_order_id: string | null
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          file_url: string
          id?: string
          notes?: string | null
          proof_type: string
          related_order_id?: string | null
          related_product_id?: string | null
          related_wholesale_order_id?: string | null
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          file_url?: string
          id?: string
          notes?: string | null
          proof_type?: string
          related_order_id?: string | null
          related_product_id?: string | null
          related_wholesale_order_id?: string | null
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_proofs_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_proofs_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_proofs_related_wholesale_order_id_fkey"
            columns: ["related_wholesale_order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_proofs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_signals: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          order_id: string
          score: number
          signal_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          order_id: string
          score?: number
          signal_type: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string
          score?: number
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_signals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          affiliate_commission_mad_snapshot: number | null
          affiliate_id: string | null
          attribution_click_id: string | null
          cancelled_at: string | null
          cod_expected: number | null
          cod_received: number | null
          cod_transfer_received_at: string | null
          commission_amount: number
          confirmation_fee_snapshot: number | null
          confirmed_at: string | null
          created_at: string
          customer_address: string
          customer_city: string
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_company: string | null
          delivery_fee_snapshot: number | null
          duplicate_risk_score: number | null
          fraud_score: number | null
          id: string
          notes: string | null
          order_source: string | null
          packaging_fee_snapshot: number | null
          product_id: string
          product_price_snapshot: number | null
          quantity: number
          return_fee_snapshot: number | null
          return_reason: string | null
          returned_at: string | null
          shipped_at: string | null
          signals_metadata: Json
          spam_score: number | null
          status: string
          total_amount: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          affiliate_commission_mad_snapshot?: number | null
          affiliate_id?: string | null
          attribution_click_id?: string | null
          cancelled_at?: string | null
          cod_expected?: number | null
          cod_received?: number | null
          cod_transfer_received_at?: string | null
          commission_amount: number
          confirmation_fee_snapshot?: number | null
          confirmed_at?: string | null
          created_at?: string
          customer_address: string
          customer_city: string
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_company?: string | null
          delivery_fee_snapshot?: number | null
          duplicate_risk_score?: number | null
          fraud_score?: number | null
          id?: string
          notes?: string | null
          order_source?: string | null
          packaging_fee_snapshot?: number | null
          product_id: string
          product_price_snapshot?: number | null
          quantity?: number
          return_fee_snapshot?: number | null
          return_reason?: string | null
          returned_at?: string | null
          shipped_at?: string | null
          signals_metadata?: Json
          spam_score?: number | null
          status?: string
          total_amount: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_commission_mad_snapshot?: number | null
          affiliate_id?: string | null
          attribution_click_id?: string | null
          cancelled_at?: string | null
          cod_expected?: number | null
          cod_received?: number | null
          cod_transfer_received_at?: string | null
          commission_amount?: number
          confirmation_fee_snapshot?: number | null
          confirmed_at?: string | null
          created_at?: string
          customer_address?: string
          customer_city?: string
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_company?: string | null
          delivery_fee_snapshot?: number | null
          duplicate_risk_score?: number | null
          fraud_score?: number | null
          id?: string
          notes?: string | null
          order_source?: string | null
          packaging_fee_snapshot?: number | null
          product_id?: string
          product_price_snapshot?: number | null
          quantity?: number
          return_fee_snapshot?: number | null
          return_reason?: string | null
          returned_at?: string | null
          shipped_at?: string | null
          signals_metadata?: Json
          spam_score?: number | null
          status?: string
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_attribution_click_id_fkey"
            columns: ["attribution_click_id"]
            isOneToOne: false
            referencedRelation: "affiliate_clicks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          affiliate_id: string
          amount: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          reference: string | null
          status: string
        }
        Insert: {
          affiliate_id: string
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          status?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          affiliate_enabled: boolean
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          availability_type: string
          calculated_sale_price_mad: number | null
          commission_amount: number
          confirmation_fee_mad: number
          created_at: string
          delivery_fee_config: Json
          delivery_fee_mad: number
          description: string | null
          estimated_cost_mad: number | null
          estimated_delivery_days: number | null
          estimated_import_price_mad: number | null
          exchange_rate_to_mad: number
          factory_cost_mad: number | null
          id: string
          images: string[]
          import_notes: string | null
          import_price_unit: string | null
          import_pricing_mode: string | null
          import_shipping_mode: string | null
          margin_percentage: number
          media: Json
          name: string
          origin_country: string | null
          origin_detail: string | null
          packaging_fee_mad: number
          platform_margin_type: string
          platform_margin_value: number | null
          purchase_currency: string
          purchase_price: number | null
          purchase_price_mad: number | null
          sell_price: number
          source_notes: string | null
          source_type: string
          stock_count: number
          submitted_by: string | null
          submitted_via: string
          supplier_id: string | null
          supplier_name: string | null
          tariff_mode: string
          updated_at: string
          wholesale_min_qty: number
          wholesale_tiers: Json
        }
        Insert: {
          active?: boolean
          affiliate_enabled?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          availability_type?: string
          calculated_sale_price_mad?: number | null
          commission_amount?: number
          confirmation_fee_mad?: number
          created_at?: string
          delivery_fee_config?: Json
          delivery_fee_mad?: number
          description?: string | null
          estimated_cost_mad?: number | null
          estimated_delivery_days?: number | null
          estimated_import_price_mad?: number | null
          exchange_rate_to_mad?: number
          factory_cost_mad?: number | null
          id?: string
          images?: string[]
          import_notes?: string | null
          import_price_unit?: string | null
          import_pricing_mode?: string | null
          import_shipping_mode?: string | null
          margin_percentage?: number
          media?: Json
          name: string
          origin_country?: string | null
          origin_detail?: string | null
          packaging_fee_mad?: number
          platform_margin_type?: string
          platform_margin_value?: number | null
          purchase_currency?: string
          purchase_price?: number | null
          purchase_price_mad?: number | null
          sell_price: number
          source_notes?: string | null
          source_type?: string
          stock_count?: number
          submitted_by?: string | null
          submitted_via?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tariff_mode?: string
          updated_at?: string
          wholesale_min_qty?: number
          wholesale_tiers?: Json
        }
        Update: {
          active?: boolean
          affiliate_enabled?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          availability_type?: string
          calculated_sale_price_mad?: number | null
          commission_amount?: number
          confirmation_fee_mad?: number
          created_at?: string
          delivery_fee_config?: Json
          delivery_fee_mad?: number
          description?: string | null
          estimated_cost_mad?: number | null
          estimated_delivery_days?: number | null
          estimated_import_price_mad?: number | null
          exchange_rate_to_mad?: number
          factory_cost_mad?: number | null
          id?: string
          images?: string[]
          import_notes?: string | null
          import_price_unit?: string | null
          import_pricing_mode?: string | null
          import_shipping_mode?: string | null
          margin_percentage?: number
          media?: Json
          name?: string
          origin_country?: string | null
          origin_detail?: string | null
          packaging_fee_mad?: number
          platform_margin_type?: string
          platform_margin_value?: number | null
          purchase_currency?: string
          purchase_price?: number | null
          purchase_price_mad?: number | null
          sell_price?: number
          source_notes?: string | null
          source_type?: string
          stock_count?: number
          submitted_by?: string | null
          submitted_via?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tariff_mode?: string
          updated_at?: string
          wholesale_min_qty?: number
          wholesale_tiers?: Json
        }
        Relationships: [
          {
            foreignKeyName: "products_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bank_account: string | null
          billing_address: string | null
          city: string | null
          company_name: string | null
          created_at: string
          full_name: string
          ice: string | null
          id: string
          phone: string | null
          registre_commerce: string | null
          role: string
          status: string
          wholesale_access: boolean
        }
        Insert: {
          bank_account?: string | null
          billing_address?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string
          ice?: string | null
          id: string
          phone?: string | null
          registre_commerce?: string | null
          role: string
          status?: string
          wholesale_access?: boolean
        }
        Update: {
          bank_account?: string | null
          billing_address?: string | null
          city?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string
          ice?: string | null
          id?: string
          phone?: string | null
          registre_commerce?: string | null
          role?: string
          status?: string
          wholesale_access?: boolean
        }
        Relationships: []
      }
      quote_requests: {
        Row: {
          admin_notes: string | null
          admin_notes_public: boolean
          buyer_id: string
          buyer_notes: string | null
          colors_or_variants: string | null
          created_at: string
          destination_city: string | null
          destination_country: string
          id: string
          preferred_shipping_mode: string | null
          product_id: string
          quantity_requested: number
          sizes: string | null
          status: string
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          admin_notes?: string | null
          admin_notes_public?: boolean
          buyer_id: string
          buyer_notes?: string | null
          colors_or_variants?: string | null
          created_at?: string
          destination_city?: string | null
          destination_country: string
          id?: string
          preferred_shipping_mode?: string | null
          product_id: string
          quantity_requested: number
          sizes?: string | null
          status?: string
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          admin_notes?: string | null
          admin_notes_public?: boolean
          buyer_id?: string
          buyer_notes?: string | null
          colors_or_variants?: string | null
          created_at?: string
          destination_city?: string | null
          destination_country?: string
          id?: string
          preferred_shipping_mode?: string | null
          product_id?: string
          quantity_requested?: number
          sizes?: string | null
          status?: string
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_cart_items: {
        Row: {
          added_at: string
          buyer_id: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          added_at?: string
          buyer_id: string
          id?: string
          product_id: string
          quantity: number
        }
        Update: {
          added_at?: string
          buyer_id?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_cart_items_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_order_import_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          import_status: string
          notes: string | null
          order_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          import_status: string
          notes?: string | null
          order_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          import_status?: string
          notes?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_order_import_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
          subtotal: number
          tier_label_snapshot: string
          unit_price_snapshot: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity: number
          subtotal: number
          tier_label_snapshot: string
          unit_price_snapshot: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          subtotal?: number
          tier_label_snapshot?: string
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_orders: {
        Row: {
          additional_cost_mad: number
          address: string | null
          agent_id: string | null
          agent_notes: string | null
          buyer_id: string
          buyer_notes: string | null
          cancelled_at: string | null
          city: string | null
          confirmed_at: string | null
          created_at: string
          delivered_at: string | null
          delivery_cost: number
          delivery_preference: string
          gross_margin_percent: number | null
          gross_profit_mad: number | null
          id: string
          import_status: string | null
          invoice_billing_address: string | null
          invoice_company_name: string | null
          invoice_ice: string | null
          invoice_registre_commerce: string | null
          invoice_requested: boolean
          invoice_requested_at: string | null
          quote_request_id: string | null
          shipped_at: string | null
          sourcing_at: string | null
          status: string
          supplier_cost_mad: number
          total_amount: number
          total_cost_mad: number | null
          transport_customs_cost_mad: number
          updated_at: string
        }
        Insert: {
          additional_cost_mad?: number
          address?: string | null
          agent_id?: string | null
          agent_notes?: string | null
          buyer_id: string
          buyer_notes?: string | null
          cancelled_at?: string | null
          city?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_cost?: number
          delivery_preference: string
          gross_margin_percent?: number | null
          gross_profit_mad?: number | null
          id?: string
          import_status?: string | null
          invoice_billing_address?: string | null
          invoice_company_name?: string | null
          invoice_ice?: string | null
          invoice_registre_commerce?: string | null
          invoice_requested?: boolean
          invoice_requested_at?: string | null
          quote_request_id?: string | null
          shipped_at?: string | null
          sourcing_at?: string | null
          status?: string
          supplier_cost_mad?: number
          total_amount?: number
          total_cost_mad?: number | null
          transport_customs_cost_mad?: number
          updated_at?: string
        }
        Update: {
          additional_cost_mad?: number
          address?: string | null
          agent_id?: string | null
          agent_notes?: string | null
          buyer_id?: string
          buyer_notes?: string | null
          cancelled_at?: string | null
          city?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_cost?: number
          delivery_preference?: string
          gross_margin_percent?: number | null
          gross_profit_mad?: number | null
          id?: string
          import_status?: string | null
          invoice_billing_address?: string | null
          invoice_company_name?: string | null
          invoice_ice?: string | null
          invoice_registre_commerce?: string | null
          invoice_requested?: boolean
          invoice_requested_at?: string | null
          quote_request_id?: string | null
          shipped_at?: string | null
          sourcing_at?: string | null
          status?: string
          supplier_cost_mad?: number
          total_amount?: number
          total_cost_mad?: number | null
          transport_customs_cost_mad?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_orders_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_orders_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_role: { Args: never; Returns: string }
      reserve_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: boolean
      }
      restore_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
