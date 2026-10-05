-- Post-P13: each Blue Jay's regular-season batting line split by the position
-- he was playing when he came to the plate. Jays-only, like
-- web_player_season_stats. Source: MLB Stats API
-- /stats?stats=statSplits&group=hitting&teamId=141&sitCodes=p1..p9,pD,pH
-- (one call per season), written by etl/pull_position_splits.py.
--
-- Why: web_players.position is the player's CURRENT MLB primary position (bio)
-- -- one value per player, overwritten by every ETL run (Bichette 2025 read
-- 3B after he moved to the Mets). The per-season position and anything "by
-- position" come from this table instead.
--
-- position: 'C','1B','2B','3B','SS','LF','CF','RF','DH', plus
--   'PH' = pinch-hitter, 'P' = a position player batting while on the mound.
-- Invariant: per (mlbam_id, season), sum(pa) = web_player_season_stats.pa.
-- Counts only; rates (OPS by position) are derived from summed counts.
-- Apply via:  python etl/apply_migration.py db/migrations/023_player_position_splits.sql

create table if not exists web_player_position_splits (
  mlbam_id    bigint not null references web_players(mlbam_id),
  season      int    not null,
  position    text   not null,
  g           int,
  pa          int,
  ab          int,
  h           int,
  doubles     int,
  triples     int,
  hr          int,
  rbi         int,
  bb          int,
  so          int,
  hbp         int,
  sf          int,
  tb          int,
  updated_at  timestamptz not null default now(),
  primary key (mlbam_id, season, position)
);

create index if not exists idx_web_player_position_splits_season
  on web_player_position_splits (season);
