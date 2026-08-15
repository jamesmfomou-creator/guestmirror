"use client";

import { Comparison } from "@/lib/types";
import { verdictFor } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/brand";
import { ShareCardCompare } from "./ShareCardCompare";
import { Button } from "@/components/ui/Button";

interface ScoredResult {
  overall_score: number;
}

function ListingCard({
  label,
  result,
  image,
  isWinner,
}: {
  label: string;
  result: ScoredResult;
  image?: string;
  isWinner: boolean;
}) {
  const verdict = verdictFor(result.overall_score);
  return (
    <div className={`card overflow-hidden text-center ${isWinner ? "ring-2 ring-accent" : ""}`}>
      {image && (
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
            <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
              Annonce {label}
            </span>
            {isWinner && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground shadow-sm">
                🏆 Gagnant
              </span>
            )}
          </div>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-center gap-2 text-4xl font-semibold tracking-tight">
          <span>{verdict.emoji}</span>
          {result.overall_score}
        </div>
        <div className="mt-1 text-sm text-muted">/ 100</div>
        <div className="mt-2 text-sm font-bold tracking-wide">{verdict.short}</div>
      </div>
    </div>
  );
}

export function CompareResultView({
  a,
  b,
  comparison,
  imageA,
  imageB,
  onRestart,
}: {
  a: ScoredResult;
  b: ScoredResult;
  comparison: Comparison;
  imageA?: string;
  imageB?: string;
  onRestart: () => void;
}) {
  const winnerLabel = comparison.winner === "a" ? "A" : "B";
  const loserLabel = comparison.winner === "a" ? "B" : "A";

  return (
    <div className="animate-fade-up mx-auto max-w-[1050px] px-5 py-10 sm:py-14">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-2">
        Mode comparaison
      </span>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Le verdict</h1>

      <div className="mx-auto mt-6 grid max-w-[900px] grid-cols-2 gap-3 sm:gap-6">
        <ListingCard label="A" result={a} image={imageA} isWinner={comparison.winner === "a"} />
        <ListingCard label="B" result={b} image={imageB} isWinner={comparison.winner === "b"} />
      </div>

      <div className="mx-auto mt-8 max-w-2xl space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Pourquoi {winnerLabel} gagne ?</h2>
          <p className="mt-1.5 text-sm text-foreground">{comparison.why_winner.join(" ")}</p>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Ce que je changerais sur {loserLabel}</h2>
          <p className="mt-1.5 text-sm text-foreground">{comparison.first_change}</p>
        </div>
      </div>

      <ShareCardCompare scoreA={a.overall_score} scoreB={b.overall_score} />

      <div className="mx-auto mt-10 max-w-md text-center">
        <h2 className="text-lg font-semibold">Et tes annonces ?</h2>
        <div className="mt-4 flex flex-col items-center gap-3">
          <Button size="lg" onClick={onRestart}>
            Faire une nouvelle comparaison
          </Button>
          <Button href="/analyze" variant="outline">
            Faire le test des 5 secondes sur une annonce
          </Button>
        </div>
      </div>

      <p className="mx-auto mt-10 max-w-md text-center text-xs leading-relaxed text-muted-2">
        Le mode comparaison est une estimation {BRAND_NAME} basée sur la présentation de chaque
        annonce. Il ne prédit ni ne garantit les réservations.
      </p>
    </div>
  );
}
