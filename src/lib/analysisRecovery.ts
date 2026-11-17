// Client-side helpers for recovering an analysis whose HTTP request was
// lost. Pure / storage-only on purpose (no React), so the timing and
// classification rules are unit-testable. The orchestration itself lives in
// AnalyzeWizard.tsx; the server side in lib/analysisAttempts.ts and
// /api/analyze/status.

export type AttemptStatus = "completed" | "processing" | "failed" | "unknown";

export interface AttemptStatusResponse {
  status: AttemptStatus;
  id?: string;
  overall_score?: number;
  error_code?: string;
  // Proof of ownership of the analysis (lib/analysisEditToken.ts), only for
  // a completed attempt.
  edit_token?: string;
}

// ---- Polling cadence -------------------------------------------------

const POLL_BASE_MS = 2_000;
const POLL_FACTOR = 1.6;
const POLL_MAX_MS = 10_000;
const POLL_JITTER = 0.25;

/**
 * Delay before status check number `pollIndex` (0-based): exponential
 * backoff from 2 s, capped at 10 s, with +/-25 % jitter so a burst of
 * clients that lost their connection at the same moment (a deploy, a
 * provider blip) doesn't come back in lockstep. `random` is injected for
 * tests.
 */
export function nextPollDelayMs(pollIndex: number, random: () => number = Math.random): number {
  const base = Math.min(POLL_BASE_MS * Math.pow(POLL_FACTOR, Math.max(0, pollIndex)), POLL_MAX_MS);
  const jitter = 1 + (random() * 2 - 1) * POLL_JITTER;
  return Math.round(base * jitter);
}

// How long recovery keeps looking before giving up honestly. Just above the
// server's own in-flight window (290 s, lib/analysisAttempts.ts): by then
// the server has either stored the analysis or reported/implied a failure.
export const RECOVERY_DEADLINE_MS = 300_000;
// A request that already ran into the client timeout still gets a real
// chance to find its result.
export const RECOVERY_MIN_WINDOW_MS = 20_000;

export function recoveryDeadlineAt(attemptStartedAtMs: number, nowMs: number): number {
  return Math.max(attemptStartedAtMs + RECOVERY_DEADLINE_MS, nowMs + RECOVERY_MIN_WINDOW_MS);
}

// ---- What kind of failure is it? --------------------------------------

/**
 * Did the request die without the server ever answering? Those are the only
 * failures worth recovering from: the server may well have finished (it did,
 * for every such failure in the audit that motivated this). An error the
 * server actually returned is its final word on the attempt and is shown
 * as-is.
 */
export function isConnectionLoss(err: unknown): "timeout" | "network_error" | null {
  // AbortError: our own client-side timeout fired.
  if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
    return "timeout";
  }
  // fetch() rejects with a TypeError when no response was ever received
  // (connection dropped, page suspended, offline). Our own thrown errors
  // are plain Error instances carrying a server error code in `cause`.
  if (err instanceof TypeError) return "network_error";
  return null;
}

// ---- Stable attempt identity ------------------------------------------

/** RFC 4122 v4, with a fallback for browsers without crypto.randomUUID. */
export function newAttemptId(): string {
  if (typeof crypto !== "undefined") {
    if ("randomUUID" in crypto) return crypto.randomUUID();
    if ("getRandomValues" in crypto) {
      const b = (crypto as Crypto).getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  // Last resort, still UUID-shaped so the status endpoint accepts it.
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
}

// ---- Pending attempt, across page reloads ------------------------------

const PENDING_KEY = "gm_pending_analysis";
// Past this, an unfinished attempt is no longer worth mentioning to the
// visitor (and the server has long since resolved it either way).
const PENDING_MAX_AGE_MS = 30 * 60 * 1000;

export interface PendingAttempt {
  attemptId: string;
  startedAtMs: number;
}

export function parsePendingAttempt(raw: string | null, nowMs: number): PendingAttempt | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingAttempt>;
    if (typeof parsed.attemptId !== "string" || typeof parsed.startedAtMs !== "number") return null;
    if (nowMs - parsed.startedAtMs > PENDING_MAX_AGE_MS || parsed.startedAtMs > nowMs + 60_000) return null;
    return { attemptId: parsed.attemptId, startedAtMs: parsed.startedAtMs };
  } catch {
    return null;
  }
}

/** Only the random attempt id and a timestamp -- no email, no listing data. */
export function savePendingAttempt(attempt: PendingAttempt) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(attempt));
  } catch {
    // storage unavailable -- resume-after-reload simply isn't offered
  }
}

export function readPendingAttempt(): PendingAttempt | null {
  try {
    return parsePendingAttempt(window.localStorage.getItem(PENDING_KEY), Date.now());
  } catch {
    return null;
  }
}

export function clearPendingAttempt() {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // nothing to clear
  }
}

export async function fetchAttemptStatus(attemptId: string): Promise<AttemptStatusResponse> {
  const res = await fetch(`/api/analyze/status?attempt_id=${encodeURIComponent(attemptId)}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as AttemptStatusResponse;
  if (!json || typeof json.status !== "string") throw new Error("invalid status response");
  return json;
}

// ---- Coarse client class, for diagnosing *where* connections drop ------

export interface ClientClass {
  client_platform: "ios" | "android" | "desktop" | "other";
  // Instagram / Facebook / TikTok / ... embedded browsers, which suspend
  // background pages far more aggressively than a regular browser.
  client_in_app: boolean;
}

/**
 * Two coarse buckets derived from the user agent -- never the user agent
 * itself, which would be needlessly identifying for what this is used for
 * (telling "phones inside the Instagram browser" apart from "desktop").
 */
export function classifyUserAgent(userAgent: string): ClientClass {
  const ua = userAgent || "";
  const client_platform = /iPhone|iPad|iPod/i.test(ua)
    ? "ios"
    : /Android/i.test(ua)
      ? "android"
      : /Macintosh|Windows|Linux|CrOS/i.test(ua)
        ? "desktop"
        : "other";
  const client_in_app = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview|Snapchat|Line\/|LinkedInApp|Pinterest/i.test(ua);
  return { client_platform, client_in_app };
}
