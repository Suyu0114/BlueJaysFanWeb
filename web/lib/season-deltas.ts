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

// ---------------------------------------------------------------------------
// M3 "What changed": the few biggest meaningful moves between two seasons.
// ---------------------------------------------------------------------------

export type ChangeFormat = "pct" | "rate3" | "dec1" | "dec2" | "mph" | "int";

export type ChangeCandidate = {
  key: string; // i18n key for the plain-language meaning
  label: string; // stat name, English in every locale
  a: number | null | undefined;
  b: number | null | undefined;
  format: ChangeFormat;
  direction: Exclude<Direction, "neutral">;
  // What counts as a notable change for this stat (a 1.0 score). Rough
  // season-to-season noise levels: .040 OPS, 12 wRC+, 3 pts K%, 0.6 ERA, 1 mph…
  scale: number;
  shift?: number | null; // zone-based: population-wide change to net out
};

export type Change = ChangeCandidate & { delta: number; score: number; tone: Tone };

export function biggestChanges(
  candidates: ChangeCandidate[],
  max = 5,
  minScore = 1,
): Change[] {
  const out: Change[] = [];
  for (const c of candidates) {
    const raw = delta(c.a, c.b);
    if (raw == null) continue;
    const d = c.shift != null ? raw - c.shift : raw;
    const score = Math.abs(d) / c.scale;
    if (score < minScore) continue;
    out.push({ ...c, delta: d, score, tone: deltaTone(d, c.direction) });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, max);
}

// "4.1 pts", ".045", "1.2", "0.62", "1.1 mph", "12" — unsigned; the sentence
// carries the direction.
export function formatChange(d: number, format: ChangeFormat, pts: string): string {
  const x = Math.abs(d);
  switch (format) {
    case "pct": return `${(x * 100).toFixed(1)} ${pts}`;
    case "rate3": { const s = x.toFixed(3); return s.startsWith("0.") ? s.slice(1) : s; }
    case "dec1": return x.toFixed(1);
    case "dec2": return x.toFixed(2);
    case "mph": return `${x.toFixed(1)} mph`;
    default: return x.toFixed(0);
  }
}
