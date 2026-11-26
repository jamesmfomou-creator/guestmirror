"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { ArrowRight, Check, CircleAlert, Lock } from "lucide-react";
import { scoreColor, verdictFor } from "@/lib/utils";

// Landing-page example of a GuestMirror report (ReportMockup). Everything
// here is fixed DEMONSTRATION content, independent of any real analysis: an
// illustrative listing whose best asset (the terrace) only appears as photo
// n°5, which is exactly what the "main problem" says. The cover is therefore
// a different photo (the living room, "Photo de couverture actuelle"), and the
// terrace is shown as the "Photo de couverture recommandée" inset, with an
// arrow and a check, so the recommendation reads without the text below.
//
// The reveal plays once, when the card scrolls into view (~3.5 s), and never
// holds anything back: with reduced motion everything is shown at once.

const DEMO_SCORE = 43;
const EASE = [0.22, 1, 0.36, 1] as const;

const LOCKED_PREVIEW = [
  "Quelle photo mettre en première",
  "L'ordre recommandé de tes premières photos",
  "3 propositions de titre",
];

export function ReportPreviewCard() {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const shown = reduced || inView;

  // Score counts up to the demo value once, after the photo has appeared.
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  useEffect(() => {
    if (!shown) return;
    if (reduced) {
      count.set(DEMO_SCORE);
      return;
    }
    const controls = animate(count, DEMO_SCORE, { duration: 1.1, delay: 0.7, ease: "easeOut" });
    return () => controls.stop();
  }, [shown, reduced, count]);

  // One helper for every step: fade + slight rise, at its own moment.
  const step = (delay: number, y = 10) => ({
    initial: { opacity: 0, y: reduced ? 0 : y },
    animate: shown ? { opacity: 1, y: 0 } : undefined,
    transition: { duration: reduced ? 0.01 : 0.5, delay: reduced ? 0 : delay, ease: EASE },
  });

  const color = scoreColor(DEMO_SCORE);
  const verdict = verdictFor(DEMO_SCORE).short;

  return (
    <div ref={ref} className="card overflow-hidden shadow-[0_32px_80px_-32px_rgba(28,26,23,0.3)]">
      {/* A. Photos: the cover, and photo n°5 (the terrace) as an inset. */}
      <motion.div className="relative aspect-[16/11] bg-background-alt sm:aspect-[16/9]" {...step(0, 0)}>
        <Image
          src="/demo/annonce-b.jpg"
          alt="Exemple d'annonce : photo de couverture, un salon lumineux avec vue sur la mer"
          fill
          sizes="(max-width: 672px) 100vw, 640px"
          className="object-cover"
        />
        <span className="absolute left-3 top-3 rounded-full bg-foreground/70 px-2.5 py-1 text-[11px] font-medium text-background backdrop-blur-sm">
          Photo de couverture actuelle
        </span>
        {/* The recommendation, at a glance: an arrow from the current cover to
            the recommended one (orange outline + check). */}
        <motion.div
          className="absolute right-3 bottom-3 w-[36%] max-w-[180px]"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
          animate={shown ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: reduced ? 0.01 : 0.5, delay: reduced ? 0 : 0.5, ease: EASE }}
        >
          <figure className="overflow-hidden rounded-[var(--radius-sm)] border-[3px] border-accent bg-accent shadow-[0_14px_34px_-10px_rgba(201,80,42,0.6)]">
            <div className="relative aspect-[4/5]">
              <Image
                src="/demo/annonce-a.jpg"
                alt="Exemple d'annonce : photo de couverture recommandée, la terrasse avec vue sur la mer"
                fill
                sizes="180px"
                className="object-cover"
              />
            </div>
            <figcaption className="px-1.5 py-1 text-center text-[10.5px] leading-tight font-semibold text-accent-foreground sm:text-[11px]">
              Photo de couverture recommandée
            </figcaption>
          </figure>
          {/* check badge on the corner */}
          <span
            aria-hidden
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_4px_10px_-2px_rgba(201,80,42,0.6)] ring-2 ring-card"
          >
            <Check size={13} strokeWidth={3} />
          </span>
          {/* arrow: current cover -> recommended cover */}
          <motion.span
            aria-hidden
            className="absolute top-[38%] -left-4 flex h-8 w-8 items-center justify-center rounded-full bg-card text-accent shadow-[0_6px_16px_-4px_rgba(28,26,23,0.45)] sm:-left-5 sm:h-9 sm:w-9"
            initial={{ opacity: 0, x: reduced ? 0 : -8 }}
            animate={shown ? { opacity: 1, x: 0 } : undefined}
            transition={{ duration: reduced ? 0.01 : 0.45, delay: reduced ? 0 : 0.85, ease: EASE }}
          >
            <ArrowRight size={17} strokeWidth={2.6} />
          </motion.span>
        </motion.div>
      </motion.div>

      <div className="p-5 sm:p-8">
        {/* B. Listing + compact score */}
        <motion.div className="flex items-center justify-between gap-4" {...step(0.6)}>
          <div className="min-w-0 text-left">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
              Exemple de diagnostic
            </span>
            <p className="mt-1 text-base font-semibold text-foreground sm:text-lg">Appartement avec terrasse</p>
          </div>
          <div
            className="shrink-0 rounded-xl bg-score-low/10 px-3.5 py-2 text-center"
            aria-label={`Score d'exemple : ${DEMO_SCORE} sur 100, ${verdict}`}
          >
            <p className="text-xl font-bold tabular-nums leading-none sm:text-2xl" style={{ color }} aria-hidden>
              <motion.span>{rounded}</motion.span>/100
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color }} aria-hidden>
              {verdict}
            </p>
          </div>
        </motion.div>

        <div className="mt-5 space-y-4 border-t border-border pt-5 text-left">
          {/* C. First impression */}
          <motion.div {...step(1.9)}>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
              Ce qui peut faire hésiter
            </span>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground sm:text-base">
              Le logement semble agréable, mais son principal atout n&apos;est pas immédiatement visible.
            </p>
          </motion.div>

          {/* D. Main problem */}
          <motion.div className="rounded-xl bg-score-low/10 p-4" {...step(2.5)}>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-score-low">
              <CircleAlert size={14} aria-hidden />
              Problème principal
            </span>
            <p className="mt-1.5 text-sm font-medium leading-snug text-foreground sm:text-base">
              Ta terrasse semble être ton meilleur atout, mais elle n&apos;apparaît qu&apos;en photo n°5.
            </p>
          </motion.div>

          {/* E. What the full report adds, without the answers */}
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {LOCKED_PREVIEW.map((item, i) => (
              <motion.div key={item} className="flex items-center gap-3 px-4 py-3" {...step(3.0 + i * 0.2, 6)}>
                <Lock size={14} className="shrink-0 text-muted-2" aria-hidden />
                <span className="text-sm text-muted">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
