"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StepImport } from "./StepImport";
import { StepProfile } from "./StepProfile";
import { StepEmail } from "./StepEmail";
import { StepAnalyzing } from "./StepAnalyzing";
import { AnalysisAhaFlow } from "./AnalysisAhaFlow";
import { PendingImage, fileToBase64 } from "@/lib/files";
import { track } from "@/lib/analytics";
import { getAbVariant } from "@/lib/ab";
import { isAirbnbUrl } from "@/lib/airbnbUrl";
import { takePendingFiles } from "@/lib/pendingUpload";
import { BRAND_NAME } from "@/lib/brand";
import { verdictFor } from "@/lib/utils";
import { UserType, PropertyCountRange } from "@/lib/types";

type Step = "import" | "profile" | "email" | "analyzing";

const MAX_IMAGES = 10;
const MIN_ANIMATION_MS = 3400;
// Above the AI call's own worst case (~225s, see lib/ai.ts) with headroom
// for image upload + DB write, so this only fires on a genuinely stuck
// request instead of racing a real-but-slow analysis.
const FETCH_TIMEOUT_MS = 290_000;

function genId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function AnalyzeWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("import");
  const [url, setUrl] = useState(() => searchParams.get("url") || "");
  const [images, setImages] = useState<PendingImage[]>(() => {
    const pending = takePendingFiles();
    if (!pending || pending.length === 0) return [];
    return pending.map((file) => ({
      id: genId(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
  });
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState<UserType | null>(null);
  const [propertyCountRange, setPropertyCountRange] = useState<PropertyCountRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const startedAt = useRef<number | null>(null);
  const attemptId = useRef<string | null>(null);
  // Assigned once per visitor (persisted, see lib/ab.ts) and read once per
  // mount -- never re-rolled mid-session.
  const [abVariant] = useState(() => getAbVariant());
  const pendingResult = useRef<{ id?: string; overall_score?: number; timings?: Record<string, number | null> } | null>(
    null
  );

  const previousAnalysisId = searchParams.get("previous");
  // Free-trial link (see api/analyze/route.ts) -- read once, never
  // re-checked against searchParams again, same as previousAnalysisId.
  const promoCode = searchParams.get("promo");
  const urlStartedTracked = useRef(false);

  function inputMethod(): "airbnb_url" | "screenshot" | "mixed" {
    const hasUrl = url.trim().length > 0;
    const hasImages = images.length > 0;
    if (hasUrl && hasImages) return "mixed";
    return hasUrl ? "airbnb_url" : "screenshot";
  }

  function handleUrlChange(value: string) {
    if (!urlStartedTracked.current && url.trim().length === 0 && value.trim().length > 0) {
      urlStartedTracked.current = true;
      track("airbnb_url_started");
    }
    setError(null);
    setUrl(value);
  }

  function handleAddFiles(files: FileList) {
    const remaining = MAX_IMAGES - images.length;
    const toAdd = Array.from(files).slice(0, remaining);
    setError(null);
    if (images.length === 0 && toAdd.length > 0) {
      track("screenshot_upload_started");
    }
    const next: PendingImage[] = toAdd.map((file) => ({
      id: genId(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...next]);
  }

  function handleRemoveImage(id: string) {
    setImages((prev) => prev.filter((i) => i.id !== id));
  }

  function goToProfile() {
    const trimmedUrl = url.trim();
    if (trimmedUrl && images.length === 0 && !isAirbnbUrl(trimmedUrl)) {
      setError("Ce lien Airbnb ne semble pas valide.");
      return;
    }
    setStep("profile");
  }

  function goToEmail() {
    const trimmedUrl = url.trim();
    const method = inputMethod();
    track("listing_input_submitted", { image_count: images.length, input_method: method });
    if (trimmedUrl) track("airbnb_url_submitted", { input_method: method });
    if (images.length > 0) track("screenshot_upload_completed", { input_method: method, image_count: images.length });
    if (userType || propertyCountRange) {
      track("profile_submitted", { user_type: userType, property_count_range: propertyCountRange });
    }
    setStep("email");
  }

  function finishAndRedirect(json: { id?: string; overall_score?: number; timings?: Record<string, number | null> }) {
    const method = inputMethod();
    track("analysis_completed", {
      attemptId: attemptId.current,
      analysisId: json.id,
      overall_score: json.overall_score,
      verdict: json.overall_score != null ? verdictFor(json.overall_score).short : undefined,
      image_count: images.length,
      has_listing_url: url.trim().length > 0,
      input_method: method,
      duration_ms: Date.now() - (startedAt.current ?? Date.now()),
      user_type: userType,
      property_count_range: propertyCountRange,
      ...json.timings,
    });
    // Reaching here on a pure-URL submission (no screenshot) means the
    // backend fetched and used the real listing content -- if extraction
    // had failed, the catch block below would have redirected back to
    // "import" instead of ever reaching this success path.
    //
    // Carries the same input_method/user_type/property_count_range as
    // analysis_completed above (not just analysisId): both calls fire
    // within milliseconds of each other and race over the network, so
    // whichever one Supabase inserts first becomes the "earliest event"
    // the Stripe webhook later propagates ab_variant/input_method/profile
    // fields from (see trackServerEvent in api/stripe/webhook/route.ts).
    // Without this, payment_completed for a URL-based purchase could
    // silently lose those fields depending on which request won the race.
    if (method === "airbnb_url") {
      track("airbnb_url_extraction_success", {
        analysisId: json.id,
        input_method: method,
        user_type: userType,
        property_count_range: propertyCountRange,
      });
    }
    if (previousAnalysisId) track("rescan_completed");
    router.push(`/result/${json.id}`);
  }

  async function runAnalysis() {
    if (submitting) return;
    setSubmitting(true);
    setAnalysisDone(false);
    setApiError(null);
    pendingResult.current = null;
    track("email_submitted", { email: email.trim() });
    setStep("analyzing");
    startedAt.current = Date.now();
    attemptId.current = genId();
    const method = inputMethod();
    track("analysis_started", {
      attemptId: attemptId.current,
      image_count: images.length,
      has_listing_url: url.trim().length > 0,
      input_method: method,
    });
    if (method === "airbnb_url") {
      track("airbnb_url_extraction_started", { attemptId: attemptId.current });
    }

    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => timeoutController.abort(), FETCH_TIMEOUT_MS);

    try {
      const encodedImages = await Promise.all(
        images.map(async (img) => {
          const { base64, mediaType } = await fileToBase64(img.file);
          return { base64, mediaType };
        })
      );

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_url: url.trim() || null,
          email: email.trim(),
          city: null,
          property_type: null,
          guest_capacity: null,
          nightly_price: null,
          images: encodedImages,
          previous_analysis_id: previousAnalysisId || null,
          user_type: userType,
          property_count_range: propertyCountRange,
          promo_code: promoCode || null,
        }),
        signal: timeoutController.signal,
      });

      let json: {
        id?: string;
        overall_score?: number;
        error?: string;
        error_code?: string;
        timings?: Record<string, number | null>;
      };
      try {
        json = await res.json();
      } catch {
        throw new Error(
          "Une erreur est survenue. Essaie avec des captures moins nombreuses ou plus légères."
        );
      }
      if (!res.ok) {
        if (json.error_code === "airbnb_url_extraction_failed") {
          // Not a real analysis failure: nothing was analyzed, no record
          // was created. Send the user back to add a screenshot (URL stays
          // filled in) instead of the generic "réessayer" retry screen,
          // and track it separately so it never counts as
          // analysis_completed/analysis_failed downstream.
          track("airbnb_url_extraction_failed", {
            attemptId: attemptId.current,
            duration_ms: Date.now() - (startedAt.current ?? Date.now()),
          });
          setApiError(json.error || "Impossible d'analyser automatiquement ce lien Airbnb.");
          setSubmitting(false);
          setStep("import");
          return;
        }
        if (res.status === 413 && images.length > 0) {
          // Image(s) over the size limit, rejected before any real
          // analysis was attempted -- same "not a real analysis failure"
          // reasoning as the Airbnb extraction case above: track it
          // distinctly and send the user back to swap the image, rather
          // than double-counting as analysis_failed or offering a retry
          // that would just fail identically.
          track("screenshot_upload_failed", {
            attemptId: attemptId.current,
            error_code: "image_too_large",
            image_count: images.length,
          });
          setApiError(json.error || "Une des images dépasse la taille maximale autorisée.");
          setSubmitting(false);
          setStep("import");
          return;
        }
        throw new Error(json.error || "Une erreur est survenue. Merci de réessayer.");
      }

      setAnalysisDone(true);
      if (abVariant === "B") {
        // AnalysisAhaFlow drives its own short "Ta première impression est
        // prête." beat once `done` flips true, then calls onTransitionEnd.
        pendingResult.current = json;
      } else {
        const elapsed = Date.now() - (startedAt.current ?? Date.now());
        const wait = Math.max(MIN_ANIMATION_MS - elapsed, 700);
        setTimeout(() => finishAndRedirect(json), wait);
      }
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const message = isTimeout
        ? "L'analyse a pris plus de temps que prévu. Réessaie, tes images sont toujours prêtes."
        : err instanceof Error
          ? err.message
          : "Une erreur est survenue.";
      track("analysis_failed", {
        attemptId: attemptId.current,
        error_code: isTimeout ? "timeout" : "api_error",
        duration_ms: Date.now() - (startedAt.current ?? Date.now()),
        image_count: images.length,
      });
      setApiError(message);
      setSubmitting(false);
      setStep("email");
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  function handleFinalizing() {
    track("analysis_progress_90", { attemptId: attemptId.current });
  }

  function handleAhaMount() {
    track("analysis_progress_viewed", { attemptId: attemptId.current });
  }

  function handleTransitionEnd() {
    if (pendingResult.current) finishAndRedirect(pendingResult.current);
  }

  return (
    <div className="mx-auto max-w-lg px-5 py-12 sm:py-16">
      {previousAnalysisId && step !== "analyzing" && (
        <div className="mb-6 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-hover">
          Nouvelle analyse après modifications — on comparera ton nouveau {BRAND_NAME} à
          l&apos;ancien.
        </div>
      )}
      {step === "import" && (
        <StepImport
          url={url}
          onUrlChange={handleUrlChange}
          images={images}
          onAddFiles={handleAddFiles}
          onRemoveImage={handleRemoveImage}
          onContinue={goToProfile}
          canContinue={url.trim().length > 0 || images.length > 0}
          error={error || apiError}
        />
      )}
      {step === "profile" && (
        <StepProfile
          propertyCountRange={propertyCountRange}
          userType={userType}
          onSelectPropertyCountRange={setPropertyCountRange}
          onSelectUserType={setUserType}
          onContinue={goToEmail}
        />
      )}
      {step === "email" && (
        <StepEmail
          email={email}
          onChange={setEmail}
          onSubmit={runAnalysis}
          loading={submitting}
          error={apiError}
        />
      )}
      {step === "analyzing" && abVariant === "B" && (
        <AnalysisAhaFlow
          done={analysisDone}
          imageUrl={images[0]?.previewUrl}
          onMount={handleAhaMount}
          onFinalizing={handleFinalizing}
          onTransitionEnd={handleTransitionEnd}
        />
      )}
      {step === "analyzing" && abVariant === "A" && (
        <StepAnalyzing done={analysisDone} onFinalizing={handleFinalizing} />
      )}
    </div>
  );
}
