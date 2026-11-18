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
 */
export const RESULT_VERSION = "reveal_v1";
