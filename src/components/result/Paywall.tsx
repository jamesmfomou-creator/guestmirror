"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PricingCards } from "@/components/pricing/PricingCards";
import { track } from "@/lib/analytics";
import { getAbVariant } from "@/lib/ab";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";
import { UserType, PropertyCountRange } from "@/lib/types";
import type { PaywallPreview } from "@/lib/paywallPreview";
import { PaywallPreviewV2 } from "./PaywallPreviewV2";
import { ConciergerieCheckoutSheet } from "./ConciergerieCheckoutSheet";
import { ADDON_PACK, OFFERS, formatEur, type OfferId } from "@/lib/plans";

type Plan = OfferId;

// Offer-specific event names. one_time/lifetime keep their historical names
// so existing dashboards stay continuous; Conciergerie is new.
const OFFER_CLICKED = {
  one_time: "one_time_offer_clicked",
  conciergerie: "conciergerie_offer_clicked",
  lifetime: "lifetime_offer_clicked",
} as const;
const OFFER_CHECKOUT_STARTED = {
  one_time: "one_time_checkout_started",
  conciergerie: "conciergerie_checkout_started",
  lifetime: "lifetime_checkout_started",
} as const;

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
];

export function Paywall({
  analysisId,
  canceled,
  overallScore,
  inputMethod,
  userType,
  propertyCountRange,
  preview,
  emailsReportLink,
  addonAvailable = false,
}: {
  analysisId: string;
  canceled?: boolean;
  overallScore?: number;
  inputMethod?: "airbnb_url" | "screenshot" | "mixed";
  userType?: UserType | null;
  propertyCountRange?: PropertyCountRange | null;
  // Paywall presentation experiment (lib/paywallExperiment.ts). Passed only
  // to visitors in its "v2" variant; when absent, this component renders
  // exactly what it did before the experiment (the control). Names and
  // counts only -- see lib/paywallPreview.ts.
  preview?: PaywallPreview;
  emailsReportLink?: boolean;
  /** The one-time "10 analyses" pack can be added to the Conciergerie checkout. */
  addonAvailable?: boolean;
}) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  // New copywriting (funnel optimization mission) is variant B only --
  // variant A's paywall text stays exactly as it was, same reasoning as
  // every other A/B decision in this mission (folded into the existing B
  // arm rather than a new, orthogonal test).
  const [abVariant] = useState(() => getAbVariant());

  // Fires on mount, independent of scroll position -- diagnostic only (see
  // ANALYTICS_EVENTS's comment on paywall_mounted), to tell apart the
  // component never rendering from it rendering but never being scrolled
  // into view.
  useEffect(() => {
    track("paywall_mounted", { analysisId, input_method: inputMethod });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per mount only, not on every analysisId/inputMethod identity change
  }, []);

  // Lower threshold than the 0.4 default: this section is taller than a
  // phone viewport (title + benefits + 3 pricing cards), and the default
  // was measurably undercounting real views -- see useInViewOnce's comment
  // for the real numbers that showed this.
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("paywall_viewed", { analysisId, input_method: inputMethod, user_type: userType, property_count_range: propertyCountRange });
    track("pricing_viewed", { analysisId });
  }, 0.1);

  // UX nudge only -- never hides or blocks the other plans.
  const showConciergeBanner =
    userType === "concierge" || (propertyCountRange != null && MULTI_PROPERTY_RANGES.includes(propertyCountRange));

  // Conciergerie with the add-on available: a summary step before Stripe,
  // where the pack can be ticked (never pre-ticked).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addon, setAddon] = useState(false);
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setError(null);
  }, []);

  function handleSelect(plan: Plan) {
    if (plan === "conciergerie" && addonAvailable) {
      trackOfferClick(plan);
      setError(null);
      setAddon(false);
      setSheetOpen(true);
      track("addon_offered", { analysisId, source: "subscription_checkout", price: ADDON_PACK.amountEur });
      return;
    }
    trackOfferClick(plan);
    void startCheckout(plan, false);
  }

  function toggleAddon(next: boolean) {
    setAddon(next);
    track(next ? "addon_selected" : "addon_removed", { analysisId, source: "subscription_checkout", price: ADDON_PACK.amountEur });
  }

  function trackOfferClick(plan: Plan) {
    const price = OFFERS[plan].amountEur;
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
    track(OFFER_CLICKED[plan], { analysisId, price, overall_score: overallScore, user_type: userType, property_count_range: propertyCountRange });
  }

  async function startCheckout(plan: Plan, withAddon: boolean) {
    setLoadingPlan(plan);
    setError(null);
    const price = OFFERS[plan].amountEur;
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, offer: plan, ...(plan === "conciergerie" && addonAvailable ? { addon: withAddon } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "verify_first") {
          setSheetOpen(false);
          document.getElementById("verify-access")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        throw new Error(json.error || "Le paiement n'a pas pu être initié.");
      }

      track("checkout_started", { analysisId, plan, price, currency: "EUR", input_method: inputMethod, user_type: userType, property_count_range: propertyCountRange });
      track(OFFER_CHECKOUT_STARTED[plan], { analysisId, price, currency: "EUR", addon: plan === "conciergerie" ? withAddon : undefined });
      if (withAddon) {
        track("addon_checkout_started", { analysisId, source: "subscription_checkout", price: ADDON_PACK.amountEur, currency: "EUR" });
      }

      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoadingPlan(null);
    }
  }

  return (
    <div ref={ref} id="paywall" className="mx-auto mt-6 max-w-5xl scroll-mt-20">
      <ConciergerieCheckoutSheet
        open={sheetOpen}
        addon={addon}
        loading={loadingPlan === "conciergerie"}
        error={sheetOpen ? error : null}
        onToggleAddon={toggleAddon}
        onConfirm={() => void startCheckout("conciergerie", addon)}
        onClose={closeSheet}
      />
      {preview ? (
        <PaywallPreviewV2
          analysisId={analysisId}
          preview={preview}
          emailsReportLink={emailsReportLink === true}
          loading={loadingPlan === "one_time"}
          disabled={loadingPlan !== null}
          onUnlock={() => handleSelect("one_time")}
        />
      ) : (
        <>
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {abVariant === "B" ? "Passe du diagnostic à l'action." : "Débloque ton analyse complète"}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
              {abVariant === "B"
                ? "Découvre les points faibles de ton annonce et les recommandations concrètes pour l'améliorer."
                : "Découvre exactement quoi améliorer sur ton annonce."}
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
        </>
      )}

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

      {preview && (
        <p className="mt-10 text-center text-sm font-semibold text-foreground">
          Toutes les formules
        </p>
      )}
      <div className={preview ? "mt-4" : "mt-7"}>
        <PricingCards
          highlight="one_time"
          showConciergeBanner={showConciergeBanner}
          oneTimeAction={
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={() => handleSelect("one_time")}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === "one_time"
                ? "Redirection…"
                : preview
                  ? `Débloquer mes recommandations — ${formatEur(OFFERS.one_time.amountEur)}`
                  : `Débloquer mon rapport — ${formatEur(OFFERS.one_time.amountEur)}`}
            </Button>
          }
          conciergerieAction={
            <Button
              size="lg"
              variant="outline"
              className="mt-6 w-full"
              onClick={() => handleSelect("conciergerie")}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === "conciergerie" ? "Redirection…" : "Choisir Conciergerie"}
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
              {loadingPlan === "lifetime" ? "Redirection…" : "Obtenir l'accès à vie"}
            </Button>
          }
        />
      </div>
    </div>
  );
}
