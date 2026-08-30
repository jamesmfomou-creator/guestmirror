import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_CONFIGURED } from "@/lib/env";

export type Period = "today" | "7d" | "30d";

export const FUNNEL_STEPS: { key: string; label: string }[] = [
  { key: "landing_view", label: "Landing views" },
  { key: "cta_test_clicked", label: "CTA clicks" },
  { key: "upload_started", label: "Upload démarré" },
  { key: "upload_completed", label: "Uploads complétés" },
  { key: "email_submitted", label: "Emails soumis" },
  { key: "analysis_started", label: "Analyses démarrées" },
  { key: "analysis_completed", label: "Analyses complétées" },
  { key: "free_result_viewed", label: "Résultats vus" },
  { key: "paywall_viewed", label: "Paywalls vus" },
  { key: "unlock_clicked", label: "Unlock clicks" },
  { key: "checkout_started", label: "Checkouts démarrés" },
  { key: "payment_completed", label: "Paiements complétés" },
];

interface EventRow {
  event_name: string;
  anonymous_id: string | null;
  session_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AnalysisRow {
  id: string;
  email: string | null;
  created_at: string;
}

interface PaymentRow {
  amount: number | null;
  status: string;
  created_at: string;
}

export interface FunnelStepResult {
  key: string;
  label: string;
  count: number;
  rateFromPrevious: number | null;
}

export interface SourceRow {
  source: string;
  views: number;
  analyses: number;
  paywalls: number;
  payments: number;
  revenue: number;
}

export interface CampaignRow {
  campaign: string;
  views: number;
  analyses: number;
  paywalls: number;
  payments: number;
  revenue: number;
}

export interface AnalyticsDashboard {
  configured: boolean;
  period: Period;
  since: string;
  uniqueVisitors: number;
  funnel: FunnelStepResult[];
  globalConversionRate: number | null;
  revenue: number;
  bySource: SourceRow[];
  byCampaign: CampaignRow[];
  repeatUsage: {
    uniqueAnalysisUsers: number;
    totalAnalyses: number;
    avgAnalysesPerUser: number;
    usersWith2Plus: number;
    usersWith3Plus: number;
  };
}

function periodSince(period: Period): Date {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function distinctVisitor(row: EventRow): string {
  return row.anonymous_id || row.session_id || "unknown";
}

function metadataString(meta: Record<string, unknown> | null, path: string[]): string | null {
  let cur: unknown = meta;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" && cur ? cur : null;
}

function metadataNumber(meta: Record<string, unknown> | null, key: string): number {
  const v = meta?.[key];
  return typeof v === "number" ? v : 0;
}

export async function getAnalyticsDashboard(period: Period): Promise<AnalyticsDashboard> {
  const empty: AnalyticsDashboard = {
    configured: false,
    period,
    since: periodSince(period).toISOString(),
    uniqueVisitors: 0,
    funnel: FUNNEL_STEPS.map((s) => ({ ...s, count: 0, rateFromPrevious: null })),
    globalConversionRate: null,
    revenue: 0,
    bySource: [],
    byCampaign: [],
    repeatUsage: {
      uniqueAnalysisUsers: 0,
      totalAnalyses: 0,
      avgAnalysesPerUser: 0,
      usersWith2Plus: 0,
      usersWith3Plus: 0,
    },
  };

  if (!SUPABASE_CONFIGURED) return empty;
  const supabase = getSupabaseAdmin()!;
  const since = periodSince(period);

  const [{ data: events }, { data: analyses }] = await Promise.all([
    supabase
      .from("analytics_events")
      .select("event_name, anonymous_id, session_id, source, metadata, created_at")
      .gte("created_at", since.toISOString())
      .limit(50000),
    supabase.from("analyses").select("id, email, created_at").limit(50000),
  ]);

  const rows = (events as EventRow[] | null) ?? [];
  const allAnalyses = (analyses as AnalysisRow[] | null) ?? [];

  // ---- Funnel: distinct visitors per step, in order ----
  const visitorsByStep = new Map<string, Set<string>>();
  for (const step of FUNNEL_STEPS) visitorsByStep.set(step.key, new Set());
  const allVisitors = new Set<string>();

  for (const row of rows) {
    const visitor = distinctVisitor(row);
    allVisitors.add(visitor);
    const set = visitorsByStep.get(row.event_name);
    if (set) set.add(visitor);
  }

  const funnel: FunnelStepResult[] = FUNNEL_STEPS.map((step, i) => {
    const count = visitorsByStep.get(step.key)?.size ?? 0;
    const prevCount = i > 0 ? (visitorsByStep.get(FUNNEL_STEPS[i - 1].key)?.size ?? 0) : null;
    const rateFromPrevious = prevCount && prevCount > 0 ? count / prevCount : i === 0 ? null : 0;
    return { key: step.key, label: step.label, count, rateFromPrevious };
  });

  const landingCount = funnel[0]?.count ?? 0;
  const paymentCount = funnel[funnel.length - 1]?.count ?? 0;
  const globalConversionRate = landingCount > 0 ? paymentCount / landingCount : null;

  // ---- Revenue (from payment_completed events, amount is in cents) ----
  const paymentRows = rows.filter((r) => r.event_name === "payment_completed");
  const revenue = paymentRows.reduce((sum, r) => sum + metadataNumber(r.metadata, "amount") / 100, 0);

  // ---- By source ----
  const sourceMap = new Map<string, SourceRow>();
  function sourceBucket(source: string | null): SourceRow {
    const key = source || "direct";
    if (!sourceMap.has(key)) {
      sourceMap.set(key, { source: key, views: 0, analyses: 0, paywalls: 0, payments: 0, revenue: 0 });
    }
    return sourceMap.get(key)!;
  }
  const seenBySource: Record<string, Set<string>> = {};
  for (const row of rows) {
    const key = row.source || "direct";
    seenBySource[key] ??= new Set();
    const bucket = sourceBucket(row.source);
    const visitor = distinctVisitor(row);
    if (row.event_name === "landing_view" && !seenBySource[key].has(`v:${visitor}`)) {
      seenBySource[key].add(`v:${visitor}`);
      bucket.views += 1;
    }
    if (row.event_name === "analysis_completed" && !seenBySource[key].has(`a:${visitor}`)) {
      seenBySource[key].add(`a:${visitor}`);
      bucket.analyses += 1;
    }
    if (row.event_name === "paywall_viewed" && !seenBySource[key].has(`p:${visitor}`)) {
      seenBySource[key].add(`p:${visitor}`);
      bucket.paywalls += 1;
    }
    if (row.event_name === "payment_completed") {
      bucket.payments += 1;
      bucket.revenue += metadataNumber(row.metadata, "amount") / 100;
    }
  }
  const bySource = Array.from(sourceMap.values()).sort((a, b) => b.revenue - a.revenue || b.views - a.views);

  // ---- By campaign (from last_touch.campaign) ----
  const campaignMap = new Map<string, CampaignRow>();
  const seenByCampaign: Record<string, Set<string>> = {};
  for (const row of rows) {
    const campaign = metadataString(row.metadata, ["last_touch", "campaign"]) || "sans campagne";
    seenByCampaign[campaign] ??= new Set();
    if (!campaignMap.has(campaign)) {
      campaignMap.set(campaign, { campaign, views: 0, analyses: 0, paywalls: 0, payments: 0, revenue: 0 });
    }
    const bucket = campaignMap.get(campaign)!;
    const visitor = distinctVisitor(row);
    if (row.event_name === "landing_view" && !seenByCampaign[campaign].has(`v:${visitor}`)) {
      seenByCampaign[campaign].add(`v:${visitor}`);
      bucket.views += 1;
    }
    if (row.event_name === "analysis_completed" && !seenByCampaign[campaign].has(`a:${visitor}`)) {
      seenByCampaign[campaign].add(`a:${visitor}`);
      bucket.analyses += 1;
    }
    if (row.event_name === "paywall_viewed" && !seenByCampaign[campaign].has(`p:${visitor}`)) {
      seenByCampaign[campaign].add(`p:${visitor}`);
      bucket.paywalls += 1;
    }
    if (row.event_name === "payment_completed") {
      bucket.payments += 1;
      bucket.revenue += metadataNumber(row.metadata, "amount") / 100;
    }
  }
  const byCampaign = Array.from(campaignMap.values())
    .filter((c) => c.views > 0 || c.payments > 0)
    .sort((a, b) => b.revenue - a.revenue || b.views - a.views);

  // ---- Repeat usage (all-time, from the analyses table itself) ----
  const perEmail = new Map<string, number>();
  for (const a of allAnalyses) {
    const key = a.email || `anon:${a.id}`;
    perEmail.set(key, (perEmail.get(key) ?? 0) + 1);
  }
  const counts = Array.from(perEmail.values());
  const uniqueAnalysisUsers = counts.length;
  const totalAnalyses = allAnalyses.length;

  return {
    configured: true,
    period,
    since: since.toISOString(),
    uniqueVisitors: allVisitors.size,
    funnel,
    globalConversionRate,
    revenue,
    bySource,
    byCampaign,
    repeatUsage: {
      uniqueAnalysisUsers,
      totalAnalyses,
      avgAnalysesPerUser: uniqueAnalysisUsers > 0 ? totalAnalyses / uniqueAnalysisUsers : 0,
      usersWith2Plus: counts.filter((c) => c >= 2).length,
      usersWith3Plus: counts.filter((c) => c >= 3).length,
    },
  };
}
