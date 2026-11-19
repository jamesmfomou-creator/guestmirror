import type { SubscriberRow, SubscribersSnapshot } from "@/lib/admin/subscribers";
import { Kpi } from "./ui";

// "Abonnés & MRR": live Stripe snapshot (lib/admin/subscribers.ts). Server
// component, admin only (Basic Auth on /admin, see proxy.ts).

const OFFER_LABEL: Record<SubscriberRow["offer"], string> = {
  conciergerie: "Conciergerie",
  legacy_plus: "Plus (ancienne offre)",
};

const STATUS_LABEL: Partial<Record<SubscriberRow["status"], string>> = {
  active: "Actif",
  trialing: "Essai",
  past_due: "Paiement en retard",
  unpaid: "Impayé",
  canceled: "Annulé",
  incomplete: "Incomplet",
  incomplete_expired: "Expiré",
  paused: "En pause",
};

const ALERT_LABEL: Record<NonNullable<SubscriberRow["alert"]>, string> = {
  payment_failed: "Paiement échoué",
  cancel_scheduled: "Résiliation programmée",
  unpaid_invoice: "Facture impayée",
};

const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const day = (isoDate: string | null) =>
  isoDate ? new Date(isoDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export function SubscribersSection({ snapshot }: { snapshot: SubscribersSnapshot }) {
  const ended = snapshot.rows.filter((r) => !r.countsInMrr);
  return (
    <section className="admin-sub">
      <h3 className="admin-h3">Abonnés &amp; MRR (Stripe, en direct)</h3>
      <p className="admin-note">
        Tous les abonnements GuestMirror lus directement dans Stripe à chaque affichage (Conciergerie et ancienne offre
        Plus) : les nouveaux abonnés apparaissent automatiquement. MRR = abonnements actifs, en essai ou en retard de
        paiement. Les achats uniques et l&apos;accès à vie n&apos;en font pas partie.
      </p>

      {!snapshot.configured ? (
        <p className="admin-callout mt-4 border-score-mid/40 bg-score-mid/10 text-score-mid">Stripe n&apos;est pas configuré sur cet environnement.</p>
      ) : snapshot.error ? (
        <p className="admin-callout mt-4 border-score-low/40 bg-score-low/10 text-score-low">{snapshot.error}</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="MRR" value={eur(snapshot.mrrEur)} tone="accent" />
            <Kpi label="Abonnés qui paient" value={snapshot.payingCount} />
            <Kpi label="MRR qui s'arrête (résiliations)" value={eur(snapshot.mrrEndingEur)} tone={snapshot.mrrEndingEur > 0 ? "bad" : "default"} />
            <Kpi label="Abonnements terminés" value={ended.length} />
          </div>

          {snapshot.rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Aucun abonnement pour l&apos;instant.</p>
          ) : (
            <div className="admin-table-wrap mt-4">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="admin-thead">
                    <th className="px-4 py-2.5 font-medium">Client</th>
                    <th className="px-4 py-2.5 font-medium">Offre</th>
                    <th className="px-4 py-2.5 font-medium">€/mois</th>
                    <th className="px-4 py-2.5 font-medium">Statut</th>
                    <th className="px-4 py-2.5 font-medium">Prochaine échéance</th>
                    <th className="px-4 py-2.5 font-medium">Dernière facture</th>
                    <th className="px-4 py-2.5 font-medium">Mois payés</th>
                    <th className="px-4 py-2.5 font-medium">Depuis</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.rows.map((r) => (
                    <tr key={r.id} className={`border-b border-border last:border-0 ${r.countsInMrr ? "" : "text-muted-2"}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground">{r.name ?? "(sans nom)"}</p>
                        <p className="text-xs text-muted-2">{r.email ?? "—"}</p>
                      </td>
                      <td className="px-4 py-2.5">{OFFER_LABEL[r.offer]}</td>
                      <td className="px-4 py-2.5 tabular-nums">{r.countsInMrr ? eur(r.monthlyEur) : "—"}</td>
                      <td className="px-4 py-2.5">
                        <p>{STATUS_LABEL[r.status] ?? r.status}</p>
                        {r.alert && <p className="text-xs font-medium text-score-low">{ALERT_LABEL[r.alert]}</p>}
                        {r.status === "canceled" && <p className="text-xs">le {day(r.canceledAt)}</p>}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {r.countsInMrr ? (r.cancelAtPeriodEnd ? `Fin le ${day(r.periodEnd)}` : day(r.periodEnd)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {r.lastInvoice ? (
                          <>
                            <p>{day(r.lastInvoice.createdAt)}</p>
                            <p className={`text-xs ${r.lastInvoice.status === "paid" ? "text-score-high" : "text-score-low"}`}>
                              {r.lastInvoice.status === "paid" ? `Payée ${eur(r.lastInvoice.paidEur)}` : `${r.lastInvoice.status === "open" ? "Impayée" : r.lastInvoice.status} ${eur(r.lastInvoice.dueEur)}`}
                            </p>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{r.paidMonths ?? "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">{day(r.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
