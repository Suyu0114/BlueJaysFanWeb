import { cache } from "react";
import { sql } from "./db";
import type { TeamGame } from "./team-season";

// P12 M5: DB readers for the team season page. The math lives in the pure
// lib/team-season.ts; this file only fetches rows. Everything is regular season
// (web_games.game_type = 'R') and Jays-scoped (web_player_season_stats, box scores).

// Seasons with at least one final regular-season game, newest first. The Nav
// "Team" link and the season page's switcher both resolve through this, so
// they can't disagree (P12 D11). React cache() dedupes it within one request.
export const getTeamSeasons = cache(async (): Promise<number[]> => {
  const rows = await sql<{ season: number }[]>`
    select distinct season from web_games
    where game_type = 'R' and is_final
    order by season desc
  `;
  return rows.map((r) => r.season);
});

export async function getLatestTeamSeason(): Promise<number | null> {
  return (await getTeamSeasons())[0] ?? null;
}

export async function getTeamGames(season: number): Promise<TeamGame[]> {
  return sql<TeamGame[]>`
    select game_pk::int as game_pk, to_char(game_date, 'YYYY-MM-DD') as game_date,
      game_number, is_home, opponent_id, jays_score, opp_score, result
    from web_games
    where season = ${season} and game_type = 'R' and is_final
    order by game_date, game_number
  `;
}

// One row per Blue Jay per season: the season line plus the two numbers the
// page needs from box scores — pitcher strikeouts (not a web_player_season_stats
// column) and pitching appearances (the SP / RP split).
export type TeamPlayerSeason = {
  mlbam_id: number;
  season: number;
  name: string;
  position: string | null;
  pa: number | null;
  ops: number | null;
  hr: number | null;
  war: number | null;
  ip: number | null; // baseball notation — display / threshold only
  era: number | null;
  gs: number | null;
  so: number | null; // pitcher strikeouts, summed from box scores
  apps: number | null; // pitching appearances, from box scores
};

export async function getTeamPlayerSeasons(seasons: number[]): Promise<TeamPlayerSeason[]> {
  return sql<TeamPlayerSeason[]>`
    with pitching as (
      select s.mlbam_id, g.season, sum(s.p_so)::int as so, count(*)::int as apps
      from web_player_game_stats s
      join web_games g on g.game_pk = s.game_pk
      where s.stat_group = 'pitching' and g.game_type = 'R' and g.season = any(${seasons})
      group by 1, 2
    )
    select s.mlbam_id::int as mlbam_id, s.season, p.name, p.position,
      s.pa::int as pa, s.ops::float8 as ops, s.hr::int as hr, s.war::float8 as war,
      s.ip::float8 as ip, s.era::float8 as era, s.gs::int as gs,
      pi.so, pi.apps
    from web_player_season_stats s
    join web_players p on p.mlbam_id = s.mlbam_id
    left join pitching pi on pi.mlbam_id = s.mlbam_id and pi.season = s.season
    where s.season = any(${seasons})
  `;
}
