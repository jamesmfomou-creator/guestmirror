"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { useInViewOnce } from "@/lib/tracking/useInViewOnce";
import { severityEmoji, severityLabel } from "@/lib/utils";
import { PaywallPreview, paywallPreviewContents } from "@/lib/paywallPreview";
import { OFFERS, formatEur } from "@/lib/plans";

/**
 * Head of the paywall in the "v2" presentation (lib/paywallExperiment.ts):
 * what this analysis found, what the report contains, one action, and what
 * happens after paying. Replaces the generic headline and benefit list of
 * the control paywall; the plans underneath are the same component.
 *
 * Client component: `preview` is serialized into the page of a visitor who
 * has not paid. It must stay the names-and-counts object built by
 * lib/paywallPreview.ts -- never pass the analysis result here.
 */
export function PaywallPreviewV2({
  analysisId,
  preview,
  emailsReportLink,
  loading,
  disabled,
  onUnlock,
  hideContents = false,
}: {
  analysisId: string;
  preview: PaywallPreview;
  // True when the unlock e-mail will really be sent for this analysis.
  emailsReportLink: boolean;
  loading: boolean;
  disabled: boolean;
  onUnlock: () => void;
  /** The page already lists the report's contents above (ImprovementPlanCard). */
  hideContents?: boolean;
}) {
  const hiddenWeaknesses = preview.weaknessCount - preview.weaknesses.length;
  const contents = paywallPreviewContents(preview);

  const ref = useInViewOnce<HTMLDivElement>(() => {
    track("paywall_preview_viewed", {
      analysisId,
      weakness_count: preview.weaknessCount,
      high_severity_count: preview.highSeverityCount,
    });
    // Same step as the control's locked teaser / locked preview card, so the
    // existing funnel keeps one comparable "locked preview seen" event.
    // `count` kept as before for this arm's history; `weakness_count` is the
    // field every presentation now sends (see LockedTeaser).
    track("locked_preview_viewed", { analysisId, count: preview.weaknessCount, weakness_count: preview.weaknessCount });
  }, 0.2);

  return (
    <div ref={ref} className="card mx-auto max-w-xl p-6 sm:p-7">
      <h2 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
        {preview.weaknessCount > 1
          ? `Ton diagnostic a relevé ${preview.weaknessCount} points faibles sur ton annonce`
          : preview.weaknessCount === 1
            ? "Ton diagnostic a relevé 1 point faible sur ton annonce"
            : "Ton rapport détaillé est prêt"}
      </h2>
      {preview.weaknessCount > 0 && (
        <p className="mt-2 text-sm text-muted">
          Ce sont les endroits où un voyageur peut hésiter en découvrant ton annonce.
          {preview.highSeverityCount > 0 &&
            ` ${preview.highSeverityCount === 1 ? "L'un d'eux est classé" : `${preview.highSeverityCount} sont classés`} en priorité haute.`}
        </p>
      )}

      {preview.weaknesses.length > 0 && (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {preview.weaknesses.map((w) => (
            <li key={w.title} className="px-4 py-3">
              <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                <span aria-hidden="true">{severityEmoji(w.severity)}</span>
                <span>
                  {w.title}
                  <span className="sr-only"> — {severityLabel(w.severity)}</span>
                </span>
              </p>
              <p className="mt-1 flex items-center gap-1.5 pl-6 text-xs text-muted-2">
                <Lock size={12} className="shrink-0" aria-hidden="true" />
                Explication et correction dans ton rapport
              </p>
            </li>
          ))}
          {hiddenWeaknesses > 0 && (
            <li className="flex items-center gap-1.5 px-4 py-3 text-xs text-muted-2">
              <Lock size={12} className="shrink-0" aria-hidden="true" />
              {hiddenWeaknesses === 1 ? "+ 1 autre point faible" : `+ ${hiddenWeaknesses} autres points faibles`}
            </li>
          )}
        </ul>
      )}

      {!hideContents && contents.length > 0 && (
        <>
          <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-2">
            Ce que contient ton rapport
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground">
            {contents.map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="mt-0.5 font-semibold text-accent-hover">
                  ✓
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Button size="lg" className="mt-6 w-full sm:w-full" onClick={onUnlock} disabled={disabled}>
        {loading ? "Redirection…" : `Débloquer mes recommandations — ${formatEur(OFFERS.one_time.amountEur)}`}
      </Button>
      <p className="mt-3 text-center text-xs leading-relaxed text-muted-2">
        Paiement unique de {formatEur(OFFERS.one_time.amountEur)}, sans abonnement, sécurisé par Stripe. Juste après le paiement, tu reviens sur
        cette page et ton rapport complet s&apos;affiche
        {emailsReportLink ? " ; tu reçois aussi son lien par e-mail." : "."}
      </p>
    </div>
  );
}
