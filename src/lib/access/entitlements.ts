import type { AccessGrant } from "./accessStore";

// What a visitor may do with a report, from the rights attached to the
// report's email (there are no accounts). Pure, so every rule is unit-tested.
//
// Rights that span several reports (subscriptions, lifetime) are only usable
// once the visitor has proved they read that mailbox (lib/access/session.ts).
// A report bought on its own (analyses.is_unlocked) needs no proof: knowing
// its link has always been the access model for a single report.
//
//  - unlimited: legacy Plus (6,90 €/mois, active), legacy lifetime, or the new
//    Accès à vie -- every report of that email is readable.
//  - conciergerie: N analyses per paid period; each report is unlocked
//    explicitly, which uses one credit (persisted, so it stays unlocked).
//    Add-on packs (10 analyses, one-time) are used once the monthly quota is
//    spent; they never expire and stay usable after the subscription ends.

export interface LegacyRights {
  plusActive: boolean;
  lifetimeActive: boolean;
}

export type UnlimitedSource = "legacy_plus" | "legacy_lifetime" | "lifetime";

export interface ConciergerieState {
  grantId: string;
  usable: boolean;
  /** Why it cannot be used right now, for an honest message. */
  blockedReason: "payment_failed" | "period_ended" | "quota_exhausted" | null;
  used: number;
  quota: number;
  /** Monthly analyses left in the current paid period. */
  remaining: number;
  /** Unused add-on pack analyses (never expire). */
  extraRemaining: number;
  /** Which credit the next unlock will use. */
  nextSource: "monthly" | "pack" | null;
  /** May buy an add-on pack now (subscription in a paid period). */
  canBuyAddon: boolean;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface ResolvedAccess {
  verified: boolean;
  /** The email has rights, but this browser has not proved it owns the email. */
  needsVerification: boolean;
  unlimited: UnlimitedSource | null;
  conciergerie: ConciergerieState | null;
  /** A recurring subscription exists that the verified visitor may manage. */
  hasManageableSubscription: boolean;
}

export function isLifetimeGrantActive(grant: AccessGrant): boolean {
  return grant.kind === "lifetime" && grant.status === "active";
}

/** The grant gives credits right now: in good standing and inside a paid period. */
export function isConciergerieGrantUsable(grant: AccessGrant, nowMs: number): boolean {
  return (
    grant.kind === "conciergerie" &&
    (grant.status === "active" || grant.status === "trialing") &&
    grant.paidPeriodEnd !== null &&
    new Date(grant.paidPeriodEnd).getTime() > nowMs
  );
}

/** Most relevant Conciergerie grant: a usable one first, else the most recent. */
export function pickConciergerieGrant(grants: AccessGrant[], nowMs: number): AccessGrant | null {
  const subs = grants.filter((g) => g.kind === "conciergerie" && g.status !== "incomplete");
  return subs.find((g) => isConciergerieGrantUsable(g, nowMs)) ?? subs[subs.length - 1] ?? null;
}

export function conciergerieState(grant: AccessGrant, used: number, nowMs: number, extraRemaining = 0): ConciergerieState {
  const quota = grant.quotaPerPeriod ?? 0;
  const inPeriod = isConciergerieGrantUsable(grant, nowMs);
  const remaining = inPeriod ? Math.max(0, quota - used) : 0;
  const extra = Math.max(0, extraRemaining);
  const nextSource = remaining > 0 ? "monthly" : extra > 0 ? "pack" : null;
  let blockedReason: ConciergerieState["blockedReason"] = null;
  if (nextSource === null) {
    if (!inPeriod) {
      blockedReason = grant.status === "past_due" || grant.status === "unpaid" ? "payment_failed" : "period_ended";
    } else {
      blockedReason = "quota_exhausted";
    }
  }
  return {
    grantId: grant.id,
    usable: nextSource !== null,
    blockedReason,
    used: inPeriod ? used : 0,
    quota,
    remaining,
    extraRemaining: extra,
    nextSource,
    canBuyAddon: inPeriod,
    periodEnd: grant.paidPeriodEnd,
    cancelAtPeriodEnd: grant.cancelAtPeriodEnd,
  };
}

export function resolveAccess(params: {
  grants: AccessGrant[];
  legacy: LegacyRights;
  verified: boolean;
  /**
   * Set when the visitor's session comes from the return of a Stripe checkout
   * (no emailed code): only the rights bought in that checkout count. Paying
   * with someone else's email must never reveal that person's other rights.
   */
  scopeCheckoutSessionId?: string | null;
  /** Credits used in the current period of the chosen Conciergerie grant. */
  conciergerieUsed: number;
  /** Unused add-on pack analyses visible to this visitor. */
  packCredits?: number;
  nowMs: number;
}): ResolvedAccess {
  const scope = params.scopeCheckoutSessionId ?? null;
  const { verified, nowMs } = params;
  const grants = scope ? params.grants.filter((g) => g.stripeCheckoutSessionId === scope) : params.grants;
  const legacy = scope ? { plusActive: false, lifetimeActive: false } : params.legacy;
  const lifetime = grants.some(isLifetimeGrantActive);
  const conciergerieGrant = pickConciergerieGrant(grants, nowMs);
  const unlimitedSource: UnlimitedSource | null = lifetime
    ? "lifetime"
    : legacy.lifetimeActive
      ? "legacy_lifetime"
      : legacy.plusActive
        ? "legacy_plus"
        : null;
  const packCredits = params.packCredits ?? 0;
  const hasAnyRight =
    unlimitedSource !== null ||
    (conciergerieGrant !== null && (isConciergerieGrantUsable(conciergerieGrant, nowMs) || packCredits > 0));

  return {
    verified,
    needsVerification: !verified && hasAnyRight,
    unlimited: verified ? unlimitedSource : null,
    conciergerie:
      verified && conciergerieGrant ? conciergerieState(conciergerieGrant, params.conciergerieUsed, nowMs, packCredits) : null,
    hasManageableSubscription:
      verified &&
      (legacy.plusActive ||
        (conciergerieGrant !== null && conciergerieGrant.stripeCustomerId !== null && conciergerieGrant.status !== "revoked")),
  };
}
