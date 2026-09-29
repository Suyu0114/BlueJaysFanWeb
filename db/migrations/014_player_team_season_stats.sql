-- P12 M0 (D13/D14): full-MLB season lines, one row per club a player appeared
-- for, plus the season total. Cohort = the 2026 fullSeason roster (traded in
-- AND out), seasons 2024-2026 -- including seasons spent entirely with other
-- clubs. Source: MLB Stats API /people/{id}/stats?stats=season,sabermetrics
-- (per-club splits + a team-less total), written by etl/pull_player_splits.py.
--
-- team_id = 0 is the MLB SEASON TOTAL and is always written (copied from the
-- only split for one-club seasons), so "full season" readers never sum.
-- web_player_season_stats is unchanged and stays Jays-only; the team_id = 141
-- rows here must equal it.
--
-- Stat columns mirror web_player_season_stats (same names, same units, same
-- mapping via etl/season_line.py) minus wpa, plus:
--   g                 games (distinct gamePks from the gameLog)
--   first_game / last_game  first / last game date with that club (orders
--                     "TOR -> HOU"); for team_id = 0 the season's first / last
--   bat_k_pct / bat_bb_pct  batter K% / BB% (SO / PA, BB / PA), raw fractions
-- Apply via:  python etl/apply_migration.py db/migrations/014_player_team_season_stats.sql

create table if not exists web_player_team_season_stats (
  mlbam_id        bigint  not null references web_players(mlbam_id),
  season          int     not null,
  team_id         int     not null,   -- MLB club id; 0 = season total
  g               numeric,
  first_game      date,
  last_game       date,
  -- batting line (web_player_season_stats 001/008/009)
  ops             numeric,
  wrc_plus        numeric,
  war             numeric,            -- batting + pitching WAR (two-way sum)
  war_batting     numeric,
  war_baserunning numeric,
  war_fielding    numeric,            -- = rar - other five (catcher framing, see pull_season_stats)
  war_positional  numeric,
  war_league      numeric,
  war_replacement numeric,
  rar             numeric,
  avg             numeric,
  obp             numeric,
  slg             numeric,
  hr              numeric,
  rbi             numeric,
  sb              numeric,
  pa              numeric,
  bat_k_pct       numeric,
  bat_bb_pct      numeric,
  -- pitching line (001/010)
  era             numeric,
  fip             numeric,
  k_per_9         numeric,
  w               numeric,
  l               numeric,
  sv              numeric,
  gs              numeric,
  ip              numeric,            -- baseball notation: 170.1 = 170 1/3. DISPLAY ONLY
  whip            numeric,
  k_pct           numeric,            -- pitcher SO / BF
  bb_pct          numeric,            -- pitcher BB / BF
  updated_at      timestamptz not null default now(),
  primary key (mlbam_id, season, team_id)
);

create index if not exists idx_web_player_team_season_stats_season
  on web_player_team_season_stats (season, team_id);
