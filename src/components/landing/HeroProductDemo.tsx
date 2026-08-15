"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ScoreRing } from "@/components/ui/ScoreRing";

const EASE = [0.22, 1, 0.36, 1] as const;

// Phase timeline (ms), replayed as a slow, subtle loop.
const T_LABEL = 500;
const T_SCORE = 1500;
const T_VERDICT = 3000;
const T_PROBLEM = 3900;
const T_HOLD = 7500;

export function HeroProductDemo() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced) {
      setPhase(4);
      return;
    }
    const timers = [
      setTimeout(() => setPhase(1), T_LABEL),
      setTimeout(() => setPhase(2), T_SCORE),
      setTimeout(() => setPhase(3), T_VERDICT),
      setTimeout(() => setPhase(4), T_PROBLEM),
      setTimeout(() => {
        setPhase(0);
        setCycle((c) => c + 1);
      }, T_HOLD),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced, cycle]);

  return (
    <div className="relative mx-auto w-full max-w-sm pt-5 pb-8 sm:pt-6 sm:pb-10">
      {/* depth: mini "problème principal" card, furthest back */}
      <div
        aria-hidden
        className="absolute right-0 bottom-0 hidden w-48 rotate-[4deg] rounded-2xl border border-border bg-card p-3.5 opacity-70 shadow-[0_12px_30px_-16px_rgba(28,26,23,0.25)] sm:block"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-score-low">
          🔴 Problème
        </span>
        <p className="mt-1 text-[11px] leading-snug text-muted">Ton meilleur atout est peu visible.</p>
      </div>

      {/* depth: mini listing card, mid layer */}
      <div
        aria-hidden
        className="absolute top-0 left-0 hidden w-28 -rotate-[6deg] overflow-hidden rounded-2xl border border-border bg-card opacity-80 shadow-[0_12px_30px_-16px_rgba(28,26,23,0.25)] sm:block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/annonce-a.jpg" alt="" className="h-20 w-full object-cover" />
      </div>

      {/* main card */}
      <div className="card relative z-10 overflow-hidden p-0 shadow-[0_24px_60px_-24px_rgba(28,26,23,0.28)]">
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/demo/annonce-a.jpg" alt="Exemple d'annonce" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/0 to-black/0" />
          <span className="absolute top-3 left-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white">
            Test des 5 secondes
          </span>
        </div>

        <div className="flex min-h-[168px] flex-col items-center justify-center gap-2 px-6 py-6 text-center">
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
                <ScoreRing key={`ring-${cycle}`} score={43} size={104} strokeWidth={8} showLabel={false} />
                <div className="flex h-6 items-center">
                  <AnimatePresence>
                    {phase >= 3 && (
                      <motion.span
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        className="rounded-full bg-background-alt px-3 py-1 text-xs font-semibold text-foreground"
                      >
                        🤔 J&apos;HÉSITE
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-1 h-11 w-full">
            <AnimatePresence>
              {phase >= 4 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="mx-auto flex max-w-[240px] items-center gap-2 rounded-xl bg-score-low/10 px-3 py-2 text-left"
                >
                  <span className="text-sm">🔴</span>
                  <p className="text-[11px] leading-snug text-foreground">
                    Ton meilleur atout n&apos;est pas visible immédiatement.
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
