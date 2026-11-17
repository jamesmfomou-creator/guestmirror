import type { EventRow } from "./analytics";
import { proportion, type Proportion } from "./paywallExperimentStats";

// Pure aggregation for the analysis loader experiment
// (lib/loaderExperiment.ts). Unit of count: the analysis ATTEMPT (attemptId),
// because the question is about one wait -- did it end with the visitor
// getting their result, or did they leave?
//
// Only attempts whose analysis_loader_viewed carries a loader_variant are
// counted; traffic from before the experiment has none. Attempts from the
// background onboarding (onboarding_variant "background") are left out: their
// loader appears only after the questions, for the rest of a wait that
// already started, which is not the wait this experiment compares.
//
// Abandonment is deliberately strict: an attempt counts as abandoned only if
// the page was left while it was still running (analysis_loader_abandoned)
// AND it never completed nor failed afterwards. Closing a tab and coming back
// to a recovered result is not an abandonment.

export type LoaderVariantKey = "control" | "immersive";

export interface LoaderCellStats {
  /** Attempts that reached the waiting screen. */
  attempts: number;
  completed: number;
  failed: number;
  abandoned: number;
  /** Neither completed, failed nor abandoned (still running, or lost without a trace). */
  unresolved: number;
  /** Immersive only: attempts where a real listing element was shown. */
  visualsStarted: number;
  /** Primary metric: attempts that reached a result. */
  completionRate: Proportion;
  abandonmentRate: Proportion;
  /** Median real processing time of completed, non-recovered attempts (seconds). */
  medianDurationS: number | null;
  /** Median time from the waiting screen to the first real listing element (seconds). */
  medianTimeToVisualS: number | null;
}

export type LoaderVerdict = "insufficient_data" | "inconclusive" | "difference";

export interface LoaderExperimentStats {
  control: LoaderCellStats;
  immersive: LoaderCellStats;
  verdict: LoaderVerdict;
  minAttempts: number;
}

export const MIN_LOADER_ATTEMPTS = 100;

function attemptIdOf(row: EventRow): string | null {
  const v = row.metadata?.attemptId;
  return typeof v === "string" && v ? v : null;
}

function num(row: EventRow, key: string): number | null {
  const v = row.metadata?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function cellStats(rows: EventRow[], variant: LoaderVariantKey): LoaderCellStats {
  // Attempts are assigned to the variant of their loader_viewed event; every
  // later outcome of the same attempt is then read whatever its own tag.
  const viewed = new Set<string>();
  for (const r of rows) {
    if (r.event_name !== "analysis_loader_viewed" || r.metadata?.loader_variant !== variant) continue;
    if (r.metadata?.onboarding_variant === "background") continue;
    const id = attemptIdOf(r);
    if (id) viewed.add(id);
  }

  const byEvent = (name: string) => {
    const out = new Map<string, EventRow>();
    for (const r of rows) {
      if (r.event_name !== name) continue;
      const id = attemptIdOf(r);
      if (id && viewed.has(id) && !out.has(id)) out.set(id, r);
    }
    return out;
  };

  const completed = byEvent("analysis_completed");
  const failedRaw = byEvent("analysis_failed");
  const abandonedRaw = byEvent("analysis_loader_abandoned");
  const visual = byEvent("analysis_visual_started");

  let failed = 0;
  let abandoned = 0;
  let unresolved = 0;
  for (const id of viewed) {
    if (completed.has(id)) continue;
    if (failedRaw.has(id)) failed++;
    else if (abandonedRaw.has(id)) abandoned++;
    else unresolved++;
  }

  const durations = [...completed.values()]
    .filter((r) => r.metadata?.recovered !== true && r.metadata?.progressive !== true)
    .map((r) => num(r, "duration_ms"))
    .filter((v): v is number => v !== null && v > 0)
    .map((ms) => ms / 1000);
  const toVisual = [...visual.values()]
    .map((r) => num(r, "ms_since_loader"))
    .filter((v): v is number => v !== null && v >= 0)
    .map((ms) => ms / 1000);

  return {
    attempts: viewed.size,
    completed: completed.size,
    failed,
    abandoned,
    unresolved,
    visualsStarted: visual.size,
    completionRate: proportion(completed.size, viewed.size),
    abandonmentRate: proportion(abandoned, viewed.size),
    medianDurationS: median(durations),
    medianTimeToVisualS: median(toVisual),
  };
}

export function loaderVerdict(control: Proportion, immersive: Proportion, minTrials = MIN_LOADER_ATTEMPTS): LoaderVerdict {
  if (control.trials < minTrials || immersive.trials < minTrials) return "insufficient_data";
  if (control.low === null || control.high === null || immersive.low === null || immersive.high === null) {
    return "insufficient_data";
  }
  return control.high < immersive.low || immersive.high < control.low ? "difference" : "inconclusive";
}

export function computeLoaderExperimentStats(rows: EventRow[]): LoaderExperimentStats {
  const control = cellStats(rows, "control");
  const immersive = cellStats(rows, "immersive");
  return {
    control,
    immersive,
    verdict: loaderVerdict(control.completionRate, immersive.completionRate),
    minAttempts: MIN_LOADER_ATTEMPTS,
  };
}

export function emptyLoaderExperimentStats(): LoaderExperimentStats {
  return computeLoaderExperimentStats([]);
}
