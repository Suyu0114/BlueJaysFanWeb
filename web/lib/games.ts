import { sql } from "./db";

// Baseball "innings pitched" convention: 5 outs = "1.2" (1 and 2/3 innings),
// 6 outs = "2.0". web_player_game_stats stores integer outs (outs_recorded),
// NEVER the decimal "5.2" form (which is not 5.2 innings). This is the single
// source of truth for the conversion; lib/recent-game.ts re-exports it.
export function formatInningsPitched(outs: number): string {
  const whole = Math.floor(outs / 3);
  const frac = outs % 3;
  return `${whole}.${frac}`;
}

export type ScheduleGame = {
  game_pk: number;
  season: number;
  game_date: string; // 'YYYY-MM-DD' (MLB officialDate)
  first_pitch_et: string | null; // pre-formatted ET clock time, e.g. "7:15 PM"
  game_number: number;
  doubleheader: string; // 'N' | 'Y' | 'S'
  is_home: boolean;
  opponent_id: number;
  opponent_name: string;
  jays_score: number | null; // null until played
  opp_score: number | null;
  status: string; // detailedState (Scheduled / In Progress / Final / ...)
  is_final: boolean;
  result: string | null; // 'W' | 'L' | null
  venue: string | null;
};

// Shared column projection. first_pitch_utc (timestamptz) is converted to an ET
// clock string here (Postgres has the tz database + handles DST) so client
// components stay timezone-free.
const gameColumns = sql`
  game_pk::int as game_pk,
  season,
  to_char(game_date, 'YYYY-MM-DD') as game_date,
  to_char(first_pitch_utc at time zone 'America/New_York', 'FMHH12:MI AM') as first_pitch_et,
  game_number,
  doubleheader,
  is_home,
  opponent_id,
  opponent_name,
  jays_score,
  opp_score,
  status,
  is_final,
  result,
  venue
`;

// Full-season schedule (default) or a single month. The home-page calendar
// fetches the whole season once and slices by month client-side, so `month` is
// optional and mainly here for other callers.
export async function getSchedule(
  season: number,
  month?: number,
): Promise<ScheduleGame[]> {
  if (month != null) {
    return sql<ScheduleGame[]>`
      select ${gameColumns}
      from web_games
      where season = ${season}
        and extract(month from game_date) = ${month}
      order by game_date, game_number
    `;
  }
  return sql<ScheduleGame[]>`
    select ${gameColumns}
    from web_games
    where season = ${season}
    order by game_date, game_number
  `;
}

export async function getGame(gamePk: number): Promise<ScheduleGame | null> {
  const rows = await sql<ScheduleGame[]>`
    select ${gameColumns}
    from web_games
    where game_pk = ${gamePk}
    limit 1
  `;
  return rows[0] ?? null;
}

export type GameBattingLine = {
  mlbam_id: number;
  name: string;
  pa: number | null;
  ab: number | null;
  r: number | null;
  h: number | null;
  doubles: number | null;
  triples: number | null;
  hr: number | null;
  rbi: number | null;
  bb: number | null;
  so: number | null;
  sb: number | null;
  hbp: number | null;
};

export type GamePitchingLine = {
  mlbam_id: number;
  name: string;
  ip: string; // derived from outs_recorded via formatInningsPitched
  outs_recorded: number | null;
  bf: number | null;
  h: number | null;
  r: number | null;
  er: number | null;
  bb: number | null;
  so: number | null;
  hr: number | null;
  pitches: number | null;
  strikes: number | null;
  decision: string | null; // 'W' | 'L' | 'S' | 'H' | null
};

// Per-game box score: every Jays batting and/or pitching line.
// NOTE: stat_group literal is 'batting' (Decision 1 fixed the earlier
// 'hitting' typo). We have no stored lineup slot, so batting is ordered by PA
// (regulars first) and pitching by outs (starter first).
export async function getGameBoxscore(
  gamePk: number,
): Promise<{ batting: GameBattingLine[]; pitching: GamePitchingLine[] }> {
  const [batting, pitchingRaw] = await Promise.all([
    sql<GameBattingLine[]>`
      select
        s.mlbam_id::int as mlbam_id,
        p.name,
        s.pa, s.ab, s.r, s.h, s.doubles, s.triples, s.hr, s.rbi, s.bb, s.so, s.sb, s.hbp
      from web_player_game_stats s
      join web_players p on p.mlbam_id = s.mlbam_id
      where s.game_pk = ${gamePk} and s.stat_group = 'batting'
      order by s.pa desc nulls last, s.ab desc nulls last, p.name
    `,
    sql<Omit<GamePitchingLine, "ip">[]>`
      select
        s.mlbam_id::int as mlbam_id,
        p.name,
        s.outs_recorded,
        s.bf,
        s.p_h  as h,
        s.p_r  as r,
        s.er,
        s.p_bb as bb,
        s.p_so as so,
        s.p_hr as hr,
        s.pitches,
        s.strikes,
        s.decision
      from web_player_game_stats s
      join web_players p on p.mlbam_id = s.mlbam_id
      where s.game_pk = ${gamePk} and s.stat_group = 'pitching'
      order by s.outs_recorded desc nulls last, p.name
    `,
  ]);

  const pitching: GamePitchingLine[] = pitchingRaw.map((row) => ({
    ...row,
    ip: formatInningsPitched(row.outs_recorded ?? 0),
  }));

  return { batting, pitching };
}
