-- P12 M6: league-average batting / pitching context per season, for the "is
-- .695 OPS bad?" question. Source: MLB Stats API /teams/stats (all 30 clubs,
-- regular season), written by etl/pull_league_averages.py.
--
-- Rates are computed from the SUMMED team counting stats -- never by averaging
-- the 30 teams' rates (a team with more PA must weigh more). P13 checks the
-- MLB row against exactly this. League membership per season comes from
-- web_standings.league_id (103 = AL, 104 = NL).
--   obp  = (H + BB + HBP) / (AB + BB + HBP + SF)
--   slg  = TB / AB ;  ops = obp + slg
--   era  = 9 * ER / (outs / 3)          (pitching side)
--   k_pct / bb_pct = SO / PA, BB / PA   (batting side; raw fractions, like
--                                        web_player_season_stats.k_pct)
-- Apply via:  python etl/apply_migration.py db/migrations/019_league_season.sql

create table if not exists web_league_season (
  season      int      not null,
  league      text     not null check (league in ('AL', 'NL', 'MLB')),
  teams       smallint not null,   -- clubs aggregated (15 / 15 / 30) -- a sanity check
  pa          int,
  obp         numeric,
  slg         numeric,
  ops         numeric,
  era         numeric,
  k_pct       numeric,
  bb_pct      numeric,
  updated_at  timestamptz not null default now(),
  primary key (season, league)
);
