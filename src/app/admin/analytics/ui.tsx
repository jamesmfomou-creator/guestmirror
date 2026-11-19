import type { ReactNode } from "react";

// Presentation primitives for the admin dashboard, in the landing's visual
// language (label-mono indices, display type, ink surface). Server components,
// no data logic here.

export const CHAPTERS = [
  { id: "revenus", label: "Revenus" },
  { id: "funnel", label: "Funnel" },
  { id: "analyses", label: "Analyses" },
  { id: "profils", label: "Profils" },
  { id: "tests", label: "Expériences" },
  { id: "offres", label: "Offres" },
  { id: "acquisition", label: "Acquisition" },
  { id: "utilisateurs", label: "Utilisateurs" },
] as const;

export type ChapterId = (typeof CHAPTERS)[number]["id"];

/** Numbered chapter opener, same rhythm as the landing's SectionHeading. */
export function Chapter({ id, title, description }: { id: ChapterId; title: ReactNode; description?: ReactNode }) {
  const index = String(CHAPTERS.findIndex((c) => c.id === id) + 1).padStart(2, "0");
  const label = CHAPTERS.find((c) => c.id === id)?.label;
  return (
    <div id={id} className="scroll-mt-40 border-t border-border pt-14 mt-20 first:mt-0">
      <div className="label-mono flex items-center gap-3 text-muted-2">
        <span className="text-accent">{index}</span>
        <span aria-hidden className="h-px w-8 bg-border" />
        <span>{label}</span>
      </div>
      <h2 className="text-display mt-4 text-balance text-[2rem] text-foreground sm:text-[2.6rem] [&_em]:text-accent">{title}</h2>
      {description && <p className="mt-3 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted">{description}</p>}
    </div>
  );
}

type Tone = "default" | "accent" | "good" | "bad";

const TONE_VALUE: Record<Tone, string> = {
  default: "text-foreground",
  accent: "text-accent",
  good: "text-score-high",
  bad: "text-score-low",
};

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: string | number; hint?: string; tone?: Tone }) {
  return (
    <div className="admin-kpi group relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className="label-mono text-[10px]! leading-snug tracking-[0.12em]! text-muted-2">{label}</p>
      <p className={`text-display mt-3 text-[1.45rem] leading-[1.1] tabular-nums [overflow-wrap:anywhere] sm:text-[1.9rem] ${TONE_VALUE[tone]}`}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-2">{hint}</p>}
    </div>
  );
}

/** Large headline figure for the ink hero. */
export function HeroStat({ label, value, hint, accent = false, size = "md" }: { label: string; value: string | number; hint?: string; accent?: boolean; size?: "md" | "lg" }) {
  return (
    <div className="h-full min-w-0 rounded-2xl border border-border bg-white/[0.03] p-4 sm:p-5">
      <p className="label-mono text-[10px]! tracking-[0.14em]! text-muted-2">{label}</p>
      <p
        className={`text-display mt-3 whitespace-nowrap tabular-nums ${size === "lg" ? "text-[2.1rem] min-[375px]:text-[2.4rem] sm:text-[3.4rem]" : "text-[1.9rem] sm:text-[2.3rem]"} ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-2">{hint}</p>}
    </div>
  );
}

/** Proportional bar for funnel-like rows. */
export function Bar({ ratio }: { ratio: number | null }) {
  const w = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));
  return (
    <div className="h-2 w-full min-w-[120px] overflow-hidden rounded-full bg-background-alt">
      <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#e8916d]" style={{ width: `${(w * 100).toFixed(1)}%` }} />
    </div>
  );
}
