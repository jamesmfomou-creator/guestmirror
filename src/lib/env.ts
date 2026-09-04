export const DEMO_MODE = process.env.DEMO_MODE === "true" || !process.env.ANTHROPIC_API_KEY;

export const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const STRIPE_CONFIGURED = Boolean(
  process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_ONE_TIME &&
    process.env.STRIPE_PRICE_PLUS_MONTHLY
);

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
