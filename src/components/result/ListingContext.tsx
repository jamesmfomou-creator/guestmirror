import { MapPin, Target } from "lucide-react";

// Top of the result page: which listing this diagnostic is about (its real
// cover photo, its real title, its city when known) and the visitor's goal,
// with one sentence saying what that goal changed in the report (see
// lib/goalPersonalization.ts). Server component: it only ever receives
// strings that are safe on a locked page -- the visitor's own title and
// photo, and counts -- never a recommendation.
//
// Everything is optional; a missing piece is left out, never replaced. With
// nothing to show, nothing renders.

export function ListingContext({
  photoUrl,
  title,
  city,
  goalReminder,
  goalExplanation,
  className = "",
}: {
  /** null = no photo here (variant B already shows the cover above). */
  photoUrl: string | null;
  title: string | null;
  city: string | null;
  goalReminder: string | null;
  goalExplanation: string | null;
  className?: string;
}) {
  const hasListing = Boolean(photoUrl || title);
  if (!hasListing && !goalReminder) return null;

  return (
    <div className={`animate-fade-up mx-auto mb-8 w-full ${className} max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[0_18px_40px_-30px_rgba(28,26,23,0.35)]`}>
      {hasListing && (
        <div className="flex items-center gap-4 p-4 sm:p-5">
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Photo principale de ton annonce"
              className="h-16 w-20 shrink-0 rounded-xl border border-border object-cover sm:h-[72px] sm:w-24"
            />
          )}
          <div className="min-w-0 text-left">
            <p className="label-mono text-muted-2">{title ? "Ton diagnostic pour" : "Ton annonce analysée"}</p>
            {title && (
              <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-foreground sm:text-base">{title}</p>
            )}
            {city && (
              <p className="mt-1 flex items-center gap-1 text-[13px] text-muted">
                <MapPin aria-hidden size={13} className="shrink-0" />
                {city}
              </p>
            )}
          </div>
        </div>
      )}
      {goalReminder && (
        <div className={`flex items-start gap-3 bg-accent-soft/60 px-4 py-3.5 text-left sm:px-5 ${hasListing ? "border-t border-border" : ""}`}>
          <Target aria-hidden size={16} className="mt-0.5 shrink-0 text-accent-hover" />
          <div className="min-w-0">
            <p className="text-[14px] text-foreground">
              <span className="font-semibold">Ton objectif :</span> {goalReminder}
            </p>
            {goalExplanation && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{goalExplanation}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
