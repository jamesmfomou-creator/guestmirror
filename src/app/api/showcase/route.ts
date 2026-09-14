import { NextResponse } from "next/server";
import { getShowcaseItems, ShowcaseItem } from "@/lib/showcase";

// Fired once per analysis start (see LoadingShowcase) -- cached briefly
// in-memory so a burst of analyses starting around the same time doesn't
// each trigger their own Supabase reads for what is, moments apart,
// identical data.
let cached: { items: ShowcaseItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function GET() {
  if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    cached = { items: await getShowcaseItems(), fetchedAt: Date.now() };
  }
  return NextResponse.json({ items: cached.items });
}
