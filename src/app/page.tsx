import { Check } from "lucide-react";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { HeroForm } from "@/components/landing/HeroForm";
import { LandingCompareTeaser } from "@/components/landing/LandingCompareTeaser";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Button } from "@/components/ui/Button";
import { BRAND_NAME } from "@/lib/brand";

const CHECKS = [
  "Gratuit pour commencer",
  "Résultat en moins d'une minute",
  "Aucune connexion Airbnb",
];

const STEPS = [
  { n: "1", title: "Capture ton annonce", text: "Une capture de ta page ou de tes premières photos suffit." },
  { n: "2", title: "Fais le test des 5 secondes", text: "Découvre ce qu'un voyageur comprend — et ce qui le fait hésiter." },
  { n: "3", title: "Découvre ce qui bloque", text: "Identifie le problème qui affaiblit ta première impression." },
  { n: "4", title: "Refais le test", text: "Compare l'avant / après après tes modifications." },
];

const PRICING_FEATURES = [
  "La photo à mettre en premier",
  "L'ordre recommandé de tes photos",
  "3 titres alternatifs",
  "Ce que le voyageur ne comprend pas",
  "Description retravaillée",
  "Top 3 changements",
  "Re-test avant/après",
];

const FAQ = [
  {
    q: `Le ${BRAND_NAME} est-il un score officiel Airbnb ?`,
    a: `Non. Le ${BRAND_NAME} est une évaluation indépendante produite par notre outil à partir des éléments visibles de ton annonce. Il n'est ni délivré, ni approuvé par Airbnb.`,
  },
  {
    q: "Une hausse du score garantit-elle plus de réservations ?",
    a: `Non. Le ${BRAND_NAME} mesure la qualité perçue de la présentation de ton annonce. Il ne prédit ni ne garantit un nombre de réservations.`,
  },
  {
    q: "Ai-je besoin de connecter mon compte Airbnb ?",
    a: "Non, jamais. Il te suffit d'importer une capture d'écran de ton annonce.",
  },
  {
    q: "Est-ce un abonnement ?",
    a: "Non. L'analyse complète est un paiement unique de 9,90€, sans engagement ni renouvellement automatique.",
  },
];

export default function LandingPage() {
  return (
    <>
      <AnalyticsBeacon event="landing_view" />

      {/* HERO */}
      <section className="mx-auto max-w-3xl px-5 pt-16 pb-10 text-center sm:pt-24 sm:pb-14">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Ton Airbnb passe-t-il le test des 5 secondes ?
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted">
          Vois ton annonce avec les yeux d&apos;un voyageur et découvre ce qui lui donne envie de
          cliquer… ou de passer.
        </p>
        <div className="mt-8">
          <HeroForm />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-2">
          {CHECKS.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <Check size={13} className="text-score-high" />
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* DEMO PREVIEW */}
      <section className="mx-auto max-w-3xl px-5 pb-20">
        <div className="card mx-auto max-w-sm p-8 shadow-[0_1px_0_rgba(0,0,0,0.02)] sm:p-10">
          <div className="flex flex-col items-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-2">
              Test des 5 secondes
            </span>
            <div className="mt-4">
              <ScoreRing score={43} size={168} strokeWidth={11} showLabel={false} />
            </div>
            <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-background-alt px-4 py-1.5 text-sm font-semibold text-foreground">
              😬 JE PASSE
            </span>
            <p className="mt-5 text-center text-sm text-muted">
              &ldquo;Ton logement semble agréable, mais son meilleur atout n&apos;est pas visible
              immédiatement.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section className="border-t border-border/70 bg-background-alt/50 py-20">
        <div className="mx-auto max-w-4xl px-5">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            4 étapes. Moins d&apos;une minute.
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-hover">
                  {s.n}
                </div>
                <h3 className="mt-4 font-medium">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Corrige. Refais le test. Compare.
          </h2>
          <div className="mt-10 flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-14">
            <div className="flex flex-col items-center">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-2">Avant</span>
              <ScoreRing score={43} size={140} strokeWidth={10} showLabel={false} />
              <span className="mt-2 text-sm font-semibold">😬 JE PASSE</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl text-muted-2">→</span>
              <span className="rounded-full bg-score-high/10 px-3 py-1 text-sm font-semibold text-score-high">
                🔥 +38 points
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-2">Après</span>
              <ScoreRing score={81} size={140} strokeWidth={10} showLabel={false} />
              <span className="mt-2 text-sm font-semibold">🔥 JE CLIQUE</span>
            </div>
          </div>
          <p className="mx-auto mt-8 max-w-md text-sm text-muted-2">
            L&apos;évolution correspond au score interne de l&apos;outil et ne garantit pas une
            augmentation des clics ou des réservations.
          </p>
        </div>
      </section>

      {/* COMPARE MODE */}
      <section className="border-t border-border/70 bg-background-alt/50 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Laquelle tu cliquerais ?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted">
            Regarde ces deux annonces quelques secondes.
            <br className="hidden sm:block" /> Laquelle te donne le plus envie d&apos;en voir plus ?
          </p>
          <div className="mt-8">
            <LandingCompareTeaser />
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="py-20">
        <div className="mx-auto max-w-md px-5 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Analyse complète</h2>
          <ul className="mx-auto mt-7 max-w-xs space-y-3 text-left">
            {PRICING_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-foreground">
                <Check size={16} className="mt-0.5 shrink-0 text-score-high" />
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-7 text-5xl font-semibold tracking-tight">9,90 €</p>
          <p className="mt-2 text-sm text-muted">Paiement unique · Aucun abonnement</p>
          <Button href="/analyze" size="lg" className="mt-7">
            Faire mon test gratuitement
          </Button>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/70 py-20">
        <div className="mx-auto max-w-2xl px-5">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Questions fréquentes
          </h2>
          <div className="mt-10 divide-y divide-border">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {item.q}
                  <span className="text-muted-2 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
