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

  // Returning customers who already paid can get the link of their report
  // by email. It is never shown on screen: a report link is the access token
  // to a paid report, and the server answers the same way whether or not a
  // report exists for the address (see api/analyses/existing).
  const [linkRequest, setLinkRequest] = useState<"idle" | "sending" | "sent">("idle");

  function handleChange(value: string) {
    onChange(value);
    if (linkRequest === "sent") setLinkRequest("idle");
  }

  async function sendExistingReportLink() {
    if (!isValid || linkRequest === "sending") return;
    setLinkRequest("sending");
    try {
      await fetch("/api/analyses/existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // best effort; the confirmation below stays generic either way
    }
    setLinkRequest("sent");
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
          onBlur={() => setTouched(true)}
          placeholder="ton@email.com"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {touched && !isValid && (
          <p className="mt-2 text-sm text-score-low">Ajoute une adresse email valide pour continuer.</p>
        )}
      </div>

      {isValid && (
        <p className="mt-4 text-sm text-muted">
          {linkRequest === "sent" ? (
            <span className="text-accent-hover">
              Si un rapport débloqué existe pour cette adresse, tu vas recevoir son lien par e-mail.
            </span>
          ) : (
            <>
              Tu as déjà débloqué un rapport ?{" "}
              <button
                type="button"
                onClick={sendExistingReportLink}
                disabled={linkRequest === "sending"}
                className="font-semibold text-accent-hover underline underline-offset-2 disabled:opacity-50"
              >
                Recevoir son lien par e-mail
              </button>
            </>
          )}
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
