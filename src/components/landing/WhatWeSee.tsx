import { Image, Sparkles, Eye, HelpCircle, ListOrdered, Type } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { Reveal } from "./Reveal";

const ITEMS = [
  {
    icon: Image,
    title: "Photo de couverture",
    text: "Est-ce que ton meilleur atout est visible immédiatement ?",
  },
  {
    icon: Sparkles,
    title: "Différenciation",
    text: "Pourquoi choisir ton logement plutôt qu'un autre ?",
  },
  {
    icon: Eye,
    title: "Clarté",
    text: "Que comprend un voyageur en quelques secondes ?",
  },
  {
    icon: HelpCircle,
    title: "Hésitation",
    text: "Qu'est-ce qui peut freiner l'envie d'en voir plus ?",
  },
  {
    icon: ListOrdered,
    title: "Ordre des photos",
    text: "Tes meilleurs éléments apparaissent-ils assez tôt ?",
  },
  {
    icon: Type,
    title: "Titre",
    text: "Ton titre renforce-t-il réellement la première impression ?",
  },
];

export function WhatWeSee() {
  return (
    <section className="border-t border-border/70 bg-background-alt/50 py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal className="mx-auto max-w-xl text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Ce que {BRAND_NAME} regarde
          </h2>
          <p className="mt-3 text-muted">
            Une première impression se joue sur des détails précis. Voici ce que l&apos;analyse
            observe.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.06}>
              <div className="group card h-full p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-20px_rgba(28,26,23,0.25)]">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent transition-transform duration-200 group-hover:scale-105">
                  <Icon size={17} />
                </div>
                <h3 className="mt-3.5 text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
