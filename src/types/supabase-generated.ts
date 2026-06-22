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
          {
            foreignKeyName: "affiliate_clicks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public_read"
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
          {
            foreignKeyName: "affiliate_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public_read"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_countries: {
        Row: {
          agent_id: string
          country_code: string
          created_at: string
          id: string
        }
        Insert: {
          agent_id: string
          country_code: string
          created_at?: string
          id?: string
        }
        Update: {
          agent_id?: string
          country_code?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_countries_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_countries_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      agent_country_audit: {
        Row: {
          action: string
          agent_id: string
          changed_at: string
          changed_by: string | null
          country_code: string
          id: string
        }
        Insert: {
          action: string
          agent_id: string
          changed_at?: string
          changed_by?: string | null
          country_code: string
          id?: string
        }
        Update: {
          action?: string
          agent_id?: string
          changed_at?: string
          changed_by?: string | null
          country_code?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_country_audit_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_country_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          affiliate_allowed: boolean
          created_at: string
          icon: string | null
          id: string
          image_url: string | null
          label_ar: string
          label_en: string
          label_fr: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          affiliate_allowed?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          image_url?: string | null
          label_ar: string
          label_en: string
          label_fr: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          affiliate_allowed?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          image_url?: string | null
          label_ar?: string
          label_en?: string
          label_fr?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_channel_audit: {
        Row: {
          category_id: string
          category_slug: string
          changed_at: string
          changed_by: string | null
          id: string
          new_value: boolean
          old_value: boolean
        }
        Insert: {
          category_id: string
          category_slug: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value: boolean
          old_value: boolean
        }
        Update: {
          category_id?: string
          category_slug?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: boolean
          old_value?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "category_channel_audit_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_channel_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      category_suggestions: {
        Row: {
          created_at: string
          id: string
          proposed_label: string
          resolved_at: string | null
          resolved_by: string | null
          resulting_category_id: string | null
          source: string
          status: string
          supplier_product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposed_label: string
          resolved_at?: string | null
          resolved_by?: string | null
          resulting_category_id?: string | null
          source?: string
          status?: string
          supplier_product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proposed_label?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resulting_category_id?: string | null
          source?: string
          status?: string
          supplier_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_suggestions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_suggestions_resulting_category_id_fkey"
            columns: ["resulting_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_suggestions_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_suggestions_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
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
          amount_source: number | null
          commission_id: string | null
          created_at: string
          currency: string
          entry_type: string
          fx_rate_to_mad: number
          id: string
          idempotency_key: string
          metadata: Json
          order_id: string | null
          payout_id: string | null
        }
        Insert: {
          affiliate_id: string
          amount: number
          amount_source?: number | null
          commission_id?: string | null
          created_at?: string
          currency?: string
          entry_type: string
          fx_rate_to_mad?: number
          id?: string
          idempotency_key: string
          metadata?: Json
          order_id?: string | null
          payout_id?: string | null
        }
        Update: {
          affiliate_id?: string
          amount?: number
          amount_source?: number | null
          commission_id?: string | null
          created_at?: string
          currency?: string
          entry_type?: string
          fx_rate_to_mad?: number
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
            foreignKeyName: "ledger_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
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
      notifications: {
        Row: {
          channels: string[]
          created_at: string
          event: string
          id: string
          order_id: string | null
          payload: Json
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          event: string
          id?: string
          order_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          event?: string
          id?: string
          order_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_buyer_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_supplier_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "order_proofs_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products_public_read"
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
            foreignKeyName: "order_proofs_related_wholesale_order_id_fkey"
            columns: ["related_wholesale_order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_buyer_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_proofs_related_wholesale_order_id_fkey"
            columns: ["related_wholesale_order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_supplier_read"
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
          is_pre_confirmed: boolean
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
          is_pre_confirmed?: boolean
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
          is_pre_confirmed?: boolean
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
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public_read"
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
          pack_size: number | null
          pack_unit: string | null
          packaging_fee_mad: number
          platform_margin_type: string
          platform_margin_value: number | null
          purchase_currency: string
          purchase_price: number | null
          purchase_price_mad: number | null
          sale_unit: string | null
          sell_price: number
          source_notes: string | null
          source_supplier_product_id: string | null
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
          pack_size?: number | null
          pack_unit?: string | null
          packaging_fee_mad?: number
          platform_margin_type?: string
          platform_margin_value?: number | null
          purchase_currency?: string
          purchase_price?: number | null
          purchase_price_mad?: number | null
          sale_unit?: string | null
          sell_price: number
          source_notes?: string | null
          source_supplier_product_id?: string | null
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
          pack_size?: number | null
          pack_unit?: string | null
          packaging_fee_mad?: number
          platform_margin_type?: string
          platform_margin_value?: number | null
          purchase_currency?: string
          purchase_price?: number | null
          purchase_price_mad?: number | null
          sale_unit?: string | null
          sell_price?: number
          source_notes?: string | null
          source_supplier_product_id?: string | null
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
            foreignKeyName: "products_source_supplier_product_id_fkey"
            columns: ["source_supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_source_supplier_product_id_fkey"
            columns: ["source_supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
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
      products_sell_price_audit: {
        Row: {
          changed_at: string
          id: string
          new_sell_price: number | null
          old_sell_price: number | null
          product_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          id?: string
          new_sell_price?: number | null
          old_sell_price?: number | null
          product_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          id?: string
          new_sell_price?: number | null
          old_sell_price?: number | null
          product_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bank_account: string | null
          billing_address: string | null
          city: string | null
          company_name: string | null
          country_code: string | null
          country_setup_requested: boolean
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
          country_code?: string | null
          country_setup_requested?: boolean
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
          country_code?: string | null
          country_setup_requested?: boolean
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
        Relationships: [
          {
            foreignKeyName: "profiles_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
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
            foreignKeyName: "quote_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public_read"
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
          target_country_code: string | null
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
          target_country_code?: string | null
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
          target_country_code?: string | null
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
            foreignKeyName: "sourcing_requests_target_country_code_fkey"
            columns: ["target_country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
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
      staff_permission_audit: {
        Row: {
          action: string
          capability: string
          changed_at: string
          changed_by: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          capability: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          capability?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_permission_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_permission_audit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          capability: string
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          capability: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          capability?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_permissions_user_id_fkey"
            columns: ["user_id"]
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
          apply_platform_margin: boolean
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          availability_type: string
          category: string
          created_at: string
          description: string | null
          export_countries: string[]
          final_wholesale_price_mad: number | null
          fx_rate_source_to_mad: number | null
          id: string
          lead_time_days: number | null
          min_quantity: number
          moderation_flag: string | null
          moderation_reason: string | null
          moderation_signals: string[]
          niche: string
          origin_country: string
          pack_size: number | null
          pack_unit: string | null
          photos: string[]
          platform_margin_type: string
          platform_margin_value: number | null
          price_source: number | null
          product_name: string
          public_description: string | null
          public_name: string | null
          rejected_at: string | null
          source: string
          source_currency: string | null
          stock_quantity: number | null
          subcategory: string
          suggested_wholesale_price_mad: number | null
          supplier_id: string
          supplier_private_notes: string | null
          supplier_type: string
          supplier_unit_price_usd: number | null
          target_buyer_type: string
          telegram_message_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          ai_risk_score?: number | null
          apply_platform_margin?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          availability_type?: string
          category?: string
          created_at?: string
          description?: string | null
          export_countries?: string[]
          final_wholesale_price_mad?: number | null
          fx_rate_source_to_mad?: number | null
          id?: string
          lead_time_days?: number | null
          min_quantity?: number
          moderation_flag?: string | null
          moderation_reason?: string | null
          moderation_signals?: string[]
          niche?: string
          origin_country?: string
          pack_size?: number | null
          pack_unit?: string | null
          photos?: string[]
          platform_margin_type?: string
          platform_margin_value?: number | null
          price_source?: number | null
          product_name: string
          public_description?: string | null
          public_name?: string | null
          rejected_at?: string | null
          source?: string
          source_currency?: string | null
          stock_quantity?: number | null
          subcategory?: string
          suggested_wholesale_price_mad?: number | null
          supplier_id: string
          supplier_private_notes?: string | null
          supplier_type?: string
          supplier_unit_price_usd?: number | null
          target_buyer_type?: string
          telegram_message_id?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          ai_risk_score?: number | null
          apply_platform_margin?: boolean
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          availability_type?: string
          category?: string
          created_at?: string
          description?: string | null
          export_countries?: string[]
          final_wholesale_price_mad?: number | null
          fx_rate_source_to_mad?: number | null
          id?: string
          lead_time_days?: number | null
          min_quantity?: number
          moderation_flag?: string | null
          moderation_reason?: string | null
          moderation_signals?: string[]
          niche?: string
          origin_country?: string
          pack_size?: number | null
          pack_unit?: string | null
          photos?: string[]
          platform_margin_type?: string
          platform_margin_value?: number | null
          price_source?: number | null
          product_name?: string
          public_description?: string | null
          public_name?: string | null
          rejected_at?: string | null
          source?: string
          source_currency?: string | null
          stock_quantity?: number | null
          subcategory?: string
          suggested_wholesale_price_mad?: number | null
          supplier_id?: string
          supplier_private_notes?: string | null
          supplier_type?: string
          supplier_unit_price_usd?: number | null
          target_buyer_type?: string
          telegram_message_id?: string | null
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
            foreignKeyName: "supplier_products_source_currency_fkey"
            columns: ["source_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
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
          preferred_shipping_mode: string | null
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
          preferred_shipping_mode?: string | null
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
          preferred_shipping_mode?: string | null
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
      team_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          member_id: string
          owner_id: string
          permissions: Json
          team_role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          member_id: string
          owner_id: string
          permissions?: Json
          team_role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          member_id?: string
          owner_id?: string
          permissions?: Json
          team_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_inbound: {
        Row: {
          ai_extraction: Json | null
          caption: string | null
          created_at: string
          error: string | null
          id: string
          photo_file_id: string | null
          photo_storage_path: string | null
          processed_at: string | null
          status: string
          supplier_id: string | null
          supplier_product_id: string | null
          telegram_chat_id: number
          telegram_message_id: string
          telegram_user_id: number
        }
        Insert: {
          ai_extraction?: Json | null
          caption?: string | null
          created_at?: string
          error?: string | null
          id?: string
          photo_file_id?: string | null
          photo_storage_path?: string | null
          processed_at?: string | null
          status?: string
          supplier_id?: string | null
          supplier_product_id?: string | null
          telegram_chat_id: number
          telegram_message_id: string
          telegram_user_id: number
        }
        Update: {
          ai_extraction?: Json | null
          caption?: string | null
          created_at?: string
          error?: string | null
          id?: string
          photo_file_id?: string | null
          photo_storage_path?: string | null
          processed_at?: string | null
          status?: string
          supplier_id?: string | null
          supplier_product_id?: string | null
          telegram_chat_id?: number
          telegram_message_id?: string
          telegram_user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_inbound_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_inbound_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_inbound_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products_wholesaler_read"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_supplier_links: {
        Row: {
          created_at: string
          id: string
          link_code: string | null
          link_code_expires_at: string | null
          linked_at: string | null
          supplier_id: string
          telegram_user_id: number | null
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          link_code?: string | null
          link_code_expires_at?: string | null
          linked_at?: string | null
          supplier_id: string
          telegram_user_id?: number | null
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          link_code?: string | null
          link_code_expires_at?: string | null
          linked_at?: string | null
          supplier_id?: string
          telegram_user_id?: number | null
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_supplier_links_supplier_id_fkey"
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
          {
            foreignKeyName: "wholesale_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public_read"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_delivery_ledger: {
        Row: {
          amount_mad: number
          created_at: string
          created_by: string | null
          currency: string
          entry_type: string
          id: string
          idempotency_key: string
          wholesale_order_id: string
        }
        Insert: {
          amount_mad: number
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_type: string
          id?: string
          idempotency_key: string
          wholesale_order_id: string
        }
        Update: {
          amount_mad?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_type?: string
          id?: string
          idempotency_key?: string
          wholesale_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_delivery_ledger_wholesale_order_id_fkey"
            columns: ["wholesale_order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_delivery_ledger_wholesale_order_id_fkey"
            columns: ["wholesale_order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_buyer_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_delivery_ledger_wholesale_order_id_fkey"
            columns: ["wholesale_order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_supplier_read"
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
          {
            foreignKeyName: "wholesale_order_import_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_buyer_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_import_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_supplier_read"
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
            foreignKeyName: "wholesale_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_buyer_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_supplier_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public_read"
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
          {
            foreignKeyName: "wholesale_order_payment_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_buyer_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_payment_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_supplier_read"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_buyer_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_supplier_read"
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
          assigned_at: string | null
          blocked_at: string | null
          blocked_reason: string | null
          buyer_id: string
          buyer_notes: string | null
          cancelled_at: string | null
          city: string | null
          confirmed_at: string | null
          created_at: string
          delivered_at: string | null
          delivery_cost: number
          delivery_cost_handling: string | null
          delivery_cost_mad: number
          delivery_preference: string
          delivery_rebill_mad: number
          deposit_amount: number | null
          deposit_received_amount: number
          deposit_received_at: string | null
          deposit_requested_at: string | null
          due_at: string | null
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
          logistics_mode: string | null
          merchandise_source_amount: number | null
          payment_status: string
          quote_request_id: string | null
          shipped_at: string | null
          source_currency: string | null
          sourcing_at: string | null
          status: string
          supplier_assigned_at: string | null
          supplier_cost_mad: number
          supplier_id: string | null
          supplier_lead_time_days: number | null
          supplier_responded_at: string | null
          supplier_response: string | null
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
          assigned_at?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          buyer_id: string
          buyer_notes?: string | null
          cancelled_at?: string | null
          city?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_cost?: number
          delivery_cost_handling?: string | null
          delivery_cost_mad?: number
          delivery_preference: string
          delivery_rebill_mad?: number
          deposit_amount?: number | null
          deposit_received_amount?: number
          deposit_received_at?: string | null
          deposit_requested_at?: string | null
          due_at?: string | null
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
          logistics_mode?: string | null
          merchandise_source_amount?: number | null
          payment_status?: string
          quote_request_id?: string | null
          shipped_at?: string | null
          source_currency?: string | null
          sourcing_at?: string | null
          status?: string
          supplier_assigned_at?: string | null
          supplier_cost_mad?: number
          supplier_id?: string | null
          supplier_lead_time_days?: number | null
          supplier_responded_at?: string | null
          supplier_response?: string | null
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
          assigned_at?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          buyer_id?: string
          buyer_notes?: string | null
          cancelled_at?: string | null
          city?: string | null
          confirmed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_cost?: number
          delivery_cost_handling?: string | null
          delivery_cost_mad?: number
          delivery_preference?: string
          delivery_rebill_mad?: number
          deposit_amount?: number | null
          deposit_received_amount?: number
          deposit_received_at?: string | null
          deposit_requested_at?: string | null
          due_at?: string | null
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
          logistics_mode?: string | null
          merchandise_source_amount?: number | null
          payment_status?: string
          quote_request_id?: string | null
          shipped_at?: string | null
          source_currency?: string | null
          sourcing_at?: string | null
          status?: string
          supplier_assigned_at?: string | null
          supplier_cost_mad?: number
          supplier_id?: string | null
          supplier_lead_time_days?: number | null
          supplier_responded_at?: string | null
          supplier_response?: string | null
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
          {
            foreignKeyName: "wholesale_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      ledger_balances: {
        Row: {
          affiliate_id: string | null
          balance_mad: number | null
          balance_source: number | null
          currency: string | null
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
            foreignKeyName: "ledger_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      products_public_read: {
        Row: {
          affiliate_enabled: boolean | null
          availability_type: string | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string | null
          images: string[] | null
          media: Json | null
          name: string | null
          origin_country: string | null
          sell_price: number | null
          stock_count: number | null
          subcategory: string | null
          wholesale_min_qty: number | null
          wholesale_tiers: Json | null
        }
        Insert: {
          affiliate_enabled?: boolean | null
          availability_type?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          images?: string[] | null
          media?: Json | null
          name?: string | null
          origin_country?: string | null
          sell_price?: number | null
          stock_count?: number | null
          subcategory?: string | null
          wholesale_min_qty?: number | null
          wholesale_tiers?: Json | null
        }
        Update: {
          affiliate_enabled?: boolean | null
          availability_type?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          images?: string[] | null
          media?: Json | null
          name?: string | null
          origin_country?: string | null
          sell_price?: number | null
          stock_count?: number | null
          subcategory?: string | null
          wholesale_min_qty?: number | null
          wholesale_tiers?: Json | null
        }
        Relationships: []
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
          suggested_wholesale_price_mad?: never
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
          suggested_wholesale_price_mad?: never
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
      wholesale_catalog_read: {
        Row: {
          availability_type: string | null
          category: string | null
          created_at: string | null
          description: string | null
          from_price_mad: number | null
          id: string | null
          image: string | null
          is_featured: boolean | null
          is_verified: boolean | null
          min_qty: number | null
          name: string | null
          origin_country: string | null
          source: string | null
          stock: number | null
          subcategory: string | null
        }
        Relationships: []
      }
      wholesale_order_items_supplier_read: {
        Row: {
          id: string | null
          order_id: string | null
          product_id: string | null
          quantity: number | null
          tier_label_snapshot: string | null
        }
        Insert: {
          id?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number | null
          tier_label_snapshot?: string | null
        }
        Update: {
          id?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity?: number | null
          tier_label_snapshot?: string | null
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
            foreignKeyName: "wholesale_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_buyer_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "wholesale_orders_supplier_read"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public_read"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_orders_buyer_read: {
        Row: {
          address: string | null
          assigned_at: string | null
          blocked_at: string | null
          blocked_reason: string | null
          buyer_id: string | null
          buyer_notes: string | null
          cancelled_at: string | null
          city: string | null
          confirmed_at: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_cost: number | null
          delivery_cost_handling: string | null
          delivery_preference: string | null
          deposit_amount: number | null
          deposit_received_amount: number | null
          deposit_received_at: string | null
          deposit_requested_at: string | null
          due_at: string | null
          fully_paid_at: string | null
          fx_rate_source_to_mad: number | null
          id: string | null
          import_status: string | null
          invoice_billing_address: string | null
          invoice_company_name: string | null
          invoice_ice: string | null
          invoice_registre_commerce: string | null
          invoice_requested: boolean | null
          invoice_requested_at: string | null
          logistics_mode: string | null
          merchandise_source_amount: number | null
          payment_status: string | null
          quote_request_id: string | null
          shipped_at: string | null
          source_currency: string | null
          sourcing_at: string | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          assigned_at?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          buyer_id?: string | null
          buyer_notes?: string | null
          cancelled_at?: string | null
          city?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_cost?: number | null
          delivery_cost_handling?: string | null
          delivery_preference?: string | null
          deposit_amount?: number | null
          deposit_received_amount?: number | null
          deposit_received_at?: string | null
          deposit_requested_at?: string | null
          due_at?: string | null
          fully_paid_at?: string | null
          fx_rate_source_to_mad?: number | null
          id?: string | null
          import_status?: string | null
          invoice_billing_address?: string | null
          invoice_company_name?: string | null
          invoice_ice?: string | null
          invoice_registre_commerce?: string | null
          invoice_requested?: boolean | null
          invoice_requested_at?: string | null
          logistics_mode?: string | null
          merchandise_source_amount?: number | null
          payment_status?: string | null
          quote_request_id?: string | null
          shipped_at?: string | null
          source_currency?: string | null
          sourcing_at?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          assigned_at?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          buyer_id?: string | null
          buyer_notes?: string | null
          cancelled_at?: string | null
          city?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_cost?: number | null
          delivery_cost_handling?: string | null
          delivery_preference?: string | null
          deposit_amount?: number | null
          deposit_received_amount?: number | null
          deposit_received_at?: string | null
          deposit_requested_at?: string | null
          due_at?: string | null
          fully_paid_at?: string | null
          fx_rate_source_to_mad?: number | null
          id?: string | null
          import_status?: string | null
          invoice_billing_address?: string | null
          invoice_company_name?: string | null
          invoice_ice?: string | null
          invoice_registre_commerce?: string | null
          invoice_requested?: boolean | null
          invoice_requested_at?: string | null
          logistics_mode?: string | null
          merchandise_source_amount?: number | null
          payment_status?: string | null
          quote_request_id?: string | null
          shipped_at?: string | null
          source_currency?: string | null
          sourcing_at?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
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
      wholesale_orders_supplier_read: {
        Row: {
          city: string | null
          created_at: string | null
          due_at: string | null
          id: string | null
          status: string | null
          supplier_assigned_at: string | null
          supplier_lead_time_days: number | null
          supplier_responded_at: string | null
          supplier_response: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          due_at?: string | null
          id?: string | null
          status?: string | null
          supplier_assigned_at?: string | null
          supplier_lead_time_days?: number | null
          supplier_responded_at?: string | null
          supplier_response?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          due_at?: string | null
          id?: string | null
          status?: string | null
          supplier_assigned_at?: string | null
          supplier_lead_time_days?: number | null
          supplier_responded_at?: string | null
          supplier_response?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_wholesale_order_atomic: {
        Args: { p_assignee: string; p_notes?: string; p_order_id: string }
        Returns: undefined
      }
      can_assign_orders: { Args: { uid: string }; Returns: boolean }
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
      grant_staff_permission: {
        Args: { p_capability: string; p_user_id: string }
        Returns: undefined
      }
      has_capability: { Args: { p_capability: string }; Returns: boolean }
      has_wholesale_buyer_access: { Args: never; Returns: boolean }
      is_wholesale_delivery_undercollateralized: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      link_agent_country: {
        Args: { p_agent_id: string; p_country_code: string }
        Returns: undefined
      }
      list_agent_country_codes: {
        Args: never
        Returns: {
          country_code: string
        }[]
      }
      list_agent_sourcing_requests: {
        Args: never
        Returns: {
          category: string
          created_at: string
          delivery_deadline: string
          id: string
          notes: string
          product_name: string
          quantity: number
          status: string
          target_country_code: string
        }[]
      }
      list_pending_category_suggestions: {
        Args: never
        Returns: {
          created_at: string
          current_category: string
          current_subcategory: string
          product_name: string
          product_photo: string
          proposed_label: string
          suggestion_id: string
          supplier_product_id: string
        }[]
      }
      my_role: { Args: never; Returns: string }
      reserve_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: boolean
      }
      resolve_country_code: { Args: { p_label: string }; Returns: string }
      respond_to_wholesale_order: {
        Args: {
          p_lead_time_days: number
          p_order_id: string
          p_response: string
        }
        Returns: undefined
      }
      restore_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: undefined
      }
      revoke_staff_permission: {
        Args: { p_capability: string; p_user_id: string }
        Returns: undefined
      }
      set_category_affiliate_allowed: {
        Args: { p_allowed: boolean; p_category_id: string }
        Returns: undefined
      }
      set_wholesale_delivery_config: {
        Args: {
          p_cost_event_uuid: string
          p_cost_mad: number
          p_handling: string
          p_logistics_mode: string
          p_order_id: string
          p_rebill_mad: number
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      transition_wholesale_order_status: {
        Args: { p_new_status: string; p_notes?: string; p_order_id: string }
        Returns: undefined
      }
      try_collect_wholesale_delivery_rebill: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      unlink_agent_country: {
        Args: { p_agent_id: string; p_country_code: string }
        Returns: undefined
      }
      validator_create_category: {
        Args: {
          p_label_ar: string
          p_label_en: string
          p_label_fr: string
          p_parent_id?: string
          p_suggestion_id: string
        }
        Returns: string
      }
      validator_reject_suggestion: {
        Args: { p_suggestion_id: string }
        Returns: undefined
      }
      validator_resolve_suggestion: {
        Args: { p_category_id: string; p_suggestion_id: string }
        Returns: undefined
      }
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
