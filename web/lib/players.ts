import { sql } from "./db";

export type RosterPlayer = {
  mlbam_id: number;
  name: string;
  position: string | null;
  bats: string | null;
  throws: string | null;
  headshot_url: string | null;
  // Most-recent Jays season in range; populated by the roster-list queries only
  // (drives the all-time grouping).
  last_season?: number | null;
  // On the current 26-man? The all-time view puts these in a "Still on the
  // roster" group, separate from departed players bucketed by last_season.
  is_active_26?: boolean | null;
};

export type RosterMode = "current" | "all-time";

export type PlayerAvailability = {
  batting: boolean;
  pitching: boolean;
  fielding: boolean;
  bazi: boolean;
};

// "Current 26-man" view (default).
export async function getRoster(): Promise<RosterPlayer[]> {
  return sql<RosterPlayer[]>`
    select p.mlbam_id, p.name, p.position, p.bats, p.throws, p.headshot_url,
      p.is_active_26,
      (select max(s.season) from web_player_seasons s
        where s.mlbam_id = p.mlbam_id and s.team_id = 141) as last_season
    from web_players p
    where p.is_active_26 = true
    order by p.position nulls last, p.name
  `;
}

// "Anyone who appeared for the Jays in 2024-2026" view. One row per player with
// their most-recent Jays season. Ordered so current 26-man players come first,
// then departed players by last season descending (2026, 2025, 2024); name
// breaks ties. The page groups on `is_active_26` then `last_season`.
export async function getRosterAllTime(): Promise<RosterPlayer[]> {
  return sql<RosterPlayer[]>`
    select p.mlbam_id, p.name, p.position, p.bats, p.throws, p.headshot_url,
      coalesce(p.is_active_26, false) as is_active_26,
      max(s.season) as last_season
    from web_players p
    join web_player_seasons s on s.mlbam_id = p.mlbam_id
    where s.season in (2024, 2025, 2026) and s.team_id = 141
    group by p.mlbam_id, p.name, p.position, p.bats, p.throws, p.headshot_url,
      p.is_active_26
    order by coalesce(p.is_active_26, false) desc, max(s.season) desc, p.name
  `;
}

export async function getRosterByMode(mode: RosterMode): Promise<RosterPlayer[]> {
  return mode === "all-time" ? getRosterAllTime() : getRoster();
}

export async function getPlayer(
  mlbamId: number,
): Promise<RosterPlayer | null> {
  const rows = await sql<RosterPlayer[]>`
    select mlbam_id, name, position, bats, throws, headshot_url
    from web_players
    where mlbam_id = ${mlbamId}
    limit 1
  `;
  return rows[0] ?? null;
}

// Which subpages should PlayerNav render for this player?
// - batting / pitching: derived from web_player_seasons.appeared_as_*
// - fielding: derived from any web_fielding_frv row (Savant excludes P / C)
// - bazi: reserved slot for v2; always false in P6
export async function getPlayerAvailability(
  mlbamId: number,
): Promise<PlayerAvailability> {
  const rows = await sql<
    { has_batting: boolean; has_pitching: boolean; has_fielding: boolean }[]
  >`
    select
      coalesce(bool_or(s.appeared_as_batter),  false) as has_batting,
      coalesce(bool_or(s.appeared_as_pitcher), false) as has_pitching,
      exists (
        select 1 from web_fielding_frv f where f.mlbam_id = ${mlbamId}
      ) as has_fielding
    from web_player_seasons s
    where s.mlbam_id = ${mlbamId}
  `;
  const row = rows[0] ?? {
    has_batting: false,
    has_pitching: false,
    has_fielding: false,
  };
  // Safety net: if web_player_seasons isn't populated yet for this player
  // (e.g., right after a P5-era migration before backfill), default to showing
  // batting + pitching tabs rather than hiding everything.
  const seasonsEmpty = !row.has_batting && !row.has_pitching && !row.has_fielding;
  return {
    batting: seasonsEmpty ? true : row.has_batting,
    pitching: seasonsEmpty ? true : row.has_pitching,
    fielding: row.has_fielding,
    bazi: false,
  };
}
