import { sql } from "./db";

// "Most recent game" = newest date in web_statcast_events for any active-roster
// Jay. We filter via is_active_26 so an opponent's batter showing up in our
// statcast rows doesn't fool the home module.
export async function getMostRecentGame(): Promise<{
  game_pk: number;
  game_date: string;
} | null> {
  const rows = await sql<{ game_pk: number; game_date: string }[]>`
    select e.game_pk, to_char(e.game_date, 'YYYY-MM-DD') as game_date
    from web_statcast_events e
    join web_players p on (
      (p.mlbam_id = e.batter_id and p.is_active_26)
      or (p.mlbam_id = e.pitcher_id and p.is_active_26)
    )
    order by e.game_date desc, e.game_pk desc
    limit 1
  `;
  return rows[0] ?? null;
}

export type HomeRunHero = {
  mlbam_id: number;
  name: string;
  headshot_url: string | null;
  hr_count: number;
};

export async function getHomeRunHero(gamePk: number): Promise<HomeRunHero | null> {
  const rows = await sql<HomeRunHero[]>`
    select
      e.batter_id::int as mlbam_id,
      p.name,
      p.headshot_url,
      count(*)::int as hr_count
    from web_statcast_events e
    join web_players p on p.mlbam_id = e.batter_id and p.is_active_26
    where e.game_pk = ${gamePk}
      and e.event = 'home_run'
    group by e.batter_id, p.name, p.headshot_url
    order by hr_count desc, p.name
    limit 1
  `;
  return rows[0] ?? null;
}

export type HardestContact = {
  mlbam_id: number;
  name: string;
  headshot_url: string | null;
  launch_speed: number;
};

export async function getHardestContact(
  gamePk: number,
): Promise<HardestContact | null> {
  const rows = await sql<HardestContact[]>`
    select
      e.batter_id::int as mlbam_id,
      p.name,
      p.headshot_url,
      e.launch_speed::float8 as launch_speed
    from web_statcast_events e
    join web_players p on p.mlbam_id = e.batter_id and p.is_active_26
    where e.game_pk = ${gamePk}
      and e.launch_speed is not null
    order by e.launch_speed desc
    limit 1
  `;
  return rows[0] ?? null;
}

export type PitchingLine = {
  mlbam_id: number;
  name: string;
  headshot_url: string | null;
  outs: number;
  ks: number;
  hits: number;
};

// web_statcast_events is one row per PITCH, but the `event` column is only
// populated on the LAST pitch of each plate appearance (NULL on intermediate
// pitches). count(*) where event IN (...) therefore naturally operates at the
// plate-appearance grain because NULLs don't match the IN clause.
export async function getBestPitchingLine(
  gamePk: number,
): Promise<PitchingLine | null> {
  const rows = await sql<PitchingLine[]>`
    select
      e.pitcher_id::int as mlbam_id,
      p.name,
      p.headshot_url,
      sum(
        case when e.event in (
          'strikeout', 'field_out', 'force_out',
          'grounded_into_double_play', 'sac_fly', 'sac_bunt',
          'double_play', 'triple_play'
        ) then 1 else 0 end
      )::int as outs,
      sum(case when e.event = 'strikeout' then 1 else 0 end)::int as ks,
      sum(
        case when e.event in ('single','double','triple','home_run')
             then 1 else 0 end
      )::int as hits
    from web_statcast_events e
    join web_players p on p.mlbam_id = e.pitcher_id and p.is_active_26
    where e.game_pk = ${gamePk}
    group by e.pitcher_id, p.name, p.headshot_url
    having sum(case when e.event is not null then 1 else 0 end) > 0
    order by outs desc, ks desc
    limit 1
  `;
  return rows[0] ?? null;
}

// Innings-pitched conversion now lives in lib/games.ts (single source of
// truth); re-exported here so existing importers (home page) keep working.
export { formatInningsPitched } from "./games";
