// Order and pacing of the immersive analysis loader
// (components/analyze/AnalysisImmersive.tsx). Pure, so the sequencing rules
// are unit-tested.
//
// The durations below only pace what is SHOWN; they say nothing about the
// analysis itself, which runs as one request with no intermediate progress.
// The loader never waits for its sequence to end: whenever the analysis
// finishes, it leaves immediately (see AnalysisImmersive's success beat).
//
//  - First pass: each real photo, then the real title, then the real
//    description lines, then the "AI analysis" view.
//  - Long waits: a quieter loop (an overview of all photos, then the AI view)
//    instead of replaying the first pass, so a 90 s wait does not look like
//    the same 20 s on repeat.
// Anything that is not available (no photos, no title, no description) is
// skipped, never replaced by invented content.

export type ImmersivePhase =
  | { kind: "photo"; index: number }
  | { kind: "title" }
  | { kind: "description" }
  | { kind: "overview" }
  | { kind: "ai" };

export interface SequenceInput {
  photoCount: number;
  hasTitle: boolean;
  descriptionLineCount: number;
}

export interface SequencePosition {
  cycle: number;
  index: number;
}

export const PHOTO_MS = 2_800;
export const TITLE_MS = 5_000;
export const DESCRIPTION_LINE_MS = 1_800;
const DESCRIPTION_TAIL_MS = 1_400;
const AI_MS = 9_000;
const OVERVIEW_MS = 7_000;
// Enough to recognise one's listing; more photos would only lengthen the first pass.
export const MAX_GALLERY_PHOTOS = 6;

export function firstCycle(input: SequenceInput): ImmersivePhase[] {
  const phases: ImmersivePhase[] = [];
  for (let i = 0; i < Math.min(input.photoCount, MAX_GALLERY_PHOTOS); i++) phases.push({ kind: "photo", index: i });
  if (input.hasTitle) phases.push({ kind: "title" });
  if (input.descriptionLineCount > 0) phases.push({ kind: "description" });
  phases.push({ kind: "ai" });
  return phases;
}

export function loopCycle(input: SequenceInput): ImmersivePhase[] {
  return input.photoCount > 0 ? [{ kind: "overview" }, { kind: "ai" }] : [{ kind: "ai" }];
}

function cycleOf(position: SequencePosition, input: SequenceInput): ImmersivePhase[] {
  return position.cycle === 0 ? firstCycle(input) : loopCycle(input);
}

export function phaseAt(position: SequencePosition, input: SequenceInput): ImmersivePhase {
  const phases = cycleOf(position, input);
  return phases[Math.min(position.index, phases.length - 1)];
}

export function nextPosition(position: SequencePosition, input: SequenceInput): SequencePosition {
  const phases = cycleOf(position, input);
  return position.index + 1 < phases.length
    ? { cycle: position.cycle, index: position.index + 1 }
    : { cycle: position.cycle + 1, index: 0 };
}

export function phaseDurationMs(phase: ImmersivePhase, input: SequenceInput): number {
  switch (phase.kind) {
    case "photo":
      return PHOTO_MS;
    case "title":
      return TITLE_MS;
    case "description":
      return Math.max(1, input.descriptionLineCount) * DESCRIPTION_LINE_MS + DESCRIPTION_TAIL_MS;
    case "overview":
      return OVERVIEW_MS;
    case "ai":
      return AI_MS;
  }
}
