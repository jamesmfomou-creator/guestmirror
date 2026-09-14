"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { LoadingShowcase } from "./LoadingShowcase";

// Messages are staged on elapsed time, not on real backend state (the
// analysis is a single request with no incremental progress to report).
// Thresholds are tuned so all 4 stages play out in the first ~11s -- well
// before a typical analysis finishes -- then we hand off to a dedicated
// "finalizing" phase for however long the backend actually takes, instead
// of leaving a frozen percentage on screen.
const STAGES = [
  { atMs: 0, message: "Lecture de ton annonce…" },
  { atMs: 2500, message: "Analyse de ta première impression…" },
  { atMs: 5500, message: "Je cherche ce qui peut faire hésiter…" },
  { atMs: 8500, message: "Je prépare tes recommandations…" },
];
const FINALIZING_AT_MS = 11_000;
const REASSURANCE_AT_MS = 25_000;
const SOFT_CAP = 90;
const RING_SIZE = 96;
const STROKE_WIDTH = 7;

export function StepAnalyzing({
  done,
  onFinalizing,
}: {
  done: boolean;
  /** Fires once, the moment the loader enters the finalizing phase. */
  onFinalizing?: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const firedFinalizing = useRef(false);

  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(t);
  }, []);

  // Ring: quick at first, slows down, caps at SOFT_CAP until the backend
  // actually responds -- never fakes its way to 100%.
  useEffect(() => {
    const target = done ? 100 : SOFT_CAP;
    const rate = done ? 0.25 : 0.05;
    const interval = setInterval(() => {
      setProgress((p) => (Math.abs(target - p) < 0.3 ? target : p + (target - p) * rate));
    }, 50);
    return () => clearInterval(interval);
  }, [done]);

  const finalizing = !done && elapsed >= FINALIZING_AT_MS;

  useEffect(() => {
    if (finalizing && !firedFinalizing.current) {
      firedFinalizing.current = true;
      onFinalizing?.();
    }
  }, [finalizing, onFinalizing]);

  const stageIndex = STAGES.reduce((acc, s, i) => (elapsed >= s.atMs ? i : acc), 0);
  const showReassurance = finalizing && elapsed >= REASSURANCE_AT_MS;

  const displayProgress = Math.round(progress);
  const radius = (RING_SIZE - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayProgress / 100) * circumference;

  return (
    <div className="animate-fade-up flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
      <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={STROKE_WIDTH}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {finalizing ? (
            <Loader2 size={26} className="animate-spin text-accent" />
          ) : (
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {displayProgress}%
            </span>
          )}
        </div>
      </div>
      <div className="mt-8 space-y-3">
        {finalizing ? (
          <>
            <p className="text-[15px] text-foreground">Finalisation de ton analyse…</p>
            {showReassurance && (
              <p className="animate-fade-up max-w-xs text-sm text-muted-2">
                Ton analyse prend un peu plus de temps que d&apos;habitude, mais elle est
                toujours en cours.
              </p>
            )}
          </>
        ) : (
          STAGES.slice(0, stageIndex + 1).map((s, i) => {
            const isActive = i === stageIndex && !done;
            const isFinished = i < stageIndex || done;
            return (
              <p
                key={s.message}
                className={`flex items-center justify-center gap-2 text-[15px] transition-opacity ${
                  isActive ? "text-foreground" : "text-muted-2"
                }`}
              >
                {isFinished && <Check size={15} className="text-score-high" />}
                {s.message}
              </p>
            );
          })
        )}
      </div>
      <LoadingShowcase className="mt-10 w-full max-w-sm" />
    </div>
  );
}
