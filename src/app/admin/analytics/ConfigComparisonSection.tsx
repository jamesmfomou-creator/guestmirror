import type { ConfigComparison, Ratio, WindowStats } from "@/lib/admin/configComparison";

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
/** Window ends are exclusive: show the last day included. */
const lastDay = (iso: string) => day(new Date(Date.parse(iso) - 1).toISOString());
const pct = (r: Ratio) => (r.rate === null ? "—" : `${(r.rate * 100).toFixed(1).replace(".", ",")} %`);

function RatioCell({ r }: { r: Ratio }) {
  return (
    <td className="px-4 py-2.5 tabular-nums">
      <span className="font-medium">{pct(r)}</span>
      <span className="ml-1.5 text-xs text-muted-2">
        ({r.num} / {r.den})
      </span>
    </td>
  );
}

type Row =
  | { label: string; hint: string; kind: "n"; get: (w: WindowStats) => number }
  | { label: string; hint: string; kind: "eur"; get: (w: WindowStats) => number }
  | { label: string; hint: string; kind: "ratio"; get: (w: WindowStats) => Ratio };

const ROWS: Row[] = [
  { label: "1. Visiteurs éligibles", hint: "visiteurs uniques de la landing (landing_view)", kind: "n", get: (w) => w.eligible },
  { label: "2. Clics sur le CTA du Hero", hint: "visiteurs uniques, bouton principal du Hero", kind: "n", get: (w) => w.heroClicks },
  { label: "3. Taux de clic du Hero", hint: "clics CTA Hero ÷ visiteurs éligibles", kind: "ratio", get: (w) => w.heroCtr },
  { label: "4. Ont commencé à saisir un lien Airbnb", hint: "visiteurs uniques (airbnb_url_started)", kind: "n", get: (w) => w.urlStarted },
  { label: "5. Analyses déclenchées", hint: "une par tentative (analysis_started)", kind: "n", get: (w) => w.analysesStarted },
  { label: "6. Déclenchement après le clic CTA", hint: "cliqueurs du CTA Hero ayant lancé une analyse ÷ cliqueurs", kind: "ratio", get: (w) => w.heroToAnalysis },
  { label: "7. Analyses terminées", hint: "une par analyse (analysis_completed)", kind: "n", get: (w) => w.analysesCompleted },
  { label: "8. Paywalls affichés", hint: "visiteurs uniques (paywall_viewed)", kind: "n", get: (w) => w.paywallViewers },
  { label: "Taux d'affichage du paywall", hint: "visiteurs ayant vu le paywall ÷ visiteurs avec une analyse terminée", kind: "ratio", get: (w) => w.paywallRate },
  { label: "9. Clics sur un bouton de paiement", hint: "visiteurs uniques (paywall_cta_clicked)", kind: "n", get: (w) => w.paymentClicks },
  { label: "10. Paiements Stripe confirmés", hint: "webhook Stripe, un par session / abonnement", kind: "n", get: (w) => w.sales },
  { label: "11. Conversion paywall → achat", hint: "paiements confirmés ÷ visiteurs ayant vu le paywall", kind: "ratio", get: (w) => w.paywallToSale },
  { label: "12. Chiffre d'affaires", hint: "paiements confirmés", kind: "eur", get: (w) => w.revenue },
];

export function ConfigComparisonSection({ data }: { data: ConfigComparison }) {
  const { current, previous } = data;
  return (
    <section id="configuration-figee" className="admin-sub scroll-mt-40">
      <h3 className="admin-h3">Configuration figée — semaine du {day(current.from)}</h3>
      <p className="admin-note">
        {data.active ? "Active" : "Désactivée"} : tous les visiteurs reçoivent A/B Aha <b>{data.combination.ab}</b> · Paywall{" "}
        <b>{data.combination.paywall}</b> · Loader <b>{data.combination.loader}</b> · Onboarding{" "}
        <b>{data.combination.onboarding}</b>. Comparée aux 7 jours précédents ({day(previous.from)} → {lastDay(previous.to)}, variantes
        tirées au sort). Les données historiques gardent leur variante d&apos;origine.
      </p>
      <p className="mt-2 rounded-lg border border-border bg-background-alt/60 px-3 py-2 text-xs text-muted">
        À lire avec prudence : le Hero de la landing a changé le 22/11 et la répartition des tests le 23/11. Un écart entre les
        deux colonnes est une <b>évolution constatée</b>, pas l&apos;effet de l&apos;un ou de l&apos;autre changement — ni la
        preuve que cette combinaison est meilleure, surtout avec peu de ventes.
      </p>

      {!data.started ? (
        <p className="mt-3 text-sm text-muted-2">La semaine mesurée commence le {day(current.from)} : la colonne de gauche se remplira à partir de cette date.</p>
      ) : null}

      <div className="admin-table-wrap mt-3">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="admin-thead">
              <th className="px-4 py-2.5 font-medium">Indicateur</th>
              <th className="px-4 py-2.5 font-medium">
                Semaine figée
                <span className="block text-[11px] font-normal text-muted-2">
                  {day(current.from)} → {lastDay(current.to)}
                </span>
              </th>
              <th className="px-4 py-2.5 font-medium">
                Période précédente
                <span className="block text-[11px] font-normal text-muted-2">
                  {day(previous.from)} → {lastDay(previous.to)}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{row.label}</p>
                  <p className="text-xs text-muted-2">{row.hint}</p>
                </td>
                {[current, previous].map((w, i) =>
                  row.kind === "ratio" ? (
                    <RatioCell key={i} r={row.get(w)} />
                  ) : (
                    <td key={i} className="px-4 py-2.5 tabular-nums">
                      {row.kind === "eur" ? eur(row.get(w)) : row.get(w)}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.started ? (
        <p className="mt-2 text-xs text-muted-2">
          Contrôle : {pct(current.taggedShare)} des événements de la semaine portent la configuration figée (
          {current.taggedShare.num} / {current.taggedShare.den}).
        </p>
      ) : null}
    </section>
  );
}
