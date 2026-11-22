/**
 * Onboarding experiment, version 1 ("onboarding_bg_v1").
 *
 * A fourth, independent experiment next to the "Aha" A/B test (lib/ab.ts),
 * the paywall presentation (lib/paywallExperiment.ts) and the analysis
 * loader (lib/loaderExperiment.ts). Own cookie, own metadata key.
 *
 *   control     the onboarding as it was: import → profile → email → goal,
 *               then the analysis (unchanged code path).
 *   background  import → email (with the identified listing) → the analysis
 *               starts → goal and optional profile are asked while it runs
 *               → the visitor's loader if questions end first → result.
 *
 * While the share is 0 no cookie is assigned at all, so raising it later
 * draws every visitor who has not been assigned, and anyone holding a
 * "background" cookie is mapped back to control.
 *
 * Rollback without a deploy revert: set ONBOARDING_BACKGROUND_SHARE to 0.
 *
 * Testing in production while the share is 0: /analyze?ob=background (or
 * ?ob=control) sets the cookie for that browser only, and is honoured even
 * at share 0. Events then carry onboarding_variant like any other visitor's,
 * so testers should keep analytics blocked.
 */

import { EXPERIMENT_FREEZE } from "@/lib/experimentFreeze";

export const ONBOARDING_EXPERIMENT_ID = "onboarding_bg_v1";
export const ONBOARDING_COOKIE_NAME = "gm_ob";
export const ONBOARDING_VARIANTS = ["control", "background"] as const;
export type OnboardingVariant = (typeof ONBOARDING_VARIANTS)[number];

/**
 * Share of new visitors assigned to "background" (0 = experiment off).
 * History: 0 at launch (2026-11-18 10:50 UTC), 0.3 from 2026-11-18 (user
 * decision). Compare the arms from that date on only.
 */
export const ONBOARDING_BACKGROUND_SHARE = 0.3;

/** Cookie value set by the ?ob= override (honoured whatever the share). */
export const ONBOARDING_FORCED_VALUE = "background_forced";

export function isOnboardingCookieValue(value: unknown): boolean {
  return value === "control" || value === "background" || value === ONBOARDING_FORCED_VALUE;
}

/** Draws a variant for a visitor who has none yet. null = do not assign (experiment off). */
export function drawOnboardingVariant(random: () => number = Math.random, share = ONBOARDING_BACKGROUND_SHARE): OnboardingVariant | null {
  if (share <= 0) return null;
  return random() < share ? "background" : "control";
}

/** What a stored cookie value means today. */
export function resolveOnboardingVariant(
  cookieValue: string | null | undefined,
  share = ONBOARDING_BACKGROUND_SHARE
): OnboardingVariant {
  if (cookieValue === ONBOARDING_FORCED_VALUE) return "background";
  if (share <= 0) return "control";
  return cookieValue === "background" ? "background" : "control";
}

/** Client-side read; never assigns (proxy.ts does). */
export function getOnboardingVariant(): OnboardingVariant {
  if (typeof document === "undefined") return EXPERIMENT_FREEZE.active ? EXPERIMENT_FREEZE.onboarding : "control";
  const match = document.cookie.match(new RegExp(`(?:^|; )${ONBOARDING_COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  // Fixed configuration (lib/experimentFreeze.ts); the ?ob= QA override still wins.
  if (EXPERIMENT_FREEZE.active && value !== ONBOARDING_FORCED_VALUE) return EXPERIMENT_FREEZE.onboarding;
  return resolveOnboardingVariant(value);
}

/** The ?ob= override: the cookie value to set, or null. */
export function onboardingOverride(param: string | null): string | null {
  if (param === "background") return ONBOARDING_FORCED_VALUE;
  if (param === "control") return "control";
  return null;
}
