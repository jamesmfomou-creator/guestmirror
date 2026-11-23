/** Asks the Paywall (revealOnRequest) to show the offers. detail: { handled: boolean } */
export const SHOW_OFFERS_EVENT = "gm:show-offers";

/**
 * Brings the visitor to the three existing offers (Paywall, #formules), none
 * preselected: no payment starts here, they choose and confirm there. The
 * Paywall keeps its offers hidden until asked (revealOnRequest) and scrolls
 * there itself; fallback when no Paywall listens (offers already visible).
 * Client only.
 */
export function showOffers(): void {
  const request = { handled: false };
  window.dispatchEvent(new CustomEvent(SHOW_OFFERS_EVENT, { detail: request }));
  if (request.handled) return;
  const offers = document.getElementById("formules") ?? document.getElementById("paywall");
  if (!offers) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  offers.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  // Keyboard and screen-reader users land on the offers too.
  offers.setAttribute("tabindex", "-1");
  offers.focus({ preventScroll: true });
}
