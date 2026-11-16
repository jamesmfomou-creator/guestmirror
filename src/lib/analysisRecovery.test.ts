import { describe, expect, it } from "vitest";
import {
  classifyUserAgent,
  isConnectionLoss,
  newAttemptId,
  nextPollDelayMs,
  parsePendingAttempt,
  RECOVERY_DEADLINE_MS,
  RECOVERY_MIN_WINDOW_MS,
  recoveryDeadlineAt,
} from "./analysisRecovery";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("nextPollDelayMs", () => {
  const mid = () => 0.5; // no jitter

  it("backs off exponentially from 2 s and caps at 10 s", () => {
    expect(nextPollDelayMs(0, mid)).toBe(2000);
    expect(nextPollDelayMs(1, mid)).toBe(3200);
    expect(nextPollDelayMs(2, mid)).toBe(5120);
    expect(nextPollDelayMs(4, mid)).toBe(10_000);
    expect(nextPollDelayMs(50, mid)).toBe(10_000);
  });

  it("spreads clients by +/-25 %", () => {
    expect(nextPollDelayMs(0, () => 0)).toBe(1500);
    expect(nextPollDelayMs(0, () => 1)).toBe(2500);
    expect(nextPollDelayMs(9, () => 1)).toBe(12_500);
  });
});

describe("recoveryDeadlineAt", () => {
  it("covers the server's whole processing window from the start of the attempt", () => {
    expect(recoveryDeadlineAt(1_000_000, 1_030_000)).toBe(1_000_000 + RECOVERY_DEADLINE_MS);
  });

  it("still leaves a real window when the connection is lost very late", () => {
    const lostAt = 1_000_000 + RECOVERY_DEADLINE_MS - 1_000;
    expect(recoveryDeadlineAt(1_000_000, lostAt)).toBe(lostAt + RECOVERY_MIN_WINDOW_MS);
  });
});

describe("isConnectionLoss", () => {
  it("recognizes a dropped connection and a client timeout", () => {
    expect(isConnectionLoss(new TypeError("Failed to fetch"))).toBe("network_error");
    expect(isConnectionLoss(new DOMException("aborted", "AbortError"))).toBe("timeout");
  });

  // An error the server actually returned is its final word: no recovery,
  // no retry.
  it("does not treat a server-reported error as a connection loss", () => {
    expect(isConnectionLoss(new Error("L'analyse a échoué", { cause: "ai_overloaded" }))).toBeNull();
    expect(isConnectionLoss("nope")).toBeNull();
  });
});

describe("newAttemptId", () => {
  it("produces distinct ids the status endpoint accepts", () => {
    const a = newAttemptId();
    const b = newAttemptId();
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
  });
});

describe("parsePendingAttempt", () => {
  const now = 1_800_000_000_000;
  const id = "3f2b8c1e-7a4d-4e9b-8f21-0c5d6e7a8b9c";

  it("reads back a recent attempt", () => {
    const raw = JSON.stringify({ attemptId: id, startedAtMs: now - 60_000 });
    expect(parsePendingAttempt(raw, now)).toEqual({ attemptId: id, startedAtMs: now - 60_000 });
  });

  it("forgets an attempt older than 30 minutes or dated in the future", () => {
    expect(parsePendingAttempt(JSON.stringify({ attemptId: id, startedAtMs: now - 31 * 60_000 }), now)).toBeNull();
    expect(parsePendingAttempt(JSON.stringify({ attemptId: id, startedAtMs: now + 10 * 60_000 }), now)).toBeNull();
  });

  it("ignores missing or corrupted storage", () => {
    expect(parsePendingAttempt(null, now)).toBeNull();
    expect(parsePendingAttempt("{not json", now)).toBeNull();
    expect(parsePendingAttempt(JSON.stringify({ attemptId: 12, startedAtMs: "x" }), now)).toBeNull();
  });

  it("keeps nothing beyond the id and the timestamp", () => {
    const raw = JSON.stringify({ attemptId: id, startedAtMs: now, email: "x@example.com" });
    expect(parsePendingAttempt(raw, now)).toEqual({ attemptId: id, startedAtMs: now });
  });
});

describe("classifyUserAgent", () => {
  it("separates in-app browsers from regular ones", () => {
    const instagram =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A Instagram 350.0.0";
    const safari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    expect(classifyUserAgent(instagram)).toEqual({ client_platform: "ios", client_in_app: true });
    expect(classifyUserAgent(safari)).toEqual({ client_platform: "ios", client_in_app: false });
  });

  it("buckets android, desktop and anything else", () => {
    expect(classifyUserAgent("Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/130 Mobile").client_platform).toBe("android");
    expect(classifyUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130").client_platform).toBe("desktop");
    expect(classifyUserAgent("").client_platform).toBe("other");
  });
});
