import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ANALYTICS_EVENTS } from "@/lib/analytics";

const attributionSchema = z
  .object({
    source: z.string().max(60).nullable().optional(),
    medium: z.string().max(60).nullable().optional(),
    campaign: z.string().max(120).nullable().optional(),
    content: z.string().max(120).nullable().optional(),
    term: z.string().max(120).nullable().optional(),
  })
  .nullable()
  .optional();

const trackRequestSchema = z.object({
  event_name: z.enum(ANALYTICS_EVENTS),
  anonymous_id: z.string().max(100).nullable().optional(),
  session_id: z.string().max(100).nullable().optional(),
  analysis_id: z.string().uuid().nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  pathname: z.string().max(300).nullable().optional(),
  referrer: z.string().max(500).nullable().optional(),
  first_touch: attributionSchema,
  last_touch: attributionSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

// Tracking must never break the product: always resolve fast, never throw
// in a way that would surface to the user. Callers use fetch + keepalive
// and ignore the response entirely.
export async function POST(req: NextRequest) {
  if (!SUPABASE_CONFIGURED) {
    return NextResponse.json({ ok: true, skipped: "supabase_not_configured" });
  }

  const parsed = trackRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const supabase = getSupabaseAdmin()!;
    const source = body.last_touch?.source || "direct";

    await supabase.from("analytics_events").insert({
      id: randomUUID(),
      event_name: body.event_name,
      anonymous_id: body.anonymous_id ?? null,
      session_id: body.session_id ?? null,
      analysis_id: body.analysis_id ?? null,
      email: body.email ?? null,
      source,
      metadata: {
        ...(body.metadata ?? {}),
        pathname: body.pathname ?? null,
        referrer: body.referrer ?? null,
        first_touch: body.first_touch ?? null,
        last_touch: body.last_touch ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Swallow -- an analytics failure must never surface to the user.
    return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 200 });
  }
}
