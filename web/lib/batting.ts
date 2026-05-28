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
      to_char(game_date, 'YYYY-MM-DD') as game_date
    from web_statcast_events
    where batter_id = ${batterId}
      and game_type = 'R'
      and hc_x_feet is not null
    order by game_date
  `;
}
