"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ScoreRing } from "@/components/ui/ScoreRing";

const EASE = [0.22, 1, 0.36, 1] as const;

// Phase timeline (ms), replayed as a slow, subtle loop. Walks through the
// same structure a real report follows -- score, verdict, 5-second summary,
// then the specific problem -- so this reads as a realistic (if compact)
// preview of the product, not a generic animated placeholder.
const T_LABEL = 500;
const T_SCORE = 1500;
const T_VERDICT = 2600;
const T_SUMMARY = 3700;
const T_PROBLEM = 5100;
const T_HOLD = 9000;

export function HeroProductDemo() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced) {
      setPhase(5);
      return;
    }
    const timers = [
      setTimeout(() => setPhase(1), T_LABEL),
      setTimeout(() => setPhase(2), T_SCORE),
      setTimeout(() => setPhase(3), T_VERDICT),
      setTimeout(() => setPhase(4), T_SUMMARY),
      setTimeout(() => setPhase(5), T_PROBLEM),
      setTimeout(() => {
        setPhase(0);
        setCycle((c) => c + 1);
      }, T_HOLD),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced, cycle]);

  return (
    <div className="relative z-0 mx-auto w-full max-w-md pt-5 pb-8 sm:pt-6 sm:pb-10">
      {/* Soft depth glow behind the composition -- the same accent already
          used everywhere else (buttons, score chips), just diffused. Gives
          the mockup real presence without introducing a new color or any
          decorative element that isn't the product itself. */}
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -z-10 h-[105%] w-[105%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/18 blur-[80px]"
      />

      {/* depth: mini "problème principal" card, furthest back -- real
          report content (not decorative), just shown small and blurred by
          distance to build depth behind the main card. */}
      <div
        aria-hidden
        className="absolute right-0 bottom-2 hidden w-48 translate-x-4 rotate-[7deg] rounded-2xl border border-border bg-card p-3.5 opacity-90 shadow-[0_20px_48px_-18px_rgba(28,26,23,0.35)] sm:block"
      >
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-score-low">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-score-low" />
          Problème
        </span>
        <p className="mt-1 text-[11px] leading-snug text-muted">Ton meilleur atout est peu visible.</p>
      </div>

      {/* depth: mini listing card, mid layer */}
      <div
        aria-hidden
        className="absolute top-0 left-0 hidden w-28 -translate-x-4 -rotate-[9deg] overflow-hidden rounded-2xl border border-border bg-card opacity-90 shadow-[0_20px_48px_-18px_rgba(28,26,23,0.35)] sm:block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/annonce-a.jpg" alt="" className="h-20 w-full object-cover" />
      </div>

      {/* main card */}
      <div className="card relative z-10 overflow-hidden p-0 shadow-[0_32px_80px_-28px_rgba(28,26,23,0.35)]">
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo/annonce-a.jpg" alt="Exemple d'annonce" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/0" />
          <span className="absolute top-3 left-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white">
            Test des 5 secondes
          </span>
        </div>

        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-7 text-center">
          <AnimatePresence mode="wait">
            {phase === 0 && (
              <motion.span
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-xs font-medium text-muted-2"
              >
                &nbsp;
              </motion.span>
            )}
            {phase === 1 && (
              <motion.span
                key="label"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="text-xs font-medium text-muted-2"
              >
                Analyse de la première impression…
              </motion.span>
            )}
            {phase >= 2 && (
              <motion.div
                key={`score-${cycle}`}
                initial={{ opacity: 0, scale: reduced ? 1 : 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="flex flex-col items-center gap-2"
              >
                <ScoreRing key={`ring-${cycle}`} score={43} size={108} strokeWidth={8} showLabel={false} />
                <div className="flex h-6 items-center">
                  <AnimatePresence>
                    {phase >= 3 && (
                      <motion.span
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-background-alt px-3 py-1 text-xs font-semibold text-foreground"
                      >
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-score-mid" />
                        J&apos;HÉSITE
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-12 w-full">
            <AnimatePresence mode="wait">
              {phase === 4 && (
                <motion.p
                  key="summary"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="mx-auto max-w-[260px] text-[11px] leading-snug text-muted"
                >
                  Ton logement semble agréable, mais son meilleur atout n&apos;est pas visible
                  immédiatement.
                </motion.p>
              )}
              {phase >= 5 && (
                <motion.div
                  key="problem"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="mx-auto flex max-w-[260px] items-start gap-2 rounded-xl bg-score-low/10 px-3 py-2 text-left"
                >
                  <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-score-low" />
                  <p className="text-[11px] leading-snug text-foreground">
                    Ta terrasse semble être ton meilleur atout, mais elle n&apos;apparaît
                    qu&apos;en photo n°5.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
