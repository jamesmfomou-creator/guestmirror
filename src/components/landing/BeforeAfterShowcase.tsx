import { ScoreRing } from "@/components/ui/ScoreRing";
import { BRAND_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

// The page's dark moment: the same illustrative before/after as before, on
// the "ink" surface (theme-ink redefines the colour tokens locally, so the
// score rings render unchanged).
export function BeforeAfterShowcase() {
  return (
    <section className="theme-ink relative overflow-hidden py-24 sm:py-36">
      <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/4 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-score-low/20 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute top-1/2 right-1/4 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-score-high/20 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-5">
        <SectionHeading
          index="03"
          label="Progression"
          align="center"
          title={
            <>
              Corrige. Refais le test. <em>Compare.</em>
            </>
          }
          description="Applique les recommandations, relance l'analyse et vois exactement ce qui a changé."
        />

        <div className="mt-16 grid items-center gap-12 sm:mt-20 sm:grid-cols-[1fr_auto_1fr] sm:gap-6">
          <Reveal delay={0.05} className="flex flex-col items-center">
            <span className="label-mono text-muted-2">Avant</span>
            <div className="mt-5">
              <ScoreRing score={43} size={168} strokeWidth={10} showLabel={false} />
            </div>
            <span className="label-mono mt-5 inline-flex items-center gap-2 text-foreground">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-score-low" />
              Je passe
            </span>
          </Reveal>

          <Reveal delay={0.2} className="flex flex-col items-center">
            <span className="text-display text-[4.5rem] text-score-high sm:text-[5.5rem]">+38</span>
            <span className="label-mono -mt-1 text-muted-2">points</span>
          </Reveal>

          <Reveal delay={0.35} className="flex flex-col items-center">
            <span className="label-mono text-muted-2">Après</span>
            <div className="mt-5">
              <ScoreRing score={81} size={168} strokeWidth={10} showLabel={false} />
            </div>
            <span className="label-mono mt-5 inline-flex items-center gap-2 text-foreground">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-score-high" />
              Je clique
            </span>
          </Reveal>
        </div>

        <Reveal delay={0.45}>
          <p className="mx-auto mt-16 max-w-md text-center text-xs leading-relaxed text-muted-2">
            Exemple illustratif : +38 points sur le score interne {BRAND_NAME}. L&apos;évolution correspond au
            score interne de {BRAND_NAME} et ne garantit pas une augmentation des clics ou des réservations.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
