import { MAX_IMAGE_BYTES } from "@/lib/validation";
import { isAirbnbUrl } from "@/lib/airbnbUrl";

// Fetches the public Airbnb listing page and reads the same structured data
// Airbnb itself publishes for search engines / link previews (schema.org
// JSON-LD, falling back to Open Graph meta tags). This is not a headless
// browser and does not attempt to bypass any anti-bot protection -- if
// Airbnb doesn't serve this data for a given URL, extraction is reported
// as failed rather than guessed at.

export interface AirbnbListingData {
  title: string | null;
  description: string | null;
  imageUrls: string[];
  city: string | null;
  guestCapacity: string | null;
  // Structured counts Airbnb itself publishes (see og:title, e.g. "Villa ·
  // Marrakech · ★5,0 · 3 chambres · 4 lits · 2 salles de bain") -- null
  // when not present/parseable. This is the one source precise enough to
  // ground a factual claim about sleeping capacity; the model is never
  // supposed to guess these from photos when they're available (see
  // lib/ai.ts's SYSTEM_PROMPT).
  bedroomCount: number | null;
  bedCount: number | null;
  bathroomCount: number | null;
}

export type AirbnbExtractResult =
  | { ok: true; data: AirbnbListingData; durationMs: number }
  | {
      ok: false;
      errorCode: "invalid_url" | "fetch_failed" | "parse_failed" | "no_images";
      status?: number;
      durationMs: number;
    };

const FETCH_TIMEOUT_MS = 8_000;
const MAX_EXTRACTED_IMAGES = 5;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// og:title carries Airbnb's own structured summary line (both FR and EN
// listings use this pattern, e.g. "Villa · Marrakech · ★5,0 · 3 chambres ·
// 4 lits · 2 salles de bain et 1 toilette" or "... · 3 bedrooms · 4 beds ·
// 2 baths"). Present regardless of which branch below (JSON-LD or OG
// fallback) supplies title/description/images, so it's parsed separately
// and merged into whichever data object is returned. Best-effort only --
// any field that doesn't match stays null, and null is always treated as
// "unknown", never as zero.
function parseRoomCounts(html: string): { bedroomCount: number | null; bedCount: number | null; bathroomCount: number | null } {
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
  if (!ogTitle) return { bedroomCount: null, bedCount: null, bathroomCount: null };
  const decoded = decodeHtmlEntities(ogTitle);
  const bedroomCount = decoded.match(/(\d+)\s*(?:chambres?|bedrooms?)/i)?.[1];
  const bedCount = decoded.match(/(\d+)\s*(?:lits?|beds?)/i)?.[1];
  const bathroomCount = decoded.match(/(\d+)\s*(?:salles? de bain|baths?|bathrooms?)/i)?.[1];
  return {
    bedroomCount: bedroomCount ? Number(bedroomCount) : null,
    bedCount: bedCount ? Number(bedCount) : null,
    bathroomCount: bathroomCount ? Number(bathroomCount) : null,
  };
}

function parseAirbnbHtml(html: string): AirbnbListingData | null {
  const roomCounts = parseRoomCounts(html);
  // Prefer JSON-LD: richer (full description, several photos, capacity,
  // city) than Open Graph tags, and just as public/intended-for-sharing.
  const ldBlocks = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  for (const match of ldBlocks) {
    try {
      const parsed = JSON.parse(match[1]);
      const images: unknown = parsed?.image;
      if (!Array.isArray(images) || images.length === 0) continue;
      const imageUrls = images.filter((u): u is string => typeof u === "string").slice(0, MAX_EXTRACTED_IMAGES);
      if (imageUrls.length === 0) continue;
      const occupancy = parsed?.containsPlace?.occupancy?.value;
      return {
        title: typeof parsed.name === "string" ? parsed.name : null,
        description: typeof parsed.description === "string" ? parsed.description : null,
        imageUrls,
        city: typeof parsed?.address?.addressLocality === "string" ? parsed.address.addressLocality : null,
        guestCapacity: typeof occupancy === "number" ? String(occupancy) : null,
        ...roomCounts,
      };
    } catch {
      continue;
    }
  }

  // Fallback: Open Graph tags (single cover image, short description).
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (!ogImage) return null;
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
  const ogDescription = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];
  return {
    title: ogTitle ? decodeHtmlEntities(ogTitle) : null,
    description: ogDescription ? decodeHtmlEntities(ogDescription) : null,
    imageUrls: [decodeHtmlEntities(ogImage)],
    city: null,
    guestCapacity: null,
    ...roomCounts,
  };
}

export async function extractAirbnbListing(rawUrl: string): Promise<AirbnbExtractResult> {
  const startedAt = Date.now();

  if (!isAirbnbUrl(rawUrl)) {
    return { ok: false, errorCode: "invalid_url", durationMs: Date.now() - startedAt };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    // No Accept-Language header: sending one that doesn't match the
    // requested domain (e.g. fr-FR against airbnb.com) makes Airbnb serve
    // a client-side JS domain-switch interstitial instead of the listing
    // page -- same HTTP 200, but none of the real content, since that
    // redirect happens via an auto-submitting form rather than a normal
    // HTTP redirect fetch() can follow.
    const res = await fetch(rawUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, errorCode: "fetch_failed", status: res.status, durationMs: Date.now() - startedAt };
    }
    html = await res.text();
  } catch {
    return { ok: false, errorCode: "fetch_failed", durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }

  const data = parseAirbnbHtml(html);
  if (!data || data.imageUrls.length === 0) {
    // Covers both real parse failures and Airbnb's "soft 404" (HTTP 200
    // with a custom not-found page for removed/invalid listings) -- either
    // way there's nothing usable, and both map to the same fallback.
    return { ok: false, errorCode: data ? "no_images" : "parse_failed", durationMs: Date.now() - startedAt };
  }
  return { ok: true, data, durationMs: Date.now() - startedAt };
}

export async function downloadImageAsBase64(url: string): Promise<{ base64: string; mediaType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
    return { base64: buffer.toString("base64"), mediaType: contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
