import { describe, expect, it } from "vitest";
import { ATTEMPT_IN_FLIGHT_WINDOW_MS, AttemptEvent, ownsAttempt, resolveAttemptState } from "./analysisAttempts";

const T0 = 1_800_000_000_000;

function ev(
  id: string,
  eventName: AttemptEvent["eventName"],
  atMs: number,
  extra: Partial<AttemptEvent> = {}
): AttemptEvent {
  return { id, eventName, createdAtMs: T0 + atMs, errorCode: null, releasedStartId: null, ...extra };
}

describe("resolveAttemptState", () => {
  it("is unknown when the server never recorded the attempt", () => {
    expect(resolveAttemptState([], T0)).toEqual({ status: "unknown" });
  });

  it("is processing while a start is within the function's lifetime", () => {
    const events = [ev("s1", "analysis_server_started", 0)];
    expect(resolveAttemptState(events, T0 + 60_000)).toEqual({ status: "processing", startedAtMs: T0 });
  });

  // No eternal spinner: a start with no outcome past the platform's time
  // limit means the function was killed.
  it("is a server_timeout failure once the in-flight window has passed with no outcome", () => {
    const events = [ev("s1", "analysis_server_started", 0)];
    expect(resolveAttemptState(events, T0 + ATTEMPT_IN_FLIGHT_WINDOW_MS + 1)).toEqual({
      status: "failed",
      errorCode: "server_timeout",
    });
  });

  it("reports the server's own error code for a failed attempt", () => {
    const events = [
      ev("s1", "analysis_server_started", 0),
      ev("f1", "analysis_server_failed", 20_000, { errorCode: "ai_overloaded" }),
    ];
    expect(resolveAttemptState(events, T0 + 21_000)).toEqual({ status: "failed", errorCode: "ai_overloaded" });
  });

  it("judges a resubmitted attempt on its latest run only", () => {
    const events = [
      ev("s1", "analysis_server_started", 0),
      ev("f1", "analysis_server_failed", 20_000, { errorCode: "ai_overloaded" }),
      ev("s2", "analysis_server_started", 30_000),
    ];
    expect(resolveAttemptState(events, T0 + 40_000)).toEqual({ status: "processing", startedAtMs: T0 + 30_000 });
  });

  // A duplicate request writes its own start row before standing down; that
  // row must not keep the attempt "processing" after the real run fails.
  it("ignores the start row of a request that stood down", () => {
    const events = [
      ev("s1", "analysis_server_started", 0),
      ev("s2", "analysis_server_started", 1_000),
      ev("d2", "analysis_server_deduplicated", 1_100, { releasedStartId: "s2" }),
      ev("f1", "analysis_server_failed", 20_000, { errorCode: "ai_timeout" }),
    ];
    expect(resolveAttemptState(events, T0 + 21_000)).toEqual({ status: "failed", errorCode: "ai_timeout" });
  });

  it("does not depend on the order the rows are returned in", () => {
    const events = [
      ev("f1", "analysis_server_failed", 20_000, { errorCode: "ai_overloaded" }),
      ev("s1", "analysis_server_started", 0),
    ];
    expect(resolveAttemptState(events, T0 + 21_000)).toEqual({ status: "failed", errorCode: "ai_overloaded" });
  });
});

describe("ownsAttempt", () => {
  it("lets a lone request proceed", () => {
    expect(ownsAttempt([ev("s1", "analysis_server_started", 0)], "s1", T0 + 100)).toBe(true);
  });

  // Double submission: both requests wrote their start before either read.
  // Exactly one may run the model.
  it("gives a double submission to exactly one request", () => {
    const events = [ev("s1", "analysis_server_started", 0), ev("s2", "analysis_server_started", 40)];
    const now = T0 + 200;
    expect(ownsAttempt(events, "s1", now)).toBe(true);
    expect(ownsAttempt(events, "s2", now)).toBe(false);
  });

  it("breaks an exact timestamp tie deterministically", () => {
    const events = [ev("b", "analysis_server_started", 0), ev("a", "analysis_server_started", 0)];
    const owners = ["a", "b"].filter((id) => ownsAttempt(events, id, T0 + 10));
    expect(owners).toEqual(["a"]);
  });

  it("lets a resubmission run once the previous run has failed", () => {
    const events = [
      ev("s1", "analysis_server_started", 0),
      ev("f1", "analysis_server_failed", 20_000, { errorCode: "ai_overloaded" }),
      ev("s2", "analysis_server_started", 30_000),
    ];
    expect(ownsAttempt(events, "s2", T0 + 30_100)).toBe(true);
  });

  it("lets a resubmission run when the previous run was killed without reporting", () => {
    const events = [
      ev("s1", "analysis_server_started", 0),
      ev("s2", "analysis_server_started", ATTEMPT_IN_FLIGHT_WINDOW_MS + 5_000),
    ];
    expect(ownsAttempt(events, "s2", T0 + ATTEMPT_IN_FLIGHT_WINDOW_MS + 5_100)).toBe(true);
  });

  it("is not blocked by an earlier request that stood down", () => {
    const events = [
      ev("s1", "analysis_server_started", 0),
      ev("d1", "analysis_server_deduplicated", 50, { releasedStartId: "s1" }),
      ev("s2", "analysis_server_started", 100),
    ];
    expect(ownsAttempt(events, "s2", T0 + 200)).toBe(true);
  });

  // The claim is an optimisation; a failed read must never stop an analysis.
  it("proceeds when its own start row is not visible", () => {
    expect(ownsAttempt([], "s1", T0)).toBe(true);
    expect(ownsAttempt([ev("s0", "analysis_server_started", 0)], "s1", T0 + 100)).toBe(true);
  });
});
