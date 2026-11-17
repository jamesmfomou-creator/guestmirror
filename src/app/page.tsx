import type { Metadata } from "next";
import { ArrowDown, ArrowRight, Zap } from "lucide-react";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { HeroForm } from "@/components/landing/HeroForm";
import { HeroProductDemo } from "@/components/landing/HeroProductDemo";
import { StepsShowcase } from "@/components/landing/StepsShowcase";
import { BeforeAfterShowcase } from "@/components/landing/BeforeAfterShowcase";
import { LandingCompareTeaser } from "@/components/landing/LandingCompareTeaser";
import { WhatWeSee } from "@/components/landing/WhatWeSee";
import { ReportMockup } from "@/components/landing/ReportMockup";
import { SocialProof } from "@/components/landing/SocialProof";
import { ScrollingShowcase } from "@/components/landing/ScrollingShowcase";
import { CaseStudiesCarousel } from "@/components/landing/CaseStudiesCarousel";
import { getShowcaseItems } from "@/lib/showcase";
import { PricingCards } from "@/components/pricing/PricingCards";
import { FAQAccordion } from "@/components/landing/FAQAccordion";
import { Reveal } from "@/components/landing/Reveal";
import { BRAND_NAME } from "@/lib/brand";
import { CtaTrackedButton } from "@/components/landing/CtaTrackedButton";
import { SectionHeading } from "@/components/landing/SectionHeading";
import { StaggerWords } from "@/components/landing/StaggerWords";
import { ResumeAnalysisBanner } from "@/components/analyze/ResumeAnalysisBanner";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// The social proof count is a real DB read (see SocialProof) -- revalidate
// periodically instead of on every request so the landing page stays
// effectively static.
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
    a: "7,90 € en paiement unique pour le rapport complet d'une annonce. 34,90 €/mois avec l'offre Conciergerie pour 20 analyses par mois (résiliable à tout moment). Ou 89 € une seule fois pour l'accès à vie, avec des analyses illimitées et sans abonnement.",
  },
];

export default async function LandingPage() {
  const showcaseItems = await getShowcaseItems();

  return (
    <div className="grain">
      <AnalyticsBeacon event="landing_view" />

      {/* Renders nothing unless this browser started an analysis it never
          saw the result of (see lib/analysisRecovery.ts). */}
      <ResumeAnalysisBanner className="mx-auto max-w-lg px-5 pt-6" />

      {/* HERO */}
      <section className="relative overflow-x-clip">
        <div aria-hidden className="hero-grid pointer-events-none absolute inset-x-0 -top-24 h-[760px]" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-48 left-1/2 h-[560px] w-[min(1000px,140vw)] -translate-x-1/2 rounded-full bg-accent/[0.09] blur-[120px]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 pt-14 pb-20 sm:pt-20 lg:grid-cols-[1.12fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
          {/* Centred on mobile, left-aligned from lg (desktop layout unchanged). */}
          <div className="flex flex-col items-center text-center lg:block lg:text-left">
            <Reveal y={8}>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card/70 px-3.5 py-2 text-[12.5px] backdrop-blur sm:gap-2 sm:px-4 sm:text-[14px]">
                <span className="font-bold tracking-tight text-foreground uppercase">Diagnostic IA</span>
                <Zap aria-hidden size={15} className="fill-accent text-accent" />
                <span className="font-medium text-muted">Résultat en moins d&apos;une minute</span>
              </span>
            </Reveal>

            <StaggerWords
              className="text-display mt-7 text-[3.15rem] text-foreground sm:text-[4.4rem] lg:text-[5.25rem]"
              segments={[{ text: "Améliore ton annonce Airbnb pour" }, { text: "donner envie de réserver.", em: true }]}
            />

            <Reveal delay={0.35}>
              <p className="mx-auto mt-7 max-w-lg text-pretty text-lg leading-relaxed text-muted lg:mx-0">
                Colle ton lien Airbnb. {BRAND_NAME} analyse ton annonce, identifie ses points faibles et
                te montre comment l&apos;améliorer.
              </p>
            </Reveal>

            <Reveal delay={0.45} className="mt-9 flex w-full justify-center lg:block">
              <HeroForm />
            </Reveal>

            <Reveal delay={0.55} className="mt-9 flex flex-col items-center gap-5 lg:items-start">
              <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-muted lg:justify-start">
                {CHECKS.map((c) => (
                  <li key={c} className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
                    {c}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                <SocialProof />
                <a
                  href="#methode"
                  className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
                >
                  Voir comment ça marche
                  <ArrowDown size={14} className="transition-transform duration-300 group-hover:translate-y-0.5" />
                </a>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.25} y={24} className="flex flex-col items-center gap-4">
            <HeroProductDemo />
            <p className="max-w-xs text-center text-xs text-muted-2">
              Exemple de démonstration. Tes propres captures servent uniquement à produire ton analyse.
            </p>
          </Reveal>
        </div>
      </section>

      <ScrollingShowcase items={showcaseItems} className="border-y border-border/70 py-5" />

      {/* 01 — the report */}
      <div id="exemple" className="scroll-mt-24">
        <ReportMockup />
      </div>

      {/* 02 — method */}
      <div id="methode" className="scroll-mt-24">
        <span id="comment-ca-marche" className="block scroll-mt-24" aria-hidden />
        <StepsShowcase />
        <WhatWeSee />
      </div>

      {/* 03 — progression (dark) */}
      <BeforeAfterShowcase />

      {/* 04 — illustrative cases */}
      <CaseStudiesCarousel />

      {/* 05 — compare mode */}
      <section className="border-t border-border/70 py-24 sm:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <SectionHeading
            index="05"
            label="Mode comparaison"
            title={
              <>
                Laquelle <em>tu cliquerais</em> ?
              </>
            }
            description="Deux annonces. Quelques secondes. Découvre laquelle crée la meilleure première impression — et pourquoi."
          />
          <Reveal delay={0.1}>
            <LandingCompareTeaser />
          </Reveal>
        </div>
      </section>

      {/* 06 — pricing */}
      <section id="tarifs" className="scroll-mt-24 border-t border-border/70 bg-background-alt/60 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading
            index="06"
            label="Tarifs"
            align="center"
            title={
              <>
                Découvre exactement <em>quoi améliorer</em>
              </>
            }
            description="Un rapport pour ton annonce, 20 analyses par mois pour tes logements, ou un accès à vie sans abonnement."
          />
        </div>
        <Reveal className="mx-auto mt-14 max-w-5xl px-5 text-center">
          {/* Every CTA starts with a free analysis; the offer is chosen on the
              diagnostic page (the paywall), where checkout happens. */}
          <PricingCards
            oneTimeAction={
              <CtaTrackedButton
                href="/analyze"
                size="lg"
                variant="outline"
                className="mt-6 w-full whitespace-normal text-[15px] sm:text-base"
                ctaLocation="pricing_one_time"
              >
                Analyser mon annonce
              </CtaTrackedButton>
            }
            conciergerieAction={
              <CtaTrackedButton
                href="/analyze"
                size="lg"
                className="btn-sheen mt-6 w-full whitespace-normal text-[15px] sm:text-base"
                ctaLocation="pricing_conciergerie"
              >
                Choisir Conciergerie
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
                Obtenir l&apos;accès à vie
              </CtaTrackedButton>
            }
          />
        </Reveal>
      </section>

      {/* Testimonials section removed from the landing on the owner's request
          (2026-11-16) while there is only one short testimonial. To bring it
          back: render <TestimonialsSection /> here again (it still only shows
          real, consented testimonials). */}

      {/* 07 — FAQ */}
      <section className="border-t border-border/70 py-24 sm:py-32">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[1fr_1.35fr] lg:gap-20">
          <SectionHeading
            index="07"
            label="Questions"
            title={
              <>
                Questions <em>fréquentes</em>
              </>
            }
            description={`Tout ce qu'il faut savoir avant de tester ton annonce avec ${BRAND_NAME}.`}
          />
          <Reveal delay={0.1}>
            <FAQAccordion items={FAQ} />
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA (dark) */}
      <section className="px-4 pb-16 sm:px-5 sm:pb-24">
        <div className="theme-ink relative mx-auto max-w-6xl overflow-hidden rounded-[32px] px-6 py-20 text-center sm:px-12 sm:py-28">
          <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-accent/30 blur-[120px]" />
          <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 opacity-[0.35] invert" />
          <Reveal className="relative mx-auto max-w-2xl">
            <span className="label-mono text-muted-2">Ton tour</span>
            <h2 className="text-display mt-5 text-[3rem] text-foreground sm:text-[4.5rem]">
              Et <em className="text-accent">ton annonce</em> ?
            </h2>
            <p className="mx-auto mt-5 max-w-md text-lg text-muted">
              Découvre ce qu&apos;un voyageur voit pendant ses premières secondes.
            </p>
            <CtaTrackedButton
              href="/analyze"
              size="lg"
              className="btn-sheen group mt-9 gap-2"
              ctaLocation="final_cta"
            >
              Faire le test des 5 secondes
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </CtaTrackedButton>
            <p className="mt-4 text-xs text-muted-2">Gratuit pour commencer • Résultat en quelques instants</p>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
