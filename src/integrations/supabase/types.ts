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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      articles: {
        Row: {
          content: Json
          created_at: string
          extracted_keywords: Json | null
          id: string
          intent: string
          keyword: string
          recommended_topics: Json | null
          status: string | null
          title: string
          updated_at: string
          user_id: string
          website_url: string
        }
        Insert: {
          content: Json
          created_at?: string
          extracted_keywords?: Json | null
          id?: string
          intent: string
          keyword: string
          recommended_topics?: Json | null
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
          website_url: string
        }
        Update: {
          content?: Json
          created_at?: string
          extracted_keywords?: Json | null
          id?: string
          intent?: string
          keyword?: string
          recommended_topics?: Json | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          website_url?: string
        }
        Relationships: []
      }
      blog_analytics: {
        Row: {
          avg_time_on_page: number | null
          blog_id: string
          bounce_rate: number | null
          created_at: string
          date: string
          id: string
          page_views: number
          post_id: string | null
          unique_visitors: number
        }
        Insert: {
          avg_time_on_page?: number | null
          blog_id: string
          bounce_rate?: number | null
          created_at?: string
          date: string
          id?: string
          page_views?: number
          post_id?: string | null
          unique_visitors?: number
        }
        Update: {
          avg_time_on_page?: number | null
          blog_id?: string
          bounce_rate?: number | null
          created_at?: string
          date?: string
          id?: string
          page_views?: number
          post_id?: string | null
          unique_visitors?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_analytics_blog_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_analytics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          article_type: string | null
          blog_id: string
          content: string
          created_at: string
          excerpt: string | null
          external_post_id: string | null
          extracted_keywords: Json | null
          featured_image: string | null
          id: string
          last_published_at: string | null
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          publishing_status: string | null
          recommended_topics: Json | null
          scheduled_publish_date: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          article_type?: string | null
          blog_id: string
          content: string
          created_at?: string
          excerpt?: string | null
          external_post_id?: string | null
          extracted_keywords?: Json | null
          featured_image?: string | null
          id?: string
          last_published_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          publishing_status?: string | null
          recommended_topics?: Json | null
          scheduled_publish_date?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          article_type?: string | null
          blog_id?: string
          content?: string
          created_at?: string
          excerpt?: string | null
          external_post_id?: string | null
          extracted_keywords?: Json | null
          featured_image?: string | null
          id?: string
          last_published_at?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          publishing_status?: string | null
          recommended_topics?: Json | null
          scheduled_publish_date?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_blog_id_fkey"
            columns: ["blog_id"]
            isOneToOne: false
            referencedRelation: "blogs"
            referencedColumns: ["id"]
          },
        ]
      }
      blogs: {
        Row: {
          article_types: Json | null
          auto_post_enabled: boolean | null
          backlink_strategy: string | null
          cms_credentials: Json | null
          cms_platform: string | null
          cms_site_url: string | null
          company_description: string | null
          company_name: string | null
          competitors: Json | null
          created_at: string
          custom_domain: string | null
          description: string | null
          id: string
          industry: string | null
          is_published: boolean
          last_post_generated_at: string | null
          last_sync_at: string | null
          logo_url: string | null
          max_links_per_post: number | null
          mode: string
          onboarding_completed: boolean | null
          subdomain: string | null
          target_audience: string | null
          target_pages: Json | null
          theme: string | null
          title: string
          updated_at: string
          user_id: string
          website_cta: string | null
          website_homepage: string | null
        }
        Insert: {
          article_types?: Json | null
          auto_post_enabled?: boolean | null
          backlink_strategy?: string | null
          cms_credentials?: Json | null
          cms_platform?: string | null
          cms_site_url?: string | null
          company_description?: string | null
          company_name?: string | null
          competitors?: Json | null
          created_at?: string
          custom_domain?: string | null
          description?: string | null
          id?: string
          industry?: string | null
          is_published?: boolean
          last_post_generated_at?: string | null
          last_sync_at?: string | null
          logo_url?: string | null
          max_links_per_post?: number | null
          mode?: string
          onboarding_completed?: boolean | null
          subdomain?: string | null
          target_audience?: string | null
          target_pages?: Json | null
          theme?: string | null
          title: string
          updated_at?: string
          user_id: string
          website_cta?: string | null
          website_homepage?: string | null
        }
        Update: {
          article_types?: Json | null
          auto_post_enabled?: boolean | null
          backlink_strategy?: string | null
          cms_credentials?: Json | null
          cms_platform?: string | null
          cms_site_url?: string | null
          company_description?: string | null
          company_name?: string | null
          competitors?: Json | null
          created_at?: string
          custom_domain?: string | null
          description?: string | null
          id?: string
          industry?: string | null
          is_published?: boolean
          last_post_generated_at?: string | null
          last_sync_at?: string | null
          logo_url?: string | null
          max_links_per_post?: number | null
          mode?: string
          onboarding_completed?: boolean | null
          subdomain?: string | null
          target_audience?: string | null
          target_pages?: Json | null
          theme?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          website_cta?: string | null
          website_homepage?: string | null
        }
        Relationships: []
      }
      keywords: {
        Row: {
          competition: number | null
          cpc: number
          created_at: string
          difficulty: number | null
          id: string
          intent: string | null
          keyword: string
          language_code: string
          last_rank_check: string | null
          location_code: number
          ranking_position: number | null
          search_volume: number
          trend: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          competition?: number | null
          cpc?: number
          created_at?: string
          difficulty?: number | null
          id?: string
          intent?: string | null
          keyword: string
          language_code?: string
          last_rank_check?: string | null
          location_code?: number
          ranking_position?: number | null
          search_volume?: number
          trend?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          competition?: number | null
          cpc?: number
          created_at?: string
          difficulty?: number | null
          id?: string
          intent?: string | null
          keyword?: string
          language_code?: string
          last_rank_check?: string | null
          location_code?: number
          ranking_position?: number | null
          search_volume?: number
          trend?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          status: string
          plan_name: string
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          posts_generated_count: number | null
          keywords_count: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          status?: string
          plan_name?: string
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          posts_generated_count?: number | null
          keywords_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          status?: string
          plan_name?: string
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          posts_generated_count?: number | null
          keywords_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
