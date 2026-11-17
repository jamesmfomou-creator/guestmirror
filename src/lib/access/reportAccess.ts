import { getSubscriptionByEmail, isLifetimeActive, isPlusActive } from "@/lib/subscriptions";
import { creditsUsedInPeriod, listGrantsByEmail, normalizeEmail, packCreditsRemaining, type AccessGrant } from "./accessStore";
import { pickConciergerieGrant, resolveAccess, type ResolvedAccess } from "./entitlements";
import { currentIdentity } from "./session";

// Server-side: what the current visitor may do with a given report, from the
// rights of the report's email and this browser's proven identity. Fails
// closed: if rights cannot be read, nothing beyond the report's own unlock is
// granted (and the error is logged).

export interface ReportAccess extends ResolvedAccess {
  email: string | null;
  /** The legacy Stripe customer or Conciergerie customer, for the billing portal. */
  portalCustomerId: string | null;
}

const NONE: ReportAccess = {
  email: null,
  verified: false,
  needsVerification: false,
  unlimited: null,
  conciergerie: null,
  hasManageableSubscription: false,
  portalCustomerId: null,
};

export async function getAccessForEmail(rawEmail: string | null | undefined): Promise<ReportAccess> {
  const email = normalizeEmail(rawEmail);
  if (!email) return NONE;
  try {
    const [grants, legacy, identity] = await Promise.all([
      listGrantsByEmail(email),
      getSubscriptionByEmail(email),
      currentIdentity(),
    ]);
    const verified = identity?.email === email;
    const scope = verified ? identity.scopeCheckoutSessionId : null;
    const scoped: AccessGrant[] = scope ? grants.filter((g) => g.stripeCheckoutSessionId === scope) : grants;
    const nowMs = Date.now();
    const chosen = pickConciergerieGrant(scoped, nowMs);
    const used = chosen ? await creditsUsedInPeriod(chosen) : 0;
    // Packs only exist for Conciergerie subscribers (current or former).
    const packCredits = chosen ? await packCreditsRemaining(email, scope ? scoped.map((g) => g.id) : undefined) : 0;
    const resolved = resolveAccess({
      grants,
      legacy: { plusActive: isPlusActive(legacy), lifetimeActive: isLifetimeActive(legacy) },
      verified,
      scopeCheckoutSessionId: scope,
      conciergerieUsed: used,
      packCredits,
      nowMs,
    });
    const portalCustomerId =
      resolved.hasManageableSubscription
        ? (!scope && isPlusActive(legacy) ? legacy?.stripe_customer_id : null) ?? chosen?.stripeCustomerId ?? null
        : null;
    return { ...resolved, email, portalCustomerId };
  } catch (err) {
    console.error("[access] rights lookup failed, granting nothing extra:", err instanceof Error ? err.message : err);
    return { ...NONE, email };
  }
}
