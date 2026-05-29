-- P4: per-player Statcast Fielding Run Value (FRV) and Outs Above Average (OAA).
-- Source: pybaseball.statcast_outs_above_average  (Baseball Savant scrape).
-- Apply via:  python etl/apply_migration.py db/migrations/002_fielding_frv.sql

create table if not exists web_fielding_frv (
  mlbam_id              bigint not null references web_players(mlbam_id),
  season                int    not null,
  position              text   not null,   -- "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"
  frv                   int,               -- Fielding Run Value (Savant: fielding_runs_prevented)
  oaa                   int,               -- Outs Above Average
  oaa_in_front          int,
  oaa_lateral_toward_3b int,
  oaa_lateral_toward_1b int,
  oaa_behind            int,
  oaa_vs_rhh            int,
  oaa_vs_lhh            int,
  updated_at            timestamptz default now(),
  primary key (mlbam_id, season, position)
);

create index if not exists web_fielding_frv_player_idx
  on web_fielding_frv (mlbam_id, season);
