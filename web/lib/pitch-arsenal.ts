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
  // P12 (optional so fixtures stay valid; getPitches always sets them):
  zone?: number | null; // Savant zone cell: 1-9 in the zone, 11-14 outside
  as_jay?: boolean; // in that game's Blue Jays box score
};

// Savant swing/whiff convention: foul tips count as whiffs, regular fouls as
// contact. Bunt attempts are swings. (Verify against a Savant player page —
// values should land within ~1%.) MIRRORED in db/migrations/015_metric_views.sql
// (web_v_pitch_scoped.is_whiff / is_swing) — change both together.
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

// ---------------------------------------------------------------------------
// P12 M3: season-vs-season helpers (Compare tab)
// ---------------------------------------------------------------------------

export type MovementMean = {
  pitchType: string;
  hIn: number; // horizontal break, inches, PITCHER'S view (pfx_x sign-flipped)
  vIn: number; // vertical break, inches
  n: number;
  avgVelo: number | null;
};

// Per-pitch-type average movement. The single place pfx (feet, catcher's view)
// becomes chart inches (pitcher's view) — PitchMovementChart uses it too.
export function toMovementInches(p: PitchEvent): [number, number] {
  return [-(p.pfx_x as number) * 12, (p.pfx_z as number) * 12];
}

export function movementMeans(pitches: PitchEvent[]): MovementMean[] {
  const byType = new Map<
    string,
    { hSum: number; vSum: number; n: number; veloSum: number; veloN: number }
  >();
  for (const p of pitches) {
    if (p.pfx_x == null || p.pfx_z == null || p.pitch_type == null) continue;
    const [hx, vy] = toMovementInches(p);
    const g =
      byType.get(p.pitch_type) ?? { hSum: 0, vSum: 0, n: 0, veloSum: 0, veloN: 0 };
    g.hSum += hx;
    g.vSum += vy;
    g.n += 1;
    if (p.release_speed != null) {
      g.veloSum += p.release_speed;
      g.veloN += 1;
    }
    byType.set(p.pitch_type, g);
  }
  return [...byType.entries()]
    .map(([pitchType, g]) => ({
      pitchType,
      hIn: g.hSum / g.n,
      vIn: g.vSum / g.n,
      n: g.n,
      avgVelo: g.veloN === 0 ? null : g.veloSum / g.veloN,
    }))
    .sort((a, b) => b.n - a.n);
}

// NEW / DROPPED = thrown 0 times in one season, >= 5% usage in the other
// (same rule as etl/season_report.py). Savant sometimes renames a pitch (a NEW
// sweeper beside a DROPPED slider), so the UI should say "check velo / spin".
export const NEW_PITCH_USAGE = 0.05;

export type ArsenalCompareRow = {
  pitchType: string;
  a: ArsenalRow | null; // focus season
  b: ArsenalRow | null; // comparison season
  flag: "new" | "dropped" | null;
};

export function compareArsenals(a: ArsenalRow[], b: ArsenalRow[]): ArsenalCompareRow[] {
  const types = new Set([...a.map((r) => r.pitchType), ...b.map((r) => r.pitchType)]);
  return [...types]
    .map((pitchType) => {
      const ra = a.find((r) => r.pitchType === pitchType) ?? null;
      const rb = b.find((r) => r.pitchType === pitchType) ?? null;
      const flag: ArsenalCompareRow["flag"] =
        ra && !rb && ra.usage >= NEW_PITCH_USAGE
          ? "new"
          : rb && !ra && rb.usage >= NEW_PITCH_USAGE
            ? "dropped"
            : null;
      return { pitchType, a: ra, b: rb, flag };
    })
    .sort((x, y) => (y.a?.count ?? 0) - (x.a?.count ?? 0) || (y.b?.count ?? 0) - (x.b?.count ?? 0));
}

// Share of pitches per Savant zone cell (1-9 in the zone, 11-14 the four outside
// quadrants), over pitches that have a zone. Semantic cells, not plate_x/plate_z,
// so two seasons can sit side by side despite the 2026 coordinate change (P12
// D3) -- but Savant's 2026 cell boundaries differ, see DATA_MODEL Known gaps #8.
export type ZoneDistribution = { share: Record<number, number>; total: number };

export function zoneDistribution(pitches: PitchEvent[]): ZoneDistribution {
  const counts: Record<number, number> = {};
  let total = 0;
  for (const p of pitches) {
    if (p.zone == null) continue;
    counts[p.zone] = (counts[p.zone] ?? 0) + 1;
    total += 1;
  }
  const share: Record<number, number> = {};
  for (const [z, n] of Object.entries(counts)) share[Number(z)] = n / total;
  return { share, total };
}

// Per-appearance average velo of one pitch type, indexed by appearance number
// (1, 2, 3, …) so two seasons share an x-axis — dates don't line up across years.
export function veloByAppearance(pitches: PitchEvent[], pitchType: string): number[] {
  return veloTrend(pitches, pitchType).map((p) => p.avgVelo);
}
