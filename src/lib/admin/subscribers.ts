import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { classifyPrice } from "@/lib/plans";

// Admin "Abonnés & MRR": every GuestMirror subscription, read live from Stripe
// (the source of truth for who pays), so a new subscriber appears with no
// code or data change. READ ONLY: list calls only, nothing is written.
//
// The Stripe account is shared with other businesses: only subscriptions on
// a GuestMirror recurring price (lib/plans.ts classifyPrice: Conciergerie,
// legacy Plus) are kept.

export type SubscriberOffer = "conciergerie" | "legacy_plus";

export interface SubscriberRow {
  id: string;
  name: string | null;
  email: string | null;
  offer: SubscriberOffer;
  /** Monthly amount after a coupon, in euros. */
  monthlyEur: number;
  status: Stripe.Subscription.Status;
  /** Counted in MRR: active/trialing/past_due. */
  countsInMrr: boolean;
  cancelAtPeriodEnd: boolean;
  /** Next renewal (or end of access when a cancellation is scheduled), ISO. */
  periodEnd: string | null;
  startedAt: string;
  canceledAt: string | null;
  cancelReason: string | null;
  lastInvoice: { status: string | null; paidEur: number; dueEur: number; createdAt: string } | null;
  /** Renewals already paid (subscription_cycle invoices). Filled by the caller when known. */
  paidMonths: number | null;
  /** Why this row needs attention, if it does. */
  alert: "payment_failed" | "cancel_scheduled" | "unpaid_invoice" | null;
}

export interface SubscribersSnapshot {
  configured: boolean;
  error: string | null;
  rows: SubscriberRow[];
  mrrEur: number;
  payingCount: number;
  /** MRR that disappears at the end of the period (cancellation scheduled). */
  mrrEndingEur: number;
}

const MRR_STATUSES: Stripe.Subscription.Status[] = ["active", "trialing", "past_due"];
const iso = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString() : null);

function monthlyOf(sub: Stripe.Subscription): number {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (!price?.unit_amount) return 0;
  let amount = (price.unit_amount * (item.quantity ?? 1)) / 100;
  const interval = price.recurring?.interval ?? "month";
  const count = price.recurring?.interval_count ?? 1;
  if (interval === "year") amount = amount / (12 * count);
  else if (interval === "week") amount = (amount * 52) / (12 * count);
  else if (interval === "day") amount = (amount * 365) / (12 * count);
  else amount = amount / count;
  // Coupon: newer API versions put discounts in `discounts`, older in `discount`.
  const raw = sub as unknown as { discount?: { coupon?: Stripe.Coupon } | null; discounts?: (string | { coupon?: Stripe.Coupon; source?: { coupon?: Stripe.Coupon } })[] };
  const coupons: Stripe.Coupon[] = [];
  if (raw.discount?.coupon) coupons.push(raw.discount.coupon);
  for (const d of raw.discounts ?? []) {
    if (typeof d === "object" && d) {
      const c = d.coupon ?? d.source?.coupon;
      if (c && typeof c === "object") coupons.push(c);
    }
  }
  for (const c of coupons) {
    if (c.duration === "once") continue;
    if (c.percent_off) amount *= 1 - c.percent_off / 100;
    else if (c.amount_off) amount = Math.max(0, amount - c.amount_off / 100);
  }
  return Math.round(amount * 100) / 100;
}

/** One row per GuestMirror subscription; null for any other business' subscription. Pure. */
export function toSubscriberRow(sub: Stripe.Subscription): SubscriberRow | null {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const kind = classifyPrice(priceId);
  const offer: SubscriberOffer | null =
    kind?.kind === "legacy_plus" ? "legacy_plus" : kind?.kind === "current" && kind.offer === "conciergerie" ? "conciergerie" : null;
  if (!offer) return null;

  const customer = sub.customer && typeof sub.customer === "object" && !("deleted" in sub.customer && sub.customer.deleted) ? (sub.customer as Stripe.Customer) : null;
  const inv = sub.latest_invoice && typeof sub.latest_invoice === "object" ? (sub.latest_invoice as Stripe.Invoice) : null;
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined;
  const periodEnd = iso(item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end);
  const countsInMrr = MRR_STATUSES.includes(sub.status);
  const lastInvoice = inv ? { status: inv.status ?? null, paidEur: (inv.amount_paid ?? 0) / 100, dueEur: (inv.amount_due ?? 0) / 100, createdAt: iso(inv.created)! } : null;

  let alert: SubscriberRow["alert"] = null;
  if (sub.status === "past_due" || sub.status === "unpaid" || (sub.status === "canceled" && sub.cancellation_details?.reason === "payment_failed")) alert = "payment_failed";
  else if (countsInMrr && sub.cancel_at_period_end) alert = "cancel_scheduled";
  else if (lastInvoice && lastInvoice.status === "open" && lastInvoice.dueEur > 0) alert = "unpaid_invoice";

  return {
    id: sub.id,
    name: customer?.name ?? null,
    email: customer?.email ?? null,
    offer,
    monthlyEur: monthlyOf(sub),
    status: sub.status,
    countsInMrr,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    periodEnd,
    startedAt: iso(sub.start_date ?? sub.created)!,
    canceledAt: iso(sub.canceled_at),
    cancelReason: sub.cancellation_details?.reason ?? null,
    lastInvoice,
    paidMonths: null,
    alert,
  };
}

/** Active subscribers first (next renewal first), then ended ones (most recent first). Pure. */
export function summarize(rows: SubscriberRow[]): Omit<SubscribersSnapshot, "configured" | "error"> {
  const sorted = [...rows].sort((a, b) => {
    if (a.countsInMrr !== b.countsInMrr) return a.countsInMrr ? -1 : 1;
    if (a.countsInMrr) return (a.periodEnd ?? "").localeCompare(b.periodEnd ?? "");
    return (b.canceledAt ?? b.startedAt).localeCompare(a.canceledAt ?? a.startedAt);
  });
  const paying = sorted.filter((r) => r.countsInMrr);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    rows: sorted,
    mrrEur: round(paying.reduce((s, r) => s + r.monthlyEur, 0)),
    payingCount: paying.length,
    mrrEndingEur: round(paying.filter((r) => r.cancelAtPeriodEnd).reduce((s, r) => s + r.monthlyEur, 0)),
  };
}

export async function getSubscribersSnapshot(): Promise<SubscribersSnapshot> {
  const empty = { rows: [], mrrEur: 0, payingCount: 0, mrrEndingEur: 0 };
  if (!process.env.STRIPE_SECRET_KEY) return { configured: false, error: null, ...empty };
  try {
    const stripe = getStripe();
    const rows: SubscriberRow[] = [];
    for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.customer", "data.latest_invoice"] })) {
      const row = toSubscriberRow(sub);
      if (row) rows.push(row);
    }
    // Paid invoices per subscription (renewals actually collected). Few rows: one list call each.
    await Promise.all(
      rows.map(async (r) => {
        try {
          const invoices = await stripe.invoices.list({ subscription: r.id, status: "paid", limit: 100 });
          r.paidMonths = invoices.data.filter((i) => (i.amount_paid ?? 0) > 0).length;
        } catch {
          r.paidMonths = null;
        }
      })
    );
    return { configured: true, error: null, ...summarize(rows) };
  } catch (err) {
    console.error("[admin] subscribers lookup failed:", err instanceof Error ? err.message : err);
    return { configured: true, error: "Stripe n'a pas pu être interrogé.", ...empty };
  }
}
