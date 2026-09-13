import { captureAttribution, getAnonymousId, getFirstTouch, getLastTouch, getSessionId } from "@/lib/tracking/identity";
import { getAbVariant } from "@/lib/ab";

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
  // /admin/analytics now uses listing_submitted instead.
  "listing_submitted",
  "airbnb_url_started",
  "airbnb_url_submitted",
  "airbnb_url_extraction_success",
  "screenshot_upload_started",
  "screenshot_upload_completed",
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
  const enrichedProps: Props = { ...props, ab_variant: getAbVariant() };

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
