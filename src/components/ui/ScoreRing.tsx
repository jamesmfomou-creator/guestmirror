"use client";

import { scoreColor, scoreLabel } from "@/lib/utils";

export function ScoreRing({
  score,
  size = 220,
  strokeWidth = 14,
  label,
  showLabel = true,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showLabel?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="inline-flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            className="animate-ring-draw"
            style={
              {
                "--ring-circumference": circumference,
                "--ring-offset": offset,
              } as React.CSSProperties
            }
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="animate-score-pop font-semibold tracking-tight text-foreground"
            style={{ fontSize: size * 0.32, lineHeight: 1 }}
          >
            {Math.round(score)}
          </span>
          <span className="text-sm font-medium text-muted">/ 100</span>
        </div>
      </div>
      {showLabel && (
        <span className="text-sm font-medium" style={{ color }}>
          {label ?? scoreLabel(score)}
        </span>
      )}
    </div>
  );
}
