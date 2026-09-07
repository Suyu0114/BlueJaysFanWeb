import { sql } from "./db";

// P11: MLB standings snapshot (web_standings, one row per team per season).
//
// GB / WCGB / elimination / magic numbers are TEXT carrying MLB's own display
// sentinels -- '-' means "is the reference" (division leader for GB, the third
// wild card spot for WCGB), '+9.5' means "ahead of the cut line", 'E' means
// eliminated. They are never parsed; ordering always uses the *_rank columns.
// See db/migrations/012_standings.sql.
export type StandingsRow = {
  season: number;
  team_id: number;
  team_name: string;
  team_abbrev: string;
  league_id: number;
  division_id: number;
  division_name: string;
  games_played: number | null;
  w: number;
  l: number;
  pct: number | null;
  division_rank: number | null;
  league_rank: number | null;
  wild_card_rank: number | null; // null for division leaders (absent upstream)
  games_back: string | null;
  wc_games_back: string | null;
  streak_code: string | null;
  l10_w: number | null;
  l10_l: number | null;
  home_w: number | null;
  home_l: number | null;
  away_w: number | null;
  away_l: number | null;
  x_w: number | null;
  x_l: number | null;
  runs_scored: number | null;
  runs_allowed: number | null;
  run_diff: number | null;
  division_leader: boolean;
  division_champ: boolean;
  clinched: boolean;
  elimination_number: string | null;
  magic_number: string | null;
};

export const TORONTO_TEAM_ID = 141;
export const AMERICAN_LEAGUE_ID = 103;
export const NATIONAL_LEAGUE_ID = 104;

// Display order: AL first, and AL East on top (this is a Blue Jays site, not a
// neutral standings mirror). NOTE 203 = NL WEST and 204 = NL EAST -- the NL pair
// is reversed relative to the AL pattern. Verified against the live feed.
export const AL_EAST = 201;
export const AL_CENTRAL = 202;
export const AL_WEST = 200;
export const NL_EAST = 204;
export const NL_CENTRAL = 205;
export const NL_WEST = 203;

export const AL_DIVISIONS = [AL_EAST, AL_CENTRAL, AL_WEST] as const;
export const NL_DIVISIONS = [NL_EAST, NL_CENTRAL, NL_WEST] as const;
export const DIVISION_ORDER = [...AL_DIVISIONS, ...NL_DIVISIONS];

// i18n key per division id, so headings read "AL East" rather than the API's
// "American League East" and can be translated as prose.
export const DIVISION_KEY: Record<number, string> = {
  [AL_EAST]: "alEast",
  [AL_CENTRAL]: "alCentral",
  [AL_WEST]: "alWest",
  [NL_EAST]: "nlEast",
  [NL_CENTRAL]: "nlCentral",
  [NL_WEST]: "nlWest",
};

export async function getStandings(season: number): Promise<StandingsRow[]> {
  return sql<StandingsRow[]>`
    select
      season,
      team_id,
      team_name,
      team_abbrev,
      league_id,
      division_id,
      division_name,
      games_played,
      w,
      l,
      pct::float8 as pct,
      division_rank,
      league_rank,
      wild_card_rank,
      games_back,
      wc_games_back,
      streak_code,
      l10_w, l10_l, home_w, home_l, away_w, away_l, x_w, x_l,
      runs_scored, runs_allowed, run_diff,
      division_leader,
      division_champ,
      clinched,
      elimination_number,
      magic_number
    from web_standings
    where season = ${season}
    order by division_id, division_rank
  `;
}

/** Rows for one division, already ranked. */
export function byDivision(
  rows: StandingsRow[],
  divisionId: number,
): StandingsRow[] {
  return rows
    .filter((r) => r.division_id === divisionId)
    .sort((a, b) => (a.division_rank ?? 99) - (b.division_rank ?? 99));
}

/**
 * Wild card race for one league. Division leaders are excluded entirely -- they
 * hold seeds 1-3 and MLB reports wildCardGamesBack '-' for them too, so leaving
 * them in would put a leader on the cut line.
 */
export function wildCardRace(rows: StandingsRow[], leagueId: number) {
  const contenders = rows
    .filter((r) => r.league_id === leagueId && !r.division_leader)
    .sort((a, b) => (a.wild_card_rank ?? 99) - (b.wild_card_rank ?? 99));
  return {
    inside: contenders.filter((r) => (r.wild_card_rank ?? 99) <= 3),
    outside: contenders.filter((r) => (r.wild_card_rank ?? 99) > 3),
  };
}

/**
 * Postseason picture for one league: seeds 1-3 are the division leaders ordered
 * by overall league rank, seeds 4-6 are wild cards 1-3. `chasers` is the next
 * few clubs outside the cut line.
 */
export function playoffPicture(
  rows: StandingsRow[],
  leagueId: number,
  chaserCount = 3,
) {
  const leaders = rows
    .filter((r) => r.league_id === leagueId && r.division_leader)
    .sort((a, b) => (a.league_rank ?? 99) - (b.league_rank ?? 99));
  const { inside, outside } = wildCardRace(rows, leagueId);
  return {
    seeds: [...leaders, ...inside],
    chasers: outside.slice(0, chaserCount),
  };
}

/**
 * mlb.com's clinch markers. Derived rather than stored so the rule can change
 * without an ETL re-run.
 *   z = best record in the league   y = won the division
 *   x = clinched a playoff berth    e = eliminated
 */
export function clinchMarker(
  row: StandingsRow,
): "z" | "y" | "x" | "e" | null {
  if (row.clinched && row.league_rank === 1) return "z";
  if (row.division_champ) return "y";
  if (row.clinched) return "x";
  if (row.elimination_number === "E") return "e";
  return null;
}

// --- formatters (mirror SeasonStatTable's avg3 / int0 / dec convention) ---

/** Baseball convention: drop the leading zero (".599"). */
export function pct3(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(3);
  return s.startsWith("0.") ? s.slice(1) : s;
}

export function record(w: number | null, l: number | null): string {
  return w == null || l == null ? "—" : `${w}-${l}`;
}

/** Passes MLB's own string through; only the '-' sentinel becomes an em dash. */
export function gb(v: string | null): string {
  if (v == null || v === "") return "—";
  return v === "-" ? "—" : v;
}

export function diff(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v > 0 ? `+${v}` : String(v);
}

export function int0(v: number | null): string {
  return v == null || !Number.isFinite(v) ? "—" : String(Math.round(v));
}
