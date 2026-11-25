"use client";

import { useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { Check, MapPin, Sparkles } from "lucide-react";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";
import { showOffers } from "@/lib/showOffers";
import type { ListingMakeover as Makeover, MakeoverSide } from "@/lib/listingMakeover";

// Free result, makeover_v1: the visitor's own listing "Avant" and "Après".
// Receives only what buildListingMakeover() returned (plain strings, real
// photos of this listing, booleans). A simulation, said as such on the card:
// nothing is published, no score or result is projected. The button opens the
// three existing offers (lib/showOffers.ts): no new checkout, no price here.

type Side = "before" | "after";

export function ListingMakeover({
  makeover,
  analysisId,
  showOffersButton = true,
}: {
  makeover: Makeover;
  analysisId: string;
  /** false when a Conciergerie credit unlocks the report instead (no paywall on the page). */
  showOffersButton?: boolean;
}) {
  const [side, setSide] = useState<Side>("after");
  const touchX = useRef<number | null>(null);
  const ref = useInViewOnce<HTMLElement>(() => {
    track("listing_preview_viewed", {
      analysisId,
      title_changed: makeover.titleChanged,
      cover_changed: makeover.coverChanged,
      text_changed: makeover.textChanged,
      changes: makeover.changes.length,
    });
  }, 0.25);

  function choose(next: Side) {
    if (next === side) return;
    setSide(next);
    track("listing_preview_toggled", { analysisId, to: next });
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") choose("before");
    if (e.key === "ArrowRight") choose("after");
  }

  // Swipe on the card: left = Après, right = Avant (buttons stay the main control).
  function onTouchStart(e: TouchEvent) {
    touchX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touchX.current;
    touchX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start == null || end == null || Math.abs(end - start) < 45) return;
    choose(end < start ? "after" : "before");
  }

  function onCta() {
    track("listing_preview_cta_clicked", { analysisId });
    track("unlock_cta_clicked", { analysisId, source: "listing_preview" });
    showOffers();
  }

  return (
    <section ref={ref} className="animate-fade-up mx-auto mt-12 max-w-xl text-left" aria-labelledby="makeover-title">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-accent-hover">
        <Sparkles aria-hidden size={13} /> Aperçu personnalisé
      </p>
      <h2 id="makeover-title" className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-foreground sm:text-[30px]">
        Et si ton annonce ressemblait à ça ? ✨
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        Découvre comment GuestMirror pourrait rendre ton annonce plus claire, attractive et convaincante.
      </p>

      {/* Avant / Après switch */}
      <div
        role="group"
        aria-label="Comparer ton annonce actuelle et la version optimisée"
        onKeyDown={onKey}
        className="relative mt-6 grid grid-cols-2 rounded-full border border-border bg-background-alt p-1"
      >
        <span
          aria-hidden
          className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full shadow-sm transition-[transform,background-color] duration-300 ease-out motion-reduce:transition-none ${
            side === "after" ? "translate-x-full bg-accent" : "translate-x-0 bg-card"
          }`}
        />
        {(["before", "after"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => choose(s)}
            className={`relative z-10 min-h-11 rounded-full px-3 text-[14.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              side === s ? (s === "after" ? "text-accent-foreground" : "text-foreground") : "text-muted"
            }`}
          >
            {s === "before" ? "Avant" : "Après ✨"}
          </button>
        ))}
      </div>

      {/* Both cards share one grid cell: the height never jumps when switching. */}
      <div className="mt-4 grid" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <ListingCard side="before" data={makeover.before} makeover={makeover} active={side === "before"} />
        <ListingCard side="after" data={makeover.after} makeover={makeover} active={side === "after"} />
      </div>
      <p className="mt-3 text-center text-[12.5px] text-muted-2">
        Simulation non publiée : rien n&apos;est modifié sur ton annonce Airbnb.
      </p>

      <p className="mt-8 text-[17px] font-semibold leading-snug tracking-tight text-foreground">
        Voici à quoi ton annonce pourrait ressembler après optimisation. ✨
      </p>
      {makeover.changes.length > 0 && (
        <div className="card mt-4 p-5 sm:p-6">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-2">Voici ce que GuestMirror a amélioré</h3>
          <ul className="mt-3 space-y-3.5">
            {makeover.changes.map((c) => (
              <li key={c.kind} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-score-high/15">
                  <Check aria-hidden size={12} className="text-score-high" />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-foreground">{c.label}</span>
                  {c.detail && <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-[var(--radius-lg)] border border-accent/25 bg-accent-soft/60 p-5 sm:p-6">
        <p className="text-[17px] font-semibold tracking-tight text-foreground">Ton annonce peut aller encore plus loin.</p>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
          Débloque ton plan d&apos;action complet pour découvrir les optimisations détaillées, les recommandations photo et
          les textes prêts à utiliser.
        </p>
        {showOffersButton && (
          <>
            <button
              type="button"
              onClick={onCta}
              className="btn-sheen mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Obtenir mon annonce optimisée
            </button>
            <p className="mt-2.5 text-center text-[12.5px] text-muted-2">
              Tu choisis ta formule juste en dessous, avant tout paiement. Tu appliques ensuite les changements toi-même sur
              Airbnb.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function ListingCard({
  side,
  data,
  makeover,
  active,
}: {
  side: Side;
  data: MakeoverSide;
  makeover: Makeover;
  active: boolean;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const after = side === "after";
  const photo = !photoFailed ? data.photoUrl : null;

  return (
    <article
      aria-hidden={!active}
      inert={!active}
      aria-label={after ? "Ton annonce optimisée par GuestMirror (simulation)" : "Ton annonce actuelle"}
      className={`[grid-area:1/1] overflow-hidden rounded-[var(--radius-lg)] border bg-card shadow-[0_22px_50px_-32px_rgba(28,26,23,0.45)] transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
        after ? "border-accent/35" : "border-border"
      } ${active ? "opacity-100" : "pointer-events-none scale-[0.985] opacity-0"}`}
    >
      {photo && (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-background-alt sm:aspect-[16/10]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt={after ? "Photo de ton annonce proposée en couverture" : "Photo de couverture actuelle de ton annonce"}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setPhotoFailed(true)}
          />
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11.5px] font-semibold text-foreground shadow-sm backdrop-blur">
            {after ? "Optimisée par GuestMirror" : "Ton annonce actuelle"}
          </span>
          {after && makeover.coverChanged && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-foreground shadow-sm">
              <Sparkles aria-hidden size={11} /> Nouvelle couverture
            </span>
          )}
        </div>
      )}
      <div className="p-5">
        {!photo && (
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-2">
            {after ? "Optimisée par GuestMirror" : "Ton annonce actuelle"}
          </p>
        )}
        {makeover.city && (
          <p className="flex items-center gap-1 text-[13px] text-muted">
            <MapPin aria-hidden size={13} /> {makeover.city}
          </p>
        )}
        {data.title && (
          <div className="mt-1.5">
            {after && makeover.titleChanged && <NewTag>Nouveau titre</NewTag>}
            {after && makeover.titleKept && <NewTag>Titre déjà efficace, conservé</NewTag>}
            <p className="mt-1 text-[18px] font-semibold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere]">
              {data.title}
            </p>
          </div>
        )}
        {data.text && (
          <div className="mt-3">
            {after && makeover.textChanged && <NewTag>Nouvelle accroche</NewTag>}
            <p className="mt-1 text-[14.5px] leading-relaxed text-muted [overflow-wrap:anywhere]">{data.text}</p>
          </div>
        )}
        {!after && !data.text && makeover.textChanged && (
          <p className="mt-3 text-[13px] italic text-muted-2">Ta description actuelle n&apos;est pas reprise ici.</p>
        )}
      </div>
    </article>
  );
}

function NewTag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-semibold text-accent-hover">
      <Sparkles aria-hidden size={11} />
      {children}
    </span>
  );
}
