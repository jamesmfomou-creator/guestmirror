import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ONE_TIME_PLAN, PLUS_PLAN, LIFETIME_PLAN_BASE, PlanContent } from "@/lib/pricing";
import { PricingCard } from "./PricingCard";

/**
 * Mobile-first: the grid is single-column by default (stacked, readable),
 * and only becomes side-by-side at the sm breakpoint. Lifetime only
 * renders once a live Stripe price label is available (see
 * lib/lifetimePrice.ts) -- until then this is the same 2-card layout as
 * before, unchanged.
 */
export function PricingCards({
  lifetimePriceLabel,
  oneTimeAction,
  plusAction,
  lifetimeAction,
  showConciergeBanner,
}: {
  lifetimePriceLabel: string | null;
  oneTimeAction: ReactNode;
  plusAction: ReactNode;
  lifetimeAction?: ReactNode;
  showConciergeBanner?: boolean;
}) {
  const lifetimePlan: PlanContent | null =
    lifetimePriceLabel && lifetimeAction ? { ...LIFETIME_PLAN_BASE, priceLabel: lifetimePriceLabel } : null;

  return (
    <div>
      {showConciergeBanner && (
        <p className="mx-auto mb-5 max-w-md rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-hover">
          Tu gères plusieurs logements ? GuestMirror Plus est généralement plus adapté.
        </p>
      )}
      <div className={cn("mx-auto grid max-w-5xl gap-5", lifetimePlan ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <PricingCard plan={ONE_TIME_PLAN} action={oneTimeAction} />
        <PricingCard plan={PLUS_PLAN} highlighted action={plusAction} />
        {lifetimePlan && (
          <PricingCard
            plan={lifetimePlan}
            action={lifetimeAction}
            extraNote={
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-2">
                Offre de lancement — disponibilité limitée
              </p>
            }
          />
        )}
      </div>
    </div>
  );
}
