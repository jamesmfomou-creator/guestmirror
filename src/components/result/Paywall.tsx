"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";

const FEATURES = [
  "Photo de couverture",
  "Ordre des photos",
  "Différenciation",
  "3 propositions de titre",
  "Description retravaillée",
  "Questions voyageurs",
  "Top 3 actions prioritaires",
  "Nouveau test après correction",
];

export function Paywall({
  analysisId,
  canceled,
}: {
  analysisId: string;
  canceled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("paywall_viewed", { analysisId });
  }, [analysisId]);

  async function handleUnlock() {
    setLoading(true);
    setError(null);
    track("checkout_clicked", { analysisId });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Le paiement n'a pas pu être initié.");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoading(false);
    }
  }

  return (
    <div id="paywall" className="mx-auto mt-6 max-w-md scroll-mt-20">
      <div className="card overflow-hidden p-6 text-center sm:p-7">
        <h2 className="text-2xl font-semibold tracking-tight">Découvre exactement quoi améliorer.</h2>
        <p className="mt-2 text-sm text-muted">
          Débloque ton analyse complète et les actions prioritaires pour améliorer ta première
          impression.
        </p>
        <ul className="mt-5 space-y-2.5 text-left">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-3 text-sm text-foreground">
              <Check size={16} className="mt-0.5 shrink-0 text-score-high" />
              {f}
            </li>
          ))}
        </ul>

        <p className="mt-5 text-5xl font-semibold tracking-tight">9,90 €</p>

        {canceled && (
          <p className="mt-4 rounded-xl bg-score-mid/10 px-4 py-3 text-sm text-score-mid">
            Le paiement a été annulé. Tu peux réessayer quand tu veux.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl bg-score-low/10 px-4 py-3 text-sm text-score-low">{error}</p>
        )}

        <Button size="lg" className="mt-5 w-full" onClick={handleUnlock} disabled={loading}>
          {loading ? "Redirection…" : "Débloquer mon analyse complète — 9,90 €"}
        </Button>
        <p className="mt-3 text-xs text-muted-2">Paiement unique • Aucun abonnement</p>
      </div>
    </div>
  );
}
