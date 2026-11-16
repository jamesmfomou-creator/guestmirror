import { describe, expect, it } from "vitest";
import {
  PAYWALL_V2_SHARE,
  drawPaywallVariant,
  isPaywallVariant,
  resolvePaywallVariant,
} from "@/lib/paywallExperiment";

describe("paywall experiment", () => {
  it("recognizes only its two variants", () => {
    expect(isPaywallVariant("control")).toBe(true);
    expect(isPaywallVariant("v2")).toBe(true);
    expect(isPaywallVariant("A")).toBe(false);
    expect(isPaywallVariant(undefined)).toBe(false);
  });

  it("draws v2 below the share and control at or above it", () => {
    expect(drawPaywallVariant(() => 0)).toBe(PAYWALL_V2_SHARE > 0 ? "v2" : "control");
    expect(drawPaywallVariant(() => 0.999)).toBe("control");
    expect(drawPaywallVariant(() => PAYWALL_V2_SHARE)).toBe("control");
  });

  it("treats a missing or unknown cookie as control, so nobody sees v2 unassigned", () => {
    expect(resolvePaywallVariant(undefined)).toBe("control");
    expect(resolvePaywallVariant(null)).toBe("control");
    expect(resolvePaywallVariant("")).toBe("control");
    expect(resolvePaywallVariant("B")).toBe("control");
    expect(resolvePaywallVariant("control")).toBe("control");
  });
});
