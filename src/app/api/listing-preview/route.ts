import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractAirbnbListing } from "@/lib/airbnbExtract";
import { isAirbnbUrl } from "@/lib/airbnbUrl";
import { buildListingPreview } from "@/lib/listingPreview";

// The visitor's own listing (title, a few description lines, photos), fetched
// as soon as they submit their Airbnb link so the immersive analysis loader
// (lib/loaderExperiment.ts) can show it while the analysis runs.
//
// Same public page and same parser as /api/analyze (lib/airbnbExtract.ts): no
// AI call, no cost beyond one page fetch. It does NOT feed the analysis:
// /api/analyze still reads the page itself, so nothing a browser sends here
// can change what the model sees.
//
// Privacy: the response holds only what the loader displays. Nothing about
// the listing is logged -- only the error code and the duration.

const bodySchema = z.object({ url: z.string().trim().min(1).max(500) });
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !isAirbnbUrl(parsed.data.url)) {
    return NextResponse.json({ ok: false, reason: "invalid_url" }, { status: 400, headers: NO_STORE });
  }

  const extraction = await extractAirbnbListing(parsed.data.url);
  if (!extraction.ok) {
    console.warn(
      `[listing-preview] unavailable error_code=${extraction.errorCode} status=${extraction.status ?? ""} duration_ms=${extraction.durationMs}`
    );
    // 200 on purpose: an unavailable preview is a normal outcome the loader
    // handles (it shows its no-photo state), not a client error.
    return NextResponse.json({ ok: false, reason: extraction.errorCode }, { headers: NO_STORE });
  }

  const preview = buildListingPreview(extraction.data);
  console.log(
    `[listing-preview] ready duration_ms=${extraction.durationMs} images=${preview.imageUrls.length} has_title=${preview.title !== null} description_lines=${preview.descriptionLines.length}`
  );
  return NextResponse.json({ ok: true, preview }, { headers: NO_STORE });
}
