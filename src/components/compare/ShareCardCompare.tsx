"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { verdictFor } from "@/lib/utils";
import { BRAND_DOMAIN, BRAND_SLUG } from "@/lib/brand";

export function ShareCardCompare({ scoreA, scoreB }: { scoreA: number; scoreB: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const verdictA = verdictFor(scoreA);
  const verdictB = verdictFor(scoreB);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${BRAND_SLUG}-comparaison.png`;
      link.href = dataUrl;
      link.click();
      track("share_clicked", { variant: "compare" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto mt-10 flex flex-col items-center gap-5">
      <div
        ref={cardRef}
        className="flex aspect-[9/16] w-full max-w-[240px] flex-col justify-between rounded-[28px] p-6"
        style={{ background: "linear-gradient(160deg, #1c1a17 0%, #2b2620 100%)", color: "#faf8f5" }}
      >
        <span className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
          Laquelle tu cliques ?
        </span>

        <div className="flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-semibold uppercase text-white/50">A</span>
            <span className="text-4xl font-bold">{scoreA}</span>
            <span className="text-xl">{verdictA.emoji}</span>
          </div>
          <span className="text-sm text-white/40">VS</span>
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs font-semibold uppercase text-white/50">B</span>
            <span className="text-4xl font-bold">{scoreB}</span>
            <span className="text-xl">{verdictB.emoji}</span>
          </div>
        </div>

        <div className="text-center text-xs font-medium text-white/50">{BRAND_DOMAIN}</div>
      </div>
      <Button variant="outline" onClick={handleDownload} disabled={downloading}>
        <Download size={16} />
        {downloading ? "Génération…" : "Télécharger la comparaison"}
      </Button>
    </div>
  );
}
