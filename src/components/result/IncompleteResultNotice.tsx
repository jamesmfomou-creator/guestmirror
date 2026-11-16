import { Button } from "@/components/ui/Button";

// Shown instead of the diagnostic / paywall when a stored analysis has a
// score and a summary but none of its detail (see isIncompleteResult in
// lib/resultShape.ts): rows written before the model's output was fully
// validated. There is nothing truthful to preview and nothing to sell, so
// the visitor is told exactly that and offered a new analysis, which is
// free. Server component on purpose: it renders a link, nothing else.
export function IncompleteResultNotice({
  listingUrl,
  unlocked,
  canRerunUnlocked,
}: {
  listingUrl: string | null;
  // The visitor already has access to the full report for this analysis.
  unlocked: boolean;
  // Their access comes from a subscription, so a new analysis is unlocked
  // too. Not true of a one-time purchase, which is tied to this analysis.
  canRerunUnlocked: boolean;
}) {
  const href = listingUrl ? `/analyze?url=${encodeURIComponent(listingUrl)}` : "/analyze";

  return (
    <div className="mx-auto mt-6 max-w-xl">
      <div className="card p-7 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-hover">
          Analyse incomplète
        </span>
        <p className="mx-auto mt-4 max-w-md text-lg font-semibold leading-snug text-foreground">
          Le détail de cette analyse n&apos;a pas pu être généré.
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Une erreur technique de notre côté a interrompu la génération : le score ci-dessus a été
          calculé, mais pas les recommandations.
          {!unlocked && " Relance l'analyse, c'est gratuit et ça prend environ une minute."}
          {unlocked && canRerunUnlocked && " Relance l'analyse : elle est incluse dans ton abonnement."}
        </p>
        {(!unlocked || canRerunUnlocked) && (
          <div className="mt-5 flex justify-center">
            <Button href={href} size="lg">
              Relancer mon analyse
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
