import Image from "next/image";
import {
  AlertTriangle,
  AlignLeft,
  Camera,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  Sparkles,
  TrendingUp,
  Type,
} from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

// Hero visual: a static, premium preview of a GuestMirror diagnostic.
// It is a FICTIONAL example (labelled "Exemple de résultat"), built in
// HTML/CSS/SVG -- no animated score, no looping motion. Only a light
// entrance (Reveal, which honours prefers-reduced-motion).
//
// The screen content is one component rendered twice:
//  - desktop (lg+): inside a laptop drawn in CSS 3D perspective;
//  - mobile/tablet: as a flat card, larger type, floating cards in a row.
// Sizes inside the screen are in `em`, and 1em is derived from the screen
// width (container query units), so the UI scales as one piece.

const ROWS = [
  {
    icon: ImageIcon,
    title: "Photos",
    text: "L'atout principal n'est pas suffisamment mis en avant.",
    chip: "À améliorer",
    tone: "bg-rose-50 text-rose-600 ring-rose-100",
  },
  {
    icon: Type,
    title: "Titre",
    text: "Il peut être plus attractif et précis.",
    chip: "À optimiser",
    tone: "bg-amber-50 text-amber-600 ring-amber-100",
  },
  {
    icon: AlignLeft,
    title: "Description",
    text: "Elle manque de clarté sur certains points clés.",
    chip: "À enrichir",
    tone: "bg-amber-50 text-amber-600 ring-amber-100",
  },
] as const;

const FLOATING = [
  { icon: Camera, line1: "Analyse", line2: "des photos", tone: "bg-violet-100 text-violet-600" },
  { icon: ListChecks, line1: "Titre &", line2: "description", tone: "bg-violet-100 text-violet-600" },
  { icon: Lightbulb, line1: "Recommandations", line2: "concrètes", tone: "bg-amber-100 text-amber-500" },
] as const;

/** Static score dial (no count-up): 43/100, example only. */
function ScoreDial() {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[8.6em] w-[8.6em] shrink-0">
      <div aria-hidden className="absolute inset-[8%] rounded-full bg-rose-400/15 blur-[0.9em]" />
      <svg viewBox="0 0 100 100" className="relative h-full w-full -rotate-90">
        <defs>
          <linearGradient id="gm-hero-dial" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#fde4e4" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#gm-hero-dial)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(43 / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[2.9em] font-bold tracking-tight text-neutral-900">43</span>
        <span className="mt-[0.15em] text-[1.05em] font-medium text-rose-500">/100</span>
      </div>
    </div>
  );
}

/** The diagnostic interface shown on the laptop screen (or as a card on mobile). */
function DiagnosticScreen({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full flex-col bg-[#f6f3f1] text-neutral-900">
      {/* App bar */}
      <div className="flex items-center gap-[1.6em] bg-[#1c1828] px-[1.6em] py-[0.95em] text-white">
        <span className="flex items-center gap-[0.5em]">
          <Image src="/brand/logo.png" alt="" width={20} height={20} className="h-[1.5em] w-[1.5em] rounded-[0.3em]" />
          <span className="text-[1.15em] font-semibold tracking-tight">GuestMirror</span>
        </span>
        {!compact && (
          <span className="ml-auto flex items-center gap-[0.4em] text-[0.82em]">
            <span className="rounded-full bg-white/12 px-[0.9em] py-[0.35em] font-medium">Diagnostic</span>
            <span className="px-[0.7em] text-white/70">Recommandations</span>
            <span className="px-[0.7em] text-white/70">Plan d&apos;action</span>
          </span>
        )}
      </div>

      {/* Report */}
      <div className="relative m-[1.1em] flex-1 rounded-[1em] bg-white p-[1.3em] shadow-[0_0.2em_1.2em_-0.4em_rgba(28,24,40,0.18)]">
        <span className="absolute top-[1em] right-[1.1em] rounded-full bg-violet-500 px-[0.85em] py-[0.3em] text-[0.78em] font-semibold text-white shadow-[0_0.3em_0.9em_-0.3em_rgba(139,92,246,0.7)]">
          Exemple de résultat
        </span>

        <div className={compact ? "flex flex-col gap-[1.2em]" : "grid grid-cols-[17em_1fr] gap-[1.4em]"}>
          {/* Photos */}
          <div className={compact ? "mt-[2em] grid grid-cols-[2fr_1fr] gap-[0.5em]" : "flex flex-col gap-[0.5em]"}>
            <div className="relative overflow-hidden rounded-[0.8em]">
              <Image
                src="/hero/listing-main.jpg"
                alt="Exemple d'annonce : terrasse avec vue sur la mer"
                width={800}
                height={600}
                sizes="(min-width: 1024px) 220px, 60vw"
                className="aspect-[4/3] h-auto w-full object-cover"
              />
              <span className="absolute top-[0.6em] left-[0.6em] inline-flex items-center gap-[0.35em] rounded-full bg-white/90 px-[0.6em] py-[0.25em] text-[0.78em] font-medium text-neutral-700 shadow-sm backdrop-blur">
                <Image src="/brand/airbnb-logo.png" alt="" width={14} height={14} className="h-[1.1em] w-[1.1em]" />
                Annonce Airbnb
              </span>
            </div>
            <div className={compact ? "grid grid-rows-2 gap-[0.5em]" : "grid grid-cols-2 gap-[0.5em]"}>
              <Image
                src="/hero/listing-thumb-1.jpg"
                alt=""
                width={420}
                height={280}
                sizes="120px"
                className="h-full w-full rounded-[0.6em] object-cover"
              />
              <Image
                src="/hero/listing-thumb-2.jpg"
                alt=""
                width={420}
                height={280}
                sizes="120px"
                className="h-full w-full rounded-[0.6em] object-cover"
              />
            </div>
          </div>

          {/* Score + analysed categories */}
          <div className="flex min-w-0 flex-col gap-[0.9em]">
            <div className="flex items-center gap-[1.2em] pt-[0.6em]">
              <ScoreDial />
              <div className="min-w-0">
                <span className="inline-flex items-center gap-[0.4em] rounded-full bg-amber-50 px-[0.75em] py-[0.3em] text-[0.88em] font-semibold text-amber-700 ring-1 ring-amber-100">
                  <AlertTriangle aria-hidden className="h-[1em] w-[1em]" />
                  Des points à améliorer
                </span>
                <p className="mt-[0.55em] text-[0.88em] leading-[1.35] text-neutral-600">
                  Ton annonce a du potentiel, mais certains éléments peuvent freiner les réservations.
                </p>
              </div>
            </div>

            <ul className="flex flex-col gap-[0.45em]">
              {ROWS.map(({ icon: Icon, title, text, chip, tone }) => (
                <li
                  key={title}
                  className="flex items-center gap-[0.75em] rounded-[0.7em] border border-neutral-100 bg-white px-[0.8em] py-[0.6em] shadow-[0_0.1em_0.5em_-0.25em_rgba(28,24,40,0.15)]"
                >
                  <Icon aria-hidden className="h-[1.25em] w-[1.25em] shrink-0 text-neutral-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.95em] font-semibold">{title}</span>
                    <span className="block truncate text-[0.78em] text-neutral-500">{text}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-[0.7em] py-[0.25em] text-[0.75em] font-semibold ring-1 ${tone}`}>
                    {chip}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Key recommendation */}
        <div className="mt-[1em] flex items-center gap-[0.9em] rounded-[0.85em] border border-emerald-100 bg-gradient-to-r from-emerald-50 to-emerald-50/40 px-[1.1em] py-[0.8em]">
          <Sparkles aria-hidden className="h-[1.6em] w-[1.6em] shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.98em] font-bold text-emerald-950">Notre recommandation clé</span>
            <span className="block text-[0.8em] leading-[1.35] text-neutral-600">
              Mets en avant la vue et l&apos;espace extérieur dès la première photo pour capter plus d&apos;attention.
            </span>
          </span>
          <TrendingUp aria-hidden className="h-[1.9em] w-[1.9em] shrink-0 text-emerald-500" />
        </div>
      </div>
    </div>
  );
}

function FloatingCard({
  icon: Icon,
  line1,
  line2,
  tone,
  className = "",
}: (typeof FLOATING)[number] & { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[1.25rem] border border-white/80 bg-white/90 py-3 pr-5 pl-3 shadow-[0_18px_40px_-18px_rgba(60,35,25,0.35),0_2px_6px_-2px_rgba(60,35,25,0.08)] backdrop-blur ${className}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon aria-hidden size={19} strokeWidth={2.2} />
      </span>
      <span className="text-[14.5px] leading-tight text-neutral-800">
        <span className="block font-semibold">{line1}</span>
        <span className="block">{line2}</span>
      </span>
    </div>
  );
}

function AirbnbTile({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute ${className}`}>
      <div className="relative">
        <Image
          src="/brand/airbnb-logo.png"
          alt=""
          width={120}
          height={120}
          className="h-full w-full rotate-[8deg] drop-shadow-[0_14px_24px_rgba(255,56,92,0.35)]"
        />
        {/* little "spark" dashes, as in the art direction */}
        <span className="absolute -top-[14%] right-[2%] h-[16%] w-[6%] rotate-[25deg] rounded-full bg-orange-400" />
        <span className="absolute -top-[2%] -right-[14%] h-[6%] w-[16%] -rotate-[25deg] rounded-full bg-orange-400" />
        <span className="absolute top-[18%] -right-[18%] h-[6%] w-[14%] rotate-[10deg] rounded-full bg-orange-300" />
      </div>
    </div>
  );
}

export function HeroLaptopDemo() {
  return (
    <div className="relative w-full">
      {/* Soft peach / pink light, in the GuestMirror palette */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[2%] left-1/2 h-[95%] w-[110%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,165,130,0.55),rgba(255,190,170,0.22)_60%,transparent)] blur-2xl" />
        <div className="absolute right-[-6%] bottom-[2%] h-[45%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(255,120,150,0.30),transparent)] blur-3xl" />
      </div>

      {/* ---------- Large desktop (xl+): laptop in perspective ---------- */}
      <div className="relative hidden w-full pt-10 pb-[11%] pl-[10%] pr-[3%] xl:block">
        <div className="[perspective:2200px]">
          <div className="relative [transform:rotateY(-15deg)_rotateX(5deg)_rotateZ(-0.6deg)] [transform-style:preserve-3d]">
            {/* Lid */}
            <div className="relative rounded-[1.7rem] bg-gradient-to-b from-[#2d2838] via-[#1d1926] to-[#15121c] p-[1.7%] shadow-[0_50px_80px_-30px_rgba(60,30,40,0.55),0_0_0_1px_rgba(0,0,0,0.35)]">
              <span aria-hidden className="absolute top-[0.75%] left-1/2 h-[0.45rem] w-[0.45rem] -translate-x-1/2 rounded-full bg-[#3a3546]" />
              <div className="@container relative aspect-[16/10] overflow-hidden rounded-[0.85rem] ring-1 ring-black/40">
                <div className="h-full" style={{ fontSize: "calc(100cqw / 60)" }}>
                  <DiagnosticScreen />
                </div>
                {/* glass reflection */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.10)_0%,transparent_35%)]" />
              </div>
            </div>

            {/* Hinge */}
            <div aria-hidden className="relative mx-[3%] h-[0.7rem] rounded-b-[0.6rem] bg-gradient-to-b from-[#3b3547] to-[#26212f]" />

            {/* Keyboard deck, folded towards the viewer (absolute: the 3D
                rotation would otherwise keep its unrotated layout height) */}
            <div
              aria-hidden
              className="absolute top-[calc(100%-0.35rem)] right-[-5%] left-[-5%] origin-top [transform:rotateX(74deg)] rounded-[1rem] bg-gradient-to-b from-[#ece7f3] via-[#ddd5ea] to-[#c9bedb] shadow-[inset_0_2px_0_rgba(255,255,255,0.75),0_40px_60px_-10px_rgba(255,130,80,0.45)]"
              style={{ aspectRatio: "16 / 6" }}
            >
              <div className="absolute inset-x-[8%] top-[7%] h-[50%] rounded-[0.5rem] bg-[repeating-linear-gradient(90deg,#3d364c_0_5.6%,transparent_5.6%_6.5%),repeating-linear-gradient(0deg,#3d364c_0_16.5%,transparent_16.5%_20%)] opacity-85 [background-blend-mode:multiply]" />
              <div className="absolute bottom-[14%] left-1/2 h-[22%] w-[32%] -translate-x-1/2 rounded-[0.6rem] bg-[#d3cae1] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]" />
              {/* front lip */}
              <div className="absolute inset-x-0 bottom-0 h-[5%] rounded-b-[1rem] bg-gradient-to-b from-[#b9add1] to-[#8a7da8]" />
            </div>
          </div>
        </div>

        {/* Floating cards (left edge) */}
        <Reveal delay={0.45} y={10} className="absolute top-[20%] left-[-3%] z-10">
          <FloatingCard {...FLOATING[0]} />
        </Reveal>
        <Reveal delay={0.55} y={10} className="absolute top-[40%] left-[-5%] z-10">
          <FloatingCard {...FLOATING[1]} />
        </Reveal>
        <Reveal delay={0.65} y={10} className="absolute top-[54%] left-[-2%] z-10">
          <FloatingCard {...FLOATING[2]} />
        </Reveal>

        <AirbnbTile className="top-[-7%] right-[0%] z-10 h-[5.5rem] w-[5.5rem] 2xl:right-[-3%]" />
      </div>

      {/* ---------- Mobile, tablet, small desktop: flat card ---------- */}
      <div className="relative mx-auto max-w-[34rem] pt-6 lg:max-w-[25rem] xl:hidden">
        <div className="@container relative overflow-hidden rounded-[1.4rem] border border-white/70 bg-[#1c1828] p-[0.35rem] shadow-[0_30px_60px_-28px_rgba(60,30,40,0.5)]">
          <div className="overflow-hidden rounded-[1.1rem]" style={{ fontSize: "calc(100cqw / 30)" }}>
            <DiagnosticScreen compact />
          </div>
        </div>
        <AirbnbTile className="-top-1 -right-2 h-16 w-16 sm:h-20 sm:w-20" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {FLOATING.map(({ icon: Icon, line1, line2, tone }) => (
            <div
              key={line1}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/80 bg-white/85 px-2 py-3 text-center shadow-[0_12px_28px_-16px_rgba(60,35,25,0.35)]"
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tone}`}>
                <Icon aria-hidden size={16} strokeWidth={2.2} />
              </span>
              <span className="text-[11.5px] leading-tight text-neutral-800">
                <span className="block font-semibold">{line1}</span>
                <span className="block">{line2}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
