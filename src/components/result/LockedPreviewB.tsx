"use client";

import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

// Variant B's visual locked-preview grid. Every card below is built from
// data the analysis already produced -- a real other photo (blurred), a
// real suggested title (blurred), a real improved description (blurred),
// a real top action -- never a placeholder or an invented count. Cards
// with no real backing data simply aren't rendered.
interface LockedItem {
  label: string;
  imageUrl?: string;
  textPreview?: string;
}

// Generic filler items (no real per-analysis content to show, so no
// blurred preview -- just the label + lock, same vocabulary LockedTeaser
// already uses) added only if the real-data cards above don't fill out a
// reasonably sized grid.
const GENERIC_FALLBACKS = [
  "Les éléments que le voyageur ne comprend pas",
  "Les questions que pourrait se poser un voyageur",
  "Ton re-test après modification",
];

export function LockedPreviewB({
  analysisId,
  otherImageUrls,
  suggestedTitle,
  improvedDescription,
  topAction,
  count,
}: {
  analysisId: string;
  otherImageUrls: string[];
  suggestedTitle?: string | null;
  improvedDescription?: string | null;
  topAction?: string | null;
  count: number;
}) {
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("locked_preview_viewed", { analysisId, count });
  });

  const items: LockedItem[] = [];
  if (otherImageUrls[0]) items.push({ label: "Photo recommandée en premier", imageUrl: otherImageUrls[0] });
  if (otherImageUrls[1]) items.push({ label: "Ordre optimisé des photos", imageUrl: otherImageUrls[1] });
  if (suggestedTitle) items.push({ label: "Titre amélioré", textPreview: suggestedTitle });
  if (improvedDescription) items.push({ label: "Description améliorée", textPreview: improvedDescription });
  if (topAction) items.push({ label: "Actions prioritaires", textPreview: topAction });
  for (const label of GENERIC_FALLBACKS) {
    if (items.length >= 6) break;
    items.push({ label });
  }

  const title =
    count > 0
      ? `GuestMirror a trouvé ${count} autres améliorations pour ton annonce.`
      : "GuestMirror a trouvé d'autres améliorations pour ton annonce.";

  return (
    <div ref={ref} className="mx-auto mt-6 max-w-xl">
      <h2 className="text-center text-lg font-semibold">{title}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {items.map((item) => (
          <LockedCard key={item.label} label={item.label} imageUrl={item.imageUrl} textPreview={item.textPreview} />
        ))}
      </div>
    </div>
  );
}

function LockedCard({ label, imageUrl, textPreview }: { label: string; imageUrl?: string; textPreview?: string }) {
  return (
    <div className="card overflow-hidden p-0">
      <LockedThumb imageUrl={imageUrl} textPreview={textPreview} />
      <p className="px-3 py-2 text-center text-xs font-medium text-foreground">{label}</p>
    </div>
  );
}

function LockedThumb({ imageUrl, textPreview }: { imageUrl?: string; textPreview?: string }): ReactNode {
  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden bg-background-alt">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full scale-110 object-cover blur-md" />
      )}
      {textPreview && (
        <p className="pointer-events-none absolute inset-0 flex select-none items-center justify-center px-3 text-center text-xs leading-snug text-muted blur-[3px]">
          {textPreview}
        </p>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-background/35">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm">
          <Lock size={13} className="text-muted-2" />
        </span>
      </div>
    </div>
  );
}
