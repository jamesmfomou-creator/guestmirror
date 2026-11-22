"use client";

import { ReactNode } from "react";
import { PricingCards } from "@/components/pricing/PricingCards";
import { FUTURE_LIFETIME_PRICE_LABEL } from "@/lib/blackFriday";
import { parseRemainingKey, useBlackFridayActive, useRemainingKey } from "./useBlackFriday";

const pad = (n: number) => String(n).padStart(2, "0");

/** Real time left until 30 Nov 23:59 Paris. Server render: placeholders (same width, no layout shift). */
function Countdown() {
  const r = parseRemainingKey(useRemainingKey());
  const cells: [string, string][] = r
    ? [
        [String(r.d), "j"],
        [pad(r.h), "h"],
        [pad(r.m), "min"],
        [pad(r.s), "s"],
      ]
    : [
        ["–", "j"],
        ["––", "h"],
        ["––", "min"],
        ["––", "s"],
      ];
  return (
    <div className="mx-auto mt-3 grid max-w-[15rem] grid-cols-4 gap-1" role="timer" aria-live="off" aria-label="Temps restant avant la fin du tarif actuel">
      {cells.map(([v, u]) => (
        <span key={u} className="inline-flex min-w-0 items-baseline justify-center gap-0.5 rounded-lg bg-foreground px-1 py-1.5 text-background tabular-nums">
          <span className="text-[15px] font-semibold">{v}</span>
          <span className="text-[10.5px] text-background/60">{u}</span>
        </span>
      ))}
    </div>
  );
}

function LifetimePromo() {
  return (
    <div className="mt-4 rounded-2xl border border-accent/25 bg-accent-soft/70 px-3 py-3.5 text-[13.5px] sm:px-4">
      <p className="font-semibold text-accent-hover">Avant le passage à {FUTURE_LIFETIME_PRICE_LABEL}</p>
      <p className="mt-1 text-foreground">Paiement unique — sans abonnement mensuel</p>
      <p className="mt-1 text-muted">Tarif actuel maintenu jusqu&apos;au 30 novembre</p>
      <Countdown />
    </div>
  );
}

/**
 * The marketing offers (landing, /pricing) with the Black Friday treatment on
 * "Accès à vie" while the campaign runs: highlighted card, 🔥 badge, future
 * price announced (never crossed out), countdown. Outside the campaign:
 * exactly the usual cards. The paywall does not use this component.
 */
export function LifetimePromoCards({
  oneTimeAction,
  conciergerieAction,
  lifetimeAction,
  campaignConciergerieAction,
  campaignLifetimeAction,
}: {
  oneTimeAction: ReactNode;
  conciergerieAction: ReactNode;
  lifetimeAction: ReactNode;
  /** Same links, swapped emphasis while the campaign runs (lifetime = primary). */
  campaignConciergerieAction?: ReactNode;
  campaignLifetimeAction?: ReactNode;
}) {
  const active = useBlackFridayActive();
  return (
    <PricingCards
      highlight={active ? "lifetime" : "conciergerie"}
      oneTimeAction={oneTimeAction}
      conciergerieAction={active && campaignConciergerieAction ? campaignConciergerieAction : conciergerieAction}
      lifetimeAction={active && campaignLifetimeAction ? campaignLifetimeAction : lifetimeAction}
      lifetimePromo={active ? { badge: "🔥 BLACK FRIDAY", content: <LifetimePromo /> } : undefined}
    />
  );
}
