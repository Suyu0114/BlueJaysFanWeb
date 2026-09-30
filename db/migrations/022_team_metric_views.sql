-- P13 N1 (T3/T4/T5): team metric views -- the ONE place team rates, MLB averages
-- and 30-club ranks are defined. Read by the web app (lib/team-trends.ts) and by
-- etl/season_report.py (team_trends.*), so the site's and the article's numbers
-- cannot drift. Regular season only (the source tables are gameType=R).
--
-- Layers (every formula is written ONCE and applies to clubs and MLB alike):
--   web_v_team_counts  one row per (season, club) + an MLB row (team_id = 0)
--                      holding the SUMMED counts of the 30 clubs. Savant
--                      averages are carried as weighted sums (avg * weight) so
--                      the MLB row re-weights them (Σbarrels / ΣBBE ...).
--   web_v_team_rates   the rates, computed from the counts, for all 31 rows.
--   web_v_mlb_season   the MLB row: league averages (never an average of team
--                      rates -- T3) + the FIP constant + runs per game.
--   web_v_team_season  the 30 clubs: rates + web_standings + run sources +
--                      luck + a <metric>_rank per ranked metric.
--
-- Exceptions to "sum then divide" (no count form exists):
--   wRC+            MLB = PA-weighted mean of the clubs' PA-weighted wRC+ (~100).
--   WAR, OAA        MLB = mean per club (a club total, not a rate).
--   wOBA / xwOBA    weighted by Savant's own PA (xpa) -- an approximation for
--                   the MLB row only (club rows are exact).
-- FIP = (13 HR + 3 (BB + HBP) - 2 SO) / IP + cFIP, BB incl. IBB;
--   cFIP = lgERA - (13 lgHR + 3 (lgBB + lgHBP) - 2 lgSO) / lgIP  (2022: 3.106).
-- IP is always outs / 3 (never the '1441.1' string).
-- Rank: 1 = best, rank() (ties share a rank, next is skipped), NULL -> NULL.
--   Directions mirror web/lib/team-metrics.ts -- change both together.
--   Neutral batted-ball mix (gb/fb/ld/pu) is never ranked.
-- Rates are raw fractions (0.245), like the 015 views.
-- Apply via:  python etl/apply_migration.py db/migrations/022_team_metric_views.sql

drop view if exists web_v_team_season;
drop view if exists web_v_mlb_season;
drop view if exists web_v_team_rates;
drop view if exists web_v_team_counts;

-- ---------------------------------------------------------------------------
-- Counts: clubs + the MLB total (team_id = 0)
-- ---------------------------------------------------------------------------
create view web_v_team_counts as
with club as (
  select
    t.season, t.team_id, t.games,
    t.bat_pa, t.bat_ab, t.bat_h, t.bat_2b, t.bat_3b, t.bat_hr, t.bat_bb, t.bat_hbp,
    t.bat_so, t.bat_sf, t.bat_sb, t.bat_cs, t.bat_r,
    t.bat_swings, t.bat_whiffs, t.bat_gb, t.bat_fb, t.bat_ld, t.bat_pu,
    t.bat_wrc_plus * t.bat_pa                                   as bat_wrc_sum,
    case when t.bat_wrc_plus is not null then t.bat_pa end      as bat_wrc_pa,
    t.bat_war::float8                                           as bat_war,
    t.pit_outs, t.pit_bf, t.pit_ab, t.pit_h, t.pit_r, t.pit_er, t.pit_hr, t.pit_bb,
    t.pit_hbp, t.pit_so, t.pit_sf, t.pit_swings, t.pit_whiffs,
    t.pit_war::float8                                           as pit_war,
    t.sp_outs, t.sp_bf, t.sp_er, t.sp_hr, t.sp_bb, t.sp_hbp, t.sp_so,
    t.rp_outs, t.rp_bf, t.rp_er, t.rp_hr, t.rp_bb, t.rp_hbp, t.rp_so,
    s.bat_bbe, s.bat_barrels, s.bat_ev95plus,
    s.bat_sweet_spot_pct * s.bat_bbe                            as bat_sweet_n,
    s.bat_avg_ev * s.bat_bbe                                    as bat_ev_sum,
    s.bat_xpa,
    s.bat_woba * s.bat_xpa                                      as bat_woba_sum,
    s.bat_xwoba * s.bat_xpa                                     as bat_xwoba_sum,
    s.pit_bbe, s.pit_barrels, s.pit_ev95plus,
    s.pit_xpa,
    s.pit_woba * s.pit_xpa                                      as pit_woba_sum,
    s.pit_xwoba * s.pit_xpa                                     as pit_xwoba_sum,
    s.oaa::float8                                               as oaa
  from web_team_season_stats t
  left join web_team_statcast_season s using (season, team_id)
)
select * from club
union all
select
  season, 0 as team_id, sum(games),
  sum(bat_pa), sum(bat_ab), sum(bat_h), sum(bat_2b), sum(bat_3b), sum(bat_hr), sum(bat_bb), sum(bat_hbp),
  sum(bat_so), sum(bat_sf), sum(bat_sb), sum(bat_cs), sum(bat_r),
  sum(bat_swings), sum(bat_whiffs), sum(bat_gb), sum(bat_fb), sum(bat_ld), sum(bat_pu),
  sum(bat_wrc_sum), sum(bat_wrc_pa),
  avg(bat_war),                                   -- mean per club
  sum(pit_outs), sum(pit_bf), sum(pit_ab), sum(pit_h), sum(pit_r), sum(pit_er), sum(pit_hr), sum(pit_bb),
  sum(pit_hbp), sum(pit_so), sum(pit_sf), sum(pit_swings), sum(pit_whiffs),
  avg(pit_war),                                   -- mean per club
  sum(sp_outs), sum(sp_bf), sum(sp_er), sum(sp_hr), sum(sp_bb), sum(sp_hbp), sum(sp_so),
  sum(rp_outs), sum(rp_bf), sum(rp_er), sum(rp_hr), sum(rp_bb), sum(rp_hbp), sum(rp_so),
  sum(bat_bbe), sum(bat_barrels), sum(bat_ev95plus), sum(bat_sweet_n), sum(bat_ev_sum),
  sum(bat_xpa), sum(bat_woba_sum), sum(bat_xwoba_sum),
  sum(pit_bbe), sum(pit_barrels), sum(pit_ev95plus),
  sum(pit_xpa), sum(pit_woba_sum), sum(pit_xwoba_sum),
  avg(oaa)                                        -- mean per club
from club
group by season;

-- ---------------------------------------------------------------------------
-- Rates (clubs and MLB, one set of formulas)
-- ---------------------------------------------------------------------------
create view web_v_team_rates as
with c as (
  select
    k.*,
    -- FIP constant from the season's MLB row
    27.0::float8 * lg.pit_er / nullif(lg.pit_outs, 0)
      - 3.0::float8 * (13 * lg.pit_hr + 3 * (lg.pit_bb + lg.pit_hbp) - 2 * lg.pit_so) / nullif(lg.pit_outs, 0)
      as cfip
  from web_v_team_counts k
  join web_v_team_counts lg on lg.season = k.season and lg.team_id = 0
)
select
  season, team_id, games, cfip,
  bat_pa as pa, pit_bf as bf, pit_outs / 3.0::float8 as ip, bat_hr as hr, bat_sb as sb,
  bat_r as rs, pit_r as ra,

  -- offense
  bat_r::float8 / nullif(games, 0)                                               as r_per_g,
  bat_wrc_sum::float8 / nullif(bat_wrc_pa, 0)                                    as wrc_plus,
  bat_h::float8 / nullif(bat_ab, 0)                                              as avg,
  (bat_h + bat_bb + bat_hbp)::float8 / nullif(bat_ab + bat_bb + bat_hbp + bat_sf, 0) as obp,
  (bat_h + bat_2b + 2 * bat_3b + 3 * bat_hr)::float8 / nullif(bat_ab, 0)         as slg,
  (bat_h + bat_bb + bat_hbp)::float8 / nullif(bat_ab + bat_bb + bat_hbp + bat_sf, 0)
    + (bat_h + bat_2b + 2 * bat_3b + 3 * bat_hr)::float8 / nullif(bat_ab, 0)     as ops,
  (bat_2b + 2 * bat_3b + 3 * bat_hr)::float8 / nullif(bat_ab, 0)                 as iso,
  (bat_h - bat_hr)::float8 / nullif(bat_ab - bat_so - bat_hr + bat_sf, 0)        as babip,
  bat_so::float8 / nullif(bat_pa, 0)                                             as k_pct,
  bat_bb::float8 / nullif(bat_pa, 0)                                             as bb_pct,
  bat_hr::float8 / nullif(bat_pa, 0)                                             as hr_pct,
  bat_sb::float8 / nullif(games, 0)                                              as sb_per_g,
  bat_sb::float8 / nullif(bat_sb + bat_cs, 0)                                    as sb_pct,
  bat_whiffs::float8 / nullif(bat_swings, 0)                                     as whiff_pct,
  bat_gb::float8 / nullif(bat_gb + bat_fb + bat_ld + bat_pu, 0)                  as gb_pct,
  bat_fb::float8 / nullif(bat_gb + bat_fb + bat_ld + bat_pu, 0)                  as fb_pct,
  bat_ld::float8 / nullif(bat_gb + bat_fb + bat_ld + bat_pu, 0)                  as ld_pct,
  bat_pu::float8 / nullif(bat_gb + bat_fb + bat_ld + bat_pu, 0)                  as pu_pct,
  bat_barrels::float8 / nullif(bat_bbe, 0)                                       as brl_pct,
  bat_ev95plus::float8 / nullif(bat_bbe, 0)                                      as hard_hit_pct,
  bat_sweet_n::float8 / nullif(bat_bbe, 0)                                       as sweet_spot_pct,
  bat_ev_sum::float8 / nullif(bat_bbe, 0)                                        as avg_ev,
  bat_woba_sum::float8 / nullif(bat_xpa, 0)                                      as woba,
  bat_xwoba_sum::float8 / nullif(bat_xpa, 0)                                     as xwoba,
  bat_war,

  -- run prevention
  pit_r::float8 / nullif(games, 0)                                               as ra_per_g,
  27.0::float8 * pit_er / nullif(pit_outs, 0)                                            as era,
  3.0::float8 * (13 * pit_hr + 3 * (pit_bb + pit_hbp) - 2 * pit_so) / nullif(pit_outs, 0) + cfip as fip,
  3.0::float8 * (pit_h + pit_bb) / nullif(pit_outs, 0)                                   as whip,
  pit_so::float8 / nullif(pit_bf, 0)                                             as pit_k_pct,
  pit_bb::float8 / nullif(pit_bf, 0)                                             as pit_bb_pct,
  (pit_so - pit_bb)::float8 / nullif(pit_bf, 0)                                  as pit_k_bb_pct,
  27.0::float8 * pit_hr / nullif(pit_outs, 0)                                            as hr9,
  (pit_h - pit_hr)::float8 / nullif(pit_ab - pit_so - pit_hr + pit_sf, 0)        as pit_babip,
  pit_whiffs::float8 / nullif(pit_swings, 0)                                     as pit_whiff_pct,
  pit_barrels::float8 / nullif(pit_bbe, 0)                                       as pit_brl_pct,
  pit_ev95plus::float8 / nullif(pit_bbe, 0)                                      as pit_hard_hit_pct,
  pit_woba_sum::float8 / nullif(pit_xpa, 0)                                      as pit_woba,
  pit_xwoba_sum::float8 / nullif(pit_xpa, 0)                                     as pit_xwoba,
  oaa,
  pit_war,

  -- rotation / bullpen
  27.0::float8 * sp_er / nullif(sp_outs, 0)                                              as sp_era,
  3.0::float8 * (13 * sp_hr + 3 * (sp_bb + sp_hbp) - 2 * sp_so) / nullif(sp_outs, 0) + cfip as sp_fip,
  (sp_so - sp_bb)::float8 / nullif(sp_bf, 0)                                     as sp_k_bb_pct,
  sp_outs::float8 / nullif(pit_outs, 0)                                          as sp_ip_share,
  27.0::float8 * rp_er / nullif(rp_outs, 0)                                              as rp_era,
  3.0::float8 * (13 * rp_hr + 3 * (rp_bb + rp_hbp) - 2 * rp_so) / nullif(rp_outs, 0) + cfip as rp_fip,
  (rp_so - rp_bb)::float8 / nullif(rp_bf, 0)                                     as rp_k_bb_pct
from c;

-- ---------------------------------------------------------------------------
-- MLB averages (the team_id = 0 row)
-- ---------------------------------------------------------------------------
create view web_v_mlb_season as
select r.*, r.r_per_g as lg_rpg
from web_v_team_rates r
where r.team_id = 0;

-- ---------------------------------------------------------------------------
-- The 30 clubs: rates + standings + run sources + ranks
-- ---------------------------------------------------------------------------
create view web_v_team_season as
with base as (
  select
    r.*,
    st.team_name, st.team_abbrev, st.league_id, st.division_id, st.division_name,
    st.division_rank, st.w, st.l, st.pct::float8 as pct, st.x_w, st.x_l,
    st.runs_scored, st.runs_allowed, st.run_diff,
    st.w - st.x_w                                         as luck,
    lg.r_per_g                                            as lg_rpg,
    r.rs - lg.r_per_g * r.games                           as offense_runs,     -- runs above MLB average
    lg.r_per_g * r.games - r.ra                           as prevention_runs,  -- runs saved vs MLB average
    r.woba - r.xwoba                                      as woba_minus_xwoba
  from web_v_team_rates r
  join web_v_team_rates lg on lg.season = r.season and lg.team_id = 0
  left join web_standings st on st.season = r.season and st.team_id = r.team_id
  where r.team_id <> 0
)
select
  base.*,
  -- record
  case when pct is null then null else rank() over (partition by season order by pct desc nulls last) end               as pct_rank,
  case when run_diff is null then null else rank() over (partition by season order by run_diff desc nulls last) end     as run_diff_rank,
  -- offense (higher is better unless noted)
  case when r_per_g is null then null else rank() over (partition by season order by r_per_g desc nulls last) end       as r_per_g_rank,
  case when wrc_plus is null then null else rank() over (partition by season order by wrc_plus desc nulls last) end     as wrc_plus_rank,
  case when avg is null then null else rank() over (partition by season order by avg desc nulls last) end               as avg_rank,
  case when obp is null then null else rank() over (partition by season order by obp desc nulls last) end               as obp_rank,
  case when slg is null then null else rank() over (partition by season order by slg desc nulls last) end               as slg_rank,
  case when ops is null then null else rank() over (partition by season order by ops desc nulls last) end               as ops_rank,
  case when iso is null then null else rank() over (partition by season order by iso desc nulls last) end               as iso_rank,
  case when babip is null then null else rank() over (partition by season order by babip desc nulls last) end           as babip_rank,
  case when k_pct is null then null else rank() over (partition by season order by k_pct asc nulls last) end            as k_pct_rank,        -- lower
  case when bb_pct is null then null else rank() over (partition by season order by bb_pct desc nulls last) end         as bb_pct_rank,
  case when hr_pct is null then null else rank() over (partition by season order by hr_pct desc nulls last) end         as hr_pct_rank,
  case when sb_per_g is null then null else rank() over (partition by season order by sb_per_g desc nulls last) end     as sb_per_g_rank,
  case when sb_pct is null then null else rank() over (partition by season order by sb_pct desc nulls last) end         as sb_pct_rank,
  case when whiff_pct is null then null else rank() over (partition by season order by whiff_pct asc nulls last) end    as whiff_pct_rank,    -- lower
  case when brl_pct is null then null else rank() over (partition by season order by brl_pct desc nulls last) end       as brl_pct_rank,
  case when hard_hit_pct is null then null else rank() over (partition by season order by hard_hit_pct desc nulls last) end as hard_hit_pct_rank,
  case when sweet_spot_pct is null then null else rank() over (partition by season order by sweet_spot_pct desc nulls last) end as sweet_spot_pct_rank,
  case when avg_ev is null then null else rank() over (partition by season order by avg_ev desc nulls last) end         as avg_ev_rank,
  case when woba is null then null else rank() over (partition by season order by woba desc nulls last) end             as woba_rank,
  case when xwoba is null then null else rank() over (partition by season order by xwoba desc nulls last) end           as xwoba_rank,
  case when bat_war is null then null else rank() over (partition by season order by bat_war desc nulls last) end       as bat_war_rank,
  -- run prevention (lower is better unless noted)
  case when ra_per_g is null then null else rank() over (partition by season order by ra_per_g asc nulls last) end      as ra_per_g_rank,
  case when era is null then null else rank() over (partition by season order by era asc nulls last) end                as era_rank,
  case when fip is null then null else rank() over (partition by season order by fip asc nulls last) end                as fip_rank,
  case when whip is null then null else rank() over (partition by season order by whip asc nulls last) end              as whip_rank,
  case when pit_k_pct is null then null else rank() over (partition by season order by pit_k_pct desc nulls last) end   as pit_k_pct_rank,    -- higher
  case when pit_bb_pct is null then null else rank() over (partition by season order by pit_bb_pct asc nulls last) end  as pit_bb_pct_rank,
  case when pit_k_bb_pct is null then null else rank() over (partition by season order by pit_k_bb_pct desc nulls last) end as pit_k_bb_pct_rank, -- higher
  case when hr9 is null then null else rank() over (partition by season order by hr9 asc nulls last) end                as hr9_rank,
  case when pit_babip is null then null else rank() over (partition by season order by pit_babip asc nulls last) end    as pit_babip_rank,
  case when pit_whiff_pct is null then null else rank() over (partition by season order by pit_whiff_pct desc nulls last) end as pit_whiff_pct_rank, -- higher
  case when pit_brl_pct is null then null else rank() over (partition by season order by pit_brl_pct asc nulls last) end as pit_brl_pct_rank,
  case when pit_hard_hit_pct is null then null else rank() over (partition by season order by pit_hard_hit_pct asc nulls last) end as pit_hard_hit_pct_rank,
  case when pit_xwoba is null then null else rank() over (partition by season order by pit_xwoba asc nulls last) end    as pit_xwoba_rank,
  case when oaa is null then null else rank() over (partition by season order by oaa desc nulls last) end               as oaa_rank,          -- higher
  case when pit_war is null then null else rank() over (partition by season order by pit_war desc nulls last) end       as pit_war_rank,      -- higher
  -- rotation / bullpen
  case when sp_era is null then null else rank() over (partition by season order by sp_era asc nulls last) end          as sp_era_rank,
  case when sp_fip is null then null else rank() over (partition by season order by sp_fip asc nulls last) end          as sp_fip_rank,
  case when sp_k_bb_pct is null then null else rank() over (partition by season order by sp_k_bb_pct desc nulls last) end as sp_k_bb_pct_rank, -- higher
  case when sp_ip_share is null then null else rank() over (partition by season order by sp_ip_share desc nulls last) end as sp_ip_share_rank, -- higher
  case when rp_era is null then null else rank() over (partition by season order by rp_era asc nulls last) end          as rp_era_rank,
  case when rp_fip is null then null else rank() over (partition by season order by rp_fip asc nulls last) end          as rp_fip_rank,
  case when rp_k_bb_pct is null then null else rank() over (partition by season order by rp_k_bb_pct desc nulls last) end as rp_k_bb_pct_rank  -- higher
from base;

comment on view web_v_team_season is
  'P13: 30 clubs per season -- rates (fractions), web_standings record, run sources vs the MLB average, luck (W - xW), and <metric>_rank (1 = best, rank(), directions mirror web/lib/team-metrics.ts).';
comment on view web_v_mlb_season is
  'P13: MLB averages per season from SUMMED club counts (never averaged rates); wRC+ PA-weighted, WAR/OAA mean per club; cfip = the season FIP constant; lg_rpg = runs per team-game.';
