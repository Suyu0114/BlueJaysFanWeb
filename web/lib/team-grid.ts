import { TORONTO_TEAM_ID } from "./team-ids";
import { rankKey, tiedRank, type MetricDef, type MetricKey } from "./team-metrics";
import type { MlbSeasonRow, TeamSeasonRow } from "./team-trends";

// P13: PURE — turns the 022 view rows into the "metric × season" grid the rank
// grids (offense ②, run prevention ③) and the trend charts draw. No DB, no
// React, no formatting: plain JSON that a client component can take as props.

export type GridLeader = { teamId: number; teamName: string; abbrev: string; value: number | null };

export type GridCell = {
  season: number;
  value: number | null;
  rank: number | null;
  tied: boolean;
  mlb: number | null;
  leader: GridLeader | null; // the club ranked 1st that season (null for neutral metrics)
  raw: { n: number; unit: "hr" | "sb" | "runs" } | null; // a count that helps read the rate
};

export type GridRow = {
  key: MetricKey;
  section: string; // the registry group — the component labels it
  cells: GridCell[]; // one per season, oldest -> newest
};

const RAW: Partial<Record<MetricKey, { col: keyof TeamSeasonRow; unit: "hr" | "sb" | "runs" }>> = {
  hr_pct: { col: "hr", unit: "hr" },
  sb_per_g: { col: "sb", unit: "sb" },
  r_per_g: { col: "rs", unit: "runs" },
  ra_per_g: { col: "ra", unit: "runs" },
};

export function buildGrid(
  defs: MetricDef[],
  clubs: TeamSeasonRow[],
  mlb: MlbSeasonRow[],
  seasons: number[],
  teamId = TORONTO_TEAM_ID,
): GridRow[] {
  const bySeason = new Map<number, TeamSeasonRow[]>();
  for (const r of clubs) bySeason.set(r.season, [...(bySeason.get(r.season) ?? []), r]);
  const mlbBySeason = new Map(mlb.map((r) => [r.season, r]));

  return defs.map((def) => ({
    key: def.key,
    section: def.group,
    cells: seasons.map((season) => {
      const rows = bySeason.get(season) ?? [];
      const me = rows.find((r) => r.team_id === teamId);
      const rk = rankKey(def.key);
      const rank = (me?.[rk] as number | null | undefined) ?? null;
      const top = def.direction === "neutral" ? undefined : rows.find((r) => r[rk] === 1);
      const raw = RAW[def.key];
      const rawN = raw && me ? (me[raw.col] as number | null) : null;
      return {
        season,
        value: me?.[def.key] ?? null,
        rank: def.direction === "neutral" ? null : rank,
        tied: def.direction === "neutral" ? false : tiedRank(rows, season, def.key, rank),
        mlb: mlbBySeason.get(season)?.[def.key] ?? null,
        leader: top
          ? { teamId: top.team_id, teamName: top.team_name ?? "", abbrev: top.team_abbrev ?? "", value: top[def.key] }
          : null,
        raw: raw && rawN != null ? { n: rawN, unit: raw.unit } : null,
      };
    }),
  }));
}

/** One small-multiple series: the Jays vs the MLB average across the seasons. */
export type TrendPoint = { season: number; jays: number | null; mlb: number | null; rank: number | null; tied: boolean };
export type TrendItem = { key: MetricKey; points: TrendPoint[] };

export function toTrends(grid: GridRow[], keys: MetricKey[]): TrendItem[] {
  return keys.flatMap((key) => {
    const row = grid.find((r) => r.key === key);
    if (!row) return [];
    return [{ key, points: row.cells.map((c) => ({ season: c.season, jays: c.value, mlb: c.mlb, rank: c.rank, tied: c.tied })) }];
  });
}
