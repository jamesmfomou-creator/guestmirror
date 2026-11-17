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
      ]
    : [
        { href: "/compare", label: "Comparer" },
        { href: "/pricing", label: "Tarifs" },
      ];

  return (
    <header className="sticky top-3 z-40 px-4 sm:top-4 sm:px-5">
      <div
        className={cn(
          "mx-auto flex max-w-5xl items-center justify-between rounded-full border py-2 pr-2 pl-5 transition-all duration-500",
          scrolled
            ? "border-border bg-card/80 shadow-[0_18px_40px_-24px_rgba(21,18,14,0.35)] backdrop-blur-xl"
            : "border-transparent bg-transparent"
        )}
      >
        <Logo />
        <nav className="flex items-center gap-1 text-[13.5px] text-muted">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hidden rounded-full px-3.5 py-2 transition-colors hover:bg-foreground/[0.04] hover:text-foreground md:inline"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/analyze"
            onClick={() => track("cta_test_clicked", { cta_location: "navbar" })}
            className="btn-ink group ml-2 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13.5px] font-medium transition-colors"
          >
            Tester mon annonce
            <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
