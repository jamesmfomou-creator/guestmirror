"use client";

import { ReactNode, useState } from "react";
import { Lock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

// Diagnostic simplification mission: one compact card replaces the former
// two-section layout (details + plan) and the separate free teaser
// (FirstHesitation/MainProblem/FreeRecommendation, variant A only now).
// The categories are the report sections that really exist in this analysis
// (lib/paywallPreview.ts lockedCategories) and the figure is the number of
// weaknesses it found -- never a sum of unrelated items. No blurred photo
// previews and no weakness names: only fixed labels and a count reach the
// browser.

// Owns the reveal state itself (merging what UnlockCtaGate used to do,
// now removed) since the button lives inside this same card -- `children`
// (the Paywall) renders unboxed, replacing the whole card, once clicked.
export function LockedPreviewB({
  analysisId,
  weaknessCount,
  categories,
  children,
}: {
  analysisId: string;
  weaknessCount: number;
  categories: string[];
  children: ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("locked_preview_viewed", { analysisId, count: weaknessCount });
  });

  if (revealed) return <>{children}</>;

  function handleUnlock() {
    track("unlock_cta_clicked", { analysisId });
    setRevealed(true);
  }

  return (
    <div ref={ref} className="card relative mx-auto mt-6 max-w-xl p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Ton diagnostic détaillé</h2>
        <Lock size={16} className="shrink-0 text-muted-2" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {categories.map((label) => (
          <div key={label} className="rounded-xl bg-background-alt p-4 text-center">
            <Lock size={16} className="mx-auto text-muted-2" />
            <span aria-hidden className="mt-3 block h-2 w-full rounded-full bg-border" />
            <p className="mt-3 text-xs font-medium text-foreground">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-base font-semibold text-foreground">
        {weaknessCount > 1
          ? `${weaknessCount} points faibles relevés sur ton annonce`
          : weaknessCount === 1
            ? "1 point faible relevé sur ton annonce"
            : "Des recommandations personnalisées sont disponibles pour ton annonce."}
      </p>
      <p className="mt-1 text-center text-sm text-muted">
        Débloque ton rapport pour découvrir les recommandations concrètes.
      </p>

      <Button size="lg" className="mt-5 w-full" onClick={handleUnlock}>
        Débloquer mon plan complet →
      </Button>

      <span
        aria-hidden
        className="absolute -bottom-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-foreground text-background shadow-sm"
      >
        <ChevronDown size={16} />
      </span>
    </div>
  );
}
