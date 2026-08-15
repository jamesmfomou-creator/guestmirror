"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { verdictFor } from "@/lib/utils";
import { BRAND_DOMAIN, BRAND_SLUG } from "@/lib/brand";

export function ShareCardVerdict({ score }: { score: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const verdict = verdictFor(score);

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true });
      const link = document.createElement("a");
      link.download = `${BRAND_SLUG}-test-5-secondes.png`;
      link.href = dataUrl;
      link.click();
      track("share_clicked", { variant: "five_second_test" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-5">
      <div
        ref={cardRef}
        className="flex aspect-[9/16] w-full max-w-[240px] flex-col justify-between rounded-[28px] p-6"
        style={{ background: "linear-gradient(160deg, #1c1a17 0%, #2b2620 100%)", color: "#faf8f5" }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
          Test des 5 secondes
        </span>
        <div className="text-center">
          <div className="text-6xl font-semibold tracking-tight">{score}</div>
          <div className="mt-1 text-sm text-white/60">/ 100</div>
          <div className="mt-5 text-2xl font-bold">
            {verdict.emoji} {verdict.short}
          </div>
        </div>
        <div className="text-center text-xs font-medium text-white/50">{BRAND_DOMAIN}</div>
      </div>
      <Button variant="outline" onClick={handleDownload} disabled={downloading}>
        <Download size={16} />
        {downloading ? "Génération…" : "Télécharger ce résultat"}
      </Button>
    </div>
  );
}
