import { Check } from "lucide-react";
import { getTotalAnalysesCount } from "@/lib/store";

// Below this, "plus de X analyses" reads as thin rather than reassuring --
// simply don't show it yet rather than round a small real number up into
// something misleading. Never a fabricated number either way (see
// getTotalAnalysesCount, a real count query).
const MIN_COUNT_TO_SHOW = 20;

export async function SocialProof() {
  const count = await getTotalAnalysesCount();
  if (count === null || count < MIN_COUNT_TO_SHOW) return null;

  // Floors the real count to the nearest 5 -- "plus de X" stays literally
  // true (a floor can only make the claim more conservative), and avoids
  // an oddly specific-looking number.
  const displayCount = Math.floor(count / 5) * 5;

  return (
    <p className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
      <Check size={14} className="shrink-0 text-score-high" />
      Déjà plus de {displayCount} annonces analysées avec GuestMirror
    </p>
  );
}
