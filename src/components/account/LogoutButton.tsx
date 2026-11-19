"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/access/logout", { method: "POST" });
    } finally {
      router.refresh();
    }
  }
  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-[13.5px] font-semibold text-foreground transition-colors hover:border-foreground/30 disabled:opacity-60"
    >
      {loading ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
