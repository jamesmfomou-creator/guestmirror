"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isLandingPath } from "@/lib/landingPath";
import { track } from "@/lib/analytics";
import { FUTURE_LIFETIME_PRICE_LABEL, LIFETIME_PRICE_LABEL } from "@/lib/blackFriday";
import { useBlackFridayActive } from "./useBlackFriday";

const MESSAGE = `BLACK FRIDAY GUESTMIRROR — Accès à vie à ${LIFETIME_PRICE_LABEL} — Avant son passage à ${FUTURE_LIFETIME_PRICE_LABEL} — Paiement unique — Jusqu'au 30 novembre`;

function Segment() {
  return (
    <span className="flex shrink-0 items-center gap-3 pr-10 whitespace-nowrap">
      <span aria-hidden>🔥</span>
      <span className="font-bold tracking-wide text-white">BLACK FRIDAY GUESTMIRROR</span>
      <span className="text-white/40">—</span>
      <span className="text-white/90">
        Accès à vie à <span className="font-semibold text-[#ff8a5c]">{LIFETIME_PRICE_LABEL}</span>
      </span>
      <span className="text-white/40">—</span>
      <span className="text-white/90">Avant son passage à {FUTURE_LIFETIME_PRICE_LABEL}</span>
      <span className="text-white/40">—</span>
      <span className="text-white/90">Paiement unique</span>
      <span className="text-white/40">—</span>
      <span className="font-semibold text-[#ff8a5c]">Jusqu&apos;au 30 novembre</span>
      <span aria-hidden>🔥</span>
    </span>
  );
}

/**
 * Landing only, above the navbar. Slow CSS ticker (two identical halves
 * translated by -50%: seamless loop); with reduced motion it stops and the
 * message stays readable. The whole bar links to the lifetime offer.
 */
export function BlackFridayBanner() {
  const pathname = usePathname();
  const active = useBlackFridayActive();
  if (!active || !isLandingPath(pathname)) return null;

  return (
    <Link
      href="/#acces-a-vie"
      aria-label={`${MESSAGE}. Voir l'offre`}
      onClick={() => track("cta_test_clicked", { cta_location: "black_friday_banner" })}
      className="group relative block h-9 overflow-hidden border-b border-white/10 bg-[#141110] text-[12.5px] sm:h-10 sm:text-[13.5px]"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_140%_at_50%_0%,rgba(217,103,63,0.28),transparent)]" />
      <span aria-hidden className="gm-ticker relative flex h-full w-max items-center">
        <Segment />
        <Segment />
        <Segment />
        <Segment />
      </span>
      {/* edge fades */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#141110] to-transparent" />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#141110] to-transparent" />
    </Link>
  );
}
