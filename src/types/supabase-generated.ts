export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      countries: {
        Row: {
          active: boolean
          can_receive_export: boolean
          can_source: boolean
          cod_enabled: boolean
          code: string
          created_at: string
          has_office: boolean
          has_warehouse: boolean
          name_en: string
          name_fr: string
          operational_currency: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          can_receive_export?: boolean
          can_source?: boolean
          cod_enabled?: boolean
          code: string
          created_at?: string
          has_office?: boolean
          has_warehouse?: boolean
          name_en: string
          name_fr: string
          operational_currency: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          can_receive_export?: boolean
          can_source?: boolean
          cod_enabled?: boolean
          code?: string
          created_at?: string
          has_office?: boolean
          has_warehouse?: boolean
          name_en?: string
          name_fr?: string
          operational_currency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "countries_operational_currency_fkey"
            columns: ["operational_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      country_aliases: {
        Row: {
          alias: string
          country_code: string | null
        }
        Insert: {
          alias: string
          country_code?: string | null
        }
        Update: {
          alias?: string
          country_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "country_aliases_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      currencies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          decimals: number
          name: string
          symbol: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          decimals?: number
          name: string
          symbol: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          decimals?: number
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          as_of: string
          created_at: string
          created_by: string | null
          id: string
          quote_code: string
          rate_vs_mad: number
          source: string | null
        }
        Insert: {
          as_of?: string
          created_at?: string
          created_by?: string | null
          id?: string
          quote_code: string
          rate_vs_mad: number
          source?: string | null
        }
        Update: {
          as_of?: string
          created_at?: string
          created_by?: string | null
          id?: string
          quote_code?: string
          rate_vs_mad?: number
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_quote_code_fkey"
            columns: ["quote_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
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
      ledger_entries: {
        Row: {
          affiliate_id: string
          amount: number
          commission_id: string | null
          created_at: string
          entry_type: string
          id: string
          idempotency_key: string
          metadata: Json
          order_id: string | null
          payout_id: string | null
        }
        Insert: {
          affiliate_id: string
          amount: number
          commission_id?: string | null
          created_at?: string
          entry_type: string
          id?: string
          idempotency_key: string
          metadata?: Json
          order_id?: string | null
          payout_id?: string | null
        }
        Update: {
          affiliate_id?: string
          amount?: number
          commission_id?: string | null
          created_at?: string
          entry_type?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          order_id?: string | null
          payout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
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
          idempotency_key: string | null
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
          idempotency_key?: string | null
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
          idempotency_key?: string | null
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
      premium_plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          display_order: number
          featured_badge: boolean
          full_analytics: boolean
          id: string
          max_products: number
          name: string
          price_mad_monthly: number
          priority_support: boolean
          rfq_priority_boost: number
          slug: string
          verified_badge: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          featured_badge?: boolean
          full_analytics?: boolean
          id?: string
          max_products?: number
          name: string
          price_mad_monthly?: number
          priority_support?: boolean
          rfq_priority_boost?: number
          slug: string
          verified_badge?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          display_order?: number
          featured_badge?: boolean
          full_analytics?: boolean
          id?: string
          max_products?: number
          name?: string
          price_mad_monthly?: number
          priority_support?: boolean
          rfq_priority_boost?: number
          slug?: string
          verified_badge?: boolean
        }
        Relationships: []
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
          category: string
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
          subcategory: string
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
          category?: string
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
          subcategory?: string
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
          category?: string
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
          subcategory?: string
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
          client_decision_at: string | null
          colors_or_variants: string | null
          created_at: string
          destination_city: string | null
          destination_country: string
          display_currency: string | null
          fx_rate_display_vs_mad: number | null
          fx_rate_source_to_mad: number | null
          id: string
          preferred_shipping_mode: string | null
          product_id: string
          quantity_requested: number
          quote_prepared_at: string | null
          quote_public_note: string | null
          quote_validity_date: string | null
          quoted_delivery_delay: string | null
          quoted_quantity: number | null
          quoted_shipping_mode: string | null
          quoted_transport_total_mad: number | null
          quoted_unit_price_mad: number | null
          quoted_unit_price_source: number | null
          sizes: string | null
          source_currency: string | null
          status: string
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          admin_notes?: string | null
          admin_notes_public?: boolean
          buyer_id: string
          buyer_notes?: string | null
          client_decision_at?: string | null
          colors_or_variants?: string | null
          created_at?: string
          destination_city?: string | null
          destination_country: string
          display_currency?: string | null
          fx_rate_display_vs_mad?: number | null
          fx_rate_source_to_mad?: number | null
          id?: string
          preferred_shipping_mode?: string | null
          product_id: string
          quantity_requested: number
          quote_prepared_at?: string | null
          quote_public_note?: string | null
          quote_validity_date?: string | null
          quoted_delivery_delay?: string | null
          quoted_quantity?: number | null
          quoted_shipping_mode?: string | null
          quoted_transport_total_mad?: number | null
          quoted_unit_price_mad?: number | null
          quoted_unit_price_source?: number | null
          sizes?: string | null
          source_currency?: string | null
          status?: string
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          admin_notes?: string | null
          admin_notes_public?: boolean
          buyer_id?: string
          buyer_notes?: string | null
          client_decision_at?: string | null
          colors_or_variants?: string | null
          created_at?: string
          destination_city?: string | null
          destination_country?: string
          display_currency?: string | null
          fx_rate_display_vs_mad?: number | null
          fx_rate_source_to_mad?: number | null
          id?: string
          preferred_shipping_mode?: string | null
          product_id?: string
          quantity_requested?: number
          quote_prepared_at?: string | null
          quote_public_note?: string | null
          quote_validity_date?: string | null
          quoted_delivery_delay?: string | null
          quoted_quantity?: number | null
          quoted_shipping_mode?: string | null
          quoted_transport_total_mad?: number | null
          quoted_unit_price_mad?: number | null
          quoted_unit_price_source?: number | null
          sizes?: string | null
          source_currency?: string | null
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
            foreignKeyName: "quote_requests_display_currency_fkey"
            columns: ["display_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "quote_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_source_currency_fkey"
            columns: ["source_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      rfq_matches: {
        Row: {
          created_at: string
          id: string
          notified_at: string | null
          quote_request_id: string | null
          score_category: number
          score_country: number
          score_lead_time: number
          score_moq: number
          score_reliability: number
          score_response_rate: number
          sourcing_request_id: string | null
          status: string
          supplier_id: string
          total_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified_at?: string | null
          quote_request_id?: string | null
          score_category?: number
          score_country?: number
          score_lead_time?: number
          score_moq?: number
          score_reliability?: number
          score_response_rate?: number
          sourcing_request_id?: string | null
          status?: string
          supplier_id: string
          total_score?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notified_at?: string | null
          quote_request_id?: string | null
          score_category?: number
          score_country?: number
          score_lead_time?: number
          score_moq?: number
          score_reliability?: number
          score_response_rate?: number
          sourcing_request_id?: string | null
          status?: string
          supplier_id?: string
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_matches_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_matches_sourcing_request_id_fkey"
            columns: ["sourcing_request_id"]
            isOneToOne: false
            referencedRelation: "sourcing_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_matches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_offers: {
        Row: {
          admin_notes: string | null
          admin_reviewed: boolean
          created_at: string
          id: string
          lead_time_days: number | null
          message: string | null
          moq_offered: number | null
          notes: string | null
          response_type: string
          rfq_match_id: string
          supplier_id: string
          unit_price_usd: number | null
        }
        Insert: {
          admin_notes?: string | null
          admin_reviewed?: boolean
          created_at?: string
          id?: string
          lead_time_days?: number | null
          message?: string | null
          moq_offered?: number | null
          notes?: string | null
          response_type: string
          rfq_match_id: string
          supplier_id: string
          unit_price_usd?: number | null
        }
        Update: {
          admin_notes?: string | null
          admin_reviewed?: boolean
          created_at?: string
          id?: string
          lead_time_days?: number | null
          message?: string | null
          moq_offered?: number | null
          notes?: string | null
          response_type?: string
          rfq_match_id?: string
          supplier_id?: string
          unit_price_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_offers_rfq_match_id_fkey"
            columns: ["rfq_match_id"]
            isOneToOne: false
            referencedRelation: "rfq_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_offers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_request_files: {
        Row: {
          admin_approved: boolean
          admin_notes: string | null
          created_at: string
          file_size: number | null
          file_type: string
          filename: string
          id: string
          sample_request_id: string
          storage_path: string
          uploader_role: string
        }
        Insert: {
          admin_approved?: boolean
          admin_notes?: string | null
          created_at?: string
          file_size?: number | null
          file_type: string
          filename: string
          id?: string
          sample_request_id: string
          storage_path: string
          uploader_role: string
        }
        Update: {
          admin_approved?: boolean
          admin_notes?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: string
          filename?: string
          id?: string
          sample_request_id?: string
          storage_path?: string
          uploader_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_request_files_sample_request_id_fkey"
            columns: ["sample_request_id"]
            isOneToOne: false
            referencedRelation: "sample_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          message: string | null
          request_type: string
          status: string
          supplier_product_id: string
          updated_at: string
          wholesaler_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          message?: string | null
          request_type: string
          status?: string
          supplier_product_id: string
          updated_at?: string
          wholesaler_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          message?: string | null
          request_type?: string
          status?: string
          supplier_product_id?: string
          updated_at?: string
          wholesaler_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_requests_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_requests_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_requests_wholesaler_id_fkey"
            columns: ["wholesaler_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_requests: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          delivery_deadline: string | null
          id: string
          notes: string | null
          product_name: string
          quantity: number
          quote_request_id: string | null
          selected_supplier_id: string | null
          status: string
          target_budget_mad: number
          target_country: string | null
          updated_at: string
          wholesaler_id: string
        }
        Insert: {
          admin_notes?: string | null
          category: string
          created_at?: string
          delivery_deadline?: string | null
          id?: string
          notes?: string | null
          product_name: string
          quantity: number
          quote_request_id?: string | null
          selected_supplier_id?: string | null
          status?: string
          target_budget_mad: number
          target_country?: string | null
          updated_at?: string
          wholesaler_id: string
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          delivery_deadline?: string | null
          id?: string
          notes?: string | null
          product_name?: string
          quantity?: number
          quote_request_id?: string | null
          selected_supplier_id?: string | null
          status?: string
          target_budget_mad?: number
          target_country?: string | null
          updated_at?: string
          wholesaler_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_requests_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_requests_selected_supplier_id_fkey"
            columns: ["selected_supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_requests_wholesaler_id_fkey"
            columns: ["wholesaler_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_audit_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_plan_slug: string
          new_status: string
          notes: string | null
          old_plan_slug: string | null
          old_status: string | null
          supplier_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_plan_slug: string
          new_status: string
          notes?: string | null
          old_plan_slug?: string | null
          old_status?: string | null
          supplier_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_plan_slug?: string
          new_status?: string
          notes?: string | null
          old_plan_slug?: string | null
          old_status?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_audit_log_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bulk_imports: {
        Row: {
          created_at: string
          filename: string
          id: string
          report: Json
          rows_imported: number
          rows_invalid: number
          rows_total: number
          rows_valid: number
          status: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          report?: Json
          rows_imported?: number
          rows_invalid?: number
          rows_total?: number
          rows_valid?: number
          status?: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          report?: Json
          rows_imported?: number
          rows_invalid?: number
          rows_total?: number
          rows_valid?: number
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bulk_imports_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_catalogs: {
        Row: {
          admin_notes: string | null
          admin_status: string
          created_at: string
          file_size: number | null
          file_type: string
          filename: string
          id: string
          storage_path: string
          supplier_id: string
        }
        Insert: {
          admin_notes?: string | null
          admin_status?: string
          created_at?: string
          file_size?: number | null
          file_type: string
          filename: string
          id?: string
          storage_path: string
          supplier_id: string
        }
        Update: {
          admin_notes?: string | null
          admin_status?: string
          created_at?: string
          file_size?: number | null
          file_type?: string
          filename?: string
          id?: string
          storage_path?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_catalogs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_issues: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_days: number | null
          id: string
          issue_type: string
          notes: string | null
          supplier_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_days?: number | null
          id?: string
          issue_type: string
          notes?: string | null
          supplier_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_days?: number | null
          id?: string
          issue_type?: string
          notes?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_issues_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_matching_profiles: {
        Row: {
          active: boolean
          categories: string[]
          countries_served: string[]
          created_at: string
          export_capable: boolean
          id: string
          lead_time_days_max: number | null
          lead_time_days_min: number | null
          moq_max: number | null
          moq_min: number | null
          production_capacity: number | null
          reliability_score: number
          response_rate: number
          supplier_id: string
          supplier_type: string
          total_offers_accepted: number
          total_offers_sent: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          categories?: string[]
          countries_served?: string[]
          created_at?: string
          export_capable?: boolean
          id?: string
          lead_time_days_max?: number | null
          lead_time_days_min?: number | null
          moq_max?: number | null
          moq_min?: number | null
          production_capacity?: number | null
          reliability_score?: number
          response_rate?: number
          supplier_id: string
          supplier_type?: string
          total_offers_accepted?: number
          total_offers_sent?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          categories?: string[]
          countries_served?: string[]
          created_at?: string
          export_capable?: boolean
          id?: string
          lead_time_days_max?: number | null
          lead_time_days_min?: number | null
          moq_max?: number | null
          moq_min?: number | null
          production_capacity?: number | null
          reliability_score?: number
          response_rate?: number
          supplier_id?: string
          supplier_type?: string
          total_offers_accepted?: number
          total_offers_sent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_matching_profiles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payout_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: string
          notes: string | null
          previous_status: string | null
          supplier_quote_request_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: string
          notes?: string | null
          previous_status?: string | null
          supplier_quote_request_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: string
          notes?: string | null
          previous_status?: string | null
          supplier_quote_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payout_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payout_history_supplier_quote_request_id_fkey"
            columns: ["supplier_quote_request_id"]
            isOneToOne: false
            referencedRelation: "supplier_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payout_history_supplier_quote_request_id_fkey"
            columns: ["supplier_quote_request_id"]
            isOneToOne: false
            referencedRelation: "supplier_quote_requests_supplier_read"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_attachments: {
        Row: {
          admin_notes: string | null
          admin_status: string
          attachment_type: string
          created_at: string
          file_size: number | null
          filename: string
          id: string
          storage_path: string
          supplier_product_id: string
        }
        Insert: {
          admin_notes?: string | null
          admin_status?: string
          attachment_type: string
          created_at?: string
          file_size?: number | null
          filename: string
          id?: string
          storage_path: string
          supplier_product_id: string
        }
        Update: {
          admin_notes?: string | null
          admin_status?: string
          attachment_type?: string
          created_at?: string
          file_size?: number | null
          filename?: string
          id?: string
          storage_path?: string
          supplier_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_attachments_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_attachments_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_moq_tiers: {
        Row: {
          created_at: string
          id: string
          min_quantity: number
          supplier_product_id: string
          unit_price_usd: number
        }
        Insert: {
          created_at?: string
          id?: string
          min_quantity: number
          supplier_product_id: string
          unit_price_usd: number
        }
        Update: {
          created_at?: string
          id?: string
          min_quantity?: number
          supplier_product_id?: string
          unit_price_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_moq_tiers_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_moq_tiers_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_variants: {
        Row: {
          color: string | null
          created_at: string
          id: string
          model: string | null
          price_adjustment_usd: number
          size: string | null
          stock_quantity: number | null
          supplier_product_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          model?: string | null
          price_adjustment_usd?: number
          size?: string | null
          stock_quantity?: number | null
          supplier_product_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          model?: string | null
          price_adjustment_usd?: number
          size?: string | null
          stock_quantity?: number | null
          supplier_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_variants_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_variants_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          admin_notes: string | null
          ai_risk_score: number | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          availability_type: string
          category: string
          created_at: string
          description: string | null
          export_countries: string[]
          id: string
          lead_time_days: number | null
          min_quantity: number
          moderation_flag: string | null
          moderation_reason: string | null
          moderation_signals: string[]
          niche: string
          origin_country: string
          photos: string[]
          platform_margin_type: string
          platform_margin_value: number | null
          product_name: string
          public_description: string | null
          public_name: string | null
          rejected_at: string | null
          stock_quantity: number | null
          subcategory: string
          suggested_wholesale_price_mad: number | null
          supplier_id: string
          supplier_private_notes: string | null
          supplier_type: string
          supplier_unit_price_usd: number | null
          target_buyer_type: string
          unit: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          ai_risk_score?: number | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          availability_type?: string
          category?: string
          created_at?: string
          description?: string | null
          export_countries?: string[]
          id?: string
          lead_time_days?: number | null
          min_quantity?: number
          moderation_flag?: string | null
          moderation_reason?: string | null
          moderation_signals?: string[]
          niche?: string
          origin_country?: string
          photos?: string[]
          platform_margin_type?: string
          platform_margin_value?: number | null
          product_name: string
          public_description?: string | null
          public_name?: string | null
          rejected_at?: string | null
          stock_quantity?: number | null
          subcategory?: string
          suggested_wholesale_price_mad?: number | null
          supplier_id: string
          supplier_private_notes?: string | null
          supplier_type?: string
          supplier_unit_price_usd?: number | null
          target_buyer_type?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          ai_risk_score?: number | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          availability_type?: string
          category?: string
          created_at?: string
          description?: string | null
          export_countries?: string[]
          id?: string
          lead_time_days?: number | null
          min_quantity?: number
          moderation_flag?: string | null
          moderation_reason?: string | null
          moderation_signals?: string[]
          niche?: string
          origin_country?: string
          photos?: string[]
          platform_margin_type?: string
          platform_margin_value?: number | null
          product_name?: string
          public_description?: string | null
          public_name?: string | null
          rejected_at?: string | null
          stock_quantity?: number | null
          subcategory?: string
          suggested_wholesale_price_mad?: number | null
          supplier_id?: string
          supplier_private_notes?: string | null
          supplier_type?: string
          supplier_unit_price_usd?: number | null
          target_buyer_type?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quote_requests: {
        Row: {
          admin_notes: string | null
          buyer_id: string
          buyer_notes: string | null
          buyer_purchase_profile: string | null
          buyer_volume_tier: string | null
          created_at: string
          destination_city: string | null
          destination_country: string
          id: string
          platform_commission_amount_mad: number | null
          platform_commission_type: string
          platform_commission_value: number | null
          quantity_requested: number
          quoted_unit_price_mad: number | null
          status: string
          supplier_cost_mad: number | null
          supplier_payout_amount_mad: number | null
          supplier_payout_status: string
          supplier_product_id: string
          transport_customs_cost_mad: number
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          admin_notes?: string | null
          buyer_id: string
          buyer_notes?: string | null
          buyer_purchase_profile?: string | null
          buyer_volume_tier?: string | null
          created_at?: string
          destination_city?: string | null
          destination_country?: string
          id?: string
          platform_commission_amount_mad?: number | null
          platform_commission_type?: string
          platform_commission_value?: number | null
          quantity_requested: number
          quoted_unit_price_mad?: number | null
          status?: string
          supplier_cost_mad?: number | null
          supplier_payout_amount_mad?: number | null
          supplier_payout_status?: string
          supplier_product_id: string
          transport_customs_cost_mad?: number
          updated_at?: string
          whatsapp_number: string
        }
        Update: {
          admin_notes?: string | null
          buyer_id?: string
          buyer_notes?: string | null
          buyer_purchase_profile?: string | null
          buyer_volume_tier?: string | null
          created_at?: string
          destination_city?: string | null
          destination_country?: string
          id?: string
          platform_commission_amount_mad?: number | null
          platform_commission_type?: string
          platform_commission_value?: number | null
          quantity_requested?: number
          quoted_unit_price_mad?: number | null
          status?: string
          supplier_cost_mad?: number | null
          supplier_payout_amount_mad?: number | null
          supplier_payout_status?: string
          supplier_product_id?: string
          transport_customs_cost_mad?: number
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_requests_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_requests_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_requests_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_subscriptions: {
        Row: {
          assigned_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          plan_id: string
          started_at: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          started_at?: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          started_at?: string
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_subscriptions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "premium_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_subscriptions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
      wholesale_order_payment_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          deposit_amount: number | null
          deposit_received_amount: number | null
          id: string
          notes: string | null
          order_id: string
          payment_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          deposit_amount?: number | null
          deposit_received_amount?: number | null
          id?: string
          notes?: string | null
          order_id: string
          payment_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          deposit_amount?: number | null
          deposit_received_amount?: number | null
          id?: string
          notes?: string | null
          order_id?: string
          payment_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_order_payment_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
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
          deposit_amount: number | null
          deposit_received_amount: number
          deposit_received_at: string | null
          deposit_requested_at: string | null
          fully_paid_at: string | null
          fx_rate_source_to_mad: number | null
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
          merchandise_source_amount: number | null
          payment_status: string
          quote_request_id: string | null
          shipped_at: string | null
          source_currency: string | null
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
          deposit_amount?: number | null
          deposit_received_amount?: number
          deposit_received_at?: string | null
          deposit_requested_at?: string | null
          fully_paid_at?: string | null
          fx_rate_source_to_mad?: number | null
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
          merchandise_source_amount?: number | null
          payment_status?: string
          quote_request_id?: string | null
          shipped_at?: string | null
          source_currency?: string | null
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
          deposit_amount?: number | null
          deposit_received_amount?: number
          deposit_received_at?: string | null
          deposit_requested_at?: string | null
          fully_paid_at?: string | null
          fx_rate_source_to_mad?: number | null
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
          merchandise_source_amount?: number | null
          payment_status?: string
          quote_request_id?: string | null
          shipped_at?: string | null
          source_currency?: string | null
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
          {
            foreignKeyName: "wholesale_orders_source_currency_fkey"
            columns: ["source_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      current_exchange_rates: {
        Row: {
          as_of: string | null
          quote_code: string | null
          rate_vs_mad: number | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_quote_code_fkey"
            columns: ["quote_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      supplier_products_wholesaler_read: {
        Row: {
          approval_status: string | null
          archived_at: string | null
          availability_type: string | null
          category: string | null
          created_at: string | null
          description: string | null
          export_countries: string[] | null
          id: string | null
          is_featured: boolean | null
          is_verified: boolean | null
          lead_time_days: number | null
          min_quantity: number | null
          niche: string | null
          origin_country: string | null
          photos: string[] | null
          product_name: string | null
          public_description: string | null
          public_name: string | null
          stock_quantity: number | null
          subcategory: string | null
          suggested_wholesale_price_mad: number | null
          supplier_type: string | null
          target_buyer_type: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          approval_status?: string | null
          archived_at?: string | null
          availability_type?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          export_countries?: string[] | null
          id?: string | null
          is_featured?: never
          is_verified?: never
          lead_time_days?: number | null
          min_quantity?: number | null
          niche?: string | null
          origin_country?: string | null
          photos?: string[] | null
          product_name?: string | null
          public_description?: string | null
          public_name?: string | null
          stock_quantity?: number | null
          subcategory?: string | null
          suggested_wholesale_price_mad?: number | null
          supplier_type?: string | null
          target_buyer_type?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_status?: string | null
          archived_at?: string | null
          availability_type?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          export_countries?: string[] | null
          id?: string | null
          is_featured?: never
          is_verified?: never
          lead_time_days?: number | null
          min_quantity?: number | null
          niche?: string | null
          origin_country?: string | null
          photos?: string[] | null
          product_name?: string | null
          public_description?: string | null
          public_name?: string | null
          stock_quantity?: number | null
          subcategory?: string | null
          suggested_wholesale_price_mad?: number | null
          supplier_type?: string | null
          target_buyer_type?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      supplier_quote_requests_supplier_read: {
        Row: {
          created_at: string | null
          destination_city: string | null
          destination_country: string | null
          id: string | null
          quantity_requested: number | null
          status: string | null
          supplier_payout_amount_mad: number | null
          supplier_payout_status: string | null
          supplier_product_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          destination_city?: string | null
          destination_country?: string | null
          id?: string | null
          quantity_requested?: number | null
          status?: string | null
          supplier_payout_amount_mad?: number | null
          supplier_payout_status?: string | null
          supplier_product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          destination_city?: string | null
          destination_country?: string | null
          id?: string | null
          quantity_requested?: number | null
          status?: string | null
          supplier_payout_amount_mad?: number | null
          supplier_payout_status?: string | null
          supplier_product_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_requests_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_requests_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      client_currency_for: { Args: { p_label: string }; Returns: string }
      create_payout: {
        Args: {
          p_affiliate_id: string
          p_idempotency_key: string
          p_notes?: string
          p_reference?: string
        }
        Returns: {
          affiliate_id: string
          amount: number
          created_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          paid_at: string | null
          reference: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "payouts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fx_rate_to_mad: { Args: { p_code: string }; Returns: number }
      get_orders_by_phone: {
        Args: { p_phone: string }
        Returns: {
          cancelled_at: string
          confirmed_at: string
          created_at: string
          customer_city: string
          customer_name: string
          delivered_at: string
          delivery_company: string
          id: string
          product_name: string
          quantity: number
          returned_at: string
          shipped_at: string
          status: string
          total_amount: number
          tracking_number: string
        }[]
      }
      get_supplier_plan: { Args: { p_supplier_id: string }; Returns: string }
      has_wholesale_buyer_access: { Args: never; Returns: boolean }
      my_role: { Args: never; Returns: string }
      reserve_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: boolean
      }
      resolve_country_code: { Args: { p_label: string }; Returns: string }
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
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

