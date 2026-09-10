import { Check } from "lucide-react";

/**
 * Variant B only: shows the listing's actual cover photo (already
 * uploaded/extracted -- never generated) above the score, so the free
 * result reads as "GuestMirror really looked at your listing" rather than
 * a purely textual verdict. No image, no render -- never invents one.
 */
export function AhaCoverImage({ imageUrl }: { imageUrl?: string | null }) {
  if (!imageUrl) return null;

  return (
    <div className="mx-auto mb-6 w-full max-w-[200px]">
      <div className="relative overflow-hidden rounded-2xl border border-border shadow-[0_16px_40px_-20px_rgba(28,26,23,0.3)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          <Check size={11} className="text-score-high" />
          Analysée
        </span>
      </div>
    </div>
  );
}
