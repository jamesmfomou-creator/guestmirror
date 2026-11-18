import { afterEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_BACKGROUND_SHARE,
  ONBOARDING_FORCED_VALUE,
  drawOnboardingVariant,
  onboardingOverride,
  resolveOnboardingVariant,
} from "@/lib/onboardingExperiment";
import { editTokenFor, isValidEditToken } from "@/lib/analysisEditToken";
import { STANDARD_LIMITS, SUBSCRIBER_LIMITS, clientIp, decide, ipCounterKey, withoutIpLimit } from "@/lib/analyzeRateLimit";
import { editSecrets, hashIdentifier } from "@/lib/serverSecret";
import { updateAnalysisInputSchema } from "@/lib/validation";

describe("onboarding experiment", () => {
  it("is off by default: nobody is assigned, everyone sees the control", () => {
    expect(ONBOARDING_BACKGROUND_SHARE).toBe(0);
    expect(drawOnboardingVariant(() => 0)).toBeNull();
    expect(resolveOnboardingVariant(null)).toBe("control");
    // A stale "background" cookie maps back to control while the share is 0 (rollback).
    expect(resolveOnboardingVariant("background")).toBe("control");
  });

  it("draws by share when switched on", () => {
    expect(drawOnboardingVariant(() => 0.2, 0.5)).toBe("background");
    expect(drawOnboardingVariant(() => 0.7, 0.5)).toBe("control");
    expect(resolveOnboardingVariant("background", 0.5)).toBe("background");
    expect(resolveOnboardingVariant("weird", 0.5)).toBe("control");
  });

  it("the ?ob= override is honoured even at share 0, for testing", () => {
    expect(onboardingOverride("background")).toBe(ONBOARDING_FORCED_VALUE);
    expect(resolveOnboardingVariant(ONBOARDING_FORCED_VALUE, 0)).toBe("background");
    expect(onboardingOverride("control")).toBe("control");
    expect(onboardingOverride("anything")).toBeNull();
    expect(onboardingOverride(null)).toBeNull();
  });
});

describe("analysis edit token", () => {
  const id = "3ee754e2-8302-406b-8fbe-067fc39fd28d";

  it("is deterministic and valid only for its own analysis", () => {
    const t = editTokenFor(id)!;
    expect(t).toHaveLength(32);
    expect(editTokenFor(id)).toBe(t);
    expect(isValidEditToken(id, t)).toBe(true);
    expect(isValidEditToken("44bf7b76-9801-4493-a4b1-4ed8a95aa510", t)).toBe(false);
  });

  it("rejects anything else", () => {
    expect(isValidEditToken(id, null)).toBe(false);
    expect(isValidEditToken(id, "")).toBe(false);
    expect(isValidEditToken(id, "x".repeat(32))).toBe(false);
    expect(isValidEditToken(id, editTokenFor(id)!.slice(0, 31))).toBe(false);
  });
});

describe("edit secret: dedicated ANALYSIS_EDIT_SECRET with a compatible transition", () => {
  const id = "3ee754e2-8302-406b-8fbe-067fc39fd28d";
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ["ANALYSIS_EDIT_SECRET", "ANALYSIS_EDIT_ACCEPT_DERIVED", "SUPABASE_SERVICE_ROLE_KEY", "NODE_ENV", "VERCEL_ENV"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  const env = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else (process.env as Record<string, string>)[k] = v;
    }
  };

  it("before the dedicated secret: tokens come from the service-key derivation", () => {
    env({ ANALYSIS_EDIT_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests" });
    expect(editSecrets().source).toBe("derived");
  });

  it("setting the dedicated secret keeps tokens already handed out valid", () => {
    env({ ANALYSIS_EDIT_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests" });
    const oldToken = editTokenFor(id)!;
    env({ ANALYSIS_EDIT_SECRET: "a-dedicated-secret-of-more-than-32-characters" });
    expect(editSecrets().source).toBe("dedicated");
    const newToken = editTokenFor(id)!;
    expect(newToken).not.toBe(oldToken);
    expect(isValidEditToken(id, newToken)).toBe(true);
    expect(isValidEditToken(id, oldToken)).toBe(true);
  });

  it("ANALYSIS_EDIT_ACCEPT_DERIVED=false ends the transition: only the dedicated secret works", () => {
    env({ ANALYSIS_EDIT_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests" });
    const oldToken = editTokenFor(id)!;
    env({ ANALYSIS_EDIT_SECRET: "a-dedicated-secret-of-more-than-32-characters", ANALYSIS_EDIT_ACCEPT_DERIVED: "false" });
    expect(isValidEditToken(id, oldToken)).toBe(false);
    expect(isValidEditToken(id, editTokenFor(id)!)).toBe(true);
  });

  it("production without any secret fails closed: no token issued or accepted, no hash", () => {
    env({ ANALYSIS_EDIT_SECRET: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VERCEL_ENV: "production" });
    expect(editSecrets().source).toBe("none");
    expect(editTokenFor(id)).toBeNull();
    expect(isValidEditToken(id, "x".repeat(32))).toBe(false);
    expect(hashIdentifier("ip", "1.2.3.4")).toBeNull();
  });
});

describe("analyze rate limit", () => {
  const now = Date.UTC(2026, 10, 18, 12);
  const minutesAgo = (n: number) => now - n * 60_000;
  const times = (count: number, spacingMin: number) => Array.from({ length: count }, (_, i) => minutesAgo(i * spacingMin + 1));

  it("allows the busiest real usage seen in production (7 in an hour)", () => {
    expect(decide({ email: times(7, 5), ip: times(7, 5) }, now, STANDARD_LIMITS)).toEqual({ allowed: true });
  });

  it("blocks an email past its hourly limit, with a retry delay", () => {
    const d = decide({ email: times(STANDARD_LIMITS.emailPerHour, 3), ip: [] }, now, STANDARD_LIMITS);
    expect(d).toMatchObject({ allowed: false, scope: "email", window: "hour", limit: STANDARD_LIMITS.emailPerHour });
    expect(!d.allowed && d.retryAfterSec).toBeGreaterThanOrEqual(60);
  });

  it("blocks an IP past its daily limit even when spread over the day", () => {
    const d = decide({ email: [], ip: times(STANDARD_LIMITS.ipPerDay, 14) }, now, STANDARD_LIMITS);
    expect(d).toMatchObject({ allowed: false, scope: "ip", window: "day" });
  });

  it("forgets attempts older than the window", () => {
    expect(decide({ email: times(40, 60).map((t) => t - 25 * 3600_000), ip: [] }, now, STANDARD_LIMITS)).toEqual({ allowed: true });
  });

  it("gives subscribers far more room", () => {
    const busy = { email: times(STANDARD_LIMITS.emailPerHour + 5, 2), ip: [] };
    expect(decide(busy, now, STANDARD_LIMITS).allowed).toBe(false);
    expect(decide(busy, now, SUBSCRIBER_LIMITS).allowed).toBe(true);
  });

  it("counts IPv6 per /64 (one line), IPv4 per address", () => {
    expect(ipCounterKey("2a01:cb00:1234:5678:aaaa:bbbb:cccc:dddd")).toBe("2a01:cb00:1234:5678::/64");
    expect(ipCounterKey("2a01:cb00:1234:5678::1")).toBe("2a01:cb00:1234:5678::/64");
    expect(ipCounterKey("2a01:cb00:1234:9999::1")).not.toBe(ipCounterKey("2a01:cb00:1234:5678::1"));
    expect(ipCounterKey("::ffff:192.0.2.7")).toBe("192.0.2.7");
    expect(ipCounterKey("192.0.2.7")).toBe("192.0.2.7");
  });

  it("a verified email is not held by the IP counter, but still by its own email limit", () => {
    const busyNetwork = { email: [], ip: times(STANDARD_LIMITS.ipPerHour + 10, 1) };
    expect(decide(busyNetwork, now, STANDARD_LIMITS).allowed).toBe(false);
    expect(decide(busyNetwork, now, withoutIpLimit(STANDARD_LIMITS)).allowed).toBe(true);
    const busyEmail = { email: times(STANDARD_LIMITS.emailPerHour, 2), ip: [] };
    expect(decide(busyEmail, now, withoutIpLimit(STANDARD_LIMITS))).toMatchObject({ allowed: false, scope: "email" });
  });

  it("reads the client IP from the edge headers", () => {
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("PATCH /api/analyses/[id] body", () => {
  it("accepts the onboarding answers and the optional listing details", () => {
    expect(updateAnalysisInputSchema.safeParse({ goal: "reduce_hesitation", user_type: "concierge", property_count_range: "2-5" }).success).toBe(true);
    expect(updateAnalysisInputSchema.safeParse({ city: "Lyon" }).success).toBe(true);
  });

  it("refuses anything else: unknown values, the score, the result, the unlock state, the email", () => {
    expect(updateAnalysisInputSchema.safeParse({ goal: "make_money" }).success).toBe(false);
    expect(updateAnalysisInputSchema.safeParse({ overall_score: 100 }).success).toBe(false);
    expect(updateAnalysisInputSchema.safeParse({ is_unlocked: true }).success).toBe(false);
    expect(updateAnalysisInputSchema.safeParse({ email: "x@y.z" }).success).toBe(false);
    expect(updateAnalysisInputSchema.safeParse({ result: {} }).success).toBe(false);
  });
});
