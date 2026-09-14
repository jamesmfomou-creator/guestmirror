import type { Metadata } from "next";
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
import { SocialProof } from "@/components/landing/SocialProof";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { PricingCards } from "@/components/pricing/PricingCards";
import { FAQAccordion } from "@/components/landing/FAQAccordion";
import { Reveal } from "@/components/landing/Reveal";
import { BRAND_NAME } from "@/lib/brand";
import { CtaTrackedButton } from "@/components/landing/CtaTrackedButton";
import { getLifetimePriceLabel } from "@/lib/lifetimePrice";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Social proof count and testimonials are real DB reads (see
// SocialProof/TestimonialsSection) -- revalidate periodically instead of
// on every request so the landing page stays effectively static.
export const revalidate = 3600;

const CHECKS = [
  "Gratuit pour commencer",
  "Résultat en quelques instants",
  "Aucune connexion Airbnb",
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
    a: "4,90 € en paiement unique pour une analyse, ou 6,90 €/mois avec GuestMirror Plus pour tester et améliorer régulièrement. L'abonnement est annulable à tout moment.",
  },
];

export default async function LandingPage() {
  const lifetimePriceLabel = await getLifetimePriceLabel();

  return (
    <>
      <AnalyticsBeacon event="landing_view" />

      {/* HERO */}
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20 sm:pb-24">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
          <div className="text-center lg:text-left">
            <h1 className="font-display text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
              Ton Airbnb passe-t-il le test des 5 secondes ?
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted lg:mx-0">
              Apporte ton annonce Airbnb et découvre en quelques secondes ce qu&apos;un voyageur
              voit, comprend… et ce qui le fait hésiter.
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
            <div className="mt-4 flex justify-center lg:justify-start">
              <SocialProof />
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
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
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
        <Reveal className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Découvre exactement quoi améliorer
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
            Une analyse ponctuelle pour corriger maintenant, ou un accès régulier pour tester et
            comparer tes améliorations.
          </p>

          <div className="mt-8">
            <PricingCards
              lifetimePriceLabel={lifetimePriceLabel}
              oneTimeAction={
                <CtaTrackedButton
                  href="/analyze"
                  size="lg"
                  variant="outline"
                  className="mt-6 w-full whitespace-normal text-[15px] sm:text-base"
                  ctaLocation="pricing_one_time"
                >
                  Débloquer mon analyse — 4,90&nbsp;€
                </CtaTrackedButton>
              }
              plusAction={
                <CtaTrackedButton
                  href="/analyze"
                  size="lg"
                  className="mt-6 w-full whitespace-normal text-[15px] sm:text-base"
                  ctaLocation="pricing_plus"
                >
                  Passer à GuestMirror Plus — 6,90&nbsp;€/mois
                </CtaTrackedButton>
              }
              lifetimeAction={
                <CtaTrackedButton
                  href="/analyze"
                  size="lg"
                  variant="outline"
                  className="mt-6 w-full whitespace-normal text-[15px] sm:text-base"
                  ctaLocation="pricing_lifetime"
                >
                  Débloquer l&apos;accès à vie
                </CtaTrackedButton>
              }
            />
          </div>
        </Reveal>
      </section>

      <TestimonialsSection />

      {/* FAQ */}
      <section className="border-t border-border/70 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl px-5">
          <Reveal>
            <h2 className="font-display text-center text-2xl font-bold tracking-tight sm:text-3xl">
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
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Et ton annonce ?</h2>
          <p className="mt-4 text-muted">
            Découvre ce qu&apos;un voyageur voit pendant ses premières secondes.
          </p>
          <CtaTrackedButton href="/analyze" size="lg" className="mt-7" ctaLocation="final_cta">
            Faire le test des 5 secondes
          </CtaTrackedButton>
          <p className="mt-3 text-xs text-muted-2">
            Gratuit pour commencer • Résultat en quelques instants
          </p>
        </Reveal>
      </section>
    </>
  );
}
