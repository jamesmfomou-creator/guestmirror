"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function StepEmail({
  email,
  onChange,
  onSubmit,
  loading,
  error,
}: {
  email: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  const [touched, setTouched] = useState(false);
  const isValid = EMAIL_RE.test(email.trim());

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (isValid) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="animate-fade-up">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ton analyse est prête.</h1>
      <p className="mt-3 text-muted">Où veux-tu recevoir ton résultat ?</p>

      <div className="card mt-8 p-6 sm:p-7">
        <input
          type="email"
          inputMode="email"
          autoFocus
          value={email}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="ton@email.com"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {touched && !isValid && (
          <p className="mt-2 text-sm text-score-low">Ajoute une adresse email valide pour continuer.</p>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-score-low/10 px-4 py-3 text-sm text-score-low">{error}</p>
      )}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
        {loading ? "Un instant…" : "Voir ma première impression"}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-2">
        Aucun spam. Ton email sert uniquement à sauvegarder et retrouver ton analyse.
      </p>
    </form>
  );
}
