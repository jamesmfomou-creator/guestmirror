import { describe, expect, it } from "vitest";
import type { AccessGrant } from "./accessStore";
import { conciergerieState, pickConciergerieGrant, resolveAccess } from "./entitlements";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const day = 86_400_000;
const noLegacy = { plusActive: false, lifetimeActive: false };

function grant(p: Partial<AccessGrant>): AccessGrant {
  return {
    id: "g1",
    email: "a@x.fr",
    kind: "conciergerie",
    status: "active",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    stripePriceId: null,
    quotaPerPeriod: 20,
    paidPeriodStart: new Date(NOW - 5 * day).toISOString(),
    paidPeriodEnd: new Date(NOW + 25 * day).toISOString(),
    cancelAtPeriodEnd: false,
    pendingUnlockAnalysisId: null,
    statusEventAt: null,
    revokedReason: null,
    createdAt: new Date(NOW - 5 * day).toISOString(),
    ...p,
  };
}

describe("resolveAccess", () => {
  it("never grants anything to an unverified visitor, but says verification is needed", () => {
    const a = resolveAccess({ grants: [grant({ kind: "lifetime", quotaPerPeriod: null })], legacy: noLegacy, verified: false, conciergerieUsed: 0, nowMs: NOW });
    expect(a).toMatchObject({ unlimited: null, conciergerie: null, needsVerification: true, hasManageableSubscription: false });
  });

  it("no rights: nothing to verify", () => {
    expect(resolveAccess({ grants: [], legacy: noLegacy, verified: false, conciergerieUsed: 0, nowMs: NOW }).needsVerification).toBe(false);
  });

  it("lifetime is unlimited, with no quota anywhere", () => {
    const a = resolveAccess({ grants: [grant({ kind: "lifetime", quotaPerPeriod: null })], legacy: noLegacy, verified: true, conciergerieUsed: 0, nowMs: NOW });
    expect(a.unlimited).toBe("lifetime");
    expect(a.conciergerie).toBeNull();
  });

  it("a revoked lifetime (refund) grants nothing", () => {
    const a = resolveAccess({ grants: [grant({ kind: "lifetime", status: "revoked" })], legacy: noLegacy, verified: true, conciergerieUsed: 0, nowMs: NOW });
    expect(a.unlimited).toBeNull();
  });

  it("legacy Plus subscribers keep unlimited access while active", () => {
    const a = resolveAccess({ grants: [], legacy: { plusActive: true, lifetimeActive: false }, verified: true, conciergerieUsed: 0, nowMs: NOW });
    expect(a).toMatchObject({ unlimited: "legacy_plus", hasManageableSubscription: true });
  });

  it("conciergerie: remaining credits in the paid period", () => {
    const a = resolveAccess({ grants: [grant({})], legacy: noLegacy, verified: true, conciergerieUsed: 7, nowMs: NOW });
    expect(a.conciergerie).toMatchObject({ usable: true, used: 7, quota: 20, remaining: 13, blockedReason: null });
    expect(a.unlimited).toBeNull();
  });
});

describe("checkout-scoped sessions", () => {
  it("only see the rights bought in that checkout, never other rights of the email", () => {
    const victimLifetime = grant({ id: "victim", kind: "lifetime", quotaPerPeriod: null, stripeCheckoutSessionId: "cs_victim" });
    const bought = grant({ id: "mine", stripeCheckoutSessionId: "cs_mine" });
    const a = resolveAccess({
      grants: [victimLifetime, bought],
      legacy: { plusActive: true, lifetimeActive: false },
      verified: true,
      scopeCheckoutSessionId: "cs_mine",
      conciergerieUsed: 0,
      nowMs: NOW,
    });
    expect(a.unlimited).toBeNull();
    expect(a.conciergerie?.grantId).toBe("mine");
  });
});

describe("conciergerieState", () => {
  it("quota reached", () => {
    expect(conciergerieState(grant({}), 20, NOW)).toMatchObject({ usable: false, remaining: 0, blockedReason: "quota_exhausted" });
  });

  it("failed renewal: no credits, honest reason", () => {
    expect(conciergerieState(grant({ status: "past_due" }), 3, NOW)).toMatchObject({ usable: false, remaining: 0, blockedReason: "payment_failed" });
  });

  it("canceled: credits until the end of the paid period, then none", () => {
    const canceled = grant({ cancelAtPeriodEnd: true });
    expect(conciergerieState(canceled, 0, NOW)).toMatchObject({ usable: true, remaining: 20, cancelAtPeriodEnd: true });
    expect(conciergerieState(canceled, 0, NOW + 26 * day)).toMatchObject({ usable: false, blockedReason: "period_ended" });
  });

  it("no paid period yet (first invoice not paid): no credits", () => {
    expect(conciergerieState(grant({ paidPeriodStart: null, paidPeriodEnd: null }), 0, NOW).usable).toBe(false);
  });
});

describe("pickConciergerieGrant", () => {
  it("prefers the usable grant and ignores incomplete checkouts", () => {
    const old = grant({ id: "old", status: "canceled", paidPeriodEnd: new Date(NOW - day).toISOString() });
    const current = grant({ id: "cur" });
    const draft = grant({ id: "draft", status: "incomplete" });
    expect(pickConciergerieGrant([old, current, draft], NOW)?.id).toBe("cur");
    expect(pickConciergerieGrant([draft], NOW)).toBeNull();
  });
});
