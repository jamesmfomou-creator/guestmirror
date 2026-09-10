"use client";

import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";

/**
 * Variant B only: the paywall doesn't render at all until this CTA is
 * clicked (variant A shows it directly, unchanged). Paywall itself
 * (`children`) is entirely untouched -- this only controls *when* it
 * mounts.
 */
export function UnlockCtaGate({ analysisId, children }: { analysisId: string; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  function handleClick() {
    track("unlock_cta_clicked", { analysisId });
    setRevealed(true);
    requestAnimationFrame(() => {
      document.getElementById("paywall")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (revealed) return <>{children}</>;

  return (
    <div className="mx-auto mt-7 max-w-xl text-center">
      <Button size="lg" className="w-full" onClick={handleClick}>
        Voir mon analyse complète
      </Button>
    </div>
  );
}
