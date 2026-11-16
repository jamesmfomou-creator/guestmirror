// What the immersive analysis loader shows of the visitor's own listing
// (lib/loaderExperiment.ts, components/analyze/AnalysisImmersive.tsx).
//
// Built from the same public data /api/analyze already reads
// (lib/airbnbExtract.ts), fetched earlier by /api/listing-preview so it can be
// shown during the wait. Only what is displayed leaves the server: the title,
// a few lines of the description, and photo URLs on Airbnb's own image CDN.
// Pure and dependency-free, so it is safe in client bundles and unit-tested.

export interface ListingPreview {
  title: string | null;
  /** A few short lines from the start of the real description, in order. */
  descriptionLines: string[];
  /** Photo URLs on Airbnb's CDN only, in listing order. */
  imageUrls: string[];
  city: string | null;
}

const MAX_PREVIEW_IMAGES = 6;
const MAX_TITLE_CHARS = 200;
const MAX_DESCRIPTION_LINES = 4;
const MAX_LINE_CHARS = 140;
// Only the opening of the description is shown: enough to recognise one's
// own text, not a copy of it.
const MAX_EXCERPT_CHARS = 480;
// Airbnb's CDN resizes on this query parameter; 720 px wide is plenty for a
// loader card and much lighter than the originals.
const LOADER_IMAGE_WIDTH = 720;

/** https only, on Airbnb's image CDN (muscache.com) -- never an arbitrary host. */
export function isAirbnbCdnImageUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return url.hostname === "muscache.com" || url.hostname.endsWith(".muscache.com");
  } catch {
    return false;
  }
}

/** The CDN URL sized for the loader. The original stays the fallback if this one fails to load. */
export function loaderImageUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("im_w")) url.searchParams.set("im_w", String(LOADER_IMAGE_WIDTH));
    return url.toString();
  } catch {
    return raw;
  }
}

function clean(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).replace(/[\s,;:–-]+$/, "")}…`;
}

/** Short lines from the opening of the description, cut at sentence and word boundaries. */
export function descriptionExcerptLines(description: string | null | undefined): string[] {
  if (!description) return [];
  const text = clean(description);
  if (!text) return [];
  const opening = text.length > MAX_EXCERPT_CHARS ? text.slice(0, MAX_EXCERPT_CHARS) : text;
  const sentences = opening
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lines: string[] = [];
  for (const sentence of sentences) {
    if (lines.length >= MAX_DESCRIPTION_LINES) break;
    lines.push(cutAtWord(sentence, MAX_LINE_CHARS));
  }
  // The excerpt was cut mid-sentence: say so rather than present a fragment as the end.
  if (text.length > opening.length && lines.length > 0 && !lines[lines.length - 1].endsWith("…")) {
    const last = lines[lines.length - 1];
    if (!/[.!?]$/.test(last)) lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

export function buildListingPreview(data: {
  title: string | null;
  description: string | null;
  imageUrls: string[];
  city: string | null;
}): ListingPreview {
  const title = data.title ? clean(data.title) : "";
  const city = data.city ? clean(data.city) : "";
  return {
    title: title ? cutAtWord(title, MAX_TITLE_CHARS) : null,
    descriptionLines: descriptionExcerptLines(data.description),
    imageUrls: data.imageUrls.filter(isAirbnbCdnImageUrl).slice(0, MAX_PREVIEW_IMAGES),
    city: city || null,
  };
}

/** Narrow, defensive check of what /api/listing-preview returned (client side). */
export function parseListingPreview(raw: unknown): ListingPreview | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    title: typeof r.title === "string" && r.title.trim() ? r.title : null,
    descriptionLines: strings(r.descriptionLines).slice(0, MAX_DESCRIPTION_LINES),
    imageUrls: strings(r.imageUrls).filter(isAirbnbCdnImageUrl).slice(0, MAX_PREVIEW_IMAGES),
    city: typeof r.city === "string" && r.city.trim() ? r.city : null,
  };
}
