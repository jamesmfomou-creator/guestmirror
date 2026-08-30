import { Check } from "lucide-react";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { HeroForm } from "@/components/landing/HeroForm";
import { HeroProductDemo } from "@/components/landing/HeroProductDemo";
import { StepsShowcase } from "@/components/landing/StepsShowcase";
import { BeforeAfterShowcase } from "@/components/landing/BeforeAfterShowcase";
import { LandingCompareTeaser } from "@/components/landing/LandingCompareTeaser";
import { WhatWeSee } from "@/components/landing/WhatWeSee";
import { ReportMockup } from "@/components/landing/ReportMockup";
import { SimpleBand } from "@/components/landing/SimpleBand";
import { FAQAccordion } from "@/components/landing/FAQAccordion";
import { Reveal } from "@/components/landing/Reveal";
import { BRAND_NAME } from "@/lib/brand";
import { CtaTrackedButton } from "@/components/landing/CtaTrackedButton";

const CHECKS = [
  "Gratuit pour commencer",
  "Résultat en moins d'une minute",
  "Aucune connexion Airbnb",
];

const PRICING_FEATURES = [
  "Photo de couverture",
  "Ordre des photos",
  "Différenciation",
  "3 propositions de titre",
  "Description retravaillée",
  "Questions voyageurs",
  "Top 3 actions prioritaires",
  "Nouveau test après correction",
];

const FAQ = [
  {
    q: `${BRAND_NAME} est-il affilié à Airbnb ?`,
    a: `Non. ${BRAND_NAME} est un service indépendant et n'est ni affilié, ni sponsorisé, ni approuvé par Airbnb.`,
  },
  {
    q: "Comment fonctionne le score ?",
    a: `Le score /100 est une évaluation indépendante produite par ${BRAND_NAME} à partir des éléments visibles de ton annonce (photos, titre, description) : ce qu'un voyageur comprend et retient en quelques secondes.`,
  },
  {
    q: "Dois-je connecter mon compte Airbnb ?",
    a: "Non, jamais. Il te suffit d'importer une capture d'écran de ton annonce — tes captures servent uniquement à produire ton analyse.",
  },
  {
    q: `Est-ce que ${BRAND_NAME} garantit plus de réservations ?`,
    a: `Non. ${BRAND_NAME} mesure la qualité perçue de la présentation de ton annonce. Il ne prédit ni ne garantit un nombre de clics ou de réservations.`,
  },
  {
    q: "Combien coûte l'analyse complète ?",
    a: "9,90 € en paiement unique, sans abonnement ni renouvellement automatique.",
  },
];

export default function LandingPage() {
  return (
    <>
      <AnalyticsBeacon event="landing_view" />

      {/* HERO */}
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
          <div className="text-center lg:text-left">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Ton Airbnb passe-t-il le test des 5 secondes ?
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted lg:mx-0">
              Importe ton annonce et découvre en quelques secondes ce qu&apos;un voyageur voit,
              comprend… et ce qui le fait hésiter.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 lg:items-start">
              <HeroForm />
              <a
                href="#comment-ca-marche"
                className="text-sm font-medium text-muted transition-opacity hover:opacity-70"
              >
                Voir comment ça marche
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-2 lg:justify-start">
              {CHECKS.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5">
                  <Check size={13} className="text-score-high" />
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <HeroProductDemo />
            <p className="max-w-xs text-center text-xs text-muted-2">
              Exemple de démonstration. Tes propres captures servent uniquement à produire ton
              analyse.
            </p>
          </div>
        </div>
      </section>

      <div id="comment-ca-marche">
        <StepsShowcase />
      </div>

      <BeforeAfterShowcase />

      {/* COMPARE MODE */}
      <section className="border-t border-border/70 bg-background-alt/50 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Laquelle tu cliquerais ?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted">
              Deux annonces. Quelques secondes. Découvre laquelle crée la meilleure première
              impression — et pourquoi.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="mt-8">
            <LandingCompareTeaser />
          </Reveal>
        </div>
      </section>

      <WhatWeSee />

      <ReportMockup />

      <SimpleBand />

      {/* PRICING */}
      <section className="border-t border-border/70 py-20 sm:py-28">
        <Reveal className="mx-auto max-w-md px-5 text-center">
          <div className="card p-8 shadow-[0_24px_60px_-30px_rgba(28,26,23,0.2)] sm:p-10">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Découvre exactement quoi améliorer.
            </h2>
            <ul className="mx-auto mt-7 max-w-xs space-y-2.5 text-left">
              {PRICING_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-foreground">
                  <Check size={16} className="mt-0.5 shrink-0 text-score-high" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-7 text-5xl font-semibold tracking-tight">9,90 €</p>
            <p className="mt-2 text-sm text-muted">Paiement unique • Aucun abonnement</p>
            <CtaTrackedButton href="/analyze" size="lg" className="mt-7" ctaLocation="pricing">
              Faire mon test gratuitement
            </CtaTrackedButton>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/70 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl px-5">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              Questions fréquentes
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <FAQAccordion items={FAQ} />
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-border/70 bg-background-alt/50 py-20 sm:py-28">
        <Reveal className="mx-auto max-w-lg px-5 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Et ton annonce ?</h2>
          <p className="mt-4 text-muted">
            Découvre ce qu&apos;un voyageur voit pendant ses premières secondes.
          </p>
          <CtaTrackedButton href="/analyze" size="lg" className="mt-7" ctaLocation="final_cta">
            Faire le test des 5 secondes
          </CtaTrackedButton>
          <p className="mt-3 text-xs text-muted-2">
            Gratuit pour commencer • Résultat en moins d&apos;une minute
          </p>
        </Reveal>
      </section>
    </>
  );
}
