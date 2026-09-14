import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { PricingCards } from "@/components/pricing/PricingCards";
import { getLifetimePriceLabel } from "@/lib/lifetimePrice";

export const metadata: Metadata = {
  title: "Tarif",
  description:
    "Une analyse ponctuelle à 4,90€ ou GuestMirror Plus à 6,90€/mois pour tester et améliorer régulièrement.",
};

export default async function PricingPage() {
  const lifetimePriceLabel = await getLifetimePriceLabel();

  return (
    <div className="mx-auto max-w-3xl px-5 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Choisis comment tu veux améliorer ton annonce
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-muted">
        Une analyse ponctuelle ou un accès régulier pour tester tes nouvelles photos et
        améliorations.
      </p>

      <div className="mt-10">
        <PricingCards
          lifetimePriceLabel={lifetimePriceLabel}
          oneTimeAction={
            <Button href="/analyze" size="lg" variant="outline" className="mt-6 w-full">
              Faire le test des 5 secondes
            </Button>
          }
          plusAction={
            <Button href="/analyze" size="lg" className="mt-6 w-full">
              Faire le test des 5 secondes
            </Button>
          }
          lifetimeAction={
            <Button href="/analyze" size="lg" variant="outline" className="mt-6 w-full">
              Faire le test des 5 secondes
            </Button>
          }
        />
      </div>
    </div>
  );
}
