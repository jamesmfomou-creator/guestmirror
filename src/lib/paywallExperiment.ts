/**
 * Paywall presentation experiment, version 2 ("paywall_v2").
 *
 * A second, independent experiment next to the "Aha moment" A/B test
 * (lib/ab.ts). It has its own cookie and its own metadata key, so the
 * definition and the history of variants A and B stay exactly what they
 * were: a visitor is in A or B, and separately in "control" or "v2".
 *
 *   control  the locked result page as it was before this experiment.
 *   v2       the locked preview and the paywall headline are replaced by a
 *            summary built from this analysis' own results
 *            (lib/paywallPreview.ts), with a single primary action.
 *            Prices, plans and the checkout call are the same.
 *
 * To change what "v2" shows once it has traffic, add a new value (and keep
 * "v2" readable in the dashboard) instead of editing it in place.
 *
 * Changes during the experiment (compare periods on either side separately):
 *  - 2026-11-17 (goal personalisation): "control" no longer announces an
 *    inflated "N autres améliorations" figure nor a fixed list of sections;
 *    it shows the real weakness count and only the sections the report has
 *    (the same counting as v2). Control moved closer to v2 on that point.
 *    Both arms also gained the listing card (title, cover, goal) above the
 *    score. locked_preview_viewed now carries `weakness_count` in every arm;
 *    `count` is kept only in v2 (unchanged) and must not be compared across
 *    arms or periods.
 *
 * Rollback without a deploy revert: set PAYWALL_V2_SHARE to 0. Visitors
 * already assigned keep their cookie, so v2 must also stop rendering --
 * that is what isPaywallV2Active() is for.
 */

import { EXPERIMENT_FREEZE } from "@/lib/experimentFreeze";

export const PAYWALL_EXPERIMENT_ID = "paywall_v2";
export const PAYWALL_COOKIE_NAME = "gm_pw";
export const PAYWALL_VARIANTS = ["control", "v2"] as const;
export type PaywallVariant = (typeof PAYWALL_VARIANTS)[number];

/** Share of new visitors assigned to "v2" (0 = experiment off, everyone sees control). */
export const PAYWALL_V2_SHARE = 0.5;

export function isPaywallVariant(value: unknown): value is PaywallVariant {
  return value === "control" || value === "v2";
}

/** Draws a variant for a visitor who has none yet. `random` is injectable for tests. */
export function drawPaywallVariant(random: () => number = Math.random): PaywallVariant {
  return random() < PAYWALL_V2_SHARE ? "v2" : "control";
}

/** What a stored cookie value means today: anything unknown, or v2 while switched off, is control. */
export function resolvePaywallVariant(cookieValue: string | null | undefined): PaywallVariant {
  if (PAYWALL_V2_SHARE <= 0) return "control";
  return isPaywallVariant(cookieValue) ? cookieValue : "control";
}

/**
 * Client-side read. Unlike lib/ab.ts's getAbVariant(), this never assigns:
 * without a cookie the server rendered control, so the events must say
 * control too. proxy.ts is the only place a variant is drawn.
 */
export function getPaywallVariant(): PaywallVariant {
  if (EXPERIMENT_FREEZE.active) return EXPERIMENT_FREEZE.paywall; // lib/experimentFreeze.ts
  if (typeof document === "undefined") return "control";
  const match = document.cookie.match(new RegExp(`(?:^|; )${PAYWALL_COOKIE_NAME}=([^;]*)`));
  return resolvePaywallVariant(match ? decodeURIComponent(match[1]) : null);
}
