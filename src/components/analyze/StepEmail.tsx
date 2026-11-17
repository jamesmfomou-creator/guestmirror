"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorNote, OnboardingHeading, Surface } from "./OnboardingUI";

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
      <OnboardingHeading
        title={
          isRetry ? (
            "L'analyse n'a pas pu être terminée."
          ) : (
            <>
              Ton analyse <em>est prête.</em>
            </>
          )
        }
        description={
          isRetry
            ? "Tes captures sont toujours prêtes, tu peux réessayer directement."
            : "Où veux-tu recevoir ton résultat ?"
        }
      />

      <Surface className="mt-9">
        <div className="group flex items-center gap-3 rounded-2xl border border-border bg-background px-4 transition-all focus-within:border-foreground/40 focus-within:shadow-[0_0_0_4px_rgba(217,108,63,0.12)]">
          <Mail aria-hidden size={18} className="shrink-0 text-muted-2 transition-colors group-focus-within:text-accent" />
          <input
          type="email"
          inputMode="email"
          autoFocus
          value={email}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="ton@email.com"
          aria-label="Adresse email"
          className="w-full bg-transparent py-3.5 text-[15px] text-foreground placeholder:text-muted-2 focus:outline-none"
          />
        </div>
        {touched && !isValid && (
          <p className="mt-2.5 text-sm text-score-low">Ajoute une adresse email valide pour continuer.</p>
        )}
      </Surface>

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

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button type="submit" size="lg" className="btn-sheen group mt-8 w-full sm:w-full" disabled={loading}>
        {loading ? "Un instant…" : isRetry ? "Réessayer l'analyse" : "Voir ma première impression"}
        {!loading && (
          <ArrowRight aria-hidden size={18} className="transition-transform duration-300 group-hover:translate-x-0.5" />
        )}
      </Button>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-2">
        <Lock aria-hidden size={12} className="shrink-0" />
        Aucun spam. Ton email sert uniquement à sauvegarder et retrouver ton analyse.
      </p>
    </form>
  );
}
