import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Tarif",
  description:
    "Une analyse ponctuelle à 4,90€ ou GuestMirror Plus à 6,90€/mois pour tester et améliorer régulièrement.",
};

const ONE_TIME_FEATURES = [
  "Analyse complète",
  "Recommandations prioritaires",
  "Titres et description",
  "1 re-test après correction",
];

const PLUS_FEATURES = ["Plusieurs analyses", "Comparaisons A/B", "Re-tests", "Historique", "Plusieurs annonces"];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Choisis comment tu veux améliorer ton annonce
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-muted">
        Une analyse ponctuelle ou un accès régulier pour tester tes nouvelles photos et
        améliorations.
      </p>

      <div className="mx-auto mt-10 grid max-w-3xl gap-5 sm:grid-cols-2">
        <div className="order-1 sm:order-2">
          <div className="card relative h-full overflow-hidden border-2 border-accent p-6 text-center shadow-[0_20px_50px_-24px_rgba(217,103,63,0.35)] sm:p-7">
            <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
              Recommandé
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">GuestMirror Plus</h2>
            <p className="mt-1.5 text-sm text-muted">
              Pour tester, comparer et améliorer régulièrement.
            </p>
            <p className="mt-4 text-4xl font-semibold tracking-tight">
              6,90&nbsp;€<span className="text-base font-medium text-muted"> / mois</span>
            </p>
            <ul className="mx-auto mt-5 max-w-[220px] space-y-2.5 text-left">
              {PLUS_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-foreground">
                  <Check size={16} className="mt-0.5 shrink-0 text-score-high" />
                  {f}
                </li>
              ))}
            </ul>
            <Button href="/analyze" size="lg" className="mt-6 w-full">
              Faire le test des 5 secondes
            </Button>
            <p className="mt-3 text-xs text-muted-2">Annulable à tout moment</p>
          </div>
        </div>

        <div className="order-2 sm:order-1">
          <div className="card h-full p-6 text-center sm:p-7">
            <h2 className="text-lg font-semibold tracking-tight">Analyse unique</h2>
            <p className="mt-1.5 text-sm text-muted">Pour optimiser une annonce maintenant.</p>
            <p className="mt-4 text-4xl font-semibold tracking-tight">4,90&nbsp;€</p>
            <ul className="mx-auto mt-5 max-w-[220px] space-y-2.5 text-left">
              {ONE_TIME_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-foreground">
                  <Check size={16} className="mt-0.5 shrink-0 text-score-high" />
                  {f}
                </li>
              ))}
            </ul>
            <Button href="/analyze" size="lg" variant="outline" className="mt-6 w-full">
              Faire le test des 5 secondes
            </Button>
            <p className="mt-3 text-xs text-muted-2">Paiement unique</p>
          </div>
        </div>
      </div>
    </div>
  );
}
