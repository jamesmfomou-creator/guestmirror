"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Home, Loader2 } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { AnalysisValueMessages } from "./AnalysisValueMessages";
import { BenefitBubbles } from "./BenefitBubbles";
import { loaderImageUrl, type ListingPreview } from "@/lib/listingPreview";
import {
  DESCRIPTION_LINE_MS,
  MAX_GALLERY_PHOTOS,
  PHOTO_MS,
  nextPosition,
  phaseAt,
  phaseDurationMs,
  type ImmersivePhase,
  type SequenceInput,
  type SequencePosition,
} from "@/lib/immersiveSequence";

// "immersive" arm of the analysis loader experiment (lib/loaderExperiment.ts).
// A separate component on purpose: the control loaders (StepAnalyzing,
// AnalysisAhaFlow) stay untouched, so the control arm is exactly what ran
// before the experiment.
//
// Honesty rules this component follows:
//  - Only the visitor's own content is shown: photos from their listing on
//    Airbnb's CDN (or their own screenshots), their real title, lines from
//    their real description. Nothing is generated, rewritten or "improved".
//  - No percentage. The analysis is one request with no intermediate
//    progress, so steps that cannot be observed stay "en cours" until the
//    request really ends. Only what the browser itself can verify (listing
//    data received, photos loaded) is ever marked done earlier.
//  - Nothing holds the visitor back: the moment the analysis is done, a
//    short success beat plays and the caller redirects.
//  - No result content: nothing from the paid (or free) report is known here.

export type ListingPreviewState =
  | { status: "idle" } // no listing link (screenshots only)
  | { status: "loading" }
  | { status: "ready"; preview: ListingPreview }
  | { status: "unavailable" };

export interface VisualStartedInfo {
  first_element: "photo" | "title" | "description";
}

const FINALIZING_AT_MS = 53_000; // same threshold as StepAnalyzing, so analysis_progress_90 stays comparable
const REASSURANCE_AT_MS = 75_000;
const SUCCESS_BEAT_MS = 900;
const SUCCESS_BEAT_REDUCED_MS = 500;

interface Photo {
  key: string;
  src: string;
  fallback: string | null;
}

type StepStatus = "done" | "active" | "pending";

export function AnalysisImmersive({
  done,
  preview,
  screenshotUrls,
  onVisualStarted,
  onFinalizing,
  onTransitionEnd,
  startedAtMs,
  embedded = false,
}: {
  /**
   * Background onboarding: shown next to the questions instead of full page
   * (no page-height block, the title is not the page heading). Same content,
   * same sequence, same honesty rules. Defaults to the full-page loader.
   */
  embedded?: boolean;
  /** When the analysis really started (background onboarding: before this loader appeared). Defaults to mount time. */
  startedAtMs?: number;
  done: boolean;
  preview: ListingPreviewState;
  /** Local object URLs of the visitor's uploaded screenshots, if any. */
  screenshotUrls: string[];
  onVisualStarted?: (info: VisualStartedInfo) => void;
  /** Fires once at the same elapsed threshold as the control loaders. */
  onFinalizing?: () => void;
  /** Fires once, after the short success beat that follows `done`. */
  onTransitionEnd?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [elapsedMs, setElapsedMs] = useState(0);
  const firedFinalizing = useRef(false);
  const firedVisual = useRef(false);

  // ---- What is available to show ----------------------------------------
  const listing = preview.status === "ready" ? preview.preview : null;
  const photos: Photo[] = useMemo(() => {
    if (listing && listing.imageUrls.length > 0) {
      return listing.imageUrls.map((raw) => ({ key: raw, src: loaderImageUrl(raw), fallback: raw }));
    }
    return screenshotUrls.map((u) => ({ key: u, src: u, fallback: null }));
  }, [listing, screenshotUrls]);

  // Per-photo load state. A CDN-resized URL that fails falls back once to the
  // original; a photo that fails twice is skipped, never replaced.
  const [failures, setFailures] = useState<Record<string, "retry" | "dead">>({});
  const [loadedKeys, setLoadedKeys] = useState<Record<string, true>>({});
  // Only photos the browser has actually loaded are ever displayed, so a
  // broken frame never appears and nothing is requested twice.
  const livePhotos = photos.filter((p) => failures[p.key] !== "dead" && loadedKeys[p.key]);
  const allPhotosFailed = photos.length > 0 && photos.every((p) => failures[p.key] === "dead");
  const srcOf = (p: Photo) => (failures[p.key] === "retry" && p.fallback ? p.fallback : p.src);

  function handlePhotoLoad(p: Photo) {
    setLoadedKeys((prev) => (prev[p.key] ? prev : { ...prev, [p.key]: true }));
    if (!firedVisual.current) {
      firedVisual.current = true;
      onVisualStarted?.({ first_element: "photo" });
    }
  }

  function handlePhotoError(p: Photo) {
    setFailures((prev) => ({
      ...prev,
      [p.key]: !prev[p.key] && p.fallback && p.fallback !== p.src ? "retry" : "dead",
    }));
  }

  const title = listing?.title ?? null;
  const descriptionLines = listing?.descriptionLines ?? [];
  const fetching = preview.status === "loading" && photos.length === 0;

  // ---- Sequence ------------------------------------------------------------
  // Keyed on what was available when it started, so a photo failing later
  // does not restart the sequence (its turn shows another loaded photo). Only
  // if every photo fails does it restart, without the gallery.
  const input: SequenceInput = {
    photoCount: allPhotosFailed ? 0 : photos.length,
    hasTitle: title !== null,
    descriptionLineCount: descriptionLines.length,
  };
  const sequenceKey = `${preview.status}|${input.photoCount}|${input.hasTitle}|${input.descriptionLineCount}`;
  const [stored, setStored] = useState<SequencePosition & { key: string }>({ key: sequenceKey, cycle: 0, index: 0 });
  const position: SequencePosition = stored.key === sequenceKey ? stored : { cycle: 0, index: 0 };
  const phase = phaseAt(position, input);

  useEffect(() => {
    if (done || fetching) return;
    const t = setTimeout(
      () => setStored({ key: sequenceKey, ...nextPosition(position, input) }),
      phaseDurationMs(phase, input)
    );
    return () => clearTimeout(t);
    // position/input/phase are derived from these primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, fetching, sequenceKey, position.cycle, position.index]);

  // A title or description shown before any photo loaded is the first real element.
  useEffect(() => {
    if (firedVisual.current || done) return;
    if (phase.kind === "title" || phase.kind === "description") {
      firedVisual.current = true;
      onVisualStarted?.({ first_element: phase.kind });
    }
  }, [phase.kind, done, onVisualStarted]);

  // ---- Clock (reassurance + the finalizing event only) --------------------
  useEffect(() => {
    const start = startedAtMs ?? Date.now();
    const t = setInterval(() => setElapsedMs(Date.now() - start), 1000);
    return () => clearInterval(t);
  }, [startedAtMs]);

  useEffect(() => {
    if (!done && elapsedMs >= FINALIZING_AT_MS && !firedFinalizing.current) {
      firedFinalizing.current = true;
      onFinalizing?.();
    }
  }, [done, elapsedMs, onFinalizing]);

  // ---- Real completion: short success beat, then hand off -----------------
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => onTransitionEnd?.(), reduceMotion ? SUCCESS_BEAT_REDUCED_MS : SUCCESS_BEAT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // ---- Steps: only what the browser can verify is ever "done" early -------
  const steps: { label: string; status: StepStatus }[] = [];
  if (preview.status === "idle") {
    steps.push({ label: "Captures prêtes", status: "done" });
  } else if (preview.status === "ready") {
    steps.push({ label: "Informations de l'annonce récupérées", status: "done" });
  } else {
    steps.push({ label: "Récupération des informations de l'annonce", status: done ? "done" : "active" });
  }
  if (photos.length > 0) {
    const anyLoaded = Object.keys(loadedKeys).length > 0;
    steps.push({ label: anyLoaded ? "Photos chargées" : "Chargement des photos", status: anyLoaded || done ? "done" : "active" });
  }
  steps.push({ label: "Examen du titre et de la description", status: done ? "done" : "active" });
  steps.push({ label: "Analyse IA", status: done ? "done" : "active" });
  steps.push({ label: "Préparation du diagnostic", status: done ? "done" : "pending" });

  const showReassurance = !done && elapsedMs >= REASSURANCE_AT_MS;

  return (
    <div className={`animate-fade-up flex flex-col items-center text-center ${embedded ? "" : "min-h-[70vh] pt-2"}`}>
      {embedded ? (
        <p className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {BRAND_NAME} analyse ton annonce…
        </p>
      ) : (
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {BRAND_NAME} analyse ton annonce…
        </h1>
      )}
      <p className="mt-2 max-w-sm text-sm text-muted sm:text-base">
        Découvre comment ton annonce se présente aux voyageurs.
      </p>
      {/* An honest expectation instead of a progress percentage: measured
          analyses take about a minute (server total ~56-61 s). */}
      {!done && <p className="mt-1.5 text-xs text-muted-2">Ça prend environ une minute.</p>}

      <div className={`${done ? "mt-7" : "mt-3"} w-full`}>
        {done ? (
          <SuccessBeat
            photo={livePhotos[0] ? srcOf(livePhotos[0]) : null}
            reduceMotion={reduceMotion}
            label={embedded ? "Analyse terminée." : "Ton diagnostic est prêt."}
          />
        ) : (
          // Benefit reminders above / below the card while the analysis runs
          // (one at a time, fixed bands: nothing covered). Gone once done.
          <BenefitBubbles>
            {fetching ? (
              <FetchingCard reduceMotion={reduceMotion} />
            ) : (
              <Stage
                phase={phase}
                photos={photos}
                livePhotos={livePhotos}
                srcOf={srcOf}
                title={title}
                descriptionLines={descriptionLines}
                fromScreenshots={preview.status === "idle"}
                unavailable={(preview.status === "unavailable" && photos.length === 0) || allPhotosFailed}
                photosPending={photos.length > 0 && livePhotos.length === 0 && !allPhotosFailed}
                loadingPhotos={photos.filter((p) => failures[p.key] !== "dead")}
                reduceMotion={reduceMotion}
                onPhotoLoad={handlePhotoLoad}
                onPhotoError={handlePhotoError}
              />
            )}
          </BenefitBubbles>
        )}
      </div>

      <ol className={`${done ? "mt-7" : "mt-3"} w-full max-w-sm space-y-2 text-left`} aria-label="Étapes de l'analyse">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <StepIcon status={s.status} />
            <span className={s.status === "pending" ? "text-muted-2" : s.status === "done" ? "text-foreground" : "text-foreground"}>
              {s.label}
            </span>
            {s.status === "active" && <span className="ml-auto text-xs text-muted">en cours</span>}
          </li>
        ))}
      </ol>

      {/* Journey goal_value_v1: what is being looked at and why -- an
          explanation, not progress (no check, no "terminé"). Gone once done. */}
      {!done && <AnalysisValueMessages className="mt-6" />}

      {showReassurance && (
        <p className="animate-fade-up mt-6 max-w-xs text-sm text-muted-2" role="status">
          Ton analyse prend un peu plus de temps que d&apos;habitude, mais elle est toujours en cours.
        </p>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-score-high/15">
        <Check size={12} className="text-score-high" />
      </span>
    );
  }
  if (status === "active") return <Loader2 size={18} className="shrink-0 animate-spin text-accent" aria-hidden />;
  return <span className="h-5 w-5 shrink-0 rounded-full border border-border" aria-hidden />;
}

// ---- Stage ------------------------------------------------------------------

function PhaseLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-hover"
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
      {children}
    </span>
  );
}

export function ScanLine({ reduceMotion, durationS }: { reduceMotion: boolean; durationS: number }) {
  if (reduceMotion) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-accent/25 to-transparent"
      initial={{ top: "-15%" }}
      animate={{ top: "100%" }}
      transition={{ duration: durationS, ease: "easeInOut" }}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-accent/70" />
    </motion.div>
  );
}

export function Corners() {
  const c = "absolute h-5 w-5 border-accent";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-3">
      <span className={`${c} left-0 top-0 rounded-tl-md border-l-2 border-t-2`} />
      <span className={`${c} right-0 top-0 rounded-tr-md border-r-2 border-t-2`} />
      <span className={`${c} bottom-0 left-0 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${c} bottom-0 right-0 rounded-br-md border-b-2 border-r-2`} />
    </div>
  );
}

function Stage({
  phase,
  photos,
  livePhotos,
  srcOf,
  title,
  descriptionLines,
  fromScreenshots,
  unavailable,
  photosPending,
  loadingPhotos,
  reduceMotion,
  onPhotoLoad,
  onPhotoError,
}: {
  photosPending: boolean;
  /** Photos still worth loading: a photo that failed twice is never requested again. */
  loadingPhotos: Photo[];
  phase: ImmersivePhase;
  photos: Photo[];
  livePhotos: Photo[];
  srcOf: (p: Photo) => string;
  title: string | null;
  descriptionLines: string[];
  fromScreenshots: boolean;
  unavailable: boolean;
  reduceMotion: boolean;
  onPhotoLoad: (p: Photo) => void;
  onPhotoError: (p: Photo) => void;
}) {
  const fade = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };
  const stageKey = phase.kind === "photo" ? `photo-${phase.index}` : phase.kind;
  // Every photo stays mounted (hidden) so it loads once and its load/error is
  // known even before its turn: the gallery then never shows a broken frame.
  const galleryPhoto = phase.kind === "photo" ? photos[phase.index] : null;
  const galleryLive = galleryPhoto && livePhotos.includes(galleryPhoto) ? galleryPhoto : livePhotos[0] ?? null;

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="hidden" aria-hidden>
        {loadingPhotos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${p.key}-${srcOf(p)}`}
            src={srcOf(p)}
            alt=""
            referrerPolicy="no-referrer"
            onLoad={() => onPhotoLoad(p)}
            onError={() => onPhotoError(p)}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={stageKey} {...fade} transition={{ duration: reduceMotion ? 0.2 : 0.45 }}>
          {phase.kind === "photo" && galleryLive && (
            <div>
              <PhaseLabel>Analyse des photos</PhaseLabel>
              <div className="relative mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-background-alt shadow-[0_20px_50px_-28px_rgba(28,26,23,0.45)]">
                <motion.img
                  src={srcOf(galleryLive)}
                  alt={`Photo ${photos.indexOf(galleryLive) + 1} de ton annonce`}
                  referrerPolicy="no-referrer"
                  className="aspect-[4/3] w-full object-cover"
                  initial={reduceMotion ? false : { scale: 1 }}
                  animate={reduceMotion ? undefined : { scale: 1.05 }}
                  transition={{ duration: PHOTO_MS / 1000, ease: "linear" }}
                />
                <Corners />
                <ScanLine reduceMotion={reduceMotion} durationS={(PHOTO_MS / 1000) * 0.8} />
              </div>
              <Thumbnails photos={photos} livePhotos={livePhotos} current={galleryLive} srcOf={srcOf} />
            </div>
          )}

          {phase.kind === "photo" && !galleryLive &&
            (photosPending ? (
              <FetchingCard reduceMotion={reduceMotion} label="Chargement des photos…" />
            ) : (
              <NoListingCard unavailable={unavailable} fromScreenshots={fromScreenshots} reduceMotion={reduceMotion} />
            ))}

          {phase.kind === "title" && title && (
            <div>
              <PhaseLabel>Analyse du titre en cours…</PhaseLabel>
              <div className="card relative mt-4 overflow-hidden px-6 py-7 text-left">
                {/* Reading sweep, drawn behind the text so it never washes it out. */}
                {!reduceMotion && (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-accent-soft to-transparent"
                    initial={{ left: "-35%" }}
                    animate={{ left: "110%" }}
                    transition={{ duration: 1.6, delay: 2.4, ease: "easeInOut" }}
                  />
                )}
                <div className="relative">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-2">Titre de ton annonce</p>
                  <TypedTitle title={title} reduceMotion={reduceMotion} />
                </div>
              </div>
            </div>
          )}

          {phase.kind === "description" && descriptionLines.length > 0 && (
            <div>
              <PhaseLabel>Analyse de la description</PhaseLabel>
              <div className="card mt-4 space-y-2 px-5 py-6 text-left">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-2">Extrait de ta description</p>
                {descriptionLines.map((line, i) => (
                  <motion.p
                    key={i}
                    className="rounded-lg border-l-2 border-transparent px-3 py-1.5 text-sm leading-relaxed text-foreground"
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0.3 }}
                    animate={
                      reduceMotion
                        ? { opacity: 1 }
                        : {
                            opacity: [0.3, 1, 1],
                            backgroundColor: ["rgba(251,233,223,0)", "rgba(251,233,223,1)", "rgba(251,233,223,0)"],
                            borderLeftColor: ["rgba(217,103,63,0)", "rgba(217,103,63,1)", "rgba(217,103,63,0.25)"],
                          }
                    }
                    transition={{ duration: DESCRIPTION_LINE_MS / 1000 + 0.4, delay: (i * DESCRIPTION_LINE_MS) / 1000, times: [0, 0.35, 1] }}
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
            </div>
          )}

          {phase.kind === "overview" && livePhotos.length > 0 && (
            <div>
              <PhaseLabel>Vue d&apos;ensemble de ton annonce</PhaseLabel>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {livePhotos.slice(0, MAX_GALLERY_PHOTOS).map((p, i) => (
                  <motion.div
                    key={p.key}
                    className="relative overflow-hidden rounded-[var(--radius-sm)] border-2 border-transparent"
                    animate={reduceMotion ? undefined : { borderColor: ["rgba(217,103,63,0)", "rgba(217,103,63,1)", "rgba(217,103,63,0)"] }}
                    transition={{ duration: 1.1, delay: i * 0.9 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={srcOf(p)} alt="" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" />
                  </motion.div>
                ))}
              </div>
              {title && <p className="mt-4 line-clamp-2 text-sm font-medium text-foreground">{title}</p>}
            </div>
          )}

          {(phase.kind === "ai" || (phase.kind === "overview" && livePhotos.length === 0)) && (
            <AiCard
              livePhotos={livePhotos}
              srcOf={srcOf}
              title={title}
              fromScreenshots={fromScreenshots}
              unavailable={unavailable}
              reduceMotion={reduceMotion}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Thumbnails({
  photos,
  livePhotos,
  current,
  srcOf,
}: {
  photos: Photo[];
  livePhotos: Photo[];
  current: Photo;
  srcOf: (p: Photo) => string;
}) {
  if (livePhotos.length < 2) return null;
  return (
    <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
      {photos.slice(0, MAX_GALLERY_PHOTOS).map((p) =>
        livePhotos.includes(p) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.key}
            src={srcOf(p)}
            alt=""
            referrerPolicy="no-referrer"
            className={`h-10 w-12 rounded-md object-cover transition-all duration-300 ${
              p === current ? "opacity-100 ring-2 ring-accent ring-offset-2 ring-offset-background" : "opacity-45"
            }`}
          />
        ) : null
      )}
    </div>
  );
}

function TypedTitle({ title, reduceMotion }: { title: string; reduceMotion: boolean }) {
  if (reduceMotion) {
    return <p className="mt-2 line-clamp-3 text-xl font-semibold leading-snug text-foreground">{title}</p>;
  }
  // Typed in at most ~2.2 s whatever its length.
  const perChar = Math.min(0.035, 2.2 / Math.max(1, title.length));
  return (
    <p className="mt-2 line-clamp-3 text-xl font-semibold leading-snug text-foreground" aria-label={title}>
      {Array.from(title).map((ch, i) => (
        <motion.span key={i} aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * perChar, duration: 0.05 }}>
          {ch}
        </motion.span>
      ))}
      <motion.span
        aria-hidden
        className="ml-0.5 inline-block h-5 w-0.5 translate-y-0.5 bg-accent"
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.9, repeat: Infinity }}
      />
    </p>
  );
}

function AiCard({
  livePhotos,
  srcOf,
  title,
  fromScreenshots,
  unavailable,
  reduceMotion,
}: {
  livePhotos: Photo[];
  srcOf: (p: Photo) => string;
  title: string | null;
  fromScreenshots: boolean;
  unavailable: boolean;
  reduceMotion: boolean;
}) {
  if (livePhotos.length === 0 && !title) {
    return <NoListingCard unavailable={unavailable} fromScreenshots={fromScreenshots} reduceMotion={reduceMotion} />;
  }
  return (
    <div>
      <PhaseLabel>Analyse IA en cours</PhaseLabel>
      <div className="card relative mt-4 overflow-hidden p-4 text-left">
        <div className="flex gap-4">
          {livePhotos[0] && (
            <div className="relative w-28 shrink-0 overflow-hidden rounded-[var(--radius-sm)] sm:w-36">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={srcOf(livePhotos[0])} alt="" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
              {!reduceMotion && (
                <motion.div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 0.8 }}
                />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {title && <p className="line-clamp-2 text-sm font-semibold text-foreground">{title}</p>}
            <div className="mt-3 space-y-2" aria-hidden>
              {[0.9, 0.7, 0.8].map((w, i) => (
                <motion.div
                  key={i}
                  className="h-2 rounded-full bg-background-alt"
                  style={{ width: `${w * 100}%` }}
                  animate={reduceMotion ? undefined : { opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.25 }}
                />
              ))}
            </div>
          </div>
        </div>
        {livePhotos.length > 1 && (
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {livePhotos.slice(1, MAX_GALLERY_PHOTOS).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.key} src={srcOf(p)} alt="" referrerPolicy="no-referrer" className="h-9 w-11 rounded-md object-cover opacity-70" />
            ))}
          </div>
        )}
      </div>
      <p className="mx-auto mt-4 max-w-sm text-sm text-muted">
        {fromScreenshots
          ? "L'IA examine tes captures : tes photos, ton titre et ta description, tels qu'un voyageur les découvre."
          : "L'IA examine tes photos, ton titre et ta description, tels qu'un voyageur les découvre."}
      </p>
    </div>
  );
}

function NoListingCard({
  unavailable,
  fromScreenshots,
  reduceMotion,
}: {
  unavailable: boolean;
  fromScreenshots: boolean;
  reduceMotion: boolean;
}) {
  return (
    <div>
      <PhaseLabel>Analyse IA en cours</PhaseLabel>
      <div className="card relative mt-4 flex h-44 items-center justify-center overflow-hidden">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft">
          <Home size={30} className="text-accent" aria-hidden />
        </span>
        <ScanLine reduceMotion={reduceMotion} durationS={2.4} />
      </div>
      <p className="mx-auto mt-4 max-w-sm text-sm text-muted">
        {unavailable
          ? "Ton annonce n'a pas pu être affichée ici, mais l'analyse continue."
          : fromScreenshots
            ? "L'IA examine tes captures."
            : "L'IA examine ton annonce."}
      </p>
    </div>
  );
}

function FetchingCard({ reduceMotion, label = "Récupération de ton annonce…" }: { reduceMotion: boolean; label?: string }) {
  return (
    <div>
      <PhaseLabel>{label}</PhaseLabel>
      <div className="card relative mt-4 overflow-hidden p-4 text-left" aria-hidden>
        <div className="aspect-[4/3] w-full rounded-[var(--radius-sm)] bg-background-alt" />
        <div className="mt-4 h-3 w-3/4 rounded-full bg-background-alt" />
        <div className="mt-2 h-3 w-1/2 rounded-full bg-background-alt" />
        {!reduceMotion && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        )}
      </div>
    </div>
  );
}

function SuccessBeat({ photo, reduceMotion, label }: { photo: string | null; reduceMotion: boolean; label: string }) {
  return (
    <motion.div
      className="flex flex-col items-center"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      role="status"
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          referrerPolicy="no-referrer"
          className="aspect-[4/3] w-full max-w-[220px] rounded-[var(--radius-md)] border border-border object-cover"
        />
      )}
      <span className="mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-score-high/10">
        <Check size={24} className="text-score-high" />
      </span>
      <p className="mt-3 text-lg font-semibold text-foreground">{label}</p>
    </motion.div>
  );
}
