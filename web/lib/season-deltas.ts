// P12: pure helpers for season-vs-season deltas (no DB, no React). Used by the
// M2 discipline cards and extended by the M3 Compare tab.

// Which way is "better" for a metric. `neutral` = a style choice (Pull%, Zone%,
// GB%…), never coloured as good or bad.
export type Direction = "higher" | "lower" | "neutral";
export type Tone = "better" | "worse" | "flat";

export function delta(a: number | null | undefined, b: number | null | undefined): number | null {
  return a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) ? null : a - b;
}

export function deltaTone(d: number | null, direction: Direction, epsilon = 1e-9): Tone {
  if (d == null || direction === "neutral" || Math.abs(d) <= epsilon) return "flat";
  return (d > 0) === (direction === "higher") ? "better" : "worse";
}

// Savant assigns `zone` differently from 2026 (DATA_MODEL Known gaps #8): across
// every pitch on file Chase% rose ~2.8 pts and Zone% fell ~3.4 while Whiff% held.
// Any Chase% / Z-Swing% / Zone% comparison that straddles this season is shown
// net of that population-wide shift.
export const ZONE_CHANGE_SEASON = 2026;

export function crossesZoneChange(a: number, b: number): boolean {
  return (a >= ZONE_CHANGE_SEASON) !== (b >= ZONE_CHANGE_SEASON);
}

// Population-wide change of a zone-based rate between two seasons (a − b), from
// per-season reference rates; null when either season is missing.
export function referenceShift<K extends string>(
  ref: ReadonlyArray<{ season: number } & Partial<Record<K, number | null>>>,
  key: K,
  a: number,
  b: number,
): number | null {
  const ra = ref.find((r) => r.season === a)?.[key];
  const rb = ref.find((r) => r.season === b)?.[key];
  return delta(ra ?? null, rb ?? null);
}
