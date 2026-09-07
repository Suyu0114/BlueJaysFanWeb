-- P11: MLB standings snapshot (division tables, wild card race, home module).
-- Source: MLB Stats API
--   /api/v1/standings?leagueId=103,104&season=YEAR&standingsTypes=regularSeason&hydrate=team
-- Grain: ONE ROW PER TEAM PER SEASON -- a live snapshot, overwritten nightly, no
--   date dimension (locked P11 D2). 30 rows/season. History -> future migration.
-- GOTCHA: games_back / wc_games_back / *_number are TEXT on purpose (locked D3).
--   MLB returns display strings with sentinels: '-' (is the reference), '+9.5'
--   (ahead of the wild card cut line), 'E' (eliminated). Never cast them; all
--   ordering uses the *_rank columns.
-- Apply via:  python etl/apply_migration.py db/migrations/012_standings.sql

create table if not exists web_standings (
  season                int     not null,
  team_id               int     not null,      -- MLB Stats API team id (141 = Jays)
  team_name             text    not null,      -- English, e.g. "Toronto Blue Jays"
  team_abbrev           text    not null,      -- e.g. "TOR"
  league_id             int     not null,      -- 103 = AL, 104 = NL
  division_id           int     not null,      -- 200 ALW / 201 ALE / 202 ALC
                                               --   203 NLW / 204 NLE / 205 NLC  <- NL pair reversed
  division_name         text    not null,      -- English, e.g. "American League East"

  games_played          int,
  w                     int     not null,
  l                     int     not null,
  pct                   numeric,               -- winningPercentage parsed (.599); a real quantity

  division_rank         int,
  league_rank           int,
  wild_card_rank        int,                   -- NULL for division leaders (field is ABSENT upstream)

  games_back            text,                  -- '-' | '4.0'            (see GOTCHA)
  wc_games_back         text,                  -- '-' | '+9.5' | '3.0'   (see GOTCHA)
  streak_code           text,                  -- 'W2' | 'L3'

  l10_w                 int,
  l10_l                 int,
  home_w                int,
  home_l                int,
  away_w                int,
  away_l                int,
  x_w                   int,                   -- expectedRecords type='xWinLoss'
  x_l                   int,

  runs_scored           int,
  runs_allowed          int,
  run_diff              int,

  division_leader       boolean not null default false,
  division_champ        boolean not null default false,
  wild_card_leader      boolean,
  clinched              boolean not null default false,
  has_wildcard          boolean,
  elimination_number    text,                  -- '-' | '7' | 'E'        (see GOTCHA)
  wc_elimination_number text,
  magic_number          text,                  -- '-' | '17' | null

  last_updated          timestamptz,           -- the API's own lastUpdated
  updated_at            timestamptz not null default now(),
  primary key (season, team_id)
);

create index if not exists idx_web_standings_div on web_standings (season, division_id, division_rank);
create index if not exists idx_web_standings_wc  on web_standings (season, league_id, wild_card_rank);
