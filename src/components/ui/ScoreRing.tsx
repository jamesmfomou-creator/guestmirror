"use client";

import { useId } from "react";
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
  const filterId = useId();

  return (
    <div className="inline-flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Soft colored halo behind the ring -- the same glow language
            used elsewhere (hero, final CTA) -- plus a tinted track instead
            of flat grey, so the dial reads as a designed piece rather than
            a generic progress indicator. */}
        <div
          aria-hidden
          className="absolute inset-[-20%] rounded-full blur-xl"
          style={{ backgroundColor: color, opacity: 0.16 }}
        />
        <svg width={size} height={size} className="relative -rotate-90">
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor={color} floodOpacity="0.35" />
            </filter>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeOpacity={0.14}
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
            filter={`url(#${filterId})`}
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
