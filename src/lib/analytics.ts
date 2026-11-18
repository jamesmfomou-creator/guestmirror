import { captureAttribution, getAnonymousId, getFirstTouch, getLastTouch, getSessionId } from "@/lib/tracking/identity";
import { getAbVariant } from "@/lib/ab";
import { getPaywallVariant } from "@/lib/paywallExperiment";
import { getLoaderVariant } from "@/lib/loaderExperiment";
import { getOnboardingVariant } from "@/lib/onboardingExperiment";
import { PRICING_VERSION } from "@/lib/plans";

/**
 * Full set of event names this app can emit. Exported as a plain array
 * (not just a type) so the server-side /api/track route can validate
 * incoming event names against the exact same list -- one source of truth.
 */
export const ANALYTICS_EVENTS = [
  // Core funnel: landing -> payment.
  "landing_view",
  "cta_test_clicked",
  "upload_started",
  "upload_completed",
  // Precise, method-specific replacements for the ambiguous pair above --
  // upload_completed used to fire for URL-only submissions too (no
  // screenshot involved), which is what made the old funnel numbers
  // incoherent (uploads "completed" outnumbering uploads "started"). Old
  // events are left firing unchanged for continuity; the funnel table in
  // /admin/analytics now uses listing_input_submitted instead.
  "listing_input_submitted",
  "airbnb_url_started",
  "airbnb_url_submitted",
  "airbnb_url_extraction_started",
  "airbnb_url_extraction_success",
  "screenshot_upload_started",
  "screenshot_upload_completed",
  "screenshot_upload_failed",
  "email_submitted",
  "analysis_started",
  // Fires once per attempt, when the loader visually enters the
  // "finalizing" phase (~90%). Doubles as the marker for "time spent
  // finalizing" (diffed against analysis_completed/analysis_failed) --
  // see the "Performance des analyses" section of /admin/analytics.
  "analysis_progress_90",
  "analysis_completed",
  // Real failure (API error, timeout, network) as opposed to a silent
  // drop-off -- lets the dashboard tell errors apart from abandonment.
  "analysis_failed",
  // Connection-loss recovery (see lib/analysisRecovery.ts). None of these
  // is an outcome on its own -- an attempt still ends in exactly one
  // analysis_completed or analysis_failed:
  //  - analysis_connection_lost: the browser lost the request and started
  //    asking the server what became of the attempt.
  //  - analysis_retry: the same attempt was sent again (same attemptId, so
  //    never a second analysis) -- automatically because the server never
  //    received it, or manually after an inconclusive recovery.
  //  - analysis_recovered: a result reached the visitor by another path
  //    than the original response.
  "analysis_connection_lost",
  "analysis_retry",
  "analysis_recovered",
  // Airbnb-URL-only submission where the listing page couldn't be fetched
  // or had no usable photos. Deliberately NOT analysis_failed/completed:
  // this never reaches the AI and no analysis record is created, so it
  // must not count toward analysis_completed, free_result_viewed, or
  // paywall_viewed downstream.
  "airbnb_url_extraction_failed",
  "free_result_viewed",
  "main_problem_viewed",
  "paywall_viewed",
  "unlock_clicked",
  "checkout_started",
  "payment_completed",
  // Pricing (2-offer paywall: one-time analysis vs GuestMirror Plus).
  "pricing_viewed",
  "one_time_offer_clicked",
  "plus_offer_clicked",
  "one_time_checkout_started",
  "subscription_checkout_started",
  "one_time_payment_completed",
  "subscription_started",
  "subscription_cancelled",
  "subscription_payment_failed",
  // GuestMirror Lifetime (mode=payment, see STRIPE_PRICE_LIFETIME): a
  // third, limited-launch offer alongside one_time/plus above. Same
  // *_offer_clicked / *_checkout_started naming convention.
  "lifetime_offer_clicked",
  "lifetime_checkout_started",
  "lifetime_payment_completed",
  // Short profile question ("how many listings do you manage?"), asked
  // once right after import (see StepProfile) -- purely for segmentation,
  // never blocks the flow.
  "profile_submitted",
  // Post-purchase, optional, never blocks access to the report.
  "feedback_submitted",
  "testimonial_submitted",
  // Compare mode.
  "compare_viewed",
  "compare_upload_a_completed",
  "compare_upload_b_completed",
  "compare_started",
  "compare_completed",
  "compare_demo_viewed",
  "compare_cta_clicked",
  // Secondary / supplementary (kept from before this instrumentation pass).
  "test_clicked",
  "aha_moment_viewed",
  "full_analysis_viewed",
  "purchase_completed",
  "rescan_started",
  "rescan_completed",
  "before_after_viewed",
  "share_clicked",
  // "Aha moment" A/B test (marketing experiment on the pre-paywall flow --
  // not to be confused with GuestMirror's own A/B photo compare product
  // feature). ab_variant is attached to every event automatically by
  // track() below. Fired for both variants unless noted, so the funnel
  // steps stay directly comparable in /admin/analytics.
  "analysis_progress_viewed",
  "result_viewed",
  "aha_viewed",
  "score_viewed",
  "locked_preview_viewed",
  // Variant B only: the new CTA that reveals the paywall on click, before
  // any pricing plan is chosen. Naturally 0 for variant A, which shows
  // the paywall directly -- that's expected, not a bug.
  "unlock_cta_clicked",
  "paywall_cta_clicked",
  "free_recommendation_viewed",
  // Fires the instant the Paywall component mounts -- before
  // useInViewOnce's IntersectionObserver gets a chance to fire
  // paywall_viewed. Added to isolate a measured ~33% gap between
  // unlock_cta_clicked (variant B) and paywall_viewed: comparing this
  // against both tells apart "never rendered" from "rendered but never
  // scrolled into view."
  "paywall_mounted",
  // Paywall presentation experiment (lib/paywallExperiment.ts), variant
  // "v2" only: the summary built from the analysis' own results came into
  // view. paywall_variant is attached to every event by track() below.
  "paywall_preview_viewed",
  // Onboarding "objectif" question (funnel optimization mission, variant B
  // only -- see StepGoal.tsx). onboarding_completed fires once the user
  // continues past it (a choice is required, see StepGoal), right before
  // the real analysis request fires.
  "onboarding_goal_viewed",
  "onboarding_goal_selected",
  "onboarding_completed",
  // Analysis loader experiment (lib/loaderExperiment.ts). loader_variant is
  // attached to every event by track() below.
  //  - analysis_loader_viewed: the waiting screen was shown for an attempt
  //    (both variants: the denominator of the abandonment rate).
  //  - analysis_visual_started / analysis_visual_completed: immersive only,
  //    the first real listing element was shown / the visual sequence ended.
  //    Never the end of the AI processing (that is analysis_completed).
  //  - analysis_loader_abandoned: the page was left while the analysis was
  //    still running. TENTATIVE by definition: the dashboard only counts it
  //    as an abandonment when the same attempt never completed or failed
  //    afterwards (closing a tab is not proof the visitor gave up).
  "analysis_loader_viewed",
  "analysis_visual_started",
  "analysis_visual_completed",
  "analysis_loader_abandoned",
  // Pricing v2 (lib/plans.ts): Conciergerie offer, email verification before
  // using a subscription / lifetime right, and a report unlocked with one
  // Conciergerie analysis. pricing_version is attached to every event.
  "conciergerie_offer_clicked",
  "conciergerie_checkout_started",
  "access_code_requested",
  "access_verified",
  "subscription_credit_used",
  // Add-on "Pack 10 analyses supplémentaires" (one-time, Conciergerie only).
  // source: "subscription_checkout" (order bump on the Conciergerie
  // checkout) or "account" (bought later from the report page).
  // addon_purchase_completed / _failed, addon_refunded, addon_disputed and
  // addon_dispute_closed are written server side by the Stripe webhook.
  "addon_offered",
  "addon_selected",
  "addon_removed",
  "addon_checkout_started",
  "addon_purchase_completed",
  "addon_purchase_failed",
  "addon_refunded",
  "addon_disputed",
  "addon_dispute_closed",
  // Onboarding experiment (lib/onboardingExperiment.ts). onboarding_variant
  // is attached to every event by track() below. Never any listing text,
  // email or answer content beyond the enum values below.
  //  - listing_import_submitted: "Continuer" on the import step (both
  //    variants; abandonment right after import was invisible before).
  //  - email_step_viewed: the email step was shown (both variants), with
  //    listing_preview = what the background variant showed of the listing.
  //  - onboarding_question_viewed: background only, a question shown while
  //    the analysis runs (question, analysis_state: running|ready|failed).
  //  - analysis_ready: background only, the result arrived (onboarding_done
  //    says whether the questions were already finished).
  //  - analysis_ready_cta_clicked: background only, "Voir mon diagnostic".
  //  - goal_saved: the goal was attached to the stored analysis (timing:
  //    before_ready | after_ready | result_page; ok: whether the save worked).
  "listing_import_submitted",
  "email_step_viewed",
  "onboarding_question_viewed",
  "analysis_ready",
  "analysis_ready_cta_clicked",
  "goal_saved",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

type Props = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    posthog?: { capture: (event: string, props?: Props) => void };
    plausible?: (event: string, opts?: { props?: Props }) => void;
  }
}

/**
 * Centralized analytics entry point -- every component calls this, nothing
 * inserts into Supabase directly. Persists to analytics_events (via
 * POST /api/track, which uses the service-role key server-side) and keeps
 * forwarding to PostHog/Plausible if those are ever wired in.
 *
 * Never throws, never awaited by callers, never blocks the product: a
 * failed analytics call is silently dropped.
 */
export function track(event: AnalyticsEvent, props?: Props) {
  if (typeof window === "undefined") return;

  // Attached to every event automatically (rather than requiring each of
  // the ~30 call sites to pass it) so the A/B dashboard can never miss it
  // on a new event by omission. Old events predating this simply have no
  // ab_variant key, which admin/analytics's A/B section already accounts
  // for (it only counts events that carry one).
  // paywall_variant: same reasoning, for the paywall presentation
  // experiment (lib/paywallExperiment.ts).
  // loader_variant: same again, for the analysis loader experiment
  // (lib/loaderExperiment.ts).
  const enrichedProps: Props = {
    ...props,
    ab_variant: getAbVariant(),
    paywall_variant: getPaywallVariant(),
    loader_variant: getLoaderVariant(),
    onboarding_variant: getOnboardingVariant(),
    // Prices changed on this version: experiments and conversion rates are
    // compared within one pricing version only.
    pricing_version: PRICING_VERSION,
  };

  try {
    window.posthog?.capture(event, enrichedProps);
    window.plausible?.(event, enrichedProps ? { props: enrichedProps } : undefined);
    if (process.env.NODE_ENV !== "production") {
      console.debug("[analytics]", event, enrichedProps ?? {});
    }
  } catch {
    // analytics must never break the product experience
  }

  try {
    captureAttribution();
    const analysisId = enrichedProps?.analysisId != null ? String(enrichedProps.analysisId) : null;
    const email = enrichedProps?.email != null ? String(enrichedProps.email) : null;

    const payload = {
      event_name: event,
      anonymous_id: getAnonymousId(),
      session_id: getSessionId(),
      analysis_id: analysisId,
      email,
      pathname: window.location.pathname,
      referrer: document.referrer || null,
      first_touch: getFirstTouch(),
      last_touch: getLastTouch(),
      metadata: enrichedProps ?? null,
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/track", blob);
    } else {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // analytics must never break the product experience
  }
}
