import { ImagePlus, ScanSearch, CircleAlert, RefreshCcw } from "lucide-react";
import { Reveal } from "./Reveal";

// One consistent visual treatment per step (icon tile, same size/background
// for all four) instead of four different media types (a photo thumbnail, a
// score ring, a colored pill, plain text) -- that heterogeneity was the
// main thing making this section feel unfinished. Also absorbs what used
// to be a separate "Conçu pour être simple" section a few screens down:
// same four-step story, told twice in two different visual registers, is
// redundant rather than reinforcing.
const STEPS = [
  {
    n: "01",
    icon: ImagePlus,
    title: "Capture ton annonce",
    text: "Colle ton lien Airbnb, ou importe une capture de tes premières photos.",
  },
  {
    n: "02",
    icon: ScanSearch,
    title: "Fais le test des 5 secondes",
    text: "Découvre ce qu'un voyageur comprend — et ce qui le fait hésiter.",
  },
  {
    n: "03",
    icon: CircleAlert,
    title: "Découvre ce qui bloque",
    text: "Identifie le problème qui affaiblit le plus ta première impression.",
  },
  {
    n: "04",
    icon: RefreshCcw,
    title: "Corrige, puis refais le test",
    text: "Compare l'avant / après et mesure ce que tes changements ont vraiment amélioré.",
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
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            Pas de dashboard compliqué, pas de connexion Airbnb — juste ton annonce et une
            réponse claire.
          </p>
        </Reveal>

        <div className="relative mt-16 grid gap-10 sm:grid-cols-4 sm:gap-6">
          <div
            aria-hidden
            className="absolute top-5 right-0 left-0 hidden h-px bg-border sm:block"
          />
          {STEPS.map(({ n, icon: Icon, title, text }, i) => (
            <Reveal key={n} delay={i * 0.08} className="relative flex flex-col items-center text-center">
              <div className="relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-accent">
                {n}
              </div>
              <div className="mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <h3 className="mt-5 font-medium">{title}</h3>
              <p className="mt-2 max-w-[220px] text-sm text-muted">{text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
