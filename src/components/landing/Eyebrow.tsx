import { ReactNode } from "react";

// Small pill tag used above section headlines to give each section the
// same consistent "this is a real, structured SaaS" opening beat --
// reuses the colored-dot language already used for score/verdict chips
// elsewhere, instead of introducing a new icon per section.
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold tracking-wide text-accent shadow-[0_2px_8px_-4px_rgba(28,26,23,0.15)]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}
