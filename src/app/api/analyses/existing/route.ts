import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getLatestUnlockedAnalysisByEmail } from "@/lib/store";
import { sendExistingReportEmail } from "@/lib/email";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// "I already paid for a report": emails the link of the latest unlocked
// report to that address. The response is identical whether or not a report
// exists, and never contains a report id: a report id is the access token to
// a paid report, and this used to return it to anyone who typed an email.
// Limited to one email per address per hour.

const bodySchema = z.object({ email: z.string().trim().email() });
const SENT_EVENT = "existing_report_link_sent";

async function sentRecently(email: string): Promise<boolean> {
  if (!SUPABASE_CONFIGURED) return false;
  const { count } = await getSupabaseAdmin()!
    .from("analytics_events")
    .select("id", { count: "exact", head: true })
    .eq("event_name", SENT_EVENT)
    .eq("email", email)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  return (count ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const email = parsed.data.email.toLowerCase();

  try {
    if (!(await sentRecently(email))) {
      const latest = await getLatestUnlockedAnalysisByEmail(email);
      if (latest) {
        await sendExistingReportEmail({ to: email, analysisId: latest.id });
        if (SUPABASE_CONFIGURED) {
          await getSupabaseAdmin()!.from("analytics_events").insert({
            id: randomUUID(),
            event_name: SENT_EVENT,
            source: "server",
            email,
            metadata: {},
          });
        }
      }
    }
  } catch (err) {
    console.error("[existing-report] send failed:", err instanceof Error ? err.message : err);
  }
  // Same answer in every case: no way to learn who has paid.
  return NextResponse.json({ ok: true });
}
