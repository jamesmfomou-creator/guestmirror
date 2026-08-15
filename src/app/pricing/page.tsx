import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Tarif",
  description: "Une analyse complète de ton annonce, paiement unique de 9,90€, sans abonnement.",
};

const FEATURES = [
  `${BRAND_NAME} global et sous-scores détaillés`,
  "Toutes les recommandations (photos, titre, description, offre)",
  "Analyse détaillée de chaque photo importée",
  "Ordre recommandé des photos",
  "3 nouveaux titres proposés",
  "Description entièrement réécrite",
  "Plan d'action complet",
  "Possibilité de refaire une analyse après modifications",
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Un tarif simple</h1>
      <p className="mt-3 text-muted">Pas d&apos;abonnement, pas de surprise.</p>

      <div className="card mt-10 p-8">
        <h2 className="text-lg font-semibold">Analyse complète</h2>
        <p className="mt-3 text-5xl font-semibold tracking-tight">9,90 €</p>
        <p className="mt-1 text-sm text-muted">Paiement unique</p>

        <ul className="mt-7 space-y-3 text-left">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-3 text-sm text-foreground">
              <Check size={16} className="mt-0.5 shrink-0 text-score-high" />
              {f}
            </li>
          ))}
        </ul>

        <Button href="/analyze" size="lg" className="mt-8 w-full">
          Faire le test des 5 secondes
        </Button>
        <p className="mt-3 text-xs text-muted-2">Paiement unique • Aucun abonnement</p>
      </div>
    </div>
  );
}
