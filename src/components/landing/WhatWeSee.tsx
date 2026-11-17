import Image from "next/image";
import { BRAND_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";

const ITEMS = [
  { key: "differentiation", title: "Différenciation", text: "Pourquoi choisir ton logement plutôt qu'un autre ?" },
  { key: "clarity", title: "Clarté", text: "Que comprend un voyageur en quelques secondes ?" },
  { key: "hesitation", title: "Hésitation", text: "Qu'est-ce qui peut freiner l'envie d'en voir plus ?" },
  { key: "order", title: "Ordre des photos", text: "Tes meilleurs éléments apparaissent-ils assez tôt ?" },
  { key: "title", title: "Titre", text: "Ton titre renforce-t-il réellement la première impression ?" },
];

// Bento grid of what the analysis looks at. The large tile uses a demo
// photo framed the way the analysis frames it; the others are typographic.
export function WhatWeSee() {
  return (
    <section className="pb-24 sm:pb-32">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="flex flex-col justify-between gap-4 border-t border-border/70 pt-14 sm:flex-row sm:items-end">
          <h3 className="text-display text-[2.2rem] text-foreground sm:text-[2.8rem] [&_em]:text-accent">
            Ce que {BRAND_NAME} <em>regarde</em>
          </h3>
          <p className="max-w-sm text-[15px] leading-relaxed text-muted">
            Une première impression se joue sur des détails précis. Voici ce que l&apos;analyse observe.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-3 lg:grid-rows-[repeat(3,minmax(0,auto))]">
          <Reveal className="lg:col-span-2 lg:row-span-2">
            <div className="group relative h-full min-h-[320px] overflow-hidden rounded-[24px] border border-border bg-card">
              <Image
                src="/demo/annonce-b.jpg"
                alt="Exemple de photo de couverture analysée"
                fill
                sizes="(max-width: 1024px) 100vw, 720px"
                className="object-cover transition-transform duration-[1.6s] ease-out group-hover:scale-[1.03]"
              />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
              {/* Analysis frame */}
              <div aria-hidden className="pointer-events-none absolute inset-6 sm:inset-8">
                {["top-0 left-0 border-t-2 border-l-2 rounded-tl-lg", "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg", "bottom-32 left-0 border-b-2 border-l-2 rounded-bl-lg", "bottom-32 right-0 border-b-2 border-r-2 rounded-br-lg"].map((c) => (
                  <span key={c} className={`absolute h-6 w-6 border-white/80 ${c}`} />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <span className="label-mono text-white/70">Critère principal</span>
                <h4 className="mt-2 text-[22px] font-medium tracking-tight text-white sm:text-2xl">Photo de couverture</h4>
                <p className="mt-1.5 max-w-md text-[15px] text-white/80">
                  Est-ce que ton meilleur atout est visible immédiatement ?
                </p>
              </div>
            </div>
          </Reveal>

          {ITEMS.map(({ key, title, text }, i) => (
            <Reveal key={key} delay={0.05 + (i % 3) * 0.06}>
              <div className="group flex h-full flex-col justify-between rounded-[24px] border border-border bg-card p-6 transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-32px_rgba(21,18,14,0.35)]">
                <h4 className="label-mono font-normal text-muted-2 transition-colors duration-500 group-hover:text-accent">{title}</h4>
                <p className="text-display mt-8 text-[1.6rem] leading-[1.12] text-foreground">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
