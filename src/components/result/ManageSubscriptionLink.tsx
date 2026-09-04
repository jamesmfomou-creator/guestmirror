"use client";

import { useState } from "react";

export function ManageSubscriptionLink({ email }: { email: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
      {loading ? "Ouverture…" : "Gérer mon abonnement"}
    </button>
  );
}
