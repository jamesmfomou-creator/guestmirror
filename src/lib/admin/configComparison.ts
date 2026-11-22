// "Configuration figée" section of /admin/analytics: the week the experiments
// are fixed to one combination (lib/experimentFreeze.ts) against the 7 days
// before it. Only existing events are used; historical events keep the
// variants they were recorded with -- nothing is re-attributed.
//
// Caveat shown in the UI: the landing hero changed on 22 Nov 2026 and the
// experiment split on 23 Nov, so a difference between the two windows is an
// observation, not the effect of either change alone.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/env";
import { EXPERIMENT_FREEZE } from "@/lib/experimentFreeze";
import { isPaymentEvent, paymentEventRevenueEur } from "@/lib/admin/analytics";

export interface CmpEvent {
  id?: string;
  event_name: string;
  anonymous_id: string | null;
  analysis_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** n / d, with both kept so the UI can show the denominator. */
export interface Ratio {
  num: number;
  den: number;
  rate: number | null;
}

export interface WindowStats {
  from: string;
  to: string;
  /** 1. distinct visitors who saw the landing page (landing_view) */
  eligible: number;
  /** 2. distinct visitors who clicked the hero's main CTA (cta_test_clicked, cta_location=hero) */
  heroClicks: number;
  /** 3. heroClicks / eligible */
  heroCtr: Ratio;
  /** 4. distinct visitors who started typing / pasting an Airbnb link (airbnb_url_started) */
  urlStarted: number;
  /** 5. analyses actually launched (analysis_started, one per attempt) */
  analysesStarted: number;
  /** 6. hero CTA clickers who then launched an analysis / hero CTA clickers */
  heroToAnalysis: Ratio;
  /** 7. analyses completed (analysis_completed, one per analysis) */
  analysesCompleted: number;
  /** 8. distinct visitors who saw the paywall (paywall_viewed) */
  paywallViewers: number;
  /** paywall viewers / visitors with a completed analysis */
  paywallRate: Ratio;
  /** 9. distinct visitors who clicked a payment button on the paywall (paywall_cta_clicked) */
  paymentClicks: number;
  /** 10. confirmed Stripe payments (webhook events, one per Stripe session / subscription) */
  sales: number;
  /** 11. confirmed payments / paywall viewers */
  paywallToSale: Ratio;
  /** 12. revenue of the confirmed payments (EUR) */
  revenue: number;
  /** share of client events carrying the fixed-configuration tag (data quality) */
  taggedShare: Ratio;
}

const EVENTS = [
  "landing_view",
  "cta_test_clicked",
  "airbnb_url_started",
  "analysis_started",
  "analysis_completed",
  "paywall_viewed",
  "paywall_cta_clicked",
  "payment_completed",
  "subscription_started",
];

const meta = (e: CmpEvent, k: string) => {
  const v = e.metadata?.[k];
  return typeof v === "string" && v ? v : null;
};

function ratio(num: number, den: number): Ratio {
  return { num, den, rate: den > 0 ? num / den : null };
}

/** Pure computation on events already limited to [from, to). */
export function computeWindow(events: CmpEvent[], from: string, to: string): WindowStats {
  const sets = {
    eligible: new Set<string>(),
    heroClick: new Set<string>(),
    urlStarted: new Set<string>(),
    analysisVisitor: new Set<string>(),
    analysisAttempt: new Set<string>(),
    completedAnalysis: new Set<string>(),
    completedVisitor: new Set<string>(),
    paywall: new Set<string>(),
    paymentClick: new Set<string>(),
    sale: new Set<string>(),
  };
  let revenue = 0;
  let clientEvents = 0;
  let tagged = 0;

  for (const e of events) {
    const v = e.anonymous_id;
    if (isPaymentEvent(e.event_name)) {
      const key =
        meta(e, "stripe_subscription_id") ?? meta(e, "stripe_session_id") ?? meta(e, "stripe_payment_intent_id") ?? `row:${e.id ?? e.created_at}`;
      if (sets.sale.has(key)) continue; // duplicated webhook row: counted once
      sets.sale.add(key);
      revenue += paymentEventRevenueEur(e as unknown as Parameters<typeof paymentEventRevenueEur>[0]);
      continue;
    }
    clientEvents += 1;
    if (meta(e, "experiment_config") === EXPERIMENT_FREEZE.id) tagged += 1;
    if (!v) continue;
    switch (e.event_name) {
      case "landing_view":
        sets.eligible.add(v);
        break;
      case "cta_test_clicked":
        if (meta(e, "cta_location") === "hero") sets.heroClick.add(v);
        break;
      case "airbnb_url_started":
        sets.urlStarted.add(v);
        break;
      case "analysis_started":
        sets.analysisVisitor.add(v);
        sets.analysisAttempt.add(meta(e, "attemptId") ?? `row:${e.id ?? e.created_at}`);
        break;
      case "analysis_completed":
        sets.completedAnalysis.add(e.analysis_id ?? meta(e, "analysisId") ?? `row:${e.id ?? e.created_at}`);
        sets.completedVisitor.add(v);
        break;
      case "paywall_viewed":
        sets.paywall.add(v);
        break;
      case "paywall_cta_clicked":
        sets.paymentClick.add(v);
        break;
    }
  }

  const heroThenAnalysis = [...sets.heroClick].filter((v) => sets.analysisVisitor.has(v)).length;
  return {
    from,
    to,
    eligible: sets.eligible.size,
    heroClicks: sets.heroClick.size,
    heroCtr: ratio(sets.heroClick.size, sets.eligible.size),
    urlStarted: sets.urlStarted.size,
    analysesStarted: sets.analysisAttempt.size,
    heroToAnalysis: ratio(heroThenAnalysis, sets.heroClick.size),
    analysesCompleted: sets.completedAnalysis.size,
    paywallViewers: sets.paywall.size,
    paywallRate: ratio([...sets.paywall].filter((v) => sets.completedVisitor.has(v)).length, sets.completedVisitor.size),
    paymentClicks: sets.paymentClick.size,
    sales: sets.sale.size,
    paywallToSale: ratio(sets.sale.size, sets.paywall.size),
    revenue: Math.round(revenue * 100) / 100,
    taggedShare: ratio(tagged, clientEvents),
  };
}

export interface ConfigComparison {
  configured: boolean;
  active: boolean;
  configId: string;
  combination: { ab: string; paywall: string; loader: string; onboarding: string };
  /** false while the fixed week has not started yet */
  started: boolean;
  current: WindowStats;
  previous: WindowStats;
}

const DAY = 24 * 3600 * 1000;

export function comparisonWindows(now: number = Date.now()) {
  const start = Date.parse(EXPERIMENT_FREEZE.startsAt);
  const end = Math.min(now, start + 7 * DAY);
  return {
    started: now >= start,
    current: { from: new Date(start).toISOString(), to: new Date(Math.max(end, start)).toISOString() },
    previous: { from: new Date(start - 7 * DAY).toISOString(), to: new Date(start).toISOString() },
  };
}

export async function getConfigComparison(now: number = Date.now()): Promise<ConfigComparison> {
  const w = comparisonWindows(now);
  const base = {
    active: EXPERIMENT_FREEZE.active,
    configId: EXPERIMENT_FREEZE.id,
    combination: {
      ab: EXPERIMENT_FREEZE.ab,
      paywall: EXPERIMENT_FREEZE.paywall,
      loader: EXPERIMENT_FREEZE.loader,
      onboarding: EXPERIMENT_FREEZE.onboarding,
    },
    started: w.started,
  };
  if (!SUPABASE_CONFIGURED) {
    return { configured: false, ...base, current: computeWindow([], w.current.from, w.current.to), previous: computeWindow([], w.previous.from, w.previous.to) };
  }
  const supabase = getSupabaseAdmin()!;
  const rows: CmpEvent[] = [];
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("id, event_name, anonymous_id, analysis_id, metadata, created_at")
      .in("event_name", EVENTS)
      .gte("created_at", w.previous.from)
      .lt("created_at", w.current.to)
      .order("created_at", { ascending: true })
      .range(offset, offset + 999);
    if (error || !data) break;
    rows.push(...(data as CmpEvent[]));
    if (data.length < 1000) break;
  }
  const inWindow = (from: string, to: string) => {
    const a = Date.parse(from), b = Date.parse(to);
    return rows.filter((r) => {
      const t = Date.parse(r.created_at);
      return t >= a && t < b;
    });
  };
  return {
    configured: true,
    ...base,
    current: computeWindow(w.started ? inWindow(w.current.from, w.current.to) : [], w.current.from, w.current.to),
    previous: computeWindow(inWindow(w.previous.from, w.previous.to), w.previous.from, w.previous.to),
  };
}
