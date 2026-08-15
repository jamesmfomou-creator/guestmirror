import { Upload, Search, Wrench, GitCompare } from "lucide-react";
import { Reveal } from "./Reveal";

const ITEMS = [
  { icon: Upload, label: "Importe." },
  { icon: Search, label: "Découvre." },
  { icon: Wrench, label: "Corrige." },
  { icon: GitCompare, label: "Compare." },
];

export function SimpleBand() {
  return (
    <section className="border-t border-border/70 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-2">
            Conçu pour être simple
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            Pas de dashboard compliqué. Pas de connexion Airbnb. Pas de données techniques à
            comprendre.
          </p>
        </Reveal>

        <div className="mx-auto mt-10 grid max-w-lg grid-cols-2 gap-4 sm:grid-cols-4">
          {ITEMS.map(({ icon: Icon, label }, i) => (
            <Reveal key={label} delay={i * 0.06} className="flex flex-col items-center gap-2.5 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon size={16} />
              </div>
              <span className="text-sm font-medium text-foreground">{label}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
