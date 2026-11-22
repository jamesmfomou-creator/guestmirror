"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, ArrowRight, Check } from "lucide-react";
import { track } from "@/lib/analytics";
import { isAirbnbUrl } from "@/lib/airbnbUrl";

// Lien Airbnb = méthode principale (données analytics: majorité des
// utilisateurs préfèrent coller leur lien plutôt qu'importer une capture).
// La capture reste un second choix pleinement fonctionnel, juste moins mis
// en avant visuellement. Le champ ne fait ici qu'une vérification de
// format légère (mêmes règles que lib/airbnbExtract.ts, voir
// lib/airbnbUrl.ts) -- l'extraction réelle reste entièrement gérée par le
// flow /analyze existant, rien n'est dupliqué ici.
export function HeroForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [startedTracked, setStartedTracked] = useState(false);

  function handleChange(value: string) {
    setUrl(value);
    setError(null);
    if (!startedTracked && value.trim().length > 0) {
      setStartedTracked(true);
      track("airbnb_url_started", { cta_location: "hero" });
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!isAirbnbUrl(trimmed)) {
      setError("Ce lien Airbnb ne semble pas valide.");
      return;
    }
    // airbnb_url_submitted fires later, once in AnalyzeWizard's goToEmail --
    // not here too, since landing on /analyze still requires confirming on
    // the import step (URL pre-filled) before it's truly "submitted".
    track("cta_test_clicked", { cta_location: "hero" });
    router.push(`/analyze?url=${encodeURIComponent(trimmed)}`);
  }

  function handleScreenshotClick() {
    track("cta_test_clicked", { cta_location: "hero_screenshot" });
    router.push("/analyze");
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[37rem]">
      <label htmlFor="hero-airbnb-url" className="sr-only">
        Colle ton lien Airbnb
      </label>
      <div className="group relative flex flex-col gap-2 rounded-[22px] border border-border bg-card/90 p-2 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_24px_48px_-28px_rgba(21,18,14,0.35)] backdrop-blur transition-all duration-300 focus-within:border-foreground/25 focus-within:shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_28px_56px_-28px_rgba(21,18,14,0.45)]">
        {/* Stacked at every width: the full CTA wording no longer fits beside
            the field without truncating the placeholder. */}
        <div className="flex items-center gap-3 pl-3">
          {/* Airbnb app icon (public/brand/airbnb-logo.png, from the owner's image):
              signals "paste your Airbnb link". GuestMirror stays independent of
              Airbnb (disclaimer in the footer). */}
          <Image
            src="/brand/airbnb-logo.png"
            alt=""
            aria-hidden
            width={28}
            height={28}
            className="h-[26px] w-[26px] shrink-0 sm:h-7 sm:w-7"
          />
          <input
            id="hero-airbnb-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Colle le lien de ton annonce Airbnb"
            className="w-full bg-transparent py-3 text-[15px] text-foreground placeholder:text-muted-2 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="btn-sheen group/btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] bg-accent px-6 py-3.5 text-[15px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          Analyser mon annonce gratuitement
          <ArrowRight size={16} className="transition-transform duration-300 group-hover/btn:translate-x-0.5" />
        </button>
      </div>
      {error && <p className="mt-2 pl-1 text-left text-sm text-score-low">{error}</p>}

      {/* One line from sm ("A · B"); two clean lines on phones, where the
          whole sentence does not fit and the dot would dangle. */}
      <p className="mt-3 flex flex-col items-center gap-0.5 text-[13px] text-muted sm:flex-row sm:justify-center sm:gap-1.5 lg:justify-start lg:pl-1">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Check aria-hidden size={14} strokeWidth={2.5} className="text-accent" />
          Premier diagnostic gratuit
        </span>
        <span aria-hidden className="hidden text-muted-2 sm:inline">·</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Check aria-hidden size={14} strokeWidth={2.5} className="text-accent sm:hidden" />
          Sans modification de ton annonce
        </span>
      </p>

      <button
        type="button"
        onClick={handleScreenshotClick}
        className="mt-3 inline-flex items-center gap-2 pl-1 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ImagePlus size={15} />
        Ou importe une capture d&apos;écran
      </button>
    </form>
  );
}
