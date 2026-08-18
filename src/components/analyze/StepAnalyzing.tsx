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
const SOFT_CAP = 92;
const RING_SIZE = 96;
const STROKE_WIDTH = 7;

export function StepAnalyzing({ done }: { done: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (activeIndex >= MESSAGES.length - 1) return;
    const t = setTimeout(() => setActiveIndex((i) => i + 1), STEP_DURATION);
    return () => clearTimeout(t);
  }, [activeIndex]);

  useEffect(() => {
    const target = done ? 100 : SOFT_CAP;
    const rate = done ? 0.2 : 0.05;
    const interval = setInterval(() => {
      setProgress((p) => (Math.abs(target - p) < 0.3 ? target : p + (target - p) * rate));
    }, 50);
    return () => clearInterval(interval);
  }, [done]);

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
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {displayProgress}%
          </span>
        </div>
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
