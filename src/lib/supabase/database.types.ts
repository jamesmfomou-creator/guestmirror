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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
