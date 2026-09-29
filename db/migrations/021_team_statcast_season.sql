-- P13 N0: Baseball Savant team leaderboards for ALL 30 clubs (etl/pull_team_statcast.py).
-- Source (CSV, need a browser User-Agent, UTF-8 BOM):
--   leaderboard/statcast?type={batter|pitcher}-team&year=Y&min=q             -> contact quality
--   leaderboard/expected_statistics?type={batter|pitcher}-team&year=Y&min=q  -> wOBA / xwOBA ...
--   leaderboard/outs_above_average?type=Fielding_Team&startYear=Y&endYear=Y  -> oaa
-- Grain: ONE ROW PER CLUB PER SEASON, regular season. bat_* = the club's hitters,
--   pit_* = contact / expected stats ALLOWED by the club's pitchers.
-- Team mapping: Savant abbreviations are RETROACTIVE ('ATH' for the 2022
--   Athletics, whose MLB abbreviation was 'OAK') -> rows are mapped by short name
--   to MLB /teams teamName; the OAA CSV already carries numeric MLB ids.
-- Percentages are stored as FRACTIONS (Savant's 8.5 -> 0.085), like
--   web_player_season_stats.k_pct. Averages (avg_ev, woba ...) as Savant sends them.
-- Absent value = NULL, never 0.
-- Apply via:  python etl/apply_migration.py db/migrations/021_team_statcast_season.sql

create table if not exists web_team_statcast_season (
  season              int     not null,
  team_id             int     not null,    -- MLB Stats API team id (141 = Jays)

  -- hitters: leaderboard/statcast (batter-team)
  bat_bbe             int,                 -- 'attempts' = batted-ball events
  bat_barrels         int,
  bat_ev95plus        int,                 -- batted balls >= 95 mph
  bat_brl_pct         numeric,             -- barrels / BBE
  bat_brl_pa          numeric,             -- barrels / PA
  bat_hard_hit_pct    numeric,             -- ev95plus / BBE
  bat_sweet_spot_pct  numeric,             -- launch angle 8-32 deg / BBE
  bat_avg_ev          numeric,             -- mph
  bat_avg_la          numeric,             -- degrees
  -- hitters: leaderboard/expected_statistics (batter-team)
  bat_xpa             int,                 -- Savant's PA for the expected stats
  bat_ba              numeric,
  bat_xba             numeric,
  bat_slg             numeric,
  bat_xslg            numeric,
  bat_woba            numeric,
  bat_xwoba           numeric,

  -- pitchers (contact allowed): same columns
  pit_bbe             int,
  pit_barrels         int,
  pit_ev95plus        int,
  pit_brl_pct         numeric,
  pit_brl_pa          numeric,
  pit_hard_hit_pct    numeric,
  pit_sweet_spot_pct  numeric,
  pit_avg_ev          numeric,
  pit_avg_la          numeric,
  pit_xpa             int,
  pit_ba              numeric,
  pit_xba             numeric,
  pit_slg             numeric,
  pit_xslg            numeric,
  pit_woba            numeric,
  pit_xwoba           numeric,

  -- defense: leaderboard/outs_above_average (Fielding_Team)
  oaa                 int,

  updated_at          timestamptz not null default now(),
  primary key (season, team_id)
);

comment on table web_team_statcast_season is
  'P13: Baseball Savant team leaderboards (contact quality, expected stats, OAA) for all 30 clubs per season; %s as fractions. Rates / MLB averages / ranks live in the 022 views.';
