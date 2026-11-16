import type { EventRow } from "./analytics";

// Pure aggregation of analysis-attempt reliability, kept out of
// analytics.ts so the counting rules can be unit-tested without a database.
//
// Two sources, never mixed in one number:
//  - client events (analysis_connection_lost / analysis_retry /
//    analysis_recovered / analysis_completed / analysis_failed): what the
//    visitor experienced;
//  - server events (analysis_server_*, written by /api/analyze itself, see
//    lib/analysisAttempts.ts): what the server actually did, whether or not
//    any browser was still listening.

// Same value as ATTEMPT_IN_FLIGHT_WINDOW_MS in lib/analysisAttempts.ts.
// Duplicated rather than imported: that module pulls in the Supabase admin
// client and the filesystem, which this pure file has no business loading.
const IN_FLIGHT_WINDOW_MS = 290_000;

function meta(row: EventRow, key: string): unknown {
  return row.metadata?.[key];
}

function attemptIdOf(row: EventRow): string | null {
  const id = meta(row, "attemptId");
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Failures that are still failures once the whole period is known.
 *
 * An attempt can now legitimately carry both events: the browser gave up
 * on a lost connection (analysis_failed) and the visitor later got that
 * same analysis back with "Réessayer" or on a return visit
 * (analysis_completed, same attemptId). The visitor ended up with their
 * result, so the attempt counts once, as completed. Rows without an
 * attemptId (events older than attempt tracking) are kept as they were.
 */
export function effectiveFailedRows(completedRows: EventRow[], failedRows: EventRow[]): EventRow[] {
  const completedIds = new Set<string>();
  for (const r of completedRows) {
    const id = attemptIdOf(r);
    if (id) completedIds.add(id);
  }
  return failedRows.filter((r) => {
    const id = attemptIdOf(r);
    return !id || !completedIds.has(id);
  });
}

/**
 * True for an outcome event whose timing does not measure the analysis
 * itself: a result that came back through recovery, or a failure declared
 * only after minutes of trying to reconnect. Kept out of the "time spent
 * finalizing" statistics, which would otherwise absorb however long a phone
 * stayed locked.
 */
export function isRecoveryAffected(row: EventRow): boolean {
  return meta(row, "recovered") === true || meta(row, "recovery_attempted") === true;
}

export interface ServerErrorRow {
  code: string;
  phase: string;
  count: number;
}

export interface ReliabilityStats {
  // ---- What visitors experienced (client events) ----
  // Attempts whose request was lost before any response (double
  // submissions answered "already running" are not connection losses).
  connectionLostAttempts: number;
  // Of those, attempts that still ended with the visitor on their result.
  recoveredAttempts: number;
  // Of those, attempts that never produced a result for the visitor.
  lostUnrecoveredAttempts: number;
  recoveryRate: number | null;
  // Same attempt sent again: automatically (the server had never received
  // it) or by the visitor after an inconclusive recovery. Never a second
  // analysis -- the attemptId is the same.
  autoResubmits: number;
  manualSameAttemptRetries: number;

  // ---- What the server did (server events) ----
  serverAttempts: number;
  serverCompleted: number;
  serverFailed: number;
  // Started, no outcome recorded, and the function's time limit has passed.
  serverTimedOut: number;
  serverInFlight: number;
  // Listing page could not be read: no analysis was attempted, so (as in
  // the client funnel) it is neither a success nor an analysis failure.
  serverExtractionFailed: number;
  // completed / (completed + failed + timedOut)
  serverSuccessRate: number | null;
  // Requests answered from an analysis that already existed / that was
  // already running: each one is a model call that was NOT paid twice.
  duplicateRequestsAlreadyCompleted: number;
  duplicateRequestsInFlight: number;
  serverErrors: ServerErrorRow[];
}

export const EMPTY_RELIABILITY_STATS: ReliabilityStats = {
  connectionLostAttempts: 0,
  recoveredAttempts: 0,
  lostUnrecoveredAttempts: 0,
  recoveryRate: null,
  autoResubmits: 0,
  manualSameAttemptRetries: 0,
  serverAttempts: 0,
  serverCompleted: 0,
  serverFailed: 0,
  serverTimedOut: 0,
  serverInFlight: 0,
  serverExtractionFailed: 0,
  serverSuccessRate: null,
  duplicateRequestsAlreadyCompleted: 0,
  duplicateRequestsInFlight: 0,
  serverErrors: [],
};

export function computeReliabilityStats(clientRows: EventRow[], serverRows: EventRow[], nowMs: number): ReliabilityStats {
  // ---- Client side ----
  const completedIds = new Set<string>();
  const lostIds = new Set<string>();
  const autoResubmitIds = new Set<string>();
  const manualRetryIds = new Set<string>();
  for (const r of clientRows) {
    const id = attemptIdOf(r);
    if (!id) continue;
    if (r.event_name === "analysis_completed") completedIds.add(id);
    else if (r.event_name === "analysis_connection_lost") {
      if (meta(r, "cause") !== "in_flight") lostIds.add(id);
    } else if (r.event_name === "analysis_retry") {
      (meta(r, "reason") === "server_never_received" ? autoResubmitIds : manualRetryIds).add(id);
    }
  }
  let recoveredAttempts = 0;
  for (const id of lostIds) if (completedIds.has(id)) recoveredAttempts++;

  // ---- Server side: one verdict per attempt ----
  interface ServerAttempt {
    completed: boolean;
    lastStartMs: number | null;
    lastFailure: { atMs: number; code: string; phase: string } | null;
  }
  const attempts = new Map<string, ServerAttempt>();
  let duplicateRequestsAlreadyCompleted = 0;
  let duplicateRequestsInFlight = 0;

  for (const r of serverRows) {
    const id = attemptIdOf(r);
    if (!id) continue;
    if (r.event_name === "analysis_server_deduplicated") {
      if (meta(r, "reason") === "in_flight") duplicateRequestsInFlight++;
      else duplicateRequestsAlreadyCompleted++;
      continue;
    }
    const a = attempts.get(id) ?? { completed: false, lastStartMs: null, lastFailure: null };
    attempts.set(id, a);
    const atMs = new Date(r.created_at).getTime();
    if (r.event_name === "analysis_server_completed") {
      a.completed = true;
    } else if (r.event_name === "analysis_server_started") {
      if (a.lastStartMs === null || atMs > a.lastStartMs) a.lastStartMs = atMs;
    } else if (r.event_name === "analysis_server_failed") {
      if (!a.lastFailure || atMs >= a.lastFailure.atMs) {
        const code = meta(r, "error_code");
        const phase = meta(r, "phase");
        a.lastFailure = {
          atMs,
          code: typeof code === "string" ? code : "unknown",
          phase: typeof phase === "string" ? phase : "unknown",
        };
      }
    }
  }

  let serverCompleted = 0;
  let serverFailed = 0;
  let serverTimedOut = 0;
  let serverInFlight = 0;
  let serverExtractionFailed = 0;
  const errorCounts = new Map<string, ServerErrorRow>();

  for (const a of attempts.values()) {
    // A stored analysis wins over anything else recorded for the attempt.
    if (a.completed) {
      serverCompleted++;
      continue;
    }
    // A start more recent than the last failure is a new run of the same
    // attempt (resubmission): it is judged on that run.
    const runningSinceMs =
      a.lastStartMs !== null && (!a.lastFailure || a.lastStartMs > a.lastFailure.atMs) ? a.lastStartMs : null;
    if (runningSinceMs !== null) {
      if (nowMs - runningSinceMs < IN_FLIGHT_WINDOW_MS) serverInFlight++;
      else serverTimedOut++;
      continue;
    }
    if (a.lastFailure) {
      if (a.lastFailure.code === "airbnb_url_extraction_failed") {
        serverExtractionFailed++;
        continue;
      }
      serverFailed++;
      const key = `${a.lastFailure.code}|${a.lastFailure.phase}`;
      const row = errorCounts.get(key) ?? { code: a.lastFailure.code, phase: a.lastFailure.phase, count: 0 };
      row.count++;
      errorCounts.set(key, row);
    }
  }

  const resolved = serverCompleted + serverFailed + serverTimedOut;

  return {
    connectionLostAttempts: lostIds.size,
    recoveredAttempts,
    lostUnrecoveredAttempts: lostIds.size - recoveredAttempts,
    recoveryRate: lostIds.size > 0 ? recoveredAttempts / lostIds.size : null,
    autoResubmits: autoResubmitIds.size,
    manualSameAttemptRetries: manualRetryIds.size,
    serverAttempts: attempts.size,
    serverCompleted,
    serverFailed,
    serverTimedOut,
    serverInFlight,
    serverExtractionFailed,
    serverSuccessRate: resolved > 0 ? serverCompleted / resolved : null,
    duplicateRequestsAlreadyCompleted,
    duplicateRequestsInFlight,
    serverErrors: Array.from(errorCounts.values()).sort((x, y) => y.count - x.count),
  };
}

/**
 * Rows to build the per-step server timings from: one per analysis.
 *
 * The browser copies the server's timings into analysis_completed -- but a
 * recovered result reaches it through the status endpoint, which carries no
 * timings. For those attempts the server's own completion event is used, so
 * recovered analyses (by construction the slow / interrupted ones) are not
 * silently missing from the step statistics. An attempt is never counted
 * twice: the client row is used when it has timings, the server row only
 * when it does not.
 */
export function stepTimingRows(completedRows: EventRow[], serverRows: EventRow[]): EventRow[] {
  const withTimings = new Set<string>();
  const out: EventRow[] = [];
  for (const r of completedRows) {
    const id = attemptIdOf(r);
    const hasTimings = typeof meta(r, "total_duration_ms") === "number";
    if (id && hasTimings) {
      if (withTimings.has(id)) continue;
      withTimings.add(id);
    }
    if (hasTimings || !id) out.push(r);
  }
  for (const r of serverRows) {
    if (r.event_name !== "analysis_server_completed" || meta(r, "demo") === true) continue;
    const id = attemptIdOf(r);
    if (!id || withTimings.has(id)) continue;
    withTimings.add(id);
    out.push(r);
  }
  return out;
}
