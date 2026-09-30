-- P12 M6 (D6): Baseball Savant percentile ranks, stored exactly as Savant
-- publishes them (0-100, 100 = best for every metric -- Savant already flips
-- K% / BB% / Chase% etc. so that higher is better for the player's role).
-- Source: pybaseball statcast_batter_percentile_ranks / statcast_pitcher_
-- percentile_ranks (Savant leaderboard, unaffected by the FanGraphs 403).
-- Written by etl/pull_savant_leaderboards.py for players on that season's Jays
-- roster plus the P12 D13 cohort's other-club seasons.
--
-- Percentiles are within-season, so they sidestep the 2026 zone-definition
-- change (DATA_MODEL Known gaps #8). They are MLB-wide season values (every
-- club), not Jays-only. An ABSENT row means "not qualified" -- never read it
-- as 0. A metric that doesn't apply to the role (sprint_speed for a pitcher)
-- is NULL.
-- Apply via:  python etl/apply_migration.py db/migrations/016_savant_percentiles.sql

create table if not exists web_savant_percentiles (
  mlbam_id          bigint   not null references web_players(mlbam_id),
  season            int      not null,
  role              text     not null check (role in ('batter', 'pitcher')),
  xwoba             smallint,
  xba               smallint,
  xslg              smallint,
  brl_percent       smallint,   -- Barrel%
  exit_velocity     smallint,   -- average exit velocity (allowed, for pitchers)
  hard_hit_percent  smallint,
  k_percent         smallint,
  bb_percent        smallint,
  whiff_percent     smallint,
  chase_percent     smallint,
  sprint_speed      smallint,   -- batters
  oaa               smallint,   -- batters (fielding)
  arm_strength      smallint,   -- batters (fielding)
  bat_speed         smallint,   -- batters
  squared_up_rate   smallint,   -- batters
  xera              smallint,   -- pitchers
  fb_velocity       smallint,   -- pitchers
  fb_spin           smallint,   -- pitchers
  curve_spin        smallint,   -- pitchers
  updated_at        timestamptz not null default now(),
  primary key (mlbam_id, season, role)
);
