import { sql } from "./db";

// The position a Blue Jay played, from web_player_position_splits — never
// web_players.position, which is his CURRENT MLB primary position (one value per
// player; Bichette 2025 read 3B after he moved to the Mets). One rule for both
// fragments: the position he batted at most for the Jays (PH / P excluded; ties
// -> more games, then position). Pitchers and players without split rows get
// no row, so callers fall back to web_players.position (`P` for pitchers).

/** (mlbam_id, season, position) for each player-season in `seasons`. Season page readers. */
export const seasonPosition = (seasons: number[]) => sql`
  select distinct on (mlbam_id, season) mlbam_id, season, position
  from web_player_position_splits
  where season = any(${seasons}) and position not in ('PH', 'P')
  order by mlbam_id, season, pa desc, g desc, position
`;

/** (mlbam_id, season, position) for each player's LAST season as a Jay. Player header + roster cards. */
export const lastJaysPosition = () => sql`
  select distinct on (mlbam_id) mlbam_id, season, position
  from web_player_position_splits
  where position not in ('PH', 'P')
  order by mlbam_id, season desc, pa desc, g desc, position
`;
