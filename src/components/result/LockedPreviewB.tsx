"use client";

import { Lock } from "lucide-react";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";

// Two headed, locked sections (funnel optimization mission, section 2):
// "Détails de ton diagnostic" (section B) and "Ton plan d'amélioration
// personnalisé" (section C). Every card maps to something the analysis
// actually produced -- a real other photo (blurred) or a real category
// the report covers -- never a placeholder or an invented count.
//
// Text content (suggested title, improved description, top action) is
// deliberately NOT sent to the client at all, even truncated: a CSS blur
// on real text is still fully readable via DOM inspection or the network
// tab, exactly the leak already fixed once for MainProblem.tsx. The
// server only tells this component *whether* each exists (booleans), so
// the locked label can be shown honestly without the real string ever
// reaching an unpaid visitor's browser. Images are still shown blurred
// (lower-severity, pre-existing tradeoff elsewhere in the product, e.g.
// AhaCoverImage) -- a real server-side image blur is a larger follow-up,
// not done in this pass.
interface LockedItem {
  label: string;
  imageUrl?: string;
}

const DIAGNOSTIC_FALLBACKS = [
  "Les éléments que le voyageur ne comprend pas",
  "Les questions que pourrait se poser un voyageur",
];

const PLAN_FALLBACKS = ["Les 3 changements prioritaires", "Ton re-test après modification"];

export function LockedPreviewB({
  analysisId,
  otherImageUrls,
  hasSuggestedTitle,
  hasImprovedDescription,
  hasTopAction,
  count,
}: {
  analysisId: string;
  otherImageUrls: string[];
  hasSuggestedTitle?: boolean;
  hasImprovedDescription?: boolean;
  hasTopAction?: boolean;
  count: number;
}) {
  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("locked_preview_viewed", { analysisId, count });
  });

  const diagnosticItems: LockedItem[] = [];
  if (otherImageUrls[0]) diagnosticItems.push({ label: "Photo recommandée en premier", imageUrl: otherImageUrls[0] });
  if (otherImageUrls[1]) diagnosticItems.push({ label: "Ordre optimisé des photos", imageUrl: otherImageUrls[1] });
  if (hasSuggestedTitle) diagnosticItems.push({ label: "Titre amélioré" });
  if (hasImprovedDescription) diagnosticItems.push({ label: "Description améliorée" });
  for (const label of DIAGNOSTIC_FALLBACKS) {
    if (diagnosticItems.length >= 4) break;
    diagnosticItems.push({ label });
  }

  const planItems: LockedItem[] = [];
  if (hasTopAction) planItems.push({ label: "Action prioritaire n°1" });
  for (const label of PLAN_FALLBACKS) {
    if (planItems.length >= 3) break;
    planItems.push({ label });
  }

  const title =
    count > 0
      ? `GuestMirror a trouvé ${count} autres améliorations pour ton annonce.`
      : "GuestMirror a trouvé d'autres améliorations pour ton annonce.";

  return (
    <div ref={ref} className="mx-auto mt-6 max-w-xl">
      <h2 className="text-center text-lg font-semibold">{title}</h2>

      <div className="mt-5 flex items-center justify-center gap-2">
        <Lock size={15} className="text-muted-2" />
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-2">
          Détails de ton diagnostic
        </h3>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {diagnosticItems.map((item) => (
          <LockedCard key={item.label} label={item.label} imageUrl={item.imageUrl} />
        ))}
      </div>

      <div className="mt-7 flex items-center justify-center gap-2">
        <Lock size={15} className="text-muted-2" />
        <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-2">
          Ton plan d&apos;amélioration personnalisé
        </h3>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {planItems.map((item) => (
          <LockedCard key={item.label} label={item.label} />
        ))}
      </div>

      <p className="mx-auto mt-6 max-w-sm text-center text-[15px] font-medium text-foreground">
        Découvre précisément quoi modifier pour améliorer ton annonce Airbnb.
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-center text-sm text-muted">
        Débloque ton diagnostic détaillé et les actions recommandées pour optimiser ton annonce.
      </p>
    </div>
  );
}

function LockedCard({ label, imageUrl }: { label: string; imageUrl?: string }) {
  return (
    <div className="card overflow-hidden p-0">
      <LockedThumb imageUrl={imageUrl} />
      <p className="px-3 py-2 text-center text-xs font-medium text-foreground">{label}</p>
    </div>
  );
}

function LockedThumb({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden bg-background-alt">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full scale-110 object-cover blur-md" />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-background/35">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm">
          <Lock size={13} className="text-muted-2" />
        </span>
      </div>
    </div>
  );
}
