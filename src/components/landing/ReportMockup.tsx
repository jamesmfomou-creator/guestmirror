import { Lock } from "lucide-react";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Reveal } from "./Reveal";
import { Eyebrow } from "./Eyebrow";

const LOCKED_PREVIEW = [
  "Quelle photo mettre en première",
  "L'ordre recommandé de tes premières photos",
  "3 propositions de titre",
];

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
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <div className="card overflow-hidden shadow-[0_32px_80px_-32px_rgba(28,26,23,0.3)]">
            <div className="flex items-center gap-1.5 border-b border-border bg-background-alt/70 px-4 py-2.5">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-border" />
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-border" />
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="ml-3 truncate rounded-md bg-card px-2.5 py-1 text-[11px] text-muted-2">
                guestmirror.fr/resultat
              </span>
            </div>
            <div className="p-7 sm:p-10">
            <div className="flex flex-col items-center text-center">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-2">
                Test des 5 secondes
              </span>
              <div className="mt-5">
                <ScoreRing score={43} size={132} strokeWidth={10} showLabel={false} />
              </div>
              <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-background-alt px-4 py-1.5 text-sm font-semibold text-foreground">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-score-mid" />
                J&apos;HÉSITE
              </span>
            </div>

            <div className="mt-8 space-y-6 border-t border-border pt-7 text-left">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-2">
                  Ce que j&apos;ai compris en 5 secondes
                </span>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  Ton logement semble agréable, mais son meilleur atout n&apos;est pas visible
                  immédiatement.
                </p>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-2">
                  Ma première hésitation
                </span>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  &ldquo;Le logement a l&apos;air agréable, mais je ne vois pas encore pourquoi je
                  choisirais celui-ci plutôt que les autres.&rdquo;
                </p>
              </div>
              <div className="rounded-xl bg-score-low/10 p-4 text-center">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-score-low">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-score-low" />
                  Problème principal
                </span>
                <p className="mx-auto mt-2 max-w-sm text-sm font-medium leading-snug text-foreground">
                  &ldquo;Ta terrasse semble être ton meilleur atout, mais elle n&apos;apparaît
                  qu&apos;en photo n°5.&rdquo;
                </p>
              </div>
            </div>

            <div className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border">
              {LOCKED_PREVIEW.map((item) => (
                <div key={item} className="flex items-center gap-3 px-4 py-3">
                  <Lock size={13} className="shrink-0 text-muted-2" />
                  <span className="text-sm text-muted">{item}</span>
                </div>
              ))}
            </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mx-auto mt-6 max-w-sm text-center text-sm text-muted-2">
            Une première impression claire. Puis des actions concrètes.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
