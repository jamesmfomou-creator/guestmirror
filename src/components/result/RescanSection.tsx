"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { AnalysisResult, FIVE_SECOND_LABELS, FiveSecondScores } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { track } from "@/lib/analytics";
import { verdictFor } from "@/lib/utils";
import { BRAND_NAME, BRAND_SLUG } from "@/lib/brand";
import { Section } from "./Section";

const HIGHLIGHT_KEYS: (keyof FiveSecondScores)[] = ["visual_impact", "differentiation", "clarity"];

export function BeforeAfter({ previous, current }: { previous: AnalysisResult; current: AnalysisResult }) {
  const before = previous.overall_score;
  const after = current.overall_score;
  const diff = after - before;
  const verdictBefore = verdictFor(before);
  const verdictAfter = verdictFor(after);
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${BRAND_SLUG}-avant-apres.png`;
      link.href = dataUrl;
      link.click();
      track("share_clicked", { variant: "before_after" });
    } finally {
      setDownloading(false);
    }
  }

  const changes = current.strengths.slice(0, 3);

  return (
    <div className="mx-auto mt-14 max-w-xl text-center">
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Avant / après</h2>

      <div ref={cardRef} className="mx-auto mt-8 max-w-md rounded-[28px] bg-card p-8">
        <div className="flex items-center justify-center gap-8 sm:gap-16">
          <div className="flex flex-col items-center">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-2">Avant</span>
            <ScoreRing score={before} size={140} strokeWidth={10} showLabel={false} />
            <span className="mt-2 text-sm font-semibold">
              {verdictBefore.emoji} {verdictBefore.short}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl text-muted-2">→</span>
            <span className="rounded-full bg-score-high/10 px-3 py-1 text-sm font-semibold text-score-high">
              🔥 {diff >= 0 ? "+" : ""}
              {diff} points
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-2">Après</span>
            <ScoreRing score={after} size={140} strokeWidth={10} showLabel={false} />
            <span className="mt-2 text-sm font-semibold">
              {verdictAfter.emoji} {verdictAfter.short}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-sm space-y-3 text-left">
        {HIGHLIGHT_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span className="text-muted">{FIVE_SECOND_LABELS[key]}</span>
            <span className="font-semibold text-foreground">
              {previous.five_second_scores[key]} → {current.five_second_scores[key]}
            </span>
          </div>
        ))}
      </div>

      {changes.length > 0 && (
        <div className="mx-auto mt-8 max-w-sm text-left">
          <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-2">
            Ce qui a changé
          </h3>
          <ul className="mt-3 space-y-2">
            {changes.map((s) => (
              <li key={s.title} className="text-sm text-foreground">
                • {s.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mx-auto mt-6 max-w-md text-xs text-muted-2">
        L&apos;évolution correspond au score interne de l&apos;outil et ne garantit pas une
        augmentation des clics ou des réservations.
      </p>

      <Button variant="outline" className="mt-5" onClick={handleDownload} disabled={downloading}>
        <Download size={16} />
        {downloading ? "Génération…" : "Télécharger mon avant/après"}
      </Button>
    </div>
  );
}

export function RescanCTA({ analysisId }: { analysisId: string }) {
  return (
    <Section title="J'ai modifié mon annonce">
      <div className="card flex flex-col items-center gap-4 p-8 text-center">
        <p className="max-w-sm text-sm text-muted">
          Après avoir appliqué les recommandations, relance une analyse pour comparer ton nouveau
          {" "}{BRAND_NAME}.
        </p>
        <Button
          href={`/analyze?previous=${analysisId}`}
          size="lg"
          onClick={() => track("rescan_started", { analysisId })}
        >
          Refaire l&apos;analyse
        </Button>
      </div>
    </Section>
  );
}
