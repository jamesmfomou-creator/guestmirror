"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Une erreur est survenue</h1>
      <p className="mt-3 text-muted">
        Quelque chose ne s&apos;est pas déroulé comme prévu. Tu peux réessayer.
      </p>
      <div className="mt-7 flex gap-3">
        <Button variant="outline" onClick={reset}>
          Réessayer
        </Button>
        <Button href="/">Retour à l&apos;accueil</Button>
      </div>
    </div>
  );
}
