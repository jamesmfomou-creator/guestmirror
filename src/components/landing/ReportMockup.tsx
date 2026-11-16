import { Reveal } from "./Reveal";
import { Eyebrow } from "./Eyebrow";
import { CtaTrackedButton } from "./CtaTrackedButton";
import { ReportPreviewCard } from "./ReportPreviewCard";

// "Pas juste un score. Un diagnostic." -- a fixed, illustrative example of a
// GuestMirror report (see ReportPreviewCard), followed by the same entry point
// as every other landing CTA (/analyze). Nothing here comes from, or affects,
// a real analysis.
export function ReportMockup() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-2xl px-5">
        <Reveal className="text-center">
          <div className="mb-4 flex justify-center">
            <Eyebrow>Aperçu du rapport</Eyebrow>
          </div>
          <h2 className="font-display text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Pas juste un score. Un diagnostic.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-balance text-base text-muted sm:text-lg">
            Découvre ce qui peut faire hésiter les voyageurs avant même qu&apos;ils réservent.
          </p>
        </Reveal>

        <div className="mt-10 sm:mt-12">
          <ReportPreviewCard />
        </div>

        <div className="mt-8 flex flex-col items-center text-center">
          <CtaTrackedButton href="/analyze" size="lg" ctaLocation="report_preview">
            Analyser mon annonce Airbnb →
          </CtaTrackedButton>
          <p className="mt-3 text-xs text-muted-2">
            Exemple illustratif — chaque diagnostic dépend de l&apos;annonce analysée.
          </p>
        </div>
      </div>
    </section>
  );
}
