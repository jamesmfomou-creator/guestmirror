import { describe, expect, it } from "vitest";
import {
  buildListingPreview,
  descriptionExcerptLines,
  isAirbnbCdnImageUrl,
  loaderImageUrl,
  parseListingPreview,
} from "./listingPreview";

const CDN = "https://a0.muscache.com/im/pictures/abc.jpg";

describe("isAirbnbCdnImageUrl", () => {
  it("accepts https images on Airbnb's CDN only", () => {
    expect(isAirbnbCdnImageUrl(CDN)).toBe(true);
    expect(isAirbnbCdnImageUrl("http://a0.muscache.com/x.jpg")).toBe(false);
    expect(isAirbnbCdnImageUrl("https://evil.example/x.jpg")).toBe(false);
    expect(isAirbnbCdnImageUrl("https://muscache.com.evil.example/x.jpg")).toBe(false);
    expect(isAirbnbCdnImageUrl("not a url")).toBe(false);
  });
});

describe("loaderImageUrl", () => {
  it("asks the CDN for a lighter size, without overriding an explicit one", () => {
    expect(loaderImageUrl(CDN)).toBe(`${CDN}?im_w=720`);
    expect(loaderImageUrl(`${CDN}?im_w=1200`)).toBe(`${CDN}?im_w=1200`);
  });
});

describe("descriptionExcerptLines", () => {
  it("returns nothing for a missing or blank description", () => {
    expect(descriptionExcerptLines(null)).toEqual([]);
    expect(descriptionExcerptLines("   ")).toEqual([]);
  });

  it("splits the opening into sentences, at most 4 lines", () => {
    const lines = descriptionExcerptLines("Un. Deux ! Trois ? Quatre. Cinq.");
    expect(lines).toEqual(["Un.", "Deux !", "Trois ?", "Quatre."]);
  });

  it("strips markup and collapses whitespace", () => {
    expect(descriptionExcerptLines("Bel<br />appart\n\n  lumineux.")).toEqual(["Bel appart lumineux."]);
  });

  it("cuts a long sentence at a word boundary and marks the cut", () => {
    const long = `${"mot ".repeat(60)}fin.`;
    const [line] = descriptionExcerptLines(long);
    expect(line.length).toBeLessThanOrEqual(141);
    expect(line.endsWith("…")).toBe(true);
    expect(line).not.toMatch(/\smo…$/);
  });
});

describe("buildListingPreview", () => {
  it("keeps only CDN photos, cleans the title, and caps the photo count", () => {
    const preview = buildListingPreview({
      title: "  Studio   Arcadia  ",
      description: "Lumineux. Calme.",
      imageUrls: [CDN, "https://evil.example/x.jpg", ...Array.from({ length: 8 }, (_, i) => `${CDN}?n=${i}`)],
      city: "Lyon",
    });
    expect(preview.title).toBe("Studio Arcadia");
    expect(preview.descriptionLines).toEqual(["Lumineux.", "Calme."]);
    expect(preview.imageUrls).toHaveLength(6);
    expect(preview.imageUrls.every(isAirbnbCdnImageUrl)).toBe(true);
    expect(preview.city).toBe("Lyon");
  });

  it("represents missing fields as null / empty, never invented", () => {
    expect(buildListingPreview({ title: null, description: null, imageUrls: [], city: null })).toEqual({
      title: null,
      descriptionLines: [],
      imageUrls: [],
      city: null,
    });
  });

  it("caps a very long title", () => {
    const preview = buildListingPreview({ title: "x ".repeat(300), description: null, imageUrls: [], city: null });
    expect(preview.title!.length).toBeLessThanOrEqual(201);
  });
});

describe("parseListingPreview", () => {
  it("drops anything that is not the expected shape, including non-CDN photos", () => {
    expect(parseListingPreview(null)).toBeNull();
    expect(
      parseListingPreview({ title: 3, descriptionLines: ["a", 2], imageUrls: [CDN, "https://evil.example/x.jpg"], city: "" })
    ).toEqual({ title: null, descriptionLines: ["a"], imageUrls: [CDN], city: null });
  });
});
