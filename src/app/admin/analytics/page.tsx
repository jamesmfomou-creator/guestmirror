import Link from "next/link";
import {
  getAnalyticsDashboard,
  Period,
  MethodStats,
  StepTimingStats,
  NumberStats,
  ProfileSegmentStats,
  ErrorBreakdownRow,
} from "@/lib/admin/analytics";
import { listFeedback } from "@/lib/feedback";
import { BRAND_NAME } from "@/lib/brand";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Aujourd'hui",
  "7d": "7 jours",
  "30d": "30 jours",
};

const USER_TYPE_LABELS: Record<string, string> = {
  host: "Hôte",
  concierge: "Conciergerie",
  cohost: "Co-hôte",
  other: "Autre",
};

const PLAN_LABELS: Record<string, string> = {
  one_time: "Analyse unique",
  plus: "Plus",
  lifetime: "Lifetime",
};

// See categorizeAnthropicError in lib/ai.ts and the codes set in
// api/analyze/route.ts / AnalyzeWizard.tsx for where each code originates.
const ERROR_CODE_LABELS: Record<string, string> = {
  ai_timeout: "IA — délai dépassé",
  ai_rate_limited: "IA — limite de débit",
  ai_invalid_request: "IA — requête invalide",
  ai_auth_error: "IA — erreur d'authentification",
  ai_overloaded: "IA — surchargée",
  ai_connection_error: "IA — erreur de connexion",
  ai_invalid_response: "IA — réponse invalide",
  ai_error: "IA — erreur générique",
  api_error: "Erreur générique (avant catégorisation détaillée)",
  insufficient_input: "Pas assez d'informations fournies",
  image_processing_failed: "Traitement des images échoué",
  image_too_large: "Image trop volumineuse",
  database_failed: "Écriture base de données échouée",
  airbnb_url_extraction_failed: "Extraction du lien Airbnb échouée",
  response_parse_failed: "Réponse serveur illisible",
  timeout: "Délai dépassé (client)",
  unknown: "Inconnu",
};

function pct(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n * 100)}%`;
}

function eur(n: number): string {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function seconds(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(1)}s`;
}

function money(n: number | null): string {
  if (n === null) return "—";
  return eur(n);
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period: Period = sp.period === "today" || sp.period === "30d" ? sp.period : "7d";
  const data = await getAnalyticsDashboard(period);
  // Not period-scoped (all-time) -- feedback volume is low enough that a
  // rolling funnel window isn't useful here, unlike the rest of this page.
  const feedback = await listFeedback();
  const feedbackPositive = feedback.filter((f) => f.feedbackRating === "positive").length;
  const feedbackNegative = feedback.filter((f) => f.feedbackRating === "negative").length;
  const feedbackRated = feedbackPositive + feedbackNegative;

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
        <h2 className="text-lg font-semibold">Funnel — utilisateurs uniques</h2>
        <p className="mt-1 text-sm text-muted-2">
          <strong>Définition :</strong> chaque étape compte des <strong>visiteurs uniques</strong>{" "}
          (anonymous_id / session_id), un par personne quel que soit le nombre de fois où elle
          déclenche l&apos;événement. À comparer avec le bloc <strong>« Performance des analyses
          »</strong> ci-dessous, qui compte des tentatives techniques (une même personne peut
          générer plusieurs tentatives si elle relance ou réessaie une analyse) — c&apos;est
          pourquoi les deux blocs affichent des totaux différents pour une période identique.
        </p>
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

      {/* Analysis loading performance */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Performance des analyses — tentatives techniques</h2>
        <p className="mt-1 text-sm text-muted-2">
          <strong>Définition :</strong> chaque nombre ci-dessous compte des{" "}
          <strong>tentatives d&apos;analyse</strong> (attemptId, un identifiant généré à chaque
          clic sur « Analyser »), pas des visiteurs uniques — une même personne qui relance ou
          réessaie une analyse génère plusieurs tentatives. C&apos;est pourquoi « Analyses
          démarrées » ici ne correspond pas à « Analyses démarrées » dans le Funnel ci-dessus.
          Basé sur les événements disponibles depuis la mise en place de ce tracking — les
          événements antérieurs n&apos;y figurent pas.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Tentatives démarrées" value={data.analysisPerformance.attemptsStarted} />
          <Kpi label="Tentatives complétées" value={data.analysisPerformance.attemptsCompleted} />
          <Kpi label="Taux de complétion" value={pct(data.analysisPerformance.completionRate)} />
          <Kpi label="Échecs" value={data.analysisPerformance.attemptsFailed} />
          <Kpi label="Durée moyenne (succès)" value={seconds(data.analysisPerformance.avgDurationS)} />
          <Kpi label="Durée médiane (succès)" value={seconds(data.analysisPerformance.medianDurationS)} />
          <Kpi label="p75 (succès)" value={seconds(data.analysisPerformance.p75DurationS)} />
          <Kpi label="p90 (succès)" value={seconds(data.analysisPerformance.p90DurationS)} />
          <Kpi label="Temps moyen avant 90%" value={seconds(data.analysisPerformance.avgTimeBefore90S)} />
          <Kpi label="Abandons" value={data.analysisPerformance.attemptsAbandoned} />
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-2">
          Temps de finalisation (90% cosmétique → résolution)
        </p>
        <p className="mt-1 text-sm text-muted-2">
          Le repère « 90% » est un timer client fixe (barre de progression), pas une vraie étape
          serveur — ce délai mesure donc le temps entre ce repère cosmétique et la résolution
          réelle (succès ou échec). La moyenne globale mélange succès et échecs ; comme les échecs
          sont bimodaux (certains instantanés, d&apos;autres proches du timeout IA de 110s), elle
          est structurellement plus haute que la durée moyenne des seuls succès ci-dessus — ce
          n&apos;est pas un bug de calcul.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="Moyenne — succès uniquement" value={seconds(data.analysisPerformance.avgFinalizingSuccessS)} />
          <Kpi label="Moyenne — échecs uniquement" value={seconds(data.analysisPerformance.avgFinalizingFailedS)} />
          <Kpi label="Moyenne — global (mélangé)" value={seconds(data.analysisPerformance.avgFinalizingS)} />
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-2">
          Répartition des abandons par dernière étape connue
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Kpi label="Avant la finalisation (< 90%)" value={data.analysisPerformance.abandonedBeforeFinalizing} />
          <Kpi label="Pendant la finalisation (90%+)" value={data.analysisPerformance.abandonedDuringFinalizing} />
        </div>
      </section>

      {/* Error breakdown: which causes actually produce the failures (see
          categorizeAnthropicError in lib/ai.ts and the codes set in
          api/analyze/route.ts / AnalyzeWizard.tsx). */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Répartition des erreurs</h2>
        <p className="mt-1 text-sm text-muted-2">
          Une ligne par code d&apos;erreur, dédupliquée par tentative (attemptId). Seules les
          tentatives ayant échoué depuis la mise en place de la catégorisation détaillée
          affichent un code spécifique — les échecs antérieurs apparaissent sous « Inconnu ».
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Cause</th>
                <th className="px-4 py-2.5 font-medium">Occurrences</th>
                <th className="px-4 py-2.5 font-medium">% des échecs</th>
              </tr>
            </thead>
            <tbody>
              {data.errorBreakdown.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-muted-2" colSpan={3}>
                    Aucun échec sur cette période.
                  </td>
                </tr>
              ) : (
                data.errorBreakdown.map((row) => (
                  <ErrorBreakdownTableRow
                    key={row.code}
                    row={row}
                    total={data.analysisPerformance.attemptsFailed}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Server-side step breakdown: where the total analysis time is
          actually spent, independent of the client-side 90%-cap progress
          bar above. Only analyses run since this instrumentation shipped
          carry these fields (see each row's "n" sample size). */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Répartition du temps par étape</h2>
        <p className="mt-1 text-sm text-muted-2">
          Mesuré côté serveur pour chaque analyse complétée. &quot;n&quot; = nombre d&apos;analyses
          couvertes par cette instrumentation dans la période sélectionnée.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Étape</th>
                <th className="px-4 py-2.5 font-medium">Moyenne</th>
                <th className="px-4 py-2.5 font-medium">Médiane</th>
                <th className="px-4 py-2.5 font-medium">p75</th>
                <th className="px-4 py-2.5 font-medium">p90</th>
                <th className="px-4 py-2.5 font-medium">n</th>
              </tr>
            </thead>
            <tbody>
              <StepTimingRow label="Extraction URL Airbnb" stats={data.stepTimings.urlExtraction} />
              <StepTimingRow label="Préparation des images" stats={data.stepTimings.imagePreprocessing} />
              <StepTimingRow label="Appel IA" stats={data.stepTimings.aiCall} />
              <StepTimingRow label="  dont parsing / validation" stats={data.stepTimings.parsing} />
              <StepTimingRow label="Stockage des images" stats={data.stepTimings.imageStorage} />
              <StepTimingRow label="Écriture base de données" stats={data.stepTimings.database} />
              <StepTimingRow label="Finalisation (stockage + DB)" stats={data.stepTimings.finalization} />
              <StepTimingRow label="Total serveur" stats={data.stepTimings.total} />
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-2">
          Volumétrie de l&apos;appel IA (tokens, par analyse complétée)
        </p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Mesure</th>
                <th className="px-4 py-2.5 font-medium">Moyenne</th>
                <th className="px-4 py-2.5 font-medium">Médiane</th>
                <th className="px-4 py-2.5 font-medium">p75</th>
                <th className="px-4 py-2.5 font-medium">p90</th>
                <th className="px-4 py-2.5 font-medium">n</th>
              </tr>
            </thead>
            <tbody>
              <NumberStatsRow label="Tokens en entrée" stats={data.stepTimings.aiInputTokens} />
              <NumberStatsRow label="Tokens en sortie" stats={data.stepTimings.aiOutputTokens} />
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-method breakdown: a screenshot submission never counts toward
          the Airbnb-URL bucket or vice versa -- each event carries its own
          input_method, see lib/admin/analytics.ts. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Méthode d&apos;import</h2>
        <p className="mt-1 text-sm text-muted-2">
          Lien Airbnb, capture d&apos;écran, ou les deux à la fois pour la même analyse.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Méthode</th>
                <th className="px-4 py-2.5 font-medium">Soumissions</th>
                <th className="px-4 py-2.5 font-medium">Analyses démarrées</th>
                <th className="px-4 py-2.5 font-medium">Analyses complétées</th>
                <th className="px-4 py-2.5 font-medium">Échecs</th>
                <th className="px-4 py-2.5 font-medium">Paiements</th>
              </tr>
            </thead>
            <tbody>
              <MethodRow label="Lien Airbnb" stats={data.methodBreakdown.airbnbUrl} />
              <MethodRow label="Capture d'écran" stats={data.methodBreakdown.screenshot} />
              <MethodRow label="Capture + lien" stats={data.methodBreakdown.mixed} />
            </tbody>
          </table>
        </div>
      </section>

      {/* Profil des utilisateurs: nombre de biens / type x conversion.
          See lib/admin/analytics.ts's userProfile -- built entirely from
          analytics_events metadata (StepProfile answers propagated
          through paywall_viewed / {plan}_offer_clicked / payment_completed). */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Profil des utilisateurs</h2>
        <p className="mt-1 text-sm text-muted-2">
          Basé sur la question posée après l&apos;import (facultative) — les analyses
          antérieures à sa mise en place n&apos;y figurent pas.
        </p>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-2">Par nombre de biens</p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Biens</th>
                <th className="px-4 py-2.5 font-medium">Analyses</th>
                <th className="px-4 py-2.5 font-medium">Paywalls vus</th>
                <th className="px-4 py-2.5 font-medium">Analyse unique</th>
                <th className="px-4 py-2.5 font-medium">Plus</th>
                <th className="px-4 py-2.5 font-medium">Lifetime</th>
                <th className="px-4 py-2.5 font-medium">Paiements</th>
                <th className="px-4 py-2.5 font-medium">Revenu</th>
              </tr>
            </thead>
            <tbody>
              <ProfileRow label="1 logement" stats={data.userProfile.byPropertyCount["1"]} />
              <ProfileRow label="2 à 5" stats={data.userProfile.byPropertyCount["2-5"]} />
              <ProfileRow label="6 à 20" stats={data.userProfile.byPropertyCount["6-20"]} />
              <ProfileRow label="21 et +" stats={data.userProfile.byPropertyCount["21+"]} />
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-xs font-medium uppercase tracking-wide text-muted-2">Par type</p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Analyses</th>
                <th className="px-4 py-2.5 font-medium">Paywalls vus</th>
                <th className="px-4 py-2.5 font-medium">Analyse unique</th>
                <th className="px-4 py-2.5 font-medium">Plus</th>
                <th className="px-4 py-2.5 font-medium">Lifetime</th>
                <th className="px-4 py-2.5 font-medium">Paiements</th>
                <th className="px-4 py-2.5 font-medium">Revenu</th>
              </tr>
            </thead>
            <tbody>
              <ProfileRow label="Hôte" stats={data.userProfile.byUserType.host} />
              <ProfileRow label="Conciergerie" stats={data.userProfile.byUserType.concierge} />
              <ProfileRow label="Co-hôte" stats={data.userProfile.byUserType.cohost} />
              <ProfileRow label="Autre" stats={data.userProfile.byUserType.other} />
            </tbody>
          </table>
        </div>
      </section>

      {/* A/B test: pre-paywall "Aha moment" */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">A/B Test — Aha moment</h2>
        <p className="mt-1 text-sm text-muted-2">
          Variante A = flow actuel, Variante B = loader &quot;Aha moment&quot; renforcé avant le
          paywall. Seuls les événements portant une variante sont comptés — le trafic antérieur à
          ce test n&apos;y figure pas.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Métrique</th>
                <th className="px-4 py-2.5 font-medium">Variante A</th>
                <th className="px-4 py-2.5 font-medium">Variante B</th>
              </tr>
            </thead>
            <tbody>
              <AbRow label="Utilisateurs" a={data.abTest.A.visitors} b={data.abTest.B.visitors} />
              <AbRow
                label="Analyses complétées"
                a={data.abTest.A.analysesCompleted}
                b={data.abTest.B.analysesCompleted}
              />
              <AbRow label="Résultats vus" a={data.abTest.A.resultsViewed} b={data.abTest.B.resultsViewed} />
              <AbRow
                label="Aha moments vus"
                a={data.abTest.A.ahaMomentsViewed}
                b={data.abTest.B.ahaMomentsViewed}
              />
              <AbRow
                label="CTA unlock (avant paywall)"
                a={data.abTest.A.unlockCtaClicks}
                b={data.abTest.B.unlockCtaClicks}
              />
              <AbRow label="Paywalls vus" a={data.abTest.A.paywallsViewed} b={data.abTest.B.paywallsViewed} />
              <AbRow label="Clics unlock (plan)" a={data.abTest.A.unlockClicks} b={data.abTest.B.unlockClicks} />
              <AbRow
                label="Checkouts démarrés"
                a={data.abTest.A.checkoutsStarted}
                b={data.abTest.B.checkoutsStarted}
              />
              <AbRow label="Paiements" a={data.abTest.A.paymentsCompleted} b={data.abTest.B.paymentsCompleted} />
              <AbRow label="Revenu" a={eur(data.abTest.A.revenue)} b={eur(data.abTest.B.revenue)} />
              <AbRow
                label="Résultat → Paywall"
                a={pct(data.abTest.A.resultToPaywallRate)}
                b={pct(data.abTest.B.resultToPaywallRate)}
              />
              <AbRow
                label="Paywall → Unlock"
                a={pct(data.abTest.A.paywallToUnlockRate)}
                b={pct(data.abTest.B.paywallToUnlockRate)}
              />
              <AbRow
                label="Unlock → Checkout"
                a={pct(data.abTest.A.unlockToCheckoutRate)}
                b={pct(data.abTest.B.unlockToCheckoutRate)}
              />
              <AbRow
                label="Checkout → Paiement"
                a={pct(data.abTest.A.checkoutToPaymentRate)}
                b={pct(data.abTest.B.checkoutToPaymentRate)}
              />
              <AbRow
                label="Résultat → Paiement"
                a={pct(data.abTest.A.resultToPaymentRate)}
                b={pct(data.abTest.B.resultToPaymentRate)}
              />
              <AbRow
                label="Revenue / visiteur"
                a={money(data.abTest.A.revenuePerVisitor)}
                b={money(data.abTest.B.revenuePerVisitor)}
              />
              <AbRow
                label="Revenue / analyse"
                a={money(data.abTest.A.revenuePerAnalysis)}
                b={money(data.abTest.B.revenuePerAnalysis)}
              />
              <AbRow
                label="Revenue / paywall"
                a={money(data.abTest.A.revenuePerPaywall)}
                b={money(data.abTest.B.revenuePerPaywall)}
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing: one-time vs Plus */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Pricing — Analyse unique vs Plus</h2>
        <p className="mt-1 text-sm text-muted-2">
          Abonnements actifs et MRR sont un instantané actuel (pas filtré par période). Le reste
          correspond à la période sélectionnée.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Abonnements Plus actifs" value={data.pricing.activePlusSubscriptions} />
          <Kpi label="MRR" value={eur(data.pricing.mrr)} />
          <Kpi label="Nouveaux abonnements" value={data.pricing.newSubscriptions} />
          <Kpi label="Annulations" value={data.pricing.cancellations} />
          <Kpi label="Paiements analyse unique" value={data.pricing.oneTimePayments} />
          <Kpi label="Revenue analyse unique" value={eur(data.pricing.oneTimeRevenue)} />
          <Kpi label="Revenue total" value={eur(data.pricing.revenueTotal)} />
          <Kpi label="Échecs de paiement abo." value={data.pricing.paymentFailures} />
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Étape</th>
                <th className="px-4 py-2.5 font-medium">Visiteurs uniques</th>
              </tr>
            </thead>
            <tbody>
              {data.pricing.funnel.map((step) => (
                <tr key={step.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">{step.label}</td>
                  <td className="px-4 py-2.5 font-medium tabular-nums">{step.count}</td>
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
      <section className="mt-10">
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

      {/* Feedback utilisateurs (all-time) -- see PostPurchaseFeedback +
          /api/feedback. Never auto-published: testimonial_permission is
          the explicit consent checkbox, shown here as its own column so
          it's easy to tell which testimonials are actually usable
          publicly (see TestimonialsSection, which only reads permission=true). */}
      <section className="mt-10 mb-10">
        <h2 className="text-lg font-semibold">Feedback utilisateurs</h2>
        <p className="mt-1 text-sm text-muted-2">
          Recueilli après achat (facultatif) — voir la case à cocher pour le consentement de
          témoignage.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Réponses" value={feedback.length} />
          <Kpi label="% positif" value={feedbackRated > 0 ? `${Math.round((feedbackPositive / feedbackRated) * 100)}%` : "—"} />
          <Kpi label="% négatif" value={feedbackRated > 0 ? `${Math.round((feedbackNegative / feedbackRated) * 100)}%` : "—"} />
          <Kpi label="Témoignages exploitables" value={feedback.filter((f) => f.testimonialPermission).length} />
        </div>
        {feedback.length === 0 ? (
          <p className="mt-4 text-sm text-muted-2">Aucun retour pour l&apos;instant.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Avis</th>
                  <th className="px-4 py-2.5 font-medium">Commentaire</th>
                  <th className="px-4 py-2.5 font-medium">Témoignage</th>
                  <th className="px-4 py-2.5 font-medium">Autorisé</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Biens</th>
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-2">
                      {new Date(f.createdAt).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-2.5">
                      {f.feedbackRating === "positive" ? "👍" : f.feedbackRating === "negative" ? "👎" : "—"}
                    </td>
                    <td className="max-w-[220px] px-4 py-2.5 text-muted">{f.feedbackText || "—"}</td>
                    <td className="max-w-[220px] px-4 py-2.5 text-muted">{f.testimonialText || "—"}</td>
                    <td className="px-4 py-2.5">{f.testimonialPermission ? "Oui" : "Non"}</td>
                    <td className="px-4 py-2.5 text-muted-2">{USER_TYPE_LABELS[f.userType ?? ""] ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-2">{f.propertyCountRange ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-2">{PLAN_LABELS[f.plan ?? ""] ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-2">{f.email ?? "—"}</td>
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

function AbRow({ label, a, b }: { label: string; a: string | number; b: string | number }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2.5">{label}</td>
      <td className="px-4 py-2.5 font-medium tabular-nums">{a}</td>
      <td className="px-4 py-2.5 font-medium tabular-nums">{b}</td>
    </tr>
  );
}

function StepTimingRow({ label, stats }: { label: string; stats: StepTimingStats }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2.5 font-medium">{label}</td>
      <td className="px-4 py-2.5 tabular-nums">{seconds(stats.avgS)}</td>
      <td className="px-4 py-2.5 tabular-nums">{seconds(stats.medianS)}</td>
      <td className="px-4 py-2.5 tabular-nums">{seconds(stats.p75S)}</td>
      <td className="px-4 py-2.5 tabular-nums">{seconds(stats.p90S)}</td>
      <td className="px-4 py-2.5 tabular-nums text-muted-2">{stats.sampleSize}</td>
    </tr>
  );
}

function NumberStatsRow({ label, stats }: { label: string; stats: NumberStats }) {
  const fmt = (n: number | null) => (n === null ? "—" : Math.round(n).toLocaleString("fr-FR"));
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2.5 font-medium">{label}</td>
      <td className="px-4 py-2.5 tabular-nums">{fmt(stats.avg)}</td>
      <td className="px-4 py-2.5 tabular-nums">{fmt(stats.median)}</td>
      <td className="px-4 py-2.5 tabular-nums">{fmt(stats.p75)}</td>
      <td className="px-4 py-2.5 tabular-nums">{fmt(stats.p90)}</td>
      <td className="px-4 py-2.5 tabular-nums text-muted-2">{stats.sampleSize}</td>
    </tr>
  );
}

function ErrorBreakdownTableRow({ row, total }: { row: ErrorBreakdownRow; total: number }) {
  const share = total > 0 ? row.count / total : null;
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2.5 font-medium">{ERROR_CODE_LABELS[row.code] ?? row.code}</td>
      <td className="px-4 py-2.5 tabular-nums">{row.count}</td>
      <td className="px-4 py-2.5 tabular-nums text-muted-2">{pct(share)}</td>
    </tr>
  );
}

function ProfileRow({ label, stats }: { label: string; stats: ProfileSegmentStats }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2.5 font-medium">{label}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.analysesCompleted}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.paywallsViewed}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.oneTimeChosen}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.plusChosen}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.lifetimeChosen}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.payments}</td>
      <td className="px-4 py-2.5 tabular-nums">{money(stats.revenue)}</td>
    </tr>
  );
}

function MethodRow({ label, stats }: { label: string; stats: MethodStats }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2.5 font-medium">{label}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.submissions}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.started}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.completed}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.failed}</td>
      <td className="px-4 py-2.5 tabular-nums">{stats.payments}</td>
    </tr>
  );
}
