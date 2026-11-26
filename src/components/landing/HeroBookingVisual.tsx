import Image from "next/image";
import { CalendarCheck, Heart, Sparkles, TrendingUp } from "lucide-react";

// Hero visual (results-oriented): what a host wants -- a well-filled booking
// calendar -- next to an attractive listing. An ILLUSTRATION of the goal (the
// caption under it was removed at the owner's request on 2026-11-26): no
// score, no figure presented as real, no testimonial, no calendar sync
// (GuestMirror has none). The listing card uses the hero's own
// photo; its title only says what the photo shows (terrace, sea view).
//
// One flat composition scaled as a whole: 1em = container width / 40 (container
// query units), so mobile and desktop are the same picture at different
// sizes. The phone's tilt is ONE transform on ONE element (nested CSS 3D
// flattened in WebKit). Server component: static HTML, no JS of its own. The
// floating cards enter with a short CSS fade (not an in-view trigger: they sit
// on the visual's edges and could stay hidden on small screens) and the
// notification floats gently; both are off with prefers-reduced-motion.

/** July (no year shown), Monday-first grid: the 1st falls on a Wednesday. */
const MONTH = "Juillet";
const FIRST_COL = 2;
const DAYS = 31;
/** Consecutive booked nights (inclusive). The gaps are the nights still free. */
const BOOKINGS: [number, number][] = [
  [1, 4],
  [6, 10],
  [11, 13],
  [15, 19],
  [20, 23],
  [25, 29],
  [30, 31],
];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

const pos = (day: number) => ({ row: Math.floor((day - 1 + FIRST_COL) / 7), col: (day - 1 + FIRST_COL) % 7 });
const isBooked = (day: number) => BOOKINGS.some(([a, b]) => day >= a && day <= b);
const ROWS = Math.ceil((DAYS + FIRST_COL) / 7);

/** Each booking cut into one segment per week row. */
function segments() {
  const out: { row: number; c0: number; c1: number; start: boolean; end: boolean; nights: number; k: number }[] = [];
  BOOKINGS.forEach(([a, b], k) => {
    let d = a;
    while (d <= b) {
      const { row, col } = pos(d);
      const last = Math.min(b, d + (6 - col));
      out.push({ row, c0: col, c1: pos(last).col, start: d === a, end: last === b, nights: b - a + 1, k });
      d = last + 1;
    }
  });
  return out;
}

function Calendar() {
  const segs = segments();
  return (
    <div className="flex h-full flex-col bg-white px-[1.1em] pt-[1.1em] pb-[1em] text-neutral-900">
      {/* status bar */}
      <div className="flex items-center justify-between px-[0.3em] text-[0.78em] font-semibold">
        <span>9:41</span>
        <span className="flex items-center gap-[0.25em]" aria-hidden>
          <span className="h-[0.55em] w-[0.95em] rounded-[0.15em] border border-neutral-800" />
        </span>
      </div>
      {/* header */}
      <div className="mt-[1em] flex items-end justify-between">
        <div>
          <p className="text-[0.82em] font-medium text-neutral-500">Calendrier</p>
          <p className="text-[1.75em] leading-tight font-bold tracking-tight">{MONTH}</p>
        </div>
        <span className="mb-[0.3em] flex h-[2.2em] w-[2.2em] items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CalendarCheck aria-hidden className="h-[1.2em] w-[1.2em]" strokeWidth={2.2} />
        </span>
      </div>
      {/* weekdays */}
      <div className="mt-[0.9em] grid grid-cols-7 text-center text-[0.74em] font-semibold text-neutral-400">
        {WEEKDAYS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      {/* weeks */}
      <div className="mt-[0.35em] flex flex-1 flex-col gap-[0.4em]">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="relative grid min-h-[3.35em] flex-1 grid-cols-7 gap-[0.25em]">
            {Array.from({ length: 7 }, (_, col) => {
              const day = row * 7 + col - FIRST_COL + 1;
              if (day < 1 || day > DAYS) return <span key={col} />;
              const free = !isBooked(day);
              return (
                <span
                  key={col}
                  className={`rounded-[0.55em] pt-[0.3em] pl-[0.4em] text-left text-[0.8em] font-semibold ${
                    free ? "border border-dashed border-neutral-300 bg-white text-neutral-500" : "bg-neutral-50 text-neutral-700"
                  }`}
                >
                  {day}
                </span>
              );
            })}
            {/* booking bars over the cells of this week */}
            {segs
              .filter((s) => s.row === row)
              .map((s) => (
                <span
                  key={`${s.k}-${s.c0}`}
                  className={`absolute bottom-[0.35em] flex h-[1.45em] items-center overflow-hidden px-[0.55em] text-[0.68em] font-semibold whitespace-nowrap text-white shadow-[0_0.3em_0.7em_-0.3em_rgba(217,103,63,0.7)] ${
                    s.k % 2 ? "bg-gradient-to-r from-[#e2774d] to-[#ef9a6e]" : "bg-gradient-to-r from-[#d0582f] to-[#e57f52]"
                  } ${s.start ? "rounded-l-full" : ""} ${s.end ? "rounded-r-full" : ""}`}
                  style={{
                    left: `calc(${(s.c0 / 7) * 100}% + ${s.start ? "0.35em" : "0em"})`,
                    width: `calc(${((s.c1 - s.c0 + 1) / 7) * 100}% - ${(s.start ? 0.35 : 0) + (s.end ? 0.35 : 0)}em)`,
                  }}
                >
                  {s.start && s.c1 - s.c0 >= 2 ? `${s.nights} nuits` : ""}
                </span>
              ))}
          </div>
        ))}
      </div>
      {/* legend */}
      <div className="mt-[0.8em] flex items-center justify-center gap-[1.1em] text-[0.72em] text-neutral-500">
        <span className="flex items-center gap-[0.4em]">
          <span className="h-[0.7em] w-[1.4em] rounded-full bg-gradient-to-r from-[#d0582f] to-[#e57f52]" /> Réservé
        </span>
        <span className="flex items-center gap-[0.4em]">
          <span className="h-[0.8em] w-[0.8em] rounded-[0.2em] border border-dashed border-neutral-400" /> Disponible
        </span>
      </div>
    </div>
  );
}

export function HeroBookingVisual() {
  return (
    <div className="@container relative mx-auto w-full max-w-[29rem] max-sm:w-[clamp(15.5rem,calc((100svh-25.5rem)*0.95),100%)] lg:max-w-[36rem] xl:max-w-[40rem]">
      <div className="relative aspect-[40/41]" style={{ fontSize: "calc(100cqw / 40)" }}>
        {/* warm light (gradient, not a blur filter: WebKit paint artefacts) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-8%] -z-10 bg-[radial-gradient(closest-side,rgba(255,160,120,0.42),rgba(255,190,165,0.16)_62%,transparent)]"
        />

        {/* Listing card, behind the phone */}
        <div className="absolute top-[7%] left-[1%] w-[50%] -rotate-[5deg] overflow-hidden rounded-[1.3em] border border-white bg-white shadow-[0_2.4em_3.6em_-1.8em_rgba(70,35,20,0.45)]">
          <div className="relative aspect-[4/3]">
            <Image
              src="/hero/listing-main.jpg"
              alt="Exemple d'annonce : terrasse avec vue sur la mer"
              fill
              sizes="(min-width: 1280px) 320px, (min-width: 1024px) 290px, 50vw"
              className="object-cover"
            />
            <span className="absolute top-[0.7em] right-[0.7em] flex h-[2em] w-[2em] items-center justify-center rounded-full bg-white/90 text-rose-500">
              <Heart aria-hidden className="h-[1.05em] w-[1.05em] fill-rose-500" />
            </span>
          </div>
          {/* text kept to the left part: the phone overlaps the card's right edge */}
          <div className="pt-[0.8em] pr-[24%] pb-[0.95em] pl-[0.95em]">
            <p className="flex items-center gap-[0.35em] text-[0.72em] font-semibold tracking-wide text-accent uppercase">
              <Sparkles aria-hidden className="h-[1.1em] w-[1.1em] shrink-0" /> Optimisée avec GuestMirror
            </p>
            <p className="mt-[0.35em] text-[1.08em] leading-snug font-semibold text-neutral-900">Terrasse avec vue sur la mer</p>
          </div>
        </div>

        {/* Phone: one transformed element (WebKit-safe) */}
        <div className="absolute top-0 right-[2%] z-0 w-[56%] origin-center [transform:perspective(1800px)_rotateY(-13deg)_rotateX(4deg)_rotateZ(2.5deg)]">
          <div className="relative rounded-[3em] bg-[#121016] p-[0.55em] shadow-[0_0_0_0.12em_#3a3740,0_3.4em_5em_-2em_rgba(50,25,20,0.6),0_1.2em_2em_-1.2em_rgba(50,25,20,0.35)]">
            <div className="relative aspect-[9/16.4] overflow-hidden rounded-[2.5em]">
              <Calendar />
              {/* dynamic island */}
              <span aria-hidden className="absolute top-[0.75em] left-1/2 h-[1.25em] w-[4.6em] -translate-x-1/2 rounded-full bg-[#121016]" />
              {/* glass reflection */}
              <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.18)_0%,transparent_30%)]" />
            </div>
          </div>
        </div>

        {/* Floating elements: illustrative, around the phone, never over the calendar grid */}
        <div className="animate-fade-up absolute top-[64%] left-[0%] z-20 w-[47%] motion-reduce:animate-none" style={{ animationDelay: "0.7s" }}>
          <div className="animate-float-slow rounded-[1.1em] border border-white bg-white/95 p-[0.8em] shadow-[0_1.6em_2.6em_-1.2em_rgba(60,35,25,0.45)]">
            <div className="flex items-center gap-[0.65em]">
              <span className="flex h-[2.4em] w-[2.4em] shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CalendarCheck aria-hidden className="h-[1.25em] w-[1.25em]" strokeWidth={2.3} />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[0.95em] font-semibold text-neutral-900">Nouvelle réservation</span>
                <span className="block text-[0.82em] text-neutral-500">20 → 24 juillet · 4 nuits</span>
              </span>
            </div>
          </div>
        </div>

        <div className="animate-fade-up absolute bottom-[4%] left-[6%] z-20 motion-reduce:animate-none" style={{ animationDelay: "0.85s" }}>
          <span className="inline-flex items-center gap-[0.5em] rounded-full border border-white bg-white/95 py-[0.55em] pr-[1em] pl-[0.6em] text-[0.95em] font-semibold text-neutral-900 shadow-[0_1.2em_2em_-1em_rgba(60,35,25,0.45)]">
            <span className="flex h-[1.7em] w-[1.7em] items-center justify-center rounded-full bg-accent-soft text-accent-hover">
              <TrendingUp aria-hidden className="h-[1em] w-[1em]" strokeWidth={2.4} />
            </span>
            Moins de nuits vides
          </span>
        </div>

        <div className="animate-fade-up absolute top-[3%] right-[-1%] z-20 motion-reduce:animate-none" style={{ animationDelay: "1s" }}>
          <span className="flex h-[3.2em] w-[3.2em] rotate-[8deg] items-center justify-center rounded-[1em] bg-gradient-to-br from-[#e2774d] to-[#c9502a] text-white shadow-[0_1em_1.8em_-0.8em_rgba(201,80,42,0.8)]">
            <TrendingUp aria-hidden className="h-[1.7em] w-[1.7em]" strokeWidth={2.6} />
          </span>
        </div>
      </div>
    </div>
  );
}
