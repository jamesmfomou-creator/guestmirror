"use client";

import { scoreColor } from "@/lib/utils";

export function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = scoreColor(score);
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-sm text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-background-alt">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(4, score)}%`, background: color }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-sm font-semibold text-foreground">{score}</span>
    </div>
  );
}
