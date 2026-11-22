import { OFFERS, formatEur } from "@/lib/plans";

/**
 * Black Friday 2026 campaign (marketing only). One switch for everything:
 * the landing banner, the "Accès à vie" card highlight on the landing and
 * /pricing, and the countdown. Nothing here touches Stripe: the lifetime
 * price shown is always OFFERS.lifetime (the price really charged).
 *
 * Legal: 129 € is an ANNOUNCED FUTURE price, never shown as a former or
 * crossed-out price. The campaign hides itself automatically if the real
 * price is no longer below it (e.g. once the switch to 129 € is done).
 *
 * Turn off: `enabled: false` (components stay, nothing renders).
 */
export const BLACK_FRIDAY = {
  enabled: true,
  startsAt: "2026-11-22T00:00:00+01:00",
  /** Inclusive end: 30 November 2026, 23:59:59 Paris time. */
  endsAt: "2026-11-30T23:59:59+01:00",
  /** Announced price after the campaign (not charged anywhere yet). */
  futureLifetimePriceEur: 129,
} as const;

export const BLACK_FRIDAY_END_MS = Date.parse(BLACK_FRIDAY.endsAt);

export function blackFridayActive(now: number = Date.now()): boolean {
  return (
    BLACK_FRIDAY.enabled &&
    now >= Date.parse(BLACK_FRIDAY.startsAt) &&
    now <= BLACK_FRIDAY_END_MS &&
    OFFERS.lifetime.amountEur < BLACK_FRIDAY.futureLifetimePriceEur
  );
}

/** Current (charged) lifetime price, e.g. "89 €". */
export const LIFETIME_PRICE_LABEL = formatEur(OFFERS.lifetime.amountEur);
export const FUTURE_LIFETIME_PRICE_LABEL = formatEur(BLACK_FRIDAY.futureLifetimePriceEur);

/** Remaining time until the end, split for display; null once over. */
export function remaining(now: number = Date.now()): { d: number; h: number; m: number; s: number } | null {
  const ms = BLACK_FRIDAY_END_MS - now;
  if (ms <= 0) return null;
  const t = Math.floor(ms / 1000);
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
