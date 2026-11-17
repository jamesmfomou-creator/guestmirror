"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { ADDON_PACK, formatEur } from "@/lib/plans";
import { ManageSubscriptionLink } from "./ManageSubscriptionLink";

// Shown on a locked report whose email has a subscription or lifetime right:
//  - "verify": the visitor must prove they read that mailbox (emailed code)
//    before the right can be used on this device;
//  - "credit": verified Conciergerie subscriber, who unlocks this report with
//    one of their monthly analyses (enforced server side).
// Receives no report content.

export type CreditBlock = "payment_failed" | "period_ended" | "quota_exhausted" | null;

export function AccessPanel(
  props:
    | { mode: "verify"; analysisId: string }
    | {
        mode: "credit";
        analysisId: string;
        remaining: number;
        quota: number;
        extraRemaining: number;
        nextSource: "monthly" | "pack" | null;
        canBuyAddon: boolean;
        periodEnd: string | null;
        blockedReason: CreditBlock;
        canManage: boolean;
      }
) {
  return props.mode === "verify" ? <VerifyCard analysisId={props.analysisId} /> : <CreditCard {...props} />;
}

function VerifyCard({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function requestCode() {
    setStage("sending");
    setError(null);
    track("access_code_requested", { analysisId });
    try {
      const res = await fetch("/api/access/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "L'e-mail n'a pas pu être envoyé.");
      if (json.alreadyVerified) {
        router.refresh();
        return;
      }
      setSentTo(json.sentTo ?? null);
      if (json.devCode) setCode(json.devCode);
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
        body: JSON.stringify({ analysisId, code }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Code incorrect.");
      track("access_verified", { analysisId });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code incorrect.");
      setStage("sent");
    }
  }

  return (
    <div id="verify-access" className="mx-auto mt-6 max-w-xl scroll-mt-24">
      <div className="card p-6 text-center sm:p-7">
        <p className="text-lg font-semibold text-foreground">Tu as un abonnement ou l&apos;accès à vie ?</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Cet e-mail a des droits GuestMirror. Pour les utiliser sur cet appareil, confirme que c&apos;est bien
          toi avec le code que l&apos;on t&apos;envoie par e-mail.
        </p>
        {stage === "idle" || stage === "sending" ? (
          <Button size="lg" className="mt-5" onClick={requestCode} disabled={stage === "sending"}>
            {stage === "sending" ? "Envoi…" : "Recevoir mon code"}
          </Button>
        ) : (
          <form onSubmit={verify} className="mx-auto mt-5 flex max-w-xs flex-col gap-3">
            <p className="text-sm text-muted">Code envoyé{sentTo ? ` à ${sentTo}` : ""}. Il est valable 10 minutes.</p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="Code à 6 chiffres"
              placeholder="123456"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-lg tracking-[0.4em] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <Button type="submit" size="lg" className="w-full" disabled={code.length !== 6 || stage === "verifying"}>
              {stage === "verifying" ? "Vérification…" : "Valider"}
            </Button>
            <button type="button" onClick={requestCode} className="text-xs text-muted underline underline-offset-2">
              Renvoyer un code
            </button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-score-low">{error}</p>}
      </div>
    </div>
  );
}

function CreditCard({
  analysisId,
  remaining,
  quota,
  extraRemaining,
  nextSource,
  canBuyAddon,
  periodEnd,
  blockedReason,
  canManage,
}: {
  analysisId: string;
  remaining: number;
  quota: number;
  extraRemaining: number;
  nextSource: "monthly" | "pack" | null;
  canBuyAddon: boolean;
  periodEnd: string | null;
  blockedReason: CreditBlock;
  canManage: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renewal = periodEnd ? new Date(periodEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : null;

  async function useCredit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access/use-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Le rapport n'a pas pu être débloqué.");
      track("subscription_credit_used", { analysisId, remaining: json.remaining ?? null, source: json.source ?? null, extra_remaining: json.extraRemaining ?? null });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-xl">
      <div className="card border-2! border-accent! p-6 text-center sm:p-7">
        <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-hover">
          Conciergerie
        </span>
        <CreditCounters remaining={remaining} quota={quota} extraRemaining={extraRemaining} />
        {blockedReason === null ? (
          <>
            {nextSource === "pack" && (
              <p className="mx-auto mt-4 max-w-md text-sm text-muted">
                Tes analyses du mois sont utilisées : ce rapport utilisera une de tes analyses supplémentaires.
              </p>
            )}
            <Button size="lg" className="mt-5" onClick={useCredit} disabled={loading}>
              {loading ? "Déblocage…" : "Débloquer ce rapport (1 analyse)"}
            </Button>
          </>
        ) : (
          <p className="mx-auto mt-4 max-w-md text-sm text-foreground">
            {blockedReason === "quota_exhausted" &&
              `Tu as utilisé tes ${quota} analyses de ce mois-ci.${renewal ? ` Elles se renouvellent le ${renewal}.` : ""}`}
            {blockedReason === "payment_failed" &&
              "Le dernier paiement de ton abonnement a échoué : mets à jour ton moyen de paiement pour retrouver tes analyses."}
            {blockedReason === "period_ended" && "Ton abonnement Conciergerie n'est plus actif."}
          </p>
        )}
        {canBuyAddon && (
          <div className="mt-5">
            <BuyAddonButton
              analysisId={analysisId}
              prominent={blockedReason === "quota_exhausted" || (remaining <= 3 && extraRemaining === 0)}
            />
          </div>
        )}
        {error && <p className="mt-3 text-sm text-score-low">{error}</p>}
        {canManage && (
          <p className="mt-4">
            <ManageSubscriptionLink analysisId={analysisId} />
          </p>
        )}
      </div>
    </div>
  );
}

/** "Analyses mensuelles restantes : X/20" and "Analyses supplémentaires : Y". */
export function CreditCounters({ remaining, quota, extraRemaining }: { remaining: number; quota: number; extraRemaining: number }) {
  return (
    <dl className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-2.5 text-left">
      <div className="rounded-2xl border border-border bg-background px-4 py-3">
        <dt className="text-[12px] text-muted">Analyses mensuelles restantes</dt>
        <dd className="mt-0.5 text-lg font-semibold text-foreground">
          {remaining}/{quota}
        </dd>
      </div>
      <div className="rounded-2xl border border-border bg-background px-4 py-3">
        <dt className="text-[12px] text-muted">Analyses supplémentaires</dt>
        <dd className="mt-0.5 text-lg font-semibold text-foreground">{extraRemaining}</dd>
      </div>
    </dl>
  );
}

/**
 * Buys the one-time pack from the report page (verified Conciergerie
 * subscriber). The server decides eligibility and price; the credits arrive
 * with the confirmed payment (webhook).
 */
export function BuyAddonButton({ analysisId, prominent = false }: { analysisId: string; prominent?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offered = useRef(false);

  useEffect(() => {
    if (offered.current) return;
    offered.current = true;
    track("addon_offered", { analysisId, source: "account", price: ADDON_PACK.amountEur });
  }, [analysisId]);

  async function buy() {
    setLoading(true);
    setError(null);
    track("addon_selected", { analysisId, source: "account", price: ADDON_PACK.amountEur });
    try {
      const res = await fetch("/api/checkout/addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Le paiement n'a pas pu être initié.");
      track("addon_checkout_started", { analysisId, source: "account", price: ADDON_PACK.amountEur, currency: "EUR" });
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setLoading(false);
    }
  }

  const label = loading
    ? "Redirection…"
    : `Acheter ${ADDON_PACK.credits} analyses supplémentaires — ${formatEur(ADDON_PACK.amountEur)}`;
  return (
    <div className="text-center">
      {prominent ? (
        <Button size="lg" variant="outline" onClick={buy} disabled={loading}>
          {label}
        </Button>
      ) : (
        <button
          type="button"
          onClick={buy}
          disabled={loading}
          className="text-sm font-medium text-accent-hover underline underline-offset-4 transition-opacity hover:opacity-75 disabled:opacity-50"
        >
          {label}
        </button>
      )}
      <p className="mt-1.5 text-[12px] text-muted-2">Paiement unique · disponibles jusqu&apos;à leur utilisation</p>
      {error && <p className="mt-2 text-sm text-score-low">{error}</p>}
    </div>
  );
}
