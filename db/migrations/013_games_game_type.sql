-- P12 M0: regular season vs postseason on web_games.
-- 2025 holds 162 regular-season + 18 postseason games; without this column the
-- regular-season record can't be separated. Values are MLB's gameType:
-- 'R' regular season, 'F' wild card, 'D' division series, 'L' LCS, 'W' World
-- Series (pull_schedule.py keeps only these five).
-- Apply via:  python etl/apply_migration.py db/migrations/013_games_game_type.sql

alter table web_games
  add column if not exists game_type char(1);

create index if not exists idx_web_games_season_type
  on web_games (season, game_type);
