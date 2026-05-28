-- P0: initial schema for Blue Jays fan web
-- NOTE: this Supabase project is SHARED with other projects, so every table
-- in this app is prefixed with `web_` to avoid name collisions.
-- Apply via:  psql "$DATABASE_URL" -f db/migrations/001_initial_schema.sql
-- or paste into Supabase Studio → SQL editor.

create table if not exists web_players (
  mlbam_id     bigint primary key,
  name         text not null,
  position     text,
  bats         char(1),
  throws       char(1),
  is_active_26 boolean default false,
  headshot_url text,
  birthdate    date
);

create table if not exists web_statcast_events (
  id            bigserial primary key,
  game_pk       bigint not null,
  game_date     date   not null,
  game_type     char(1),
  batter_id     bigint not null references web_players(mlbam_id),
  pitcher_id    bigint not null references web_players(mlbam_id),
  at_bat_number int    not null,
  pitch_number  int    not null,
  event         text,                  -- at-bat outcome (single/double/home_run/...)
  description   text,                  -- per-pitch (called_strike/ball/foul/...)
  pitch_type    text,
  release_speed numeric,
  spin_rate     numeric,
  plate_x       numeric,
  plate_z       numeric,
  hc_x_feet     numeric,               -- ETL pre-transformed from raw hc_x
  hc_y_feet     numeric,
  launch_speed  numeric,
  launch_angle  numeric,
  stand         char(1),
  p_throws      char(1),
  zone          int,
  unique (game_pk, batter_id, pitcher_id, at_bat_number, pitch_number)
);

create index if not exists web_statcast_events_batter_date_idx
  on web_statcast_events (batter_id, game_date);
create index if not exists web_statcast_events_pitcher_date_idx
  on web_statcast_events (pitcher_id, game_date);

create table if not exists web_player_season_stats (
  mlbam_id   bigint not null references web_players(mlbam_id),
  season     int    not null,
  ops        numeric,
  wrc_plus   numeric,
  war        numeric,
  era        numeric,
  fip        numeric,
  k_per_9    numeric,
  updated_at timestamptz default now(),
  primary key (mlbam_id, season)
);
