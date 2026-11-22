import { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanContent } from "@/lib/pricing";

/**
 * Single presentational pricing card, shared by the paywall, /pricing, and
 * the landing page's pricing section -- previously three separate copies
 * of the same markup, which is exactly what would have tripled when
 * adding the Lifetime card. `action` is the plan's own button (checkout
 * click on the paywall, a plain link elsewhere), kept external since only
 * the paywall needs checkout logic.
 */
export function PricingCard({
  plan,
  highlighted,
  action,
  extraNote,
  featured = false,
  promo,
}: {
  plan: PlanContent;
  highlighted?: boolean;
  action: ReactNode;
  extraNote?: ReactNode;
  /** Campaign emphasis (Black Friday): relief, warm halo, bigger price. */
  featured?: boolean;
  /** Campaign block under the price. */
  promo?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "card relative flex h-full flex-col p-6 text-center sm:p-7",
        // "!": .card (globals.css) sits outside Tailwind's layers and would
        // otherwise win over these utilities.
        highlighted && "border-2! border-accent! shadow-[0_20px_50px_-24px_rgba(217,103,63,0.35)]",
        featured &&
          "bg-[linear-gradient(180deg,rgba(217,103,63,0.07),transparent_45%)]! shadow-[0_0_0_4px_rgba(217,103,63,0.10),0_30px_70px_-28px_rgba(217,103,63,0.55)]! md:-translate-y-2"
      )}
    >
      {plan.badge && (
        <span
          className={cn(
            "inline-flex items-center self-center whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide",
            featured ? "bg-[#141110] text-white" : "bg-accent-soft text-accent-hover"
          )}
        >
          {plan.badge}
        </span>
      )}
      <h3 className={cn("text-lg font-semibold tracking-tight", plan.badge ? "mt-4" : "mt-0")}>{plan.name}</h3>
      <p className="mt-1.5 text-sm text-muted">{plan.description}</p>
      <p className={cn("mt-4 font-semibold tracking-tight", featured ? "text-5xl" : "text-4xl")}>
        {plan.priceLabel}
        {plan.period && <span className="text-base font-medium text-muted"> {plan.period}</span>}
      </p>
      {plan.keyLine && <p className="mt-2 text-sm font-semibold text-accent-hover">{plan.keyLine}</p>}
      {promo}
      <ul className="mx-auto mt-5 max-w-[220px] space-y-2.5 text-left">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-foreground">
            <Check size={16} className="mt-0.5 shrink-0 text-score-high" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        {action}
        <p className="mt-3 text-xs text-muted-2">{plan.note}</p>
      </div>
      {extraNote}
    </div>
  );
}
