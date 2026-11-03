"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Link2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
      <label htmlFor="hero-airbnb-url" className="sr-only">
        Colle ton lien Airbnb
      </label>
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-[0_8px_28px_-14px_rgba(28,26,23,0.22)] transition-shadow focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 sm:flex-row sm:items-center sm:gap-1.5">
        <div className="flex items-center gap-2 pl-2.5 sm:flex-1">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Link2 size={16} strokeWidth={2.25} />
          </span>
          <input
            id="hero-airbnb-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="https://www.airbnb.fr/rooms/…"
            className="w-full bg-transparent py-2.5 text-base text-foreground placeholder:text-muted-2 focus:outline-none"
          />
        </div>
        <Button type="submit" size="lg" className="w-full shrink-0 gap-1.5 sm:w-auto">
          Analyser
          <ArrowRight size={16} />
        </Button>
      </div>
      {error && <p className="mt-2 text-left text-sm text-score-low">{error}</p>}

      <div className="mt-4 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-2">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full"
        onClick={handleScreenshotClick}
      >
        <ImagePlus size={16} />
        Importer une capture d&apos;écran
      </Button>
    </form>
  );
}
