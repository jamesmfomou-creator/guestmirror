"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const STAGES = [
  { atMs: 0, message: "Analyse des premières impressions…" },
  { atMs: 2500, message: "Analyse de l'impact visuel…" },
  { atMs: 5000, message: "Recherche de l'atout principal…" },
  { atMs: 7500, message: "Comparaison des deux annonces…" },
];
const FINALIZING_AT_MS = 10_000;
const REASSURANCE_AT_MS = 25_000;

export function CompareAnalyzing({ imageA, imageB }: { imageA?: string; imageB?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(t);
  }, []);

  const finalizing = elapsed >= FINALIZING_AT_MS;
  const showReassurance = finalizing && elapsed >= REASSURANCE_AT_MS;
  const stageIndex = STAGES.reduce((acc, s, i) => (elapsed >= s.atMs ? i : acc), 0);
  const message = finalizing ? "Finalisation du verdict…" : STAGES[stageIndex].message;

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
            <Loader2 size={22} className="animate-spin text-white" />
            <p className="max-w-[220px] text-sm font-medium text-white">{message}</p>
            {showReassurance && (
              <p className="max-w-[220px] text-xs text-white/70">
                Ça prend un peu plus de temps que d&apos;habitude, mais c&apos;est toujours en
                cours.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
