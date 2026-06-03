-- P7: Blue Jays season schedule + results (calendar source).
-- Source: MLB Stats API /api/v1/schedule?sportId=1&teamId=141&season=YEAR
-- Doubleheaders => two rows (distinct game_pk; same game_date, different game_number).
-- Apply via:  python etl/apply_migration.py db/migrations/006_games.sql

create table if not exists web_games (
  game_pk         bigint  primary key,
  season          int     not null,
  game_date       date    not null,        -- MLB officialDate (ET standings date; late
                                            --   West-Coast games stay on the correct day)
  first_pitch_utc timestamptz,             -- gameDate (UTC); convert to ET for display
  game_number     int     not null default 1,   -- 1 / 2 for doubleheaders
  doubleheader    char(1) not null default 'N', -- 'N' | 'Y' | 'S'
  is_home         boolean not null,
  opponent_id     int     not null,
  opponent_name   text    not null,        -- English, e.g. "New York Yankees"
  jays_score      int,                     -- null until scored
  opp_score       int,
  status          text    not null,        -- detailedState: Scheduled / In Progress /
                                            --   Final / Postponed / Suspended / ...
  is_final        boolean not null default false,
  result          char(1),                 -- 'W' | 'L' | null (derived on final)
  venue           text,
  updated_at      timestamptz not null default now()
);

create index if not exists idx_web_games_date   on web_games (game_date);
create index if not exists idx_web_games_season  on web_games (season);
