-- P6: Chadwick Bureau ID register cache.
--
-- pybaseball.batting_stats() / pitching_stats() return FanGraphs IDfg values
-- which we have to map to MLBAM IDs before we can join to web_players. The
-- canonical bridge is the Chadwick Bureau register (~30k rows). Persisting a
-- slim copy means a fresh CI runner doesn't re-download it every night.
--
-- Refreshed on lookup miss by etl/idmap.py.

create table if not exists web_id_map (
  key_mlbam      bigint primary key,
  key_fangraphs  int,
  key_bbref      text,
  name_first     text,
  name_last      text,
  refreshed_at   timestamptz not null default now()
);

create index if not exists idx_web_id_map_fangraphs
  on web_id_map (key_fangraphs);
