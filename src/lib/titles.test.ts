import { describe, expect, it } from "vitest";
import { sanitizeAirbnbTitle, sanitizeAirbnbTitles, titleCharCount, AIRBNB_TITLE_MAX_LENGTH } from "./titles";

describe("sanitizeAirbnbTitles", () => {
  it("passes through titles that already fit", () => {
    expect(sanitizeAirbnbTitles(["Appartement lumineux, terrasse vue mer"])).toEqual([
      "Appartement lumineux, terrasse vue mer",
    ]);
  });

  it("shortens an oversized title to fit the Airbnb limit", () => {
    const long = "Superbe appartement rénové avec terrasse panoramique et vue imprenable sur la mer Méditerranée";
    const [result] = sanitizeAirbnbTitles([long]);
    expect(titleCharCount(result)).toBeLessThanOrEqual(AIRBNB_TITLE_MAX_LENGTH);
  });

  it("drops duplicate titles produced by shortening", () => {
    const a = "Appartement avec terrasse et vue mer imprenable à Marseille centre-ville";
    const b = "Appartement avec terrasse et vue mer imprenable à Marseille proche port";
    const result = sanitizeAirbnbTitles([a, b]);
    expect(new Set(result).size).toBe(result.length);
  });

  // Regression test for the confirmed production bug (audit, 2026-11):
  // the model's schema asks for an array of strings but doesn't guarantee
  // it -- a non-string entry used to throw uncaught (rawTitle.trim() on a
  // non-string), surfacing ~60s into an otherwise-successful analysis as
  // an uncategorized "unknown" 500.
  it("never throws on a non-string entry, and drops it rather than crashing", () => {
    expect(() =>
      sanitizeAirbnbTitles(["Un vrai titre valide", null, undefined, 42, { not: "a string" }] as unknown[])
    ).not.toThrow();
    expect(sanitizeAirbnbTitles(["Un vrai titre valide", null] as unknown[])).toEqual(["Un vrai titre valide"]);
  });

  it("returns an empty array, not a crash, when every entry is unusable", () => {
    expect(sanitizeAirbnbTitles([null, undefined, ""] as unknown[])).toEqual([]);
  });
});

describe("sanitizeAirbnbTitle", () => {
  it("returns null for an empty or whitespace-only title", () => {
    expect(sanitizeAirbnbTitle("")).toBeNull();
    expect(sanitizeAirbnbTitle("   ")).toBeNull();
  });

  it("never cuts mid-word", () => {
    const source = "Magnifique villa avec piscine chauffée, jacuzzi, vue panoramique sur les collines provençales";
    const result = sanitizeAirbnbTitle(source);
    expect(result).not.toBeNull();
    const stripPunct = (w: string) => w.replace(/[,.;:!?]+$/, "");
    const sourceWords = new Set(source.split(" ").map(stripPunct));
    for (const word of (result as string).split(" ")) {
      expect(sourceWords.has(stripPunct(word))).toBe(true);
    }
  });
});
