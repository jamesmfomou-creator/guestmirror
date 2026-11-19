"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

// Journey goal_value_v1: while the analysis runs, what GuestMirror looks at
// and why it matters -- an explanation of the analysis' scope, NOT a progress
// report. Honesty rules:
//  - Never a check mark, a percentage or "terminé": the analysis is one
//    request with no intermediate progress (see AnalysisImmersive's steps,
//    which stay "en cours" until it really ends).
//  - No finding: nothing of this analysis is known yet.
//  - Purely informative: it never delays the result; the loader that shows
//    it disappears the moment the analysis is done.

export const VALUE_MESSAGES = [
  {
    title: "Première impression",
    text: "Nous examinons si ta présentation permet aux voyageurs de comprendre rapidement ce qui rend ton logement intéressant.",
  },
  { title: "Photos", text: "Nous regardons comment tes photos mettent en valeur les points forts de ton logement." },
  { title: "Titre et description", text: "Nous vérifions si tes textes rendent les atouts de ton annonce suffisamment clairs." },
  { title: "Points de friction", text: "Nous recherchons les éléments qui pourraient faire hésiter un voyageur." },
  {
    title: "Plan d'amélioration",
    text: "Ton rapport permettra de retrouver les corrections et les actions prioritaires identifiées.",
  },
] as const;

const ROTATE_MS = 6500;

export function AnalysisValueMessages({ className = "" }: { className?: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setIndex((i) => (i + 1) % VALUE_MESSAGES.length), ROTATE_MS);
    return () => window.clearInterval(t);
  }, []);

  const m = VALUE_MESSAGES[index];
  return (
    <section
      aria-label="Ce que GuestMirror examine dans ton annonce"
      className={`w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-card/80 px-4 py-4 text-left ${className}`}
    >
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-2">Ce que GuestMirror examine</p>
      {/* Fixed height for the longest message: no layout jump when it changes. */}
      <div className="mt-2 min-h-[5.5rem]">
        <p key={index} className={`${reduceMotion ? "" : "animate-fade-up"}`}>
          <span className="block text-[14.5px] font-semibold text-foreground">{m.title}</span>
          <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">{m.text}</span>
        </p>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {VALUE_MESSAGES.map((x, i) => (
          <span key={x.title} className={`h-1 w-4 rounded-full ${i === index ? "bg-accent" : "bg-foreground/10"}`} />
        ))}
      </div>
    </section>
  );
}
