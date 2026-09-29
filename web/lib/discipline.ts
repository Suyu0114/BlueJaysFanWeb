import { sql } from "./db";

// P12 M2: plate discipline + batted-ball profile, read from the migration-015
// views (db/migrations/015_metric_views.sql) — the ONE place these metrics are
// defined, shared with etl/season_report.py so the site and the article pack
// agree. Rates are raw fractions (0.245). All seasons, newest first.
//
// scope 'jays' = only games in the player's Blue Jays box score (the overview,
// matching web_player_season_stats); 'mlb' = every club (the Compare tab default).

export type Scope = "mlb" | "jays";

export type BatterDiscipline = {
  season: number;
  pitches: number;
  pa: number;
  chase_pct: number | null;
  z_swing_pct: number | null;
  whiff_pct: number | null;
  contact_pct: number | null;
  swing_pct: number | null;
  first_swing_pct: number | null;
  k_pct: number | null;
  bb_pct: number | null;
};

export type PitcherDiscipline = {
  season: number;
  pitches: number;
  pa: number;
  csw_pct: number | null;
  zone_pct: number | null;
  chase_pct: number | null;
  whiff_pct: number | null;
  first_strike_pct: number | null;
  k_pct: number | null;
  bb_pct: number | null;
  k_minus_bb_pct: number | null;
};

export type BattedBallProfile = {
  season: number;
  bip: number;
  with_ev: number;
  avg_ev: number | null;
  max_ev: number | null;
  hard_hit_pct: number | null;
  gb_pct: number | null; // approx. (launch angle), bb_type is not stored
  ld_pct: number | null;
  fb_pct: number | null;
  pu_pct: number | null;
  sweet_spot_pct: number | null;
  pull_pct: number | null;
  center_pct: number | null;
  oppo_pct: number | null;
  xwoba_con: number | null;
};

export async function getBatterDiscipline(
  mlbamId: number,
  scope: Scope,
): Promise<BatterDiscipline[]> {
  return sql<BatterDiscipline[]>`
    select season, pitches::int as pitches, pa::int as pa,
      chase_pct, z_swing_pct, whiff_pct, contact_pct, swing_pct,
      first_swing_pct, k_pct, bb_pct
    from web_v_batter_discipline
    where mlbam_id = ${mlbamId} and scope = ${scope}
    order by season desc
  `;
}

export async function getPitcherDiscipline(
  mlbamId: number,
  scope: Scope,
): Promise<PitcherDiscipline[]> {
  return sql<PitcherDiscipline[]>`
    select season, pitches::int as pitches, pa::int as pa,
      csw_pct, zone_pct, chase_pct, whiff_pct, first_strike_pct,
      k_pct, bb_pct, k_minus_bb_pct
    from web_v_pitcher_discipline
    where mlbam_id = ${mlbamId} and scope = ${scope}
    order by season desc
  `;
}

export async function getBattedBallProfile(
  mlbamId: number,
  scope: Scope,
): Promise<BattedBallProfile[]> {
  return sql<BattedBallProfile[]>`
    select season, bip::int as bip, with_ev::int as with_ev,
      avg_ev, max_ev, hard_hit_pct, gb_pct, ld_pct, fb_pct, pu_pct,
      sweet_spot_pct, pull_pct, center_pct, oppo_pct, xwoba_con
    from web_v_batted_ball_profile
    where mlbam_id = ${mlbamId} and scope = ${scope}
    order by season desc
  `;
}

// Zone-based rates over every regular-season pitch on file, per season. Savant's
// 2026 `zone` isn't comparable to earlier seasons (DATA_MODEL Known gaps #8), so
// cross-season Chase% / Z-Swing% / Zone% deltas are shown net of this shift.
// A full-table aggregate (~0.15 s warm) — only call it when a pair straddles the
// change (see crossesZoneChange in lib/season-deltas.ts).
export type ZoneReference = {
  season: number;
  zone_pct: number | null;
  chase_pct: number | null;
  z_swing_pct: number | null;
};

export async function getZoneReference(): Promise<ZoneReference[]> {
  return sql<ZoneReference[]>`
    select season,
      (count(*) filter (where zone between 1 and 9))::float8
        / nullif(count(zone), 0) as zone_pct,
      (count(*) filter (where zone between 11 and 14 and is_swing))::float8
        / nullif(count(*) filter (where zone between 11 and 14), 0) as chase_pct,
      (count(*) filter (where zone between 1 and 9 and is_swing))::float8
        / nullif(count(*) filter (where zone between 1 and 9), 0) as z_swing_pct
    from web_v_pitch_scoped
    group by season
    order by season
  `;
}
