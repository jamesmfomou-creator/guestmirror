import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hashIdentifier } from "@/lib/serverSecret";
import { listGrantsByEmail, normalizeEmail } from "@/lib/access/accessStore";
import { getSubscriptionByEmail, isLifetimeActive, isPlusActive } from "@/lib/subscriptions";

// Abuse protection for /api/analyze (every accepted attempt is a paid model
// call). Counts the attempts each email and each client IP STARTED recently,
// from the analysis_server_started events the route already writes -- the
// identifiers are stored there as keyed hashes only (never the raw IP or
// email). No migration, no extra table.
//
// Calibrated on production (2026-11-17): the busiest email ever made 7
// analyses in an hour and 7 in a day. Limits sit well above that, IP limits
// higher still (offices, mobile carriers and proxies share addresses), and a
// paying subscriber (Conciergerie, lifetime, legacy Plus) gets far more room.
//
// Deliberately fail-open: if the lookup itself fails, the analysis goes
// ahead. A resubmission of an attempt already started (same attempt id) is
// never counted twice and never blocked -- the route checks idempotency
// before calling this.

export interface Limits {
  emailPerHour: number;
  emailPerDay: number;
  ipPerHour: number;
  ipPerDay: number;
}

export const STANDARD_LIMITS: Limits = { emailPerHour: 12, emailPerDay: 30, ipPerHour: 20, ipPerDay: 60 };
export const SUBSCRIBER_LIMITS: Limits = { emailPerHour: 60, emailPerDay: 200, ipPerHour: 60, ipPerDay: 200 };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The client IP as seen by Vercel's edge (the left-most forwarded address otherwise). */
export function clientIp(headers: Headers): string | null {
  const direct = headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip");
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0];
  const ip = (direct ?? forwarded ?? "").trim();
  return ip || null;
}

export interface RecentStarts {
  /** Start times (ms) of distinct attempts, other than the current one. */
  email: number[];
  ip: number[];
}

export type RateDecision =
  | { allowed: true }
  | { allowed: false; scope: "email" | "ip"; window: "hour" | "day"; limit: number; retryAfterSec: number };

/** Pure: would one more attempt exceed `limits`? */
export function decide(recent: RecentStarts, nowMs: number, limits: Limits): RateDecision {
  const checks: { scope: "email" | "ip"; window: "hour" | "day"; times: number[]; limit: number; span: number }[] = [
    { scope: "email", window: "hour", times: recent.email, limit: limits.emailPerHour, span: HOUR_MS },
    { scope: "email", window: "day", times: recent.email, limit: limits.emailPerDay, span: DAY_MS },
    { scope: "ip", window: "hour", times: recent.ip, limit: limits.ipPerHour, span: HOUR_MS },
    { scope: "ip", window: "day", times: recent.ip, limit: limits.ipPerDay, span: DAY_MS },
  ];
  for (const c of checks) {
    const inWindow = c.times.filter((t) => nowMs - t < c.span).sort((a, b) => a - b);
    if (inWindow.length >= c.limit) {
      // Room again when the oldest attempt that counts leaves the window.
      const oldest = inWindow[inWindow.length - c.limit];
      return { allowed: false, scope: c.scope, window: c.window, limit: c.limit, retryAfterSec: Math.max(60, Math.ceil((oldest + c.span - nowMs) / 1000)) };
    }
  }
  return { allowed: true };
}

export interface RateIdentity {
  emailHash: string | null;
  ipHash: string | null;
}

export function rateIdentity(email: string | null | undefined, headers: Headers): RateIdentity {
  const e = normalizeEmail(email);
  const ip = clientIp(headers);
  return { emailHash: e ? hashIdentifier("email", e) : null, ipHash: ip ? hashIdentifier("ip", ip) : null };
}

async function recentStarts(id: RateIdentity, currentAttemptId: string | null, nowMs: number): Promise<RecentStarts> {
  const since = new Date(nowMs - DAY_MS).toISOString();
  // Untyped query builder on purpose: the JSON-path filters below make the
  // generated Supabase types recurse too deep for the compiler.
  const supabase = getSupabaseAdmin()! as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (c: string, v: string) => { eq: (c: string, v: string) => { gte: (c: string, v: string) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }> } } };
      };
    };
  };
  const query = async (eventName: string, field: "email_hash" | "ip_hash", value: string) => {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("created_at, attempt:metadata->>attemptId")
      .eq("event_name", eventName)
      .eq(`metadata->>${field}`, value)
      .gte("created_at", since)
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as { created_at: string; attempt: string | null }[];
  };
  const fetchFor = async (field: "email_hash" | "ip_hash", value: string | null) => {
    if (!value) return [];
    // Attempts refused by this limit are not counted: retrying while
    // blocked must not extend the block. (Their failure event carries the
    // same hashes; error_code is checked in code.)
    const [starts, failures] = await Promise.all([
      query("analysis_server_started", field, value),
      query("analysis_server_failed", field, value),
    ]);
    const refused = new Set(failures.map((f) => f.attempt));
    // One entry per attempt (a resubmitted attempt writes several starts).
    const firstByAttempt = new Map<string, number>();
    for (const row of starts) {
      const attempt = row.attempt ?? row.created_at;
      if (attempt === currentAttemptId || refused.has(attempt)) continue;
      const t = Date.parse(row.created_at);
      if (!firstByAttempt.has(attempt) || t < firstByAttempt.get(attempt)!) firstByAttempt.set(attempt, t);
    }
    return [...firstByAttempt.values()];
  };
  const [email, ip] = await Promise.all([fetchFor("email_hash", id.emailHash), fetchFor("ip_hash", id.ipHash)]);
  return { email, ip };
}

async function isSubscriber(email: string | null | undefined): Promise<boolean> {
  const e = normalizeEmail(email);
  if (!e) return false;
  const [grants, legacy] = await Promise.all([listGrantsByEmail(e), getSubscriptionByEmail(e)]);
  return grants.some((g) => g.status === "active" || g.status === "trialing") || isPlusActive(legacy) || isLifetimeActive(legacy);
}

/**
 * Whether this attempt may start. Standard limits first; only when they are
 * exceeded is the email's subscription looked up (subscribers get
 * SUBSCRIBER_LIMITS). Fail-open on any lookup error.
 */
export async function checkAnalyzeRateLimit(params: {
  email: string | null | undefined;
  identity: RateIdentity;
  attemptId: string | null;
  nowMs?: number;
}): Promise<RateDecision & { subscriber?: boolean }> {
  if (!SUPABASE_CONFIGURED) return { allowed: true };
  const nowMs = params.nowMs ?? Date.now();
  try {
    const recent = await recentStarts(params.identity, params.attemptId, nowMs);
    const standard = decide(recent, nowMs, STANDARD_LIMITS);
    if (standard.allowed) return standard;
    const subscriber = await isSubscriber(params.email);
    return subscriber ? { ...decide(recent, nowMs, SUBSCRIBER_LIMITS), subscriber } : { ...standard, subscriber };
  } catch (err) {
    console.error("[rate-limit] lookup failed, allowing the attempt:", err instanceof Error ? err.message : err);
    return { allowed: true };
  }
}
