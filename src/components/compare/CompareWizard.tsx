"use client";

import { useEffect, useRef, useState } from "react";
import { Comparison } from "@/lib/types";
import { PendingImage, fileToBase64 } from "@/lib/files";
import { track } from "@/lib/analytics";
import { COMPARE_EXAMPLE_IMAGES, COMPARE_EXAMPLE_RESULT } from "@/lib/demo-data";
import { CompareImportBlock } from "./CompareImportBlock";
import { CompareAnalyzing } from "./CompareAnalyzing";
import { CompareResultView } from "./CompareResultView";
import { Button } from "@/components/ui/Button";

type Step = "import" | "comparing" | "result";

const MIN_ANIMATION_MS = 2400;

interface CompareResult {
  a: { overall_score: number };
  b: { overall_score: number };
  comparison: Comparison;
}

function genId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

async function urlToFile(url: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  const name = url.split("/").pop() || "exemple.jpg";
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

export function CompareWizard() {
  const [step, setStep] = useState<Step>("import");
  const [imagesA, setImagesA] = useState<PendingImage[]>([]);
  const [imagesB, setImagesB] = useState<PendingImage[]>([]);
  const [isExample, setIsExample] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    track("compare_view");
  }, []);

  function addFiles(side: "a" | "b") {
    return (files: FileList) => {
      const setter = side === "a" ? setImagesA : setImagesB;
      const current = side === "a" ? imagesA : imagesB;
      const remaining = 6 - current.length;
      const toAdd = Array.from(files).slice(0, remaining);
      const next: PendingImage[] = toAdd.map((file) => ({
        id: genId(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setIsExample(false);
      setter((prev) => [...prev, ...next]);
    };
  }

  function replaceFiles(side: "a" | "b") {
    return (files: FileList) => {
      const setter = side === "a" ? setImagesA : setImagesB;
      const next: PendingImage[] = Array.from(files)
        .slice(0, 6)
        .map((file) => ({ id: genId(), file, previewUrl: URL.createObjectURL(file) }));
      setIsExample(false);
      setter(next);
    };
  }

  function removeImage(side: "a" | "b") {
    return (id: string) => {
      const setter = side === "a" ? setImagesA : setImagesB;
      setIsExample(false);
      setter((prev) => prev.filter((i) => i.id !== id));
    };
  }

  async function loadExample() {
    if (loadingExample) return;
    setLoadingExample(true);
    setError(null);
    track("test_clicked", { source: "compare_example" });
    try {
      const [fileA, fileB] = await Promise.all([
        urlToFile(COMPARE_EXAMPLE_IMAGES.a),
        urlToFile(COMPARE_EXAMPLE_IMAGES.b),
      ]);
      setImagesA([{ id: genId(), file: fileA, previewUrl: URL.createObjectURL(fileA) }]);
      setImagesB([{ id: genId(), file: fileB, previewUrl: URL.createObjectURL(fileB) }]);
      setIsExample(true);
    } catch {
      setError("L'exemple n'a pas pu être chargé. Merci de réessayer.");
    } finally {
      setLoadingExample(false);
    }
  }

  function useOwnListings() {
    setImagesA([]);
    setImagesB([]);
    setIsExample(false);
    setError(null);
  }

  async function handleCompare() {
    setError(null);
    setStep("comparing");
    startedAt.current = Date.now();
    track("compare_started", { example: isExample });

    function finish(payload: CompareResult) {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      const wait = Math.max(0, MIN_ANIMATION_MS - elapsed);
      setTimeout(() => {
        track("compare_completed", { example: isExample });
        setResult(payload);
        setStep("result");
      }, wait);
    }

    if (isExample) {
      finish(COMPARE_EXAMPLE_RESULT);
      return;
    }

    try {
      const [encodedA, encodedB] = await Promise.all([
        Promise.all(imagesA.map(async (img) => ({ ...(await fileToBase64(img.file)) }))),
        Promise.all(imagesB.map(async (img) => ({ ...(await fileToBase64(img.file)) }))),
      ]);

      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ a: encodedA, b: encodedB }),
      });
      let json: CompareResult & { error?: string };
      try {
        json = await res.json();
      } catch {
        throw new Error(
          "Une erreur est survenue. Essaie avec des captures moins nombreuses ou plus légères."
        );
      }
      if (!res.ok) throw new Error(json.error || "Une erreur est survenue. Merci de réessayer.");

      finish(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setStep("import");
    }
  }

  function handleRestart() {
    setImagesA([]);
    setImagesB([]);
    setIsExample(false);
    setResult(null);
    setStep("import");
  }

  if (step === "comparing") {
    return <CompareAnalyzing imageA={imagesA[0]?.previewUrl} imageB={imagesB[0]?.previewUrl} />;
  }

  if (step === "result" && result) {
    return (
      <CompareResultView
        a={result.a}
        b={result.b}
        comparison={result.comparison}
        imageA={imagesA[0]?.previewUrl}
        imageB={imagesB[0]?.previewUrl}
        onRestart={handleRestart}
      />
    );
  }

  const canCompare = imagesA.length > 0 && imagesB.length > 0;

  return (
    <div className="animate-fade-up mx-auto max-w-[1050px] px-5 py-8 sm:py-10">
      <div className="text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-2">
          Mode comparaison
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Laquelle tu cliquerais ?
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-muted">
          Deux annonces. Quelques secondes. Découvre laquelle donne le plus envie d&apos;en voir
          plus — et pourquoi.
        </p>

        {!isExample ? (
          <button
            type="button"
            onClick={loadExample}
            disabled={loadingExample}
            className="mt-2 text-sm text-muted underline underline-offset-2 hover:text-accent disabled:opacity-50"
          >
            {loadingExample ? "Chargement de l'exemple…" : "Voir un exemple avec 2 annonces"}
          </button>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-hover">
              Exemple de démonstration
            </span>
            <button
              type="button"
              onClick={useOwnListings}
              className="text-sm text-muted underline underline-offset-2 hover:text-accent"
            >
              Utiliser mes propres annonces
            </button>
          </div>
        )}
      </div>

      <p className="mx-auto mt-4 max-w-lg text-center text-sm text-muted-2">
        💡 Pour une comparaison plus juste, utilise deux photos de couverture de logements
        similaires.
      </p>

      <div className="relative mx-auto mt-4 max-w-[900px]">
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          <CompareImportBlock
            label="Annonce A"
            images={imagesA}
            onAddFiles={addFiles("a")}
            onReplaceFiles={replaceFiles("a")}
            onRemoveImage={removeImage("a")}
          />
          <CompareImportBlock
            label="Annonce B"
            images={imagesB}
            onAddFiles={addFiles("b")}
            onReplaceFiles={replaceFiles("b")}
            onRemoveImage={removeImage("b")}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition-all duration-300 ${
              canCompare
                ? "scale-110 border-accent bg-accent text-accent-foreground shadow-md"
                : "border-border bg-card text-muted shadow-sm"
            }`}
          >
            VS
          </span>
        </div>
      </div>

      {error && (
        <p className="mx-auto mt-4 max-w-2xl rounded-xl bg-score-low/10 px-4 py-3 text-center text-sm text-score-low">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col items-center">
        <Button
          size="lg"
          onClick={handleCompare}
          disabled={!canCompare}
          className={!canCompare ? "!bg-background-alt !text-muted-2 !shadow-none disabled:cursor-not-allowed" : ""}
        >
          {canCompare ? "Comparer les deux annonces" : "Ajoute 2 photos pour comparer"}
        </Button>
        <p className="mt-2 text-xs text-muted-2">Résultat en moins d&apos;une minute.</p>
      </div>
    </div>
  );
}
