import { cache } from "react";
import { sql } from "./db";
import type { MetricKey } from "./team-metrics";
import type { PostseasonGame } from "./team-season";

// P13: DB readers for the team trends page. Every rate, MLB average and rank is
// read from the 022 views (web_v_team_season / web_v_mlb_season) — the one
// definition the article pack (etl/season_report.py) reads too. Nothing here
// computes a metric. Game-level rows reuse P12's lib/team-season-data.ts.

/** How many seasons the page shows (T1): the newest N with all 30 clubs loaded. */
export const TREND_SEASONS = 5;

type Ranks = { [K in MetricKey as `${K}_rank`]: number | null };

/** One club-season of web_v_team_season (the columns the page reads). */
export type TeamSeasonRow = Record<MetricKey, number | null> &
  Ranks & {
    season: number;
    team_id: number;
    team_name: string | null;
    team_abbrev: string | null;
    league_id: number | null;
    division_id: number | null;
    division_name: string | null;
    division_rank: number | null;
    w: number | null;
    l: number | null;
    x_w: number | null;
    x_l: number | null;
    luck: number | null;
    games: number | null;
    pa: number | null;
    ip: number | null;
    hr: number | null;
    sb: number | null;
    rs: number | null;
    ra: number | null;
    lg_rpg: number | null;
    offense_runs: number | null;
    prevention_runs: number | null;
    woba_minus_xwoba: number | null;
  };

/** The MLB row (web_v_mlb_season): same metric columns minus the record ones. */
export type MlbSeasonRow = Partial<Record<MetricKey, number | null>> & {
  season: number;
  games: number | null;
  cfip: number | null;
  lg_rpg: number | null;
};

// Oldest -> newest. React cache() dedupes it within one request.
export const getTrendSeasons = cache(async (): Promise<number[]> => {
  const rows = await sql<{ season: number }[]>`
    select season from web_team_season_stats
    group by season
    having count(*) = 30
    order by season desc
    limit ${TREND_SEASONS}
  `;
  return rows.map((r) => r.season).sort((a, b) => a - b);
});

/** All 30 clubs (for ranks / leaders) + the MLB row, for the given seasons. */
export async function getTeamTrend(
  seasons: number[],
): Promise<{ clubs: TeamSeasonRow[]; mlb: MlbSeasonRow[] }> {
  if (seasons.length === 0) return { clubs: [], mlb: [] };
  const [clubs, mlb] = await Promise.all([
    sql<TeamSeasonRow[]>`
      select * from web_v_team_season
      where season = any(${seasons})
      order by season, team_id
    `,
    sql<MlbSeasonRow[]>`
      select * from web_v_mlb_season
      where season = any(${seasons})
      order by season
    `,
  ]);
  return { clubs, mlb };
}

/** The Jays' postseason games (F / D / L / W), finals only, for postseasonResult(). */
export async function getPostseasonGames(
  seasons: number[],
): Promise<(PostseasonGame & { season: number })[]> {
  if (seasons.length === 0) return [];
  return sql<(PostseasonGame & { season: number })[]>`
    select season, game_type, to_char(game_date, 'YYYY-MM-DD') as game_date, game_number, result
    from web_games
    where season = any(${seasons}) and game_type in ('F', 'D', 'L', 'W') and is_final
    order by game_date, game_number
  `;
}
