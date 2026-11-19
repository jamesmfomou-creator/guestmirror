import { createHash, randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
  AnalysisInput,
  AnalysisRecord,
  AnalysisResult,
  Goal,
  PaymentStatus,
  PropertyCountRange,
  UserType,
} from "@/lib/types";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BRAND_SLUG } from "@/lib/brand";
import { normalizeAnalysisResult } from "@/lib/resultShape";

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
    const record = JSON.parse(fs.readFileSync(recordPath(id), "utf-8")) as AnalysisRecord;
    // Same read-path repair as the Supabase path (mapAnalysisRow).
    return { ...record, result: normalizeAnalysisResult(record.result) };
  } catch {
    return null;
  }
}

function writeLocalRecord(record: AnalysisRecord) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(recordPath(record.id), JSON.stringify(record), "utf-8");
}

// attempt_id -> analysis id, for the filesystem fallback only (Supabase has
// the attempt_id column + unique index). Kept as its own tiny file so the
// AnalysisRecord shape doesn't have to change for a dev/demo-only concern.
// Hashing the attempt id keeps a client-supplied string out of a file path.
function attemptIndexPath(attemptId: string) {
  return path.join(STORE_DIR, `attempt-${createHash("sha256").update(attemptId).digest("hex").slice(0, 32)}.json`);
}

function readLocalAttemptIndex(attemptId: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(attemptIndexPath(attemptId), "utf-8")) as { id?: unknown };
    return typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
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
    // Type-repairing, identity for well-formed rows -- see
    // lib/resultShape.ts (rows stored before the generation-time shape gate
    // can hold strings where the UI expects arrays/objects).
    result: normalizeAnalysisResult(row.result_json),
    images,
    is_unlocked: row.is_unlocked as boolean,
    payment_status: row.payment_status as PaymentStatus,
    previous_analysis_id: (row.previous_analysis_id as string) ?? null,
    user_type: (row.user_type as UserType) ?? null,
    property_count_range: (row.property_count_range as PropertyCountRange) ?? null,
    promo_code: (row.promo_code as string) ?? null,
    goal: (row.goal as Goal) ?? null,
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
  goal?: Goal | null;
}): Promise<AnalysisRecord> {
  // A double submission (double-click, client retry after a slow
  // response) must never create a second analysis row for the same
  // attempt. /api/analyze now checks this *before* paying for the AI call
  // (findAnalysisByAttemptId); this second check covers the window in
  // between -- two requests for the same attempt that both passed the early
  // check -- and the unique-violation handling below closes the last race
  // (both inserting at once), relying on the unique index from
  // supabase/migrations/0008_reliability.sql.
  if (params.attemptId) {
    const existing = await findAnalysisByAttemptId(params.attemptId);
    if (existing) return existing;
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
    goal: params.goal ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const row = {
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
      goal: record.goal,
    };
    let { error } = await supabase.from("analyses").insert(row);
    // A goal the database does not accept yet (improve_photos before
    // supabase/migrations/0012_goal_improve_photos.sql runs) must never cost
    // the analysis that was just paid for: store it without the goal.
    if (error && isGoalCheckViolation(error) && record.goal) {
      console.warn(`[store] goal "${record.goal}" refused by the database (check constraint); analysis stored without goal`);
      record.goal = null;
      ({ error } = await supabase.from("analyses").insert({ ...row, goal: null }));
    }
    if (error) {
      // 23505 = unique_violation: a concurrent request for the same attempt
      // inserted first. That row is the analysis; return it rather than
      // failing a request whose work was, in effect, already saved.
      if (error.code === "23505" && params.attemptId) {
        const winner = await findAnalysisByAttemptId(params.attemptId);
        if (winner) return winner;
      }
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

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
  if (params.attemptId) {
    fs.writeFileSync(attemptIndexPath(params.attemptId), JSON.stringify({ id: record.id }), "utf-8");
  }
  return record;
}

/**
 * The analysis a given client attempt already produced, if any. This is
 * what makes an attempt idempotent and recoverable: /api/analyze calls it
 * before spending anything, and /api/analyze/status calls it so a browser
 * that lost its connection mid-request can still be handed its result.
 * Returns null on a lookup error as well as on "not found" -- callers treat
 * both as "no known result yet", which is the safe reading.
 */
export async function findAnalysisByAttemptId(attemptId: string): Promise<AnalysisRecord | null> {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase
      .from("analyses")
      .select("*, analysis_images(storage_path, position)")
      .eq("attempt_id", attemptId)
      .maybeSingle();
    if (error || !data) return null;
    return mapAnalysisRow(data as Record<string, unknown>);
  }
  const id = readLocalAttemptIndex(attemptId);
  return id ? readLocalRecord(id) : null;
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

/** One line of "Mes analyses" (Mon espace): names and figures only, never the report. */
export interface AnalysisSummary {
  id: string;
  createdAt: string;
  overallScore: number | null;
  /** Airbnb title stored at analysis time, else the analysed title, else null. */
  title: string | null;
  city: string | null;
  isUnlocked: boolean;
}

/** Escapes LIKE wildcards: "_" or "%" in an address must match only itself. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const SUMMARY_LIMIT = 200;

/**
 * Every analysis filed under `email`, newest first (Mon espace). The caller
 * must have PROVED this email (lib/access/session.ts) -- this never checks it.
 * Case-insensitive exact match: analyses.email is stored as typed.
 */
export async function listAnalysesByEmail(email: string): Promise<AnalysisSummary[]> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return [];
  const summarize = (r: { id: string; created_at: string; overall_score: unknown; city: unknown; is_unlocked: unknown; listing_title?: unknown; current_title?: unknown }): AnalysisSummary => {
    const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 140) : null);
    return {
      id: r.id,
      createdAt: r.created_at,
      overallScore: typeof r.overall_score === "number" ? r.overall_score : null,
      title: pick(r.listing_title) ?? pick(r.current_title),
      city: pick(r.city),
      isUnlocked: r.is_unlocked === true,
    };
  };
  if (SUPABASE_CONFIGURED) {
    // Typed as plain string: supabase-js would otherwise parse the JSON paths
    // into a type too deep for the compiler. Only these columns are read.
    const columns: string =
      "id, created_at, overall_score, city, is_unlocked, email, listing_title:result_json->>listing_title, current_title:result_json->title_analysis->>current_title";
    const { data, error } = await getSupabaseAdmin()!
      .from("analyses")
      .select(columns)
      .ilike("email", escapeLikePattern(wanted))
      .order("created_at", { ascending: false })
      .limit(SUMMARY_LIMIT);
    if (error) throw new Error(`analyses list failed: ${error.message}`);
    // Belt and braces: exact match only, whatever the pattern matched.
    const rows = (data ?? []) as unknown as (Parameters<typeof summarize>[0] & { email: unknown })[];
    return rows
      .filter((r) => typeof r.email === "string" && r.email.trim().toLowerCase() === wanted)
      .map((r) => summarize(r));
  }
  // Local demo store: scan the record files.
  let files: string[] = [];
  try {
    files = fs.readdirSync(STORE_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("attempt-"));
  } catch {
    return [];
  }
  return files
    .map((f) => readLocalRecord(f.replace(/\.json$/, "")))
    .filter((r): r is AnalysisRecord => r !== null && typeof r.email === "string" && r.email.trim().toLowerCase() === wanted)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, SUMMARY_LIMIT)
    .map((r) =>
      summarize({
        id: r.id,
        created_at: r.created_at,
        overall_score: r.overall_score,
        city: r.city,
        is_unlocked: r.is_unlocked,
        listing_title: (r.result as unknown as Record<string, unknown>)?.listing_title,
        current_title: r.result?.title_analysis?.current_title,
      })
    );
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

/**
 * Reverses an unlock: used only when the payment behind it is fully refunded
 * or disputed (pricing v2 policy). Never called for any other reason.
 */
export async function lockAnalysis(id: string) {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase
      .from("analyses")
      .update({ is_unlocked: false, payment_status: "none", updated_at: nowIso() })
      .eq("id", id);
    if (error) {
      console.error(`[store] lockAnalysis failed id=${id}: ${error.message}`);
      throw new Error(`lockAnalysis failed: ${error.message}`);
    }
    return;
  }
  const record = readLocalRecord(id);
  if (record) {
    record.is_unlocked = false;
    record.payment_status = "none";
    record.updated_at = nowIso();
    writeLocalRecord(record);
  }
}

/** Postgres check_violation on analyses.goal (constraint from 0009/0012). */
function isGoalCheckViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23514" && /goal/i.test(error.message ?? "");
}

export async function updateAnalysisInput(
  id: string,
  input: {
    city?: string | null;
    property_type?: string | null;
    guest_capacity?: string | null;
    nightly_price?: string | null;
    goal?: Goal | null;
    user_type?: UserType | null;
    property_count_range?: PropertyCountRange | null;
  }
) {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    let { error } = await supabase.from("analyses").update({ ...input, updated_at: nowIso() }).eq("id", id);
    // Same as insertAnalysis: a goal the database does not accept yet is
    // dropped; the other answers are still saved. The caller sees a failure
    // only if nothing else was sent.
    if (error && isGoalCheckViolation(error) && input.goal) {
      console.warn(`[store] goal "${input.goal}" refused by the database (check constraint); answers saved without goal`);
      const { goal: _dropped, ...rest } = input;
      void _dropped;
      if (Object.keys(rest).length === 0) throw new Error("Supabase update failed: goal not accepted yet");
      ({ error } = await supabase.from("analyses").update({ ...rest, updated_at: nowIso() }).eq("id", id));
    }
    if (error) throw new Error(`Supabase update failed: ${error.message}`);
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
