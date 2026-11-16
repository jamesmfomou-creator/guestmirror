import { describe, expect, it } from "vitest";
import type { EventRow } from "./analytics";
import { MIN_LOADER_ATTEMPTS, computeLoaderExperimentStats, loaderVerdict } from "./loaderExperimentStats";
import { proportion } from "./paywallExperimentStats";

let clock = 0;
function row(event_name: string, metadata: Record<string, unknown>): EventRow {
  return {
    event_name,
    anonymous_id: "v",
    session_id: null,
    source: "direct",
    metadata,
    created_at: new Date(Date.UTC(2026, 0, 1) + clock++ * 1000).toISOString(),
  };
}

const viewed = (attemptId: string, loader_variant: string) => row("analysis_loader_viewed", { attemptId, loader_variant });

describe("computeLoaderExperimentStats", () => {
  it("ignores attempts without a loader_variant (before the experiment)", () => {
    const stats = computeLoaderExperimentStats([
      row("analysis_loader_viewed", { attemptId: "old" }),
      row("analysis_completed", { attemptId: "old", duration_ms: 60_000 }),
    ]);
    expect(stats.control.attempts).toBe(0);
    expect(stats.immersive.attempts).toBe(0);
  });

  it("classifies each attempt once: completed, failed, abandoned, or unresolved", () => {
    const stats = computeLoaderExperimentStats([
      viewed("a", "immersive"),
      row("analysis_completed", { attemptId: "a", duration_ms: 50_000 }),
      viewed("b", "immersive"),
      row("analysis_failed", { attemptId: "b" }),
      viewed("c", "immersive"),
      row("analysis_loader_abandoned", { attemptId: "c", tentative: true }),
      viewed("d", "immersive"),
    ]);
    expect(stats.immersive).toMatchObject({ attempts: 4, completed: 1, failed: 1, abandoned: 1, unresolved: 1 });
    expect(stats.immersive.completionRate.rate).toBe(0.25);
  });

  it("does not count a left page as abandoned when the attempt completed afterwards", () => {
    const stats = computeLoaderExperimentStats([
      viewed("a", "control"),
      row("analysis_loader_abandoned", { attemptId: "a", tentative: true }),
      row("analysis_completed", { attemptId: "a", recovered: true, client_elapsed_ms: 200_000 }),
    ]);
    expect(stats.control).toMatchObject({ attempts: 1, completed: 1, abandoned: 0 });
    // A recovered result's wall clock is not a processing time.
    expect(stats.control.medianDurationS).toBeNull();
  });

  it("counts each attempt once even if an event fired twice, and keeps arms apart", () => {
    const stats = computeLoaderExperimentStats([
      viewed("a", "control"),
      viewed("a", "control"),
      row("analysis_completed", { attemptId: "a", duration_ms: 40_000 }),
      row("analysis_completed", { attemptId: "a", duration_ms: 40_000 }),
      viewed("b", "immersive"),
      row("analysis_visual_started", { attemptId: "b", ms_since_loader: 1500 }),
      row("analysis_completed", { attemptId: "b", duration_ms: 60_000 }),
    ]);
    expect(stats.control).toMatchObject({ attempts: 1, completed: 1, medianDurationS: 40 });
    expect(stats.immersive).toMatchObject({ attempts: 1, completed: 1, visualsStarted: 1, medianDurationS: 60, medianTimeToVisualS: 1.5 });
  });

  it("only calls a difference with enough attempts and non-overlapping intervals", () => {
    expect(loaderVerdict(proportion(5, 10), proportion(9, 10))).toBe("insufficient_data");
    const n = MIN_LOADER_ATTEMPTS;
    expect(loaderVerdict(proportion(Math.round(n * 0.7), n), proportion(Math.round(n * 0.72), n))).toBe("inconclusive");
    expect(loaderVerdict(proportion(Math.round(n * 0.5), n), proportion(Math.round(n * 0.9), n))).toBe("difference");
  });
});
