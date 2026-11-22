import { ReactNode } from "react";
import { CONCIERGERIE_PLAN, LIFETIME_PLAN, ONE_TIME_PLAN } from "@/lib/pricing";
import type { OfferId } from "@/lib/plans";
import { PricingCard } from "./PricingCard";

/**
 * The three offers (pricing v2), shared by the landing page, /pricing and the
 * paywall. Mobile-first: stacked, then side by side from the md breakpoint.
 * `highlight` is the visually emphasised card: Conciergerie on marketing
 * pages, the single analysis on the paywall (one listing, one report).
 */
export function PricingCards({
  oneTimeAction,
  conciergerieAction,
  lifetimeAction,
  highlight = "conciergerie",
  showConciergeBanner,
  lifetimePromo,
}: {
  oneTimeAction: ReactNode;
  conciergerieAction: ReactNode;
  lifetimeAction: ReactNode;
  highlight?: OfferId;
  showConciergeBanner?: boolean;
  /** Marketing campaign treatment of "Accès à vie" (components/promo). */
  lifetimePromo?: { badge: string; content: ReactNode };
}) {
  return (
    <div>
      {showConciergeBanner && (
        <p className="mx-auto mb-5 max-w-md rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-hover">
          Tu gères plusieurs logements ? L&apos;offre Conciergerie est généralement plus adaptée.
        </p>
      )}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
        <PricingCard plan={ONE_TIME_PLAN} highlighted={highlight === "one_time"} action={oneTimeAction} />
        <PricingCard plan={CONCIERGERIE_PLAN} highlighted={highlight === "conciergerie"} action={conciergerieAction} />
        <div id="acces-a-vie" className="scroll-mt-28 md:h-full">
          <PricingCard
            plan={lifetimePromo ? { ...LIFETIME_PLAN, badge: lifetimePromo.badge } : LIFETIME_PLAN}
            highlighted={highlight === "lifetime"}
            featured={Boolean(lifetimePromo)}
            promo={lifetimePromo?.content}
            action={lifetimeAction}
          />
        </div>
      </div>
    </div>
  );
}
