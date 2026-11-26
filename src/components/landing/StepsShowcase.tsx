import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

const STEPS = [
  {
    n: "01",
    title: "Colle ton lien",
    text: "Colle le lien de ton annonce Airbnb : on récupère ses photos, son titre et sa description.",
  },
  {
    n: "02",
    title: "Fais le test des 5 secondes",
    text: "Découvre ce qu'un voyageur comprend — et ce qui le fait hésiter.",
  },
  {
    n: "03",
    title: "Découvre ce qui bloque",
    text: "Identifie le problème qui affaiblit le plus ta première impression.",
  },
  {
    n: "04",
    title: "Corrige, puis refais le test",
    text: "Compare l'avant / après et mesure ce que tes changements ont vraiment amélioré.",
  },
];

export function StepsShowcase() {
  return (
    <section className="border-t border-border/70 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          index="02"
          label="Méthode"
          layout="split"
          title={
            <>
              4 étapes. <em>Moins d&apos;une minute.</em>
            </>
          }
          description="Pas de dashboard compliqué, pas de connexion Airbnb — juste ton annonce et une réponse claire."
        />

        <div role="list" className="mt-16 grid gap-px overflow-hidden rounded-[24px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, title, text }, i) => (
            <Reveal key={n} delay={i * 0.08} className="h-full">
              <div role="listitem" className="group flex h-full flex-col bg-background p-7 transition-colors duration-500 hover:bg-card sm:p-8">
                <span className="text-display text-[3.5rem] text-foreground/15 transition-colors duration-500 group-hover:text-accent">
                  {n}
                </span>
                <h3 className="mt-10 text-[17px] font-medium tracking-tight text-foreground">{title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
