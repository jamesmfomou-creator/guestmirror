export const DEMO_MODE = process.env.DEMO_MODE === "true" || !process.env.ANTHROPIC_API_KEY;

export const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Stripe: only STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are read. Prices
// come from lib/plans.ts (pricing v2); the former STRIPE_PRICE_* variables
// are no longer used and can stay set without effect.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const EMAIL_CONFIGURED = Boolean(process.env.RESEND_API_KEY);
