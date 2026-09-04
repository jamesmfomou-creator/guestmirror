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

export function isPlusActive(subscription: SubscriptionRecord | null): boolean {
  return !!subscription && ACTIVE_STATUSES.includes(subscription.subscription_status);
}

export async function hasActivePlusSubscription(
  email: string | null | undefined
): Promise<boolean> {
  return isPlusActive(await getSubscriptionByEmail(email));
}

/** ONE_TIME_UNLOCKED (this specific analysis was paid for) OR PLUS_ACTIVE. */
export async function hasFullAccess(analysis: {
  is_unlocked: boolean;
  email: string | null;
}): Promise<boolean> {
  if (analysis.is_unlocked) return true;
  return hasActivePlusSubscription(analysis.email);
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
