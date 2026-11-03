import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
  AnalysisInput,
  AnalysisRecord,
  AnalysisResult,
  PaymentStatus,
  PropertyCountRange,
  UserType,
} from "@/lib/types";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BRAND_SLUG } from "@/lib/brand";

// Filesystem-backed fallback store. Works for local dev / demo mode where
// no database is configured yet. An in-memory Map does NOT survive here:
// Next.js dev (and most serverless deployments) can instantiate route
// modules in separate contexts per request, so a module-level Map isn't
// reliably shared between the route that creates an analysis and the one
// that reads it back. The filesystem is. Not durable across machines --
// Supabase should be configured before real production traffic (see
// README).
const STORE_DIR = path.join(os.tmpdir(), `${BRAND_SLUG}-demo-store`);

function recordPath(id: string) {
  return path.join(STORE_DIR, `${id}.json`);
}

function readLocalRecord(id: string): AnalysisRecord | null {
  try {
    return JSON.parse(fs.readFileSync(recordPath(id), "utf-8")) as AnalysisRecord;
  } catch {
    return null;
  }
}

function writeLocalRecord(record: AnalysisRecord) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(recordPath(record.id), JSON.stringify(record), "utf-8");
}

function deleteLocalRecord(id: string) {
  try {
    fs.unlinkSync(recordPath(id));
  } catch {
    // already gone
  }
}

function nowIso() {
  return new Date().toISOString();
}

/** Shared row -> AnalysisRecord mapping, used by every read path (getAnalysis, the attempt_id dedup lookup below) so they can't drift apart. */
function mapAnalysisRow(row: Record<string, unknown>): AnalysisRecord {
  const images = ((row.analysis_images as { storage_path: string; position: number }[]) || [])
    .sort((a, b) => a.position - b.position)
    .map((img) => img.storage_path);
  return {
    id: row.id as string,
    user_id: (row.user_id as string) ?? null,
    email: (row.email as string) ?? null,
    listing_url: (row.listing_url as string) ?? null,
    city: (row.city as string) ?? null,
    property_type: (row.property_type as string) ?? null,
    guest_capacity: (row.guest_capacity as string) ?? null,
    nightly_price: (row.nightly_price as string) ?? null,
    overall_score: row.overall_score as number,
    result: row.result_json as AnalysisResult,
    images,
    is_unlocked: row.is_unlocked as boolean,
    payment_status: row.payment_status as PaymentStatus,
    previous_analysis_id: (row.previous_analysis_id as string) ?? null,
    user_type: (row.user_type as UserType) ?? null,
    property_count_range: (row.property_count_range as PropertyCountRange) ?? null,
    promo_code: (row.promo_code as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function createAnalysis(params: {
  input: AnalysisInput;
  images: string[];
  result: AnalysisResult;
  email?: string | null;
  userId?: string | null;
  previousAnalysisId?: string | null;
  isUnlocked?: boolean;
  userType?: UserType | null;
  propertyCountRange?: PropertyCountRange | null;
  promoCode?: string | null;
  attemptId?: string | null;
}): Promise<AnalysisRecord> {
  // A double submission (double-click, client retry after a slow
  // response) would otherwise pay for a second full AI call and create a
  // second analysis row for the exact same attempt. The client already
  // guards against this (AnalyzeWizard disables the button while
  // submitting), but nothing enforced it server-side -- check-then-insert
  // here, same dedup pattern already used for Stripe events, so a
  // same-attempt resubmission returns the existing analysis instead of
  // creating a duplicate. Requires the attempt_id column + unique index
  // from supabase/migrations/0008_reliability.sql to fully close the race
  // between two concurrent requests; this check alone already covers the
  // much more common sequential-retry case.
  if (params.attemptId && SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const { data: existing } = await supabase
      .from("analyses")
      .select("*, analysis_images(storage_path, position)")
      .eq("attempt_id", params.attemptId)
      .maybeSingle();
    if (existing) return mapAnalysisRow(existing as Record<string, unknown>);
  }

  const record: AnalysisRecord = {
    id: randomUUID(),
    user_id: params.userId ?? null,
    email: params.email ?? null,
    listing_url: params.input.listing_url,
    city: params.input.city,
    property_type: params.input.property_type,
    guest_capacity: params.input.guest_capacity,
    nightly_price: params.input.nightly_price,
    overall_score: params.result.overall_score,
    result: params.result,
    images: params.images,
    is_unlocked: params.isUnlocked ?? false,
    payment_status: "none",
    previous_analysis_id: params.previousAnalysisId ?? null,
    user_type: params.userType ?? null,
    property_count_range: params.propertyCountRange ?? null,
    promo_code: params.promoCode ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase.from("analyses").insert({
      id: record.id,
      user_id: record.user_id,
      email: record.email,
      listing_url: record.listing_url,
      city: record.city,
      property_type: record.property_type,
      guest_capacity: record.guest_capacity,
      nightly_price: record.nightly_price,
      overall_score: record.overall_score,
      result_json: record.result,
      is_unlocked: record.is_unlocked,
      payment_status: record.payment_status,
      previous_analysis_id: record.previous_analysis_id,
      user_type: record.user_type,
      property_count_range: record.property_count_range,
      promo_code: record.promo_code,
      attempt_id: params.attemptId ?? null,
    });
    if (error) throw new Error(`Supabase insert failed: ${error.message}`);

    if (record.images.length) {
      await supabase.from("analysis_images").insert(
        record.images.map((storage_path, position) => ({
          analysis_id: record.id,
          storage_path,
          position,
        }))
      );
    }
    return record;
  }

  writeLocalRecord(record);
  return record;
}

export async function getAnalysis(id: string): Promise<AnalysisRecord | null> {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from("analyses")
      .select("*, analysis_images(storage_path, position)")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return mapAnalysisRow(data as Record<string, unknown>);
  }

  return readLocalRecord(id);
}

/**
 * Real, non-invented number for the landing page's social proof line (see
 * AGENTS.md-adjacent instruction: never fabricate a number). Total count
 * of analyses ever created, free or paid -- the closest existing metric to
 * "annonces analysées". Falls back to null (component renders nothing)
 * when Supabase isn't configured rather than guessing.
 */
export async function getTotalAnalysesCount(): Promise<number | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = getSupabaseAdmin()!;
  const { count, error } = await supabase.from("analyses").select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? null;
}

/**
 * Free-trial links (/analyze?promo=<code>): grants the first
 * max_free_unlocks analyses submitted with a given code a real unlock,
 * no payment. Returns null for an unknown code -- the caller treats that
 * exactly like "no code was given" rather than erroring, so a typo'd or
 * expired link never breaks the analyze flow.
 */
export async function getPromoCodeStatus(
  code: string
): Promise<{ maxFreeUnlocks: number; usedCount: number } | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = getSupabaseAdmin()!;
  const { data: promo } = await supabase
    .from("promo_codes")
    .select("code, max_free_unlocks")
    .eq("code", code)
    .maybeSingle();
  if (!promo) return null;
  const { count } = await supabase
    .from("analyses")
    .select("*", { count: "exact", head: true })
    .eq("promo_code", code);
  return { maxFreeUnlocks: promo.max_free_unlocks, usedCount: count ?? 0 };
}

/**
 * Most recent *unlocked* (paid) analysis for a given email, if any. Used
 * to nudge a returning customer toward their existing report instead of
 * unknowingly starting (and possibly paying for) a brand new one -- see
 * the "two emails" support case this was added for: the customer forgot
 * she already had a paid, unlocked analysis and ran the test again.
 * Filesystem fallback (no Supabase) has no cross-record email index, so
 * it always returns null there -- acceptable since that path is local
 * dev/demo only, never real customer data.
 */
export async function getLatestUnlockedAnalysisByEmail(
  email: string
): Promise<{ id: string; overall_score: number } | null> {
  if (!SUPABASE_CONFIGURED) return null;
  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("analyses")
    .select("id, overall_score")
    // analyses.email isn't normalized at write time (unlike subscriptions),
    // so match case-insensitively rather than assuming lowercase storage.
    .ilike("email", email.trim())
    .eq("is_unlocked", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, overall_score: data.overall_score as number };
}

export async function unlockAnalysis(id: string, paymentStatus: PaymentStatus = "paid") {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase
      .from("analyses")
      .update({ is_unlocked: true, payment_status: paymentStatus, updated_at: nowIso() })
      .eq("id", id);
    // This is the single write that turns a confirmed Stripe payment into
    // actual report access -- previously unchecked, so a failed write here
    // (RLS, network blip, bad id) looked identical to success: no error
    // surfaced anywhere, customer paid but stayed locked out.
    if (error) {
      console.error(`[store] unlockAnalysis failed id=${id} payment_status=${paymentStatus}: ${error.message}`);
      throw new Error(`unlockAnalysis failed: ${error.message}`);
    }
    return;
  }
  const record = readLocalRecord(id);
  if (record) {
    record.is_unlocked = true;
    record.payment_status = paymentStatus;
    record.updated_at = nowIso();
    writeLocalRecord(record);
  }
}

export async function updateAnalysisInput(
  id: string,
  input: {
    city?: string | null;
    property_type?: string | null;
    guest_capacity?: string | null;
    nightly_price?: string | null;
  }
) {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    await supabase.from("analyses").update({ ...input, updated_at: nowIso() }).eq("id", id);
    return;
  }
  const record = readLocalRecord(id);
  if (record) {
    Object.assign(record, input, { updated_at: nowIso() });
    writeLocalRecord(record);
  }
}

export async function deleteAnalysis(id: string) {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    await supabase.from("analyses").delete().eq("id", id);
    return;
  }
  deleteLocalRecord(id);
}
