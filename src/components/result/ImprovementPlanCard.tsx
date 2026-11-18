"use client";

import { Check, Lock } from "lucide-react";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

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
  reportContents,
  showOffersButton = true,
}: {
  analysisId: string;
  insightShown: boolean;
  weaknessCount: number;
  reportContents: string[];
  /** false when a Conciergerie credit unlocks the report instead (no paywall on the page). */
  showOffersButton?: boolean;
}) {
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("locked_preview_viewed", { analysisId, weakness_count: weaknessCount, presentation: "plan_card" });
  });

  function showOffers() {
    track("unlock_cta_clicked", { analysisId, source: "plan_card" });
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
      <ul className="mt-4 space-y-3 text-[15px]">
        {insightShown && (
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-score-high/15">
              <Check aria-hidden size={12} className="text-score-high" />
            </span>
            <span className="text-foreground">1 point expliqué gratuitement</span>
          </li>
        )}
        {reportContents.map((line) => (
          <li key={line} className="flex items-start gap-3">
            <Lock aria-hidden size={16} className="mt-0.5 shrink-0 text-muted-2" />
            <span className="text-foreground">{line}</span>
          </li>
        ))}
      </ul>
      {showOffersButton && (
      <>
      <button
        type="button"
        onClick={showOffers}
        className="btn-sheen mt-6 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Découvrir mes formules
      </button>
      <p className="mt-2.5 text-center text-[12.5px] text-muted-2">Tu choisis ta formule juste en dessous, avant tout paiement.</p>
      </>
      )}
    </div>
  );
}
