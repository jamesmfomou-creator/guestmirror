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

// Lifetime is intentionally NOT required for STRIPE_CONFIGURED above: the
// Price ID doesn't exist yet (see STRIPE_PRICE_LIFETIME in .env.example),
// and the rest of Stripe must keep working normally without it. The
// Lifetime offer simply stays hidden/disabled until this is set.
export const LIFETIME_CONFIGURED = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_LIFETIME);

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const EMAIL_CONFIGURED = Boolean(process.env.RESEND_API_KEY);
