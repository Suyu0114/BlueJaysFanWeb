// P10: pure per-pitch-type aggregation for the pitching page (no DB, no React —
// unit-testable). Consumes the PitchEvent rows fetched by lib/pitching.ts and
// filtered client-side in PitchingExplorer.
//
// Alignment note (db/migrations/004): everything here reads release-frame /
// outcome fields (pitch_type, release_speed, spin_rate, description, pfx_*,
// estimated_woba) — none of it touches plate_x/plate_z, so it is
// plate_alignment-agnostic and safe across 2025/2026 seasons. Only the sibling
// PitchZoneHeatmap consumes plate coordinates.

// Canonical pitch-event row shape (fetched by lib/pitching.ts::getPitches).
// Lives here — a pure module — so client chart components can import the type
// without pulling in the server-only postgres client.
export type PitchEvent = {
  id: string;
  pitch_type: string | null;
  release_speed: number | null;
  spin_rate: number | null;
  plate_x: number | null;
  plate_z: number | null;
  stand: string | null; // batter handedness: "L" | "R"
  plate_alignment: string | null; // 'front' (<=2025) | 'middle' (>=2026)
  game_date: string; // YYYY-MM-DD
  description: string | null; // Savant pitch outcome (swinging_strike, foul, ...)
  // P10 (migration 011): null on rows not yet re-backfilled.
  pfx_x: number | null; // horizontal movement, feet, catcher's perspective
  pfx_z: number | null; // vertical movement vs spinless pitch, feet
  estimated_woba: number | null; // xwOBA; batted balls only, null otherwise
};

// Savant swing/whiff convention: foul tips count as whiffs, regular fouls as
// contact. Bunt attempts are swings. (Verify against a Savant player page —
// values should land within ~1%.)
const WHIFFS = new Set([
  "swinging_strike",
  "swinging_strike_blocked",
  "foul_tip",
  "missed_bunt",
]);
const SWINGS = new Set([
  ...WHIFFS,
  "foul",
  "hit_into_play",
  "foul_bunt",
  "bunt_foul_tip",
]);

export type ArsenalRow = {
  pitchType: string;
  count: number;
  usage: number; // 0..1 share of all (filtered) pitches
  avgVelo: number | null; // mph
  avgSpin: number | null; // rpm
  whiffPct: number | null; // 0..1 whiffs/swings; null when no swings
  xwobaCon: number | null; // mean xwOBA on contact (hit_into_play only); null when no data
};

export function buildArsenal(pitches: PitchEvent[]): ArsenalRow[] {
  const groups = new Map<
    string,
    {
      count: number;
      veloSum: number; veloN: number;
      spinSum: number; spinN: number;
      swings: number; whiffs: number;
      xwobaSum: number; xwobaN: number;
    }
  >();

  for (const p of pitches) {
    const pt = p.pitch_type;
    if (!pt) continue;
    let g = groups.get(pt);
    if (!g) {
      g = {
        count: 0, veloSum: 0, veloN: 0, spinSum: 0, spinN: 0,
        swings: 0, whiffs: 0, xwobaSum: 0, xwobaN: 0,
      };
      groups.set(pt, g);
    }
    g.count += 1;
    if (p.release_speed != null) { g.veloSum += p.release_speed; g.veloN += 1; }
    if (p.spin_rate != null) { g.spinSum += p.spin_rate; g.spinN += 1; }
    if (p.description != null && SWINGS.has(p.description)) {
      g.swings += 1;
      if (WHIFFS.has(p.description)) g.whiffs += 1;
    }
    if (p.description === "hit_into_play" && p.estimated_woba != null) {
      g.xwobaSum += p.estimated_woba;
      g.xwobaN += 1;
    }
  }

  const total = [...groups.values()].reduce((a, g) => a + g.count, 0);
  return [...groups.entries()]
    .map(([pitchType, g]) => ({
      pitchType,
      count: g.count,
      usage: total === 0 ? 0 : g.count / total,
      avgVelo: g.veloN === 0 ? null : g.veloSum / g.veloN,
      avgSpin: g.spinN === 0 ? null : g.spinSum / g.spinN,
      whiffPct: g.swings === 0 ? null : g.whiffs / g.swings,
      xwobaCon: g.xwobaN === 0 ? null : g.xwobaSum / g.xwobaN,
    }))
    .sort((a, b) => b.count - a.count);
}

// The pitch the fan thinks of as "his fastball": highest-usage pitch within
// the fastball family, falling back to the highest-usage pitch overall (e.g.
// knuckleballers).
const FASTBALL_FAMILY = new Set(["FF", "FT", "SI", "FC"]);

export function primaryFastball(pitches: PitchEvent[]): string | null {
  const rows = buildArsenal(pitches);
  if (rows.length === 0) return null;
  const fb = rows.find((r) => FASTBALL_FAMILY.has(r.pitchType));
  return (fb ?? rows[0]).pitchType;
}

export type VeloTrendPoint = { date: string; avgVelo: number; n: number };

// Per-game average velo of one pitch type (the health/fatigue story). Scope to
// the latest season present in `pitches` so a 3-season fetch doesn't squash the
// x-axis; PitchingExplorer passes unfiltered-by-month rows for a stable line.
export function veloTrend(
  pitches: PitchEvent[],
  pitchType: string,
): VeloTrendPoint[] {
  const latestSeason = pitches.reduce(
    (max, p) => (p.game_date.slice(0, 4) > max ? p.game_date.slice(0, 4) : max),
    "",
  );
  if (!latestSeason) return [];

  const byGame = new Map<string, { sum: number; n: number }>();
  for (const p of pitches) {
    if (p.pitch_type !== pitchType) continue;
    if (p.release_speed == null) continue;
    if (p.game_date.slice(0, 4) !== latestSeason) continue;
    const g = byGame.get(p.game_date) ?? { sum: 0, n: 0 };
    g.sum += p.release_speed;
    g.n += 1;
    byGame.set(p.game_date, g);
  }
  return [...byGame.entries()]
    .map(([date, g]) => ({ date, avgVelo: g.sum / g.n, n: g.n }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
