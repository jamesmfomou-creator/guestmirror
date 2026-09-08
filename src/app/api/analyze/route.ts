import { NextRequest, NextResponse } from "next/server";
import { analyzeRequestSchema, MAX_IMAGE_BYTES } from "@/lib/validation";
import { analyzeListing, AnalysisError } from "@/lib/ai";
import { createAnalysis, getAnalysis } from "@/lib/store";
import { storeImage } from "@/lib/images";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_IMAGES, DEMO_RESULT, DEMO_RESULT_AFTER } from "@/lib/demo-data";
import { extractAirbnbListing, downloadImageAsBase64 } from "@/lib/airbnbExtract";

const AIRBNB_EXTRACTION_FAILED_MESSAGE =
  "Impossible d'analyser automatiquement ce lien Airbnb. Importe une capture d'écran de ton annonce pour continuer.";

function airbnbExtractionFailedResponse() {
  return NextResponse.json(
    { error: AIRBNB_EXTRACTION_FAILED_MESSAGE, error_code: "airbnb_url_extraction_failed" },
    { status: 422 }
  );
}

// Explicit ceiling so a hung request fails cleanly instead of running
// indefinitely. Comfortably above the AI call's own worst case (~225s
// with the timeout/retry settings in lib/ai.ts: 110s + backoff + 110s)
// plus image storage + DB writes.
export const maxDuration = 280;

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Une erreur est survenue. Merci de réessayer." },
      { status: 400 }
    );
  }

  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Les informations envoyées ne sont pas valides. Merci de réessayer." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  for (const img of data.images) {
    const approxBytes = (img.base64.length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Une des images dépasse la taille maximale autorisée (8 Mo)." },
        { status: 413 }
      );
    }
  }

  let effectiveImages = data.images;
  let extractedListingText: { title: string | null; description: string | null } | null = null;
  let effectiveCity = data.city || null;
  let effectiveGuestCapacity = data.guest_capacity || null;

  // Listing URL, no user-provided images: the URL used to be passed to the
  // model as bare text, which the model correctly had nothing to analyze
  // from -- producing a near-0 score with "I received no screenshot or
  // description" in the output. Fetch the real listing content instead
  // (same public data Airbnb serves for search engines / link previews)
  // and feed it through the exact same image pipeline as a screenshot
  // upload. If that isn't possible, fail out to a dedicated fallback
  // *before* ever calling the AI or creating an analysis record.
  if (!DEMO_MODE && data.images.length === 0 && data.listing_url) {
    console.log(`[airbnb] airbnb_url_received`);
    const extraction = await extractAirbnbListing(data.listing_url);
    if (!extraction.ok) {
      console.warn(
        `[airbnb] airbnb_url_extraction_failed error_code=${extraction.errorCode} status=${extraction.status ?? ""} duration_ms=${extraction.durationMs}`
      );
      return airbnbExtractionFailedResponse();
    }
    console.log(
      `[airbnb] airbnb_listing_data_ready images_found=${extraction.data.imageUrls.length} duration_ms=${extraction.durationMs}`
    );

    const downloadStartedAt = Date.now();
    const downloaded = await Promise.all(extraction.data.imageUrls.map((u) => downloadImageAsBase64(u)));
    const usable = downloaded.filter((img): img is { base64: string; mediaType: string } => img !== null);
    console.log(
      `[airbnb] image download duration_ms=${Date.now() - downloadStartedAt} usable=${usable.length}/${extraction.data.imageUrls.length}`
    );

    if (usable.length === 0) {
      console.warn("[airbnb] airbnb_url_extraction_failed error_code=image_download_failed");
      return airbnbExtractionFailedResponse();
    }

    effectiveImages = usable;
    extractedListingText = { title: extraction.data.title, description: extraction.data.description };
    effectiveCity = extraction.data.city ?? effectiveCity;
    effectiveGuestCapacity = extraction.data.guestCapacity ?? effectiveGuestCapacity;
    console.log(`[airbnb] analysis_started_from_url image_count=${usable.length}`);
  }

  const input = {
    listing_url: data.listing_url || null,
    city: effectiveCity,
    property_type: data.property_type || null,
    guest_capacity: effectiveGuestCapacity,
    nightly_price: data.nightly_price || null,
  };

  try {
    let previousAnalysis = null;
    if (data.previous_analysis_id) {
      previousAnalysis = await getAnalysis(data.previous_analysis_id);
    }

    if (DEMO_MODE) {
      const result = previousAnalysis ? DEMO_RESULT_AFTER : DEMO_RESULT;
      const record = await createAnalysis({
        input,
        email: data.email,
        images: DEMO_IMAGES,
        result,
        previousAnalysisId: data.previous_analysis_id || null,
      });
      return NextResponse.json({ id: record.id, overall_score: record.overall_score });
    }

    const result = await analyzeListing({ images: effectiveImages, input, extractedListingText });

    const storageStartedAt = Date.now();
    const tempId = crypto.randomUUID();
    const storedImages = await Promise.all(
      effectiveImages.map((img, i) => storeImage(tempId, i, img.base64, img.mediaType))
    );
    console.log(`[analyze] image storage duration_ms=${Date.now() - storageStartedAt} count=${storedImages.length}`);

    const dbStartedAt = Date.now();
    const record = await createAnalysis({
      input,
      email: data.email,
      images: storedImages,
      result,
      previousAnalysisId: data.previous_analysis_id || null,
    });
    console.log(`[analyze] db write duration_ms=${Date.now() - dbStartedAt}`);
    console.log(`[analyze] total duration_ms=${Date.now() - requestStartedAt} id=${record.id}`);

    return NextResponse.json({ id: record.id, overall_score: record.overall_score });
  } catch (err) {
    console.error(`[analyze] failed duration_ms=${Date.now() - requestStartedAt}:`, err);
    if (err instanceof AnalysisError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants." },
      { status: 500 }
    );
  }
}
