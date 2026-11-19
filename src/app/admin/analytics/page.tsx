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
import type { Proportion } from "@/lib/admin/paywallExperimentStats";
import { listFeedback } from "@/lib/feedback";
import { getSubscribersSnapshot } from "@/lib/admin/subscribers";
import { SubscribersSection } from "./SubscribersSection";
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
  ai_invalid_response: "IA — réponse invalide (cause non précisée)",
  ai_tool_missing: "IA — tool-use absent de la réponse",
  ai_schema_mismatch: "IA — réponse hors schéma (champ requis manquant)",
  ai_truncated_response: "IA — réponse tronquée (max_tokens atteint)",
  ai_empty_response: "IA — réponse vide",
  ai_refused: "IA — refus du modèle",
  ai_context_exceeded: "IA — fenêtre de contexte dépassée",
  ai_error: "IA — erreur générique",
  api_error: "Erreur générique (avant catégorisation détaillée)",
  insufficient_input: "Pas assez d'informations fournies",
  image_processing_failed: "Traitement des images échoué",
  image_too_large: "Image trop volumineuse",
  database_failed: "Écriture base de données échouée",
  airbnb_url_extraction_failed: "Extraction du lien Airbnb échouée",
  response_parse_failed: "Réponse serveur illisible",
  timeout: "Délai dépassé côté navigateur, analyse non récupérée",
  // Not "the visitor's network": the 2026-11 audit found a finished, stored
  // analysis behind every one of these. The browser lost the request; what
  // caused the loss is not known from this event alone.
  network_error: "Requête perdue par le navigateur, analyse non récupérée",
  server_timeout: "Serveur — fonction interrompue avant la fin (limite de durée)",
  unknown: "Inconnu",
};

// Where in /api/analyze a server-side failure happened (AnalysisPhase).
const PHASE_LABELS: Record<string, string> = {
  url_extraction: "Extraction du lien",
  image_preprocessing: "Préparation des images",
  ai_call: "Appel IA",
  image_storage: "Stockage des images",
  database: "Base de données",
  unknown: "Inconnue",
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

// "8 % (3–21 %) · 3/38": the observed share, its 95 % interval and the
// raw counts, so a rate is never read without its sample size.
function proportionLabel(p: Proportion): string {
  if (p.rate === null || p.low === null || p.high === null) return "—";
  const percent = (n: number) => Math.round(n * 100);
  return `${percent(p.rate)} % (${percent(p.low)}–${percent(p.high)} %) · ${p.successes}/${p.trials}`;
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
  // Live from Stripe (read only): every GuestMirror subscriber, new ones included.
  const subscribers = await getSubscribersSnapshot();
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

      <SubscribersSection snapshot={subscribers} />

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

      {/* Reliability: what the server did vs what the visitor got. Server
          numbers come from events written by /api/analyze itself (see
          lib/analysisAttempts.ts); they exist only from the day that
          instrumentation shipped. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Fiabilité — serveur et récupération</h2>
        <p className="mt-1 text-sm text-muted-2">
          <strong>Côté serveur</strong> : une ligne de vérité par tentative, écrite par le serveur
          lui-même, que le navigateur soit encore là ou non. Le taux de succès serveur ={" "}
          terminées ÷ (terminées + échouées + interrompues) ; les échecs d&apos;extraction du lien
          Airbnb (aucune analyse lancée) et les tentatives encore en cours n&apos;y entrent pas.
          Disponible uniquement depuis la mise en place de ce suivi.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Tentatives reçues (serveur)" value={data.reliability.serverAttempts} />
          <Kpi label="Terminées (serveur)" value={data.reliability.serverCompleted} />
          <Kpi label="Taux de succès serveur" value={pct(data.reliability.serverSuccessRate)} />
          <Kpi label="Échouées (serveur)" value={data.reliability.serverFailed} />
          <Kpi label="Interrompues (limite de durée)" value={data.reliability.serverTimedOut} />
          <Kpi label="Extraction Airbnb échouée" value={data.reliability.serverExtractionFailed} />
          <Kpi label="Doublons évités — déjà terminée" value={data.reliability.duplicateRequestsAlreadyCompleted} />
          <Kpi label="Doublons évités — déjà en cours" value={data.reliability.duplicateRequestsInFlight} />
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-2">
          Requêtes perdues par le navigateur et récupération
        </p>
        <p className="mt-1 text-sm text-muted-2">
          Une « requête perdue » = le navigateur n&apos;a jamais reçu la réponse (page suspendue,
          changement de réseau, délai dépassé). Elle est « récupérée » si le visiteur a quand même
          fini sur son résultat (même tentative, sans nouvelle analyse). Les tentatives récupérées
          comptent dans « Tentatives complétées » ci-dessus mais pas dans les durées.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="Requêtes perdues" value={data.reliability.connectionLostAttempts} />
          <Kpi label="Récupérées" value={data.reliability.recoveredAttempts} />
          <Kpi label="Taux de récupération" value={pct(data.reliability.recoveryRate)} />
          <Kpi label="Perdues non récupérées" value={data.reliability.lostUnrecoveredAttempts} />
          <Kpi label="Renvois automatiques (même tentative)" value={data.reliability.autoResubmits} />
          <Kpi label="Réessais manuels (même tentative)" value={data.reliability.manualSameAttemptRetries} />
        </div>

        {data.reliability.serverErrors.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                  <th className="px-4 py-2.5 font-medium">Erreur serveur</th>
                  <th className="px-4 py-2.5 font-medium">Phase</th>
                  <th className="px-4 py-2.5 font-medium">Tentatives</th>
                </tr>
              </thead>
              <tbody>
                {data.reliability.serverErrors.map((row) => (
                  <tr key={`${row.code}|${row.phase}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">{ERROR_CODE_LABELS[row.code] ?? row.code}</td>
                    <td className="px-4 py-2.5 text-muted-2">{PHASE_LABELS[row.phase] ?? row.phase}</td>
                    <td className="px-4 py-2.5">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
          Mesuré côté serveur pour chaque analyse complétée (y compris celles récupérées après une
          requête perdue, via l&apos;événement serveur). &quot;n&quot; = nombre d&apos;analyses
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
              <tr className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium">Analyses ayant nécessité 1 retry IA</td>
                <td className="px-4 py-2.5 tabular-nums" colSpan={4}>
                  {data.stepTimings.aiRetryCount.sampleSize}
                </td>
              </tr>
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

      {/* Onboarding "objectif" (variant B uniquement, voir StepGoal.tsx) --
          pour orienter le contenu/positionnement, pas un test A/B en soi. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Objectifs des utilisateurs (onboarding)</h2>
        <p className="mt-1 text-sm text-muted-2">
          Réponse à « Quel est ton objectif avec cette annonce ? » — posée après l&apos;email,
          variante B uniquement.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Objectif</th>
                <th className="px-4 py-2.5 font-medium">Réponses</th>
                <th className="px-4 py-2.5 font-medium">Part</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const total = data.goalBreakdown.reduce((sum, r) => sum + r.count, 0);
                return data.goalBreakdown.map((row) => (
                  <tr key={row.goal} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5">{row.label}</td>
                    <td className="px-4 py-2.5 font-medium tabular-nums">{row.count}</td>
                    <td className="px-4 py-2.5 text-muted-2 tabular-nums">
                      {total > 0 ? Math.round((row.count / total) * 100) : 0}%
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        {data.goalBreakdown.every((r) => r.count === 0) && (
          <p className="mt-3 text-sm text-muted-2">Aucune réponse pour la période sélectionnée.</p>
        )}
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
              <AbRow
                label="Paywall monté (diagnostic)"
                a={data.abTest.A.paywallsMounted}
                b={data.abTest.B.paywallsMounted}
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

      {/* Paywall presentation experiment: control vs v2 */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Test paywall — contrôle vs v2 (depuis les nouveaux tarifs)</h2>
        <p className="mt-1 text-sm text-muted-2">
          Expérience indépendante du test A/B ci-dessus (un visiteur est dans A ou B, et séparément
          dans « contrôle » ou « v2 »). Contrôle = page verrouillée d&apos;origine. v2 = aperçu
          construit à partir des résultats de l&apos;analyse + bouton « Débloquer mes
          recommandations — 4,90 € ». Chaque ligne compte des visiteurs distincts ; seuls les
          événements portant une variante paywall sont comptés. Les fourchettes entre parenthèses
          sont des intervalles de confiance à 95 %.
        </p>
        <p
          className={`mt-3 rounded-xl px-4 py-3 text-sm ${
            data.paywallExperiment.verdict === "difference"
              ? "bg-accent-soft text-accent-hover"
              : "bg-background-alt text-muted"
          }`}
        >
          {data.paywallExperiment.verdict === "insufficient_data" &&
            `Données insuffisantes pour conclure : il faut au moins ${data.paywallExperiment.minPaywallViewers} visiteurs ayant vu le paywall dans chaque variante (contrôle : ${data.paywallExperiment.control.paywallsViewed}, v2 : ${data.paywallExperiment.v2.paywallsViewed} sur la période). Les écarts ci-dessous sont des observations, pas des résultats.`}
          {data.paywallExperiment.verdict === "inconclusive" &&
            "Écart non concluant : les intervalles de confiance des deux variantes se chevauchent sur le taux de clic du paywall. L'écart observé peut être dû au hasard."}
          {data.paywallExperiment.verdict === "difference" &&
            "Écart net sur le taux de clic du paywall : les intervalles de confiance à 95 % des deux variantes ne se chevauchent pas. À confirmer sur les paiements, plus rares, avant de généraliser."}
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Métrique</th>
                <th className="px-4 py-2.5 font-medium">Contrôle</th>
                <th className="px-4 py-2.5 font-medium">v2</th>
              </tr>
            </thead>
            <tbody>
              <AbRow label="Visiteurs assignés" a={data.paywallExperiment.control.visitors} b={data.paywallExperiment.v2.visitors} />
              <AbRow label="Analyses complétées" a={data.paywallExperiment.control.analysesCompleted} b={data.paywallExperiment.v2.analysesCompleted} />
              <AbRow label="Résultats vus (visiteurs exposés)" a={data.paywallExperiment.control.resultsViewed} b={data.paywallExperiment.v2.resultsViewed} />
              <AbRow label="Aperçu verrouillé vu" a={data.paywallExperiment.control.previewsViewed} b={data.paywallExperiment.v2.previewsViewed} />
              <AbRow label="Paywall vu" a={data.paywallExperiment.control.paywallsViewed} b={data.paywallExperiment.v2.paywallsViewed} />
              <AbRow label="Clics sur une offre" a={data.paywallExperiment.control.unlockClicks} b={data.paywallExperiment.v2.unlockClicks} />
              <AbRow label="Checkouts démarrés" a={data.paywallExperiment.control.checkoutsStarted} b={data.paywallExperiment.v2.checkoutsStarted} />
              <AbRow label="Paiements" a={data.paywallExperiment.control.paymentsCompleted} b={data.paywallExperiment.v2.paymentsCompleted} />
              <AbRow label="Revenue" a={eur(data.paywallExperiment.control.revenue)} b={eur(data.paywallExperiment.v2.revenue)} />
              <AbRow
                label="Clic offre / paywall vu (métrique principale)"
                a={proportionLabel(data.paywallExperiment.control.unlockPerPaywallViewer)}
                b={proportionLabel(data.paywallExperiment.v2.unlockPerPaywallViewer)}
              />
              <AbRow
                label="Checkout / paywall vu"
                a={proportionLabel(data.paywallExperiment.control.checkoutPerPaywallViewer)}
                b={proportionLabel(data.paywallExperiment.v2.checkoutPerPaywallViewer)}
              />
              <AbRow
                label="Paiement / visiteur exposé"
                a={proportionLabel(data.paywallExperiment.control.paymentPerResultViewer)}
                b={proportionLabel(data.paywallExperiment.v2.paymentPerResultViewer)}
              />
              <AbRow
                label="Paiement / analyse terminée"
                a={proportionLabel(data.paywallExperiment.control.paymentPerAnalysis)}
                b={proportionLabel(data.paywallExperiment.v2.paymentPerAnalysis)}
              />
              <AbRow
                label="Paiement / paywall vu"
                a={proportionLabel(data.paywallExperiment.control.paymentPerPaywallViewer)}
                b={proportionLabel(data.paywallExperiment.v2.paymentPerPaywallViewer)}
              />
              <AbRow
                label="Revenue / visiteur exposé"
                a={money(data.paywallExperiment.control.revenuePerResultViewer)}
                b={money(data.paywallExperiment.v2.revenuePerResultViewer)}
              />
            </tbody>
          </table>
        </div>
        <h3 className="mt-5 text-sm font-semibold">Croisement avec le test A/B</h3>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Cellule</th>
                <th className="px-4 py-2.5 font-medium">Résultats vus</th>
                <th className="px-4 py-2.5 font-medium">Paywall vu</th>
                <th className="px-4 py-2.5 font-medium">Clics offre</th>
                <th className="px-4 py-2.5 font-medium">Paiements</th>
                <th className="px-4 py-2.5 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(["A", "B"] as const).flatMap((ab) =>
                (["control", "v2"] as const).map((pw) => {
                  const cell = data.paywallExperiment.byAbVariant[ab][pw];
                  return (
                    <tr key={`${ab}-${pw}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">
                        Variante {ab} × {pw === "control" ? "contrôle" : "v2"}
                      </td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">{cell.resultsViewed}</td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">{cell.paywallsViewed}</td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">{cell.unlockClicks}</td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">{cell.paymentsCompleted}</td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">{eur(cell.revenue)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-2">
          Dans la variante B, le paywall de contrôle n&apos;apparaît qu&apos;après un clic sur
          « Débloquer mon plan complet » ; en v2 il est affiché directement. « Paywall vu » n&apos;y
          a donc pas la même signification : pour B, compare d&apos;abord « Paiement / visiteur
          exposé ».
        </p>
      </section>

      {/* Analysis loader experiment: control vs immersive */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Test loader — contrôle vs immersif</h2>
        <p className="mt-1 text-sm text-muted-2">
          Expérience indépendante des deux tests ci-dessus. Contrôle = écran d&apos;attente du bras A/B
          du visiteur, inchangé. Immersif = les vraies photos, le vrai titre et des extraits de la
          description de l&apos;annonce pendant l&apos;analyse. Chaque ligne compte des tentatives
          d&apos;analyse (attemptId). Une tentative n&apos;est comptée « abandonnée » que si la page a
          été quittée pendant l&apos;attente ET qu&apos;elle ne s&apos;est jamais terminée ni n&apos;a
          échoué ensuite. Les fourchettes sont des intervalles de confiance à 95 %.
        </p>
        <p
          className={`mt-3 rounded-xl px-4 py-3 text-sm ${
            data.loaderExperiment.verdict === "difference" ? "bg-accent-soft text-accent-hover" : "bg-background-alt text-muted"
          }`}
        >
          {data.loaderExperiment.verdict === "insufficient_data" &&
            `Données insuffisantes pour conclure : il faut au moins ${data.loaderExperiment.minAttempts} tentatives dans chaque variante (contrôle : ${data.loaderExperiment.control.attempts}, immersif : ${data.loaderExperiment.immersive.attempts} sur la période). Les écarts ci-dessous sont des observations, pas des résultats.`}
          {data.loaderExperiment.verdict === "inconclusive" &&
            "Écart non concluant : les intervalles de confiance des deux variantes se chevauchent sur le taux d'analyses menées jusqu'au résultat."}
          {data.loaderExperiment.verdict === "difference" &&
            "Écart net sur le taux d'analyses menées jusqu'au résultat : les intervalles de confiance à 95 % ne se chevauchent pas."}
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Métrique</th>
                <th className="px-4 py-2.5 font-medium">Contrôle</th>
                <th className="px-4 py-2.5 font-medium">Immersif</th>
              </tr>
            </thead>
            <tbody>
              <AbRow label="Tentatives (écran d'attente vu)" a={data.loaderExperiment.control.attempts} b={data.loaderExperiment.immersive.attempts} />
              <AbRow label="Terminées (résultat obtenu)" a={data.loaderExperiment.control.completed} b={data.loaderExperiment.immersive.completed} />
              <AbRow label="Échouées" a={data.loaderExperiment.control.failed} b={data.loaderExperiment.immersive.failed} />
              <AbRow label="Abandonnées (confirmé)" a={data.loaderExperiment.control.abandoned} b={data.loaderExperiment.immersive.abandoned} />
              <AbRow label="Sans issue connue" a={data.loaderExperiment.control.unresolved} b={data.loaderExperiment.immersive.unresolved} />
              <AbRow
                label="Menées jusqu'au résultat (métrique principale)"
                a={proportionLabel(data.loaderExperiment.control.completionRate)}
                b={proportionLabel(data.loaderExperiment.immersive.completionRate)}
              />
              <AbRow
                label="Taux d'abandon"
                a={proportionLabel(data.loaderExperiment.control.abandonmentRate)}
                b={proportionLabel(data.loaderExperiment.immersive.abandonmentRate)}
              />
              <AbRow
                label="Durée réelle de l'analyse (médiane)"
                a={seconds(data.loaderExperiment.control.medianDurationS)}
                b={seconds(data.loaderExperiment.immersive.medianDurationS)}
              />
              <AbRow label="Annonce affichée pendant l'attente" a="—" b={data.loaderExperiment.immersive.visualsStarted} />
              <AbRow label="Délai avant affichage de l'annonce (médiane)" a="—" b={seconds(data.loaderExperiment.immersive.medianTimeToVisualS)} />
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing v2: the three offers */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Offres — Analyse unique, Conciergerie, Accès à vie</h2>
        <p className="mt-1 text-sm text-muted-2">
          Depuis le changement de prix uniquement (version {data.offers.pricingVersion}). Un achat est
          un paiement confirmé par Stripe (webhook), jamais un simple retour de paiement. La
          conversion rapporte les visiteurs ayant acheté l&apos;offre aux visiteurs ayant vu le
          paywall. Abonnements actifs, MRR et accès à vie sont un instantané actuel.
          {!data.offers.grantsReadable && " (Instantané indisponible : la migration 0010 n'est pas encore appliquée.)"}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Conciergerie actifs" value={data.offers.activeConciergerie} />
          <Kpi label="MRR Conciergerie" value={eur(data.offers.conciergerieMrr)} />
          <Kpi label="Accès à vie actifs" value={data.offers.activeLifetime} />
          <Kpi label="Analyses Conciergerie utilisées" value={data.offers.creditsUsed} />
          <Kpi label="Paywalls vus" value={data.offers.paywallViewers} />
          <Kpi label="Échecs de paiement" value={data.offers.paymentFailures} />
          <Kpi label="Remboursements" value={data.offers.refunds} />
          <Kpi label="Litiges" value={data.offers.disputes} />
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Offre</th>
                <th className="px-4 py-2.5 font-medium">Clics</th>
                <th className="px-4 py-2.5 font-medium">Paiements commencés</th>
                <th className="px-4 py-2.5 font-medium">Achats</th>
                <th className="px-4 py-2.5 font-medium">Revenu</th>
                <th className="px-4 py-2.5 font-medium">Achat / paywall vu</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["one_time", "Analyse unique — 7,90 €"],
                  ["conciergerie", "Conciergerie — 34,90 €/mois"],
                  ["lifetime", "Accès à vie — 89 €"],
                ] as const
              ).map(([key, label]) => {
                const o = data.offers.byOffer[key];
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{o.clicks}</td>
                    <td className="px-4 py-2.5 tabular-nums">{o.checkoutsStarted}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {o.purchases}
                      {key === "conciergerie" && o.renewals > 0 ? ` (+${o.renewals} renouvellement${o.renewals > 1 ? "s" : ""})` : ""}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{eur(o.revenue)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{proportionLabel(o.conversionPerPaywallViewer)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 text-sm font-semibold">Pack 10 analyses supplémentaires — 12,90 €</h3>
        <p className="mt-1 text-sm text-muted-2">
          « Avec l&apos;abonnement » : option cochée dans le récapitulatif Conciergerie. « Espace abonné » : acheté plus tard
          depuis un rapport. Achats confirmés par Stripe uniquement.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Taux d'ajout à l'abonnement" value={proportionLabel(data.offers.addon.attachRate)} />
          <Kpi label="Paiements Conciergerie avec pack" value={data.offers.addon.conciergerieCheckoutsWithAddon} />
          <Kpi label="Paiements Conciergerie sans pack" value={data.offers.addon.conciergerieCheckoutsWithoutAddon} />
          <Kpi label="Échecs / remb. / litiges" value={`${data.offers.addon.failures} / ${data.offers.addon.refunds} / ${data.offers.addon.disputes}`} />
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-background-alt text-left text-xs uppercase tracking-wide text-muted-2">
                <th className="px-4 py-2.5 font-medium">Origine</th>
                <th className="px-4 py-2.5 font-medium">Proposé</th>
                <th className="px-4 py-2.5 font-medium">Choisi</th>
                <th className="px-4 py-2.5 font-medium">Paiements commencés</th>
                <th className="px-4 py-2.5 font-medium">Achats</th>
                <th className="px-4 py-2.5 font-medium">Revenu</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["subscription_checkout", "Avec l'abonnement"],
                  ["account", "Espace abonné"],
                ] as const
              ).map(([key, label]) => {
                const a = data.offers.addon.bySource[key];
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{a.offered}</td>
                    <td className="px-4 py-2.5 tabular-nums">{a.selected}</td>
                    <td className="px-4 py-2.5 tabular-nums">{a.checkoutsStarted}</td>
                    <td className="px-4 py-2.5 tabular-nums">{a.purchases}</td>
                    <td className="px-4 py-2.5 tabular-nums">{eur(a.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pricing: one-time vs Plus */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Pricing historique — anciens tarifs inclus</h2>
        <p className="mt-1 text-sm text-muted-2">
          <strong>Abonnements Plus actifs</strong> et <strong>MRR</strong> sont un instantané
          actuel de l&apos;état réel des abonnements (indépendant de la période sélectionnée) — un
          abonnement toujours actif y reste compté même si son événement de départ date de plus de
          7/30 jours. Tout le reste (nouveaux abonnements, paiements, revenue) correspond
          uniquement à la période sélectionnée. Le revenu encaissé sur la période (analyse unique +
          nouveaux abonnements) n&apos;est jamais mélangé au MRR, qui reflète le taux mensuel
          récurrent actuel, pas une somme encaissée.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Abonnements Plus actifs (6,90 €)" value={data.pricing.activePlusSubscriptions} />
          <Kpi label="MRR Plus" value={eur(data.pricing.mrr)} />
          <Kpi label="Nouveaux abonnements" value={data.pricing.newSubscriptions} />
          <Kpi label="Annulations" value={data.pricing.cancellations} />
          <Kpi label="Paiements analyse unique" value={data.pricing.oneTimePayments} />
          <Kpi label="Revenue analyse unique (période)" value={eur(data.pricing.oneTimeRevenue)} />
          <Kpi label="Revenue abonnement (période)" value={eur(data.pricing.newSubscriptionRevenue)} />
          <Kpi label="Revenue total (période)" value={eur(data.pricing.revenueTotal)} />
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
