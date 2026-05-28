import { sql } from "./db";

export type RosterPlayer = {
  mlbam_id: number;
  name: string;
  position: string | null;
  bats: string | null;
  throws: string | null;
  headshot_url: string | null;
};

export async function getRoster(): Promise<RosterPlayer[]> {
  return sql<RosterPlayer[]>`
    select mlbam_id, name, position, bats, throws, headshot_url
    from web_players
    where is_active_26 = true
    order by position nulls last, name
  `;
}
