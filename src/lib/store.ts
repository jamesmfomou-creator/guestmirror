import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { AnalysisInput, AnalysisRecord, AnalysisResult, PaymentStatus } from "@/lib/types";
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

export async function createAnalysis(params: {
  input: AnalysisInput;
  images: string[];
  result: AnalysisResult;
  email?: string | null;
  userId?: string | null;
  previousAnalysisId?: string | null;
  isUnlocked?: boolean;
}): Promise<AnalysisRecord> {
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
    const row = data as Record<string, unknown>;
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
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  return readLocalRecord(id);
}

export async function unlockAnalysis(id: string, paymentStatus: PaymentStatus = "paid") {
  if (SUPABASE_CONFIGURED) {
    const supabase = getSupabaseAdmin()!;
    await supabase
      .from("analyses")
      .update({ is_unlocked: true, payment_status: paymentStatus, updated_at: nowIso() })
      .eq("id", id);
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
