import { sql } from "./db";

// P12 M6: league context. Savant values are stored exactly as Savant publishes
// them (migrations 016-018; P12 D6) — MLB-wide season numbers across every club,
// NOT Jays-only, so label them that way next to Jays-scoped modules. An absent
// percentile row means "not qualified", never 0. League averages (019) are built
// from summed team counting stats.

export type PercentileRow = {
  season: number;
  role: "batter" | "pitcher";
  xwoba: number | null;
  xba: number | null;
  xslg: number | null;
  brl_percent: number | null;
  exit_velocity: number | null;
  hard_hit_percent: number | null;
  k_percent: number | null;
  bb_percent: number | null;
  whiff_percent: number | null;
  chase_percent: number | null;
  sprint_speed: number | null;
  oaa: number | null;
  arm_strength: number | null;
  bat_speed: number | null;
  squared_up_rate: number | null;
  xera: number | null;
  fb_velocity: number | null;
  fb_spin: number | null;
  curve_spin: number | null;
};

export async function getPercentiles(mlbamId: number): Promise<PercentileRow[]> {
  return sql<PercentileRow[]>`
    select season, role, xwoba, xba, xslg, brl_percent, exit_velocity, hard_hit_percent,
      k_percent, bb_percent, whiff_percent, chase_percent, sprint_speed, oaa,
      arm_strength, bat_speed, squared_up_rate, xera, fb_velocity, fb_spin, curve_spin
    from web_savant_percentiles
    where mlbam_id = ${mlbamId}
    order by season desc
  `;
}

// Batter expected stats + barrels. brl_percent / sweet_spot_pct / ev95_pct are in
// PERCENT units (6.9 = 6.9%) as Savant sends them.
export type SavantSeason = {
  season: number;
  pa: number | null;
  woba: number | null;
  xwoba: number | null;
  ba: number | null;
  xba: number | null;
  slg: number | null;
  xslg: number | null;
  barrels: number | null;
  brl_percent: number | null;
};

export async function getSavantSeasons(mlbamId: number): Promise<SavantSeason[]> {
  return sql<SavantSeason[]>`
    select season, pa, woba::float8 as woba, xwoba::float8 as xwoba, ba::float8 as ba,
      xba::float8 as xba, slg::float8 as slg, xslg::float8 as xslg, barrels,
      brl_percent::float8 as brl_percent
    from web_savant_season
    where mlbam_id = ${mlbamId}
    order by season desc
  `;
}

// Pitch run value per 100 pitches, pitcher's view: POSITIVE = runs saved = good
// (see db/migrations/018_pitch_arsenal_rv.sql for how the sign was verified).
// season -> pitch type -> RV/100.
export async function getPitchRunValues(
  mlbamId: number,
): Promise<Record<string, Record<string, number | null>>> {
  const rows = await sql<{ season: number; pitch_type: string; rv100: number | null }[]>`
    select season, pitch_type, run_value_per_100::float8 as rv100
    from web_pitch_arsenal_rv
    where mlbam_id = ${mlbamId}
  `;
  const out: Record<string, Record<string, number | null>> = {};
  for (const r of rows) (out[String(r.season)] ??= {})[r.pitch_type] = r.rv100;
  return out;
}

export type LeagueSeason = {
  season: number;
  league: "AL" | "NL" | "MLB";
  obp: number | null;
  slg: number | null;
  ops: number | null;
  era: number | null;
  k_pct: number | null;
  bb_pct: number | null;
};

export async function getLeagueSeason(
  season: number,
  league: "AL" | "NL" | "MLB" = "MLB",
): Promise<LeagueSeason | null> {
  const rows = await sql<LeagueSeason[]>`
    select season, league, obp::float8 as obp, slg::float8 as slg, ops::float8 as ops,
      era::float8 as era, k_pct::float8 as k_pct, bb_pct::float8 as bb_pct
    from web_league_season
    where season = ${season} and league = ${league}
  `;
  return rows[0] ?? null;
}
