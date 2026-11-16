"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Back from Stripe before the verified webhook has activated the purchase:
// the page is refreshed a few times; nothing is unlocked from here (the
// webhook is the only source of truth). No report content.

const REFRESH_MS = 3_000;
const MAX_REFRESHES = 20;

export function PaymentPending() {
  const router = useRouter();
  const [refreshes, setRefreshes] = useState(0);

  useEffect(() => {
    if (refreshes >= MAX_REFRESHES) return;
    const t = setTimeout(() => {
      setRefreshes((n) => n + 1);
      router.refresh();
    }, REFRESH_MS);
    return () => clearTimeout(t);
  }, [refreshes, router]);

  const waitingTooLong = refreshes >= MAX_REFRESHES;
  return (
    <div className="mx-auto mt-6 max-w-xl" role="status" aria-live="polite">
      <div className="card p-6 text-center sm:p-7">
        <p className="text-lg font-semibold text-foreground">
          {waitingTooLong ? "Ton paiement est en cours de confirmation." : "Paiement reçu, on active ton accès…"}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          {waitingTooLong
            ? "La confirmation prend plus de temps que d'habitude. Tu recevras un e-mail dès que ton rapport sera débloqué, et cette page l'affichera aussi."
            : "Cela prend généralement quelques secondes. Cette page se met à jour toute seule."}
        </p>
      </div>
    </div>
  );
}
