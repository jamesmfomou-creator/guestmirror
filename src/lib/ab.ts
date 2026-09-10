/**
 * Marketing A/B test assignment ("Aha moment" flow before the paywall).
 * Not to be confused with GuestMirror's product A/B compare mode
 * (src/components/compare) -- this is purely a growth experiment.
 *
 * Same storage pattern as anonymous_id/session_id in
 * lib/tracking/identity.ts: a value in localStorage, assigned once and
 * reused on every subsequent visit (localStorage has no expiry, so this
 * persists across sessions, not just within one).
 */

const AB_VARIANT_KEY = "gm_ab_variant";

export type AbVariant = "A" | "B";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode, quota) -- falls back to
    // re-rolling the variant every call, degrading gracefully rather
    // than throwing.
  }
}

/**
 * Reads the visitor's assigned variant, assigning one (50/50) on first
 * call and persisting it so it stays stable for this visitor. Server-side
 * (SSR) callers always get "A" -- there is no client-only rendering
 * branch gated on this in a server component, so that default is never
 * actually shown to a real user.
 */
export function getAbVariant(): AbVariant {
  if (typeof window === "undefined") return "A";

  const existing = safeGet(AB_VARIANT_KEY);
  if (existing === "A" || existing === "B") return existing;

  const variant: AbVariant = Math.random() < 0.5 ? "A" : "B";
  safeSet(AB_VARIANT_KEY, variant);
  return variant;
}
