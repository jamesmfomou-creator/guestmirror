import { NextRequest, NextResponse } from "next/server";
import { analyzeRequestSchema, MAX_IMAGE_BYTES } from "@/lib/validation";
import { analyzeListing, AnalysisError } from "@/lib/ai";
import { createAnalysis, getAnalysis, getPromoCodeStatus } from "@/lib/store";
import { storeImage } from "@/lib/images";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_IMAGES, DEMO_RESULT, DEMO_RESULT_AFTER } from "@/lib/demo-data";
import { extractAirbnbListing, downloadImageAsBase64 } from "@/lib/airbnbExtract";
import { optimizeImages } from "@/lib/imageOptimize";

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
  let urlExtractionDurationMs: number | null = null;

  // Listing URL, no user-provided images: the URL used to be passed to the
  // model as bare text, which the model correctly had nothing to analyze
  // from -- producing a near-0 score with "I received no screenshot or
  // description" in the output. Fetch the real listing content instead
  // (same public data Airbnb serves for search engines / link previews)
  // and feed it through the exact same image pipeline as a screenshot
  // upload. If that isn't possible, fail out to a dedicated fallback
  // *before* ever calling the AI or creating an analysis record.
  if (!DEMO_MODE && data.images.length === 0 && data.listing_url) {
    const urlExtractionStartedAt = Date.now();
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
    urlExtractionDurationMs = Date.now() - urlExtractionStartedAt;
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

    // Free-trial link (/analyze?promo=<code>, see StepImport/AnalyzeWizard):
    // grants a real unlock, no payment, only for the first
    // max_free_unlocks analyses submitted with a given code. An unknown,
    // typo'd, or exhausted code is silently treated as "no code" rather
    // than an error -- it must never block a normal submission. Once the
    // quota is used up, further analyses with the same code are entirely
    // normal (the existing paywall, including Lifetime, applies as-is).
    let promoCodeToRecord: string | null = null;
    if (data.promo_code) {
      const status = await getPromoCodeStatus(data.promo_code);
      if (status && status.usedCount < status.maxFreeUnlocks) {
        promoCodeToRecord = data.promo_code;
      }
    }

    if (DEMO_MODE) {
      const result = previousAnalysis ? DEMO_RESULT_AFTER : DEMO_RESULT;
      const record = await createAnalysis({
        input,
        email: data.email,
        images: DEMO_IMAGES,
        result,
        previousAnalysisId: data.previous_analysis_id || null,
        userType: data.user_type || null,
        propertyCountRange: data.property_count_range || null,
        isUnlocked: Boolean(promoCodeToRecord),
        promoCode: promoCodeToRecord,
      });
      return NextResponse.json({ id: record.id, overall_score: record.overall_score });
    }

    const preprocessStartedAt = Date.now();
    effectiveImages = await optimizeImages(effectiveImages);
    const imagePreprocessingDurationMs = Date.now() - preprocessStartedAt;
    console.log(
      `[analyze] image preprocessing duration_ms=${imagePreprocessingDurationMs} count=${effectiveImages.length}`
    );

    const aiStartedAt = Date.now();
    const { result, aiInputTokens, aiOutputTokens, parsingDurationMs } = await analyzeListing({
      images: effectiveImages,
      input,
      extractedListingText,
    });
    const aiCallDurationMs = Date.now() - aiStartedAt;

    const storageStartedAt = Date.now();
    const tempId = crypto.randomUUID();
    let storedImages: string[];
    try {
      storedImages = await Promise.all(
        effectiveImages.map((img, i) => storeImage(tempId, i, img.base64, img.mediaType))
      );
    } catch (err) {
      throw new AnalysisError(
        "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants.",
        "image_processing_failed",
        err
      );
    }
    const imageStorageDurationMs = Date.now() - storageStartedAt;
    console.log(`[analyze] image storage duration_ms=${imageStorageDurationMs} count=${storedImages.length}`);

    const dbStartedAt = Date.now();
    let record;
    try {
      record = await createAnalysis({
        input,
        email: data.email,
        images: storedImages,
        result,
        previousAnalysisId: data.previous_analysis_id || null,
        userType: data.user_type || null,
        propertyCountRange: data.property_count_range || null,
        isUnlocked: Boolean(promoCodeToRecord),
        promoCode: promoCodeToRecord,
      });
    } catch (err) {
      throw new AnalysisError(
        "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants.",
        "database_failed",
        err
      );
    }
    const databaseDurationMs = Date.now() - dbStartedAt;
    console.log(`[analyze] db write duration_ms=${databaseDurationMs}`);
    const totalDurationMs = Date.now() - requestStartedAt;
    console.log(`[analyze] total duration_ms=${totalDurationMs} id=${record.id}`);

    return NextResponse.json({
      id: record.id,
      overall_score: record.overall_score,
      timings: {
        url_extraction_duration_ms: urlExtractionDurationMs,
        image_preprocessing_duration_ms: imagePreprocessingDurationMs,
        ai_call_duration_ms: aiCallDurationMs,
        // Already included inside ai_call_duration_ms (it's the tail end of
        // the same call: validating/sanitizing the model's tool response) --
        // reported separately only so the admin dashboard can show it as its
        // own "Parsing" column per the audit spec, not as extra wall-clock.
        parsing_duration_ms: parsingDurationMs,
        ai_input_tokens: aiInputTokens,
        ai_output_tokens: aiOutputTokens,
        image_storage_duration_ms: imageStorageDurationMs,
        database_duration_ms: databaseDurationMs,
        // Everything after the AI call resolves: storing images, writing
        // the DB row. Kept as its own field to match what the loader's
        // 90%-cap progress bar covers ("finalizing") even though it's
        // consistently small compared to the AI call itself.
        finalization_duration_ms: imageStorageDurationMs + databaseDurationMs,
        total_duration_ms: totalDurationMs,
      },
    });
  } catch (err) {
    console.error(`[analyze] failed duration_ms=${Date.now() - requestStartedAt}:`, err);
    if (err instanceof AnalysisError) {
      return NextResponse.json({ error: err.message, error_code: err.code }, { status: 422 });
    }
    return NextResponse.json(
      {
        error: "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants.",
        error_code: "unknown",
      },
      { status: 500 }
    );
  }
}
