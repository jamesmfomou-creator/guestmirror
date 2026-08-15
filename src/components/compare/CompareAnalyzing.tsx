"use client";

import { useEffect, useState } from "react";

const MESSAGES = [
  "Analyse des premières impressions…",
  "Analyse de l'impact visuel…",
  "Recherche de l'atout principal…",
  "Comparaison des deux annonces…",
  "Verdict…",
];

const STEP_DURATION = 520;

export function CompareAnalyzing({ imageA, imageB }: { imageA?: string; imageB?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= MESSAGES.length - 1) return;
    const t = setTimeout(() => setIndex((i) => i + 1), STEP_DURATION);
    return () => clearTimeout(t);
  }, [index]);

  return (
    <div className="animate-fade-up mx-auto max-w-[1050px] px-5 py-10 sm:py-14">
      <div className="relative mx-auto grid max-w-[900px] grid-cols-2 gap-3 sm:gap-6">
        {[imageA, imageB].map((src, i) => (
          <div key={i} className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-card">
            {src && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={src} alt="" className="h-full w-full object-cover opacity-60" />
            )}
          </div>
        ))}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-black/70 px-6 py-5 text-center backdrop-blur-sm">
            <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
            <p className="max-w-[220px] text-sm font-medium text-white">{MESSAGES[index]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
