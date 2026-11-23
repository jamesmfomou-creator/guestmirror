import { after, NextRequest, NextResponse } from "next/server";
import { analyzeRequestSchema, MAX_IMAGE_BYTES } from "@/lib/validation";
import { analyzeListing, AnalysisError } from "@/lib/ai";
import { createAnalysis, findAnalysisByAttemptId, getAnalysis, getPromoCodeStatus } from "@/lib/store";
import {
  AttemptEventMetadata,
  getAttemptEvents,
  ownsAttempt,
  recordAnalysisServerEvent,
} from "@/lib/analysisAttempts";
import { storeImage } from "@/lib/images";
import { DEMO_MODE } from "@/lib/env";
import { DEMO_IMAGES, DEMO_RESULT, DEMO_RESULT_AFTER } from "@/lib/demo-data";
import { extractAirbnbListing, downloadImageAsBase64 } from "@/lib/airbnbExtract";
import { optimizeImages } from "@/lib/imageOptimize";
import { ABSENCE_GUARD_MODE, buildUrlCoverage, screenshotCoverage, type PhotoCoverage } from "@/lib/photoCoverage";
import { isEligibleForLegacyRetest } from "@/lib/access/accessStore";
import { editTokenFor } from "@/lib/analysisEditToken";
import { checkAnalyzeRateLimit, rateIdentity } from "@/lib/analyzeRateLimit";
import { currentIdentity } from "@/lib/access/session";
import { normalizeEmail } from "@/lib/access/accessStore";
import { descriptionExcerpt } from "@/lib/listingMakeover";

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

// Where in the pipeline a request currently is -- recorded on
// analysis_server_failed so a failure can be attributed to a stage, not
// just to an error code.
type AnalysisPhase = "url_extraction" | "image_preprocessing" | "ai_call" | "image_storage" | "database";

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
  // Carried through every log line below so a failure at any stage can be
  // traced back to the specific user attempt it came from -- previously
  // only the AI-call logs (lib/ai.ts) had any correlating ID at all.
  // Every request is an attempt: a caller that sends no attempt id gets one
  // here, so idempotency, server events and the abuse limit apply to it too.
  const attemptId = data.attempt_id ?? crypto.randomUUID();
  const attemptTag = `attempt_id=${attemptId}${data.attempt_id ? "" : " (server)"}`;

  for (const img of data.images) {
    const approxBytes = (img.base64.length * 3) / 4;
    if (approxBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Une des images dépasse la taille maximale autorisée (8 Mo)." },
        { status: 413 }
      );
    }
  }

  // ---- Idempotency: one attempt id = at most one analysis, one model call.
  //
  // The attempt id is generated once by the client and reused when it
  // resubmits after losing its connection. Before this, a resubmission
  // (new or same id) always paid for a second full model call: the only
  // dedup lived inside createAnalysis, i.e. *after* the ~55 s AI call. A
  // caller that sends no attempt id gets a server-generated one (above).
  const inputMethod = data.images.length > 0 ? (data.listing_url ? "mixed" : "screenshot") : "airbnb_url";

  const rate = rateIdentity(data.email, req.headers);
  {
    // 1. Already finished (the client lost the response and is asking
    //    again): hand back the stored analysis. No AI call, no new row.
    const existing = await findAnalysisByAttemptId(attemptId).catch(() => null);
    if (existing) {
      console.log(`[analyze] deduplicated reason=already_completed id=${existing.id} ${attemptTag}`);
      after(() =>
        recordAnalysisServerEvent({
          eventName: "analysis_server_deduplicated",
          attemptId,
          analysisId: existing.id,
          metadata: { reason: "already_completed" },
        })
      );
      return NextResponse.json({
        id: existing.id,
        overall_score: existing.overall_score,
        deduplicated: true,
        edit_token: editTokenFor(existing.id),
      });
    }

    // 2. Claim the attempt, then check nobody else already holds it. Write
    //    first, read second: two concurrent requests both see both claims
    //    and agree on which one proceeds (see ownsAttempt).
    const ownStartEventId = await recordAnalysisServerEvent({
      eventName: "analysis_server_started",
      attemptId,
      metadata: {
        input_method: inputMethod,
        image_count: data.images.length,
        is_rescan: Boolean(data.previous_analysis_id),
        // Keyed hashes, never the raw values: what the abuse limit counts.
        email_hash: rate.emailHash,
        ip_hash: rate.ipHash,
      },
    });
    if (ownStartEventId) {
      const events = await getAttemptEvents(attemptId);
      if (!ownsAttempt(events, ownStartEventId, Date.now())) {
        // Still running in another request. 202, not an error: the client
        // waits on /api/analyze/status instead of starting a second
        // analysis. Awaited (not after()) because the released marker is
        // state the status endpoint depends on.
        console.log(`[analyze] deduplicated reason=in_flight ${attemptTag}`);
        await recordAnalysisServerEvent({
          eventName: "analysis_server_deduplicated",
          attemptId,
          metadata: { reason: "in_flight", released_start_id: ownStartEventId },
        });
        return NextResponse.json({ status: "processing" }, { status: 202 });
      }
    }

    // 3. Abuse limit (lib/analyzeRateLimit.ts), after the idempotency checks
    //    above so a resubmitted attempt is never blocked, before any paid
    //    work. This attempt's own start is excluded from the count.
    // A browser that verified this email (code) is a real mailbox owner: the
    // per-IP counter, meant for one actor rotating emails, does not apply.
    const verifiedEmail = await currentIdentity().catch(() => null);
    const emailVerified = Boolean(verifiedEmail) && verifiedEmail!.email === normalizeEmail(data.email);
    const decision = await checkAnalyzeRateLimit({ email: data.email, identity: rate, attemptId, emailVerified });
    if (!decision.allowed) {
      console.warn(`[analyze] rate_limited scope=${decision.scope} window=${decision.window} limit=${decision.limit} ${attemptTag}`);
      await recordAnalysisServerEvent({
        eventName: "analysis_server_failed",
        attemptId,
        metadata: {
          error_code: "rate_limited",
          phase: "rate_limit",
          rate_scope: decision.scope,
          rate_window: decision.window,
          rate_limit: decision.limit,
          subscriber: decision.subscriber ?? false,
          input_method: inputMethod,
          // Lets the limiter leave refused attempts out of later counts.
          email_hash: rate.emailHash,
          ip_hash: rate.ipHash,
        },
      });
      return NextResponse.json(
        {
          error:
            decision.scope === "ip"
              ? "Beaucoup d'analyses ont été lancées depuis ton réseau. Vérifie ton email pour continuer, ou réessaie un peu plus tard."
              : "Tu as lancé beaucoup d'analyses en peu de temps. Réessaie un peu plus tard, ou écris-nous si tu as besoin d'en faire davantage.",
          error_code: "rate_limited",
          // "ip": verifying the email lifts it; "email": only time (or a subscription) does.
          rate_scope: decision.scope,
          retry_after_sec: decision.retryAfterSec,
        },
        { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } }
      );
    }
  }

  let phase: AnalysisPhase = "url_extraction";

  // Awaited on purpose: this row is what tells a disconnected client
  // "the server gave up, here is why" instead of leaving it waiting for the
  // in-flight window to expire. Never throws (see recordAnalysisServerEvent).
  async function recordFailure(errorCode: string, extra: AttemptEventMetadata = {}) {
    await recordAnalysisServerEvent({
      eventName: "analysis_server_failed",
      attemptId,
      metadata: {
        error_code: errorCode,
        phase,
        input_method: inputMethod,
        duration_ms: Date.now() - requestStartedAt,
        ...extra,
      },
    });
  }

  // Observability only -- the stored analysis row itself is the source of
  // truth for "completed" -- so it runs after the response is sent.
  function recordCompletion(analysisId: string, metadata: AttemptEventMetadata) {
    after(() =>
      recordAnalysisServerEvent({
        eventName: "analysis_server_completed",
        attemptId,
        analysisId,
        metadata: { input_method: inputMethod, ...metadata },
      })
    );
  }

  let effectiveImages = data.images;
  let extractedListingText: {
    title: string | null;
    description: string | null;
    bedroomCount: number | null;
    bedCount: number | null;
    bathroomCount: number | null;
  } | null = null;
  let effectiveCity = data.city || null;
  let effectiveGuestCapacity = data.guest_capacity || null;
  let urlExtractionDurationMs: number | null = null;
  // What the AI will actually see of the photos (lib/photoCoverage.ts).
  // Screenshots by default; replaced below for a link import.
  let photoCoverage: PhotoCoverage = screenshotCoverage(data.images.length, Boolean(data.listing_url));
  let photoDownloadFailures = 0;

  try {
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
      console.log(`[airbnb] airbnb_url_received ${attemptTag}`);
      const extraction = await extractAirbnbListing(data.listing_url);
      if (!extraction.ok) {
        console.warn(
          `[airbnb] airbnb_url_extraction_failed error_code=${extraction.errorCode} status=${extraction.status ?? ""} duration_ms=${extraction.durationMs} ${attemptTag}`
        );
        await recordFailure("airbnb_url_extraction_failed", { extraction_error_code: extraction.errorCode });
        return airbnbExtractionFailedResponse();
      }
      console.log(
        `[airbnb] airbnb_listing_data_ready images_found=${extraction.data.imageUrls.length} duration_ms=${extraction.durationMs} ${attemptTag}`
      );

      const downloadStartedAt = Date.now();
      const downloaded = await Promise.all(extraction.data.imageUrls.map((u) => downloadImageAsBase64(u)));
      const usable = downloaded.filter((img): img is { base64: string; mediaType: string } => img !== null);
      console.log(
        `[airbnb] image download duration_ms=${Date.now() - downloadStartedAt} usable=${usable.length}/${extraction.data.imageUrls.length} ${attemptTag}`
      );

      if (usable.length === 0) {
        console.warn(`[airbnb] airbnb_url_extraction_failed error_code=image_download_failed ${attemptTag}`);
        await recordFailure("airbnb_url_extraction_failed", { extraction_error_code: "image_download_failed" });
        return airbnbExtractionFailedResponse();
      }

      effectiveImages = usable;
      // Gallery size + which selected photos really arrived (a failed
      // download leaves a gap: the AI is told the exact positions it sees).
      photoCoverage = buildUrlCoverage(extraction.data.galleryImageCount, downloaded.map((img) => img !== null));
      photoDownloadFailures = downloaded.length - usable.length;
      console.log(
        `[airbnb] photo_coverage gallery_total=${photoCoverage.galleryTotal ?? "unknown"} selected=${downloaded.length} sent=${photoCoverage.sent} complete=${photoCoverage.complete} ${attemptTag}`
      );
      extractedListingText = {
        title: extraction.data.title,
        description: extraction.data.description,
        bedroomCount: extraction.data.bedroomCount,
        bedCount: extraction.data.bedCount,
        bathroomCount: extraction.data.bathroomCount,
      };
      effectiveCity = extraction.data.city ?? effectiveCity;
      effectiveGuestCapacity = extraction.data.guestCapacity ?? effectiveGuestCapacity;
      urlExtractionDurationMs = Date.now() - urlExtractionStartedAt;
      console.log(`[airbnb] analysis_started_from_url image_count=${usable.length} ${attemptTag}`);
    }

    const input = {
      listing_url: data.listing_url || null,
      city: effectiveCity,
      property_type: data.property_type || null,
      guest_capacity: effectiveGuestCapacity,
      nightly_price: data.nightly_price || null,
    };

    // Best-effort only: in production this is never used for anything but
    // deciding the DEMO_MODE result variant below, so a lookup failure here
    // should never fail the whole analysis -- it previously could, landing
    // as an undiagnosable generic "unknown" error for what amounts to a
    // rescan-comparison nicety, not a real blocker.
    let previousAnalysis = null;
    if (data.previous_analysis_id) {
      try {
        previousAnalysis = await getAnalysis(data.previous_analysis_id);
      } catch (err) {
        console.error(`[analyze] previous analysis lookup failed, continuing without it ${attemptTag}:`, err);
      }
    }

    // Free-trial link (/analyze?promo=<code>, see StepImport/AnalyzeWizard):
    // grants a real unlock, no payment, only for the first
    // max_free_unlocks analyses submitted with a given code. An unknown,
    // typo'd, or exhausted code is silently treated as "no code" rather
    // than an error -- it must never block a normal submission. Once the
    // quota is used up, further analyses with the same code are entirely
    // normal (the existing paywall, including Lifetime, applies as-is). A
    // lookup *failure* gets the same treatment, for the same reason.
    let promoCodeToRecord: string | null = null;
    if (data.promo_code) {
      try {
        const status = await getPromoCodeStatus(data.promo_code);
        if (status && status.usedCount < status.maxFreeUnlocks) {
          promoCodeToRecord = data.promo_code;
        }
      } catch (err) {
        console.error(`[analyze] promo code lookup failed, treating as no code ${attemptTag}:`, err);
      }
    }

    // Legacy promise of the 4,90 € offer: "1 re-test après correction" -- the
    // first re-test of a report bought at that price is unlocked for free.
    let legacyRetest = false;
    if (previousAnalysis?.is_unlocked) {
      try {
        legacyRetest = await isEligibleForLegacyRetest(previousAnalysis.id);
      } catch (err) {
        console.error(`[analyze] legacy re-test check failed, re-test stays locked ${attemptTag}:`, err);
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
        isUnlocked: Boolean(promoCodeToRecord) || legacyRetest,
        promoCode: promoCodeToRecord,
        attemptId,
        goal: data.goal ?? null,
      });
      recordCompletion(record.id, { demo: true, total_duration_ms: Date.now() - requestStartedAt });
      return NextResponse.json({ id: record.id, overall_score: record.overall_score, edit_token: editTokenFor(record.id) });
    }

    phase = "image_preprocessing";
    const preprocessStartedAt = Date.now();
    effectiveImages = await optimizeImages(effectiveImages);
    const imagePreprocessingDurationMs = Date.now() - preprocessStartedAt;
    console.log(
      `[analyze] image preprocessing duration_ms=${imagePreprocessingDurationMs} count=${effectiveImages.length} ${attemptTag}`
    );

    // Image storage has no dependency on the AI's response (it only needs
    // effectiveImages, already available) -- previously ran sequentially
    // after the AI call for no reason. Running both concurrently shaves the
    // storage+DB tail (~1.5s on average, measured) off the total wait,
    // since it now overlaps with the AI call instead of extending it. Each
    // promise stamps its own duration independently (inside .then(), not
    // from when Promise.all as a whole resolves) so the per-step timings
    // reported below stay accurate instead of both collapsing to ~the AI
    // call's duration.
    phase = "ai_call";
    const aiStartedAt = Date.now();
    let aiCallDurationMs = 0;
    const aiPromise = analyzeListing({
      images: effectiveImages,
      input,
      extractedListingText,
      attemptId,
      photoCoverage,
    }).then((r) => {
      aiCallDurationMs = Date.now() - aiStartedAt;
      return r;
    });

    const storageStartedAt = Date.now();
    const tempId = crypto.randomUUID();
    let imageStorageDurationMs = 0;
    const storagePromise = Promise.all(
      effectiveImages.map((img, i) => storeImage(tempId, i, img.base64, img.mediaType))
    ).then((r) => {
      imageStorageDurationMs = Date.now() - storageStartedAt;
      return r;
    });

    let result, aiInputTokens, aiOutputTokens, parsingDurationMs, retryCount, stopReason, model, attemptOutcomes, absenceClaimsHedged;
    let storedImages: string[];
    try {
      [{ result, aiInputTokens, aiOutputTokens, parsingDurationMs, retryCount, stopReason, model, attemptOutcomes, absenceClaimsHedged }, storedImages] =
        await Promise.all([aiPromise, storagePromise]);
    } catch (err) {
      // Preserve analyzeListing's own AnalysisError (code, message) when
      // that's the one that failed -- only image storage failures get
      // recategorized here.
      if (err instanceof AnalysisError) throw err;
      phase = "image_storage";
      throw new AnalysisError(
        "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants.",
        "image_processing_failed",
        err
      );
    }
    console.log(`[analyze] image storage duration_ms=${imageStorageDurationMs} count=${storedImages.length} ${attemptTag}`);

    // The listing's own title, as read from the Airbnb page (link
    // submissions), kept with the report so the result page can say which
    // listing it is about (lib/goalPersonalization.ts displayListingTitle).
    // Added after the AI call: the model never sees or produces this field.
    const extractedTitle = extractedListingText?.title?.replace(/\s+/g, " ").trim() || null;
    if (extractedTitle) result = { ...result, listing_title: extractedTitle };
    // Same for the opening of its real description: the "Avant" side of the
    // free Avant / Après preview (lib/listingMakeover.ts). Capped excerpt only.
    const extractedExcerpt = descriptionExcerpt(extractedListingText?.description);
    if (extractedExcerpt) result = { ...result, listing_description_excerpt: extractedExcerpt };
    // Kept with the report so the result page can say which photos were
    // analysed (never produced by the model; absent on older reports).
    result = { ...result, photo_coverage: photoCoverage };

    phase = "database";
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
        isUnlocked: Boolean(promoCodeToRecord) || legacyRetest,
        promoCode: promoCodeToRecord,
        attemptId,
        goal: data.goal ?? null,
      });
    } catch (err) {
      throw new AnalysisError(
        "Une erreur inattendue est survenue. Merci de réessayer dans quelques instants.",
        "database_failed",
        err
      );
    }
    const databaseDurationMs = Date.now() - dbStartedAt;
    console.log(`[analyze] db write duration_ms=${databaseDurationMs} ${attemptTag}`);
    const totalDurationMs = Date.now() - requestStartedAt;
    console.log(`[analyze] total duration_ms=${totalDurationMs} id=${record.id} ${attemptTag}`);
    recordCompletion(record.id, {
      provider: "anthropic",
      model,
      ai_stop_reason: stopReason,
      ai_retry_count: retryCount,
      // e.g. "valid", "repaired", "invalid:ai_schema_mismatch,valid" (lib/ai.ts attemptOutcome).
      ai_attempt_outcomes: attemptOutcomes.join(","),
      ai_input_tokens: aiInputTokens,
      ai_output_tokens: aiOutputTokens,
      image_count: effectiveImages.length,
      // Photo pipeline reliability (lib/photoCoverage.ts): no image, no URL.
      photo_source: photoCoverage.source,
      photos_available: photoCoverage.galleryTotal,
      photos_sent: photoCoverage.sent,
      photo_download_failures: photoDownloadFailures,
      gallery_complete: photoCoverage.complete,
      // Items the absence guard flagged; "observe" = counted, report untouched.
      absence_claims_hedged: absenceClaimsHedged,
      absence_guard_mode: ABSENCE_GUARD_MODE,
      url_extraction_duration_ms: urlExtractionDurationMs,
      image_preprocessing_duration_ms: imagePreprocessingDurationMs,
      ai_call_duration_ms: aiCallDurationMs,
      parsing_duration_ms: parsingDurationMs,
      image_storage_duration_ms: imageStorageDurationMs,
      database_duration_ms: databaseDurationMs,
      finalization_duration_ms: imageStorageDurationMs + databaseDurationMs,
      total_duration_ms: totalDurationMs,
    });

    return NextResponse.json({
      id: record.id,
      overall_score: record.overall_score,
      // Proof of ownership for this browser (lib/analysisEditToken.ts).
      edit_token: editTokenFor(record.id),
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
        ai_retry_count: retryCount,
        image_storage_duration_ms: imageStorageDurationMs,
        database_duration_ms: databaseDurationMs,
        // Everything after the AI call resolves: storing images, writing
        // the DB row. Kept as its own field to match what the loader's
        // 90%-cap progress bar covers ("finalizing") even though it's
        // consistently small compared to the AI call itself.
        finalization_duration_ms: imageStorageDurationMs + databaseDurationMs,
        total_duration_ms: totalDurationMs,
      },
      // Separate from `timings` (kept numeric-only there, spread directly
      // into the analysis_completed event's metadata) -- see lib/ai.ts's
      // validateAiResponse for what each stop_reason value means.
      ai_stop_reason: stopReason,
    });
  } catch (err) {
    console.error(`[analyze] failed duration_ms=${Date.now() - requestStartedAt} phase=${phase} ${attemptTag}:`, err);
    await recordFailure(
      err instanceof AnalysisError ? err.code : "unknown",
      err instanceof AnalysisError && err.attemptOutcomes ? { ai_attempt_outcomes: err.attemptOutcomes.join(",") } : {}
    );
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
