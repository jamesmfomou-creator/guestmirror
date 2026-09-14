// Single source of truth for Airbnb's title character limit -- imported by
// the AI prompt/schema (lib/ai.ts), the post-generation validator below,
// and the report UI (TitleSection.tsx), so it's never hardcoded twice.
// No dependencies (no Anthropic SDK, no Supabase client): safe to import
// from both server-only code and client components.
export const AIRBNB_TITLE_MAX_LENGTH = 50;

/**
 * Counts by Unicode codepoint, not UTF-16 code unit (title.length), so a
 * single emoji counts as one character instead of two -- matches what a
 * human (and Airbnb's own character counter) would count.
 */
export function titleCharCount(title: string): number {
  return Array.from(title.trim()).length;
}

// Trailing connector words that read as unfinished if left dangling at
// the very end of a shortened title (e.g. "Appartement avec" after
// dropping "terrasse" would be worse than just "Appartement").
const TRAILING_STOPWORDS = new Set([
  "avec",
  "et",
  "de",
  "du",
  "des",
  "à",
  "au",
  "aux",
  "sur",
  "dans",
  "pour",
  "sans",
  "en",
  "la",
  "le",
  "les",
  "un",
  "une",
  "près",
  "proche",
  "&",
]);

function stripTrailingStopwords(joined: string): string {
  let words = joined.split(" ");
  while (words.length > 1) {
    const last = words[words.length - 1]
      .toLowerCase()
      .replace(/^[«"']+|[»",.;:!?'"]+$/g, "");
    if (!TRAILING_STOPWORDS.has(last)) break;
    words = words.slice(0, -1);
  }
  return words
    .join(" ")
    .replace(/[,\-–:]\s*$/, "")
    .trim();
}

// Cutting purely by word count can leave a dangling adjective with no
// noun left to describe (e.g. trimming "... avec superbe terrasse" down
// to "... avec superbe"). Cutting at a whole clause boundary instead --
// dropping everything from the connector onward -- keeps what remains a
// complete clause. Checked first; word-level trimming is only the
// fallback for a single clause with no early-enough natural break.
const CLAUSE_DELIMITERS = [", ", " avec ", " et ", " - ", " – ", " : "];

function clauseBoundaryCandidates(title: string): string[] {
  const candidates: string[] = [];
  for (const delim of CLAUSE_DELIMITERS) {
    let searchFrom = title.length;
    for (;;) {
      const idx = title.lastIndexOf(delim, searchFrom - 1);
      if (idx <= 0) break;
      const candidate = stripTrailingStopwords(title.slice(0, idx));
      if (titleCharCount(candidate) > 0) candidates.push(candidate);
      searchFrom = idx;
    }
  }
  return candidates;
}

/**
 * Shortens a title to fit AIRBNB_TITLE_MAX_LENGTH without ever cutting
 * mid-word, preferring a full clause boundary (see above) over a raw
 * word-count cut. Returns null if nothing fits even a single word (the
 * caller drops the title rather than ever showing a mangled one).
 */
export function sanitizeAirbnbTitle(rawTitle: string): string | null {
  const normalized = rawTitle.trim().replace(/\s+/g, " ");
  if (titleCharCount(normalized) === 0) return null;
  if (titleCharCount(normalized) <= AIRBNB_TITLE_MAX_LENGTH) return normalized;

  const fittingClauses = clauseBoundaryCandidates(normalized)
    .filter((c) => titleCharCount(c) <= AIRBNB_TITLE_MAX_LENGTH)
    .sort((a, b) => titleCharCount(b) - titleCharCount(a));
  if (fittingClauses.length > 0) return fittingClauses[0];

  let words = normalized.split(" ");
  while (words.length > 1) {
    words = words.slice(0, -1);
    const candidate = stripTrailingStopwords(words.join(" "));
    if (titleCharCount(candidate) > 0 && titleCharCount(candidate) <= AIRBNB_TITLE_MAX_LENGTH) {
      return candidate;
    }
  }
  return null;
}

/** Applies sanitizeAirbnbTitle to a list, dropping unfixable titles and duplicates produced by shortening. */
export function sanitizeAirbnbTitles(rawTitles: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawTitles) {
    const clean = sanitizeAirbnbTitle(raw);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  }
  return result;
}
