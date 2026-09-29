-- P13 N0: team season lines for ALL 30 clubs (ranks + MLB averages need them).
-- Source: MLB Stats API (etl/pull_team_stats.py)
--   /teams/stats?stats=season,seasonAdvanced&group=hitting,pitching&gameType=R   (30 clubs, 1 call)
--   /teams/{id}/stats?stats=statSplits&sitCodes=sp,rp&group=pitching         (per club -- the
--       all-teams variant returned only 50 of 60 splits on 2026-09-29)
--   /stats?stats=season,sabermetrics&teamId={id}&playerPool=ALL               (per club, per group)
-- Grain: ONE ROW PER CLUB PER SEASON, regular season only. Overwritten on refresh.
-- Raw COUNTS only (plus three sabermetric aggregates): every rate, the MLB
--   average and the rank are computed in the 022 views, never stored here.
-- Sabermetric aggregates (P13 T6) -- there is no team-level sabermetrics endpoint,
--   and the league-wide player leaderboard merges a traded player's clubs, so
--   they come from the per-club player leaderboard:
--     bat_wrc_plus = PA-weighted mean of the club's players' wRC+ (exact: one
--                    park + league constant per club)
--     bat_war / pit_war = sums
--   FIP is NOT stored: the view computes it from counts + the season's league
--   constant (immune to the leaderboard's post-season staleness, P12 M0).
-- Apply via:  python etl/apply_migration.py db/migrations/020_team_season_stats.sql

create table if not exists web_team_season_stats (
  season        int     not null,
  team_id       int     not null,      -- MLB Stats API team id (141 = Jays)
  games         int,                   -- gamesPlayed (hitting)

  -- batting (hitting group, stats=season)
  bat_pa        int,
  bat_ab        int,
  bat_h         int,
  bat_2b        int,
  bat_3b        int,
  bat_hr        int,
  bat_bb        int,                   -- incl. IBB
  bat_ibb       int,
  bat_hbp       int,
  bat_so        int,
  bat_sf        int,
  bat_sb        int,
  bat_cs        int,
  bat_r         int,
  bat_gidp      int,
  -- batting (hitting group, stats=seasonAdvanced). Batted-ball types are MLB's
  -- own trajectory classification (outs + hits), not a launch-angle proxy.
  bat_pitches   int,
  bat_swings    int,                   -- totalSwings
  bat_whiffs    int,                   -- swingAndMisses
  bat_gb        int,
  bat_fb        int,
  bat_ld        int,
  bat_pu        int,

  -- pitching (pitching group, stats=season)
  pit_outs      int,                   -- IP = outs / 3 (never parse '1441.1')
  pit_bf        int,
  pit_ab        int,
  pit_h         int,
  pit_r         int,
  pit_er        int,
  pit_hr        int,
  pit_bb        int,                   -- incl. IBB
  pit_ibb       int,
  pit_hbp       int,
  pit_so        int,
  pit_sf        int,
  pit_sv        int,
  pit_bs        int,
  pit_hld       int,
  -- pitching (pitching group, stats=seasonAdvanced)
  pit_pitches   int,
  pit_swings    int,
  pit_whiffs    int,
  pit_qs        int,                   -- quality starts
  pit_gb        int,
  pit_fb        int,
  pit_ld        int,
  pit_pu        int,

  -- rotation / bullpen (statSplits sitCodes sp, rp). sp_outs + rp_outs = pit_outs.
  sp_gs         int,
  sp_outs       int,
  sp_bf         int,
  sp_h          int,
  sp_er         int,
  sp_hr         int,
  sp_bb         int,
  sp_hbp        int,
  sp_so         int,
  rp_outs       int,
  rp_bf         int,
  rp_h          int,
  rp_er         int,
  rp_hr         int,
  rp_bb         int,
  rp_hbp        int,
  rp_so         int,

  -- sabermetric aggregates (see header)
  bat_wrc_plus  numeric,
  bat_war       numeric,
  pit_war       numeric,

  updated_at    timestamptz not null default now(),
  primary key (season, team_id)
);

create index if not exists web_team_season_stats_season_idx
  on web_team_season_stats (season);

comment on table web_team_season_stats is
  'P13: all 30 clubs per season, regular season, raw counts + bat_wrc_plus (PA-weighted) / bat_war / pit_war (sums) from the per-club player leaderboard. Rates, MLB averages and ranks live in the 022 views.';
