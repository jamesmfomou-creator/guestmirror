"use client";

import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";

export function HeroForm() {
  const router = useRouter();

  function handleClick() {
    track("cta_test_clicked", { cta_location: "hero" });
    router.push("/analyze");
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-4 text-base font-semibold text-accent-foreground shadow-sm shadow-accent/20 transition-transform hover:scale-[1.02] hover:bg-accent-hover active:scale-[0.98]"
      >
        <span aria-hidden>📸</span>
        Tester mon annonce Airbnb
      </button>
      <p className="mt-2.5 text-center text-xs text-muted-2 lg:text-left">
        Capture d&apos;écran ou lien Airbnb
      </p>
    </div>
  );
}
