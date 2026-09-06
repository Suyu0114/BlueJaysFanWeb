// Stable color per pitch family, drawn from the brand palette so every pitch
// chart (arsenal table, movement scatter) speaks the same language. Moved out
// of the former PitchDistribution.tsx in P10 so multiple components can share
// it. Pure module — safe to import from client components.

export const PITCH_COLOR: Record<string, string> = {
  FF: "var(--color-brick)", // four-seam fastball
  FT: "var(--color-brick)", // two-seam (legacy code) — same family
  SI: "var(--color-lava)", // sinker
  FC: "var(--color-lava)", // cutter
  SL: "var(--color-navy)", // slider
  ST: "var(--color-navy)", // sweeper
  CU: "var(--color-steel)", // curve
  KC: "var(--color-steel)", // knuckle-curve
  CH: "var(--color-grass)", // change-up
  FS: "var(--color-grass)", // splitter
  SC: "var(--color-grass)", // screwball
};

const FALLBACK_COLOR = "var(--color-navy)";

export function colorFor(pitchType: string): string {
  return PITCH_COLOR[pitchType] ?? FALLBACK_COLOR;
}
