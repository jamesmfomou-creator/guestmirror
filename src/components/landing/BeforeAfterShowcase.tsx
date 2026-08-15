import { ScoreRing } from "@/components/ui/ScoreRing";
import { BRAND_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";

export function BeforeAfterShowcase() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <Reveal>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Corrige. Refais le test. Compare.
          </h2>
        </Reveal>

        <div className="mt-12 flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-10">
          <Reveal delay={0.05} className="flex flex-col items-center">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-2">Avant</span>
            <div className="mt-3">
              <ScoreRing score={43} size={140} strokeWidth={10} showLabel={false} />
            </div>
            <span className="mt-3 text-sm font-semibold">😬 JE PASSE</span>
          </Reveal>

          <Reveal delay={0.15} className="flex flex-col items-center gap-1.5">
            <span aria-hidden className="text-2xl text-muted-2">
              →
            </span>
            <span className="rounded-full bg-score-high/10 px-3 py-1 text-sm font-semibold text-score-high">
              +38 points
            </span>
          </Reveal>

          <Reveal delay={0.3} className="flex flex-col items-center">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-2">Après</span>
            <div className="mt-3">
              <ScoreRing score={81} size={140} strokeWidth={10} showLabel={false} />
            </div>
            <span className="mt-3 text-sm font-semibold">🔥 JE CLIQUE</span>
          </Reveal>
        </div>

        <Reveal delay={0.4}>
          <p className="mx-auto mt-9 max-w-md text-xs leading-relaxed text-muted-2">
            +38 points sur le score interne {BRAND_NAME}. L&apos;évolution correspond au score
            interne de {BRAND_NAME} et ne garantit pas une augmentation des clics ou des
            réservations.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
