"use client";

import { Lock } from "lucide-react";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

// Control presentation of the locked report (paywall experiment "control",
// A/B variant A). Every figure and every line comes from what this analysis
// really holds (lib/paywallPreview.ts, the same counting as the "v2"
// presentation): the page never announces a section, a number of titles or
// a number of improvements the report does not contain. Only counts and
// fixed section names reach the browser -- no weakness name (that stays the
// v2 arm's difference) and no recommendation.
export function LockedTeaser({
  weaknessCount,
  contents,
  analysisId,
}: {
  weaknessCount: number;
  /** paywallPreviewContents(): one line per section that exists in this report. */
  contents: string[];
  analysisId?: string;
}) {
  const ref = useInViewOnce<HTMLDivElement>(() => {
    // `weakness_count` (since 2026-11-17), never `count`: historical `count`
    // values in this arm were a sum of priorities, weaknesses, titles, photos
    // and actions, so the new figure gets its own field instead of silently
    // changing the meaning of the old one.
    track("locked_preview_viewed", { analysisId, weakness_count: weaknessCount });
  });

  return (
    <div ref={ref} className="mx-auto mt-6 max-w-xl">
      <h2 className="text-center text-lg font-semibold">
        {weaknessCount > 1
          ? `J'ai relevé ${weaknessCount} points faibles sur ton annonce.`
          : weaknessCount === 1
            ? "J'ai relevé 1 point faible sur ton annonce."
            : "Ton rapport détaillé est prêt."}
      </h2>
      {contents.length > 0 && (
        <div className="card mt-4 divide-y divide-border overflow-hidden p-0">
          {contents.map((item) => (
            <div key={item} className="flex items-center gap-3 px-5 py-3.5">
              <Lock size={14} className="shrink-0 text-muted-2" />
              <span className="text-sm text-muted">{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
