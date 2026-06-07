import { sql } from "./db";

// P9: per-game batting line for one player in one season, joined to the
// schedule for date / opponent / result. Drives Recent Form, the last-10 Game
// Log, and the rolling-OPS sparkline on the overview page (one fetch, derived
// three ways in lib/batting-form.ts). Reuses the join pattern from
// lib/games.ts::getGameBoxscore but scoped to a single player across a season.
//
// Current-season only by nature: web_player_game_stats is maintained by the
// nightly box-score ingest for the live season; 2024/2025 are not backfilled.
export type BatterGameRow = {
  game_pk: number;
  game_date: string; // 'YYYY-MM-DD' (web_games.game_date, ET standings date)
  opponent_name: string;
  is_home: boolean;
  result: string | null; // 'W' | 'L' | null
  jays_score: number | null;
  opp_score: number | null;
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

export async function getBatterGameLog(
  mlbamId: number,
  season: number,
): Promise<BatterGameRow[]> {
  return sql<BatterGameRow[]>`
    select
      g.game_pk::int as game_pk,
      to_char(g.game_date, 'YYYY-MM-DD') as game_date,
      g.opponent_name,
      g.is_home,
      g.result,
      g.jays_score,
      g.opp_score,
      s.pa, s.ab, s.r, s.h, s.doubles, s.triples, s.hr, s.rbi, s.bb, s.so, s.sb, s.hbp
    from web_player_game_stats s
    join web_games g on g.game_pk = s.game_pk
    where s.mlbam_id = ${mlbamId}
      and s.stat_group = 'batting'
      and g.season = ${season}
      and g.is_final = true
    order by g.game_date, g.game_number
  `;
}
