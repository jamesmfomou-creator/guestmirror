/**
 * Marketing A/B test assignment ("Aha moment" flow before the paywall).
 * Not to be confused with GuestMirror's product A/B compare mode
 * (src/components/compare) -- this is purely a growth experiment.
 *
 * Cookie-based (not localStorage like anonymous_id/session_id in
 * lib/tracking/identity.ts) because variant B now changes the actual
 * server-rendered structure of /result/[id] (image-forward header, locked
 * preview cards, CTA-gated paywall), not just client-side loader copy --
 * the server needs to read the same value the client does, from the very
 * first request, with no flash between an SSR default and a client
 * correction. proxy.ts assigns the cookie on first visit for any
 * non-admin/non-API page; this file just reads it.
 */

export const AB_COOKIE_NAME = "gm_ab";
export type AbVariant = "A" | "B";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Client-side read. In normal operation the cookie already exists (set by
 * proxy.ts before this page ever rendered), so this is just a parse. The
 * assign-and-persist fallback only matters if middleware didn't run for
 * some reason -- keeps the session internally consistent even then.
 */
export function getAbVariant(): AbVariant {
  if (typeof document === "undefined") return "A";

  const match = document.cookie.match(new RegExp(`(?:^|; )${AB_COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  if (value === "A" || value === "B") return value;

  const variant: AbVariant = Math.random() < 0.5 ? "A" : "B";
  try {
    document.cookie = `${AB_COOKIE_NAME}=${variant}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  } catch {
    // cookies unavailable -- degrades to re-rolling next call rather than throwing
  }
  return variant;
}
