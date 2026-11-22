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
            {/* Thumbnails: the image is absolutely positioned so it never sizes
                its cell (WebKit let the 2nd one overflow in the compact card). */}
            <div className={compact ? "grid min-h-0 grid-rows-2 gap-[0.5em]" : "grid grid-cols-2 gap-[0.5em]"}>
              {["/hero/listing-thumb-1.jpg", "/hero/listing-thumb-2.jpg"].map((src) => (
                <div
                  key={src}
                  className={`relative overflow-hidden rounded-[0.6em] ${compact ? "min-h-0" : "aspect-[3/2]"}`}
                >
                  <Image src={src} alt="" width={420} height={280} sizes="120px" className="absolute inset-0 h-full w-full object-cover" />
                </div>
              ))}
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
                <p className="mt-[0.55em] text-[0.9em] leading-[1.35] text-neutral-700">
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
                    <span className="block truncate text-[0.8em] text-neutral-600">{text}</span>
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
            <span className="block text-[0.82em] leading-[1.35] text-neutral-700">
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

// ---- MacBook base (SVG, pre-projected perspective) ---------------------------
// Coordinates: viewBox 1120 x 262. The lid spans x 60..1060 (the SVG is 112 %
// of the lid width, offset -6 %). Back edge (hinge) is narrower than the front
// edge; rows get taller towards the viewer (v^1.18), like a photo taken from
// slightly above.
const BX0 = 72; // back edge, left
const BX1 = 1048; // back edge, right
const BY0 = 12; // back edge y
const BY1 = 200; // front edge y
const FLARE = 72; // how much wider the front edge is, per side

function deckPoint(u: number, v: number): [number, number] {
  const y = BY0 + (BY1 - BY0) * Math.pow(v, 1.18);
  const t = (y - BY0) / (BY1 - BY0);
  const left = BX0 - FLARE * t;
  const right = BX1 + FLARE * t;
  return [left + u * (right - left), y];
}

function quad(u0: number, u1: number, v0: number, v1: number): string {
  const pts = [deckPoint(u0, v0), deckPoint(u1, v0), deckPoint(u1, v1), deckPoint(u0, v1)];
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L") + " Z";
}

// Key widths per row (relative units), function row is short.
const KEY_ROWS: { h: number; keys: number[] }[] = [
  { h: 0.62, keys: Array(14).fill(1) },
  { h: 1, keys: [...Array(13).fill(1), 1.5] },
  { h: 1, keys: [1.5, ...Array(12).fill(1), 1] },
  { h: 1, keys: [1.8, ...Array(11).fill(1), 1.7] },
  { h: 1, keys: [2.3, ...Array(10).fill(1), 2.2] },
  { h: 1, keys: [1, 1, 1, 1.25, 5.25, 1.25, 1, 1, 1, 1] },
];

function keyboardPaths(): string[] {
  const U0 = 0.118, U1 = 0.882, V0 = 0.075, V1 = 0.6;
  const GAP_V = 0.12; // in row units
  const totalH = KEY_ROWS.reduce((a, r) => a + r.h, 0) + GAP_V * (KEY_ROWS.length - 1);
  const paths: string[] = [];
  let acc = 0;
  for (const row of KEY_ROWS) {
    const v0 = V0 + ((V1 - V0) * acc) / totalH;
    const v1 = V0 + ((V1 - V0) * (acc + row.h)) / totalH;
    const total = row.keys.reduce((a, b) => a + b, 0);
    const gapU = 0.0042;
    let x = 0;
    for (const w of row.keys) {
      const u0 = U0 + ((U1 - U0) * x) / total + gapU / 2;
      const u1 = U0 + ((U1 - U0) * (x + w)) / total - gapU / 2;
      paths.push(quad(u0, u1, v0, v1));
      x += w;
    }
    acc += row.h + GAP_V;
  }
  return paths;
}

const KEY_PATHS = keyboardPaths();
const KEYBOARD_WELL = quad(0.11, 0.89, 0.06, 0.615);
const TRACKPAD = quad(0.315, 0.685, 0.665, 0.955);
const GRILLE_L = quad(0.032, 0.098, 0.075, 0.6);
const GRILLE_R = quad(0.902, 0.968, 0.075, 0.6);

function MacBookBase({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1120 262" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mb-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfd1d6" />
          <stop offset="55%" stopColor="#e4e5e9" />
          <stop offset="100%" stopColor="#eef0f3" />
        </linearGradient>
        <linearGradient id="mb-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="mb-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d5d7dc" />
          <stop offset="100%" stopColor="#9c9ea5" />
        </linearGradient>
        <linearGradient id="mb-hinge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1a1e" />
          <stop offset="100%" stopColor="#3a3b41" />
        </linearGradient>
        <linearGradient id="mb-pad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9dbe0" />
          <stop offset="100%" stopColor="#e9ebee" />
        </linearGradient>
        <radialGradient id="mb-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2a1f24" stopOpacity="0.38" />
          <stop offset="70%" stopColor="#2a1f24" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#2a1f24" stopOpacity="0" />
        </radialGradient>
        <pattern id="mb-grille" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="0.9" fill="#7d7f86" />
        </pattern>
      </defs>

      {/* contact shadow + warm glow */}
      <ellipse cx="560" cy="236" rx="600" ry="26" fill="url(#mb-shadow)" />
      <ellipse cx="560" cy="232" rx="470" ry="14" fill="#ff8a5c" opacity="0.18" />

      {/* hinge */}
      <rect x="96" y="0" width="928" height="16" rx="6" fill="url(#mb-hinge)" />

      {/* top surface */}
      <path
        d={`M${BX0 + 8} ${BY0} L${BX1 - 8} ${BY0} Q${BX1} ${BY0} ${BX1 + 4} ${BY0 + 8} L${1120 - 2} ${BY1 - 8} Q1120 ${BY1} ${1110} ${BY1} L10 ${BY1} Q0 ${BY1} 2 ${BY1 - 8} L${BX0 - 4} ${BY0 + 8} Q${BX0} ${BY0} ${BX0 + 8} ${BY0} Z`}
        fill="url(#mb-top)"
      />
      <path d={`M${BX0} ${BY0} L${BX1} ${BY0} L1120 ${BY1} L0 ${BY1} Z`} fill="url(#mb-sheen)" opacity="0.6" />

      {/* speaker grilles */}
      <path d={GRILLE_L} fill="url(#mb-grille)" opacity="0.55" />
      <path d={GRILLE_R} fill="url(#mb-grille)" opacity="0.55" />

      {/* keyboard well + keys */}
      <path d={KEYBOARD_WELL} fill="#b9bbc1" opacity="0.55" />
      <g fill="#1e1f24" stroke="#2c2d33" strokeWidth="1.2" strokeLinejoin="round">
        {KEY_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {/* key top highlight (light from above) */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="0.8">
        {KEY_PATHS.map((d, i) => (
          <path key={i} d={d} transform="translate(0 -0.6)" />
        ))}
      </g>

      {/* trackpad */}
      <path d={TRACKPAD} fill="url(#mb-pad)" stroke="#b7b9bf" strokeWidth="1.2" strokeLinejoin="round" />

      {/* front edge (lip) with thumb notch */}
      <path d={`M0 ${BY1} L1120 ${BY1} L1113 ${BY1 + 20} Q1110 ${BY1 + 26} 1100 ${BY1 + 26} L20 ${BY1 + 26} Q10 ${BY1 + 26} 7 ${BY1 + 20} Z`} fill="url(#mb-front)" />
      <path d={`M488 ${BY1} Q560 ${BY1 + 12} 632 ${BY1} Z`} fill="#8e9097" opacity="0.6" />
      <line x1="6" y1={BY1 + 0.6} x2="1114" y2={BY1 + 0.6} stroke="#ffffff" strokeOpacity="0.7" strokeWidth="1.2" />
    </svg>
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
      <div className="relative hidden w-full -mt-16 pt-4 pb-[4%] pl-[8%] pr-[5%] xl:block 2xl:pr-[2%]">
        {/* One flat composition, tilted as a whole: a single transformed
            element renders the same in Chrome and Safari (nested 3D planes
            flattened in WebKit). The keyboard deck is pre-projected in SVG. */}
        <div className="relative origin-center [transform:perspective(2600px)_rotateY(-11deg)_rotateX(2deg)]">
          {/* Lid: thin black bezel, aluminium rim, camera notch */}
          <div className="relative rounded-[1.35rem] bg-[#0c0c0f] p-[1.15%] pt-[1.5%] shadow-[0_0_0_1.5px_#b8bac0,0_0_0_2.5px_#8f9197,0_40px_70px_-30px_rgba(40,30,40,0.55)]">
            <div className="@container relative aspect-[16/10] overflow-hidden rounded-[0.75rem]">
              <div className="h-full" style={{ fontSize: "calc(100cqw / 58)" }}>
                <DiagnosticScreen />
              </div>
              {/* glass reflection */}
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.09)_0%,transparent_32%)]" />
            </div>
            {/* notch with camera */}
            <span aria-hidden className="absolute top-0 left-1/2 flex h-[3.4%] w-[10%] -translate-x-1/2 items-center justify-center rounded-b-[0.55rem] bg-[#0c0c0f]">
              <span className="h-[0.32rem] w-[0.32rem] rounded-full bg-[#1d2333] ring-1 ring-[#2c3346]" />
            </span>
          </div>
          {/* Base: hinge, keyboard, trackpad, front lip, shadow */}
          <MacBookBase className="relative -mt-[0.3%] -ml-[6%] block w-[112%]" />
        </div>

        {/* Airbnb tile: above the top-right corner of the screen */}
        <AirbnbTile className="top-[-6%] right-[2.5%] z-10 h-[4.4rem] w-[4.4rem] 2xl:right-[0%]" />

        {/* Floating cards (left edge) */}
        <Reveal delay={0.45} y={10} className="absolute top-[11%] left-[-3%] z-10">
          <FloatingCard {...FLOATING[0]} />
        </Reveal>
        <Reveal delay={0.55} y={10} className="absolute top-[27%] left-[-5%] z-10">
          <FloatingCard {...FLOATING[1]} />
        </Reveal>
        <Reveal delay={0.65} y={10} className="absolute top-[43%] left-[-2%] z-10">
          <FloatingCard {...FLOATING[2]} />
        </Reveal>
      </div>

      {/* ---------- Mobile, tablet, small desktop: flat card ---------- */}
      <div className="relative mx-auto max-w-[34rem] pt-6 lg:max-w-[25rem] xl:hidden">
        <div className="@container relative overflow-hidden rounded-[1.4rem] border border-white/70 bg-[#1c1828] p-[0.35rem] shadow-[0_30px_60px_-28px_rgba(60,30,40,0.5)]">
          <div className="overflow-hidden rounded-[1.1rem]" style={{ fontSize: "calc(100cqw / 30)" }}>
            <DiagnosticScreen compact />
          </div>
        </div>
        <AirbnbTile className="-top-1 -right-2 h-[3.3rem] w-[3.3rem] sm:h-[4.1rem] sm:w-[4.1rem]" />
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
