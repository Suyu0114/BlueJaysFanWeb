import { sql } from "./db";
import type { BattedBallEvent } from "@/components/charts/SprayChart";

// Cast numerics to float8 so postgres.js returns JS numbers (not strings),
// and format the date in SQL to avoid timezone drift.
export async function getBattedBalls(
  batterId: number,
): Promise<BattedBallEvent[]> {
  return sql<BattedBallEvent[]>`
    select
      id::text as id,
      hc_x_feet::float8 as x_feet,
      hc_y_feet::float8 as y_feet,
      launch_speed::float8 as launch_speed,
      launch_angle::float8 as launch_angle,
      event,
      pitch_type,
      p_throws,
      to_char(game_date, 'YYYY-MM-DD') as game_date,
      -- P12: "as a Blue Jay" = in that game's Jays box score, not merely a
      -- Jays game (a traded player can face Toronto). DATA_MODEL invariant 7.
      exists (
        select 1 from web_player_game_stats s
        where s.game_pk = e.game_pk and s.mlbam_id = e.batter_id
      ) as as_jay
    from web_statcast_events e
    where batter_id = ${batterId}
      and game_type = 'R'
      and hc_x_feet is not null
    order by game_date
  `;
}
