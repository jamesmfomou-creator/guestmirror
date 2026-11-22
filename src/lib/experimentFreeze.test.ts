import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { EXPERIMENT_FREEZE } from "./experimentFreeze";
import { proxy } from "@/proxy";
import { getAbVariant } from "./ab";
import { getPaywallVariant } from "./paywallExperiment";
import { getLoaderVariant } from "./loaderExperiment";
import { getOnboardingVariant, ONBOARDING_FORCED_VALUE } from "./onboardingExperiment";
import { computeWindow, comparisonWindows, type CmpEvent } from "./admin/configComparison";

function withCookies(cookie: string) {
  (globalThis as unknown as { document: { cookie: string } }).document = { cookie };
}

describe("fixed experiment configuration (week of 23 Nov 2026)", () => {
  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("is active with the owner's combination", () => {
    expect(EXPERIMENT_FREEZE).toMatchObject({ active: true, ab: "B", paywall: "control", loader: "immersive", onboarding: "control" });
  });

  it("every reader returns the fixed variant, whatever an old cookie says", () => {
    withCookies("gm_ab=A; gm_pw=v2; gm_ld=control; gm_ob=background");
    expect(getAbVariant()).toBe("B");
    expect(getPaywallVariant()).toBe("control");
    expect(getLoaderVariant()).toBe("immersive");
    expect(getOnboardingVariant()).toBe("control");
  });

  it("server render (no document) gives the same answers: no hydration flip", () => {
    expect(getAbVariant()).toBe("B");
    expect(getPaywallVariant()).toBe("control");
    expect(getLoaderVariant()).toBe("immersive");
    expect(getOnboardingVariant()).toBe("control");
  });

  it("the ?ob= QA override still works", () => {
    withCookies(`gm_ob=${ONBOARDING_FORCED_VALUE}`);
    expect(getOnboardingVariant()).toBe("background");
  });
});

describe("proxy writes the fixed combination", () => {
  const req = (cookies: Record<string, string>, path = "/") => {
    const r = new NextRequest(new URL(`http://localhost:3000${path}`));
    for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
    return r;
  };
  const cookieMap = (res: Response) =>
    Object.fromEntries((res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0].split("=")) as [string, string][]);

  it("new visitor: the four cookies are the fixed combination, never a draw", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // a draw would pick B / v2 / immersive / background
    for (let i = 0; i < 3; i++) {
      expect(cookieMap(proxy(req({})))).toEqual({ gm_ab: "B", gm_pw: "control", gm_ld: "immersive", gm_ob: "control" });
    }
    vi.restoreAllMocks();
  });

  it("returning visitor with other variants is switched to the fixed combination", () => {
    expect(cookieMap(proxy(req({ gm_ab: "A", gm_pw: "v2", gm_ld: "control", gm_ob: "background" })))).toEqual({
      gm_ab: "B",
      gm_pw: "control",
      gm_ld: "immersive",
      gm_ob: "control",
    });
  });

  it("visitor already on the fixed combination: nothing rewritten", () => {
    expect(cookieMap(proxy(req({ gm_ab: "B", gm_pw: "control", gm_ld: "immersive", gm_ob: "control" })))).toEqual({});
  });

  it("QA override ?ob=background is kept", () => {
    expect(cookieMap(proxy(req({}, "/analyze?ob=background"))).gm_ob).toBe(ONBOARDING_FORCED_VALUE);
  });
});

describe("dashboard comparison", () => {
  let n = 0;
  const ev = (event_name: string, v: string | null, extra: Partial<CmpEvent> & { meta?: Record<string, unknown> } = {}): CmpEvent => ({
    id: `e${n++}`,
    event_name,
    anonymous_id: v,
    analysis_id: extra.analysis_id ?? null,
    created_at: "2026-11-24T10:00:00Z",
    metadata: { experiment_config: "fixed_2026_11_23", ...(extra.meta ?? {}) },
  });

  it("computes the 12 indicators with explicit denominators, sales counted once", () => {
    const events = [
      ev("landing_view", "v1"), ev("landing_view", "v1"), ev("landing_view", "v2"), ev("landing_view", "v3"), ev("landing_view", "v4"),
      ev("cta_test_clicked", "v1", { meta: { cta_location: "hero" } }),
      ev("cta_test_clicked", "v2", { meta: { cta_location: "hero" } }),
      ev("cta_test_clicked", "v3", { meta: { cta_location: "navbar" } }), // not the hero CTA
      ev("airbnb_url_started", "v1"), ev("airbnb_url_started", "v2"),
      ev("analysis_started", "v1", { meta: { attemptId: "a1" } }),
      ev("analysis_started", "v1", { meta: { attemptId: "a1" } }), // retry of the same attempt
      ev("analysis_started", "v3", { meta: { attemptId: "a3" } }), // came from the navbar
      ev("analysis_completed", "v1", { analysis_id: "A1" }), ev("analysis_completed", "v3", { analysis_id: "A3" }),
      ev("paywall_viewed", "v1"), ev("paywall_viewed", "v3"),
      ev("paywall_cta_clicked", "v1"),
      { ...ev("payment_completed", "v1", { meta: { stripe_session_id: "cs_1", amount: 790 } }) },
      { ...ev("payment_completed", "v1", { meta: { stripe_session_id: "cs_1", amount: 790 } }) }, // duplicated webhook row
    ];
    const w = computeWindow(events, "2026-11-23", "2026-11-30");
    expect(w.eligible).toBe(4);
    expect(w.heroClicks).toBe(2);
    expect(w.heroCtr).toEqual({ num: 2, den: 4, rate: 0.5 });
    expect(w.urlStarted).toBe(2);
    expect(w.analysesStarted).toBe(2);
    expect(w.heroToAnalysis).toEqual({ num: 1, den: 2, rate: 0.5 });
    expect(w.analysesCompleted).toBe(2);
    expect(w.paywallViewers).toBe(2);
    expect(w.paywallRate.rate).toBe(1);
    expect(w.paymentClicks).toBe(1);
    expect(w.sales).toBe(1);
    expect(w.paywallToSale).toEqual({ num: 1, den: 2, rate: 0.5 });
    expect(w.revenue).toBe(7.9);
    expect(w.taggedShare.rate).toBe(1);
  });

  it("windows: the fixed week vs the 7 days before; empty before the start", () => {
    const before = comparisonWindows(Date.parse("2026-11-22T12:00:00Z"));
    expect(before.started).toBe(false);
    expect(before.previous.from).toBe("2026-11-15T23:00:00.000Z");
    expect(before.previous.to).toBe("2026-11-22T23:00:00.000Z");
    const during = comparisonWindows(Date.parse("2026-11-25T12:00:00Z"));
    expect(during.started).toBe(true);
    expect(during.current).toEqual({ from: "2026-11-22T23:00:00.000Z", to: "2026-11-25T12:00:00.000Z" });
    expect(comparisonWindows(Date.parse("2026-12-15T00:00:00Z")).current.to).toBe("2026-11-29T23:00:00.000Z");
  });
});
