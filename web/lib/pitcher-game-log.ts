import { sql } from "./db";

// P10: per-appearance pitching line for one player in one season, joined to
// the schedule for date / opponent / result. Drives the pitcher Recent Form,
// the last-10 Game Log, and the rolling-ERA sparkline on the overview page
// (one fetch, derived three ways in lib/pitching-form.ts). Mirrors
// lib/batter-game-log.ts.
//
// Current-season only by nature: web_player_game_stats is maintained by the
// nightly box-score ingest for the live season; 2024/2025 are not backfilled.
export type PitcherGameRow = {
  game_pk: number;
  game_date: string; // 'YYYY-MM-DD' (web_games.game_date, ET standings date)
  opponent_name: string;
  is_home: boolean;
  result: string | null; // 'W' | 'L' | null
  jays_score: number | null;
  opp_score: number | null;
  outs_recorded: number | null; // IP stored as outs (17 = 5.2 IP); format with formatInningsPitched
  bf: number | null;
  h: number | null;
  r: number | null;
  er: number | null;
  bb: number | null;
  so: number | null;
  hr: number | null;
  pitches: number | null;
  decision: string | null; // 'W' | 'L' | 'S' | 'H' | null (this pitcher's decision)
};

export async function getPitcherGameLog(
  mlbamId: number,
  season: number,
): Promise<PitcherGameRow[]> {
  return sql<PitcherGameRow[]>`
    select
      g.game_pk::int as game_pk,
      to_char(g.game_date, 'YYYY-MM-DD') as game_date,
      g.opponent_name,
      g.is_home,
      g.result,
      g.jays_score,
      g.opp_score,
      s.outs_recorded,
      s.bf,
      s.p_h as h,
      s.p_r as r,
      s.er,
      s.p_bb as bb,
      s.p_so as so,
      s.p_hr as hr,
      s.pitches,
      s.decision
    from web_player_game_stats s
    join web_games g on g.game_pk = s.game_pk
    where s.mlbam_id = ${mlbamId}
      and s.stat_group = 'pitching'
      and g.season = ${season}
      and g.is_final = true
    order by g.game_date, g.game_number
  `;
}
