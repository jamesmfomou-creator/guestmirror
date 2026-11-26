"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { track } from "@/lib/analytics";
import { isAirbnbUrl } from "@/lib/airbnbUrl";

// Lien Airbnb = méthode principale (données analytics: majorité des
// utilisateurs préfèrent coller leur lien plutôt qu'importer une capture).
// La capture reste un second choix pleinement fonctionnel, juste moins mis
// en avant visuellement. Le champ ne fait ici qu'une vérification de
// format légère (mêmes règles que lib/airbnbExtract.ts, voir
// lib/airbnbUrl.ts) -- l'extraction réelle reste entièrement gérée par le
// flow /analyze existant, rien n'est dupliqué ici.
// The reassurance line and the "Ou importe une capture d'écran" link under
// the form were removed at the owner's request on 2026-11-26.
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

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[37rem]">
      <label htmlFor="hero-airbnb-url" className="sr-only">
        Colle ton lien Airbnb
      </label>
      {/* < lg: rounder "pill" block, warm shadow, accent focus ring (Remakeit-like
          try-it feel). lg+: unchanged. */}
      <div className="group relative flex flex-col gap-2 rounded-[22px] border border-border bg-card/90 p-2 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_24px_48px_-28px_rgba(21,18,14,0.35)] backdrop-blur transition-all duration-300 focus-within:border-foreground/25 focus-within:shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_28px_56px_-28px_rgba(21,18,14,0.45)] max-lg:gap-1.5 max-lg:rounded-[28px] max-lg:bg-card max-lg:p-1.5 max-lg:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_22px_44px_-24px_rgba(217,103,63,0.45),0_2px_6px_-2px_rgba(21,18,14,0.08)] max-lg:focus-within:border-accent/45 max-lg:focus-within:shadow-[0_0_0_4px_rgba(217,103,63,0.14),0_22px_44px_-24px_rgba(217,103,63,0.5)]">
        {/* Stacked at every width: the full CTA wording no longer fits beside
            the field without truncating the placeholder. */}
        <div className="flex items-center gap-3 pl-3 max-lg:gap-2.5 max-lg:pl-2.5">
          {/* Airbnb app icon (public/brand/airbnb-logo.png, from the owner's image):
              signals "paste your Airbnb link". GuestMirror stays independent of
              Airbnb (disclaimer in the footer). */}
          <Image
            src="/brand/airbnb-logo.png"
            alt=""
            aria-hidden
            width={28}
            height={28}
            className="h-[30px] w-[30px] shrink-0 sm:h-8 sm:w-8 lg:h-7 lg:w-7"
          />
          <input
            id="hero-airbnb-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Colle le lien de ton annonce Airbnb"
            className="hero-url-input w-full min-w-0 bg-transparent py-3 text-[15px] text-foreground placeholder:text-muted-2 focus:outline-none max-lg:py-3.5 max-lg:text-[16px] max-sm:py-2.5"
          />
        </div>
        <button
          type="submit"
          className="btn-sheen group/btn inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] bg-accent px-6 py-3.5 text-[15px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover max-lg:min-h-[54px] max-sm:min-h-[48px] max-sm:py-2.5 max-lg:gap-[clamp(4px,1.6vw,8px)] max-lg:rounded-full max-lg:px-[clamp(10px,4.5vw,20px)] max-lg:text-[clamp(13.5px,4.1vw,16px)] max-lg:font-semibold max-lg:shadow-[0_14px_28px_-12px_rgba(217,103,63,0.75),inset_0_1px_0_rgba(255,255,255,0.25)]"
        >
          Analyser mon annonce
          <ArrowRight size={16} className="shrink-0 transition-transform duration-300 group-hover/btn:translate-x-0.5" />
        </button>
      </div>
      {error && <p className="mt-2 pl-1 text-left text-sm text-score-low">{error}</p>}
    </form>
  );
}
