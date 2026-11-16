import { describe, expect, it } from "vitest";
import { drawLoaderVariant, isLoaderVariant, resolveLoaderVariant } from "./loaderExperiment";

describe("loader experiment assignment", () => {
  it("recognises only the two variants", () => {
    expect(isLoaderVariant("control")).toBe(true);
    expect(isLoaderVariant("immersive")).toBe(true);
    expect(isLoaderVariant("v2")).toBe(false);
    expect(isLoaderVariant(undefined)).toBe(false);
  });

  it("draws immersive below the share and control above it", () => {
    expect(drawLoaderVariant(() => 0.1, 0.5)).toBe("immersive");
    expect(drawLoaderVariant(() => 0.9, 0.5)).toBe("control");
    expect(drawLoaderVariant(() => 0, 0)).toBe("control");
  });

  it("keeps a valid stored assignment while the experiment runs", () => {
    expect(resolveLoaderVariant("immersive", 0.5)).toBe("immersive");
    expect(resolveLoaderVariant("control", 0.5)).toBe("control");
  });

  it("falls back to control for unknown values", () => {
    expect(resolveLoaderVariant("garbage", 0.5)).toBe("control");
    expect(resolveLoaderVariant(null, 0.5)).toBe("control");
  });

  it("maps everyone back to control when switched off, whatever their cookie", () => {
    expect(resolveLoaderVariant("immersive", 0)).toBe("control");
  });
});
