"use client";

import { useEffect, useState } from "react";
import { ScrollingShowcase } from "@/components/landing/ScrollingShowcase";
// Type-only: lib/showcase.ts pulls in the service-role Supabase client,
// which must never end up in the client bundle (same reason lib/ab.ts is
// split from lib/ab-server.ts). Data is fetched via /api/showcase below,
// never by importing that module directly.
import type { ShowcaseItem } from "@/lib/showcase";

/**
 * Runs entirely in parallel with the real /api/analyze request -- fetched
 * once on mount, never awaited by or blocking the analysis itself, so it
 * can't add any real latency to the loader (see the earlier performance
 * pass on this exact flow).
 */
export function LoadingShowcase({ className }: { className?: string }) {
  const [items, setItems] = useState<ShowcaseItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/showcase")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setItems(json.items ?? []);
      })
      .catch(() => {
        // best-effort only -- the loader must never depend on this
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <ScrollingShowcase items={items} className={className} />;
}
