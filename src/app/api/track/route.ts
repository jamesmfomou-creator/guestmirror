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

// Confirmed via real data (2026-11-12 support investigation): several
// landing_view events had document.referrer pointing squarely at
// Instagram (l.instagram.com / instagram.com) but were still bucketed as
// "direct" in /admin/analytics's source breakdown, because `source` was
// only ever read from utm_source -- a visitor who taps a plain,
// untagged link (bio link shared without UTM params, or a shortener that
// drops them) left no other trace of where they came from. The pipeline
// itself wasn't broken -- those events fired and were stored correctly --
// only the *label* was wrong. This infers a reasonable source from the
// referrer's domain only when no explicit UTM source was provided, so an
// intentional utm_source always wins (e.g. to tell paid from organic on
// the same domain) and a referrer-only guess never overrides it.
const REFERRER_SOURCE_RULES: { suffixes: string[]; source: string }[] = [
  { suffixes: ["instagram.com"], source: "ig" },
  { suffixes: ["facebook.com", "fb.com"], source: "facebook" },
  { suffixes: ["l.facebook.com", "lm.facebook.com"], source: "facebook" },
  { suffixes: ["google.com", "google.fr"], source: "google" },
  { suffixes: ["bing.com"], source: "bing" },
  { suffixes: ["duckduckgo.com"], source: "duckduckgo" },
  { suffixes: ["tiktok.com"], source: "tiktok" },
  { suffixes: ["youtube.com", "youtu.be"], source: "youtube" },
  { suffixes: ["reddit.com"], source: "reddit" },
  { suffixes: ["linkedin.com"], source: "linkedin" },
  { suffixes: ["twitter.com", "t.co", "x.com"], source: "twitter" },
  { suffixes: ["chatgpt.com"], source: "chatgpt" },
];

export function inferSourceFromReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const rule of REFERRER_SOURCE_RULES) {
    if (rule.suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
      return rule.source;
    }
  }
  // Still more useful than "direct" for anything not explicitly mapped
  // above -- the bare referring domain, without the www. prefix.
  return host.replace(/^www\./, "") || null;
}

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
    const source = body.last_touch?.source || inferSourceFromReferrer(body.referrer) || "direct";

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
