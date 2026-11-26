import type { Metadata } from "next";
import { ArrowDown, ArrowRight, CalendarCheck, Clock, Tag, TrendingUp } from "lucide-react";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { HeroForm } from "@/components/landing/HeroForm";
// HeroLaptopDemo (diagnostic mockup) is kept in components/landing for reuse further down the page.
import { HeroBookingVisual } from "@/components/landing/HeroBookingVisual";
import { StepsShowcase } from "@/components/landing/StepsShowcase";
import { BeforeAfterShowcase } from "@/components/landing/BeforeAfterShowcase";
import { WhatWeSee } from "@/components/landing/WhatWeSee";
import { ReportMockup } from "@/components/landing/ReportMockup";
import { HeroAnalysesProof } from "@/components/landing/HeroAnalysesProof";
import { ScrollingShowcase } from "@/components/landing/ScrollingShowcase";
import { CaseStudiesCarousel } from "@/components/landing/CaseStudiesCarousel";
import { getShowcaseItems } from "@/lib/showcase";
import { LifetimePromoCards } from "@/components/promo/LifetimePromoCards";
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

// The social proof count is a real DB read (see HeroAnalysesProof) -- revalidate
// periodically instead of on every request so the landing page stays
// effectively static.
export const revalidate = 3600;

const HERO_BENEFITS = [
  { icon: CalendarCheck, text: "Moins de nuits vides" },
  { icon: Clock, text: "Gagne du temps" },
  { icon: Tag, text: "Sans baisser tes prix" },
];

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
    a: "Non, jamais. Il te suffit de coller le lien public de ton annonce : on lit uniquement ce que n'importe quel voyageur peut voir.",
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
        {/* grid-cols-1 = minmax(0,1fr): a wide child can no longer widen the
            column past the screen and push the form out on small phones. */}
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-3 px-5 pt-2 pb-16 sm:gap-10 sm:pt-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-8 xl:max-w-[84rem] xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] xl:gap-4 lg:pt-20 lg:pb-28">
          {/* Centred on mobile, left-aligned from lg (desktop layout unchanged). */}
          <div className="flex flex-col items-center text-center lg:block lg:text-left">
            {/* Phones: no badge (first screen = title, form and visual). */}
            <div className="hidden sm:block">
            <Reveal y={8}>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card/70 px-3.5 py-2 text-[12.5px] backdrop-blur max-sm:gap-[clamp(3px,1.2vw,6px)] max-sm:px-[clamp(9px,3.4vw,14px)] max-sm:py-1.5 max-sm:text-[clamp(10.5px,3vw,12.5px)] sm:gap-2 sm:px-4 sm:text-[14px]">
                <TrendingUp aria-hidden size={15} strokeWidth={2.4} className="text-accent" />
                <span className="font-semibold text-foreground">L&apos;assistant des hôtes Airbnb</span>
              </span>
            </Reveal>
            </div>

            {/* Mobile first (Instagram traffic): compact type and spacing so the
                link field and the CTA stay above the fold on small phones. */}
            <StaggerWords
              className="text-display mt-1 text-balance text-[clamp(1.55rem,7.5vw,2.1rem)] leading-[1.05] text-foreground sm:mt-7 sm:text-[3.6rem] lg:text-[3.2rem] lg:leading-[1.04] xl:text-[3.55rem]"
              segments={[
                { text: "Moins de nuits vides." },
                { text: "Plus de réservations.", em: true, br: true },
              ]}
            />

            <Reveal delay={0.38}>
              <p className="mx-auto mt-2 max-w-[21rem] text-pretty text-[13.5px] leading-[1.45] text-foreground/65 sm:mt-6 sm:max-w-lg sm:text-lg sm:leading-relaxed sm:text-muted lg:mx-0">
                Optimise ton annonce Airbnb pour attirer plus de voyageurs, sans avoir à brader tes nuits.
              </p>
            </Reveal>

            <Reveal delay={0.42}>
              <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 sm:mt-6 sm:gap-2 lg:justify-start">
                {HERO_BENEFITS.map(({ icon: Icon, text }) => (
                  <li
                    key={text}
                    className="inline-flex items-center gap-1 text-[clamp(10.5px,3vw,12px)] font-medium whitespace-nowrap text-foreground/70 sm:gap-2 sm:rounded-full sm:border sm:border-border sm:bg-card/80 sm:px-3.5 sm:py-1.5 sm:text-[14px] sm:text-foreground sm:backdrop-blur"
                  >
                    <Icon aria-hidden strokeWidth={2.2} className="h-3 w-3 text-accent sm:h-[15px] sm:w-[15px]" />
                    {text}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.45} className="mt-3 flex w-full justify-center sm:mt-9 lg:block">
              <HeroForm />
            </Reveal>
            {/* Phones: shown after the visual instead (first screen). */}
            <div className="hidden sm:block">
              <Reveal delay={0.5} className="mt-4 flex w-full justify-center lg:justify-start">
                <HeroAnalysesProof />
              </Reveal>
            </div>

            {/* Desktop only here (mobile: after the demo). The display toggle sits on
                a plain wrapper: hiding the animated Reveal itself left a paint
                artefact in WebKit. */}
            <div className="hidden lg:block">
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
          </div>

          <Reveal delay={0.25} y={24} className="flex flex-col items-center gap-3">
            <HeroBookingVisual />
            {/* Phones: the social proof, below the visual so the first screen
                shows title, form and visual. */}
            <div className="flex flex-col items-center gap-2 sm:hidden">
              <HeroAnalysesProof className="mt-1" />
            </div>
            {/* Mobile / tablet: "how it works" after the demo */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 lg:hidden">
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

      {/* 05 — pricing */}
      <section id="tarifs" className="scroll-mt-24 border-t border-border/70 bg-background-alt/60 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading
            index="05"
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
          <LifetimePromoCards
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
            campaignConciergerieAction={
              <CtaTrackedButton
                href="/analyze"
                size="lg"
                variant="outline"
                className="mt-6 w-full whitespace-normal text-[15px] sm:text-base"
                ctaLocation="pricing_conciergerie"
              >
                Choisir Conciergerie
              </CtaTrackedButton>
            }
            campaignLifetimeAction={
              <CtaTrackedButton
                href="/analyze"
                size="lg"
                className="btn-sheen mt-6 w-full whitespace-normal text-[15px] sm:text-base"
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

      {/* 06 — FAQ */}
      <section className="border-t border-border/70 py-24 sm:py-32">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[1fr_1.35fr] lg:gap-20">
          <SectionHeading
            index="06"
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
