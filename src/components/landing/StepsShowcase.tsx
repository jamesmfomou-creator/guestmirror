import { ScoreRing } from "@/components/ui/ScoreRing";
import { Reveal } from "./Reveal";

const STEPS = [
  {
    n: "01",
    title: "Capture ton annonce",
    text: "Une capture de ta page ou de tes premières photos suffit.",
    visual: (
      <div className="flex h-16 w-24 overflow-hidden rounded-xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/annonce-a.jpg" alt="" className="h-full w-full object-cover" />
      </div>
    ),
  },
  {
    n: "02",
    title: "Fais le test des 5 secondes",
    text: "Découvre ce qu'un voyageur comprend — et ce qui le fait hésiter.",
    visual: <ScoreRing score={43} size={72} strokeWidth={6} showLabel={false} />,
  },
  {
    n: "03",
    title: "Découvre ce qui bloque",
    text: "Identifie le problème qui affaiblit ta première impression.",
    visual: (
      <div className="flex w-32 items-center gap-1.5 rounded-lg bg-score-low/10 px-2.5 py-2 text-left">
        <span className="text-sm">🔴</span>
        <span className="text-[10px] font-medium leading-tight text-foreground">
          Problème principal détecté
        </span>
      </div>
    ),
  },
  {
    n: "04",
    title: "Refais le test",
    text: "Compare l'avant / après après tes modifications.",
    visual: (
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-muted-2">43</span>
        <span className="text-muted-2">→</span>
        <span className="text-score-high">81</span>
      </div>
    ),
  },
];

export function StepsShowcase() {
  return (
    <section className="border-t border-border/70 bg-background-alt/50 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal className="text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            4 étapes. Moins d&apos;une minute.
          </h2>
        </Reveal>

        <div className="relative mt-16 grid gap-10 sm:grid-cols-4 sm:gap-6">
          <div
            aria-hidden
            className="absolute top-5 right-0 left-0 hidden h-px bg-border sm:block"
          />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08} className="relative flex flex-col items-center text-center">
              <div className="relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-accent">
                {s.n}
              </div>
              <div className="mt-5 flex h-16 items-center justify-center">{s.visual}</div>
              <h3 className="mt-5 font-medium">{s.title}</h3>
              <p className="mt-2 max-w-[220px] text-sm text-muted">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
