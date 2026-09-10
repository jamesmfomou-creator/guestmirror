"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

// Variant B of the pre-paywall "Aha moment" A/B test (see lib/ab.ts).
// Deliberately a separate component from StepAnalyzing rather than a
// shared refactor: an A/B test's control arm (StepAnalyzing, variant A)
// must stay completely unmodified, so isolating variant B's timing state
// here means nothing about this file can ever regress variant A.
//
// Every stage label below is a generic topic name, never a real number --
// e.g. never "8 recommandations détectées", since the actual count isn't
// known until the backend responds. Purely anticipatory, not fabricated.
const STAGES = [
  { topic: "Photo de couverture", completionLabel: "Analyse terminée", atMs: 1200 },
  { topic: "Première impression", completionLabel: "Analyse terminée", atMs: 3200 },
  { topic: "Impact visuel", completionLabel: "Analyse terminée", atMs: 5200 },
  { topic: "Différenciation", completionLabel: "Analyse terminée", atMs: 7200 },
  { topic: "Points d'hésitation", completionLabel: "Détectés", atMs: 9200 },
  { topic: "Recommandations", completionLabel: "Préparées", atMs: 11_000 },
];
const FINALIZING_AT_MS = STAGES[STAGES.length - 1].atMs;
const REASSURANCE_AT_MS = 25_000;
const TRANSITION_MS = 1300;

export function AnalysisAhaFlow({
  done,
  onMount,
  onFinalizing,
  onTransitionEnd,
}: {
  done: boolean;
  /** Fires once on mount -- "the user is watching the enriched loader". */
  onMount?: () => void;
  /** Fires once when the loader enters the finalizing phase. */
  onFinalizing?: () => void;
  /** Fires once, TRANSITION_MS after `done` becomes true. */
  onTransitionEnd?: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const firedFinalizing = useRef(false);

  useEffect(() => {
    onMount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(t);
  }, []);

  const finalizing = !done && elapsed >= FINALIZING_AT_MS;

  useEffect(() => {
    if (finalizing && !firedFinalizing.current) {
      firedFinalizing.current = true;
      onFinalizing?.();
    }
  }, [finalizing, onFinalizing]);

  // Real completion, never the timer alone: only starts once the backend
  // has actually responded (`done`), then holds a short, fixed beat before
  // handing off to the caller's redirect.
  useEffect(() => {
    if (!done) return;
    setTransitioning(true);
    const t = setTimeout(() => onTransitionEnd?.(), TRANSITION_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const stageIndex = STAGES.reduce((acc, s, i) => (elapsed >= s.atMs ? i : acc), -1);
  const showReassurance = finalizing && elapsed >= REASSURANCE_AT_MS;

  if (transitioning) {
    return (
      <div className="animate-fade-up flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-score-high/10">
          <Check size={26} className="text-score-high" />
        </span>
        <p className="mt-5 text-xl font-semibold text-foreground">Ta première impression est prête.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
      <p className="max-w-xs text-lg font-medium text-foreground">
        Je regarde ton annonce comme un voyageur…
      </p>

      <div className="mt-8 w-full max-w-xs space-y-2.5">
        {STAGES.slice(0, stageIndex + 1).map((s) => (
          <div
            key={s.topic}
            className="animate-fade-up flex items-center justify-between gap-3 rounded-xl bg-background-alt px-4 py-2.5 text-left"
          >
            <span className="text-sm font-medium text-foreground">{s.topic}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-score-high">
              {s.completionLabel}
              <Check size={13} />
            </span>
          </div>
        ))}
      </div>

      {finalizing && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <Loader2 size={22} className="animate-spin text-accent" />
          <p className="text-sm text-muted">Finalisation de ton analyse…</p>
          {showReassurance && (
            <p className="animate-fade-up max-w-xs text-sm text-muted-2">
              Ton analyse prend un peu plus de temps que d&apos;habitude, mais elle est toujours
              en cours.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
