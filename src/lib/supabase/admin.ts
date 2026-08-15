import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { Database } from "./database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdmin() {
  if (!SUPABASE_CONFIGURED) return null;
  if (!client) {
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
  }
  return client;
}
