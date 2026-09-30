import { sql } from "./db";
import { teamAbbr } from "./team-abbr";

// P12 M3: full-MLB season lines per club (web_player_team_season_stats,
// migration 014) for the Compare tab and the club labels on the other tabs.
// team_id 0 = the season total across clubs (always present when the player had
// an MLB line); team_id 141 = his Blue Jays part, equal to web_player_season_stats.
// Only the 2026 roster is covered (P12 D13): other players get no rows.

export const SEASON_TOTAL = 0;
export const JAYS = 141;

export type TeamSeasonLine = {
  season: number;
  team_id: number;
  g: number | null;
  first_game: string | null; // YYYY-MM-DD
  last_game: string | null;
  // batting
  pa: number | null;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  wrc_plus: number | null;
  hr: number | null;
  sb: number | null;
  bat_k_pct: number | null;
  bat_bb_pct: number | null;
  // pitching
  ip: number | null; // baseball notation (170.1 = 170 1/3) — display only
  gs: number | null;
  w: number | null;
  l: number | null;
  sv: number | null;
  era: number | null;
  fip: number | null;
  whip: number | null;
  k_pct: number | null;
  bb_pct: number | null;
  war: number | null;
};

export async function getTeamSeasonLines(mlbamId: number): Promise<TeamSeasonLine[]> {
  return sql<TeamSeasonLine[]>`
    select season, team_id, g::int as g,
      to_char(first_game, 'YYYY-MM-DD') as first_game,
      to_char(last_game, 'YYYY-MM-DD') as last_game,
      pa::int as pa, avg::float8 as avg, obp::float8 as obp, slg::float8 as slg,
      ops::float8 as ops, wrc_plus::float8 as wrc_plus, hr::int as hr, sb::int as sb,
      bat_k_pct::float8 as bat_k_pct, bat_bb_pct::float8 as bat_bb_pct,
      ip::float8 as ip, gs::int as gs, w::int as w, l::int as l, sv::int as sv,
      era::float8 as era, fip::float8 as fip, whip::float8 as whip,
      k_pct::float8 as k_pct, bb_pct::float8 as bb_pct, war::float8 as war
    from web_player_team_season_stats
    where mlbam_id = ${mlbamId}
    order by season desc, first_game nulls last
  `;
}

type ClubRow = Pick<TeamSeasonLine, "season" | "team_id" | "g" | "first_game">;

// season -> the clubs he played for that season, in the order he played for them.
export function clubsBySeason(lines: ClubRow[]): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  const clubRows = lines
    .filter((l) => l.team_id !== SEASON_TOTAL && (l.g ?? 0) > 0)
    .sort((a, b) => (a.first_game ?? "").localeCompare(b.first_game ?? ""));
  for (const l of clubRows) (out[l.season] ??= []).push(l.team_id);
  return out;
}

export function clubLabel(teamIds: number[] | undefined): string {
  return (teamIds ?? []).map((id) => teamAbbr(id)).join("/");
}

// For the Batting / Pitching / Fielding tabs: { "2025": "SD", "2026": "TOR/HOU" }.
// Seasons without per-club rows (players outside the 2026 roster) are absent,
// and callers show the bare year.
export async function getSeasonClubLabels(mlbamId: number): Promise<Record<string, string>> {
  const rows = await sql<ClubRow[]>`
    select season, team_id, g::int as g, to_char(first_game, 'YYYY-MM-DD') as first_game
    from web_player_team_season_stats
    where mlbam_id = ${mlbamId} and team_id <> ${SEASON_TOTAL}
  `;
  return Object.fromEntries(
    Object.entries(clubsBySeason(rows)).map(([season, ids]) => [season, clubLabel(ids)]),
  );
}
