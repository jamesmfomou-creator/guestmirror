"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { scoreColor } from "@/lib/utils";
import { SectionHeading } from "./SectionHeading";
import { BRAND_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";

// Illustrative only -- built entirely from the existing demo dataset
// (lib/demo-data.ts, the same fixed example already used by the hero demo
// and the compare teaser), never from real customer analyses. Every score
// below is a real value copied from that dataset, not invented for this
// section. Each card carries its own "Exemple de démonstration" badge so
// it can't be mistaken for a real review, on top of the section-level
// disclaimer. Five distinct photos (annonce-a..e) so no two cards repeat
// the same image.
const CASES = [
  {
    image: "/demo/annonce-a.jpg",
    tag: "Avant / après",
    title: "Une photo de couverture plus impactante",
    before: 43,
    after: 81,
    text: "La terrasse, pourtant l'atout principal de ce logement, n'apparaissait qu'en 5ᵉ photo. En la plaçant en couverture, le score passe de 43 à 81.",
  },
  {
    image: "/demo/annonce-e.jpg",
    tag: "Luminosité",
    title: "Des photos trop sombres font perdre des points",
    before: 54,
    after: 80,
    text: "Des photos sombres ou mal exposées donnent une impression froide dès les premières secondes. Un simple retravail de la luminosité change la perception du logement.",
  },
  {
    image: "/demo/annonce-d.jpg",
    tag: "Titre de l'annonce",
    title: "Un titre qui ne disait rien de spécial",
    before: 57,
    after: null,
    text: "« Superbe appartement au cœur de Marseille » pourrait décrire des centaines d'annonces. GuestMirror propose un titre qui met en avant ce qui différencie vraiment le logement.",
  },
  {
    image: "/demo/annonce-c.jpg",
    tag: "Ordre des photos",
    title: "Le meilleur atout, mais trop tard dans l'ordre",
    before: 91,
    after: null,
    text: "La photo la mieux notée de l'annonce (91/100) arrivait en 5ᵉ position. GuestMirror recommande de la remonter en première photo.",
  },
  {
    image: "/demo/annonce-b.jpg",
    tag: "Clarté de l'offre",
    title: "Ce que le voyageur comprend en 5 secondes",
    before: 62,
    after: 83,
    text: "Un voyageur doit comprendre en quelques secondes ce que propose le logement. GuestMirror identifie précisément ce qui manque de clarté, et comment le corriger.",
  },
];

const AUTOPLAY_MS = 4200;

function ScorePill({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-background-alt px-2.5 py-1 text-xs font-semibold"
      style={{ color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {score}/100
    </span>
  );
}

export function CaseStudiesCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const interactedRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const reduced = useReducedMotion();

  function cardStep() {
    const track = trackRef.current;
    const card = track?.querySelector("[data-case-card]");
    return card instanceof HTMLElement ? card.offsetWidth + 20 : 320;
  }

  function scrollByCard(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: direction * cardStep(), behavior: "smooth" });
  }

  function handleManualNav(direction: 1 | -1) {
    interactedRef.current = true;
    scrollByCard(direction);
  }

  // Auto-advance one card at a time, looping back to the start. Stops for
  // good the moment someone touches the carousel themselves (drag or
  // arrow click) -- once a visitor is in control, autoplay shouldn't fight
  // them. Also off entirely under prefers-reduced-motion.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (hovered || interactedRef.current) return;
      const track = trackRef.current;
      if (!track) return;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + cardStep(), behavior: "smooth" });
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [reduced, hovered]);

  return (
    <section className="border-t border-border/70 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            index="04"
            label="Cas concrets"
            title={
              <>
                {BRAND_NAME} à travers des <em>cas concrets</em>
              </>
            }
            description="Exemples illustratifs à partir de notre jeu de démonstration — pas des témoignages clients."
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => handleManualNav(-1)}
              aria-label="Cas précédent"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-all hover:-translate-x-0.5 hover:border-foreground/30"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => handleManualNav(1)}
              aria-label="Cas suivant"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-all hover:translate-x-0.5 hover:border-foreground/30"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        <Reveal delay={0.1} className="relative mt-14">
          <div
            ref={trackRef}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onPointerDown={() => {
              interactedRef.current = true;
            }}
            className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2"
          >
            {CASES.map((c) => (
              <div
                key={c.title}
                data-case-card
                className="group relative w-[290px] shrink-0 snap-start overflow-hidden rounded-[24px] border border-border bg-card transition-shadow duration-500 hover:shadow-[0_30px_60px_-36px_rgba(21,18,14,0.4)] sm:w-[360px]"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image} alt="" className="h-full w-full object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.04]" />
                  <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
                    Exemple de démonstration
                  </span>
                </div>
                <div className="p-6">
                  <span className="label-mono text-muted-2">{c.tag}</span>
                  <h3 className="text-display mt-3 text-[1.55rem] leading-[1.1] text-foreground">{c.title}</h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{c.text}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <ScorePill score={c.before} />
                    {c.after !== null && (
                      <>
                        <span aria-hidden className="text-muted-2">
                          →
                        </span>
                        <ScorePill score={c.after} />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </Reveal>
      </div>
    </section>
  );
}
