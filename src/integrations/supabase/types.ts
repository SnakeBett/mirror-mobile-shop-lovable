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
      analytics_events: {
        Row: {
          click_id: string | null
          click_source: string | null
          created_at: string
          device_type: string | null
          event_name: string
          first_utm_campaign: string | null
          first_utm_medium: string | null
          first_utm_source: string | null
          id: string
          metadata: Json | null
          offer_id: string | null
          path: string | null
          product_id: string | null
          quantity: number | null
          quantity_offer_id: string | null
          recommended_product_id: string | null
          referrer: string | null
          session_id: string
          total_value: number | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          variant_ids: string[] | null
          visitor_id: string
        }
        Insert: {
          click_id?: string | null
          click_source?: string | null
          created_at?: string
          device_type?: string | null
          event_name: string
          first_utm_campaign?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          id?: string
          metadata?: Json | null
          offer_id?: string | null
          path?: string | null
          product_id?: string | null
          quantity?: number | null
          quantity_offer_id?: string | null
          recommended_product_id?: string | null
          referrer?: string | null
          session_id: string
          total_value?: number | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant_ids?: string[] | null
          visitor_id: string
        }
        Update: {
          click_id?: string | null
          click_source?: string | null
          created_at?: string
          device_type?: string | null
          event_name?: string
          first_utm_campaign?: string | null
          first_utm_medium?: string | null
          first_utm_source?: string | null
          id?: string
          metadata?: Json | null
          offer_id?: string | null
          path?: string | null
          product_id?: string | null
          quantity?: number | null
          quantity_offer_id?: string | null
          recommended_product_id?: string | null
          referrer?: string | null
          session_id?: string
          total_value?: number | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant_ids?: string[] | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "product_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_recommended_product_id_fkey"
            columns: ["recommended_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          currency: string
          ga_measurement_id: string | null
          id: string
          meta_pixel_id: string | null
          singleton: boolean
          tiktok_pixel_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          ga_measurement_id?: string | null
          id?: string
          meta_pixel_id?: string | null
          singleton?: boolean
          tiktok_pixel_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          ga_measurement_id?: string | null
          id?: string
          meta_pixel_id?: string | null
          singleton?: boolean
          tiktok_pixel_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_event_log: {
        Row: {
          attempts: number
          capi_status: string
          created_at: string
          error_message: string | null
          event_id: string
          event_name: string
          event_source_url: string | null
          http_status: number | null
          id: string
          order_id: string | null
          pixel_sent: boolean
          product_id: string | null
          test_event: boolean
        }
        Insert: {
          attempts?: number
          capi_status?: string
          created_at?: string
          error_message?: string | null
          event_id: string
          event_name: string
          event_source_url?: string | null
          http_status?: number | null
          id?: string
          order_id?: string | null
          pixel_sent?: boolean
          product_id?: string | null
          test_event?: boolean
        }
        Update: {
          attempts?: number
          capi_status?: string
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_name?: string
          event_source_url?: string | null
          http_status?: number | null
          id?: string
          order_id?: string | null
          pixel_sent?: boolean
          product_id?: string | null
          test_event?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "meta_event_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_event_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          client_user_agent: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          external_order_id: string
          fbc: string | null
          fbp: string | null
          first_utm_campaign: string | null
          first_utm_source: string | null
          id: string
          is_test: boolean
          meta_purchase_event_id: string | null
          meta_purchase_sent_at: string | null
          metadata: Json | null
          paid_at: string | null
          payment_method: string | null
          product_id: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          amount?: number
          client_user_agent?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          external_order_id: string
          fbc?: string | null
          fbp?: string | null
          first_utm_campaign?: string | null
          first_utm_source?: string | null
          id?: string
          is_test?: boolean
          meta_purchase_event_id?: string | null
          meta_purchase_sent_at?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          product_id?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          amount?: number
          client_user_agent?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          external_order_id?: string
          fbc?: string | null
          fbp?: string | null
          first_utm_campaign?: string | null
          first_utm_source?: string | null
          id?: string
          is_test?: boolean
          meta_purchase_event_id?: string | null
          meta_purchase_sent_at?: string | null
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          product_id?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          external_event_id: string | null
          external_order_id: string | null
          external_transaction_id: string | null
          gateway: string
          headers_safe: Json
          http_method: string
          id: string
          normalized_status: string | null
          original_status: string | null
          payload: Json | null
          processed_at: string | null
          processing_status: string
          received_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          external_event_id?: string | null
          external_order_id?: string | null
          external_transaction_id?: string | null
          gateway?: string
          headers_safe?: Json
          http_method?: string
          id?: string
          normalized_status?: string | null
          original_status?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          external_event_id?: string | null
          external_order_id?: string | null
          external_transaction_id?: string | null
          gateway?: string
          headers_safe?: Json
          http_method?: string
          id?: string
          normalized_status?: string | null
          original_status?: string | null
          payload?: Json | null
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_attribute_values: {
        Row: {
          attribute_id: string
          color_hex: string | null
          created_at: string
          id: string
          image_url: string | null
          name: string
          product_id: string
          sort_order: number
        }
        Insert: {
          attribute_id: string
          color_hex?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          attribute_id?: string
          color_hex?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          created_at: string
          display_type: string
          id: string
          name: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          display_type?: string
          id?: string
          name?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          display_type?: string
          id?: string
          name?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_details: {
        Row: {
          created_at: string
          id: string
          label: string
          product_id: string
          sort_order: number
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          product_id: string
          sort_order?: number
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          product_id?: string
          sort_order?: number
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_details_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_highlights: {
        Row: {
          created_at: string
          id: string
          product_id: string
          sort_order: number
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_highlights_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_imports: {
        Row: {
          created_at: string
          error_detail: string | null
          external_product_id: string | null
          id: string
          import_method: string
          missing_fields: Json
          product_id: string | null
          source_platform: string
          source_url: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_detail?: string | null
          external_product_id?: string | null
          id?: string
          import_method?: string
          missing_fields?: Json
          product_id?: string | null
          source_platform?: string
          source_url: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_detail?: string | null
          external_product_id?: string | null
          id?: string
          import_method?: string
          missing_fields?: Json
          product_id?: string | null
          source_platform?: string
          source_url?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_imports_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offers: {
        Row: {
          button_action: string
          button_text: string | null
          button_url: string | null
          coupon_code: string | null
          created_at: string
          discount_type: string
          discount_value: number | null
          ends_at: string | null
          icon: string
          id: string
          is_active: boolean
          offer_type: string
          product_id: string
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          button_action?: string
          button_text?: string | null
          button_url?: string | null
          coupon_code?: string | null
          created_at?: string
          discount_type?: string
          discount_value?: number | null
          ends_at?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          offer_type?: string
          product_id: string
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          button_action?: string
          button_text?: string | null
          button_url?: string | null
          coupon_code?: string | null
          created_at?: string
          discount_type?: string
          discount_value?: number | null
          ends_at?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          offer_type?: string
          product_id?: string
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_page_settings: {
        Row: {
          bottom_bar_settings: Json
          color_settings: Json
          created_at: string
          field_visibility: Json
          gallery_settings: Json
          header_settings: Json
          id: string
          offer_banner_settings: Json
          offers_settings: Json
          product_id: string
          promotion_settings: Json
          protection_settings: Json
          recommendation_settings: Json
          review_settings: Json
          section_order: Json
          section_visibility: Json
          shipping_settings: Json
          tab_settings: Json
          text_settings: Json
          updated_at: string
          variant_settings: Json
        }
        Insert: {
          bottom_bar_settings?: Json
          color_settings?: Json
          created_at?: string
          field_visibility?: Json
          gallery_settings?: Json
          header_settings?: Json
          id?: string
          offer_banner_settings?: Json
          offers_settings?: Json
          product_id: string
          promotion_settings?: Json
          protection_settings?: Json
          recommendation_settings?: Json
          review_settings?: Json
          section_order?: Json
          section_visibility?: Json
          shipping_settings?: Json
          tab_settings?: Json
          text_settings?: Json
          updated_at?: string
          variant_settings?: Json
        }
        Update: {
          bottom_bar_settings?: Json
          color_settings?: Json
          created_at?: string
          field_visibility?: Json
          gallery_settings?: Json
          header_settings?: Json
          id?: string
          offer_banner_settings?: Json
          offers_settings?: Json
          product_id?: string
          promotion_settings?: Json
          protection_settings?: Json
          recommendation_settings?: Json
          review_settings?: Json
          section_order?: Json
          section_visibility?: Json
          shipping_settings?: Json
          tab_settings?: Json
          text_settings?: Json
          updated_at?: string
          variant_settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_page_settings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_quantity_offers: {
        Row: {
          badge: string | null
          checkout_url: string | null
          created_at: string
          helper_text: string | null
          id: string
          is_active: boolean
          is_popular: boolean
          manual_discount: number | null
          name: string
          old_price: number | null
          product_id: string
          quantity: number
          sort_order: number
          total_price: number
          updated_at: string
        }
        Insert: {
          badge?: string | null
          checkout_url?: string | null
          created_at?: string
          helper_text?: string | null
          id?: string
          is_active?: boolean
          is_popular?: boolean
          manual_discount?: number | null
          name?: string
          old_price?: number | null
          product_id: string
          quantity?: number
          sort_order?: number
          total_price?: number
          updated_at?: string
        }
        Update: {
          badge?: string | null
          checkout_url?: string | null
          created_at?: string
          helper_text?: string | null
          id?: string
          is_active?: boolean
          is_popular?: boolean
          manual_discount?: number | null
          name?: string
          old_price?: number | null
          product_id?: string
          quantity?: number
          sort_order?: number
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_quantity_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_recommendations: {
        Row: {
          created_at: string
          id: string
          product_id: string
          recommended_product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          recommended_product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          recommended_product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_recommendations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_recommendations_recommended_product_id_fkey"
            columns: ["recommended_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          checkout_url: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          old_price: number | null
          option_values: Json
          price: number | null
          product_id: string
          sku: string | null
          sort_order: number
          stock: number
          updated_at: string
          use_custom_checkout: boolean
        }
        Insert: {
          checkout_url?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          old_price?: number | null
          option_values?: Json
          price?: number | null
          product_id: string
          sku?: string | null
          sort_order?: number
          stock?: number
          updated_at?: string
          use_custom_checkout?: boolean
        }
        Update: {
          checkout_url?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          old_price?: number | null
          option_values?: Json
          price?: number | null
          product_id?: string
          sku?: string | null
          sort_order?: number
          stock?: number
          updated_at?: string
          use_custom_checkout?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          checkout_button_subtext: string | null
          checkout_button_text: string
          checkout_url: string | null
          closing_text: string | null
          created_at: string
          current_price: number
          custom_stats_enabled: boolean
          customer_protection_text: string | null
          description: string | null
          discount_percentage: number | null
          external_product_id: string | null
          five_star_count: number | null
          ga_measurement_id: string | null
          id: string
          import_method: string | null
          installment_note: string | null
          installment_text: string | null
          is_active: boolean
          meta_pixel_id: string | null
          name: string
          old_price: number | null
          rating: number | null
          review_count: number | null
          sales_count: string | null
          sales_count_display: string | null
          search_placeholder: string | null
          shipping_business_days: boolean
          shipping_discount_text: string | null
          shipping_fee: string | null
          shipping_max_days: number
          shipping_min_days: number
          shipping_promotion_text: string | null
          slug: string
          source_platform: string | null
          source_url: string | null
          subcategory_id: string | null
          tiktok_pixel_id: string | null
          tracking_use_global: boolean
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          checkout_button_subtext?: string | null
          checkout_button_text?: string
          checkout_url?: string | null
          closing_text?: string | null
          created_at?: string
          current_price?: number
          custom_stats_enabled?: boolean
          customer_protection_text?: string | null
          description?: string | null
          discount_percentage?: number | null
          external_product_id?: string | null
          five_star_count?: number | null
          ga_measurement_id?: string | null
          id?: string
          import_method?: string | null
          installment_note?: string | null
          installment_text?: string | null
          is_active?: boolean
          meta_pixel_id?: string | null
          name: string
          old_price?: number | null
          rating?: number | null
          review_count?: number | null
          sales_count?: string | null
          sales_count_display?: string | null
          search_placeholder?: string | null
          shipping_business_days?: boolean
          shipping_discount_text?: string | null
          shipping_fee?: string | null
          shipping_max_days?: number
          shipping_min_days?: number
          shipping_promotion_text?: string | null
          slug: string
          source_platform?: string | null
          source_url?: string | null
          subcategory_id?: string | null
          tiktok_pixel_id?: string | null
          tracking_use_global?: boolean
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          checkout_button_subtext?: string | null
          checkout_button_text?: string
          checkout_url?: string | null
          closing_text?: string | null
          created_at?: string
          current_price?: number
          custom_stats_enabled?: boolean
          customer_protection_text?: string | null
          description?: string | null
          discount_percentage?: number | null
          external_product_id?: string | null
          five_star_count?: number | null
          ga_measurement_id?: string | null
          id?: string
          import_method?: string | null
          installment_note?: string | null
          installment_text?: string | null
          is_active?: boolean
          meta_pixel_id?: string | null
          name?: string
          old_price?: number | null
          rating?: number | null
          review_count?: number | null
          sales_count?: string | null
          sales_count_display?: string | null
          search_placeholder?: string | null
          shipping_business_days?: boolean
          shipping_discount_text?: string | null
          shipping_fee?: string | null
          shipping_max_days?: number
          shipping_min_days?: number
          shipping_promotion_text?: string | null
          slug?: string
          source_platform?: string | null
          source_url?: string | null
          subcategory_id?: string | null
          tiktok_pixel_id?: string | null
          tracking_use_global?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          sort_order: number
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id: string
          sort_order?: number
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          product_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          avatar_initial: string | null
          comment: string | null
          created_at: string
          customer_name: string
          id: string
          image_url: string | null
          is_active: boolean
          product_id: string
          rating: number
          sort_order: number
        }
        Insert: {
          avatar_initial?: string | null
          comment?: string | null
          created_at?: string
          customer_name: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          product_id: string
          rating?: number
          sort_order?: number
        }
        Update: {
          avatar_initial?: string | null
          comment?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          product_id?: string
          rating?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_settings: {
        Row: {
          created_at: string
          id: string
          meta_capi_token: string | null
          meta_enabled: boolean
          meta_graph_version: string
          meta_pixel_id: string | null
          meta_test_event_code: string | null
          singleton: boolean
          updated_at: string
          utmify_api_token: string | null
          utmify_checkout_params: Json
          utmify_enabled: boolean
          utmify_pixel_id: string | null
          utmify_pixel_script: string
          utmify_utm_script: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta_capi_token?: string | null
          meta_enabled?: boolean
          meta_graph_version?: string
          meta_pixel_id?: string | null
          meta_test_event_code?: string | null
          singleton?: boolean
          updated_at?: string
          utmify_api_token?: string | null
          utmify_checkout_params?: Json
          utmify_enabled?: boolean
          utmify_pixel_id?: string | null
          utmify_pixel_script?: string
          utmify_utm_script?: string
        }
        Update: {
          created_at?: string
          id?: string
          meta_capi_token?: string | null
          meta_enabled?: boolean
          meta_graph_version?: string
          meta_pixel_id?: string | null
          meta_test_event_code?: string | null
          singleton?: boolean
          updated_at?: string
          utmify_api_token?: string | null
          utmify_checkout_params?: Json
          utmify_enabled?: boolean
          utmify_pixel_id?: string | null
          utmify_pixel_script?: string
          utmify_utm_script?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_campaigns: {
        Args: { _from: string; _to: string }
        Returns: {
          campaign: string
          conversion: number
          orders_count: number
          revenue: number
          views: number
          visitors: number
        }[]
      }
      admin_funnel: {
        Args: { _from: string; _to: string }
        Returns: {
          buy_clicks: number
          checkouts: number
          product_views: number
          purchases: number
          revenue: number
          unique_visitors: number
        }[]
      }
      admin_product_conversion: {
        Args: { _from: string; _to: string }
        Returns: {
          buy_clicks: number
          checkouts: number
          conversion: number
          orders_count: number
          product_id: string
          product_name: string
          revenue: number
          slug: string
          views: number
          visitors: number
        }[]
      }
      admin_product_funnel: {
        Args: { _from: string; _product_id: string; _to: string }
        Returns: {
          buy_clicks: number
          checkouts: number
          orders_count: number
          rec_clicks: number
          rec_views: number
          revenue: number
          views: number
          visitors: number
        }[]
      }
      admin_product_performance: {
        Args: { _product_id: string }
        Returns: {
          orders_30d: number
          orders_7d: number
          orders_total: number
          revenue_30d: number
          revenue_7d: number
          revenue_total: number
        }[]
      }
      admin_product_sales_by_category: {
        Args: { _from: string; _to: string }
        Returns: {
          category_id: string
          orders_total: number
          product_id: string
          product_name: string
          refunded: number
          revenue: number
          sales: number
          slug: string
          subcategory_id: string
        }[]
      }
      admin_revenue_breakdown: {
        Args: { _from: string; _to: string }
        Returns: {
          cancelled_count: number
          gross: number
          net: number
          refunded: number
          refunded_count: number
        }[]
      }
      admin_sales_by_product: {
        Args: { _from: string; _to: string }
        Returns: {
          avg_ticket: number
          orders_count: number
          product_id: string
          product_name: string
          revenue: number
          slug: string
        }[]
      }
      admin_sales_daily: {
        Args: { _from: string; _to: string }
        Returns: {
          day: string
          orders_count: number
          revenue: number
        }[]
      }
      admin_sales_summary: {
        Args: { _from: string; _to: string }
        Returns: {
          avg_ticket: number
          orders_count: number
          revenue: number
          top_product_id: string
          top_product_name: string
        }[]
      }
      admin_traffic_daily: {
        Args: { _from: string; _to: string; _tz?: string }
        Returns: {
          buy_clicks: number
          checkouts: number
          day: string
          orders_count: number
          product_views: number
          revenue: number
          sessions: number
          visitors: number
        }[]
      }
      admin_traffic_sources: {
        Args: { _from: string; _product_id?: string; _to: string }
        Returns: {
          orders_count: number
          revenue: number
          source: string
          views: number
          visitors: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_product: { Args: { _product_id: string }; Returns: boolean }
      is_public_product_file: { Args: { _name: string }; Returns: boolean }
      public_best_sellers: {
        Args: { _limit?: number }
        Returns: {
          orders_count: number
          product_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      order_status: "pending" | "paid" | "cancelled" | "refunded"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      order_status: ["pending", "paid", "cancelled", "refunded"],
    },
  },
} as const
