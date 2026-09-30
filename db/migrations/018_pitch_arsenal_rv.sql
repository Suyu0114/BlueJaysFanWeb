-- P12 M6 (D6): Savant pitch-arsenal leaderboard -- per pitch type run value
-- and outcomes, as Savant publishes them (statcast_pitcher_arsenal_stats).
-- Written by etl/pull_savant_leaderboards.py (same player filter as 016).
--
-- MLB-wide season totals (a pitcher traded mid-season has ONE row per pitch
-- type covering both clubs). Run value is from the PITCHER'S point of view:
-- POSITIVE = runs saved = good (verified 2026-09-30: across 1,253 pitch rows
-- of the 2025 leaderboard, corr(run_value_per_100, wOBA) = -0.78; the top row
-- was Skubal's CH at +25 / .176 wOBA). Units as Savant sends them:
--   usage / whiff_pct / put_away / hard_hit_pct : PERCENT units (50.6 = 50.6%)
--   woba / xwoba : decimals
-- Apply via:  python etl/apply_migration.py db/migrations/018_pitch_arsenal_rv.sql

create table if not exists web_pitch_arsenal_rv (
  mlbam_id           bigint  not null references web_players(mlbam_id),
  season             int     not null,
  pitch_type         text    not null,   -- Savant code (FF, SL, ST, …) = web_statcast_events.pitch_type
  pitches            int,
  usage              numeric,
  run_value          numeric,            -- total runs saved, pitcher's view (positive = good)
  run_value_per_100  numeric,            -- per 100 pitches, pitcher's view (positive = good)
  whiff_pct          numeric,
  put_away           numeric,
  woba               numeric,
  xwoba              numeric,
  hard_hit_pct       numeric,
  updated_at         timestamptz not null default now(),
  primary key (mlbam_id, season, pitch_type)
);
