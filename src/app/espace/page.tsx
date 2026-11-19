import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { currentIdentity } from "@/lib/access/session";
import { getAccessForEmail, type ReportAccess } from "@/lib/access/reportAccess";
import { listAnalysesByEmail, type AnalysisSummary } from "@/lib/store";
import { OFFERS, formatEur } from "@/lib/plans";
import { EspaceLogin } from "@/components/account/EspaceLogin";
import { LogoutButton } from "@/components/account/LogoutButton";
import { ManageSubscriptionLink } from "@/components/result/ManageSubscriptionLink";

// Mon espace GuestMirror: the offer, the analyses and the account of the
// email THIS BROWSER PROVED (6-digit code, lib/access/session.ts). Nothing is
// read from a typed address. A session opened by a Stripe checkout return
// (scoped to that payment) proves the payment, not the mailbox: it must log
// in with a code before seeing the other reports of the address.
//
// Rights come from lib/access/reportAccess.ts, the same server-side
// resolution as the result page: nothing here grants or consumes anything.

export const metadata: Metadata = {
  title: "Mon espace",
  robots: { index: false, follow: false },
};

export default async function EspacePage() {
  const identity = await currentIdentity();
  const loggedIn = identity !== null && identity.scopeCheckoutSessionId === null;

  return (
    <div className="px-4 pb-24 pt-10 sm:px-5 sm:pt-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-display text-balance text-center text-[2.1rem] text-foreground sm:text-[2.75rem]">
          Mon espace <em className="text-accent">GuestMirror</em>
        </h1>
        {loggedIn ? <Espace email={identity.email} /> : <LoggedOut />}
      </div>
    </div>
  );
}

function LoggedOut() {
  return (
    <>
      <p className="mx-auto mt-3 max-w-md text-center text-[15px] leading-relaxed text-muted">
        Retrouve tes analyses, ton offre et lance de nouvelles analyses avec tes droits.
      </p>
      <div className="mt-8">
        <EspaceLogin />
      </div>
      <p className="mt-6 text-center text-[13px] text-muted-2">
        Pas encore d&apos;analyse ?{" "}
        <Link href="/analyze" className="font-medium text-accent-hover underline-offset-4 hover:underline">
          Teste ton annonce gratuitement
        </Link>
      </p>
    </>
  );
}

async function Espace({ email }: { email: string }) {
  const [access, analyses] = await Promise.all([
    getAccessForEmail(email),
    listAnalysesByEmail(email).catch((err) => {
      console.error("[espace] analyses list failed:", err instanceof Error ? err.message : err);
      return null;
    }),
  ]);

  return (
    <div className="mt-8 space-y-5">
      <OfferCard access={access} />
      <NewAnalysisCard access={access} />
      <AnalysesCard analyses={analyses} access={access} />
      <section className="card p-5 sm:p-6" aria-labelledby="compte">
        <h2 id="compte" className="text-lg font-semibold tracking-tight text-foreground">
          Mon compte
        </h2>
        <p className="mt-2 break-all text-[15px] text-foreground">{email}</p>
        <p className="mt-1 text-[13px] text-muted-2">Connexion par code envoyé à cette adresse, valable 30 jours sur cet appareil.</p>
        <div className="mt-4">
          <LogoutButton />
        </div>
        <p className="mt-4 text-[13px] text-muted-2">Une question ? Réponds simplement à n&apos;importe quel email GuestMirror.</p>
      </section>
    </div>
  );
}

function OfferCard({ access }: { access: ReportAccess }) {
  const c = access.conciergerie;
  let name: string;
  let status: string;
  let detail: string | null = null;
  if (access.unlimited === "lifetime" || access.unlimited === "legacy_lifetime") {
    name = OFFERS.lifetime.name;
    status = "Accès à vie actif";
    detail = "Analyses illimitées : chaque rapport de ton adresse s'affiche en entier, sans nouveau paiement.";
  } else if (access.unlimited === "legacy_plus") {
    name = "GuestMirror Plus";
    status = "Abonnement actif";
    detail = "Analyses illimitées tant que l'abonnement est actif.";
  } else if (c) {
    name = OFFERS.conciergerie.name;
    status = c.usable
      ? c.cancelAtPeriodEnd
        ? "Actif — résiliation programmée"
        : "Abonnement actif"
      : c.blockedReason === "payment_failed"
        ? "Paiement en échec"
        : c.blockedReason === "period_ended"
          ? "Abonnement terminé"
          : "Quota du mois atteint";
    const end = c.periodEnd ? new Date(c.periodEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
    detail = `${c.remaining}/${c.quota} analyses restantes ce mois-ci${c.extraRemaining > 0 ? `, + ${c.extraRemaining} analyses supplémentaires (pack)` : ""}.${
      end ? (c.cancelAtPeriodEnd ? ` Accès jusqu'au ${end}.` : ` Renouvellement le ${end}.`) : ""
    }`;
  } else {
    name = "Aucune offre en cours";
    status = "Analyse unique";
    detail = `Chaque rapport se débloque séparément (${formatEur(OFFERS.one_time.amountEur)}). Tes rapports achetés restent accessibles ci-dessous.`;
  }

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="offre">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="offre" className="text-lg font-semibold tracking-tight text-foreground">
          Mon offre
        </h2>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent-hover">{status}</span>
      </div>
      <p className="mt-2 text-[17px] font-semibold text-foreground">{name}</p>
      {detail && <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{detail}</p>}
      {access.hasManageableSubscription && (
        <div className="mt-4">
          <ManageSubscriptionLink
            label="Gérer mon abonnement (factures, carte, résiliation)"
            className="text-[13.5px] font-semibold text-accent-hover underline-offset-4 hover:underline disabled:opacity-50"
          />
        </div>
      )}
      {!access.unlimited && !c && (
        <Link href="/pricing" className="mt-4 inline-block text-[13.5px] font-semibold text-accent-hover underline-offset-4 hover:underline">
          Voir les offres Conciergerie et Accès à vie
        </Link>
      )}
    </section>
  );
}

function NewAnalysisCard({ access }: { access: ReportAccess }) {
  const covered = access.unlimited !== null || (access.conciergerie?.usable ?? false);
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="nouvelle">
      <h2 id="nouvelle" className="text-lg font-semibold tracking-tight text-foreground">
        Nouvelle analyse
      </h2>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
        {access.unlimited
          ? "Incluse dans ton offre : le rapport complet s'affiche directement."
          : access.conciergerie?.usable
            ? "Incluse dans ton abonnement : tu débloques le rapport complet avec 1 analyse de ton quota."
            : "Le diagnostic gratuit s'affiche tout de suite ; le rapport complet reste à débloquer."}
      </p>
      <Link
        href="/analyze"
        className="btn-sheen group mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover sm:w-auto"
      >
        Analyser une annonce
        <ArrowRight aria-hidden size={18} />
      </Link>
      {covered && <p className="mt-2.5 text-[12.5px] text-muted-2">Utilise la même adresse email que ton espace pour profiter de tes droits.</p>}
    </section>
  );
}

function AnalysesCard({ analyses, access }: { analyses: AnalysisSummary[] | null; access: ReportAccess }) {
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="analyses">
      <h2 id="analyses" className="text-lg font-semibold tracking-tight text-foreground">
        Mes analyses{analyses && analyses.length > 0 ? ` (${analyses.length})` : ""}
      </h2>
      {analyses === null ? (
        <p className="mt-2 text-[14.5px] text-muted">Tes analyses n&apos;ont pas pu être chargées. Actualise la page dans un instant.</p>
      ) : analyses.length === 0 ? (
        <p className="mt-2 text-[14.5px] text-muted">Aucune analyse pour cette adresse pour l&apos;instant.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {analyses.map((a) => {
            const full = a.isUnlocked || access.unlimited !== null;
            const date = new Date(a.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
            return (
              <li key={a.id} className="flex flex-col gap-2.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-foreground">{a.title ?? "Annonce analysée"}</p>
                  <p className="mt-0.5 text-[13px] text-muted-2">
                    {date}
                    {a.city ? ` · ${a.city}` : ""}
                    {a.overallScore !== null ? ` · ${a.overallScore}/100` : ""}
                    {" · "}
                    {full ? "Rapport complet" : "Diagnostic gratuit"}
                  </p>
                </div>
                <Link
                  href={`/result/${a.id}`}
                  className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-[13.5px] font-semibold text-foreground transition-colors hover:border-accent hover:text-accent-hover"
                >
                  Voir mon analyse
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
