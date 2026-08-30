"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { track } from "@/lib/analytics";
import { verdictFor } from "@/lib/utils";
import { COMPARE_EXAMPLE_IMAGES } from "@/lib/demo-data";

type Choice = "a" | "b";

const CARDS: { key: Choice; label: string; image: string; score: number }[] = [
  { key: "a", label: "A", image: COMPARE_EXAMPLE_IMAGES.a, score: 84 },
  { key: "b", label: "B", image: COMPARE_EXAMPLE_IMAGES.b, score: 68 },
];

const WINNER: Choice = "a";

export function LandingCompareTeaser() {
  const [choice, setChoice] = useState<Choice | null>(null);

  function select(key: Choice) {
    if (choice) return;
    track("test_clicked", { source: "landing_compare_choice", choice: key });
    setChoice(key);
  }

  return (
    <div>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3 sm:gap-5">
        {CARDS.map((card) => {
          const verdict = verdictFor(card.score);
          const isChosen = choice === card.key;
          const isWinner = card.key === WINNER;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => select(card.key)}
              disabled={!!choice}
              className={`group relative aspect-[4/5] overflow-hidden rounded-2xl border bg-card text-left transition-all duration-200 ${
                isChosen ? "ring-2 ring-accent" : "border-border"
              } ${!choice ? "hover:scale-[1.02] active:scale-[0.97]" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.image} alt="" className="h-full w-full object-cover" />
              <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
                Annonce {card.label}
              </span>
              {choice && (
                <div
                  className={`animate-fade-up absolute inset-0 flex flex-col items-center justify-center gap-1 text-white ${
                    isWinner ? "bg-black/55" : "bg-black/60"
                  }`}
                >
                  <span className="text-3xl font-bold">
                    {verdict.emoji} {card.score}
                  </span>
                  <span className="text-xs text-white/70">/ 100</span>
                  <span className="mt-1 text-sm font-semibold tracking-wide">{verdict.short}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!choice && (
        <p className="mt-5 text-center text-xs font-medium uppercase tracking-wide text-muted-2">
          Touche une annonce pour choisir
        </p>
      )}

      {choice && (
        <div className="animate-fade-up mt-7 text-center">
          <p className="text-sm font-semibold text-foreground">
            Tu as choisi {choice.toUpperCase()} 👀
          </p>
          <p className="mt-1 text-sm text-muted">Intéressant. Voici ce que notre analyse remarque.</p>

          <div className="mx-auto mt-6 max-w-sm space-y-5 text-left">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Pourquoi A gagne ?</h3>
              <p className="mt-1.5 text-sm text-muted">
                Les deux annonces sont attractives, mais A montre immédiatement l&apos;expérience
                proposée : terrasse, vue mer et moment de détente. Sur B, le logement est très
                agréable, mais son meilleur atout — l&apos;ouverture sur la mer — est moins
                dominant au premier regard.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Ce qui fonctionne déjà sur B</h3>
              <p className="mt-1.5 text-sm text-muted">
                Le logement est lumineux, soigné et la vue extérieure est visible. L&apos;annonce
                donne déjà envie d&apos;en voir plus.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Ce que je changerais en premier sur B
              </h3>
              <p className="mt-1.5 text-sm text-muted">
                Je mettrais davantage l&apos;ouverture et la vue extérieure au centre du cadrage
                afin que l&apos;atout bord de mer devienne évident dès les premières secondes.
              </p>
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-sm text-xs text-muted-2">
            Exemple de démonstration. Les scores correspondent à l&apos;évaluation interne de
            l&apos;outil.
          </p>

          <Button
            href="/compare"
            variant="outline"
            size="lg"
            className="mt-6"
            onClick={() => track("compare_cta_clicked", { cta_location: "landing_compare_teaser" })}
          >
            Comparer mes propres annonces
          </Button>
        </div>
      )}
    </div>
  );
}
