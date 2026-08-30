import Link from "next/link";
import { getAnalyticsDashboard, Period } from "@/lib/admin/analytics";
import { BRAND_NAME } from "@/lib/brand";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Aujourd'hui",
  "7d": "7 jours",
  "30d": "30 jours",
};

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n * 100)}%`;
}

function eur(n: number): string {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period: Period = sp.period === "today" || sp.period === "30d" ? sp.period : "7d";
  const data = await getAnalyticsDashboard(period);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{BRAND_NAME} — Analytics</h1>
      <p className="mt-1 text-sm text-muted">
        Funnel landing → paiement. Dernière mise à jour : {new Date().toLocaleString("fr-FR")}
      </p>

      {!data.configured && (
        <p className="mt-6 rounded-xl bg-score-low/10 px-4 py-3 text-sm text-score-low">
          Supabase n&apos;est pas configuré : aucune donnée à afficher.
        </p>
      )}

      <div className="mt-6 flex gap-2">
        {(["today", "7d", "30d"] as Period[]).map((p) => (
          <Link
            key={p}
            href={`/admin/analytics?period=${p}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
              p === period
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted hover:bg-background-alt"
            }`}
          >
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>

      {/* KPI summary */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Visiteurs uniques" value={data.uniqueVisitors} />
        <Kpi label="Paiements complétés" value={data.funnel[data.funnel.length - 1]?.count ?? 0} />
        <Kpi label="Revenue" value={eur(data.revenue)} />
        <Kpi label="Conversion landing → paiement" value={pct(data.globalConversionRate)} />
      </div>

      {/* Funnel table */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Funnel</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Étape</th>
                <th className="px-4 py-2.5 font-medium">Visiteurs uniques</th>
                <th className="px-4 py-2.5 font-medium">Taux vs. étape précédente</th>
              </tr>
            </thead>
            <tbody>
              {data.funnel.map((step) => (
                <tr key={step.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">{step.label}</td>
                  <td className="px-4 py-2.5 font-medium tabular-nums">{step.count}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted">{pct(step.rateFromPrevious)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* By source */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Par source</h2>
        {data.bySource.length === 0 ? (
          <p className="mt-3 text-sm text-muted-2">Aucune donnée sur cette période.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Views</th>
                  <th className="px-4 py-2.5 font-medium">Analyses</th>
                  <th className="px-4 py-2.5 font-medium">Paywalls</th>
                  <th className="px-4 py-2.5 font-medium">Paiements</th>
                  <th className="px-4 py-2.5 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.bySource.map((row) => (
                  <tr key={row.source} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium capitalize">{row.source}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.views}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.analyses}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.paywalls}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.payments}</td>
                    <td className="px-4 py-2.5 tabular-nums">{eur(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* By campaign */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Par campagne</h2>
        {data.byCampaign.length === 0 ? (
          <p className="mt-3 text-sm text-muted-2">Aucune donnée sur cette période.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                  <th className="px-4 py-2.5 font-medium">Campagne</th>
                  <th className="px-4 py-2.5 font-medium">Views</th>
                  <th className="px-4 py-2.5 font-medium">Analyses</th>
                  <th className="px-4 py-2.5 font-medium">Paywalls</th>
                  <th className="px-4 py-2.5 font-medium">Paiements</th>
                  <th className="px-4 py-2.5 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.byCampaign.map((row) => (
                  <tr key={row.campaign} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{row.campaign}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.views}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.analyses}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.paywalls}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.payments}</td>
                    <td className="px-4 py-2.5 tabular-nums">{eur(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Repeat usage (all-time) */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Analyses uniques (depuis le début)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kpi label="Utilisateurs uniques" value={data.repeatUsage.uniqueAnalysisUsers} />
          <Kpi label="Analyses totales" value={data.repeatUsage.totalAnalyses} />
          <Kpi label="Moyenne / utilisateur" value={data.repeatUsage.avgAnalysesPerUser.toFixed(1)} />
          <Kpi label="Utilisateurs 2+ analyses" value={data.repeatUsage.usersWith2Plus} />
          <Kpi label="Utilisateurs 3+ analyses" value={data.repeatUsage.usersWith3Plus} />
        </div>
      </section>

      {/* User list (all-time) */}
      <section className="mt-10 mb-10">
        <h2 className="text-lg font-semibold">Utilisateurs (depuis le début)</h2>
        <p className="mt-1 text-sm text-muted-2">
          Classés par nombre d&apos;analyses, du plus actif au moins actif.
        </p>
        {data.users.length === 0 ? (
          <p className="mt-3 text-sm text-muted-2">Aucun utilisateur pour l&apos;instant.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Analyses</th>
                  <th className="px-4 py-2.5 font-medium">Dernier score</th>
                  <th className="px-4 py-2.5 font-medium">Première visite</th>
                  <th className="px-4 py-2.5 font-medium">Dernière visite</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u, i) => (
                  <tr key={u.email} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-muted-2">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{u.email}</td>
                    <td className="px-4 py-2.5 tabular-nums">{u.analysisCount}</td>
                    <td className="px-4 py-2.5 tabular-nums">{u.lastScore}/100</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted">
                      {new Date(u.firstSeen).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted">
                      {new Date(u.lastSeen).toLocaleDateString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-2">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}
