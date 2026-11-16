"use client";

import { useState } from "react";

// Opens the Stripe billing portal for the subscription of this report's email.
// The server only allows it for a visitor who has verified that email.
export function ManageSubscriptionLink({ analysisId, label = "Gérer mon abonnement" }: { analysisId: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        window.location.href = json.url;
        return;
      }
    } catch {
      // fall through to reset loading state below
    }
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-xs font-medium text-muted underline underline-offset-2 hover:text-accent disabled:opacity-50"
    >
      {loading ? "Ouverture…" : label}
    </button>
  );
}
