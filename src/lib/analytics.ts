export type AnalyticsEvent =
  | "landing_view"
  | "test_clicked"
  | "upload_started"
  | "upload_completed"
  | "email_submitted"
  | "analysis_started"
  | "analysis_completed"
  | "aha_moment_viewed"
  | "main_problem_viewed"
  | "paywall_viewed"
  | "checkout_clicked"
  | "purchase_completed"
  | "full_analysis_viewed"
  | "rescan_started"
  | "rescan_completed"
  | "before_after_viewed"
  | "compare_view"
  | "compare_started"
  | "compare_completed"
  | "share_clicked";

type Props = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    posthog?: { capture: (event: string, props?: Props) => void };
    plausible?: (event: string, opts?: { props?: Props }) => void;
  }
}

/**
 * Centralized analytics entry point. Swap in PostHog or Plausible by
 * dropping their script tag in layout.tsx -- no call sites need to change.
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
}
