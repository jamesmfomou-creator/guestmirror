"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { ADDON_PACK, CONCIERGERIE_QUOTA, OFFERS, formatEur } from "@/lib/plans";
import { cn } from "@/lib/utils";

// Last step before Stripe for the Conciergerie offer: a summary of the
// subscription and the optional one-time pack (unticked by default -- never
// added without the visitor's explicit choice). Amounts come from lib/plans
// (the same catalogue the server charges from), tax included.

const cents = (eur: number) => Math.round(eur * 100);
const eurFromCents = (c: number) => formatEur(c / 100);

export function ConciergerieCheckoutSheet({
  open,
  addon,
  loading,
  error,
  onToggleAddon,
  onConfirm,
  onClose,
}: {
  open: boolean;
  addon: boolean;
  loading: boolean;
  error: string | null;
  onToggleAddon: (next: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  const monthly = cents(OFFERS.conciergerie.amountEur);
  const pack = cents(ADDON_PACK.amountEur);
  const today = monthly + (addon ? pack : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={() => !loading && onClose()}
        className="absolute inset-0 bg-[#15120e]/45 backdrop-blur-[3px] animate-[fade-in_0.2s_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-fade-up relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-border bg-background p-6 shadow-[0_40px_80px_-30px_rgba(21,18,14,0.55)] outline-none sm:rounded-[28px] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-mono text-muted-2">Récapitulatif</p>
            <h2 id={titleId} className="text-display mt-2 text-[1.9rem] text-foreground">
              Ton abonnement Conciergerie
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fermer"
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-foreground disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3.5">
          <span className="text-[15px] text-foreground">{CONCIERGERIE_QUOTA} analyses par mois</span>
          <span className="whitespace-nowrap text-[15px] font-semibold text-foreground">
            {eurFromCents(monthly)}
            <span className="font-normal text-muted">/mois</span>
          </span>
        </div>

        <p className="mt-6 text-[15px] font-semibold tracking-tight text-foreground">Besoin de plus d&apos;analyses ?</p>
        <label
          className={cn(
            "mt-3 flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition-all duration-300",
            addon ? "border-accent bg-accent-soft/50 shadow-[0_0_0_4px_rgba(217,108,63,0.10)]" : "border-border bg-card hover:border-foreground/25"
          )}
        >
          <input
            type="checkbox"
            checked={addon}
            onChange={(e) => onToggleAddon(e.target.checked)}
            disabled={loading}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40",
              addon ? "border-accent bg-accent text-white" : "border-foreground/25 bg-background text-transparent"
            )}
          >
            <Check size={13} strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-[15px] font-medium text-foreground">Ajouter {ADDON_PACK.credits} analyses supplémentaires</span>
              <span className="whitespace-nowrap text-[15px] font-semibold text-foreground">+{eurFromCents(pack)}</span>
            </span>
            <span className="mt-1 block text-[13.5px] leading-relaxed text-muted">
              {ADDON_PACK.credits} analyses en plus, disponibles jusqu&apos;à leur utilisation. Paiement unique, sans
              abonnement supplémentaire.
            </span>
          </span>
        </label>

        <dl className="mt-6 space-y-2 border-t border-border pt-5 text-[14px]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-semibold text-foreground">À payer aujourd&apos;hui</dt>
            <dd className="text-display text-[1.6rem] text-foreground" aria-live="polite">
              {eurFromCents(today)}
            </dd>
          </div>
          {addon && (
            <div className="flex items-baseline justify-between gap-4 text-muted">
              <dt>dont pack {ADDON_PACK.credits} analyses (une seule fois)</dt>
              <dd className="whitespace-nowrap">{eurFromCents(pack)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4 text-muted">
            <dt>Puis, chaque mois</dt>
            <dd className="whitespace-nowrap">{eurFromCents(monthly)}/mois</dd>
          </div>
        </dl>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-2">
          TVA incluse. {addon ? "Le pack est un achat unique : il n'est jamais refacturé. " : ""}Abonnement résiliable à
          tout moment.
        </p>

        {error && (
          <p className="mt-4 rounded-2xl border border-score-low/20 bg-score-low/[0.07] px-4 py-3 text-sm text-score-low">{error}</p>
        )}

        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="btn-sheen group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 text-base font-medium text-accent-foreground transition-all hover:bg-accent-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          {loading ? (
            "Redirection…"
          ) : (
            <>
              <span className="sm:hidden">Continuer — {eurFromCents(today)}</span>
              <span className="hidden sm:inline">Continuer vers le paiement — {eurFromCents(today)}</span>
            </>
          )}
          {!loading && <ArrowRight aria-hidden size={18} className="transition-transform duration-300 group-hover:translate-x-0.5" />}
        </button>
        <p className="mt-3 text-center text-[12.5px] text-muted-2">Paiement sécurisé par Stripe.</p>
      </div>
    </div>
  );
}
