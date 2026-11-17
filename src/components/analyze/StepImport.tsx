"use client";

import { ChangeEvent, useRef } from "react";
import { X, ImagePlus, Link2, ArrowRight } from "lucide-react";
import { PendingImage } from "@/lib/files";
import { Button } from "@/components/ui/Button";
import { ErrorNote, FieldLabel, OnboardingHeading, Surface } from "./OnboardingUI";

const HINTS = ["Page principale", "Premières photos", "Titre", "Description"];

export function StepImport({
  url,
  onUrlChange,
  images,
  onAddFiles,
  onRemoveImage,
  onContinue,
  canContinue,
  error,
  continueLabel = "Continuer",
}: {
  url: string;
  onUrlChange: (v: string) => void;
  images: PendingImage[];
  onAddFiles: (files: FileList) => void;
  onRemoveImage: (id: string) => void;
  onContinue: () => void;
  canContinue: boolean;
  error?: string | null;
  continueLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) onAddFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <div className="animate-fade-up">
      <OnboardingHeading
        title={
          <>
            Voyons ce qu&apos;un voyageur <em>voit en premier</em>
          </>
        }
        description="Importe quelques captures de ton annonce pour découvrir sa première impression."
      />

      <Surface className="mt-9">
        <FieldLabel
          aside={
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-hover">
              Recommandé
            </span>
          }
        >
          Colle le lien de ton annonce
        </FieldLabel>
        <div className="group mt-4 flex items-center gap-3 rounded-2xl border border-border bg-background px-4 transition-all focus-within:border-foreground/40 focus-within:shadow-[0_0_0_4px_rgba(217,108,63,0.12)]">
          <Link2 aria-hidden size={18} className="shrink-0 text-muted-2 transition-colors group-focus-within:text-accent" />
          <input
            type="text"
            inputMode="url"
            aria-label="Colle le lien de ton annonce"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://www.airbnb..."
            className="w-full bg-transparent py-3.5 text-[15px] text-foreground placeholder:text-muted-2 focus:outline-none"
          />
        </div>
      </Surface>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="label-mono text-muted-2">Ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Surface>
        <FieldLabel>Importe tes captures d&apos;annonce</FieldLabel>
        <p className="mt-2 text-[13px] text-muted">{HINTS.join(" · ")}</p>

        {images.length === 0 && (
          <p className="mt-4 text-sm font-medium text-foreground">Commence par ta photo de couverture.</p>
        )}

        {images.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
            {images.map((img, i) => (
              <div
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-border shadow-sm animate-fade-up"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                    Couverture
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveImage(img.id)}
                  aria-label="Retirer cette image"
                  className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-transform hover:scale-110"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={images.length >= 10}
          className="group mt-5 flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-foreground/20 bg-background/50 py-7 text-sm font-medium text-muted transition-all hover:border-accent hover:bg-accent-soft/40 hover:text-accent-hover disabled:opacity-50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5">
            <ImagePlus size={18} />
          </span>
          {images.length === 0 ? "Ajouter des captures (1 à 10)" : "Ajouter d'autres captures"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </Surface>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Button size="lg" className="btn-sheen group mt-8 w-full sm:w-full" onClick={onContinue} disabled={!canContinue}>
        {continueLabel}
        <ArrowRight aria-hidden size={18} className="transition-transform duration-300 group-hover:translate-x-0.5" />
      </Button>
    </div>
  );
}
