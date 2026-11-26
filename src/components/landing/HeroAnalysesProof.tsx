import { ShieldCheck } from "lucide-react";
import { getVisitorAnalysesCount } from "@/lib/store";

// "Déjà plus de N analyses réalisées", right under the hero form. A real
// count (getVisitorAnalysesCount: test addresses excluded), floored to the
// hundred, so "plus de" is always literally true. Nothing below 100: no
// figure rather than a thin one. Revalidated with the page (see page.tsx).
export async function HeroAnalysesProof({ className = "" }: { className?: string }) {
  const count = await getVisitorAnalysesCount();
  if (count === null || count < 100) return null;
  const shown = Math.floor(count / 100) * 100;
  return (
    <p
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-[14px] font-semibold text-foreground backdrop-blur ${className}`}
    >
      <ShieldCheck aria-hidden size={17} strokeWidth={2.2} className="shrink-0 text-score-high" />
      Déjà plus de {shown.toLocaleString("fr-FR")} analyses réalisées
    </p>
  );
}
