"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingProgress } from "./OnboardingUI";
import { DIRECT_LINK_EMAIL } from "@/lib/contentLink";
import { StepImport } from "./StepImport";
import { StepProfile } from "./StepProfile";
import { StepEmail } from "./StepEmail";
import { StepGoal } from "./StepGoal";
import { StepAnalyzing } from "./StepAnalyzing";
import { AnalysisAhaFlow } from "./AnalysisAhaFlow";
import { AnalysisImmersive, type ListingPreviewState, type VisualStartedInfo } from "./AnalysisImmersive";
import { getLoaderVariant } from "@/lib/loaderExperiment";
import { getOnboardingVariant } from "@/lib/onboardingExperiment";
import { AnalysisLiveCard, ListingConfirmCard } from "./AnalysisLiveCard";
import { EmailCodeVerify } from "@/components/access/EmailCodeVerify";
import {
  clearPendingAnswers,
  rememberEditToken,
  saveAnalysisAnswers,
  savePendingAnswers,
} from "@/lib/analysisOwnership";
import { parseListingPreview } from "@/lib/listingPreview";
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

// "questions": background onboarding only (lib/onboardingExperiment.ts) --
// goal then profile, asked while the analysis already runs.
type Step = "import" | "profile" | "email" | "goal" | "analyzing" | "questions";
type QuestionPhase = "goal" | "profile" | "done";

const MAX_IMAGES = 10;
const MIN_ANIMATION_MS = 3400;
// Above the AI call's own worst case (~225s, see lib/ai.ts) with headroom
// for image upload + DB write, so this only fires on a genuinely stuck
// request instead of racing a real-but-slow analysis.
const FETCH_TIMEOUT_MS = 290_000;

const noopSubscribe = () => () => {};

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
  // Proof of ownership for this browser (lib/analysisEditToken.ts).
  edit_token?: string;
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
  // Analysis loader experiment (lib/loaderExperiment.ts): read once per
  // mount, never assigned here (proxy.ts does that).
  const [loaderVariant] = useState(() => getLoaderVariant());
  // Onboarding experiment (never assigned here). Hydration-safe: the first
  // render matches the server's (control), the real variant follows at once.
  const onboardingVariant = useSyncExternalStore(noopSubscribe, getOnboardingVariant, () => "control" as const);
  const stepRef = useRef<Step>("import");
  const [questionPhase, setQuestionPhase] = useState<QuestionPhase>("goal");
  const questionPhaseRef = useRef<QuestionPhase>("goal");
  // Background onboarding: the result, when it arrived while questions were on screen.
  const [readyResult, setReadyResult] = useState<AnalyzeResponse | null>(null);
  // Stopped by the per-IP abuse limit (busy shared network): verifying the
  // email lifts that limit for this browser (api/analyze). null | "pending" | "verified".
  const [networkLimit, setNetworkLimit] = useState<null | "pending" | "verified">(null);
  const completedAt = useRef<number | null>(null);
  const goalBeforeReady = useRef(false);
  const redirecting = useRef(false);
  const starting = useRef(false);
  const answers = useRef<{ goal: Goal | null; userType: UserType | null; propertyCountRange: PropertyCountRange | null }>({
    goal: null,
    userType: null,
    propertyCountRange: null,
  });
  const pendingResult = useRef<AnalyzeResponse | null>(null);
  // The visitor's own listing for the immersive loader, fetched as soon as
  // the link is submitted so it is ready when the wait starts. Never sent to
  // /api/analyze, which reads the listing itself.
  const [listingPreview, setListingPreview] = useState<ListingPreviewState>({ status: "idle" });
  const previewRequest = useRef<{ url: string; controller: AbortController } | null>(null);
  const loaderViewedAt = useRef<number | null>(null);
  const abandonTrackedFor = useRef<string | null>(null);

  const previousAnalysisId = searchParams.get("previous");
  // Free-trial link (see api/analyze/route.ts) -- read once, never
  // re-checked against searchParams again, same as previousAnalysisId.
  const promoCode = searchParams.get("promo");
  // Content link (/analyze?promo=<code>&direct=1): straight from the listing
  // to the analysis -- no profile, email or goal step. Only honoured with a
  // promo code, so the normal funnel never loses its email step. The report
  // is filed under one internal address instead of a visitor's email.
  const directMode = Boolean(promoCode) && searchParams.get("direct") === "1";
  const submitEmail = () => (directMode ? DIRECT_LINK_EMAIL : email.trim());
  // Background onboarding (never for the content link, which has no questions).
  const bg = onboardingVariant === "background" && !directMode;
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

  /**
   * Immersive loader only: fetch the listing's title, description lines and
   * photos (/api/listing-preview) while the visitor answers the onboarding.
   * Once per link; a changed link aborts the previous request. Failure is a
   * normal outcome: the loader then shows its no-photo state.
   */
  function prefetchListingPreview(rawUrl: string) {
    const trimmedUrl = rawUrl.trim();
    if ((loaderVariant !== "immersive" && !bg) || !isAirbnbUrl(trimmedUrl)) return;
    if (previewRequest.current?.url === trimmedUrl) return;
    previewRequest.current?.controller.abort();
    const controller = new AbortController();
    previewRequest.current = { url: trimmedUrl, controller };
    setListingPreview({ status: "loading" });
    fetch("/api/listing-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmedUrl }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; preview?: unknown };
        if (previewRequest.current?.controller !== controller) return;
        const preview = json.ok ? parseListingPreview(json.preview) : null;
        setListingPreview(preview ? { status: "ready", preview } : { status: "unavailable" });
      })
      .catch(() => {
        if (controller.signal.aborted || previewRequest.current?.controller !== controller) return;
        setListingPreview({ status: "unavailable" });
      });
  }

  function goToProfile() {
    const trimmedUrl = url.trim();
    if (trimmedUrl && images.length === 0 && !isAirbnbUrl(trimmedUrl)) {
      setError("Ce lien Airbnb ne semble pas valide.");
      return;
    }
    if (trimmedUrl) prefetchListingPreview(trimmedUrl);
    track("listing_import_submitted", { input_method: inputMethod(), image_count: images.length });
    if (bg) {
      // Same funnel events the control fires after the profile step.
      const method = inputMethod();
      track("listing_input_submitted", { image_count: images.length, input_method: method });
      if (trimmedUrl) track("airbnb_url_submitted", { input_method: method });
      if (images.length > 0) track("screenshot_upload_completed", { input_method: method, image_count: images.length });
      setStep("email");
      return;
    }
    if (directMode) {
      const method = inputMethod();
      track("listing_input_submitted", { image_count: images.length, input_method: method, direct_link: true });
      void runAnalysis();
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
    // Background onboarding: the visitor may reach the result well after the
    // analysis finished (still answering) -- duration_ms stays the analysis.
    const endMs = bg && completedAt.current ? completedAt.current : Date.now();
    const elapsedMs = endMs - (startedAt.current ?? Date.now());
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
    if (bg) {
      // The analysis starts now; goal and profile are asked while it runs.
      void runAnalysis();
      return;
    }
    // The goal question is now asked to every visitor (it used to be part of
    // the B arm only); the A/B split still drives the loader.
    setStep("goal");
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
      submitEmail().toLowerCase(),
      // Background onboarding: answers come after the start and are
      // attached separately -- they never make a new attempt.
      bg ? null : goal,
      bg ? null : userType,
      bg ? null : propertyCountRange,
      previousAnalysisId,
      promoCode,
    ]);
  }

  /**
   * Background onboarding: attach the answers to the stored analysis (only
   * this browser's edit token allows it), then go to the result. Answers are
   * read from a ref: this can run from a timer set before they were given.
   */
  async function redirectToResult(json: AnalyzeResponse) {
    if (redirecting.current) return;
    redirecting.current = true;
    const a = answers.current;
    if (json.id && (a.goal || a.userType || a.propertyCountRange)) {
      const ok = await saveAnalysisAnswers(json.id, {
        goal: a.goal,
        user_type: a.userType,
        property_count_range: a.propertyCountRange,
      });
      if (a.goal) track("goal_saved", { analysisId: json.id, timing: goalBeforeReady.current ? "before_ready" : "after_ready", via: "onboarding", ok });
    }
    clearPendingAnswers(attemptId.current);
    finishAndRedirect(json);
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
    rememberEditToken(json.id, json.edit_token);

    if (bg) {
      completedAt.current = Date.now();
      const onboardingDone = stepRef.current !== "questions";
      track("analysis_ready", { attemptId: attemptId.current, analysisId: json.id, onboarding_done: onboardingDone });
      if (!onboardingDone) {
        // Still answering: never pull the visitor away mid-question. The
        // "Ton diagnostic est prêt" notice offers the way to the result.
        pendingResult.current = json;
        setReadyResult(json);
        setAnalysisDone(true);
        return;
      }
    }

    setAnalysisDone(true);
    if (abVariant === "B" || loaderVariant === "immersive") {
      // AnalysisAhaFlow drives its own short "Ta première impression est
      // prête." beat once `done` flips true, then calls onTransitionEnd.
      pendingResult.current = json;
    } else {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      const wait = Math.max(MIN_ANIMATION_MS - elapsed, 700);
      setTimeout(() => (bg ? void redirectToResult(json) : finishAndRedirect(json)), wait);
    }
  }

  function backToRetryStep() {
    setSubmitting(false);
    if (bg) {
      // Background onboarding: stay with the questions (answers kept); the
      // error and a "relancer" button are shown there.
      if (stepRef.current === "analyzing") {
        questionPhaseRef.current = "done";
        setQuestionPhase("done");
      }
      setStep("questions");
      return;
    }
    // A goal is already selected at this point -- sending them back to
    // "email" would force re-entering the email AND re-answering the goal
    // question. "goal" keeps both: the email stays filled in and the goal
    // choice is still selected, just one more tap on Continuer to retry.
    setStep("goal");
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
      complete({ id: status.id, overall_score: status.overall_score, edit_token: status.edit_token }, trigger);
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
          email: submitEmail(),
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
        if (json.error_code === "rate_limited" && (json as { rate_scope?: string }).rate_scope === "ip" && !directMode) {
          setNetworkLimit("pending");
        }
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
    if (submitting || starting.current) return;
    // Synchronous guard: two clicks in the same tick both saw submitting=false.
    starting.current = true;
    setSubmitting(true);
    setNetworkLimit(null);
    setAnalysisDone(false);
    setApiError(null);
    pendingResult.current = null;
    // Background onboarding: the questions while it runs (or straight to the
    // loader when they were already answered, e.g. a retry after a failure).
    const toQuestions = bg && questionPhaseRef.current !== "done";
    if (bg) {
      setReadyResult(null);
      completedAt.current = null;
      redirecting.current = false;
    }
    setStep(toQuestions ? "questions" : "analyzing");
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
    if (url.trim()) prefetchListingPreview(url);
    if (!toQuestions) trackLoaderViewed(bg);
    track("analysis_started", {
      attemptId: attemptId.current,
      image_count: images.length,
      has_listing_url: url.trim().length > 0,
      input_method: method,
      is_retry: isSameAttempt,
      ...(bg ? { stage: "after_email" } : {}),
      ...classifyUserAgent(navigator.userAgent),
    });
    if (method === "airbnb_url") {
      track("airbnb_url_extraction_started", { attemptId: attemptId.current });
    }

    await submitAttempt("initial");
  }

  /**
   * The waiting screen is shown. Background onboarding fires it only when the
   * loader really appears (after the questions), flagged after_questions, so
   * the loader experiment's denominator never counts a loader nobody saw.
   */
  function trackLoaderViewed(afterQuestions: boolean) {
    loaderViewedAt.current = Date.now();
    track("analysis_loader_viewed", {
      attemptId: attemptId.current,
      loader: loaderVariant === "immersive" ? "immersive" : abVariant === "B" ? "aha_flow" : "step_analyzing",
      input_method: inputMethod(),
      preview_status: loaderVariant === "immersive" ? (url.trim() ? listingPreview.status : "screenshots") : null,
      ...(afterQuestions ? { after_questions: true } : {}),
    });
  }

  // ---- Background onboarding: questions while the analysis runs ---------

  function handleSelectGoalBackground(value: Goal) {
    goalBeforeReady.current = !pendingResult.current;
    handleSelectGoal(value);
  }

  function finishQuestions() {
    track("onboarding_completed", { goal, flow: "background" });
    questionPhaseRef.current = "done";
    setQuestionPhase("done");
    if (apiError) return; // the error panel offers the retry
    if (pendingResult.current) {
      void redirectToResult(pendingResult.current);
      return;
    }
    trackLoaderViewed(true);
    setStep("analyzing");
  }

  function openReadyResult() {
    if (!pendingResult.current) return;
    track("analysis_ready_cta_clicked", { attemptId: attemptId.current, question: questionPhaseRef.current });
    void redirectToResult(pendingResult.current);
  }

  // Latest functions for the listeners/timers below (see `latest`).
  useEffect(() => {
    latest.current.checkStatus = (trigger) => void checkStatus(trigger);
    stepRef.current = step;
    questionPhaseRef.current = questionPhase;
    answers.current = { goal, userType, propertyCountRange };
  });

  useEffect(() => {
    if (!submitting) starting.current = false;
  }, [submitting]);

  // Background onboarding: answers survive a reload or a closed tab until
  // they reach the stored analysis (ResumeAnalysisBanner attaches them).
  useEffect(() => {
    if (!bg || !attemptId.current || (step !== "questions" && step !== "analyzing")) return;
    savePendingAnswers(attemptId.current, { goal, user_type: userType, property_count_range: propertyCountRange });
  }, [bg, step, goal, userType, propertyCountRange]);

  // The email step was shown (both variants: abandonment at this step).
  useEffect(() => {
    if (step !== "email") return;
    track("email_step_viewed", {
      listing_preview: bg ? (url.trim() ? listingPreview.status : "screenshots") : "not_shown",
    });
    // Once per visit of the step, with the preview state at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // A question shown while the analysis works (background only).
  useEffect(() => {
    if (step !== "questions" || questionPhase === "done") return;
    track("onboarding_question_viewed", {
      attemptId: attemptId.current,
      question: questionPhase,
      analysis_state: apiError ? "failed" : readyResult ? "ready" : "running",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, questionPhase]);

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
    // Leaving the page while the analysis still runs. Tentative by
    // definition (see analytics.ts): the dashboard only counts it as an
    // abandonment if the same attempt never completed or failed afterwards.
    function onPageHide() {
      const id = attemptId.current;
      const waiting = latest.current.inFlight || recovery.current.active;
      if (!id || !waiting || finished.current || abandonTrackedFor.current === id) return;
      abandonTrackedFor.current = id;
      track("analysis_loader_abandoned", {
        attemptId: id,
        tentative: true,
        elapsed_ms: loaderViewedAt.current != null ? Date.now() - loaderViewedAt.current : null,
      });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
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
    if (!pendingResult.current) return;
    if (bg && stepRef.current !== "analyzing") return; // questions on screen: the notice handles it
    if (loaderVariant === "immersive") {
      // End of the visual sequence -- distinct from analysis_completed (the
      // real end of the processing), which finishAndRedirect fires next.
      // Deliberately WITHOUT analysisId: the Stripe webhook attributes a
      // payment from the earliest event carrying the analysis id, which must
      // stay analysis_completed (it carries input method and profile).
      track("analysis_visual_completed", {
        attemptId: attemptId.current,
        visual_ms: loaderViewedAt.current != null ? Date.now() - loaderViewedAt.current : null,
      });
    }
    if (bg) void redirectToResult(pendingResult.current);
    else finishAndRedirect(pendingResult.current);
  }

  function handleVisualStarted(info: VisualStartedInfo) {
    const preview = listingPreview.status === "ready" ? listingPreview.preview : null;
    track("analysis_visual_started", {
      attemptId: attemptId.current,
      first_element: info.first_element,
      preview_status: url.trim() ? listingPreview.status : "screenshots",
      photo_count: preview ? preview.imageUrls.length : images.length,
      has_title: Boolean(preview?.title),
      description_lines: preview?.descriptionLines.length ?? 0,
      ms_since_loader: loaderViewedAt.current != null ? Date.now() - loaderViewedAt.current : null,
    });
  }

  // Onboarding progress (the loader keeps its own layout, untouched).
  const onboardingSteps: { id: Step; label: string }[] = [
    { id: "import", label: "Ton annonce" },
    { id: "profile", label: "Ton profil" },
    { id: "email", label: "Ton email" },
    { id: "goal", label: "Ton objectif" },
  ];
  const onboardingIndex = onboardingSteps.findIndex((s) => s.id === step);
  // Background onboarding: annonce → email → objectif → profil (the last two during the analysis).
  const bgSteps = ["Ton annonce", "Ton email", "Ton objectif", "Ton profil"];
  const bgIndex =
    step === "import" ? 0 : step === "email" ? 1 : step === "questions" ? (questionPhase === "goal" ? 2 : 3) : -1;
  const liveState = apiError ? "failed" : readyResult ? "ready" : "running";
  const networkLimitVerify =
    networkLimit === "verified" ? (
      <p className="text-[13px] font-medium text-foreground">C&apos;est confirmé. Tu peux relancer l&apos;analyse.</p>
    ) : (
      <EmailCodeVerify
        requestBody={{ email: submitEmail(), purpose: "continue" }}
        verifyBody={(code) => ({ email: submitEmail(), code })}
        requestLabel="Vérifier mon email pour continuer"
        onVerified={() => {
          track("access_verified", { purpose: "network_limit" });
          setNetworkLimit("verified");
        }}
      />
    );

  return (
    <div className={step === "analyzing" ? "mx-auto max-w-lg px-5 py-12 sm:py-16" : "relative isolate"}>
      {step !== "analyzing" && (
        <>
          <div aria-hidden className="hero-grid pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[620px]" />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-56 left-1/2 -z-10 h-[520px] w-[min(900px,140vw)] -translate-x-1/2 rounded-full bg-accent/[0.08] blur-[120px]"
          />
        </>
      )}
      <div
        className={
          step === "analyzing"
            ? undefined
            : step === "questions"
              ? "mx-auto max-w-5xl px-5 pt-10 pb-20 sm:pt-16 sm:pb-28"
              : "mx-auto max-w-xl px-5 pt-10 pb-20 sm:pt-16 sm:pb-28"
        }
      >
      {step !== "analyzing" && !bg && onboardingIndex >= 0 && !directMode && (
        <OnboardingProgress steps={onboardingSteps.map((s) => s.label)} current={onboardingIndex} />
      )}
      {bg && bgIndex >= 0 && (
        <div className="mx-auto max-w-xl">
          <OnboardingProgress steps={bgSteps} current={bgIndex} />
        </div>
      )}
      {previousAnalysisId && step !== "analyzing" && (
        <div className="mb-6 rounded-2xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent-hover">
          Nouvelle analyse après modifications — on comparera ton nouveau {BRAND_NAME} à
          l&apos;ancien.
        </div>
      )}
      {step !== "analyzing" && step !== "questions" && <ResumeAnalysisBanner />}
      {(step === "analyzing" || step === "questions") && recoveryNotice && (
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
          continueLabel={directMode ? "Lancer l'analyse" : undefined}
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
          {...(bg
            ? {
                submitLabel: "Lancer l'analyse",
                confirm: (
                  <ListingConfirmCard
                    preview={url.trim() ? (listingPreview.status === "idle" ? { status: "loading" } : listingPreview) : { status: "idle" }}
                    screenshotUrls={images.map((img) => img.previewUrl)}
                    onEdit={() => setStep("import")}
                  />
                ),
              }
            : {})}
        />
      )}
      {step === "questions" && (
        <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
          <div className="lg:sticky lg:top-28">
            <AnalysisLiveCard
              preview={url.trim() ? (listingPreview.status === "idle" ? { status: "unavailable" } : listingPreview) : { status: "idle" }}
              screenshotUrls={images.map((img) => img.previewUrl)}
              state={liveState}
            />
            {readyResult && !apiError && (
              <div role="status" aria-live="polite" className="animate-fade-up mt-4 rounded-[var(--radius-lg)] border border-accent/30 bg-accent-soft px-4 py-4 text-left">
                <p className="text-[15px] font-semibold text-foreground">Ton diagnostic est prêt</p>
                <p className="mt-1 text-[13px] text-muted">
                  {questionPhase === "done"
                    ? "Tu peux le consulter maintenant."
                    : "Tu peux le voir maintenant, ou finir la question : ta réponse sera appliquée à ton rapport."}
                </p>
                <button
                  type="button"
                  onClick={openReadyResult}
                  className="btn-sheen mt-3 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
                >
                  Voir mon diagnostic →
                </button>
              </div>
            )}
          </div>
          <div className="mt-8 lg:mt-0">
            {apiError && (
              <div role="alert" className="mb-8 rounded-[var(--radius-lg)] border border-score-low/25 bg-score-low/[0.06] px-4 py-4 text-left">
                <p className="text-[15px] font-semibold text-foreground">L&apos;analyse n&apos;a pas pu être terminée.</p>
                <p className="mt-1 text-[13.5px] text-muted">{apiError}</p>
                <p className="mt-1 text-[13px] text-muted-2">Tes réponses sont conservées.</p>
                {networkLimit && <div className="mt-3">{networkLimitVerify}</div>}
                <button
                  type="button"
                  onClick={() => void runAnalysis()}
                  disabled={submitting}
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
                >
                  Relancer l&apos;analyse
                </button>
              </div>
            )}
            {questionPhase === "goal" && (
              <StepGoal
                goal={goal}
                onSelect={handleSelectGoalBackground}
                onContinue={() => setQuestionPhase("profile")}
                onSkip={() => setQuestionPhase("profile")}
                continueLabel="Continuer"
              />
            )}
            {questionPhase === "profile" && (
              <StepProfile
                propertyCountRange={propertyCountRange}
                userType={userType}
                onSelectPropertyCountRange={setPropertyCountRange}
                onSelectUserType={setUserType}
                onContinue={finishQuestions}
              />
            )}
            {questionPhase === "done" && !apiError && !readyResult && (
              <p className="text-sm text-muted">Merci ! On termine ton analyse…</p>
            )}
          </div>
        </div>
      )}
      {step === "goal" && (
        <StepGoal goal={goal} onSelect={handleSelectGoal} onContinue={handleGoalContinue} error={apiError} />
      )}
      {step === "goal" && networkLimit && <div className="mt-5">{networkLimitVerify}</div>}
      {step === "analyzing" && loaderVariant === "immersive" && (
        <AnalysisImmersive
          done={analysisDone}
          preview={
            url.trim()
              ? listingPreview.status === "idle"
                ? { status: "unavailable" }
                : listingPreview
              : { status: "idle" }
          }
          screenshotUrls={images.map((img) => img.previewUrl)}
          startedAtMs={bg ? (startedAt.current ?? undefined) : undefined}
          onVisualStarted={handleVisualStarted}
          onFinalizing={handleFinalizing}
          onTransitionEnd={handleTransitionEnd}
        />
      )}
      {step === "analyzing" && loaderVariant !== "immersive" && abVariant === "B" && (
        <AnalysisAhaFlow
          done={analysisDone}
          imageUrl={images[0]?.previewUrl}
          onMount={handleAhaMount}
          onFinalizing={handleFinalizing}
          onTransitionEnd={handleTransitionEnd}
        />
      )}
      {step === "analyzing" && loaderVariant !== "immersive" && abVariant === "A" && (
        <StepAnalyzing done={analysisDone} onFinalizing={handleFinalizing} />
      )}
      </div>
    </div>
  );
}
