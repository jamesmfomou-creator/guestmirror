import Link from "next/link";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/70 pt-16 pb-10">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-display text-[2.6rem] text-foreground sm:text-[3.2rem]">{BRAND_NAME}</p>
            <p className="mt-3 max-w-sm text-[15px] text-muted">{BRAND_TAGLINE}</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-3 text-[14px] text-muted sm:justify-self-end">
            <span className="label-mono col-span-2 mb-1 text-muted-2">Navigation</span>
            <Link href="/analyze" className="transition-colors hover:text-foreground">Analyser mon annonce</Link>
            <Link href="/compare" className="transition-colors hover:text-foreground">Comparer</Link>
            <Link href="/pricing" className="transition-colors hover:text-foreground">Tarifs</Link>
            <Link href="/privacy" className="transition-colors hover:text-foreground">Confidentialité</Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">Conditions</Link>
          </nav>
        </div>
        <div className="mt-14 flex flex-col gap-4 border-t border-border/70 pt-6 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl text-xs leading-relaxed text-muted-2">
            {BRAND_NAME} est un service indépendant et n&apos;est ni affilié, ni sponsorisé, ni approuvé par Airbnb. Le{" "}
            {BRAND_NAME} est une estimation produite par notre outil à partir des éléments visibles de l&apos;annonce ; il
            ne prédit ni ne garantit les réservations.
          </p>
          <p className="shrink-0 text-xs text-muted-2">© {new Date().getFullYear()} {BRAND_NAME}</p>
        </div>
      </div>
    </footer>
  );
}
