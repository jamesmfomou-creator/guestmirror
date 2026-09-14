import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/env";

/**
 * GuestMirror Plus entitlement, keyed by email (no auth/user-account system
 * exists in this app -- see 0004_subscriptions.sql). Status is always
 * synced from Stripe webhooks; never inferred from a success redirect.
 */

const ACTIVE_STATUSES = ["active", "trialing"];

export interface SubscriptionRecord {
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  subscription_plan: string | null;
  current_period_end: string | null;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export async function getSubscriptionByEmail(
  email: string | null | undefined
): Promise<SubscriptionRecord | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !SUPABASE_CONFIGURED) return null;

  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("subscriptions")
    .select(
      "email, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan, current_period_end"
    )
    .eq("email", normalized)
    .maybeSingle();

  return (data as SubscriptionRecord) ?? null;
}

/**
 * PLUS_ACTIVE: recurring subscription in good standing. Deliberately
 * excludes subscription_plan === "lifetime" -- a Lifetime purchaser's row
 * also sits in this same table (see isLifetimeActive below) but isn't a
 * subscription, and callers like the billing-portal link ("Gérer mon
 * abonnement") only make sense for a real recurring subscription.
 */
export function isPlusActive(subscription: SubscriptionRecord | null): boolean {
  return (
    !!subscription &&
    subscription.subscription_plan !== "lifetime" &&
    ACTIVE_STATUSES.includes(subscription.subscription_status)
  );
}

/**
 * LIFETIME_ACTIVE: one-time Stripe Checkout purchase (mode=payment, see
 * STRIPE_PRICE_LIFETIME), stored in the same subscriptions table with
 * subscription_plan="lifetime" and subscription_status="active" forever
 * (current_period_end stays null -- there's no recurring period to track).
 * Grants the same ongoing access as PLUS_ACTIVE, nothing more: this app
 * has no per-analysis usage metering today (see lib/ai.ts), so there is no
 * "unlimited analyses" quota to grant on top of what Plus already gives.
 */
export function isLifetimeActive(subscription: SubscriptionRecord | null): boolean {
  return (
    !!subscription &&
    subscription.subscription_plan === "lifetime" &&
    subscription.subscription_status === "active"
  );
}

export async function hasActivePlusSubscription(
  email: string | null | undefined
): Promise<boolean> {
  return isPlusActive(await getSubscriptionByEmail(email));
}

export async function hasActiveLifetimeAccess(
  email: string | null | undefined
): Promise<boolean> {
  return isLifetimeActive(await getSubscriptionByEmail(email));
}

/** ONE_TIME_UNLOCKED (this specific analysis was paid for) OR PLUS_ACTIVE OR LIFETIME_ACTIVE. */
export async function hasFullAccess(analysis: {
  is_unlocked: boolean;
  email: string | null;
}): Promise<boolean> {
  if (analysis.is_unlocked) return true;
  const subscription = await getSubscriptionByEmail(analysis.email);
  return isPlusActive(subscription) || isLifetimeActive(subscription);
}

function toIso(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;
}

/** Called from checkout.session.completed (mode=subscription) -- we have the email here. */
export async function upsertSubscriptionFromCheckout(params: {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: number | null;
}) {
  if (!SUPABASE_CONFIGURED) return;
  const supabase = getSupabaseAdmin()!;
  const normalized = normalizeEmail(params.email);
  if (!normalized) return;

  await supabase.from("subscriptions").upsert(
    {
      email: normalized,
      stripe_customer_id: params.stripeCustomerId,
      stripe_subscription_id: params.stripeSubscriptionId,
      subscription_status: params.status,
      subscription_plan: "plus",
      current_period_end: toIso(params.currentPeriodEnd),
    },
    { onConflict: "email" }
  );
}

/**
 * Called from checkout.session.completed (mode=payment, plan=lifetime).
 * No Stripe subscription id exists for a one-time payment -- stripeCustomerId
 * is optional too since Checkout doesn't always create/attach a Customer
 * for a one-time payment unless configured to. subscription_status is
 * always "active" (permanent, no period to track) once this is called.
 */
export async function upsertLifetimeFromCheckout(params: {
  email: string;
  stripeCustomerId: string | null;
}) {
  if (!SUPABASE_CONFIGURED) return;
  const supabase = getSupabaseAdmin()!;
  const normalized = normalizeEmail(params.email);
  if (!normalized) return;

  await supabase.from("subscriptions").upsert(
    {
      email: normalized,
      stripe_customer_id: params.stripeCustomerId,
      // Explicitly cleared: if this email previously had a Plus
      // subscription id here, leaving it in place would let a later
      // customer.subscription.updated/deleted webhook for that old
      // subscription match this row by stripe_subscription_id and flip
      // subscription_status away from "active", silently breaking
      // isLifetimeActive.
      stripe_subscription_id: null,
      subscription_status: "active",
      subscription_plan: "lifetime",
      current_period_end: null,
    },
    { onConflict: "email" }
  );
}

/** Called from customer.subscription.updated/deleted -- no email in the payload, look up by subscription id. */
export async function updateSubscriptionByStripeId(params: {
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: number | null;
}): Promise<SubscriptionRecord | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = getSupabaseAdmin()!;

  const { data } = await supabase
    .from("subscriptions")
    .update({
      subscription_status: params.status,
      current_period_end: toIso(params.currentPeriodEnd),
    })
    .eq("stripe_subscription_id", params.stripeSubscriptionId)
    .select("email, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan, current_period_end")
    .maybeSingle();

  return (data as SubscriptionRecord) ?? null;
}
