-- P12 M6 (D6): Savant season-level batting quality -- expected stats and
-- barrels -- as Savant publishes them. Joined on player_id from
-- statcast_batter_expected_stats (pa, bip, ba/xba, slg/xslg, woba/xwoba) and
-- statcast_batter_exitvelo_barrels (barrels, Barrel%, sweet-spot%, EV95%, EV).
-- Written by etl/pull_savant_leaderboards.py (same player filter as 016).
--
-- MLB-wide season values (every club). Official Barrel% lives ONLY here -- it
-- is never computed locally (P12 D5). Units as Savant sends them:
--   ba / xba / slg / xslg / woba / xwoba : decimals (.305)
--   brl_percent / brl_pa / sweet_spot_pct / ev95_pct : PERCENT units (6.9 = 6.9%),
--     unlike the raw fractions (0.069) in web_player_season_stats
--   avg_ev / max_ev : mph
-- Apply via:  python etl/apply_migration.py db/migrations/017_savant_season.sql

create table if not exists web_savant_season (
  mlbam_id        bigint  not null references web_players(mlbam_id),
  season          int     not null,
  pa              int,
  bip             int,
  ba              numeric,
  xba             numeric,
  slg             numeric,
  xslg            numeric,
  woba            numeric,
  xwoba           numeric,
  barrels         int,
  brl_percent     numeric,   -- barrels per batted ball, percent units
  brl_pa          numeric,   -- barrels per PA, percent units
  sweet_spot_pct  numeric,   -- launch angle 8-32 deg, percent units
  ev95_pct        numeric,   -- hard-hit (95+ mph), percent units
  avg_ev          numeric,
  max_ev          numeric,
  updated_at      timestamptz not null default now(),
  primary key (mlbam_id, season)
);
