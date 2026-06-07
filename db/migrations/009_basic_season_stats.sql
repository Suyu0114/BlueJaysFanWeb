-- P9: basic batting stats per season (slash line + counting), for the
-- year-by-year table on the player overview page.
-- Source columns from the FanGraphs Dashboard/Standard export, ingested by
-- pull_season_stats.py (BASIC_STAT_COLS). Like the war_* block these are
-- OPTIONAL: an older CSV without them just leaves NULLs (the upsert coalesces).
-- All numeric (incl. counting stats) to match 008's precedent and avoid the
-- psycopg float->int adaptation pitfall (_num() returns float).
-- Apply via:  python etl/apply_migration.py db/migrations/009_basic_season_stats.sql

alter table web_player_season_stats
  add column if not exists avg numeric,  -- batting average (H/AB)
  add column if not exists obp numeric,  -- on-base percentage
  add column if not exists slg numeric,  -- slugging (OPS = obp + slg, already stored)
  add column if not exists hr  numeric,  -- home runs
  add column if not exists rbi numeric,  -- runs batted in
  add column if not exists sb  numeric,  -- stolen bases
  add column if not exists pa  numeric;  -- plate appearances (volume context)
