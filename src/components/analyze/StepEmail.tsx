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
  // `error` is only ever set after a real failed attempt (see
  // AnalyzeWizard's catch block) -- never for first-time validation, so
  // it's a reliable signal to distinguish "about to start" from "just
  // failed, offering a retry" and avoid showing a stale success-flavored
  // headline next to a failure message.
  const isRetry = Boolean(error);

  // Nudges a returning customer toward their existing unlocked report
  // instead of unknowingly starting (and possibly paying for) a new one --
  // added after a support case where a customer forgot she already had a
  // paid analysis and reran the test. Best-effort only: never blocks
  // submission, never shown until we've actually confirmed a match.
  const [existingAnalysisId, setExistingAnalysisId] = useState<string | null>(null);
  const [checkedEmail, setCheckedEmail] = useState<string | null>(null);

  function handleChange(value: string) {
    onChange(value);
    if (value.trim() !== checkedEmail) setExistingAnalysisId(null);
  }

  async function checkExisting() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed) || trimmed === checkedEmail) return;
    setCheckedEmail(trimmed);
    try {
      const res = await fetch(`/api/analyses/existing?email=${encodeURIComponent(trimmed)}`);
      const json = await res.json();
      setExistingAnalysisId(json.found ? json.analysisId : null);
    } catch {
      // best-effort nudge only, never blocks the form
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (isValid) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="animate-fade-up">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {isRetry ? "L'analyse n'a pas pu être terminée." : "Ton analyse est prête."}
      </h1>
      <p className="mt-3 text-muted">
        {isRetry
          ? "Tes captures sont toujours prêtes, tu peux réessayer directement."
          : "Où veux-tu recevoir ton résultat ?"}
      </p>

      <div className="card mt-8 p-6 sm:p-7">
        <input
          type="email"
          inputMode="email"
          autoFocus
          value={email}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            setTouched(true);
            checkExisting();
          }}
          placeholder="ton@email.com"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {touched && !isValid && (
          <p className="mt-2 text-sm text-score-low">Ajoute une adresse email valide pour continuer.</p>
        )}
      </div>

      {existingAnalysisId && (
        <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-hover">
          Tu as déjà une analyse débloquée avec cette adresse.{" "}
          <a href={`/result/${existingAnalysisId}`} className="font-semibold underline underline-offset-2">
            Voir mon rapport
          </a>
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-score-low/10 px-4 py-3 text-sm text-score-low">{error}</p>
      )}

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={loading}>
        {loading ? "Un instant…" : isRetry ? "Réessayer l'analyse" : "Voir ma première impression"}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-2">
        Aucun spam. Ton email sert uniquement à sauvegarder et retrouver ton analyse.
      </p>
    </form>
  );
}
