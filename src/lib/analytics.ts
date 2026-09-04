import { captureAttribution, getAnonymousId, getFirstTouch, getLastTouch, getSessionId } from "@/lib/tracking/identity";

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
  "email_submitted",
  "analysis_started",
  "analysis_completed",
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

  try {
    window.posthog?.capture(event, props);
    window.plausible?.(event, props ? { props } : undefined);
    if (process.env.NODE_ENV !== "production") {
      console.debug("[analytics]", event, props ?? {});
    }
  } catch {
    // analytics must never break the product experience
  }

  try {
    captureAttribution();
    const analysisId = props?.analysisId != null ? String(props.analysisId) : null;
    const email = props?.email != null ? String(props.email) : null;

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
      metadata: props ?? null,
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
