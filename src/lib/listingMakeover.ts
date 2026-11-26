import type { AnalysisResult } from "@/lib/types";
import { AIRBNB_TITLE_MAX_LENGTH, titleCharCount } from "@/lib/titles";

// "Avant / Après" preview of the visitor's own listing on the FREE result
// (components/result/ListingMakeover.tsx, result_version "makeover_v1").
//
// Like lib/freeReveal.ts, this is a boundary between the stored report and a
// page shown to a visitor who has not paid. It returns ONLY plain strings and
// booleans built here, never an object of the report. Of the paid content it
// deliberately carries, and nothing more:
//   - ONE suggested title (the first one that really differs from the current
//     title) -- the report's other suggested titles stay paid;
//   - the OPENING of the rewritten description (one or two sentences, capped)
//     -- the full rewrite stays paid;
//   - which analysed photo the report would put first (cover);
//   - for each change shown, the report's own first issue it addresses.
//
// Nothing is generated here and no AI is called: every string comes from the
// analysis already stored. Nothing is invented either -- a missing piece is
// left out (null), never replaced by a placeholder, a generic photo, a
// projected score or a promise. Without at least one real change to show,
// there is no preview (null) and the page renders as before.
//
// Pure and dependency-light (no Supabase, no SDK): unit-tested.

/**
 * Withdrawn from the free result on 2026-11-26 at the owner's request (live
 * 2026-11-25 -> 2026-11-26 as result_version makeover_v1). OFF unless
 * LISTING_MAKEOVER_ENABLED=1; the code is kept so it can come back as is.
 */
export function listingMakeoverEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LISTING_MAKEOVER_ENABLED === "1";
}

export interface MakeoverSide {
  /** A real photo of this listing (an analysed image), or null: no photo shown. */
  photoUrl: string | null;
  title: string | null;
  /** Before: opening of the real description (when stored). After: opening of the rewritten one. */
  text: string | null;
}

export interface MakeoverChange {
  kind: "title" | "cover" | "description";
  label: string;
  /** The report's own issue this change answers, or a measurable fact (length). */
  detail: string | null;
}

export interface ListingMakeover {
  before: MakeoverSide;
  after: MakeoverSide;
  city: string | null;
  titleChanged: boolean;
  coverChanged: boolean;
  textChanged: boolean;
  /** The current title already reads well: the after card keeps it, and says so. */
  titleKept: boolean;
  /** Up to three changes, each one visible on the after card. */
  changes: MakeoverChange[];
}

export const MAKEOVER_HOOK_MAX = 190;
export const MAKEOVER_BEFORE_TEXT_MAX = 190;
/** Stored with new reports by /api/analyze (listing_description_excerpt). */
export const LISTING_DESCRIPTION_EXCERPT_MAX = 480;
const MAX_ISSUE = 140;

const clean = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : null;
};
// Leaked markup or a model artefact is never shown (lib/aiRepair.ts context).
const looksBroken = (s: string) => /<\/?parameter\b|<\/?[a-z]+[^>]*>|\{\s*"|\bundefined\b|\bnull\b/i.test(s);
const comparable = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Cut at a word boundary, with an ellipsis when something was cut. */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const space = slice.lastIndexOf(" ");
  return `${(space > 0 ? slice.slice(0, space) : slice).replace(/[\s,;:–-]+$/, "")}…`;
}

/** The first one or two sentences of a text, capped at `max` characters. */
export function openingOf(text: string | null, max: number): string | null {
  const t = clean(text);
  if (!t || looksBroken(t)) return null;
  const sentences = t.match(/[^.!?…]+[.!?…]+(?=\s|$)|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [t];
  let out = sentences[0];
  if (sentences[1] && out.length + 1 + sentences[1].length <= max) out = `${out} ${sentences[1]}`;
  const cut = cutAtWord(out, max);
  // Never end inside an unclosed parenthesis ("(lustres en laiton…"): stop before it.
  const open = cut.lastIndexOf("(");
  if (open > 0 && cut.indexOf(")", open) === -1 && open > max * 0.4) return `${cut.slice(0, open).replace(/[\s,;:–-]+$/, "")}…`;
  return cut;
}

/** Excerpt of the real listing description kept with a new report (set server side, never by the model). */
export function descriptionExcerpt(description: string | null | undefined): string | null {
  const t = clean(description?.replace(/<[^>]*>/g, " "));
  return t ? cutAtWord(t, LISTING_DESCRIPTION_EXCERPT_MAX) : null;
}

/** "Corrige : <the report's own first issue>", or null. */
const firstIssue = (list: unknown): string | null => {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    const t = clean(item)?.replace(/[.\s]+$/, "");
    // Lower-case the first letter unless it starts an acronym ("WiFi", "TV").
    if (t && !looksBroken(t) && t.length <= MAX_ISSUE) return `Corrige : ${/^[A-ZÀ-Ý][a-zà-ÿ]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t}.`;
  }
  return null;
};

export function buildListingMakeover(
  result: AnalysisResult,
  images: string[],
  opts: { city?: string | null } = {}
): ListingMakeover | null {
  const raw = result as unknown as Record<string, unknown>;
  const ta = (raw.title_analysis ?? {}) as Record<string, unknown>;
  const da = (raw.description_analysis ?? {}) as Record<string, unknown>;

  // Current title: the one read on Airbnb itself first, else the model's reading of it.
  const currentTitle = [clean(raw.listing_title), clean(ta.current_title)].find((t) => t && !looksBroken(t)) ?? null;

  // Optimized title: the first suggestion that fits Airbnb's limit and really
  // differs from the current one. None differs: the title is kept.
  const suggestions = (Array.isArray(ta.suggested_titles) ? ta.suggested_titles : [])
    .map(clean)
    .filter((t): t is string => t !== null && !looksBroken(t) && titleCharCount(t) <= AIRBNB_TITLE_MAX_LENGTH);
  const newTitle =
    suggestions.find((t) => !currentTitle || comparable(t) !== comparable(currentTitle)) ?? null;
  const titleKept = Boolean(currentTitle && suggestions.length > 0 && !newTitle);
  const titleChanged = newTitle !== null;

  // Opening of the rewritten description vs. the real one (when stored).
  const hook = openingOf(clean(da.improved_description), MAKEOVER_HOOK_MAX);
  const beforeText = openingOf(clean(raw.listing_description_excerpt), MAKEOVER_BEFORE_TEXT_MAX);
  const textChanged = hook !== null && (!beforeText || comparable(hook) !== comparable(beforeText));

  // Photos: only the analysed images of THIS listing. The after card uses the
  // photo the report puts first (recommended_photo_order, 1-based like
  // photo_analysis.image_index); invalid order: same cover as before.
  const photos = images.filter((u) => typeof u === "string" && u.length > 0);
  const beforePhoto = photos[0] ?? null;
  const order = Array.isArray(raw.recommended_photo_order) ? raw.recommended_photo_order : [];
  const first = typeof order[0] === "number" && Number.isInteger(order[0]) ? order[0] : null;
  const afterPhoto = first !== null && first >= 1 && first <= photos.length ? photos[first - 1] : beforePhoto;
  const coverChanged = Boolean(beforePhoto && afterPhoto && afterPhoto !== beforePhoto);

  if (!titleChanged && !textChanged && !coverChanged) return null;

  const changes: MakeoverChange[] = [];
  if (titleChanged) {
    const tooLong = currentTitle && titleCharCount(currentTitle) > AIRBNB_TITLE_MAX_LENGTH;
    changes.push({
      kind: "title",
      label: "Un titre plus précis",
      detail: tooLong
        ? `${titleCharCount(newTitle!)} caractères au lieu de ${titleCharCount(currentTitle!)} : il tient dans la limite Airbnb de ${AIRBNB_TITLE_MAX_LENGTH}.`
        : firstIssue(ta.issues),
    });
  }
  if (coverChanged) {
    changes.push({
      kind: "cover",
      label: "Une autre photo en couverture",
      detail: "Celle de tes photos que l'analyse place en premier.",
    });
  }
  if (textChanged) {
    changes.push({ kind: "description", label: "Une accroche plus parlante", detail: firstIssue(da.issues) });
  }

  return {
    before: { photoUrl: beforePhoto, title: currentTitle, text: beforeText },
    after: { photoUrl: afterPhoto, title: newTitle ?? currentTitle, text: hook },
    city: clean(opts.city) ?? null,
    titleChanged,
    coverChanged,
    textChanged,
    titleKept,
    changes: changes.slice(0, 3),
  };
}
