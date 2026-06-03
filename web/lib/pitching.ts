import { sql } from "./db";
import type { PitchEvent } from "@/components/charts/PitchDistribution";

export async function getPitches(pitcherId: number): Promise<PitchEvent[]> {
  return sql<PitchEvent[]>`
    select
      id::text as id,
      pitch_type,
      release_speed::float8 as release_speed,
      plate_x::float8 as plate_x,
      plate_z::float8 as plate_z,
      stand,
      plate_alignment,
      to_char(game_date, 'YYYY-MM-DD') as game_date
    from web_statcast_events
    where pitcher_id = ${pitcherId}
      and game_type = 'R'
    order by game_date
  `;
}
