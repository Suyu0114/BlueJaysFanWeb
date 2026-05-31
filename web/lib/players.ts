import { sql } from "./db";

export type RosterPlayer = {
  mlbam_id: number;
  name: string;
  position: string | null;
  bats: string | null;
  throws: string | null;
  headshot_url: string | null;
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
    select mlbam_id, name, position, bats, throws, headshot_url
    from web_players
    where is_active_26 = true
    order by position nulls last, name
  `;
}

// "Anyone who appeared for the Jays in 2024-2026" view. Distinct on mlbam_id
// so a player who appeared in multiple seasons shows up once.
export async function getRosterAllTime(): Promise<RosterPlayer[]> {
  return sql<RosterPlayer[]>`
    select distinct on (p.mlbam_id)
      p.mlbam_id, p.name, p.position, p.bats, p.throws, p.headshot_url
    from web_players p
    join web_player_seasons s on s.mlbam_id = p.mlbam_id
    where s.season in (2024, 2025, 2026) and s.team_id = 141
    order by p.mlbam_id, p.name
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
