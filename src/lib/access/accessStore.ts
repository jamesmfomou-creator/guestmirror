import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BRAND_SLUG } from "@/lib/brand";
import { lockAnalysis, unlockAnalysis } from "@/lib/store";

// Persistence for pricing v2 rights (supabase/migrations/0010_pricing_v2.sql):
// access grants (Conciergerie subscriptions, lifetime purchases), credit
// usage, the Stripe event journal, payments, email verification codes and
// access sessions.
//
// Supabase in production. Without Supabase (local dev / demo mode) the same
// operations run on one JSON file next to the demo analysis store, so the
// whole purchase flow can be exercised locally without touching production
// data. The file fallback is single-process only and is never used when
// Supabase is configured.

export type GrantKind = "conciergerie" | "lifetime";
export type GrantStatus =
  | "incomplete"
  | "active"
  | "trialing"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "revoked"
  | "suspended";

export interface AccessGrant {
  id: string;
  email: string;
  kind: GrantKind;
  status: GrantStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripePriceId: string | null;
  quotaPerPeriod: number | null;
  paidPeriodStart: string | null;
  paidPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingUnlockAnalysisId: string | null;
  statusEventAt: string | null;
  revokedReason: string | null;
  createdAt: string;
}

export type CreditOutcome = "consumed" | "already" | "quota_exhausted" | "inactive" | "no_grant";

export interface PaymentRecord {
  id: string;
  analysisId: string | null;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  amount: number | null;
  status: string;
  plan: string | null;
  stripePriceId: string | null;
  refundedAt: string | null;
  disputedAt: string | null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

// ---------------------------------------------------------------------------
// File fallback

interface FileDb {
  grants: Record<string, unknown>[];
  credits: { id: string; grant_id: string; analysis_id: string; period_start: string; created_at: string }[];
  events: Record<string, { type: string; processed_at: string | null; outcome: string | null }>;
  verifications: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}

const FILE_DB = path.join(os.tmpdir(), `${BRAND_SLUG}-demo-store`, "access-db.json");

function readDb(): FileDb {
  try {
    return JSON.parse(fs.readFileSync(FILE_DB, "utf-8")) as FileDb;
  } catch {
    return { grants: [], credits: [], events: {}, verifications: [], sessions: [], payments: [] };
  }
}

function writeDb(db: FileDb) {
  fs.mkdirSync(path.dirname(FILE_DB), { recursive: true });
  fs.writeFileSync(FILE_DB, JSON.stringify(db), "utf-8");
}

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Grants

type GrantRow = Record<string, unknown>;

function mapGrant(r: GrantRow): AccessGrant {
  return {
    id: r.id as string,
    email: r.email as string,
    kind: r.kind as GrantKind,
    status: r.status as GrantStatus,
    stripeCustomerId: (r.stripe_customer_id as string) ?? null,
    stripeSubscriptionId: (r.stripe_subscription_id as string) ?? null,
    stripeCheckoutSessionId: (r.stripe_checkout_session_id as string) ?? null,
    stripePaymentIntentId: (r.stripe_payment_intent_id as string) ?? null,
    stripePriceId: (r.stripe_price_id as string) ?? null,
    quotaPerPeriod: (r.quota_per_period as number) ?? null,
    paidPeriodStart: (r.paid_period_start as string) ?? null,
    paidPeriodEnd: (r.paid_period_end as string) ?? null,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    pendingUnlockAnalysisId: (r.pending_unlock_analysis_id as string) ?? null,
    statusEventAt: (r.status_event_at as string) ?? null,
    revokedReason: (r.revoked_reason as string) ?? null,
    createdAt: (r.created_at as string) ?? nowIso(),
  };
}

export async function listGrantsByEmail(email: string | null | undefined): Promise<AccessGrant[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  if (SUPABASE_CONFIGURED) {
    const { data, error } = await getSupabaseAdmin()!
      .from("access_grants")
      .select("*")
      .eq("email", normalized)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`access_grants lookup failed: ${error.message}`);
    return (data ?? []).map((r) => mapGrant(r as GrantRow));
  }
  return readDb()
    .grants.filter((g) => g.email === normalized)
    .map(mapGrant);
}

async function findGrant(column: "stripe_subscription_id" | "stripe_checkout_session_id" | "stripe_payment_intent_id" | "id", value: string): Promise<AccessGrant | null> {
  if (SUPABASE_CONFIGURED) {
    const { data, error } = await getSupabaseAdmin()!.from("access_grants").select("*").eq(column, value).maybeSingle();
    if (error) throw new Error(`access_grants lookup failed: ${error.message}`);
    return data ? mapGrant(data as GrantRow) : null;
  }
  const row = readDb().grants.find((g) => g[column] === value);
  return row ? mapGrant(row) : null;
}

export const getGrantById = (id: string) => findGrant("id", id);
export const getGrantBySubscriptionId = (id: string) => findGrant("stripe_subscription_id", id);
export const getGrantByCheckoutSession = (id: string) => findGrant("stripe_checkout_session_id", id);
export const getGrantByPaymentIntent = (id: string) => findGrant("stripe_payment_intent_id", id);

async function insertGrant(row: Record<string, unknown>): Promise<AccessGrant> {
  const full = { id: randomUUID(), created_at: nowIso(), updated_at: nowIso(), cancel_at_period_end: false, ...row };
  if (SUPABASE_CONFIGURED) {
    const { data, error } = await getSupabaseAdmin()!
      .from("access_grants")
      .insert(full as never)
      .select("*")
      .single();
    if (error) throw new Error(`access_grants insert failed: ${error.message}`);
    return mapGrant(data as GrantRow);
  }
  const db = readDb();
  db.grants.push(full);
  writeDb(db);
  return mapGrant(full);
}

async function updateGrant(id: string, patch: Record<string, unknown>): Promise<AccessGrant | null> {
  if (SUPABASE_CONFIGURED) {
    const { data, error } = await getSupabaseAdmin()!
      .from("access_grants")
      .update(patch as never)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`access_grants update failed: ${error.message}`);
    return data ? mapGrant(data as GrantRow) : null;
  }
  const db = readDb();
  const row = db.grants.find((g) => g.id === id);
  if (!row) return null;
  Object.assign(row, patch, { updated_at: nowIso() });
  writeDb(db);
  return mapGrant(row);
}

/** Creates the Conciergerie grant for a subscription, or updates its references. Idempotent. */
export async function ensureConciergerieGrant(params: {
  email: string;
  subscriptionId: string;
  customerId: string | null;
  priceId: string | null;
  quotaPerPeriod: number;
  pendingUnlockAnalysisId?: string | null;
  checkoutSessionId?: string | null;
}): Promise<AccessGrant> {
  const existing = await getGrantBySubscriptionId(params.subscriptionId);
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.stripeCheckoutSessionId && params.checkoutSessionId) patch.stripe_checkout_session_id = params.checkoutSessionId;
    if (!existing.stripeCustomerId && params.customerId) patch.stripe_customer_id = params.customerId;
    if (!existing.stripePriceId && params.priceId) patch.stripe_price_id = params.priceId;
    // Safe to set even after a redelivery: unlocking a report with a credit is
    // idempotent (a report never costs two credits, see consumeCredit).
    if (!existing.pendingUnlockAnalysisId && params.pendingUnlockAnalysisId) {
      patch.pending_unlock_analysis_id = params.pendingUnlockAnalysisId;
    }
    return Object.keys(patch).length ? ((await updateGrant(existing.id, patch)) ?? existing) : existing;
  }
  try {
    return await insertGrant({
      email: normalizeEmail(params.email),
      kind: "conciergerie",
      status: "incomplete",
      stripe_subscription_id: params.subscriptionId,
      stripe_customer_id: params.customerId,
      stripe_price_id: params.priceId,
      quota_per_period: params.quotaPerPeriod,
      pending_unlock_analysis_id: params.pendingUnlockAnalysisId ?? null,
      stripe_checkout_session_id: params.checkoutSessionId ?? null,
    });
  } catch (err) {
    // A concurrent delivery inserted it first (unique subscription id).
    const winner = await getGrantBySubscriptionId(params.subscriptionId);
    if (winner) return winner;
    throw err;
  }
}

/** Creates the lifetime grant for a paid checkout session. Idempotent. */
export async function ensureLifetimeGrant(params: {
  email: string;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  customerId: string | null;
  priceId: string | null;
}): Promise<AccessGrant> {
  const existing = await getGrantByCheckoutSession(params.checkoutSessionId);
  if (existing) return existing;
  try {
    return await insertGrant({
      email: normalizeEmail(params.email),
      kind: "lifetime",
      status: "active",
      stripe_checkout_session_id: params.checkoutSessionId,
      stripe_payment_intent_id: params.paymentIntentId,
      stripe_customer_id: params.customerId,
      stripe_price_id: params.priceId,
      quota_per_period: null,
    });
  } catch (err) {
    const winner = await getGrantByCheckoutSession(params.checkoutSessionId);
    if (winner) return winner;
    throw err;
  }
}

const FINAL_STATUSES: GrantStatus[] = ["revoked"];

/**
 * Applies a subscription status from Stripe, unless a newer event already set
 * one (events can arrive out of order). A revoked grant (refund) stays revoked.
 */
export async function applySubscriptionStatus(params: {
  subscriptionId: string;
  status: GrantStatus;
  cancelAtPeriodEnd: boolean;
  eventAt: Date;
}): Promise<AccessGrant | null> {
  const grant = await getGrantBySubscriptionId(params.subscriptionId);
  if (!grant) return null;
  if (FINAL_STATUSES.includes(grant.status)) return grant;
  if (grant.statusEventAt && new Date(grant.statusEventAt).getTime() > params.eventAt.getTime()) return grant;
  return updateGrant(grant.id, {
    status: params.status,
    cancel_at_period_end: params.cancelAtPeriodEnd,
    status_event_at: params.eventAt.toISOString(),
  });
}

/**
 * Opens a paid period (from a paid invoice). Only ever moves forward: a late,
 * older invoice never shrinks the current period. A paid invoice also means
 * the subscription is in good standing, unless it was ended or revoked.
 */
export async function applyPaidPeriod(params: {
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<AccessGrant | null> {
  const grant = await getGrantBySubscriptionId(params.subscriptionId);
  if (!grant) return null;
  if (grant.paidPeriodEnd && new Date(grant.paidPeriodEnd).getTime() >= params.periodEnd.getTime()) return grant;
  const patch: Record<string, unknown> = {
    paid_period_start: params.periodStart.toISOString(),
    paid_period_end: params.periodEnd.toISOString(),
  };
  if (["incomplete", "past_due", "unpaid"].includes(grant.status)) patch.status = "active";
  return updateGrant(grant.id, patch);
}

export async function setGrantStatus(grantId: string, status: GrantStatus, reason: string | null): Promise<AccessGrant | null> {
  return updateGrant(grantId, { status, revoked_reason: reason });
}

export async function clearPendingUnlock(grantId: string): Promise<void> {
  await updateGrant(grantId, { pending_unlock_analysis_id: null });
}

// ---------------------------------------------------------------------------
// Credits

export async function consumeCredit(
  grantId: string,
  analysisId: string
): Promise<{ outcome: CreditOutcome; used: number; quota: number }> {
  if (SUPABASE_CONFIGURED) {
    const { data, error } = await getSupabaseAdmin()!.rpc("consume_grant_credit", {
      p_grant_id: grantId,
      p_analysis_id: analysisId,
    });
    if (error) throw new Error(`consume_grant_credit failed: ${error.message}`);
    const row = (data ?? [])[0];
    return { outcome: (row?.outcome ?? "no_grant") as CreditOutcome, used: row?.used ?? 0, quota: row?.quota ?? 0 };
  }

  // File fallback: same rules as the SQL function (single process, no concurrency).
  const db = readDb();
  const g = db.grants.find((x) => x.id === grantId);
  if (!g) return { outcome: "no_grant", used: 0, quota: 0 };
  const grant = mapGrant(g);
  const usedInPeriod = () => db.credits.filter((c) => c.grant_id === grantId && c.period_start === grant.paidPeriodStart).length;
  if (db.credits.some((c) => c.analysis_id === analysisId)) {
    return { outcome: "already", used: usedInPeriod(), quota: grant.quotaPerPeriod ?? 0 };
  }
  const active =
    grant.kind === "conciergerie" &&
    ["active", "trialing"].includes(grant.status) &&
    grant.paidPeriodStart !== null &&
    grant.paidPeriodEnd !== null &&
    new Date(grant.paidPeriodEnd).getTime() > Date.now();
  if (!active) return { outcome: "inactive", used: 0, quota: grant.quotaPerPeriod ?? 0 };
  const used = usedInPeriod();
  if (used >= (grant.quotaPerPeriod ?? 0)) return { outcome: "quota_exhausted", used, quota: grant.quotaPerPeriod ?? 0 };
  db.credits.push({ id: randomUUID(), grant_id: grantId, analysis_id: analysisId, period_start: grant.paidPeriodStart as string, created_at: nowIso() });
  writeDb(db);
  await unlockAnalysis(analysisId, "paid");
  return { outcome: "consumed", used: used + 1, quota: grant.quotaPerPeriod ?? 0 };
}

/** Credits used in the grant's current paid period. */
export async function creditsUsedInPeriod(grant: AccessGrant): Promise<number> {
  if (!grant.paidPeriodStart) return 0;
  if (SUPABASE_CONFIGURED) {
    const { count, error } = await getSupabaseAdmin()!
      .from("credit_usages")
      .select("id", { count: "exact", head: true })
      .eq("grant_id", grant.id)
      .eq("period_start", grant.paidPeriodStart);
    if (error) throw new Error(`credit_usages count failed: ${error.message}`);
    return count ?? 0;
  }
  return readDb().credits.filter((c) => c.grant_id === grant.id && c.period_start === grant.paidPeriodStart).length;
}

// ---------------------------------------------------------------------------
// Stripe event journal

export type EventClaim = "new" | "retry" | "already_processed";

/** Records an event before handling it. A redelivery of a processed event is skipped. */
export async function claimStripeEvent(event: { id: string; type: string; livemode: boolean; created: number }): Promise<EventClaim> {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      stripe_created_at: new Date(event.created * 1000).toISOString(),
    });
    if (!error) return "new";
    if (error.code !== "23505") throw new Error(`stripe_events insert failed: ${error.message}`);
    const { data } = await supabase.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
    return data?.processed_at ? "already_processed" : "retry";
  }
  const db = readDb();
  const existing = db.events[event.id];
  if (existing) return existing.processed_at ? "already_processed" : "retry";
  db.events[event.id] = { type: event.type, processed_at: null, outcome: null };
  writeDb(db);
  return "new";
}

export async function completeStripeEvent(eventId: string, outcome: string): Promise<void> {
  if (SUPABASE_CONFIGURED) {
    const { error } = await getSupabaseAdmin()!
      .from("stripe_events")
      .update({ processed_at: nowIso(), outcome })
      .eq("id", eventId);
    if (error) throw new Error(`stripe_events update failed: ${error.message}`);
    return;
  }
  const db = readDb();
  if (db.events[eventId]) {
    db.events[eventId].processed_at = nowIso();
    db.events[eventId].outcome = outcome;
    writeDb(db);
  }
}

// ---------------------------------------------------------------------------
// Payments (one row per paid checkout session; legacy rows keep working)

function mapPayment(r: Record<string, unknown>): PaymentRecord {
  return {
    id: r.id as string,
    analysisId: (r.analysis_id as string) ?? null,
    stripeSessionId: (r.stripe_session_id as string) ?? null,
    stripePaymentIntentId: (r.stripe_payment_intent_id as string) ?? null,
    amount: (r.amount as number) ?? null,
    status: r.status as string,
    plan: (r.plan as string) ?? null,
    stripePriceId: (r.stripe_price_id as string) ?? null,
    refundedAt: (r.refunded_at as string) ?? null,
    disputedAt: (r.disputed_at as string) ?? null,
  };
}

/** Inserts the payment once per checkout session. Returns false if it already existed. */
export async function recordPaymentOnce(params: {
  analysisId: string | null;
  sessionId: string;
  paymentIntentId: string | null;
  amount: number | null;
  status: "paid" | "pending" | "failed";
  plan: string;
  priceId: string | null;
}): Promise<boolean> {
  const row = {
    id: randomUUID(),
    analysis_id: params.analysisId,
    stripe_session_id: params.sessionId,
    stripe_payment_intent_id: params.paymentIntentId,
    amount: params.amount,
    status: params.status,
    plan: params.plan,
    stripe_price_id: params.priceId,
  };
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const { data: existing } = await supabase.from("payments").select("id, status").eq("stripe_session_id", params.sessionId).maybeSingle();
    if (existing) {
      if (existing.status !== params.status && params.status === "paid") {
        await supabase.from("payments").update({ status: "paid", stripe_payment_intent_id: params.paymentIntentId }).eq("id", existing.id);
        return true;
      }
      return false;
    }
    const { error } = await supabase.from("payments").insert(row);
    if (error) {
      if (error.code === "23505") return false;
      throw new Error(`payments insert failed: ${error.message}`);
    }
    return true;
  }
  const db = readDb();
  const existing = db.payments.find((p) => p.stripe_session_id === params.sessionId);
  if (existing) {
    if (existing.status !== params.status && params.status === "paid") {
      Object.assign(existing, { status: "paid", stripe_payment_intent_id: params.paymentIntentId });
      writeDb(db);
      return true;
    }
    return false;
  }
  db.payments.push({ ...row, created_at: nowIso() });
  writeDb(db);
  return true;
}

export async function findPaymentByIntent(paymentIntentId: string): Promise<PaymentRecord | null> {
  if (SUPABASE_CONFIGURED) {
    const { data, error } = await getSupabaseAdmin()!
      .from("payments")
      .select("*")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`payments lookup failed: ${error.message}`);
    return data ? mapPayment(data as Record<string, unknown>) : null;
  }
  const row = readDb().payments.find((p) => p.stripe_payment_intent_id === paymentIntentId);
  return row ? mapPayment(row) : null;
}

export async function markPayment(paymentId: string, patch: { refunded?: boolean; disputed?: boolean | null }): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.refunded) Object.assign(update, { refunded_at: nowIso(), status: "refunded" });
  if (patch.disputed === true) update.disputed_at = nowIso();
  if (patch.disputed === null) update.disputed_at = null;
  if (SUPABASE_CONFIGURED) {
    const { error } = await getSupabaseAdmin()!.from("payments").update(update as never).eq("id", paymentId);
    if (error) throw new Error(`payments update failed: ${error.message}`);
    return;
  }
  const db = readDb();
  const row = db.payments.find((p) => p.id === paymentId);
  if (row) {
    Object.assign(row, update);
    writeDb(db);
  }
}

/** Re-locks a report whose payment was refunded or disputed; unlocks it again if a dispute is won. */
export async function setReportUnlocked(analysisId: string, unlocked: boolean): Promise<void> {
  if (unlocked) await unlockAnalysis(analysisId, "paid");
  else await lockAnalysis(analysisId);
}

// ---------------------------------------------------------------------------
// Email verification codes and access sessions

export interface VerificationRow {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  createdAt: string;
}

function mapVerification(r: Record<string, unknown>): VerificationRow {
  return {
    id: r.id as string,
    email: r.email as string,
    codeHash: r.code_hash as string,
    expiresAt: r.expires_at as string,
    attempts: (r.attempts as number) ?? 0,
    consumedAt: (r.consumed_at as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function insertVerification(email: string, codeHash: string, expiresAt: Date): Promise<void> {
  const row = { id: randomUUID(), email, code_hash: codeHash, expires_at: expiresAt.toISOString(), attempts: 0, created_at: nowIso() };
  if (SUPABASE_CONFIGURED) {
    const { error } = await getSupabaseAdmin()!.from("email_verifications").insert(row);
    if (error) throw new Error(`email_verifications insert failed: ${error.message}`);
    return;
  }
  const db = readDb();
  db.verifications.push(row);
  writeDb(db);
}

export async function recentVerifications(email: string, since: Date): Promise<VerificationRow[]> {
  if (SUPABASE_CONFIGURED) {
    const { data, error } = await getSupabaseAdmin()!
      .from("email_verifications")
      .select("*")
      .eq("email", email)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(`email_verifications lookup failed: ${error.message}`);
    return (data ?? []).map((r) => mapVerification(r as Record<string, unknown>));
  }
  return readDb()
    .verifications.filter((v) => v.email === email && new Date(v.created_at as string).getTime() >= since.getTime())
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(mapVerification);
}

export async function updateVerification(id: string, patch: { attempts?: number; consumed?: boolean }): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.attempts !== undefined) update.attempts = patch.attempts;
  if (patch.consumed) update.consumed_at = nowIso();
  if (SUPABASE_CONFIGURED) {
    const { error } = await getSupabaseAdmin()!.from("email_verifications").update(update as never).eq("id", id);
    if (error) throw new Error(`email_verifications update failed: ${error.message}`);
    return;
  }
  const db = readDb();
  const row = db.verifications.find((v) => v.id === id);
  if (row) {
    Object.assign(row, update);
    writeDb(db);
  }
}

export async function insertSession(
  tokenHash: string,
  email: string,
  expiresAt: Date,
  scopeCheckoutSessionId: string | null = null
): Promise<void> {
  const row = {
    id: randomUUID(),
    token_hash: tokenHash,
    email,
    scope_checkout_session_id: scopeCheckoutSessionId,
    expires_at: expiresAt.toISOString(),
    created_at: nowIso(),
  };
  if (SUPABASE_CONFIGURED) {
    const { error } = await getSupabaseAdmin()!.from("access_sessions").insert(row);
    if (error) throw new Error(`access_sessions insert failed: ${error.message}`);
    return;
  }
  const db = readDb();
  db.sessions.push(row);
  writeDb(db);
}

export interface SessionIdentity {
  email: string;
  /** Non-null: only the rights bought in this checkout session are usable. */
  scopeCheckoutSessionId: string | null;
}

export async function findSession(tokenHash: string): Promise<SessionIdentity | null> {
  if (SUPABASE_CONFIGURED) {
    const { data, error } = await getSupabaseAdmin()!
      .from("access_sessions")
      .select("email, expires_at, scope_checkout_session_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    return { email: data.email, scopeCheckoutSessionId: data.scope_checkout_session_id ?? null };
  }
  const row = readDb().sessions.find((s) => s.token_hash === tokenHash);
  if (!row || new Date(row.expires_at as string).getTime() <= Date.now()) return null;
  return { email: row.email as string, scopeCheckoutSessionId: (row.scope_checkout_session_id as string) ?? null };
}

// ---------------------------------------------------------------------------
// Legacy promise: the 4,90 € single analysis was sold with "1 re-test après
// correction". The first re-test of a report bought at that price is unlocked
// for free, once per report. Not part of the v2 offers.

const LEGACY_ONE_TIME_AMOUNT_CENTS = 490;

export async function isEligibleForLegacyRetest(previousAnalysisId: string): Promise<boolean> {
  if (!SUPABASE_CONFIGURED) return false;
  const supabase = getSupabaseAdmin()!;
  const { data: paid, error } = await supabase
    .from("payments")
    .select("id")
    .eq("analysis_id", previousAnalysisId)
    .eq("amount", LEGACY_ONE_TIME_AMOUNT_CENTS)
    .eq("status", "paid")
    .is("refunded_at", null)
    .limit(1);
  if (error || !paid || paid.length === 0) return false;
  const { count } = await supabase
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .eq("previous_analysis_id", previousAnalysisId)
    .eq("is_unlocked", true);
  return (count ?? 0) === 0;
}
