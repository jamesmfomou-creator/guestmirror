import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { MAX_ANALYZED_PHOTOS, parseAirbnbHtml } from "./airbnbExtract";
import { buildAnalysisRequest } from "./ai";
import {
  GALLERY_COUNT_VERIFIED,
  buildUrlCoverage,
  coverageNote,
  describeSentPhotos,
  hedgeUnverifiedAbsences,
  isUnverifiedAbsenceClaim,
  screenshotCoverage,
} from "./photoCoverage";
import type { AnalysisResult } from "./types";

// Synthetic Airbnb page: the public JSON-LD block GuestMirror reads, with N
// gallery photos (no real listing, no network).
function airbnbPage(n: number, extra: string[] = []): string {
  const images = [...Array.from({ length: n }, (_, i) => `https://img.example/photo-${i + 1}.jpg`), ...extra];
  const ld = { "@type": "VacationRental", name: "Studio lumineux", description: "Un studio calme.", image: images, address: { addressLocality: "Lyon" } };
  return `<html><head><meta property="og:title" content="Studio · Lyon · 1 chambre · 1 lit · 1 salle de bain"><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`;
}

const sent = (c: { positions: number[] | null }) => c.positions;
const req = (coverage: ReturnType<typeof buildUrlCoverage> | ReturnType<typeof screenshotCoverage> | null, images = 5) =>
  buildAnalysisRequest({
    images: Array.from({ length: images }, () => ({ base64: "AAAA", mediaType: "image/jpeg" })),
    input: { listing_url: "https://www.airbnb.fr/rooms/1", city: null, property_type: null, guest_capacity: null, nightly_price: null },
    extractedListingText: null,
    photoCoverage: coverage,
  });
const userText = (r: Anthropic.MessageCreateParamsNonStreaming) => ((r.messages[0].content as Anthropic.ContentBlockParam[])[0] as Anthropic.TextBlockParam).text;
const systemText = (r: Anthropic.MessageCreateParamsNonStreaming) => String(r.system);

describe("case 1-3: gallery of 5, 15, 30 photos (link import)", () => {
  it("selects the first photos in gallery order and keeps the gallery size", () => {
    expect(MAX_ANALYZED_PHOTOS).toBe(5);
    for (const n of [5, 15, 30]) {
      const data = parseAirbnbHtml(airbnbPage(n))!;
      expect(data.galleryImageCount).toBe(n);
      expect(data.imageUrls).toEqual(Array.from({ length: Math.min(n, 5) }, (_, i) => `https://img.example/photo-${i + 1}.jpg`));
    }
  });

  it("knows whether the gallery is complete (once the public photo count is verified)", () => {
    const five = buildUrlCoverage(5, [true, true, true, true, true], true);
    expect(five).toMatchObject({ sent: 5, galleryTotal: 5, complete: true });
    const fifteen = buildUrlCoverage(15, [true, true, true, true, true], true);
    expect(fifteen).toMatchObject({ sent: 5, galleryTotal: 15, complete: false });
    expect(sent(fifteen)).toEqual([1, 2, 3, 4, 5]);
    expect(buildUrlCoverage(30, [true, true, true, true, true], true).complete).toBe(false);
  });

  it("by default (count not verified) a link import is NEVER complete, and the count is a minimum", () => {
    expect(GALLERY_COUNT_VERIFIED).toBe(false);
    const five = buildUrlCoverage(5, [true, true, true, true, true]);
    expect(five).toMatchObject({ complete: false, countIsMinimum: true });
    expect(userText(req(five))).toContain("galerie PARTIELLE");
    expect(coverageNote(five)).toBe("Analyse réalisée sur les 5 premières photos de ta galerie, plus le titre et la description.");
    const thirty = buildUrlCoverage(30, [true, true, true, true, true]);
    expect(userText(req(thirty))).toContain("listent 30 photos, mais la galerie réelle peut en contenir davantage");
    expect(coverageNote(thirty)).toBe("Analyse réalisée sur les 5 premières photos de ta galerie (qui en compte au moins 30), plus le titre et la description.");
  });

  it("tells the model exactly what it sees", () => {
    const complete = userText(req(buildUrlCoverage(5, [true, true, true, true, true], true)));
    expect(complete).toContain("galerie COMPLÈTE");
    expect(complete).toContain("les 5 photos publiées");
    const partial = userText(req(buildUrlCoverage(30, [true, true, true, true, true], true)));
    expect(partial).toContain("galerie PARTIELLE");
    expect(partial).toContain("La galerie publie 30 photos au total");
    expect(partial).toContain("ne le présente jamais comme absent de l'annonce");
    expect(partial).not.toMatch(/capture\(s\) d'écran/);
  });

  it("deduplicates repeated or invalid photo entries without losing order", () => {
    const data = parseAirbnbHtml(airbnbPage(3, ["https://img.example/photo-1.jpg", "not-a-url"]))!;
    expect(data.galleryImageCount).toBe(3);
    expect(data.imageUrls).toHaveLength(3);
  });
});

describe("case 4: the bedroom only appears after photo 5", () => {
  const coverage = buildUrlCoverage(18, [true, true, true, true, true], true);
  const modelOutput: Partial<AnalysisResult> = {
    weaknesses: [
      { title: "Aucune photo de la chambre", severity: "high", explanation: "Ton annonce ne montre pas la chambre, je ne sais pas où je vais dormir.", recommendation: "Ajoute une photo de la chambre." },
      { title: "Titre trop générique", severity: "medium", explanation: "Le titre ne dit pas ce qui rend le logement unique.", recommendation: "Ajoute la vue." },
    ],
    top_priorities: [
      { rank: 1, title: "La chambre n'est pas montrée", current_issue: "On ne voit aucune photo de la chambre.", recommended_change: "Ajoute-la.", expected_benefit: "Le voyageur se projette." },
      { rank: 2, title: "Titre", current_issue: "Le titre est vague.", recommended_change: "Précise.", expected_benefit: "Plus clair." },
    ],
    action_plan: ["Ajouter une photo de la salle de bain.", "Réécrire le titre."],
  };

  it("never leaves it as a confirmed, high-severity, first-priority defect", () => {
    const { result, hedged } = hedgeUnverifiedAbsences(modelOutput, coverage);
    expect(hedged).toBe(3);
    // The real defect becomes the free point (most severe) and priority n°1.
    expect(result.weaknesses![0].title).toBe("Titre trop générique");
    const bedroom = result.weaknesses!.find((w) => w.title.includes("chambre"))!;
    expect(bedroom.severity).toBe("low");
    expect(bedroom.title).toBe("À vérifier : aucune photo de la chambre");
    expect(bedroom.explanation).toContain("les 5 premières photos de ta galerie (sur 18 publiées)");
    expect(result.top_priorities![0].title).toBe("Titre");
    expect(result.top_priorities![0].rank).toBe(1);
    expect(result.top_priorities![1].title).toMatch(/^À vérifier : /);
    expect(result.action_plan![0]).toContain("(à vérifier dans ta galerie complète)");
    expect(result.action_plan![1]).toBe("Réécrire le titre.");
  });

  it("keeps an absence statement when the whole gallery was seen", () => {
    const { result, hedged } = hedgeUnverifiedAbsences(modelOutput, buildUrlCoverage(5, [true, true, true, true, true], true));
    expect(hedged).toBe(0);
    expect(result).toBe(modelOutput);
  });

  it("leaves already-honest wording and unrelated critiques untouched", () => {
    expect(isUnverifiedAbsenceClaim("La chambre n'apparaît pas dans les 5 premières photos que j'ai reçues")).toBe(false);
    expect(isUnverifiedAbsenceClaim("La photo de couverture est trop sombre")).toBe(false);
    expect(isUnverifiedAbsenceClaim("Le titre ne dit pas si la piscine est privée")).toBe(false);
    expect(isUnverifiedAbsenceClaim("Aucune photo de la salle de bain")).toBe(true);
    expect(isUnverifiedAbsenceClaim("Rien ne montre l'extérieur ou le quartier")).toBe(true);
    expect(isUnverifiedAbsenceClaim("La cuisine est absente des photos")).toBe(true);
  });
});

describe("case 5: partial / interrupted extraction", () => {
  it("reports the exact positions that reached the model", () => {
    const c = buildUrlCoverage(12, [true, false, true, true, false], true);
    expect(c).toMatchObject({ sent: 3, galleryTotal: 12, complete: false });
    expect(c.positions).toEqual([1, 3, 4]);
    expect(describeSentPhotos(c)).toBe("3 photos de ta galerie (n°1, n°3, n°4) (sur 12 publiées)");
    expect(userText(req(c, 3))).toContain("n°1, n°3, n°4");
  });

  it("a gallery of 5 with one failed download is NOT complete", () => {
    expect(buildUrlCoverage(5, [true, true, false, true, true], true).complete).toBe(false);
  });

  it("Open Graph fallback (cover only): gallery size unknown, never complete", () => {
    const html = `<meta property="og:title" content="Studio · Lyon"><meta property="og:image" content="https://img.example/cover.jpg">`;
    const data = parseAirbnbHtml(html)!;
    expect(data.galleryImageCount).toBeNull();
    const c = buildUrlCoverage(data.galleryImageCount, [true]);
    expect(c.complete).toBe(false);
    expect(userText(req(c, 1))).toContain("Le nombre total de photos de la galerie est inconnu");
  });
});

describe("case 6: photos unavailable or invalid URLs", () => {
  it("no usable photo URL means no data (extraction fails before any AI call)", () => {
    const ld = { image: ["not-a-url", 42, null] };
    expect(parseAirbnbHtml(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`)).toBeNull();
    expect(parseAirbnbHtml("<html>soft 404</html>")).toBeNull();
  });

  it("zero downloaded photos gives an empty, incomplete coverage (the route stops there)", () => {
    expect(buildUrlCoverage(10, [false, false, false, false, false])).toMatchObject({ sent: 0, complete: false, positions: [] });
    expect(coverageNote(buildUrlCoverage(10, [false, false]))).toBeNull();
  });
});

describe("case 7: screenshot imports", () => {
  it("are never treated as a complete gallery, and the prompt says so", () => {
    const c = screenshotCoverage(3);
    expect(c).toMatchObject({ source: "screenshots", sent: 3, complete: false, galleryTotal: null });
    expect(userText(req(c, 3))).toContain("3 captures d'écran importées par le propriétaire");
    expect(hedgeUnverifiedAbsences({ weaknesses: [{ title: "Pas de photo de la cuisine", severity: "high", explanation: "x", recommendation: "y" }] }, c).hedged).toBe(1);
    expect(coverageNote(c)).toBe("Analyse réalisée sur les 3 captures que tu as importées.");
  });

  it("callers that pass no coverage (compare, benchmark) default to screenshots", () => {
    const r = req(null, 2);
    expect(userText(r)).toContain("COUVERTURE DES PHOTOS : 2 captures d'écran");
  });
});

describe("prompt rules", () => {
  it("forbid turning missing information into a confirmed defect, everywhere it matters", () => {
    const s = systemText(req(buildUrlCoverage(20, [true, true, true, true, true])));
    expect(s).toContain("Ne transforme JAMAIS une absence d'information en défaut confirmé");
    expect(s).toContain('jamais en "top_priorities[0]", jamais en sévérité "high"');
    expect(s).toContain("ne doit pas faire baisser les scores");
    expect(s).toContain("Seulement si la galerie est indiquée COMPLÈTE");
  });
});

describe("case 8: compatibility with existing reports", () => {
  it("older reports have no coverage: no note, nothing breaks", () => {
    expect(coverageNote(undefined)).toBeNull();
    expect(coverageNote(null)).toBeNull();
  });

  it("the guard tolerates malformed model output", () => {
    const weird = { weaknesses: [null, "x", { title: "Aucune photo de la chambre" }], top_priorities: "nope", action_plan: [42] } as unknown as Partial<AnalysisResult>;
    expect(() => hedgeUnverifiedAbsences(weird, screenshotCoverage(1))).not.toThrow();
  });

  it("the result page line reads naturally", () => {
    expect(coverageNote(buildUrlCoverage(28, [true, true, true, true, true], true))).toBe(
      "Analyse réalisée sur les 5 premières photos de ta galerie (sur 28 publiées), plus le titre et la description."
    );
    expect(coverageNote(buildUrlCoverage(4, [true, true, true, true], true))).toBe("Analyse réalisée sur les 4 photos de ta galerie, plus le titre et la description.");
  });
});

describe("guard: many ways of saying a room is absent (real-test follow-up)", () => {
  const SHOULD_FLAG = [
    "Ton annonce ne montre pas la chambre", "Tu ne montres pas ta chambre", "Aucune photo de la salle de bain", "On ne voit jamais la chambre",
    "La chambre n'est jamais montrée", "La chambre n'est pas montrée", "Il manque une photo de la chambre", "Pas une seule image de la cuisine",
    "La salle de bain est absente de la galerie", "Aucune chambre n'est visible", "La galerie ne contient aucune photo de chambre",
    "Impossible de voir la chambre dans l'annonce", "Le voyageur ne sait pas à quoi ressemble la chambre", "Zéro photo de l'extérieur",
    "Aucun visuel de la salle d'eau", "La chambre reste invisible", "Il n'y a aucune photo de la chambre", "La chambre n'apparaît sur aucune photo",
    "Rien ne montre l'extérieur ou le quartier", "La cuisine est absente des photos", "Pas de photo de chambre", "Les toilettes ne figurent nulle part",
  ];
  const SHOULD_NOT_FLAG = [
    "La chambre n'apparaît pas dans les 5 premières photos que j'ai reçues", "Dans les photos reçues, je ne vois pas la chambre : vérifie qu'elle est dans ta galerie",
    "La photo de la chambre est sombre", "Le titre ne précise pas le nombre de chambres", "La cuisine semble petite", "Mets la photo de la terrasse en première position",
    "La salle de bain est moderne mais mal cadrée", "Aucune photo n'est floue", "Ta chambre n'est pas assez lumineuse", "La salle de bain n'est pas mise en valeur",
    "Les photos reçues ne montrent pas la chambre", "Sans photo de la terrasse en couverture, l'atout passe inaperçu", "La terrasse n'est pas assez mise en avant",
    "Le salon n'est pas rangé", "La vue n'est pas exploitée en couverture",
  ];
  it.each(SHOULD_FLAG)("flags: %s", (t) => expect(isUnverifiedAbsenceClaim(t)).toBe(true));
  it.each(SHOULD_NOT_FLAG)("leaves alone: %s", (t) => expect(isUnverifiedAbsenceClaim(t)).toBe(false));
});

