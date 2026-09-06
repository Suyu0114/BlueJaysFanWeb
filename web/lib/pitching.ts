import { sql } from "./db";
import type { PitchEvent } from "@/lib/pitch-arsenal";

// Fetches every regular-season pitch for one pitcher, all seasons. Consumers
// that read plate_x/plate_z must scope to a single plate_alignment (see
// docs/DATA_MODEL.md); release-frame fields (velo/spin/pfx/description) are
// alignment-agnostic. pfx/xwOBA are null on rows the P10 re-backfill hasn't
// reached yet — aggregations skip nulls.
export async function getPitches(pitcherId: number): Promise<PitchEvent[]> {
  return sql<PitchEvent[]>`
    select
      id::text as id,
      pitch_type,
      release_speed::float8 as release_speed,
      spin_rate::float8 as spin_rate,
      plate_x::float8 as plate_x,
      plate_z::float8 as plate_z,
      stand,
      plate_alignment,
      to_char(game_date, 'YYYY-MM-DD') as game_date,
      description,
      round(pfx_x, 3)::float8 as pfx_x,
      round(pfx_z, 3)::float8 as pfx_z,
      round(estimated_woba, 3)::float8 as estimated_woba
    from web_statcast_events
    where pitcher_id = ${pitcherId}
      and game_type = 'R'
    order by game_date
  `;
}
