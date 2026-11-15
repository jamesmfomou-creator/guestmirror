"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StepImport } from "./StepImport";
import { StepProfile } from "./StepProfile";
import { StepEmail } from "./StepEmail";
import { StepGoal } from "./StepGoal";
import { StepAnalyzing } from "./StepAnalyzing";
import { AnalysisAhaFlow } from "./AnalysisAhaFlow";
import { PendingImage, fileToBase64 } from "@/lib/files";
import { track } from "@/lib/analytics";
import { getAbVariant } from "@/lib/ab";
import { isAirbnbUrl } from "@/lib/airbnbUrl";
import { takePendingFiles } from "@/lib/pendingUpload";
import { BRAND_NAME } from "@/lib/brand";
import { verdictFor } from "@/lib/utils";
import { UserType, PropertyCountRange, Goal } from "@/lib/types";
import { ResumeAnalysisBanner } from "./ResumeAnalysisBanner";
import {
  classifyUserAgent,
  clearPendingAttempt,
  fetchAttemptStatus,
  isConnectionLoss,
  newAttemptId,
  nextPollDelayMs,
  recoveryDeadlineAt,
  RECOVERY_MIN_WINDOW_MS,
  savePendingAttempt,
} from "@/lib/analysisRecovery";

type Step = "import" | "profile" | "email" | "goal" | "analyzing";

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

const GENERIC_FAILURE_MESSAGE = "L'analyse n'a pas pu être réalisée pour le moment. Réessaie dans quelques instants.";

type AnalyzeResponse = {
  id?: string;
  overall_score?: number;
  timings?: Record<string, number | null>;
  ai_stop_reason?: string | null;
  // The server found this attempt already finished and returned the stored
  // analysis instead of running a new one (see api/analyze/route.ts).
  deduplicated?: boolean;
};

// How a result reached the browser when it did NOT come straight back from
// the original request -- recorded on analysis_recovered/analysis_completed.
type RecoveryTrigger = "immediate" | "poll" | "visibility" | "online" | "resubmit" | "manual_retry";

// What the visitor is told while the browser is reconnecting to an analysis
// it lost track of. Always a statement of what is actually known.
type RecoveryNotice = "checking" | "processing" | "offline" | "already_running";

const RECOVERY_NOTICES: Record<RecoveryNotice, { title: string; body: string }> = {
  checking: {
    title: "Connexion interrompue",
    body: "On vérifie où en est ton analyse…",
  },
  processing: {
    title: "Ton analyse continue",
    body: "La connexion a été interrompue, mais ton analyse est toujours en cours sur nos serveurs. Ton résultat s'affichera ici automatiquement — garde cette page ouverte.",
  },
  offline: {
    title: "Tu sembles hors ligne",
    body: "Dès que la connexion revient, on reprend automatiquement là où ton analyse en est.",
  },
  already_running: {
    title: "Ton analyse est déjà en cours",
    body: "Ton résultat s'affichera ici automatiquement — garde cette page ouverte.",
  },
};

interface RecoveryState {
  active: boolean;
  cause: "timeout" | "network_error" | "in_flight";
  lostAtMs: number;
  deadlineAtMs: number;
  polls: number;
  unknownCount: number;
  resubmitted: boolean;
  lastStatus: string | null;
}

const IDLE_RECOVERY: RecoveryState = {
  active: false,
  cause: "network_error",
  lostAtMs: 0,
  deadlineAtMs: 0,
  polls: 0,
  unknownCount: 0,
  resubmitted: false,
  lastStatus: null,
};

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
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<RecoveryNotice | null>(null);
  const startedAt = useRef<number | null>(null);
  const attemptId = useRef<string | null>(null);
  // ---- Connection-loss recovery (applies identically to both A/B arms:
  // everything lives here in the wizard, the two loader components are
  // untouched). See lib/analysisRecovery.ts for the why.
  // Inputs the current attempt id was generated for: the id is reused only
  // for a resubmission of the exact same inputs.
  const attemptSignature = useRef<string | null>(null);
  // True after an attempt ended without a verdict from the server (we lost
  // the connection and could not get it back in time). The next submission
  // of the same inputs then reuses the id, so if the server did finish, the
  // visitor gets that analysis instantly instead of paying the wait again.
  const reuseAttempt = useRef(false);
  // Set the moment a result is in hand, by whichever path got it first.
  const finished = useRef(false);
  const recovery = useRef<RecoveryState>({ ...IDLE_RECOVERY });
  const recoveredVia = useRef<RecoveryTrigger | null>(null);
  const checkingStatus = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const hidden = useRef<{ since: number | null; totalMs: number }>({ since: null, totalMs: 0 });
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  // Window listeners and timers must call the *current* render's functions
  // (which close over the current url/images/profile state), not the ones
  // from the render they were registered in.
  const latest = useRef<{ checkStatus: (trigger: RecoveryTrigger) => void; inFlight: boolean }>({
    checkStatus: () => {},
    inFlight: false,
  });
  // Assigned once per visitor (persisted, see lib/ab.ts) and read once per
  // mount -- never re-rolled mid-session.
  const [abVariant] = useState(() => getAbVariant());
  const pendingResult = useRef<AnalyzeResponse | null>(null);

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

  function finishAndRedirect(json: AnalyzeResponse) {
    const method = inputMethod();
    const elapsedMs = Date.now() - (startedAt.current ?? Date.now());
    const recovered = recoveredVia.current;
    track("analysis_completed", {
      attemptId: attemptId.current,
      analysisId: json.id,
      overall_score: json.overall_score,
      verdict: json.overall_score != null ? verdictFor(json.overall_score).short : undefined,
      image_count: images.length,
      has_listing_url: url.trim().length > 0,
      input_method: method,
      // duration_ms is what the dashboard's latency stats are built from
      // ("how long does an analysis take"). A recovered result's wall-clock
      // includes however long the phone stayed locked, and a deduplicated
      // one comes back in milliseconds -- neither measures the analysis, so
      // both are reported under a separate field and flagged instead.
      ...(recovered
        ? { recovered: true, recovery_trigger: recovered, client_elapsed_ms: elapsedMs }
        : { duration_ms: elapsedMs }),
      user_type: userType,
      property_count_range: propertyCountRange,
      ai_stop_reason: json.ai_stop_reason ?? null,
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

  function handleEmailSubmit() {
    track("email_submitted", { email: email.trim() });
    // Variant B only (see the funnel optimization mission's A/B decision:
    // folded into the existing "Aha moment" B arm rather than a new,
    // orthogonal test) -- variant A's path is untouched, straight to
    // runAnalysis exactly as before.
    if (abVariant === "B") {
      setStep("goal");
    } else {
      runAnalysis();
    }
  }

  function handleSelectGoal(value: Goal) {
    setGoal(value);
    track("onboarding_goal_selected", { goal: value });
  }

  function handleGoalContinue() {
    track("onboarding_completed", { goal });
    runAnalysis();
  }

  function submissionSignature() {
    return JSON.stringify([
      url.trim(),
      images.map((i) => i.id),
      email.trim().toLowerCase(),
      goal,
      userType,
      propertyCountRange,
      previousAnalysisId,
      promoCode,
    ]);
  }

  // Keeps the screen on while the analysis runs, where the browser supports
  // it. The audit's leading (unproven) hypothesis for lost requests is the
  // phone auto-locking ~30 s into a ~60 s wait and the OS suspending the
  // page. Purely progressive enhancement: unsupported, denied or released by
  // the browser, the analysis proceeds exactly as before.
  async function acquireWakeLock() {
    try {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      wakeLock.current = await navigator.wakeLock.request("screen");
    } catch {
      wakeLock.current = null;
    }
  }

  function releaseWakeLock() {
    const lock = wakeLock.current;
    wakeLock.current = null;
    lock?.release().catch(() => {});
  }

  function hiddenMs() {
    const h = hidden.current;
    return h.totalMs + (h.since != null ? Date.now() - h.since : 0);
  }

  function clientContext() {
    return {
      ...classifyUserAgent(navigator.userAgent),
      visibility: document.visibilityState,
      online: navigator.onLine,
      hidden_ms: hiddenMs(),
      wake_lock_held: wakeLock.current != null && !wakeLock.current.released,
    };
  }

  /** Ends everything attached to the current attempt except its outcome. */
  function settle(options: { keepPending?: boolean } = {}) {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
    recovery.current = { ...IDLE_RECOVERY };
    latest.current.inFlight = false;
    setRecoveryNotice(null);
    releaseWakeLock();
    if (!options.keepPending) clearPendingAttempt();
  }

  function complete(json: AnalyzeResponse, via: RecoveryTrigger | null) {
    if (finished.current) return;
    finished.current = true;
    const rec = recovery.current;
    if (via) {
      recoveredVia.current = via;
      track("analysis_recovered", {
        attemptId: attemptId.current,
        analysisId: json.id,
        recovery_trigger: via,
        cause: rec.active ? rec.cause : null,
        lost_for_ms: rec.active ? Date.now() - rec.lostAtMs : null,
        polls: rec.polls,
        resubmitted: rec.resubmitted,
        ...clientContext(),
      });
    }
    settle();
    // A request still hanging on a dead connection has nothing left to tell
    // us; its catch block sees `finished` and stays silent.
    activeRequest.current?.abort();

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
  }

  function backToRetryStep() {
    setSubmitting(false);
    // Variant B already has a goal selected in state at this point --
    // sending them back to "email" would force re-entering the email
    // AND re-answering the goal question. "goal" keeps both: the email
    // stays filled in (state, not re-asked) and the goal choice is
    // still selected, just needs one more tap on Continuer to retry.
    setStep(abVariant === "B" ? "goal" : "email");
  }

  /** The server's own verdict on this attempt: it stopped, with this code. */
  function failAttempt(errorCode: string, message: string, extra: Record<string, string | number | boolean | null> = {}) {
    if (finished.current) return;
    finished.current = true;
    track("analysis_failed", {
      attemptId: attemptId.current,
      error_code: errorCode,
      duration_ms: Date.now() - (startedAt.current ?? Date.now()),
      image_count: images.length,
      input_method: inputMethod(),
      ...extra,
    });
    // A definitive failure: the next try is a new attempt with a new id.
    reuseAttempt.current = false;
    settle();
    setApiError(message);
    backToRetryStep();
  }

  function failExtraction(message: string | undefined) {
    if (finished.current) return;
    finished.current = true;
    // Not a real analysis failure: nothing was analyzed, no record
    // was created. Send the user back to add a screenshot (URL stays
    // filled in) instead of the generic "réessayer" retry screen,
    // and track it separately so it never counts as
    // analysis_completed/analysis_failed downstream.
    track("airbnb_url_extraction_failed", {
      attemptId: attemptId.current,
      duration_ms: Date.now() - (startedAt.current ?? Date.now()),
    });
    reuseAttempt.current = false;
    settle();
    setApiError(message || "Impossible d'analyser automatiquement ce lien Airbnb.");
    setSubmitting(false);
    setStep("import");
  }

  /**
   * Recovery ran out of time without ever learning the outcome. Reported as
   * the failure it started as (network_error / timeout) -- flagged, so the
   * dashboard can tell "lost and never found" from the pre-recovery numbers.
   */
  function giveUpRecovery() {
    if (finished.current) return;
    finished.current = true;
    const rec = recovery.current;
    track("analysis_failed", {
      attemptId: attemptId.current,
      error_code: rec.cause === "network_error" ? "network_error" : "timeout",
      duration_ms: Date.now() - (startedAt.current ?? Date.now()),
      image_count: images.length,
      input_method: inputMethod(),
      recovery_attempted: true,
      recovery_polls: rec.polls,
      recovery_last_status: rec.lastStatus,
      resubmitted: rec.resubmitted,
      ...clientContext(),
    });
    // Same id next time, and the pending marker stays: if the server did
    // finish, "Réessayer" (or coming back later) returns that analysis at
    // once -- no second wait, no second model call.
    reuseAttempt.current = true;
    settle({ keepPending: true });
    activeRequest.current?.abort();
    setApiError(
      "La connexion a été interrompue et on n'a pas pu récupérer ton analyse. Réessaie : si elle s'est terminée entre-temps, tu la retrouveras tout de suite."
    );
    backToRetryStep();
  }

  function scheduleNextPoll() {
    const rec = recovery.current;
    if (!rec.active || finished.current) return;
    if (Date.now() >= rec.deadlineAtMs) {
      giveUpRecovery();
      return;
    }
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(() => latest.current.checkStatus("poll"), nextPollDelayMs(rec.polls));
  }

  /**
   * Asks the server what became of the current attempt. In recovery it
   * drives the whole flow; outside of it (page just came back to the
   * foreground while the original request is still pending) only a
   * "completed" answer matters and anything else is ignored.
   */
  async function checkStatus(trigger: RecoveryTrigger) {
    const id = attemptId.current;
    if (!id || finished.current || checkingStatus.current) return;
    checkingStatus.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;

    let status: Awaited<ReturnType<typeof fetchAttemptStatus>> | null;
    try {
      status = await fetchAttemptStatus(id);
    } catch {
      status = null; // still no connection
    }
    checkingStatus.current = false;
    // The attempt may have ended, or a new one started, while we waited.
    if (finished.current || attemptId.current !== id) return;

    if (status?.status === "completed" && status.id) {
      complete({ id: status.id, overall_score: status.overall_score }, trigger);
      return;
    }

    const rec = recovery.current;
    if (!rec.active) return;
    rec.polls += 1;
    rec.lastStatus = status?.status ?? "unreachable";

    if (!status) {
      setRecoveryNotice("offline");
    } else if (status.status === "failed") {
      if (status.error_code === "airbnb_url_extraction_failed") {
        failExtraction(undefined);
      } else {
        failAttempt(status.error_code || "unknown", GENERIC_FAILURE_MESSAGE, { learned_via: "status" });
      }
      return;
    } else if (status.status === "processing") {
      setRecoveryNotice(rec.cause === "in_flight" ? "already_running" : "processing");
    } else {
      // "unknown": the server has no trace of this attempt. Once could be
      // timing; twice, with a working connection, means the request never
      // arrived (dropped during upload). Send it again -- same attempt id,
      // so even if we are wrong the server runs it at most once.
      rec.unknownCount += 1;
      if (rec.unknownCount >= 2 && !rec.resubmitted) {
        rec.resubmitted = true;
        track("analysis_retry", {
          attemptId: id,
          reason: "server_never_received",
          cause: rec.cause,
          elapsed_ms: Date.now() - (startedAt.current ?? Date.now()),
          ...clientContext(),
        });
        setRecoveryNotice("checking");
        void submitAttempt("resubmit");
        return;
      }
      setRecoveryNotice("checking");
    }
    scheduleNextPoll();
  }

  function enterRecovery(cause: RecoveryState["cause"]) {
    if (finished.current) return;
    const now = Date.now();
    const rec = recovery.current;
    if (!rec.active) {
      recovery.current = {
        active: true,
        cause,
        lostAtMs: now,
        deadlineAtMs: recoveryDeadlineAt(startedAt.current ?? now, now),
        polls: 0,
        unknownCount: 0,
        resubmitted: false,
        lastStatus: null,
      };
      track("analysis_connection_lost", {
        attemptId: attemptId.current,
        cause,
        elapsed_ms: now - (startedAt.current ?? now),
        image_count: images.length,
        input_method: inputMethod(),
        ...clientContext(),
      });
      setRecoveryNotice(cause === "in_flight" ? "already_running" : "checking");
    } else {
      // The resubmission was lost too: keep looking, with a fresh minimum
      // window so it gets a real chance.
      rec.deadlineAtMs = Math.max(rec.deadlineAtMs, now + RECOVERY_MIN_WINDOW_MS);
    }
    void checkStatus("immediate");
  }

  async function submitAttempt(kind: "initial" | "resubmit") {
    const timeoutController = new AbortController();
    activeRequest.current = timeoutController;
    latest.current.inFlight = true;
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
          attempt_id: attemptId.current,
          city: null,
          property_type: null,
          guest_capacity: null,
          nightly_price: null,
          images: encodedImages,
          previous_analysis_id: previousAnalysisId || null,
          user_type: userType,
          property_count_range: propertyCountRange,
          goal,
          promo_code: promoCode || null,
        }),
        signal: timeoutController.signal,
      });

      // The server is already working on this exact attempt in another
      // request (double submission, or the resubmission of a request that
      // did arrive after all). Not an error: wait for that one's result.
      if (res.status === 202) {
        enterRecovery("in_flight");
        return;
      }

      let json: AnalyzeResponse & { error?: string; error_code?: string };
      try {
        json = await res.json();
      } catch {
        throw new Error(
          "Une erreur est survenue. Essaie avec des captures moins nombreuses ou plus légères.",
          { cause: "response_parse_failed" }
        );
      }
      if (!res.ok) {
        if (json.error_code === "airbnb_url_extraction_failed") {
          failExtraction(json.error);
          return;
        }
        if (res.status === 413 && images.length > 0) {
          if (finished.current) return;
          finished.current = true;
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
          reuseAttempt.current = false;
          settle();
          setApiError(json.error || "Une des images dépasse la taille maximale autorisée.");
          setSubmitting(false);
          setStep("import");
          return;
        }
        throw new Error(json.error || "Une erreur est survenue. Merci de réessayer.", {
          cause: json.error_code,
        });
      }

      // A result that did not simply come back from the original request
      // is a recovery, however it got here.
      const via: RecoveryTrigger | null =
        kind === "resubmit" ? "resubmit" : json.deduplicated ? "manual_retry" : null;
      complete(json, via);
    } catch (err) {
      // The result already arrived by another path and this request was
      // aborted on purpose.
      if (finished.current) return;

      // No response at all (connection dropped, page suspended, client
      // timeout). Before the 2026-11 audit this was reported as a failed
      // analysis on the spot -- while the server, in every recorded case,
      // went on to finish and store it. Now: find out what really happened.
      const loss = isConnectionLoss(err);
      if (loss) {
        enterRecovery(loss);
        return;
      }

      // `cause` carries the server's specific error_code (see api/analyze/route.ts
      // and lib/ai.ts's categorizeAnthropicError) so admin/analytics can break
      // failures down by real cause instead of a generic "api_error" bucket.
      const serverErrorCode = err instanceof Error && typeof err.cause === "string" ? err.cause : null;
      failAttempt(serverErrorCode || "api_error", err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      clearTimeout(timeoutTimer);
      if (activeRequest.current === timeoutController) {
        activeRequest.current = null;
        latest.current.inFlight = false;
      }
    }
  }

  async function runAnalysis() {
    if (submitting) return;
    setSubmitting(true);
    setAnalysisDone(false);
    setApiError(null);
    pendingResult.current = null;
    setStep("analyzing");
    startedAt.current = Date.now();

    // Same inputs as an attempt we lost track of -> same id, so the server
    // can hand back what it already produced. Anything else -> new attempt.
    const signature = submissionSignature();
    const isSameAttempt =
      reuseAttempt.current && attemptId.current != null && attemptSignature.current === signature;
    if (!isSameAttempt) attemptId.current = newAttemptId();
    attemptSignature.current = signature;
    reuseAttempt.current = false;
    finished.current = false;
    recoveredVia.current = null;
    recovery.current = { ...IDLE_RECOVERY };
    hidden.current = { since: document.visibilityState === "hidden" ? Date.now() : null, totalMs: 0 };
    if (attemptId.current) savePendingAttempt({ attemptId: attemptId.current, startedAtMs: startedAt.current });
    void acquireWakeLock();

    const method = inputMethod();
    if (isSameAttempt) {
      track("analysis_retry", {
        attemptId: attemptId.current,
        reason: "manual_same_attempt",
        ...clientContext(),
      });
    }
    track("analysis_started", {
      attemptId: attemptId.current,
      image_count: images.length,
      has_listing_url: url.trim().length > 0,
      input_method: method,
      is_retry: isSameAttempt,
      ...classifyUserAgent(navigator.userAgent),
    });
    if (method === "airbnb_url") {
      track("airbnb_url_extraction_started", { attemptId: attemptId.current });
    }

    await submitAttempt("initial");
  }

  // Latest functions for the listeners/timers below (see `latest`).
  useEffect(() => {
    latest.current.checkStatus = (trigger) => void checkStatus(trigger);
  });

  useEffect(() => {
    function onVisibilityChange() {
      const h = hidden.current;
      if (document.visibilityState === "hidden") {
        h.since = Date.now();
        return;
      }
      const hiddenFor = h.since != null ? Date.now() - h.since : 0;
      h.totalMs += hiddenFor;
      h.since = null;
      const waiting = latest.current.inFlight || recovery.current.active;
      if (!waiting || finished.current) return;
      // The browser releases a wake lock whenever the page is hidden.
      void acquireWakeLock();
      // Back in the foreground. In recovery: check right away instead of
      // waiting out the backoff. Otherwise, after a real absence, the
      // original request may be dead without having errored yet -- ask
      // whether the analysis finished while we were away.
      if (recovery.current.active || hiddenFor >= 5_000) latest.current.checkStatus("visibility");
    }
    function onOnline() {
      if (recovery.current.active && !finished.current) latest.current.checkStatus("online");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      if (pollTimer.current) clearTimeout(pollTimer.current);
      wakeLock.current?.release().catch(() => {});
    };
  }, []);

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
      {step !== "analyzing" && <ResumeAnalysisBanner />}
      {step === "analyzing" && recoveryNotice && (
        <div
          role="status"
          aria-live="polite"
          className="mb-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-hover"
        >
          <p className="font-semibold">{RECOVERY_NOTICES[recoveryNotice].title}</p>
          <p className="mt-0.5">{RECOVERY_NOTICES[recoveryNotice].body}</p>
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
          onSubmit={handleEmailSubmit}
          loading={submitting}
          error={apiError}
        />
      )}
      {step === "goal" && (
        <StepGoal goal={goal} onSelect={handleSelectGoal} onContinue={handleGoalContinue} error={apiError} />
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
