"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { CircleAlert, Lock } from "lucide-react";
import { scoreColor, verdictFor } from "@/lib/utils";

// Landing-page example of a GuestMirror report (ReportMockup). Everything
// here is fixed DEMONSTRATION content, independent of any real analysis: an
// illustrative listing whose best asset (the terrace) only appears as photo
// n°5, which is exactly what the "main problem" says. The cover is therefore
// a different photo (the living room), with photo n°5 shown as an inset.
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
          Photo de couverture
        </span>
        <motion.figure
          className="absolute bottom-3 right-3 w-[30%] max-w-[150px] overflow-hidden rounded-[var(--radius-sm)] border-2 border-card shadow-[0_12px_30px_-10px_rgba(28,26,23,0.55)]"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
          animate={shown ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: reduced ? 0.01 : 0.5, delay: reduced ? 0 : 0.5, ease: EASE }}
        >
          <div className="relative aspect-[4/5]">
            <Image
              src="/demo/annonce-a.jpg"
              alt="Exemple d'annonce : photo n°5, la terrasse avec vue sur la mer"
              fill
              sizes="150px"
              className="object-cover"
            />
          </div>
          <figcaption className="bg-accent px-2 py-1 text-center text-[11px] font-semibold text-accent-foreground">
            Photo n°5
          </figcaption>
        </motion.figure>
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
