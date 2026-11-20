import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { isLandingPath } from "./landingPath";

describe("isLandingPath", () => {
  it("treats the browser path and the ISR regeneration path as the landing", () => {
    expect(isLandingPath("/")).toBe(true);
    // What a Vercel background revalidation renders the home page under.
    expect(isLandingPath("/index")).toBe(true);
  });

  it("keeps every other page off the landing navigation", () => {
    for (const p of ["/analyze", "/pricing", "/compare", "/espace", "/result/abc", "/index/x", "/indexes", "", null, undefined]) {
      expect(isLandingPath(p)).toBe(false);
    }
  });
});

// The header is the only usePathname() reader: rendered for "/index" (server,
// ISR regeneration) and "/" (browser), its markup must be identical, or React
// reports hydration error #418 on the home page.
describe("Header markup on the landing", () => {
  it("is the same for '/' and '/index'", async () => {
    const { vi } = await import("vitest");
    let current = "/";
    vi.doMock("next/navigation", () => ({ usePathname: () => current }));
    const { Header } = await import("@/components/layout/Header");
    const render = (p: string) => {
      current = p;
      return renderToStaticMarkup(createElement(Header));
    };
    const browser = render("/");
    const regenerated = render("/index");
    expect(regenerated).toBe(browser);
    expect(browser).toContain("#exemple");
    expect(render("/pricing")).not.toContain("#exemple");
    vi.doUnmock("next/navigation");
  });
});
