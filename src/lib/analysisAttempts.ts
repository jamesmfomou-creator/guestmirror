import { createHash, randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BRAND_SLUG } from "@/lib/brand";

// Server-side state of an analysis attempt.
//
// Why this exists (production audit, 2026-11-15): every one of the 11
// "analysis_failed / network_error" events of the previous 7 days had a
// finished, stored analysis behind it. The server had done the work and paid
// for the model call; the browser had simply lost the single ~60 s HTTP
// request it was waiting on (page suspended, network change) and had no way
// to ask "did my analysis finish?". Each "Réessayer" then started a brand
// new, fully billed analysis.
//
// The attempt id the client already generates is the stable identifier; what
// was missing is server-side state the client can query. That state is three
// event rows written by /api/analyze itself:
//
//   analysis_server_started    the server accepted the attempt and began work
//   analysis_server_completed  the analysis is stored (carries analysis_id)
//   analysis_server_failed     the server gave up, with the real error_code
//
// plus analysis_server_deduplicated, written when a request arrives for an
// attempt that is already finished or still running (observability only).
//
// Stored in the existing analytics_events table rather than a new one: no
// migration, no new infrastructure, and the admin dashboard can read them
// alongside the client events. These names are deliberately NOT part of
// ANALYTICS_EVENTS (lib/analytics.ts): /api/track validates against that
// list, so a browser can never forge server state through it.

export const ANALYSIS_SERVER_EVENTS = [
  "analysis_server_started",
  "analysis_server_completed",
  "analysis_server_failed",
  "analysis_server_deduplicated",
] as const;

export type AnalysisServerEvent = (typeof ANALYSIS_SERVER_EVENTS)[number];

export function isAnalysisServerEvent(eventName: string): boolean {
  return (ANALYSIS_SERVER_EVENTS as readonly string[]).includes(eventName);
}

// How long after analysis_server_started an attempt with no outcome is still
// considered "running". Just above /api/analyze's maxDuration (280 s): past
// that, the platform has killed the function, so no outcome is ever coming.
export const ATTEMPT_IN_FLIGHT_WINDOW_MS = 290_000;

// Only numbers, booleans and short machine strings ever go in here (phase,
// error code, model id, durations, token counts) -- never an email, a
// listing URL or any listing/analysis text.
export type AttemptEventMetadata = Record<string, string | number | boolean | null>;

export interface AttemptEvent {
  id: string;
  eventName: AnalysisServerEvent;
  createdAtMs: number;
  errorCode: string | null;
  // Set on analysis_server_deduplicated rows written by a request that
  // stood down: the id of its own analysis_server_started row, which must
  // then no longer count as a running start (see currentRun).
  releasedStartId: string | null;
}

// Filesystem fallback, same reasoning as lib/store.ts: local dev / demo mode
// without Supabase. One small JSONL file per attempt; the attempt id is
// hashed so a client-supplied string never becomes part of a path.
const LOCAL_DIR = path.join(os.tmpdir(), `${BRAND_SLUG}-demo-store`);

function localAttemptPath(attemptId: string) {
  return path.join(LOCAL_DIR, `attempt-events-${createHash("sha256").update(attemptId).digest("hex").slice(0, 32)}.jsonl`);
}

/**
 * Writes one server event for an attempt. Never throws: attempt state is a
 * recovery aid and an observability signal, it must not be able to fail an
 * analysis that would otherwise succeed. Returns the row id (used by the
 * in-flight claim below), or null if the write failed.
 */
export async function recordAnalysisServerEvent(params: {
  eventName: AnalysisServerEvent;
  attemptId: string;
  analysisId?: string | null;
  metadata?: AttemptEventMetadata;
}): Promise<string | null> {
  const id = randomUUID();
  // The analysis id goes in the metadata, never in the analysis_id column.
  // The Stripe webhook, the simulated-payment path and lib/inputMethod.ts
  // all read "the earliest event whose analysis_id column is X" to carry the
  // visitor's source, A/B variant and first/last touch over to the payment
  // event. A server row has none of those, and analysis_server_completed is
  // written before the browser has even received the result -- it would
  // always be that earliest event, and every payment would silently lose
  // its attribution.
  const metadata = {
    ...(params.metadata ?? {}),
    attemptId: params.attemptId,
    ...(params.analysisId ? { analysis_id: params.analysisId } : {}),
  };
  try {
    if (SUPABASE_CONFIGURED) {
      const { error } = await getSupabaseAdmin()!.from("analytics_events").insert({
        id,
        event_name: params.eventName,
        source: "server",
        metadata,
      });
      if (error) {
        console.error(`[attempt] ${params.eventName} insert failed attempt_id=${params.attemptId}: ${error.message}`);
        return null;
      }
      return id;
    }
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.appendFileSync(
      localAttemptPath(params.attemptId),
      `${JSON.stringify({ id, event_name: params.eventName, created_at: new Date().toISOString(), metadata })}\n`,
      "utf-8"
    );
    return id;
  } catch (err) {
    console.error(`[attempt] ${params.eventName} write threw attempt_id=${params.attemptId}:`, err);
    return null;
  }
}

interface RawAttemptRow {
  id: string;
  event_name: string;
  created_at: string;
  metadata: unknown;
}

function toAttemptEvent(row: RawAttemptRow): AttemptEvent | null {
  if (!isAnalysisServerEvent(row.event_name)) return null;
  const createdAtMs = new Date(row.created_at).getTime();
  if (!Number.isFinite(createdAtMs)) return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    eventName: row.event_name as AnalysisServerEvent,
    createdAtMs,
    errorCode: typeof meta.error_code === "string" ? meta.error_code : null,
    releasedStartId: typeof meta.released_start_id === "string" ? meta.released_start_id : null,
  };
}

/** Server events recorded for one attempt, oldest first. Empty on any read error. */
export async function getAttemptEvents(attemptId: string): Promise<AttemptEvent[]> {
  try {
    let raw: RawAttemptRow[] = [];
    if (SUPABASE_CONFIGURED) {
      const { data, error } = await getSupabaseAdmin()!
        .from("analytics_events")
        .select("id, event_name, created_at, metadata")
        .in("event_name", [...ANALYSIS_SERVER_EVENTS])
        .contains("metadata", { attemptId })
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) {
        console.error(`[attempt] events lookup failed attempt_id=${attemptId}: ${error.message}`);
        return [];
      }
      raw = (data ?? []) as RawAttemptRow[];
    } else {
      let fileContent = "";
      try {
        fileContent = fs.readFileSync(localAttemptPath(attemptId), "utf-8");
      } catch {
        return [];
      }
      raw = fileContent
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RawAttemptRow);
    }
    return raw
      .map(toAttemptEvent)
      .filter((e): e is AttemptEvent => e !== null)
      .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
  } catch (err) {
    console.error(`[attempt] events lookup threw attempt_id=${attemptId}:`, err);
    return [];
  }
}

export type AttemptState =
  // Nothing recorded: the request never reached the server (or the state
  // write failed). The client may safely submit the same attempt again.
  | { status: "unknown" }
  // The server is working on it right now.
  | { status: "processing"; startedAtMs: number }
  // The server gave up, or started and never reported back in time.
  | { status: "failed"; errorCode: string };

/**
 * The attempt's latest run: the starts recorded since its most recent
 * failure (an attempt that failed and was resubmitted is judged on its
 * latest run only), minus the starts of requests that stood down.
 */
function currentRun(events: AttemptEvent[]): { starts: AttemptEvent[]; lastFailure: AttemptEvent | null } {
  const ordered = [...events].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
  let lastFailedIndex = -1;
  ordered.forEach((e, i) => {
    if (e.eventName === "analysis_server_failed") lastFailedIndex = i;
  });
  const released = new Set(ordered.map((e) => e.releasedStartId).filter((id): id is string => id !== null));
  return {
    starts: ordered
      .slice(lastFailedIndex + 1)
      .filter((e) => e.eventName === "analysis_server_started" && !released.has(e.id)),
    lastFailure: lastFailedIndex >= 0 ? ordered[lastFailedIndex] : null,
  };
}

/**
 * Pure: what the recorded events say about an attempt that has no stored
 * analysis (the caller checks for a stored analysis first -- a stored
 * analysis always wins, whatever the events say).
 */
export function resolveAttemptState(events: AttemptEvent[], nowMs: number): AttemptState {
  const { starts, lastFailure } = currentRun(events);
  const lastStart = starts[starts.length - 1];

  if (lastStart) {
    if (nowMs - lastStart.createdAtMs < ATTEMPT_IN_FLIGHT_WINDOW_MS) {
      return { status: "processing", startedAtMs: lastStart.createdAtMs };
    }
    // Started, never finished, and the function's own time limit has
    // passed: it was killed. Honest failure, not an eternal spinner.
    return { status: "failed", errorCode: "server_timeout" };
  }
  if (lastFailure) {
    return { status: "failed", errorCode: lastFailure.errorCode ?? "unknown" };
  }
  return { status: "unknown" };
}

/**
 * Pure: given every event of an attempt (including the caller's own freshly
 * written analysis_server_started row), is the caller the request that
 * should do the work?
 *
 * The earliest still-running start owns the attempt; any other concurrent
 * request for the same attempt stands down. Deterministic for two requests
 * that both wrote their start before either read, which is what makes a
 * double submission produce one model call instead of two.
 */
export function ownsAttempt(events: AttemptEvent[], ownStartEventId: string, nowMs: number): boolean {
  const liveStarts = currentRun(events).starts.filter(
    (e) => nowMs - e.createdAtMs < ATTEMPT_IN_FLIGHT_WINDOW_MS
  );
  // Own row not visible (read error, replication lag): never block real
  // work on an observability read -- proceed.
  if (!liveStarts.some((e) => e.id === ownStartEventId)) return true;
  return liveStarts[0].id === ownStartEventId;
}

export async function getAttemptState(attemptId: string): Promise<AttemptState> {
  return resolveAttemptState(await getAttemptEvents(attemptId), Date.now());
}
