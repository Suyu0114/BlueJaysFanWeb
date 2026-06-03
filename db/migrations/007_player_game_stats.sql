-- P7: per-game box score lines for Blue Jays players.
-- Source: /api/v1/game/{game_pk}/boxscore (teams.{home,away}.players[].stats)
-- One row per (game, player, stat_group); a two-way player => two rows.
-- FK mlbam_id => only players already in web_players can be stored, so the
-- boxscore ingest MUST insert any unknown Jays player (call-up / trade) into
-- web_players first (fetch bio via mlb_api), or run roster ingest before it.
-- Apply via:  python etl/apply_migration.py db/migrations/007_player_game_stats.sql

create table if not exists web_player_game_stats (
  game_pk       bigint not null references web_games(game_pk) on delete cascade,
  mlbam_id      bigint not null references web_players(mlbam_id),
  stat_group    text   not null,           -- 'batting' | 'pitching'

  -- hitting (null on pitching rows)
  pa            int,
  ab            int,
  r             int,
  h             int,
  doubles       int,
  triples       int,
  hr            int,
  rbi           int,
  bb            int,
  so            int,
  sb            int,
  hbp           int,

  -- pitching (null on hitting rows; p_ prefix avoids collision with hitting cols)
  outs_recorded int,                        -- store OUTS, never "5.2" (5.2 != 5 2/3 innings)
  bf            int,                         -- batters faced
  p_h           int,
  p_r           int,
  er            int,
  p_bb          int,
  p_so          int,
  p_hr          int,
  pitches       int,
  strikes       int,
  decision      char(1),                    -- 'W' | 'L' | 'S' | 'H' | null

  updated_at    timestamptz not null default now(),
  primary key (game_pk, mlbam_id, stat_group)
);

create index if not exists idx_web_pgs_player on web_player_game_stats (mlbam_id);
create index if not exists idx_web_pgs_game   on web_player_game_stats (game_pk);
