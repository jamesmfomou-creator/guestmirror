"use client";

import { ReactNode, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared building blocks for the onboarding steps (/analyze, before the
// loader), in the landing page's visual language: bold display headings,
// mono labels, soft glass surfaces.

export function OnboardingHeading({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div>
      <h1 className="text-display text-balance text-[2.35rem] text-foreground sm:text-[3rem] [&_em]:text-accent">
        {title}
      </h1>
      {description && <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted">{description}</p>}
    </div>
  );
}

export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-border bg-card/80 p-5 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_24px_60px_-40px_rgba(21,18,14,0.35)] backdrop-blur sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

export function FieldLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="label-mono text-muted-2">{children}</p>
      {aside}
    </div>
  );
}

/** Selectable tile (single choice). Keeps the label as the accessible name. */
export function OptionTile({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-[15px] font-medium transition-all duration-300 active:scale-[0.99]",
        selected
          ? "border-foreground bg-foreground text-background shadow-[0_14px_30px_-18px_rgba(21,18,14,0.6)]"
          : "border-border bg-background/60 text-foreground hover:border-foreground/30 hover:bg-background",
        className
      )}
    >
      <span>{children}</span>
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
          selected ? "border-accent bg-accent text-white" : "border-border text-transparent group-hover:border-foreground/30"
        )}
      >
        <Check size={12} strokeWidth={3} />
      </span>
    </button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-2xl border border-score-low/20 bg-score-low/[0.07] px-4 py-3 text-sm text-score-low">
      {children}
    </p>
  );
}

/** Progress across the onboarding steps (shown above each step). */
const noopSubscribe = () => () => {};

export function OnboardingProgress({ steps, current }: { steps: string[]; current: number }) {
  // The step count depends on the A/B cookie, read client-side only: render
  // after hydration, with the same height reserved meanwhile.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!hydrated) return <div aria-hidden className="mb-10 h-[27px] sm:mb-12" />;
  return (
    <div className="mb-10 animate-fade-up sm:mb-12">
      <div className="label-mono flex items-center justify-between text-muted-2">
        <span>
          <span className="text-accent">{String(current + 1).padStart(2, "0")}</span>
          <span className="mx-1.5">/</span>
          {String(steps.length).padStart(2, "0")}
        </span>
        <span>{steps[current]}</span>
      </div>
      <div
        className="mt-3 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={current + 1}
        aria-label="Progression"
      >
        {steps.map((s, i) => (
          <span key={s} className="h-[3px] overflow-hidden rounded-full bg-foreground/10">
            <span
              className={cn(
                "block h-full rounded-full bg-accent transition-transform duration-700 ease-out origin-left",
                i <= current ? "scale-x-100" : "scale-x-0"
              )}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
