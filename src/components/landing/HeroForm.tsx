"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
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
// Airbnb "Bélo" mark (path: Simple Icons 13.21.0), Airbnb Rausch colour.
// Signals "paste your Airbnb link" in the field; GuestMirror stays
// independent of Airbnb (disclaimer in the footer).
function AirbnbMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="#FF385C" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.001 18.275c-1.353-1.697-2.148-3.184-2.413-4.457-.263-1.027-.16-1.848.291-2.465.477-.71 1.188-1.056 2.121-1.056s1.643.345 2.12 1.063c.446.61.558 1.432.286 2.465-.291 1.298-1.085 2.785-2.412 4.458zm9.601 1.14c-.185 1.246-1.034 2.28-2.2 2.783-2.253.98-4.483-.583-6.392-2.704 3.157-3.951 3.74-7.028 2.385-9.018-.795-1.14-1.933-1.695-3.394-1.695-2.944 0-4.563 2.49-3.927 5.382.37 1.565 1.352 3.343 2.917 5.332-.98 1.085-1.91 1.856-2.732 2.333-.636.344-1.245.558-1.828.609-2.679.399-4.778-2.2-3.825-4.88.132-.345.395-.98.845-1.961l.025-.053c1.464-3.178 3.242-6.79 5.285-10.795l.053-.132.58-1.116c.45-.822.635-1.19 1.351-1.643.346-.21.77-.315 1.246-.315.954 0 1.698.558 2.016 1.007.158.239.345.557.582.953l.558 1.089.08.159c2.041 4.004 3.821 7.608 5.279 10.794l.026.025.533 1.22.318.764c.243.613.294 1.222.213 1.858zm1.22-2.39c-.186-.583-.505-1.271-.9-2.094v-.03c-1.889-4.006-3.642-7.608-5.307-10.844l-.111-.163C15.317 1.461 14.468 0 12.001 0c-2.44 0-3.476 1.695-4.535 3.898l-.081.16c-1.669 3.236-3.421 6.843-5.303 10.847v.053l-.559 1.22c-.21.504-.317.768-.345.847C-.172 20.74 2.611 24 5.98 24c.027 0 .132 0 .265-.027h.372c1.75-.213 3.554-1.325 5.384-3.317 1.829 1.989 3.635 3.104 5.382 3.317h.372c.133.027.239.027.265.027 3.37.003 6.152-3.261 4.802-6.975z" />
    </svg>
  );
}

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
          <AirbnbMark className="h-[19px] w-[19px] shrink-0" />
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
