import { describe, expect, it } from "vitest";
import type { EventRow } from "./analytics";
import { computeReliabilityStats, effectiveFailedRows, isRecoveryAffected, stepTimingRows } from "./attemptStats";

const T0 = 1_800_000_000_000;

function client(event_name: string, metadata: Record<string, unknown>, atMs = 0): EventRow {
  return {
    event_name,
    anonymous_id: "anon_1",
    session_id: "sess_1",
    source: "direct",
    metadata,
    created_at: new Date(T0 + atMs).toISOString(),
  };
}

function server(event_name: string, metadata: Record<string, unknown>, atMs = 0): EventRow {
  return {
    event_name,
    anonymous_id: null,
    session_id: null,
    source: "server",
    metadata,
    created_at: new Date(T0 + atMs).toISOString(),
  } as EventRow;
}

describe("effectiveFailedRows", () => {
  // Browser gave up on a lost connection, the visitor then got the same
  // analysis back: one attempt, one outcome -- completed.
  it("drops a failure whose attempt later completed", () => {
    const completed = [client("analysis_completed", { attemptId: "a1", recovered: true })];
    const failed = [
      client("analysis_failed", { attemptId: "a1", error_code: "network_error", recovery_attempted: true }),
      client("analysis_failed", { attemptId: "a2", error_code: "ai_overloaded" }),
    ];
    expect(effectiveFailedRows(completed, failed).map((r) => r.metadata?.attemptId)).toEqual(["a2"]);
  });

  it("keeps failures that predate attempt ids", () => {
    const failed = [client("analysis_failed", { error_code: "api_error" })];
    expect(effectiveFailedRows([client("analysis_completed", { attemptId: "a1" })], failed)).toHaveLength(1);
  });
});

describe("isRecoveryAffected", () => {
  it("flags recovered results and failures declared after a recovery attempt", () => {
    expect(isRecoveryAffected(client("analysis_completed", { recovered: true }))).toBe(true);
    expect(isRecoveryAffected(client("analysis_failed", { recovery_attempted: true }))).toBe(true);
    expect(isRecoveryAffected(client("analysis_completed", { duration_ms: 60_000 }))).toBe(false);
  });
});

describe("computeReliabilityStats (client side)", () => {
  it("counts lost attempts once and splits them into recovered / never recovered", () => {
    const rows = [
      client("analysis_connection_lost", { attemptId: "a1", cause: "network_error" }),
      client("analysis_connection_lost", { attemptId: "a1", cause: "network_error" }), // duplicate beacon
      client("analysis_recovered", { attemptId: "a1" }),
      client("analysis_completed", { attemptId: "a1", recovered: true }),
      client("analysis_connection_lost", { attemptId: "a2", cause: "timeout" }),
      client("analysis_failed", { attemptId: "a2", error_code: "timeout", recovery_attempted: true }),
      client("analysis_completed", { attemptId: "a3", duration_ms: 61_000 }),
    ];
    const stats = computeReliabilityStats(rows, [], T0);
    expect(stats.connectionLostAttempts).toBe(2);
    expect(stats.recoveredAttempts).toBe(1);
    expect(stats.lostUnrecoveredAttempts).toBe(1);
    expect(stats.recoveryRate).toBe(0.5);
  });

  // A double submission answered "already running" is not a lost connection.
  it("does not count an in-flight duplicate as a connection loss", () => {
    const rows = [client("analysis_connection_lost", { attemptId: "a1", cause: "in_flight" })];
    expect(computeReliabilityStats(rows, [], T0).connectionLostAttempts).toBe(0);
  });

  it("separates automatic resubmissions from manual same-attempt retries", () => {
    const rows = [
      client("analysis_retry", { attemptId: "a1", reason: "server_never_received" }),
      client("analysis_retry", { attemptId: "a2", reason: "manual_same_attempt" }),
      client("analysis_retry", { attemptId: "a2", reason: "manual_same_attempt" }),
    ];
    const stats = computeReliabilityStats(rows, [], T0);
    expect(stats.autoResubmits).toBe(1);
    expect(stats.manualSameAttemptRetries).toBe(1);
  });

  it("has no rate to show when nothing was lost", () => {
    expect(computeReliabilityStats([], [], T0).recoveryRate).toBeNull();
  });
});

describe("computeReliabilityStats (server side)", () => {
  it("gives each attempt exactly one verdict", () => {
    const rows = [
      // completed
      server("analysis_server_started", { attemptId: "a1" }, 0),
      server("analysis_server_completed", { attemptId: "a1" }, 60_000),
      // failed
      server("analysis_server_started", { attemptId: "a2" }, 0),
      server("analysis_server_failed", { attemptId: "a2", error_code: "ai_overloaded", phase: "ai_call" }, 30_000),
      // killed by the platform: started, nothing since
      server("analysis_server_started", { attemptId: "a3" }, 0),
      // still running
      server("analysis_server_started", { attemptId: "a4" }, 580_000),
    ];
    const stats = computeReliabilityStats([], rows, T0 + 600_000);
    expect(stats.serverAttempts).toBe(4);
    expect(stats.serverCompleted).toBe(1);
    expect(stats.serverFailed).toBe(1);
    expect(stats.serverTimedOut).toBe(1);
    expect(stats.serverInFlight).toBe(1);
    // In-flight attempts have no outcome yet and are not in the rate.
    expect(stats.serverSuccessRate).toBeCloseTo(1 / 3);
    expect(stats.serverErrors).toEqual([{ code: "ai_overloaded", phase: "ai_call", count: 1 }]);
  });

  it("counts an attempt that failed then succeeded on resubmission as completed, once", () => {
    const rows = [
      server("analysis_server_started", { attemptId: "a1" }, 0),
      server("analysis_server_failed", { attemptId: "a1", error_code: "ai_timeout", phase: "ai_call" }, 110_000),
      server("analysis_server_started", { attemptId: "a1" }, 120_000),
      server("analysis_server_completed", { attemptId: "a1" }, 180_000),
    ];
    const stats = computeReliabilityStats([], rows, T0 + 600_000);
    expect(stats.serverAttempts).toBe(1);
    expect(stats.serverCompleted).toBe(1);
    expect(stats.serverFailed).toBe(0);
    expect(stats.serverSuccessRate).toBe(1);
  });

  // Same convention as the client funnel: an unreadable listing page is
  // not an analysis, so neither a success nor an analysis failure.
  it("keeps Airbnb extraction failures out of the success rate", () => {
    const rows = [
      server("analysis_server_started", { attemptId: "a1" }, 0),
      server("analysis_server_failed", { attemptId: "a1", error_code: "airbnb_url_extraction_failed", phase: "url_extraction" }, 2_000),
      server("analysis_server_started", { attemptId: "a2" }, 0),
      server("analysis_server_completed", { attemptId: "a2" }, 60_000),
    ];
    const stats = computeReliabilityStats([], rows, T0 + 600_000);
    expect(stats.serverExtractionFailed).toBe(1);
    expect(stats.serverFailed).toBe(0);
    expect(stats.serverSuccessRate).toBe(1);
  });

  it("counts duplicate requests without turning them into attempts or outcomes", () => {
    const rows = [
      server("analysis_server_started", { attemptId: "a1" }, 0),
      server("analysis_server_completed", { attemptId: "a1" }, 60_000),
      server("analysis_server_deduplicated", { attemptId: "a1", reason: "already_completed" }, 90_000),
      server("analysis_server_deduplicated", { attemptId: "a1", reason: "in_flight" }, 10_000),
    ];
    const stats = computeReliabilityStats([], rows, T0 + 600_000);
    expect(stats.serverAttempts).toBe(1);
    expect(stats.serverCompleted).toBe(1);
    expect(stats.duplicateRequestsAlreadyCompleted).toBe(1);
    expect(stats.duplicateRequestsInFlight).toBe(1);
  });
});

describe("stepTimingRows", () => {
  it("uses the server's timings for a recovered analysis, and never counts an attempt twice", () => {
    const completed = [
      client("analysis_completed", { attemptId: "a1", total_duration_ms: 60_000, ai_call_duration_ms: 55_000 }),
      client("analysis_completed", { attemptId: "a2", recovered: true }), // no timings: came via the status endpoint
    ];
    const serverRows = [
      server("analysis_server_completed", { attemptId: "a1", total_duration_ms: 60_000 }),
      server("analysis_server_completed", { attemptId: "a2", total_duration_ms: 95_000 }),
      server("analysis_server_completed", { attemptId: "a3", total_duration_ms: 70_000 }), // browser never came back
      server("analysis_server_completed", { attemptId: "a4", total_duration_ms: 10, demo: true }),
    ];
    const rows = stepTimingRows(completed, serverRows);
    expect(rows.map((r) => [r.source, r.metadata?.attemptId])).toEqual([
      ["direct", "a1"],
      ["server", "a2"],
      ["server", "a3"],
    ]);
  });

  it("keeps legacy completions without an attempt id", () => {
    const completed = [client("analysis_completed", { total_duration_ms: 50_000 })];
    expect(stepTimingRows(completed, [])).toHaveLength(1);
  });
});
