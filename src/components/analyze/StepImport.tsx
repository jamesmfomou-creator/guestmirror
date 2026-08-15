"use client";

import { ChangeEvent, useRef } from "react";
import { X, ImagePlus } from "lucide-react";
import { PendingImage } from "@/lib/files";
import { Button } from "@/components/ui/Button";

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
}: {
  url: string;
  onUrlChange: (v: string) => void;
  images: PendingImage[];
  onAddFiles: (files: FileList) => void;
  onRemoveImage: (id: string) => void;
  onContinue: () => void;
  canContinue: boolean;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) onAddFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Voyons ce qu&apos;un voyageur voit en premier
      </h1>
      <p className="mt-3 text-muted">
        Importe quelques captures de ton annonce pour découvrir sa première impression.
      </p>

      <div className="card mt-8 p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">
            Importe tes captures d&apos;annonce
          </p>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-hover">
            Recommandé
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-2">{HINTS.join(" • ")}</p>

        {images.length === 0 && (
          <p className="mt-4 text-sm font-medium text-foreground">
            Commence par ta photo de couverture.
          </p>
        )}

        {images.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {images.map((img) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveImage(img.id)}
                  aria-label="Retirer cette image"
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
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
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <ImagePlus size={18} />
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
      </div>

      <div className="my-6 h-px bg-border" />

      <div className="p-1">
        <label className="text-sm text-muted-2">Ou ajoute le lien de ton annonce</label>
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://www.airbnb..."
          className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-score-low/10 px-4 py-3 text-sm text-score-low">{error}</p>
      )}

      <Button size="lg" className="mt-8 w-full" onClick={onContinue} disabled={!canContinue}>
        Continuer
      </Button>
    </div>
  );
}
