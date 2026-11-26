"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Award, CalendarCheck, Clock, MoonStar, Sparkles, Tag, type LucideIcon } from "lucide-react";

// Floating benefit bubbles around the analysis loader's central card
// (AnalysisImmersive). Purely decorative reminders of what GuestMirror helps
// work towards -- optimisation goals, never a result, a promise or a step of
// this analysis (no check mark, nothing "terminé").
//
//  - One bubble at a time: visible ~3.8 s, then a 0.7 s gap (longer than its
//    exit) before the next one, so two never overlap.
//  - Different places: two fixed-height bands, just above and just below the
//    card, three horizontal slots each. Fixed height = no layout jump and
//    nothing existing is ever covered.
//  - Stops with the analysis: the caller renders it only while running; the
//    timers are cleared on unmount. No delay is added anywhere.
//  - Movement stays inside its band (52 px band, ~36 px bubble, 6 px travel).
//  - prefers-reduced-motion: fade only, no vertical movement.

export const BENEFITS: { text: string; icon: LucideIcon }[] = [
  { text: "Attire plus de réservations", icon: CalendarCheck },
  { text: "Réduis tes nuits vides", icon: MoonStar },
  { text: "Rends ton annonce plus attractive", icon: Sparkles },
  { text: "Gagne du temps", icon: Clock },
  { text: "Démarque-toi de tes concurrents", icon: Award },
  { text: "Optimise avant de baisser tes prix", icon: Tag },
];

type Band = "top" | "bottom";
type Slot = "start" | "center" | "end";
/** Where each successive bubble appears: alternating bands, moving slots. */
export const PLACES: { band: Band; slot: Slot }[] = [
  { band: "top", slot: "start" },
  { band: "bottom", slot: "end" },
  { band: "top", slot: "end" },
  { band: "bottom", slot: "start" },
  { band: "top", slot: "center" },
  { band: "bottom", slot: "center" },
  { band: "top", slot: "start" },
];

export const BUBBLE_CYCLE_MS = 4500;
export const BUBBLE_VISIBLE_MS = 3800;
const FIRST_DELAY_MS = 1200;

const SLOT_CLASS: Record<Slot, string> = { start: "justify-start", center: "justify-center", end: "justify-end" };

export function BenefitBubbles({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // show -> hide after BUBBLE_VISIBLE_MS -> next one at BUBBLE_CYCLE_MS.
    let timer: number;
    const show = (first: boolean) => {
      if (!first) setIndex((i) => i + 1);
      setVisible(true);
      timer = window.setTimeout(() => {
        setVisible(false);
        timer = window.setTimeout(() => show(false), BUBBLE_CYCLE_MS - BUBBLE_VISIBLE_MS);
      }, BUBBLE_VISIBLE_MS);
    };
    timer = window.setTimeout(() => show(true), FIRST_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const benefit = BENEFITS[index % BENEFITS.length];
  const place = PLACES[index % PLACES.length];

  const band = (b: Band) => (
    <div aria-hidden data-benefit-band={b} className={`pointer-events-none flex h-[52px] w-full items-center px-1 ${SLOT_CLASS[place.slot]}`}>
      <AnimatePresence>
        {visible && place.band === b && (
          <motion.div
            key={index}
            data-benefit-bubble
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: reduceMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
            transition={{ duration: reduceMotion ? 0.2 : 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex max-w-full items-center gap-2 rounded-full border border-accent/25 bg-card/95 py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium text-foreground shadow-[0_10px_26px_-14px_rgba(217,103,63,0.55)] backdrop-blur-sm"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-hover">
              <benefit.icon size={13} strokeWidth={2.2} />
            </span>
            <span className="truncate">{benefit.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <>
      {band("top")}
      {children}
      {band("bottom")}
    </>
  );
}
