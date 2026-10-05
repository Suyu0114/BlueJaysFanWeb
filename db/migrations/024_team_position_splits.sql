-- Post-P13: every club's regular-season batting line split by the position its
-- batters were playing when they came to the plate -- all 30 clubs, 2022-2026.
-- The by-position MLB average and the Jays' rank at each position need all 30.
-- Source: MLB Stats API, ONE call per season (etl/pull_team_position_splits.py)
--   /teams/stats?stats=statSplits&group=hitting&gameType=R&sportIds=1
--               &sitCodes=p1,p2,...,p9,pD,pH&limit=1000
--   `limit` is required: the default page is 50 rows, which silently dropped
--   clubs (2025: 29 clubs on 4 codes, no error). The writer raises when any of
--   p2..pH comes back with fewer than 30 clubs.
-- Grain: ONE ROW PER (season, club, position). Same columns as 023
--   (web_player_position_splits) with team_id in place of mlbam_id.
-- position: 'C','1B','2B','3B','SS','LF','CF','RF','DH', plus
--   'PH' = pinch-hitter, 'P' = a position player batting while on the mound
--   (p1 -- not every club has one, ~20 rows a season).
-- Invariants (checked by the writer, logged, never fixed up):
--   * Jays (141) rows = web_player_position_splits summed per position, exactly.
--   * per club, sum(pa) = web_team_season_stats.bat_pa, short by 1-3 PA for
--     8-9 clubs a season upstream (pX / pR are empty) -- logged as INFO.
-- Counts only: OPS, the MLB row and ranks live in the 025 view.
-- Apply via:  python etl/apply_migration.py db/migrations/024_team_position_splits.sql

create table if not exists web_team_position_splits (
  season      int    not null,
  team_id     int    not null,   -- MLB Stats API team id (141 = Jays)
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
  primary key (season, team_id, position)
);
