"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

const ONE_TIME_PRICE = 4.9;
const PLUS_PRICE = 6.9;

const ONE_TIME_FEATURES = ["Analyse complète", "Recommandations prioritaires", "Titres et description", "1 re-test après correction"];

const PLUS_FEATURES = ["Plusieurs analyses", "Comparaisons A/B", "Re-tests", "Historique", "Plusieurs annonces"];

type Plan = "one_time" | "plus";

export function Paywall({
  analysisId,
  canceled,
  overallScore,
}: {
  analysisId: string;
  canceled?: boolean;
  overallScore?: number;
}) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("paywall_viewed", { analysisId });
    track("pricing_viewed", { analysisId });
  });

  async function handleSelect(plan: Plan) {
    setLoadingPlan(plan);
    setError(null);
    const price = plan === "one_time" ? ONE_TIME_PRICE : PLUS_PRICE;

    track("unlock_clicked", { analysisId, plan, price, overall_score: overallScore });
    track(plan === "one_time" ? "one_time_offer_clicked" : "plus_offer_clicked", {
      analysisId,
      price,
      overall_score: overallScore,
    });

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, plan }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Le paiement n'a pas pu être initié.");

      track("checkout_started", { analysisId, plan, price, currency: "EUR" });
      track(plan === "one_time" ? "one_time_checkout_started" : "subscription_checkout_started", {
        analysisId,
        price,
        currency: "EUR",
      });

      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoadingPlan(null);
    }
  }

  return (
    <div ref={ref} id="paywall" className="mx-auto mt-6 max-w-3xl scroll-mt-20">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Choisis comment tu veux améliorer ton annonce
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
          Une analyse ponctuelle ou un accès régulier pour tester tes nouvelles photos et
          améliorations.
        </p>
      </div>

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

      <div className="mx-auto mt-7 grid max-w-3xl gap-5 sm:grid-cols-2">
        {/* GuestMirror Plus -- shown first on mobile, second (right) on desktop */}
        <div className="order-1 sm:order-2">
          <div className="card relative h-full overflow-hidden border-2 border-accent p-6 text-center shadow-[0_20px_50px_-24px_rgba(217,103,63,0.35)] sm:p-7">
            <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
              Recommandé
            </span>
            <h3 className="mt-4 text-lg font-semibold tracking-tight">GuestMirror Plus</h3>
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
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={() => handleSelect("plus")}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === "plus" ? "Redirection…" : "Passer à GuestMirror Plus — 6,90 €/mois"}
            </Button>
            <p className="mt-3 text-xs text-muted-2">Annulable à tout moment</p>
          </div>
        </div>

        {/* Analyse unique -- shown second on mobile, first (left) on desktop */}
        <div className="order-2 sm:order-1">
          <div className="card h-full p-6 text-center sm:p-7">
            <h3 className="text-lg font-semibold tracking-tight">Analyse unique</h3>
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
            <Button
              size="lg"
              variant="outline"
              className="mt-6 w-full"
              onClick={() => handleSelect("one_time")}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === "one_time" ? "Redirection…" : "Débloquer mon analyse — 4,90 €"}
            </Button>
            <p className="mt-3 text-xs text-muted-2">Paiement unique</p>
          </div>
        </div>
      </div>
    </div>
  );
}
