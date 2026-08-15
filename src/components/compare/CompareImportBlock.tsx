"use client";

import { ChangeEvent, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { PendingImage } from "@/lib/files";

const MAX_IMAGES = 6;

export function CompareImportBlock({
  label,
  images,
  onAddFiles,
  onReplaceFiles,
  onRemoveImage,
}: {
  label: string;
  images: PendingImage[];
  onAddFiles: (files: FileList) => void;
  onReplaceFiles: (files: FileList) => void;
  onRemoveImage: (id: string) => void;
}) {
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  function handleAddChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) onAddFiles(e.target.files);
    e.target.value = "";
  }

  function handleReplaceChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) onReplaceFiles(e.target.files);
    e.target.value = "";
  }

  const [cover, ...rest] = images;

  if (!cover) {
    return (
      <div>
        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:text-accent hover:shadow-md active:scale-[0.98]"
        >
          <span className="rounded-full bg-background-alt px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
            {label}
          </span>
          <ImagePlus size={26} className="mt-1" />
          <span className="text-sm font-semibold text-foreground">Ajouter une capture</span>
          <span className="text-xs text-muted-2">Photo principale recommandée</span>
        </button>
        <input
          ref={addInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleAddChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cover.previewUrl} alt="" className="h-full w-full object-cover" />
        <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
          {label}
        </span>
        <button
          type="button"
          onClick={() => replaceInputRef.current?.click()}
          className="absolute bottom-2 right-2 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black/80"
        >
          Changer
        </button>
      </div>

      {rest.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {rest.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemoveImage(img.id)}
                aria-label="Retirer cette image"
                className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length < MAX_IMAGES && (
        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          className="mt-2 text-xs font-medium text-muted underline underline-offset-2 hover:text-accent"
        >
          Ajouter une autre capture
        </button>
      )}

      <input
        ref={addInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={handleAddChange}
        className="hidden"
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={handleReplaceChange}
        className="hidden"
      />
    </div>
  );
}
