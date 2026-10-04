"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PricingCards } from "@/components/pricing/PricingCards";
import { track } from "@/lib/analytics";
import { getAbVariant } from "@/lib/ab";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";
import { UserType, PropertyCountRange } from "@/lib/types";

const PLAN_PRICES: Record<Plan, number | null> = { one_time: 4.9, plus: 6.9, lifetime: null };

type Plan = "one_time" | "plus" | "lifetime";

const MULTI_PROPERTY_RANGES: PropertyCountRange[] = ["2-5", "6-20", "21+"];

// Only benefits that exist in the unlocked report today (each one maps to a
// section rendered after unlock -- see result/[id]/page.tsx). Do not add
// items here without a matching feature.
const UNLOCK_BENEFITS = [
  "Les points qui freinent ton annonce",
  "L'ordre de photos recommandé",
  "Des titres Airbnb prêts à utiliser",
  "Une description améliorée",
  "Les actions prioritaires à appliquer",
  "Ton re-test après modification",
];

export function Paywall({
  analysisId,
  canceled,
  overallScore,
  inputMethod,
  lifetimePriceLabel,
  userType,
  propertyCountRange,
}: {
  analysisId: string;
  canceled?: boolean;
  overallScore?: number;
  inputMethod?: "airbnb_url" | "screenshot" | "mixed";
  lifetimePriceLabel?: string | null;
  userType?: UserType | null;
  propertyCountRange?: PropertyCountRange | null;
}) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("paywall_viewed", { analysisId, input_method: inputMethod, user_type: userType, property_count_range: propertyCountRange });
    track("pricing_viewed", { analysisId });
  });

  // UX nudge only (see lib/pricing.ts's PLUS_PLAN.concierge for the
  // always-on static mention) -- never hides or blocks the other plans.
  const showConciergeBanner =
    userType === "concierge" || (propertyCountRange != null && MULTI_PROPERTY_RANGES.includes(propertyCountRange));

  async function handleSelect(plan: Plan) {
    setLoadingPlan(plan);
    setError(null);
    const price = PLAN_PRICES[plan];

    track("paywall_cta_clicked", {
      analysisId,
      plan,
      price,
      ab_variant: getAbVariant(),
      input_method: inputMethod,
      user_type: userType,
      property_count_range: propertyCountRange,
    });
    track("unlock_clicked", { analysisId, plan, price, overall_score: overallScore, user_type: userType, property_count_range: propertyCountRange });
    track(
      plan === "one_time" ? "one_time_offer_clicked" : plan === "plus" ? "plus_offer_clicked" : "lifetime_offer_clicked",
      { analysisId, price, overall_score: overallScore, user_type: userType, property_count_range: propertyCountRange }
    );

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, plan }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Le paiement n'a pas pu être initié.");

      track("checkout_started", { analysisId, plan, price, currency: "EUR", input_method: inputMethod, user_type: userType, property_count_range: propertyCountRange });
      track(
        plan === "one_time" ? "one_time_checkout_started" : plan === "plus" ? "subscription_checkout_started" : "lifetime_checkout_started",
        { analysisId, price, currency: "EUR" }
      );

      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoadingPlan(null);
    }
  }

  return (
    <div ref={ref} id="paywall" className="mx-auto mt-6 max-w-3xl scroll-mt-20">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Débloque ton analyse complète</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
          Découvre exactement quoi améliorer sur ton annonce.
        </p>
      </div>

      <ul className="card mx-auto mt-6 grid max-w-xl gap-2.5 p-5 text-sm text-foreground sm:grid-cols-2">
        {UNLOCK_BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-0.5 font-semibold text-accent-hover">
              ✓
            </span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      {canceled && (
        <p className="mx-auto mt-5 max-w-md rounded-xl bg-score-mid/10 px-4 py-3 text-center text-sm text-score-mid">
          Le paiement a été annulé. Tu peux réessayer quand tu veux.
        </p>
      )}
      {error && (
        <p className="mx-auto mt-5 max-w-md rounded-xl bg-score-low/10 px-4 py-3 text-center text-sm text-score-low">
          {error}
        </p>
      )}

      <div className="mt-7">
        <PricingCards
          lifetimePriceLabel={lifetimePriceLabel ?? null}
          showConciergeBanner={showConciergeBanner}
          plusDescription="Pour tester plusieurs annonces et suivre tes améliorations."
          oneTimeAction={
            <Button
              size="lg"
              variant="outline"
              className="mt-6 w-full"
              onClick={() => handleSelect("one_time")}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === "one_time" ? "Redirection…" : "Débloquer mon analyse complète — 4,90 €"}
            </Button>
          }
          plusAction={
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={() => handleSelect("plus")}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === "plus" ? "Redirection…" : "Passer à GuestMirror Plus — 6,90 €/mois"}
            </Button>
          }
          lifetimeAction={
            <Button
              size="lg"
              variant="outline"
              className="mt-6 w-full"
              onClick={() => handleSelect("lifetime")}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === "lifetime" ? "Redirection…" : "Débloquer l'accès à vie"}
            </Button>
          }
        />
      </div>
    </div>
  );
}
