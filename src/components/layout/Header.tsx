"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { Logo } from "./Logo";

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-3 z-40 px-4 sm:top-4 sm:px-5">
      <div
        className={cn(
          "mx-auto flex max-w-5xl items-center justify-between rounded-full border px-5 py-3 transition-all duration-300",
          scrolled
            ? "border-border bg-card/95 shadow-[0_12px_32px_-16px_rgba(28,26,23,0.25)] backdrop-blur-md"
            : "border-border/60 bg-card/75 backdrop-blur-sm"
        )}
      >
        <Logo />
        <nav className="flex items-center gap-5 text-sm text-muted">
          <Link
            href="/compare"
            className="hidden transition-opacity hover:opacity-70 sm:inline"
          >
            Comparer
          </Link>
          <Link href="/pricing" className="hidden transition-opacity hover:opacity-70 sm:inline">
            Tarif
          </Link>
          <Link
            href="/analyze"
            onClick={() => track("cta_test_clicked", { cta_location: "navbar" })}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform duration-200 hover:-translate-y-px hover:scale-[1.02] active:scale-[0.98]"
          >
            Test des 5 secondes
          </Link>
        </nav>
      </div>
    </header>
  );
}
