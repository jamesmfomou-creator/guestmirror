export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; created_at: string };
        Insert: { id: string; email: string; created_at?: string };
        Update: Partial<{ id: string; email: string; created_at: string }>;
        Relationships: [];
      };
      analyses: {
        Row: {
          id: string;
          user_id: string | null;
          email: string | null;
          listing_url: string | null;
          city: string | null;
          property_type: string | null;
          guest_capacity: string | null;
          nightly_price: string | null;
          overall_score: number;
          result_json: unknown;
          is_unlocked: boolean;
          payment_status: string;
          previous_analysis_id: string | null;
          user_type: string | null;
          property_count_range: string | null;
          promo_code: string | null;
          attempt_id: string | null;
          goal: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email?: string | null;
          listing_url?: string | null;
          city?: string | null;
          property_type?: string | null;
          guest_capacity?: string | null;
          nightly_price?: string | null;
          overall_score: number;
          result_json: unknown;
          is_unlocked?: boolean;
          payment_status?: string;
          previous_analysis_id?: string | null;
          user_type?: string | null;
          property_count_range?: string | null;
          promo_code?: string | null;
          attempt_id?: string | null;
          goal?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["analyses"]["Insert"]>;
        Relationships: [];
      };
      analysis_images: {
        Row: { id: string; analysis_id: string; storage_path: string; position: number; created_at: string };
        Insert: { id?: string; analysis_id: string; storage_path: string; position?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["analysis_images"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string | null;
          analysis_id: string | null;
          stripe_session_id: string | null;
          stripe_payment_intent_id: string | null;
          amount: number | null;
          status: string;
          plan: string | null;
          stripe_price_id: string | null;
          refunded_at: string | null;
          disputed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          analysis_id?: string | null;
          stripe_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          amount?: number | null;
          status?: string;
          plan?: string | null;
          stripe_price_id?: string | null;
          refunded_at?: string | null;
          disputed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      analytics_events: {
        Row: {
          id: string;
          event_name: string;
          anonymous_id: string | null;
          user_id: string | null;
          analysis_id: string | null;
          email: string | null;
          session_id: string | null;
          source: string | null;
          metadata: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_name: string;
          anonymous_id?: string | null;
          user_id?: string | null;
          analysis_id?: string | null;
          email?: string | null;
          session_id?: string | null;
          source?: string | null;
          metadata?: unknown;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["analytics_events"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          email: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: string;
          subscription_plan: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string;
          subscription_plan?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      feedback: {
        Row: {
          id: string;
          analysis_id: string | null;
          email: string | null;
          feedback_rating: string | null;
          feedback_text: string | null;
          testimonial_text: string | null;
          testimonial_permission: boolean;
          plan: string | null;
          user_type: string | null;
          property_count_range: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          analysis_id?: string | null;
          email?: string | null;
          feedback_rating?: string | null;
          feedback_text?: string | null;
          testimonial_text?: string | null;
          testimonial_permission?: boolean;
          plan?: string | null;
          user_type?: string | null;
          property_count_range?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["feedback"]["Insert"]>;
        Relationships: [];
      };
      email_campaign_sends: {
        Row: {
          id: string;
          email: string;
          campaign_key: string;
          sent_at: string | null;
          delivered_at: string | null;
          opened_at: string | null;
          clicked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          campaign_key: string;
          sent_at?: string | null;
          delivered_at?: string | null;
          opened_at?: string | null;
          clicked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_campaign_sends"]["Insert"]>;
        Relationships: [];
      };
      // ---- Pricing v2 (supabase/migrations/0010_pricing_v2.sql) ----
      stripe_events: {
        Row: {
          id: string;
          type: string;
          livemode: boolean;
          stripe_created_at: string;
          received_at: string;
          processed_at: string | null;
          outcome: string | null;
        };
        Insert: {
          id: string;
          type: string;
          livemode: boolean;
          stripe_created_at: string;
          received_at?: string;
          processed_at?: string | null;
          outcome?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["stripe_events"]["Insert"]>;
        Relationships: [];
      };
      access_grants: {
        Row: {
          id: string;
          email: string;
          kind: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_price_id: string | null;
          quota_per_period: number | null;
          paid_period_start: string | null;
          paid_period_end: string | null;
          cancel_at_period_end: boolean;
          pending_unlock_analysis_id: string | null;
          status_event_at: string | null;
          revoked_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          kind: string;
          status: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_price_id?: string | null;
          quota_per_period?: number | null;
          paid_period_start?: string | null;
          paid_period_end?: string | null;
          cancel_at_period_end?: boolean;
          pending_unlock_analysis_id?: string | null;
          status_event_at?: string | null;
          revoked_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["access_grants"]["Insert"]>;
        Relationships: [];
      };
      credit_usages: {
        Row: { id: string; grant_id: string; analysis_id: string; period_start: string; created_at: string };
        Insert: { id?: string; grant_id: string; analysis_id: string; period_start: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["credit_usages"]["Insert"]>;
        Relationships: [];
      };
      email_verifications: {
        Row: {
          id: string;
          email: string;
          code_hash: string;
          expires_at: string;
          attempts: number;
          consumed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          code_hash: string;
          expires_at: string;
          attempts?: number;
          consumed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_verifications"]["Insert"]>;
        Relationships: [];
      };
      access_sessions: {
        Row: {
          id: string;
          token_hash: string;
          email: string;
          scope_checkout_session_id: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          token_hash: string;
          email: string;
          scope_checkout_session_id?: string | null;
          expires_at: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["access_sessions"]["Insert"]>;
        Relationships: [];
      };
      promo_codes: {
        Row: {
          id: string;
          code: string;
          label: string | null;
          max_free_unlocks: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          label?: string | null;
          max_free_unlocks?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["promo_codes"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // supabase/migrations/0010_pricing_v2.sql
      consume_grant_credit: {
        Args: { p_grant_id: string; p_analysis_id: string };
        Returns: { outcome: string; used: number; quota: number }[];
      };
    };
  };
}
