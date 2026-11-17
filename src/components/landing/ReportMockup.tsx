import { Reveal } from "./Reveal";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { CtaTrackedButton } from "./CtaTrackedButton";
import { ReportPreviewCard } from "./ReportPreviewCard";

// "Pas juste un score. Un diagnostic." -- a fixed, illustrative example of a
// GuestMirror report (see ReportPreviewCard), followed by the same entry point
// as every other landing CTA (/analyze). Nothing here comes from, or affects,
// a real analysis.
export function ReportMockup() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div>
          <SectionHeading
            index="01"
            label="Aperçu du rapport"
            title={
              <>
                Pas juste un score. <em>Un diagnostic.</em>
              </>
            }
            description="Découvre ce qui peut faire hésiter les voyageurs avant même qu'ils réservent."
          />
          <Reveal delay={0.15} className="mt-10 flex flex-col items-start">
            <CtaTrackedButton href="/analyze" size="lg" className="btn-sheen group gap-2" ctaLocation="report_preview">
              Analyser mon annonce Airbnb
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </CtaTrackedButton>
            <p className="mt-3 text-xs text-muted-2">
              Exemple illustratif — chaque diagnostic dépend de l&apos;annonce analysée.
            </p>
          </Reveal>
        </div>

        <div className="mx-auto w-full max-w-xl">
          <ReportPreviewCard />
        </div>
      </div>
    </section>
  );
}
