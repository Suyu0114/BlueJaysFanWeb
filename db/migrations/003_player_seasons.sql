-- P6: per-season participation + BaZi v2 prep (place of birth).
-- Apply via:  psql "$DATABASE_URL" -f db/migrations/003_player_seasons.sql
-- or paste into Supabase Studio -> SQL editor.

-- Per-season participation. Lets us (a) know which years to query during the
-- 2024-2026 backfill / nightly refresh and (b) conditionally render the
-- Batting / Pitching / Fielding subpages on the player overview.
create table if not exists web_player_seasons (
  mlbam_id            bigint  not null references web_players(mlbam_id) on delete cascade,
  season              int     not null,
  team_id             int     not null default 141,            -- 141 = Toronto Blue Jays
  appeared_as_batter  boolean not null default false,
  appeared_as_pitcher boolean not null default false,
  is_active_26        boolean not null default false,          -- on 26-man at any point this season
  updated_at          timestamptz not null default now(),
  primary key (mlbam_id, season, team_id)
);

create index if not exists idx_web_player_seasons_season
  on web_player_seasons (season);

-- BaZi v2 prep. Birthdate is already in web_players; only birth LOCATION is
-- missing. Adding it now (rather than in v2) means we don't have to re-run the
-- entire roster ETL against MLB Stats API later.
-- v2 BaZi: time-of-birth is NOT exposed by MLB Stats API; fall back to
-- noon-local at birth_city or accept a degraded reading.
alter table web_players
  add column if not exists birth_city            text,
  add column if not exists birth_state_province  text,
  add column if not exists birth_country         text;
