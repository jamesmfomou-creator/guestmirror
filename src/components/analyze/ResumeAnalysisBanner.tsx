"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import {
  clearPendingAttempt,
  fetchAttemptStatus,
  nextPollDelayMs,
  readPendingAttempt,
} from "@/lib/analysisRecovery";
import { clearPendingAnswers, rememberEditToken, saveAnalysisAnswers, takePendingAnswers } from "@/lib/analysisOwnership";

// Offers the way back to an analysis this browser started but never saw the
// result of (page closed, phone locked, connection lost for good). The only
// thing kept on the device is the random attempt id; the server is asked what
// became of it, and nothing is shown unless it answers that the analysis is
// stored or still running. No report content transits here -- only the id
// needed to open the result page, which stays the access check it always was.

type BannerState =
  | { kind: "hidden" }
  | { kind: "processing" }
  | { kind: "ready"; analysisId: string; overallScore: number | null };

// A returning visitor is not kept waiting on a spinner: a few checks, then
// the banner simply goes away (the pending marker stays for the next visit).
const MAX_POLLS = 8;

const BANNER_CLASS = "rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-hover";

/**
 * `className` positions the banner in its host page (default: the wizard's
 * spacing). It is applied only while there is something to show, so a page
 * that mounts the banner gets no empty gap when there is nothing to resume.
 */
export function ResumeAnalysisBanner({ className = "mb-6" }: { className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<BannerState>({ kind: "hidden" });
  const attempt = useRef<{ attemptId: string; startedAtMs: number } | null>(null);

  useEffect(() => {
    const pending = readPendingAttempt();
    if (!pending) return;
    attempt.current = pending;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;

    async function check() {
      let status: Awaited<ReturnType<typeof fetchAttemptStatus>>;
      try {
        status = await fetchAttemptStatus(pending!.attemptId);
      } catch {
        return; // offline or server unreachable: say nothing, keep the marker
      }
      if (cancelled) return;

      if (status.status === "completed" && status.id) {
        rememberEditToken(status.id, status.edit_token);
        setState({ kind: "ready", analysisId: status.id, overallScore: status.overall_score ?? null });
        return;
      }
      if (status.status === "processing" && polls < MAX_POLLS) {
        setState({ kind: "processing" });
        timer = setTimeout(check, nextPollDelayMs(polls));
        polls += 1;
        return;
      }
      setState({ kind: "hidden" });
      // "failed" / "unknown": nothing to come back to. Still processing
      // after MAX_POLLS: keep the marker, a later visit will find it.
      if (status.status !== "processing") clearPendingAttempt();
    }

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (state.kind === "hidden") return null;

  if (state.kind === "processing") {
    return (
      <div className={className}>
        <div role="status" aria-live="polite" className={BANNER_CLASS}>
          <p className="font-semibold">Ton analyse précédente est encore en cours</p>
          <p className="mt-0.5">Elle s&apos;affichera ici dès qu&apos;elle est prête.</p>
        </div>
      </div>
    );
  }

  const { analysisId } = state;

  async function open() {
    const pending = attempt.current;
    // Answers given during the analysis before the page was closed or
    // reloaded (background onboarding): attach them now, once.
    const answers = takePendingAnswers(pending?.attemptId ?? null);
    if (answers && (answers.goal || answers.user_type || answers.property_count_range)) {
      const ok = await saveAnalysisAnswers(analysisId, answers);
      if (answers.goal) track("goal_saved", { analysisId, timing: "after_ready", via: "resume", ok });
    }
    clearPendingAnswers(pending?.attemptId ?? null);
    track("analysis_recovered", {
      attemptId: pending?.attemptId ?? null,
      analysisId,
      recovery_trigger: "return_visit",
      lost_for_ms: pending ? Date.now() - pending.startedAtMs : null,
    });
    // The visitor reaches their result for the first time here: this is the
    // attempt's analysis_completed. Flagged recovered and without
    // duration_ms, so it never enters the latency statistics.
    track("analysis_completed", {
      attemptId: pending?.attemptId ?? null,
      analysisId,
      overall_score: state.kind === "ready" ? state.overallScore : null,
      recovered: true,
      recovery_trigger: "return_visit",
    });
    clearPendingAttempt();
    router.push(`/result/${analysisId}`);
  }

  function dismiss() {
    clearPendingAttempt();
    setState({ kind: "hidden" });
  }

  return (
    <div className={className}>
      <div role="status" aria-live="polite" className={BANNER_CLASS}>
        <p className="font-semibold">Ta dernière analyse est prête</p>
        <p className="mt-0.5">
          Elle s&apos;est terminée après la coupure de connexion. Tu peux la consulter maintenant.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => void open()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Voir mon résultat
          </button>
          <button type="button" onClick={dismiss} className="text-sm underline underline-offset-2 hover:opacity-70">
            Ignorer
          </button>
        </div>
      </div>
    </div>
  );
}
