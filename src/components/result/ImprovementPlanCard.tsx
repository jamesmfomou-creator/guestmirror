"use client";

import { Check, Lock } from "lucide-react";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

/** Asks the Paywall (revealOnRequest) to show the offers. detail: { handled: boolean } */
export const SHOW_OFFERS_EVENT = "gm:show-offers";

// "Ton plan d'amélioration": what the paid report contains for THIS listing,
// every line and figure computed by buildFreeReveal() from the report itself
// (never a fixed list, never an invented number). Receives only those
// strings and counts. The button does NOT start a payment and names no
// price: it brings the visitor to the three existing offers (Paywall,
// #formules), none preselected, where they choose and confirm before any
// checkout.

export function ImprovementPlanCard({
  analysisId,
  insightShown,
  weaknessCount,
  reportHighlights,
  reportMore,
  showOffersButton = true,
}: {
  analysisId: string;
  insightShown: boolean;
  weaknessCount: number;
  /** buildFreeReveal().reportHighlights / reportMore: real sections and counts only. */
  reportHighlights: string[];
  reportMore: string[];
  /** false when a Conciergerie credit unlocks the report instead (no paywall on the page). */
  showOffersButton?: boolean;
}) {
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("locked_preview_viewed", { analysisId, weakness_count: weaknessCount, presentation: "plan_card" });
  });

  function showOffers() {
    track("unlock_cta_clicked", { analysisId, source: "plan_card" });
    // The Paywall keeps its offers hidden until this click (revealOnRequest):
    // it reveals them and scrolls there itself. Fallback below if no Paywall
    // listens (offers already visible).
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

  return (
    <div ref={ref} className="card mx-auto mt-6 max-w-xl p-5 text-left sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Ton plan d&apos;amélioration</h2>
        <Lock aria-hidden size={16} className="shrink-0 text-muted-2" />
      </div>
      {insightShown && (
        <p className="mt-3 flex items-center gap-2 text-[13.5px] text-muted">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-score-high/15">
            <Check aria-hidden size={10} className="text-score-high" />
          </span>
          1 point expliqué gratuitement ci-dessus
        </p>
      )}
      {reportHighlights.length > 0 && (
        <>
          <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-muted-2">Dans ton rapport complet</p>
          <ul className="mt-2.5 space-y-2.5 text-[15px]">
            {reportHighlights.map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span className="text-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {reportMore.length > 0 && (
        <details className="group mt-3 text-[14px]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-accent-hover [&::-webkit-details-marker]:hidden">
            <span className="transition-transform group-open:rotate-90" aria-hidden>›</span>
            Voir tout le contenu du rapport
          </summary>
          <ul className="mt-2.5 space-y-2 pl-4 text-muted">
            {reportMore.map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-muted-2" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {showOffersButton && (
      <>
      <button
        type="button"
        onClick={showOffers}
        className="btn-sheen mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Débloquer mon plan d&apos;amélioration
      </button>
      <p className="mt-2.5 text-center text-[12.5px] text-muted-2">Tu choisis ta formule juste en dessous, avant tout paiement.</p>
      </>
      )}
    </div>
  );
}
