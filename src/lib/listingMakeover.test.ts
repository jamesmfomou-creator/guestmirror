import { describe, expect, it } from "vitest";
import { DEMO_RESULT } from "./demo-data";
import type { AnalysisResult } from "./types";
import {
  buildListingMakeover,
  cutAtWord,
  descriptionExcerpt,
  listingMakeoverEnabled,
  openingOf,
  LISTING_DESCRIPTION_EXCERPT_MAX,
  MAKEOVER_HOOK_MAX,
} from "./listingMakeover";

const IMAGES = ["https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg", "https://x/4.jpg", "https://x/5.jpg"];
const base = (over: Partial<AnalysisResult> & Record<string, unknown> = {}): AnalysisResult =>
  ({ ...structuredClone(DEMO_RESULT), ...over }) as AnalysisResult;

describe("buildListingMakeover — complete analysis", () => {
  const m = buildListingMakeover(
    base({ listing_title: "Superbe appartement au cœur de Marseille", listing_description_excerpt: "Bel appartement très agréable. Idéalement situé." }),
    IMAGES,
    { city: "Marseille" }
  )!;

  it("before = the real listing, after = the report's first different title, opening of the rewrite, recommended cover", () => {
    expect(m.before).toEqual({
      photoUrl: IMAGES[0],
      title: "Superbe appartement au cœur de Marseille",
      text: "Bel appartement très agréable. Idéalement situé.",
    });
    expect(m.after.title).toBe(DEMO_RESULT.title_analysis.suggested_titles[0]);
    // recommended_photo_order[0] = 5 (1-based) -> the 5th analysed photo
    expect(m.after.photoUrl).toBe(IMAGES[4]);
    expect(m.after.text!.startsWith("Profitez d'une terrasse avec vue dégagée")).toBe(true);
    expect(m.after.text!.length).toBeLessThanOrEqual(MAKEOVER_HOOK_MAX);
    expect(m.city).toBe("Marseille");
    expect([m.titleChanged, m.coverChanged, m.textChanged, m.titleKept]).toEqual([true, true, true, false]);
  });

  it("at most three changes, each tied to what really changed, with the report's own issue", () => {
    expect(m.changes.map((c) => c.kind)).toEqual(["title", "cover", "description"]);
    expect(m.changes[0].detail).toBe(`Corrige : ${DEMO_RESULT.title_analysis.issues[0][0].toLowerCase()}${DEMO_RESULT.title_analysis.issues[0].slice(1)}.`);
    expect(m.changes[2].detail).toContain("le principal atout (la terrasse)");
  });

  it("never carries the rest of the paid report", () => {
    const json = JSON.stringify(m);
    for (const t of DEMO_RESULT.title_analysis.suggested_titles.slice(1)) expect(json).not.toContain(t);
    expect(json).not.toContain("Accès autonome via boîte à clés"); // later in the rewritten description
    for (const w of DEMO_RESULT.weaknesses) expect(json).not.toContain(w.recommendation);
    for (const a of DEMO_RESULT.action_plan) expect(json).not.toContain(a);
    expect(json).not.toContain(DEMO_RESULT.description_analysis.missing_information[0]);
    expect(Object.keys(m).sort()).toEqual(["after", "before", "changes", "city", "coverChanged", "textChanged", "titleChanged", "titleKept"]);
  });
});

describe("buildListingMakeover — incomplete data", () => {
  it("no photo: no photo on either side, never a generic one", () => {
    const m = buildListingMakeover(base(), [])!;
    expect(m.before.photoUrl).toBeNull();
    expect(m.after.photoUrl).toBeNull();
    expect(m.coverChanged).toBe(false);
    expect(m.changes.map((c) => c.kind)).toEqual(["title", "description"]);
  });

  it("recommended order out of range or not a number: same cover as before", () => {
    for (const order of [[9, 1], [0], ["2"], []]) {
      const m = buildListingMakeover(base({ recommended_photo_order: order as number[] }), IMAGES)!;
      expect(m.after.photoUrl).toBe(IMAGES[0]);
      expect(m.coverChanged).toBe(false);
    }
  });

  it("title already good (every suggestion equals it): the title is kept and said so", () => {
    const r = base({ listing_title: "Appartement lumineux, terrasse vue Vieux-Port" });
    r.title_analysis.suggested_titles = ["appartement lumineux — terrasse vue Vieux Port"];
    const m = buildListingMakeover(r, IMAGES)!;
    expect(m.titleChanged).toBe(false);
    expect(m.titleKept).toBe(true);
    expect(m.after.title).toBe("Appartement lumineux, terrasse vue Vieux-Port");
    expect(m.changes.some((c) => c.kind === "title")).toBe(false);
  });

  it("suggestions over Airbnb's 50 characters or with leaked markup are ignored", () => {
    const r = base();
    r.title_analysis.suggested_titles = ["x".repeat(51), '<parameter name="t">Titre', "Studio calme près du Vieux-Port"];
    expect(buildListingMakeover(r, IMAGES)!.after.title).toBe("Studio calme près du Vieux-Port");
  });

  it("a too-long current title: the change says so with real counts", () => {
    const long = "Superbe appartement rénové au cœur de Marseille avec terrasse";
    const m = buildListingMakeover(base({ listing_title: long }), IMAGES)!;
    expect(m.changes[0].detail).toMatch(new RegExp(`au lieu de ${Array.from(long).length} : il tient dans la limite Airbnb de 50`));
  });

  it("no rewritten description: no hook, the after card keeps the rest", () => {
    const r = base();
    r.description_analysis.improved_description = "";
    const m = buildListingMakeover(r, IMAGES)!;
    expect(m.after.text).toBeNull();
    expect(m.textChanged).toBe(false);
  });

  it("nothing really changes: no preview at all (the page renders as before)", () => {
    const r = base({ listing_title: "Mon titre", recommended_photo_order: [1] });
    r.title_analysis.suggested_titles = ["Mon titre"];
    r.description_analysis.improved_description = "";
    expect(buildListingMakeover(r, IMAGES)).toBeNull();
  });

  it("a legacy / malformed result never throws", () => {
    expect(buildListingMakeover({} as AnalysisResult, IMAGES)).toBeNull();
    expect(buildListingMakeover({ title_analysis: null, description_analysis: 3 } as unknown as AnalysisResult, [])).toBeNull();
  });

  it("current title falls back to the model's reading when Airbnb's is absent", () => {
    expect(buildListingMakeover(base(), IMAGES)!.before.title).toBe(DEMO_RESULT.title_analysis.current_title);
  });
});

describe("text helpers", () => {
  it("openingOf keeps one or two whole sentences within the cap", () => {
    expect(openingOf("Un. Deux. Trois.", 100)).toBe("Un. Deux.");
    expect(openingOf("Phrase sans point", 100)).toBe("Phrase sans point");
    expect(openingOf("a ".repeat(200), 50)!.endsWith("…")).toBe(true);
    expect(openingOf('{"x": 1}', 50)).toBeNull();
    expect(openingOf(null, 50)).toBeNull();
  });
  it("openingOf never ends inside an unclosed parenthesis", () => {
    const t = "Dans une petite rue calme du 12e, cet appartement cosy a été refait avec des enduits bleu-gris et des touches vintage (lustres en laiton, miroirs anciens, tapis berbères et fauteuils chinés) pour un séjour.";
    expect(openingOf(t, 190)).toBe("Dans une petite rue calme du 12e, cet appartement cosy a été refait avec des enduits bleu-gris et des touches vintage…");
    expect(openingOf("Studio (climatisation réversible) au calme.", 190)).toBe("Studio (climatisation réversible) au calme.");
  });
  it("cutAtWord never cuts inside a word", () => {
    expect(cutAtWord("appartement lumineux et calme", 20)).toBe("appartement…");
  });
  it("descriptionExcerpt strips markup and caps the stored excerpt", () => {
    expect(descriptionExcerpt("<b>Bel</b>   appart<br/>calme")).toBe("Bel appart calme");
    expect(descriptionExcerpt("mot ".repeat(300))!.length).toBeLessThanOrEqual(LISTING_DESCRIPTION_EXCERPT_MAX);
    expect(descriptionExcerpt(null)).toBeNull();
  });
  it("withdrawn: off unless LISTING_MAKEOVER_ENABLED=1", () => {
    expect(listingMakeoverEnabled({})).toBe(false);
    expect(listingMakeoverEnabled({ LISTING_MAKEOVER_DISABLED: "1" })).toBe(false);
    expect(listingMakeoverEnabled({ LISTING_MAKEOVER_ENABLED: "1" })).toBe(true);
  });
});
