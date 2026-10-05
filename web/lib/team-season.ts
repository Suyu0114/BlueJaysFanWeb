// P12 M5: PURE team-season helpers — Jays game rows in, series / records out.
// No DB, no React: the season page uses them for one season vs the prior one,
// and P13 (team trends) reuses them across five seasons. Keep them generic.
//
// Input rows are regular-season finals (web_games, game_type = 'R', is_final)
// from the Jays' side. Every function sorts by (date, game_number) itself, so
// callers can pass rows in any order.

export type TeamGame = {
  game_pk: number;
  game_date: string; // 'YYYY-MM-DD'
  game_number: number; // 1 / 2 for doubleheaders
  is_home: boolean;
  opponent_id: number;
  jays_score: number;
  opp_score: number;
  result: "W" | "L" | null; // null = tie (suspended, extremely rare)
};

export type WinLoss = { w: number; l: number };

export type SeriesPoint = { game: number; date: string; value: number };

function chronological(games: TeamGame[]): TeamGame[] {
  return [...games].sort(
    (a, b) => a.game_date.localeCompare(b.game_date) || a.game_number - b.game_number,
  );
}

export function winLoss(games: TeamGame[]): WinLoss {
  let w = 0;
  let l = 0;
  for (const g of games) {
    if (g.result === "W") w += 1;
    else if (g.result === "L") l += 1;
  }
  return { w, l };
}

export function winPct({ w, l }: WinLoss): number | null {
  return w + l === 0 ? null : w / (w + l);
}

export function runs(games: TeamGame[]): { rs: number; ra: number; diff: number } {
  let rs = 0;
  let ra = 0;
  for (const g of games) {
    rs += g.jays_score;
    ra += g.opp_score;
  }
  return { rs, ra, diff: rs - ra };
}

// Games above .500 after each game (cumulative W − L), by game number.
export function gamesAboveSeries(games: TeamGame[]): SeriesPoint[] {
  let above = 0;
  return chronological(games).map((g, i) => {
    above += g.result === "W" ? 1 : g.result === "L" ? -1 : 0;
    return { game: i + 1, date: g.game_date, value: above };
  });
}

// Cumulative run differential after each game, by game number.
export function runDiffSeries(games: TeamGame[]): SeriesPoint[] {
  let diff = 0;
  return chronological(games).map((g, i) => {
    diff += g.jays_score - g.opp_score;
    return { game: i + 1, date: g.game_date, value: diff };
  });
}

// Monthly record. March games fold into April and October into September, as
// MLB's own splits do — so `month` is 4..9.
export type MonthRecord = WinLoss & { month: number; rs: number; ra: number };

export function monthlyRecords(games: TeamGame[]): MonthRecord[] {
  const by = new Map<number, TeamGame[]>();
  for (const g of games) {
    const m = Math.min(9, Math.max(4, Number(g.game_date.slice(5, 7))));
    by.set(m, [...(by.get(m) ?? []), g]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, gs]) => {
      const { rs, ra } = runs(gs);
      return { month, ...winLoss(gs), rs, ra };
    });
}

// Situational splits. `divisionOf` / `pctOf` come from that season's final
// standings (opponent id -> division id / final winning percentage).
export type SplitKey =
  | "home"
  | "away"
  | "oneRun"
  | "blowouts"
  | "vsDivision"
  | "vsWinning"
  | "vsLosing";

export type SplitContext = {
  ownDivision: number;
  divisionOf: ReadonlyMap<number, number>;
  pctOf: ReadonlyMap<number, number>;
};

export const BLOWOUT_MARGIN = 5;

export function seasonSplits(games: TeamGame[], ctx: SplitContext): Record<SplitKey, WinLoss> {
  const margin = (g: TeamGame) => Math.abs(g.jays_score - g.opp_score);
  const oppPct = (g: TeamGame) => ctx.pctOf.get(g.opponent_id);
  return {
    home: winLoss(games.filter((g) => g.is_home)),
    away: winLoss(games.filter((g) => !g.is_home)),
    oneRun: winLoss(games.filter((g) => margin(g) === 1)),
    blowouts: winLoss(games.filter((g) => margin(g) >= BLOWOUT_MARGIN)),
    vsDivision: winLoss(games.filter((g) => ctx.divisionOf.get(g.opponent_id) === ctx.ownDivision)),
    vsWinning: winLoss(games.filter((g) => (oppPct(g) ?? 0) >= 0.5)),
    vsLosing: winLoss(games.filter((g) => oppPct(g) != null && oppPct(g)! < 0.5)),
  };
}

export type Streak = { length: number; start: string; end: string } | null;

export function longestStreak(games: TeamGame[], result: "W" | "L"): Streak {
  let best: Streak = null;
  let len = 0;
  let start = "";
  for (const g of chronological(games)) {
    if (g.result === result) {
      if (len === 0) start = g.game_date;
      len += 1;
      if (!best || len > best.length) best = { length: len, start, end: g.game_date };
    } else {
      len = 0;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Player-level team views (leaders, value by position group)
// ---------------------------------------------------------------------------

// Minimal player-season shape (lib/team-season-data.ts::TeamPlayerSeason fits).
export type PlayerSeasonLine = {
  mlbam_id: number;
  season: number;
  name: string;
  position: string | null;
  pa: number | null;
  ops: number | null;
  hr: number | null;
  sb: number | null;
  war: number | null;
  war_batting: number | null; // runs above average (WAR component)
  war_baserunning: number | null;
  ip: number | null; // baseball notation
  era: number | null;
  whip: number | null;
  sv: number | null;
  gs: number | null;
  so: number | null;
  apps: number | null;
};

// Rate-stat leaderboards need a floor, or a 20-PA call-up tops the OPS list.
export const LEADER_MIN_PA = 300;
export const LEADER_MIN_IP = 80;

export type LeaderCategory = "war" | "ops" | "hr" | "sb" | "era" | "whip" | "so" | "sv";
export type Leader = { mlbam_id: number; name: string; value: number; prior: number | null };

// One role per player-season (the season page's leaders, WAR by position and
// player-stats tabs all split the same way): any PA = batter; IP and no PA = pitcher.
export const isBatter = (r: Pick<PlayerSeasonLine, "pa">) => (r.pa ?? 0) > 0;
export const isPitcher = (r: Pick<PlayerSeasonLine, "pa" | "ip">) => r.ip != null && !isBatter(r);

// Top `n` Blue Jays per category in `season`, each with the same player's value
// in `prior` (null when he wasn't a Jay then, or had no line in that category).
// Rate stats (OPS / ERA / WHIP) need the PA / IP floor; SB and SV list only
// players with at least one, so a short list stays short instead of padding zeros.
export function teamLeaders(
  rows: PlayerSeasonLine[],
  season: number,
  prior: number | null,
  n = 3,
): Record<LeaderCategory, Leader[]> {
  const cur = rows.filter((r) => r.season === season);
  const priorOf = (id: number) => rows.find((r) => r.mlbam_id === id && r.season === prior);
  const top = (
    pool: PlayerSeasonLine[],
    pick: (r: PlayerSeasonLine) => number | null,
    ascending = false,
  ): Leader[] =>
    pool
      .filter((r) => pick(r) != null)
      .sort((a, b) => (ascending ? pick(a)! - pick(b)! : pick(b)! - pick(a)!))
      .slice(0, n)
      .map((r) => {
        const p = prior == null ? undefined : priorOf(r.mlbam_id);
        return { mlbam_id: r.mlbam_id, name: r.name, value: pick(r)!, prior: p ? pick(p) : null };
      });
  return {
    war: top(cur, (r) => r.war),
    ops: top(cur.filter((r) => (r.pa ?? 0) >= LEADER_MIN_PA), (r) => r.ops),
    hr: top(cur.filter(isBatter), (r) => r.hr),
    sb: top(cur.filter((r) => isBatter(r) && (r.sb ?? 0) > 0), (r) => r.sb),
    era: top(cur.filter((r) => isPitcher(r) && (r.ip ?? 0) >= LEADER_MIN_IP), (r) => r.era, true),
    whip: top(cur.filter((r) => isPitcher(r) && (r.ip ?? 0) >= LEADER_MIN_IP), (r) => r.whip, true),
    so: top(cur.filter(isPitcher), (r) => r.so),
    sv: top(cur.filter((r) => isPitcher(r) && (r.sv ?? 0) > 0), (r) => r.sv),
  };
}

export const POSITION_GROUPS = ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number];
/** The groups with a batting line (Off / HR / OPS): everything but SP / RP. */
export const BATTING_GROUPS: readonly PositionGroup[] = POSITION_GROUPS.filter((g) => g !== "SP" && g !== "RP");

// FanGraphs' Off: batting + baserunning runs above average, from the WAR
// components. The player-stats table and value by position share this one rule.
export const offRuns = (r: Pick<PlayerSeasonLine, "war_batting" | "war_baserunning">) =>
  r.war_batting == null || r.war_baserunning == null ? null : r.war_batting + r.war_baserunning;

// A batting position -> its group. PH and P (a position player batting while
// on the mound, 1-2 PA a season) count as DH, the bat-only slot — so C … OF
// match MLB's own by-position splits exactly. The 025 view
// (db/migrations/025_team_position_views.sql, pos_group) groups all 30 clubs the
// same way for the season page's "vs MLB" — change both together.
function batterGroup(position: string | null): PositionGroup {
  const p = (position ?? "").toUpperCase();
  if (p === "LF" || p === "CF" || p === "RF" || p === "OF") return "OF";
  if (p === "C" || p === "1B" || p === "2B" || p === "3B" || p === "SS") return p;
  return "DH";
}

// One group per player-season. Batters by that season's position (the readers
// resolve it from web_player_position_splits, falling back to web_players.position).
// Pitchers split SP / RP by the share of appearances that were starts. Position
// players who pitched mop-up innings stay in their position group.
export function positionGroup(r: PlayerSeasonLine): PositionGroup {
  if (isBatter(r)) return batterGroup(r.position);
  const apps = r.apps ?? 0;
  const gs = r.gs ?? 0;
  return (apps > 0 ? gs / apps >= 0.5 : gs > 0) ? "SP" : "RP";
}

// Minimal by-position batting line (lib/team-season-data.ts::PositionSplit fits).
export type PositionSplitLine = {
  mlbam_id: number;
  season: number;
  position: string; // C / 1B / … / RF / DH, PH = pinch-hitter, P = batting while on the mound
  pa: number;
  ab: number;
  h: number;
  bb: number;
  hbp: number;
  sf: number;
  tb: number;
  hr: number;
};

export type PositionValue = { war: number; off: number; hr: number; pa: number; ops: number | null };

// Team value by position group in `season`. A position player is split across
// the positions he batted at, by plate appearances:
// - HR / PA / OPS are summed from the by-position counts, so they are exact
//   (OPS = OBP + SLG from the summed counts, never an average of rates);
// - WAR and Off are season values with no by-position split, so each is shared
//   out by his PA share at each position (the totals are conserved).
// LF / CF / RF -> OF; PH and P -> DH (batterGroup). Pitchers' WAR goes to SP / RP.
// A batter without split rows falls back to one group for the whole season.
export function valueByPosition(
  rows: PlayerSeasonLine[],
  splits: PositionSplitLine[],
  season: number,
): Record<PositionGroup, PositionValue> {
  const acc = Object.fromEntries(
    POSITION_GROUPS.map((g) => [g, { war: 0, off: 0, hr: 0, pa: 0, ab: 0, h: 0, bb: 0, hbp: 0, sf: 0, tb: 0 }]),
  ) as Record<PositionGroup, { war: number; off: number; hr: number } & Omit<PositionSplitLine, "mlbam_id" | "season" | "position">>;
  const byPlayer = new Map<number, PositionSplitLine[]>();
  for (const s of splits) {
    if (s.season !== season) continue;
    byPlayer.set(s.mlbam_id, [...(byPlayer.get(s.mlbam_id) ?? []), s]);
  }

  for (const r of rows) {
    if (r.season !== season) continue;
    const war = r.war ?? 0;
    const own = isBatter(r) ? (byPlayer.get(r.mlbam_id) ?? []) : [];
    const total = own.reduce((sum, s) => sum + s.pa, 0);
    if (total === 0) {
      const g = acc[positionGroup(r)];
      g.war += war;
      if (isBatter(r)) {
        g.off += offRuns(r) ?? 0;
        g.hr += r.hr ?? 0;
      }
      continue;
    }
    const off = offRuns(r) ?? 0;
    for (const s of own) {
      const g = acc[batterGroup(s.position)];
      const share = s.pa / total;
      g.war += war * share;
      g.off += off * share;
      g.hr += s.hr;
      g.pa += s.pa;
      g.ab += s.ab;
      g.h += s.h;
      g.bb += s.bb;
      g.hbp += s.hbp;
      g.sf += s.sf;
      g.tb += s.tb;
    }
  }

  return Object.fromEntries(
    POSITION_GROUPS.map((group) => {
      const g = acc[group];
      const obpDen = g.ab + g.bb + g.hbp + g.sf;
      const ops = g.ab > 0 && obpDen > 0 ? (g.h + g.bb + g.hbp) / obpDen + g.tb / g.ab : null;
      return [group, { war: g.war, off: g.off, hr: g.hr, pa: g.pa, ops }];
    }),
  ) as Record<PositionGroup, PositionValue>;
}

// P13: how a season ended, from the Jays' postseason games (game_type F / D / L /
// W). No postseason rows -> "missed". The last postseason game decides it: a
// win in the World Series is the title; otherwise the club went out in the
// round of its last game (a series is only ever lost on its final game).
export type PostseasonGame = { game_type: string; game_date: string; game_number: number; result: "W" | "L" | null };
export type PostseasonResult = "missed" | "lostWc" | "lostDs" | "lostCs" | "lostWs" | "wonWs";

const ROUND_OUT: Record<string, PostseasonResult> = { F: "lostWc", D: "lostDs", L: "lostCs", W: "lostWs" };

export function postseasonResult(games: PostseasonGame[]): PostseasonResult {
  const post = games
    .filter((g) => g.game_type in ROUND_OUT)
    .sort((a, b) => a.game_date.localeCompare(b.game_date) || a.game_number - b.game_number);
  const last = post.at(-1);
  if (!last) return "missed";
  if (last.game_type === "W" && last.result === "W") return "wonWs";
  return ROUND_OUT[last.game_type];
}
