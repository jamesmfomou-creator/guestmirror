import { describe, expect, it } from "vitest";
import { MAX_GALLERY_PHOTOS, firstCycle, loopCycle, nextPosition, phaseAt, phaseDurationMs } from "./immersiveSequence";

const full = { photoCount: 3, hasTitle: true, descriptionLineCount: 2 };

describe("immersive loader sequence", () => {
  it("shows each real photo, then the title, the description, then the AI view", () => {
    expect(firstCycle(full).map((p) => (p.kind === "photo" ? `photo${p.index}` : p.kind))).toEqual([
      "photo0",
      "photo1",
      "photo2",
      "title",
      "description",
      "ai",
    ]);
  });

  it("skips whatever is missing instead of inventing it", () => {
    expect(firstCycle({ photoCount: 0, hasTitle: false, descriptionLineCount: 0 })).toEqual([{ kind: "ai" }]);
    expect(firstCycle({ photoCount: 1, hasTitle: true, descriptionLineCount: 0 }).map((p) => p.kind)).toEqual([
      "photo",
      "title",
      "ai",
    ]);
  });

  it("caps the gallery so a listing with many photos does not stretch the first pass", () => {
    const phases = firstCycle({ photoCount: 20, hasTitle: false, descriptionLineCount: 0 });
    expect(phases.filter((p) => p.kind === "photo")).toHaveLength(MAX_GALLERY_PHOTOS);
  });

  it("moves to a quieter loop after the first pass, and keeps looping", () => {
    let pos = { cycle: 0, index: 0 };
    for (let i = 0; i < firstCycle(full).length; i++) pos = nextPosition(pos, full);
    expect(pos).toEqual({ cycle: 1, index: 0 });
    expect(phaseAt(pos, full)).toEqual({ kind: "overview" });
    pos = nextPosition(pos, full);
    expect(phaseAt(pos, full)).toEqual({ kind: "ai" });
    pos = nextPosition(pos, full);
    expect(pos).toEqual({ cycle: 2, index: 0 });
    expect(loopCycle({ photoCount: 0, hasTitle: true, descriptionLineCount: 1 })).toEqual([{ kind: "ai" }]);
  });

  it("gives the description time per line", () => {
    expect(phaseDurationMs({ kind: "description" }, { ...full, descriptionLineCount: 4 })).toBeGreaterThan(
      phaseDurationMs({ kind: "description" }, { ...full, descriptionLineCount: 1 })
    );
  });

  it("never points outside the current cycle", () => {
    expect(phaseAt({ cycle: 0, index: 99 }, full)).toEqual({ kind: "ai" });
  });
});
