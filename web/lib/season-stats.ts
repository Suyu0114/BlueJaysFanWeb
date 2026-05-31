import { sql } from "./db";

export type SeasonStats = {
  mlbam_id: number;
  season: number;
  ops: number | null;
  wrc_plus: number | null;
  war: number | null;
  era: number | null;
  fip: number | null;
  k_per_9: number | null;
};

export async function getSeasonStats(mlbamId: number): Promise<SeasonStats[]> {
  return sql<SeasonStats[]>`
    select
      mlbam_id, season,
      ops::float8 as ops,
      wrc_plus::float8 as wrc_plus,
      war::float8 as war,
      era::float8 as era,
      fip::float8 as fip,
      k_per_9::float8 as k_per_9
    from web_player_season_stats
    where mlbam_id = ${mlbamId}
    order by season desc
  `;
}

// Games played so far in `season` for this batter -- proxies "season progress"
// for the SeasonProgressBar's batter-pace calculation. Pitchers should not use
// this number (a starter appears in ~32 games out of 162, which would over-
// project WAR); see SeasonProgressBar for the pitcher branch.
export async function getBatterGamesPlayed(
  mlbamId: number,
  season: number,
): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(distinct game_pk)::int as n
    from web_statcast_events
    where batter_id = ${mlbamId}
      and extract(year from game_date) = ${season}
  `;
  return rows[0]?.n ?? 0;
}
