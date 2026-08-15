import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/70 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 text-sm text-muted">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="font-medium text-foreground">{BRAND_NAME}</span>
          <nav className="flex flex-wrap gap-5">
            <Link href="/compare" className="hover:text-foreground">Comparer</Link>
            <Link href="/pricing" className="hover:text-foreground">Tarif</Link>
            <Link href="/privacy" className="hover:text-foreground">Confidentialité</Link>
            <Link href="/terms" className="hover:text-foreground">Conditions</Link>
          </nav>
        </div>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-2">
          {BRAND_NAME} est un service indépendant et n&apos;est ni affilié, ni sponsorisé, ni
          approuvé par Airbnb. Le {BRAND_NAME} est une estimation produite par notre outil à
          partir des éléments visibles de l&apos;annonce ; il ne prédit ni ne garantit les
          réservations.
        </p>
        <p className="text-xs text-muted-2">© {new Date().getFullYear()} {BRAND_NAME}</p>
      </div>
    </footer>
  );
}
