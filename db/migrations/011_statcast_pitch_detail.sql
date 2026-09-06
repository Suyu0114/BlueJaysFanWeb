-- P10: per-pitch detail for the movement chart, xwOBA-on-contact, and future
-- count-based modules. Populated by the 2024-2026 re-backfill; older rows stay
-- NULL until re-pulled. NOTE: `strikes` here is the count BEFORE the pitch
-- (0-2) - unrelated to web_player_game_stats.strikes (strikes thrown in a game).
alter table web_statcast_events
  add column if not exists pfx_x             numeric,  -- horizontal movement, FEET, catcher's perspective (raw Savant)
  add column if not exists pfx_z             numeric,  -- vertical movement vs a spinless pitch, FEET
  add column if not exists release_extension numeric,  -- feet toward home at release
  add column if not exists estimated_woba    numeric,  -- estimated_woba_using_speedangle; batted balls only, NULL otherwise
  add column if not exists balls             int,      -- count before the pitch (0-3)
  add column if not exists strikes           int;      -- count before the pitch (0-2)
