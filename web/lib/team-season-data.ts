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
  sb: number | null;
  war: number | null;
  ip: number | null; // baseball notation — display / threshold only
  era: number | null;
  whip: number | null;
  sv: number | null;
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
      s.pa::int as pa, s.ops::float8 as ops, s.hr::int as hr, s.sb::int as sb, s.war::float8 as war,
      s.ip::float8 as ip, s.era::float8 as era, s.whip::float8 as whip, s.sv::int as sv, s.gs::int as gs,
      pi.so, pi.apps
    from web_player_season_stats s
    join web_players p on p.mlbam_id = s.mlbam_id
    left join pitching pi on pi.mlbam_id = s.mlbam_id and pi.season = s.season
    where s.season = any(${seasons})
  `;
}

// The season page's player-stats table: every Blue Jay's full season line
// (Jays-scoped), plus regular-season games from his box scores, pitcher
// strikeouts, and Savant OAA summed over positions (Savant's season total, all
// MLB clubs; no row for catchers / DHs). Off / Def are derived in the pure
// lib/season-player-stats.ts from the WAR components.
export type SeasonPlayerStat = {
  mlbam_id: number;
  name: string;
  position: string | null;
  pa: number | null;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  hr: number | null;
  rbi: number | null;
  sb: number | null;
  wrc_plus: number | null;
  war: number | null;
  war_batting: number | null;
  war_baserunning: number | null;
  war_fielding: number | null;
  war_positional: number | null;
  w: number | null;
  l: number | null;
  sv: number | null;
  gs: number | null;
  ip: number | null; // baseball notation — display / sort only
  era: number | null;
  fip: number | null;
  whip: number | null;
  k_pct: number | null; // raw fraction
  bb_pct: number | null; // raw fraction
  g_bat: number | null;
  g_pit: number | null;
  so: number | null; // pitcher strikeouts, summed from box scores
  oaa: number | null;
};

export async function getSeasonPlayerStats(season: number): Promise<SeasonPlayerStat[]> {
  return sql<SeasonPlayerStat[]>`
    with games as (
      select s.mlbam_id,
        count(*) filter (where s.stat_group = 'batting')::int as g_bat,
        count(*) filter (where s.stat_group = 'pitching')::int as g_pit,
        sum(s.p_so) filter (where s.stat_group = 'pitching')::int as so
      from web_player_game_stats s
      join web_games g on g.game_pk = s.game_pk
      where g.season = ${season} and g.game_type = 'R'
      group by 1
    ), fielding as (
      select mlbam_id, sum(oaa)::int as oaa
      from web_fielding_frv
      where season = ${season}
      group by 1
    )
    select s.mlbam_id::int as mlbam_id, p.name, p.position,
      s.pa::int as pa, s.avg::float8 as avg, s.obp::float8 as obp, s.slg::float8 as slg,
      s.ops::float8 as ops, s.hr::int as hr, s.rbi::int as rbi, s.sb::int as sb,
      s.wrc_plus::float8 as wrc_plus, s.war::float8 as war,
      s.war_batting::float8 as war_batting, s.war_baserunning::float8 as war_baserunning,
      s.war_fielding::float8 as war_fielding, s.war_positional::float8 as war_positional,
      s.w::int as w, s.l::int as l, s.sv::int as sv, s.gs::int as gs, s.ip::float8 as ip,
      s.era::float8 as era, s.fip::float8 as fip, s.whip::float8 as whip,
      s.k_pct::float8 as k_pct, s.bb_pct::float8 as bb_pct,
      gm.g_bat, gm.g_pit, gm.so, f.oaa
    from web_player_season_stats s
    join web_players p on p.mlbam_id = s.mlbam_id
    left join games gm on gm.mlbam_id = s.mlbam_id
    left join fielding f on f.mlbam_id = s.mlbam_id
    where s.season = ${season}
  `;
}
