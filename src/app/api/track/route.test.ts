import { describe, expect, it } from "vitest";
import { inferSourceFromReferrer } from "./route";

describe("inferSourceFromReferrer", () => {
  // Regression test for a confirmed real-world gap (2026-11-12): a visit
  // from Instagram's "link in bio" with no UTM tag had
  // referrer=https://l.instagram.com/ and was bucketed as "direct" before
  // this fallback existed.
  it("recognizes Instagram's link-in-bio redirect domain", () => {
    expect(inferSourceFromReferrer("https://l.instagram.com/")).toBe("ig");
  });

  it("recognizes the main instagram.com domain", () => {
    expect(inferSourceFromReferrer("https://www.instagram.com/")).toBe("ig");
  });

  it("recognizes other common platforms", () => {
    expect(inferSourceFromReferrer("https://www.google.com/search?q=guestmirror")).toBe("google");
    expect(inferSourceFromReferrer("https://www.tiktok.com/@someone")).toBe("tiktok");
    expect(inferSourceFromReferrer("https://www.bing.com/")).toBe("bing");
  });

  it("falls back to the bare domain for an unmapped referrer", () => {
    expect(inferSourceFromReferrer("https://www.some-blog-example.test/post")).toBe("some-blog-example.test");
  });

  it("returns null for no referrer or a malformed one", () => {
    expect(inferSourceFromReferrer(null)).toBeNull();
    expect(inferSourceFromReferrer(undefined)).toBeNull();
    expect(inferSourceFromReferrer("not a url")).toBeNull();
  });

  it("does not mistake an unrelated domain containing 'instagram' as a substring for a match", () => {
    // e.g. a hypothetical "notinstagram.com" must not match the
    // instagram.com suffix rule.
    expect(inferSourceFromReferrer("https://notinstagram.com/")).toBe("notinstagram.com");
  });
});
