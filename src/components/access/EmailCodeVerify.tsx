"use client";

import { FormEvent, useState } from "react";

// Compact "prove you read this mailbox" step: request a 6-digit code, type
// it, done (the server sets the httpOnly access cookie). Shared by:
//  - the result page, for the owner of a report on a browser that did not
//    create it (OwnershipVerify): the code goes to the report's address;
//  - the analysis wizard, when the per-IP abuse limit stops a visitor on a
//    busy shared network: the code goes to the address they typed.
// Same routes and rules as the subscriber verification (AccessPanel).

export function EmailCodeVerify({
  requestBody,
  verifyBody,
  requestLabel = "Recevoir un code",
  onVerified,
}: {
  requestBody: Record<string, string>;
  verifyBody: (code: string) => Record<string, string>;
  requestLabel?: string;
  onVerified: () => void;
}) {
  const [stage, setStage] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setStage("sending");
    setError(null);
    try {
      const res = await fetch("/api/access/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "L'e-mail n'a pas pu être envoyé.");
      if (json.alreadyVerified) {
        onVerified();
        return;
      }
      setSentTo(json.sentTo ?? null);
      if (json.devCode) setCode(json.devCode); // local demo only (no email provider)
      setStage("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setStage("idle");
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setStage("verifying");
    setError(null);
    try {
      const res = await fetch("/api/access/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verifyBody(code)),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Code incorrect.");
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code incorrect.");
      setStage("sent");
    }
  }

  return (
    <div>
      {stage === "idle" || stage === "sending" ? (
        <button
          type="button"
          onClick={requestCode}
          disabled={stage === "sending"}
          className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-60"
        >
          {stage === "sending" ? "Envoi…" : requestLabel}
        </button>
      ) : (
        <form onSubmit={verify} className="flex max-w-xs flex-col gap-2.5">
          <p className="text-[13px] text-muted">Code envoyé{sentTo ? ` à ${sentTo}` : ""}. Il est valable 10 minutes.</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="Code à 6 chiffres"
            placeholder="123456"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-center text-base tracking-[0.4em] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="submit"
            disabled={code.length !== 6 || stage === "verifying"}
            className="inline-flex items-center justify-center rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background disabled:opacity-60"
          >
            {stage === "verifying" ? "Vérification…" : "Valider"}
          </button>
          <button type="button" onClick={requestCode} className="text-left text-xs text-muted underline underline-offset-2">
            Renvoyer un code
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-[12.5px] text-score-low">{error}</p>}
    </div>
  );
}
