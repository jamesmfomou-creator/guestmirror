"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, useRef } from "react";
import { track } from "@/lib/analytics";
import { setPendingFiles } from "@/lib/pendingUpload";

export function HeroForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    track("cta_test_clicked", { cta_location: "hero" });
    track("upload_started");
    inputRef.current?.click();
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      setPendingFiles(e.target.files);
      router.push("/analyze");
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground shadow-sm shadow-accent/20 transition-transform hover:scale-[1.02] hover:bg-accent-hover active:scale-[0.98]"
      >
        <span aria-hidden>📸</span>
        Importer une capture de mon annonce
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
  );
}
