"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

const MESSAGES = [
  "Analyse de ta première impression…",
  "Ce qu'un voyageur remarque en premier…",
  "Recherche de ton meilleur atout…",
  "Analyse des hésitations…",
  "Préparation de ton résultat…",
];

const STEP_DURATION = 650;

export function StepAnalyzing({ done }: { done: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= MESSAGES.length - 1) return;
    const t = setTimeout(() => setActiveIndex((i) => i + 1), STEP_DURATION);
    return () => clearTimeout(t);
  }, [activeIndex]);

  return (
    <div className="animate-fade-up flex min-h-[60vh] flex-col items-center justify-center px-5 text-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-border border-t-accent" />
      </div>
      <div className="mt-8 space-y-3">
        {MESSAGES.map((msg, i) => {
          if (i > activeIndex) return null;
          const isActive = i === activeIndex && !(done && i === MESSAGES.length - 1);
          const isFinished = i < activeIndex || (done && i === MESSAGES.length - 1);
          return (
            <p
              key={msg}
              className={`flex items-center justify-center gap-2 text-[15px] transition-opacity ${
                isActive ? "text-foreground" : "text-muted-2"
              }`}
            >
              {isFinished && <Check size={15} className="text-score-high" />}
              {msg}
            </p>
          );
        })}
      </div>
    </div>
  );
}
