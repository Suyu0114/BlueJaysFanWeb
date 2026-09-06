-- P10: pitcher season line for KPI cards + year-by-year table. OPTIONAL columns
-- (like 009's basic batting block): absent CSV header -> warn + NULL.
-- All numeric per 008/009 precedent (dodges the psycopg float->int pitfall).
alter table web_player_season_stats
  add column if not exists w      numeric,  -- wins
  add column if not exists l      numeric,  -- losses
  add column if not exists sv     numeric,  -- saves
  add column if not exists gs     numeric,  -- games started (starter/reliever signal)
  add column if not exists ip     numeric,  -- FanGraphs baseball notation: 170.1 = 170 1/3. DISPLAY ONLY - never sum/divide
  add column if not exists whip   numeric,  -- (H+BB)/IP
  add column if not exists k_pct  numeric,  -- strikeout rate, raw fraction (0.245) as exported by FanGraphs
  add column if not exists bb_pct numeric;  -- walk rate, raw fraction
