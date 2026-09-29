-- P12 M1 (D1/D4/D5): plate-discipline + batted-ball metric views -- the ONE
-- place these definitions live. Read by the web app (lib/discipline.ts) and by
-- etl/season_report.py, so the site's and the article's numbers cannot drift.
--
-- Grain: (player, season, scope). Regular season only (game_type = 'R').
--   scope 'mlb'  = every Statcast row (all clubs -- Statcast is pulled by player id)
--   scope 'jays' = only games where the player is in that game's JAYS box score
--                  (web_player_game_stats). NOT "game_pk in web_games": a traded
--                  player facing Toronto sits in a Jays game too (DATA_MODEL inv. 7).
-- Filter on player id + scope; both push down through the union all / group by.
--
-- Swing / whiff sets mirror web/lib/pitch-arsenal.ts (WHIFFS / SWINGS) -- change
-- both together. Pitch-clock automatic_ball / automatic_strike rows are NOT
-- thrown pitches (no pitch_type, no zone): excluded from every pitch-based count,
-- but kept for PA / K / BB because 1 in 4 of them ends a plate appearance.
-- Rates are raw fractions (0.245), like web_player_season_stats.k_pct.
-- Apply via:  python etl/apply_migration.py db/migrations/015_metric_views.sql

-- One row per regular-season pitch, tagged with both players' Jays membership.
create or replace view web_v_pitch_scoped as
select
  e.*,
  extract(year from e.game_date)::int as season,
  e.description in ('automatic_ball', 'automatic_strike') as is_auto,
  e.description in ('swinging_strike', 'swinging_strike_blocked', 'foul_tip',
                    'missed_bunt') as is_whiff,
  e.description in ('swinging_strike', 'swinging_strike_blocked', 'foul_tip',
                    'missed_bunt', 'foul', 'hit_into_play', 'foul_bunt',
                    'bunt_foul_tip') as is_swing,
  (e.event is not null and e.event <> 'truncated_pa') as is_pa,
  exists (select 1 from web_player_game_stats s
          where s.game_pk = e.game_pk and s.mlbam_id = e.batter_id) as batter_as_jay,
  exists (select 1 from web_player_game_stats s
          where s.game_pk = e.game_pk and s.mlbam_id = e.pitcher_id) as pitcher_as_jay
from web_statcast_events e
where e.game_type = 'R';

-- ---------------------------------------------------------------------------
-- Batter plate discipline
-- ---------------------------------------------------------------------------
create or replace view web_v_batter_discipline as
with agg as (
  select
    batter_id as mlbam_id, season, scope,
    count(*) filter (where not is_auto)                                   as pitches,
    count(*) filter (where is_swing)                                      as swings,
    count(*) filter (where is_whiff)                                      as whiffs,
    count(*) filter (where zone between 1 and 9)                          as z_pitches,
    count(*) filter (where zone between 1 and 9 and is_swing)             as z_swings,
    count(*) filter (where zone between 11 and 14)                        as o_pitches,
    count(*) filter (where zone between 11 and 14 and is_swing)           as o_swings,
    count(*) filter (where not is_auto and balls = 0 and strikes = 0)     as first_pitches,
    count(*) filter (where is_swing and balls = 0 and strikes = 0)        as first_swings,
    count(*) filter (where is_pa)                                         as pa,
    count(*) filter (where event in ('strikeout', 'strikeout_double_play')) as k,
    count(*) filter (where event in ('walk', 'intent_walk'))              as bb
  from (
    select 'mlb'::text as scope, p.* from web_v_pitch_scoped p
    union all
    select 'jays'::text, p.* from web_v_pitch_scoped p where p.batter_as_jay
  ) x
  group by batter_id, season, scope
)
select
  agg.*,
  o_swings::float8     / nullif(o_pitches, 0)      as chase_pct,
  z_swings::float8     / nullif(z_pitches, 0)      as z_swing_pct,
  whiffs::float8       / nullif(swings, 0)         as whiff_pct,
  1 - whiffs::float8   / nullif(swings, 0)         as contact_pct,
  swings::float8       / nullif(pitches, 0)        as swing_pct,
  first_swings::float8 / nullif(first_pitches, 0)  as first_swing_pct,
  k::float8            / nullif(pa, 0)             as k_pct,
  bb::float8           / nullif(pa, 0)             as bb_pct
from agg;

-- ---------------------------------------------------------------------------
-- Pitcher plate discipline (the same counts from the mound)
-- ---------------------------------------------------------------------------
create or replace view web_v_pitcher_discipline as
with agg as (
  select
    pitcher_id as mlbam_id, season, scope,
    count(*) filter (where not is_auto)                                   as pitches,
    count(*) filter (where is_swing)                                      as swings,
    count(*) filter (where is_whiff)                                      as whiffs,
    count(*) filter (where description = 'called_strike')                 as called_strikes,
    count(*) filter (where zone is not null)                              as zoned_pitches,
    count(*) filter (where zone between 1 and 9)                          as z_pitches,
    count(*) filter (where zone between 11 and 14)                        as o_pitches,
    count(*) filter (where zone between 11 and 14 and is_swing)           as o_swings,
    count(*) filter (where not is_auto and balls = 0 and strikes = 0)     as first_pitches,
    count(*) filter (where balls = 0 and strikes = 0 and not is_auto
                       and (is_swing or description = 'called_strike'))   as first_strikes,
    count(*) filter (where is_pa)                                         as pa,
    count(*) filter (where event in ('strikeout', 'strikeout_double_play')) as k,
    count(*) filter (where event in ('walk', 'intent_walk'))              as bb
  from (
    select 'mlb'::text as scope, p.* from web_v_pitch_scoped p
    union all
    select 'jays'::text, p.* from web_v_pitch_scoped p where p.pitcher_as_jay
  ) x
  group by pitcher_id, season, scope
)
select
  agg.*,
  (called_strikes + whiffs)::float8 / nullif(pitches, 0)          as csw_pct,
  z_pitches::float8        / nullif(zoned_pitches, 0)             as zone_pct,
  o_swings::float8         / nullif(o_pitches, 0)                 as chase_pct,
  whiffs::float8           / nullif(swings, 0)                    as whiff_pct,
  first_strikes::float8    / nullif(first_pitches, 0)             as first_strike_pct,
  k::float8                / nullif(pa, 0)                        as k_pct,
  bb::float8               / nullif(pa, 0)                        as bb_pct,
  (k - bb)::float8         / nullif(pa, 0)                        as k_minus_bb_pct
from agg;

-- ---------------------------------------------------------------------------
-- Batted-ball profile. Population = hc_x_feet is not null, the same "ball in
-- play" proxy the batting page uses (DATA_MODEL invariant 2), so Hard-hit% here
-- equals ContactQualityCard's. GB/LD/FB/PU are APPROXIMATE (from launch_angle;
-- bb_type is not stored -- D5). Spray angle: x > 0 = right field (verified on
-- pulled HRs: RHB Guerrero < -15 deg, LHB Varsho > +15 deg).
-- ---------------------------------------------------------------------------
create or replace view web_v_batted_ball_profile as
with bip as (
  select
    x.*,
    degrees(atan2(x.hc_x_feet, x.hc_y_feet)) as spray_angle
  from (
    select 'mlb'::text as scope, p.* from web_v_pitch_scoped p
    union all
    select 'jays'::text, p.* from web_v_pitch_scoped p where p.batter_as_jay
  ) x
),
agg as (
  select
    batter_id as mlbam_id, season, scope,
    count(*) filter (where hc_x_feet is not null)                              as bip,
    count(*) filter (where hc_x_feet is not null and launch_speed is not null) as with_ev,
    avg(launch_speed) filter (where hc_x_feet is not null)::float8             as avg_ev,
    max(launch_speed) filter (where hc_x_feet is not null)::float8             as max_ev,
    count(*) filter (where hc_x_feet is not null and launch_speed >= 95)       as hard_hit,
    count(*) filter (where hc_x_feet is not null and launch_angle is not null) as with_la,
    count(*) filter (where hc_x_feet is not null and launch_angle < 10)        as gb,
    count(*) filter (where hc_x_feet is not null and launch_angle >= 10 and launch_angle < 25) as ld,
    count(*) filter (where hc_x_feet is not null and launch_angle >= 25 and launch_angle <= 50) as fb,
    count(*) filter (where hc_x_feet is not null and launch_angle > 50)        as pu,
    count(*) filter (where hc_x_feet is not null and launch_angle between 8 and 32) as sweet_spot,
    count(*) filter (where hc_x_feet is not null and stand in ('L', 'R'))      as with_side,
    count(*) filter (where hc_x_feet is not null and ((stand = 'R' and spray_angle < -15)
                                                   or (stand = 'L' and spray_angle > 15))) as pull,
    count(*) filter (where hc_x_feet is not null and stand in ('L', 'R')
                       and abs(spray_angle) <= 15)                             as center,
    count(*) filter (where hc_x_feet is not null and ((stand = 'R' and spray_angle > 15)
                                                   or (stand = 'L' and spray_angle < -15))) as oppo,
    count(*) filter (where description = 'hit_into_play' and estimated_woba is not null) as xwoba_n,
    avg(estimated_woba) filter (where description = 'hit_into_play')::float8   as xwoba_con
  from bip
  group by batter_id, season, scope
)
select
  agg.*,
  hard_hit::float8   / nullif(with_ev, 0)    as hard_hit_pct,
  gb::float8         / nullif(with_la, 0)    as gb_pct,
  ld::float8         / nullif(with_la, 0)    as ld_pct,
  fb::float8         / nullif(with_la, 0)    as fb_pct,
  pu::float8         / nullif(with_la, 0)    as pu_pct,
  sweet_spot::float8 / nullif(with_la, 0)    as sweet_spot_pct,
  pull::float8       / nullif(with_side, 0)  as pull_pct,
  center::float8     / nullif(with_side, 0)  as center_pct,
  oppo::float8       / nullif(with_side, 0)  as oppo_pct
from agg;
