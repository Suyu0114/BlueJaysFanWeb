-- P7: FanGraphs WAR value components (batter-only) + season WPA.
-- Source columns from the FanGraphs "Value" preset, ingested by pull_season_stats.py.
-- Apply via:  python etl/apply_migration.py db/migrations/008_war_components.sql

alter table web_player_season_stats
  add column if not exists war_batting     numeric,  -- Bat  (wRAA, runs above average)
  add column if not exists war_baserunning numeric,  -- BsR
  add column if not exists war_fielding    numeric,  -- Fld  (pure fielding, excl. positional)
  add column if not exists war_positional  numeric,  -- Pos
  add column if not exists war_league      numeric,  -- Lg
  add column if not exists war_replacement numeric,  -- Rep
  add column if not exists rar             numeric,  -- = Bat+BsR+Fld+Pos+Lg+Rep (checksum)
  add column if not exists wpa             numeric;  -- season WPA
