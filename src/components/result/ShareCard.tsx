"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { AnalysisResult } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { verdictFor } from "@/lib/utils";
import { BRAND_DOMAIN, BRAND_NAME, BRAND_SLUG } from "@/lib/brand";
import { Section } from "./Section";

export function ShareCard({ result }: { result: AnalysisResult }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const verdict = verdictFor(result.overall_score);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${BRAND_SLUG}.png`;
      link.href = dataUrl;
      link.click();
      track("share_clicked");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Section title={`Partage ton ${BRAND_NAME}`}>
      <div className="flex flex-col items-center gap-6">
        <div
          ref={cardRef}
          className="flex aspect-[9/16] w-full max-w-[260px] flex-col justify-between rounded-[28px] p-7"
          style={{
            background: "linear-gradient(160deg, #1c1a17 0%, #2b2620 100%)",
            color: "#faf8f5",
          }}
        >
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
              {BRAND_NAME}
            </span>
          </div>

          <div className="text-center">
            <div className="text-7xl font-semibold tracking-tight">{result.overall_score}</div>
            <div className="mt-1 text-sm text-white/60">/ 100</div>
            <div className="mt-4 text-base font-medium">
              {verdict.emoji} {verdict.short}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl bg-white/10 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-white/70">Photo</span>
              <span className="font-semibold">{result.scores.cover_photo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70">Titre</span>
              <span className="font-semibold">{result.scores.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70">Description</span>
              <span className="font-semibold">{result.scores.description}</span>
            </div>
          </div>

          <div className="text-center text-xs font-medium text-white/50">{BRAND_DOMAIN}</div>
        </div>

        <Button variant="outline" onClick={handleDownload} disabled={downloading}>
          <Download size={16} />
          {downloading ? "Génération…" : `Télécharger mon ${BRAND_NAME}`}
        </Button>
      </div>
    </Section>
  );
}
