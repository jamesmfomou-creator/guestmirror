"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { Logo } from "./Logo";

// Floating glass bar. On the landing page the links scroll to its sections;
// elsewhere they go to the matching pages.
export function Header() {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = onLanding
    ? [
        { href: "#methode", label: "Méthode" },
        { href: "#exemple", label: "Exemple" },
        { href: "#tarifs", label: "Tarifs" },
        { href: "/compare", label: "Comparer" },
        { href: "/espace", label: "Mon espace", wide: true },
      ]
    : [
        { href: "/compare", label: "Comparer" },
        { href: "/pricing", label: "Tarifs" },
        { href: "/espace", label: "Mon espace", wide: true },
      ];

  return (
    <header className="sticky top-3 z-40 px-4 max-[374px]:px-3 sm:top-4 sm:px-5">
      {/* Below 375px (iPhone SE 1st gen, small Androids at 320-360px) the logo and the CTA are
          tightened so they sit side by side without overlapping. */}
      <div
        className={cn(
          "mx-auto flex max-w-5xl items-center justify-between gap-2 rounded-full border py-2 pr-2 pl-5 transition-all duration-500 max-[374px]:pl-3",
          scrolled
            ? "border-border bg-card/80 shadow-[0_18px_40px_-24px_rgba(21,18,14,0.35)] backdrop-blur-xl"
            : "border-transparent bg-transparent"
        )}
      >
        <Logo className="shrink-0 max-[374px]:gap-1.5 max-[374px]:text-[15px]" />
        <nav className="flex min-w-0 items-center gap-1 text-[13.5px] text-muted">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              // "Mon espace" from lg only: at md the bar has no room for it
              // (it stays in the footer on every screen).
              className={`hidden rounded-full px-3.5 py-2 transition-colors hover:bg-foreground/[0.04] hover:text-foreground ${"wide" in l ? "lg:inline" : "md:inline"}`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/analyze"
            onClick={() => track("cta_test_clicked", { cta_location: "navbar" })}
            className="btn-ink group ml-2 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2.5 text-[13.5px] font-medium transition-colors max-[374px]:ml-0 max-[374px]:px-3 max-[374px]:text-[12.5px]"
          >
            Tester mon annonce
            <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5 max-[374px]:hidden" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
