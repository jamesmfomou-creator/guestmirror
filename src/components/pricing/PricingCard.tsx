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
}: {
  plan: PlanContent;
  highlighted?: boolean;
  action: ReactNode;
  extraNote?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "card relative h-full p-6 text-center sm:p-7",
        highlighted && "border-2 border-accent shadow-[0_20px_50px_-24px_rgba(217,103,63,0.35)]"
      )}
    >
      {plan.badge && (
        <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
          {plan.badge}
        </span>
      )}
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{plan.name}</h3>
      <p className="mt-1.5 text-sm text-muted">{plan.description}</p>
      <p className="mt-4 text-4xl font-semibold tracking-tight">
        {plan.priceLabel}
        {plan.period && <span className="text-base font-medium text-muted"> {plan.period}</span>}
      </p>
      {plan.concierge && (
        <p className="mt-1.5 text-xs font-medium text-accent-hover">{plan.concierge}</p>
      )}
      <ul className="mx-auto mt-5 max-w-[220px] space-y-2.5 text-left">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-sm text-foreground">
            <Check size={16} className="mt-0.5 shrink-0 text-score-high" />
            {f}
          </li>
        ))}
      </ul>
      {action}
      <p className="mt-3 text-xs text-muted-2">{plan.note}</p>
      {extraNote}
    </div>
  );
}
