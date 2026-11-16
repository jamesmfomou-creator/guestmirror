import type { Metadata } from "next";
import { CtaTrackedButton } from "@/components/landing/CtaTrackedButton";
import { PricingCards } from "@/components/pricing/PricingCards";

export const metadata: Metadata = {
  title: "Tarif",
  description:
    "Analyse unique à 7,90 €, Conciergerie à 34,90 €/mois pour 20 analyses par mois, ou accès à vie à 89 € avec des analyses illimitées.",
};

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Choisis comment tu veux améliorer ton annonce
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-muted">
        Un rapport pour ton annonce, 20 analyses par mois pour tes logements, ou un accès à vie sans
        abonnement. Chaque formule commence par une analyse gratuite.
      </p>

      <div className="mt-10">
        <PricingCards
          oneTimeAction={
            <CtaTrackedButton href="/analyze" size="lg" variant="outline" className="mt-6 w-full" ctaLocation="pricing_page_one_time">
              Analyser mon annonce
            </CtaTrackedButton>
          }
          conciergerieAction={
            <CtaTrackedButton href="/analyze" size="lg" className="mt-6 w-full" ctaLocation="pricing_page_conciergerie">
              Choisir Conciergerie
            </CtaTrackedButton>
          }
          lifetimeAction={
            <CtaTrackedButton href="/analyze" size="lg" variant="outline" className="mt-6 w-full" ctaLocation="pricing_page_lifetime">
              Obtenir l&apos;accès à vie
            </CtaTrackedButton>
          }
        />
      </div>
    </div>
  );
}
