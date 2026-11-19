"use client";

import { useState } from "react";

// Opens the Stripe billing portal for the subscription of this report's email
// (analysisId), or of the email proven by this browser (Mon espace, no id).
// The server only allows it for a visitor who has verified that email.
export function ManageSubscriptionLink({
  analysisId,
  label = "Gérer mon abonnement",
  className = "text-xs font-medium text-muted underline underline-offset-2 hover:text-accent disabled:opacity-50",
}: {
  analysisId?: string;
  label?: string;
  className?: string;
}) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysisId ? { analysisId } : {}),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        window.location.href = json.url;
        return;
      }
    } catch {
      // fall through to reset loading state below
    }
    setError(true);
    setLoading(false);
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={loading} className={className}>
        {loading ? "Ouverture…" : label}
      </button>
      {error && <span className="ml-2 text-xs text-score-low">Le portail n&apos;a pas pu s&apos;ouvrir. Réessaie.</span>}
    </>
  );
}
