/**
 * Version of the free result page, attached to every analytics event (like
 * pricing_version) so periods are never mixed:
 *   (none)      before 2026-11-19: the "Aha" A/B test (lib/ab.ts) chose
 *               between two free results -- historical data keeps ab_variant.
 *   reveal_v1   one free result for everyone: one real weakness revealed
 *               (lib/freeReveal.ts), the paid report's real contents, then
 *               the existing offers. The Aha test is closed on the result
 *               page (ab_variant still exists: it keeps driving the control
 *               loader of the loader experiment, unchanged).
 *   makeover_v1 reveal_v1 + the "Avant / Après" preview of the visitor's own
 *               listing (lib/listingMakeover.ts, components/result/
 *               ListingMakeover.tsx), for everyone, no experiment: compare
 *               makeover_v1 against reveal_v1 periods.
 *               Withdrawn 2026-11-26 (owner's request): back to reveal_v1,
 *               the same page as before 2026-11-25.
 */
export const RESULT_VERSION = "reveal_v1";

/**
 * Version of the whole journey (onboarding questions, loader messages, free
 * result framing), attached to every analytics event next to result_version:
 *   (none)          before 2026-11-19 ~02:30 UTC.
 *   goal_value_v1   goal question reworded (+ improve_photos), optional
 *                   "préoccupation" question on the same screen, explanatory
 *                   messages in the loaders, the free weakness tied to the
 *                   goal (lib/goalValue.ts). Compare before/after by this key.
 * Server-side events (Stripe webhook: payment_completed) do not carry it:
 * attribute them through analysis_id to the analysis' own events.
 */
export const JOURNEY_VERSION = "goal_value_v1";
