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
      orders: {
        Row: {
          amount: number
          created_at: string
          customer_email: string | null
          customer_name: string | null
          external_order_id: string
          id: string
          is_test: boolean
          metadata: Json | null
          paid_at: string | null
          payment_method: string | null
          product_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          external_order_id: string
          id?: string
          is_test?: boolean
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          product_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          external_order_id?: string
          id?: string
          is_test?: boolean
          metadata?: Json | null
          paid_at?: string | null
          payment_method?: string | null
          product_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
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
      product_page_settings: {
        Row: {
          bottom_bar_settings: Json
          color_settings: Json
          created_at: string
          field_visibility: Json
          gallery_settings: Json
          header_settings: Json
          id: string
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
        }
        Insert: {
          bottom_bar_settings?: Json
          color_settings?: Json
          created_at?: string
          field_visibility?: Json
          gallery_settings?: Json
          header_settings?: Json
          id?: string
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
        }
        Update: {
          bottom_bar_settings?: Json
          color_settings?: Json
          created_at?: string
          field_visibility?: Json
          gallery_settings?: Json
          header_settings?: Json
          id?: string
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
      products: {
        Row: {
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
          id: string
          import_method: string | null
          installment_note: string | null
          installment_text: string | null
          is_active: boolean
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
          updated_at: string
        }
        Insert: {
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
          id?: string
          import_method?: string | null
          installment_note?: string | null
          installment_text?: string | null
          is_active?: boolean
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
          updated_at?: string
        }
        Update: {
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
          id?: string
          import_method?: string | null
          installment_note?: string | null
          installment_text?: string | null
          is_active?: boolean
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
          updated_at?: string
        }
        Relationships: []
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
    Enums: {
      app_role: ["admin", "user"],
      order_status: ["pending", "paid", "cancelled", "refunded"],
    },
  },
} as const
