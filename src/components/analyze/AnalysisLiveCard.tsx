"use client";

import { AlertCircle, Check, Images, Loader2, MapPin } from "lucide-react";
import { loaderImageUrl } from "@/lib/listingPreview";
import type { ListingPreviewState } from "./AnalysisImmersive";

// Compact view of the analysis while the visitor answers the onboarding
// questions (background onboarding, lib/onboardingExperiment.ts).
//
// Same honesty rules as the immersive loader: only the visitor's own
// content (their listing's photo, title and city from /api/listing-preview,
// or their own screenshots) and only states the browser really knows -- the
// listing was found, the analysis request is running, it is ready, it
// failed. No percentage, no timer, no invented step.

export type LiveState = "running" | "ready" | "failed";

export function AnalysisLiveCard({
  preview,
  screenshotUrls,
  state,
}: {
  preview: ListingPreviewState;
  screenshotUrls: string[];
  state: LiveState;
}) {
  const listing = preview.status === "ready" ? preview.preview : null;
  const photo = listing?.imageUrls[0] ? loaderImageUrl(listing.imageUrls[0]) : screenshotUrls[0] ?? null;
  const fromScreenshots = preview.status === "idle";

  const rows: { label: string; status: "done" | "active" | "pending" | "error" }[] = [
    fromScreenshots
      ? { label: `${screenshotUrls.length} capture${screenshotUrls.length > 1 ? "s" : ""} reçue${screenshotUrls.length > 1 ? "s" : ""}`, status: "done" }
      : listing
        ? { label: "Annonce retrouvée", status: "done" }
        : { label: "Récupération de ton annonce", status: state === "running" ? "active" : state === "ready" ? "done" : "pending" },
    { label: "Analyse IA", status: state === "running" ? "active" : state === "ready" ? "done" : "error" },
    { label: "Ton diagnostic", status: state === "ready" ? "done" : "pending" },
  ];

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[0_18px_40px_-30px_rgba(28,26,23,0.35)]">
      <div className="flex items-center gap-3.5 p-4">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={fromScreenshots ? "Ta première capture" : "Photo principale de ton annonce"}
            referrerPolicy="no-referrer"
            className="h-14 w-[72px] shrink-0 rounded-xl border border-border object-cover lg:h-16 lg:w-20"
          />
        ) : (
          <span className="flex h-14 w-[72px] shrink-0 items-center justify-center rounded-xl border border-border bg-background-alt text-muted-2 lg:h-16 lg:w-20">
            <Images size={20} aria-hidden />
          </span>
        )}
        <div className="min-w-0 text-left">
          <p className="label-mono text-muted-2">{state === "ready" ? "Diagnostic prêt" : "Analyse de ton annonce"}</p>
          {listing?.title ? (
            <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">{listing.title}</p>
          ) : (
            <p className="mt-0.5 text-[14px] text-muted">{fromScreenshots ? "À partir de tes captures" : "Ton annonce Airbnb"}</p>
          )}
          {listing?.city && (
            <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted">
              <MapPin aria-hidden size={12} className="shrink-0" />
              {listing.city}
            </p>
          )}
        </div>
      </div>
      <ol className="space-y-1.5 border-t border-border px-4 py-3 text-left" aria-label="État de l'analyse">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-[13px]">
            <RowIcon status={r.status} />
            <span className={r.status === "pending" ? "text-muted-2" : "text-foreground"}>{r.label}</span>
            {r.status === "active" && <span className="ml-auto text-[11.5px] text-muted">en cours</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function RowIcon({ status }: { status: "done" | "active" | "pending" | "error" }) {
  if (status === "done") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-score-high/15">
        <Check size={10} className="text-score-high" />
      </span>
    );
  }
  if (status === "active") return <Loader2 size={15} className="shrink-0 animate-spin text-accent" aria-hidden />;
  if (status === "error") return <AlertCircle size={15} className="shrink-0 text-score-low" aria-hidden />;
  return <span className="h-4 w-4 shrink-0 rounded-full border border-border" aria-hidden />;
}

/**
 * The identified listing on the email step (background onboarding only):
 * the visitor confirms it simply by continuing. Nothing is shown that was
 * not found -- screenshots stay screenshots, an unavailable preview says so.
 */
export function ListingConfirmCard({
  preview,
  screenshotUrls,
  onEdit,
}: {
  preview: ListingPreviewState;
  screenshotUrls: string[];
  onEdit: () => void;
}) {
  const listing = preview.status === "ready" ? preview.preview : null;
  const edit = (label: string) => (
    <button type="button" onClick={onEdit} className="font-semibold text-accent-hover underline underline-offset-2">
      {label}
    </button>
  );

  if (preview.status === "idle") {
    return (
      <div className="mt-7 rounded-[var(--radius-lg)] border border-border bg-card p-4 text-left">
        <p className="label-mono text-muted-2">Tes captures</p>
        <div className="mt-3 flex gap-2">
          {screenshotUrls.slice(0, 5).map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt={i === 0 ? "Ta première capture" : ""} className="h-12 w-12 rounded-lg border border-border object-cover" />
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">
          {screenshotUrls.length} capture{screenshotUrls.length > 1 ? "s" : ""} prête{screenshotUrls.length > 1 ? "s" : ""} pour l&apos;analyse. {edit("Modifier")}
        </p>
      </div>
    );
  }

  if (preview.status === "loading") {
    return (
      <div className="mt-7 flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border bg-card p-4 text-left" aria-busy="true">
        <span className="h-14 w-[72px] shrink-0 animate-pulse rounded-xl bg-background-alt" />
        <div className="min-w-0 flex-1">
          <p className="label-mono text-muted-2">Ton annonce</p>
          <p className="mt-1 text-[14px] text-muted">On retrouve ton annonce…</p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mt-7 rounded-[var(--radius-lg)] border border-border bg-card p-4 text-left">
        <p className="label-mono text-muted-2">Ton annonce</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          On n&apos;a pas pu afficher l&apos;aperçu de ton annonce. Vérifie ton lien, ou continue : on la récupère à nouveau pendant
          l&apos;analyse. {edit("Modifier le lien")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-7 rounded-[var(--radius-lg)] border border-border bg-card p-4 text-left">
      <div className="flex items-center gap-3.5">
        {listing.imageUrls[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={loaderImageUrl(listing.imageUrls[0])}
            alt="Photo principale de ton annonce"
            referrerPolicy="no-referrer"
            className="h-14 w-[72px] shrink-0 rounded-xl border border-border object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="label-mono text-muted-2">Ton annonce</p>
          {listing.title ? (
            <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">{listing.title}</p>
          ) : (
            <p className="mt-0.5 text-[14px] text-muted">Annonce Airbnb</p>
          )}
          {listing.city && (
            <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted">
              <MapPin aria-hidden size={12} className="shrink-0" />
              {listing.city}
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-[13px] text-muted">C&apos;est bien ton annonce ? Sinon, {edit("modifie le lien")}.</p>
    </div>
  );
}
