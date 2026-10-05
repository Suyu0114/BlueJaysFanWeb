-- Post-P13: by-position offense for every club + the MLB average at each
-- position + the club's rank among 30 -- the ONE place these are defined. Read
-- by the season page (web/lib/team-position.ts: "each position vs MLB"); the TS
-- side never re-derives a rate or a rank. Regular season only (024 is gameType=R).
--
-- web_v_team_position: one row per (season, team_id, pos_group) for the 30
-- clubs, plus an MLB row per (season, pos_group) with team_id = 0.
--
-- Position groups (pos_group) -- MUST match web/lib/team-season.ts::batterGroup
-- (the season page's "value by position" groups); change both together:
--   C, 1B, 2B, 3B, SS  as is
--   OF = LF + CF + RF
--   DH = DH + PH (pinch-hitters) + P (a position player batting on the mound)
--
-- Columns:
--   pa, hr        club rows: the club's totals at that position.
--                 MLB row:   MEAN PER CLUB (sum / clubs) -- HR is a club total,
--                 not a rate, so the reference is "an average club" (the 022
--                 exception for WAR / OAA).
--   avg obp slg ops   from the summed counts, for clubs and the MLB row alike
--                 (the MLB row is never an average of club rates -- P13 T3).
--                 OPS = OBP + SLG unrounded, so it can differ by .001 from
--                 MLB's display OPS (which adds the rounded OBP and SLG).
--   ops_rank, hr_rank   1 = best (higher OPS / more HR), rank() within
--                 (season, pos_group): ties share a rank, the next is skipped.
--                 Club rows only; NULL on the MLB row.
--   ops_tied, hr_tied   another club has the same value (HR ties are common).
-- Rates are raw fractions (0.712), like the 015 / 022 views.
-- Apply via:  python etl/apply_migration.py db/migrations/025_team_position_views.sql

drop view if exists web_v_team_position;

create view web_v_team_position as
with grouped as (
  select
    season, team_id,
    case
      when position in ('LF', 'CF', 'RF') then 'OF'
      when position in ('C', '1B', '2B', '3B', 'SS') then position
      else 'DH'                                   -- DH, PH, P (batterGroup)
    end as pos_group,
    sum(pa) as pa, sum(ab) as ab, sum(h) as h, sum(bb) as bb, sum(hbp) as hbp,
    sum(sf) as sf, sum(tb) as tb, sum(hr) as hr
  from web_team_position_splits
  group by 1, 2, 3
),
counts as (
  select season, team_id, pos_group, 1 as clubs, pa, ab, h, bb, hbp, sf, tb, hr
  from grouped
  union all
  select season, 0, pos_group, count(*), sum(pa), sum(ab), sum(h), sum(bb), sum(hbp),
    sum(sf), sum(tb), sum(hr)
  from grouped
  group by season, pos_group
),
rates as (
  select
    season, team_id, pos_group,
    pa::float8 / clubs                                                    as pa,
    hr::float8 / clubs                                                    as hr,
    h::float8 / nullif(ab, 0)                                             as avg,
    (h + bb + hbp)::float8 / nullif(ab + bb + hbp + sf, 0)                as obp,
    tb::float8 / nullif(ab, 0)                                            as slg
  from counts
),
ops as (
  select rates.*, obp + slg as ops from rates
)
select
  ops.*,
  case when ops is null then null
       else rank() over (partition by season, pos_group order by ops desc nulls last) end::int as ops_rank,
  case when ops is null then null
       else count(*) over (partition by season, pos_group, ops) > 1 end                 as ops_tied,
  case when hr is null then null
       else rank() over (partition by season, pos_group order by hr desc nulls last) end::int  as hr_rank,
  case when hr is null then null
       else count(*) over (partition by season, pos_group, hr) > 1 end                  as hr_tied
from ops
where team_id <> 0
union all
select ops.*, null::int, null::boolean, null::int, null::boolean
from ops
where team_id = 0;

comment on view web_v_team_position is
  'Post-P13: by-position offense per club (team_id) + MLB row (team_id = 0) per (season, pos_group). Groups mirror web/lib/team-season.ts::batterGroup (OF = LF+CF+RF, DH = DH+PH+P). Rates from summed counts; MLB pa/hr = mean per club; <metric>_rank 1 = best among 30, NULL on the MLB row.';
