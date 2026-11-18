"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, Images, Loader2, MapPin } from "lucide-react";
import { loaderImageUrl } from "@/lib/listingPreview";
import { MAX_GALLERY_PHOTOS, PHOTO_MS } from "@/lib/immersiveSequence";
import { Corners, ScanLine, type ListingPreviewState } from "./AnalysisImmersive";

// The analysis, shown next to the onboarding questions while it runs
// (background onboarding, lib/onboardingExperiment.ts): the listing's real
// photos go by one after another under the same scan as the immersive loader
// (each photo, a scan line, a slow zoom, the thumbnails), then its title and
// city, then the states the browser really knows.
//
// Same honesty rules as the immersive loader: only the visitor's own
// content (their listing's photos, title and city from /api/listing-preview,
// or their own screenshots) and only real states -- the listing was found,
// the analysis request is running, it is ready, it failed. The photo scan is
// what is being looked at, paced for display; no percentage, no timer, no
// invented step. A photo that fails to load is skipped, never replaced.

export type LiveState = "running" | "ready" | "failed";

interface Photo {
  key: string;
  src: string;
  fallback: string | null;
}

export function AnalysisLiveCard({
  preview,
  screenshotUrls,
  state,
}: {
  preview: ListingPreviewState;
  screenshotUrls: string[];
  state: LiveState;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const listing = preview.status === "ready" ? preview.preview : null;
  const fromScreenshots = preview.status === "idle";

  const photos: Photo[] = useMemo(
    () =>
      listing && listing.imageUrls.length > 0
        ? listing.imageUrls.slice(0, MAX_GALLERY_PHOTOS).map((raw) => ({ key: raw, src: loaderImageUrl(raw), fallback: raw }))
        : screenshotUrls.slice(0, MAX_GALLERY_PHOTOS).map((u) => ({ key: u, src: u, fallback: null })),
    [listing, screenshotUrls]
  );
  // A resized CDN photo that fails falls back once to the original; failing twice, it is skipped.
  const [failures, setFailures] = useState<Record<string, "retry" | "dead">>({});
  const live = photos.filter((p) => failures[p.key] !== "dead");
  const srcOf = (p: Photo) => (failures[p.key] === "retry" && p.fallback ? p.fallback : p.src);
  const onError = (p: Photo) =>
    setFailures((prev) => ({ ...prev, [p.key]: !prev[p.key] && p.fallback && p.fallback !== p.src ? "retry" : "dead" }));

  // One photo after another while the analysis runs; the last one shown stays once it is done.
  const [tick, setTick] = useState(0);
  const scanning = state === "running" && live.length > 0;
  useEffect(() => {
    if (!scanning || live.length < 2) return;
    const t = setInterval(() => setTick((i) => i + 1), PHOTO_MS);
    return () => clearInterval(t);
  }, [scanning, live.length]);
  const current = live.length > 0 ? live[tick % live.length] : null;

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
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[0_24px_60px_-34px_rgba(28,26,23,0.45)]">
      {current ? (
        <div className="relative aspect-[16/10] overflow-hidden bg-background-alt lg:aspect-[4/3]">
          <AnimatePresence initial={false}>
            <motion.img
              key={`${current.key}-${tick}`}
              src={srcOf(current)}
              alt={fromScreenshots ? "Ta capture, en cours d'analyse" : "Photo de ton annonce, en cours d'analyse"}
              referrerPolicy="no-referrer"
              onError={() => onError(current)}
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0, scale: 1 }}
              animate={reduceMotion || !scanning ? { opacity: 1 } : { opacity: 1, scale: 1.05 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: reduceMotion ? 0.2 : 0.45 }, scale: { duration: PHOTO_MS / 1000, ease: "linear" } }}
            />
          </AnimatePresence>
          {scanning && (
            <>
              <Corners />
              <ScanLine key={`scan-${tick}`} reduceMotion={reduceMotion} durationS={(PHOTO_MS / 1000) * 0.8} />
            </>
          )}
          <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-accent-hover backdrop-blur">
            {state === "ready" ? (
              <>
                <Check size={12} aria-hidden className="text-score-high" />
                Diagnostic prêt
              </>
            ) : state === "failed" ? (
              "Analyse interrompue"
            ) : (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
                Analyse des photos
              </>
            )}
          </span>
        </div>
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center bg-background-alt text-muted-2 lg:aspect-[4/3]">
          <Images size={28} aria-hidden />
        </div>
      )}

      {live.length > 1 && (
        <div className="flex gap-1.5 px-4 pt-3" aria-hidden>
          {live.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.key}
              src={srcOf(p)}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => onError(p)}
              className={`h-10 w-12 rounded-md object-cover transition-all duration-300 ${
                p === current ? "opacity-100 ring-2 ring-accent ring-offset-2 ring-offset-card" : "opacity-45"
              }`}
            />
          ))}
        </div>
      )}

      <div className="px-4 pb-1 pt-3.5 text-left sm:px-5">
        <p className="label-mono text-muted-2">{state === "ready" ? "Diagnostic prêt" : "Analyse de ton annonce"}</p>
        {listing?.title ? (
          <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-foreground lg:text-base">{listing.title}</p>
        ) : (
          <p className="mt-1 text-[14px] text-muted">{fromScreenshots ? "À partir de tes captures" : "Ton annonce Airbnb"}</p>
        )}
        {listing?.city && (
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
            <MapPin aria-hidden size={12} className="shrink-0" />
            {listing.city}
          </p>
        )}
      </div>
      <ol className="mt-2 space-y-1.5 border-t border-border px-4 py-3 text-left sm:px-5" aria-label="État de l'analyse">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-[13.5px]">
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
