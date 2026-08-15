import Link from "next/link";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Logo />
        <nav className="flex items-center gap-5 text-sm text-muted">
          <Link href="/compare" className="hidden transition-colors hover:text-foreground sm:inline">
            Comparer
          </Link>
          <Link href="/pricing" className="hidden transition-colors hover:text-foreground sm:inline">
            Tarif
          </Link>
          <Link
            href="/analyze"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Test des 5 secondes
          </Link>
        </nav>
      </div>
    </header>
  );
}
