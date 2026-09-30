# P13 — Team Trends 2022–2026 vs MLB

> Handoff spec, written at **plan time (2026-09-29)**. Follows `CLAUDE.md`
> (conda env `MLBxBaZi`, `web_` prefix, one concern per migration, server
> components by default, English-first i18n, brand tokens, the **Motion**
> section). Decisions in §0 are locked — **do not relitigate them**; flag a
> contradiction instead of silently working around it.
>
> **Prerequisite: P12 is merged to `main`.** P13 builds on P12's migrations
> `013`–`019`, `web_games.game_type`, the M5 season-page helpers, the M6
> `web_league_season` table and the M7 export / copy-table tooling (§1b). If P12
> changed shape while it was built, read its §15 "as built" first and adjust the
> references here — the decisions stay.
>
> Every data fact in §1 was **measured against the live endpoints on
> 2026-09-29** with read-only probes. The 2026 regular season ended 2026-09-27,
> so all five seasons in the window are complete.
>
> **Aligned with P12 as built (2026-09-30, P12 spec §15):** N0 was built on the P12
> branch and rebased onto `main` after the merge. §1b now names the real P12
> modules, and **T9's rank shading reuses P12's percentile colour scale** instead of
> fixed Tailwind tints (same steel → neutral → brick meaning, one implementation).

---

## 0. Scope

**Why.** The owner is writing Blue Jays review articles. P12 answers "how did each
player change" and gives a **single-season** team page (`/season/[year]`). What's
still missing is the **multi-year team view from an analyst's angle**: how the
Jays' record, offense and run prevention evolved over five seasons, **relative to
the league each year**. Raw year-to-year numbers mislead here — the 2023 rules
(pitch clock, shift ban, bigger bases) moved stolen bases, BABIP and scoring
league-wide — so every number is shown with the **MLB average and the Jays' rank
among 30 clubs** for that season.

**The page:** `/[locale]/team`, top to bottom:

```
BLUE JAYS · 2022–2026                              [MLB rank key: 1st … 30th]
┌ Season strip ─────────────────────────────────────────────────────────────┐
│ 2022 92-70 · WC │ 2023 89-73 · WC │ 2024 74-88 · 5th │ 2025 ★ AL East · WS │ 2026 … │ → /season/[year]
└───────────────────────────────────────────────────────────────────────────┘
① RECORD & RUN DIFFERENTIAL  "Were they as good as their record?"
   Where the wins came from (offense vs run-prevention runs above MLB average) · Luck table
② OFFENSE vs MLB             "How they scored"
   Rank grid (Value | vs MLB) · 4 trend small multiples · wOBA vs xwOBA chip
③ RUN PREVENTION vs MLB      "How they kept runs off the board"
   Rank grid · Rotation vs bullpen · ERA − FIP note
④ GAME-LEVEL SPLITS & TRAJECTORY
   Games above .500 by game number, 5 seasons overlaid · Splits table
⑤ STRENGTHS & WEAKNESSES     per season, 3 best / 3 worst MLB ranks, article-ready
⑥ GLOSSARY & METHOD          one-line definitions, sources, 2023 rule-change note
```

**Milestones — build in order, one commit each, each shippable on its own:**

| # | Milestone | Kind |
|---|---|---|
| N0 | Team data: migrations `020`, `021`; `pull_team_stats.py`, `pull_team_statcast.py`; backfill 2022–2026; standings + schedule 2022–2023; cron | ETL |
| N1 | Metric views (migration `022`) + reconciliation | SQL |
| N2 | Page shell, nav, Season strip, module ① | web |
| N3 | Module ② Offense | web |
| N4 | Module ③ Run prevention | web |
| N5 | Module ④ Trajectory + splits | web |
| N6 | ⑤ Callouts, ⑥ glossary, article-pack extension, docs reconcile | web + ETL/report + docs |

**Out of scope (backlog, §13):** AL-average / AL East rival overlays, payroll,
park-adjusted pitching (ERA-/FIP-), xFIP, team plate discipline beyond Whiff%,
seasons before 2022.

### Decision log (locked)

| # | Decision | Choice |
|---|---|---|
| T1 | Route + window | `/[locale]/team`, server page, `revalidate = 3600`. Window = the latest **5** seasons present in `web_team_season_stats` (`TREND_SEASONS = 5`), so 2027 rolls to 2023–2027 with no code change. **Regular season only** (`gameType=R` on every API call; `game_type = 'R'` on `web_games`). |
| T2 | Grain | **All 30 clubs per season** — ranks and MLB averages need them. Tables stay small (150 rows for the window). |
| T3 | MLB average | Computed from **summed counting stats** of the 30 clubs, then the rate — **never an average of team rates** (P12 §11). Savant rates re-weighted by their denominators (Σbarrels / ΣBBE). wRC+ has no count form: its MLB average is the PA-weighted mean of the 30 teams (≈ 100 by construction). |
| T4 | Where definitions live | Rates, MLB averages and **ranks** live in **SQL views** (migration `022`), read by both the web app and the Python report (P12 D4) — so article numbers and site numbers cannot drift. The TS registry (`lib/team-metrics.ts`) holds only display concerns (label, format, direction for colouring, hint key) with a cross-reference comment to the view; N1 checks the two directions agree. |
| T5 | Ranking | **1 = best**, direction per metric (§10 table). `rank()` (competition ranking) — ties display as "T-3rd". NULL value → NULL rank ("—"), never last. Neutral profile metrics (GB% / FB% / LD% / PU%) get **no rank and no colour** and are excluded from callouts. |
| T6 | Team sabermetrics | No team-level endpoint exists (`/teams/stats?stats=sabermetrics` → empty), and the league-wide player leaderboard merges traded players into one row. So **wRC+ and WAR** aggregate the **per-team player leaderboard** (`/stats?stats=season,sabermetrics&teamId=T&playerPool=ALL`): wRC+ = PA-weighted mean, WAR = sum. **FIP is not aggregated** — it is computed in the view from team counting stats + the season's league constant (§10), which is exact and immune to the leaderboard staleness P12 found. |
| T7 | Nav | **One "Team" link** (zh-TW 球隊), placed after Standings. Agreed with P12 on 2026-09-29: P12 M5 ships it as **`Nav.team` → `/season/<latest season>`** (no "Season" link), and P13 only **repoints its `href` to `/team`** — same key, same label, same position. `/season/[year]` is then reached from the Season strip and gets a "← Team trends" back-link. (If P12's §15 says otherwise, replace whatever nav entry it added.) |
| T8 | Counting stats as rates | Shown per game / per PA (R/G, HR%, SB/G) so a season in progress compares fairly with finished ones. Raw totals appear only in tooltips. |
| T9 | Colours | Brand tokens only. Jays = **brick** line/marks; MLB average = **navy dashed** reference. Rank shading Savant-style **via P12's `PercentileBars` scale** (`color-mix` steel → neutral → brick from brand tokens), extracted to `lib/percentile-color.ts` and fed `100 × (30 − rank) / 29`, so rank 1 = full brick and rank 30 = full steel — one scale for percentiles and ranks; the ordinal is always printed too (never colour-only). Run sources: offense **brick**, run prevention **navy**, net marker **lava**. Five-season overlay: highlighted season brick, others `steel` at 35 % opacity. Luck / Δ numbers are signed text, not coloured good/bad. |
| T10 | Dependencies | **None new.** Savant team CSVs via `requests` + stdlib `csv` (so the scripts don't need pandas); charts via Recharts; motion via existing components. |

---

## 1. Verified data facts (probes 2026-09-29, read-only)

**MLB Stats API (free, no key):**

| Endpoint | Returns | Notes |
|---|---|---|
| `/teams/stats?season=Y&sportIds=1&group=hitting,pitching&stats=season&gameType=R` | 30 splits per group, full counting line. Hitting: `plateAppearances, atBats, hits, doubles, triples, homeRuns, baseOnBalls, intentionalWalks, hitByPitch, strikeOuts, sacFlies, stolenBases, caughtStealing, runs, groundIntoDoublePlay, gamesPlayed`. Pitching: `outs, inningsPitched, battersFaced, atBats, hits, runs, earnedRuns, homeRuns, baseOnBalls, intentionalWalks, hitBatsmen, strikeOuts, sacFlies, saves, blownSaves, holds, gamesStarted`. | Jays 2022: hitting R **775**, pitching R **679** = `web_standings` RS/RA → regular season. One call covers all 30 clubs. |
| same with `stats=seasonAdvanced` | 30 splits per group: `totalSwings, swingAndMisses, numberOfPitches`, `groundOuts/groundHits, flyOuts/flyHits, lineOuts/lineHits, popOuts/popHits`, pitching `qualityStarts` | Jays 2022 hitting 11,310 swings / 2,756 whiffs; pitching `whiffPercentage .252`. MLB's own batted-ball classification (official, **not** the P12 launch-angle approximation). |
| `/stats?stats=season,sabermetrics&group={hitting\|pitching}&season=Y&teamId=T&sportId=1&gameType=R&playerPool=ALL&limit=500` | one split per player **for that club**: `season` block (PA / IP) + `sabermetrics` (`wRcPlus, war, fip, …`) | Jays 2022: PA-weighted wRC+ **117.9** (FanGraphs team 118), PA 6158 = team PA; bat WAR Σ **33.6**; pitching IP-weighted FIP 3.85, WAR Σ **15.3**. 60 calls/season (30 clubs × 2 groups). |
| `/stats?…&playerPool=ALL` **without** `teamId` | one row per player, **clubs merged** (Soto 2022: 1 row, `numTeams = 2`, team = SD) | **Unusable for team aggregation** — that's why T6 calls per team. |
| `/teams/stats?stats=sabermetrics…` | `{"stats": []}` | No team-level sabermetrics. |
| `/teams/{id}/stats?stats=statSplits&sitCodes=sp,rp&group=pitching&season=Y&gameType=R` | 2 splits: Starter / Reliever lines (same counting fields as above) | Jays 2022: SP **827.2 IP**, 3.98 ERA, 782 K; RP **613.2 IP**, 3.77 ERA. **Use per team** — the all-teams variant (`/teams/stats?stats=statSplits…`) returned **50 of 60** splits. 30 calls/season. |
| `/standings?leagueId=103,104&season=2022` | final 2022 standings (Jays 92-70, 2nd AL East, RS 775 / RA 679) | `pull_standings.py --season 2022` works unchanged. |
| `/teams?sportId=1&season=Y` | 30 clubs with `id`, `abbreviation`, `teamName` | Name → id map for Savant (below). |
| `/teams/{id}/stats?…group=fielding&stats=season,sabermetrics` | timed out (`messageNumber 13 "Operation taking longer than expected"`) | Not used; defense comes from Savant OAA. The new fetchers need a small **retry** (3 tries, backoff) — the existing `mlb_api` functions have none. |

**FIP constant check (2022, all 30 clubs):** `cFIP = lgERA − (13·lgHR + 3·(lgBB + lgHBP) − 2·lgSO) / lgIP`
with BB **including** IBB gives **3.106** (FanGraphs 2022 ≈ 3.11) and Jays FIP **3.842**
(vs 3.85 from the IP-weighted player aggregate). Excluding IBB gives 3.139 / 3.843. → Use
**BB incl. IBB** (§10).

**Baseball Savant team leaderboards (CSV, need a browser `User-Agent`, UTF-8 BOM → read with `utf-8-sig`):**

| URL (`&csv=true`) | Rows | Columns used |
|---|---|---|
| `leaderboard/statcast?type=batter-team&year=Y&position=&team=&min=q` | 30 | `team, team_id (abbr), attempts (BBE), avg_hit_speed, avg_hit_angle, anglesweetspotpercent, ev95plus, ev95percent, barrels, brl_percent, brl_pa` |
| same, `type=pitcher-team` | 30 | same, contact allowed |
| `leaderboard/expected_statistics?type=batter-team&year=Y&position=&team=&min=q` | 30 | `pa, bip, ba, est_ba, slg, est_slg, woba, est_woba` |
| same, `type=pitcher-team` | 30 | same, allowed |
| `leaderboard/outs_above_average?type=Fielding_Team&startYear=Y&endYear=Y&split=no&team=&range=year&min=10&pos=&roles=&viz=hide` | 30 | `team_id` (**numeric MLB id**), `outs_above_average` |

- Jays 2022 batting: Barrel% 8.5, Hard-hit% 44.3, avg EV 90.2.
- **Savant uses today's abbreviations retroactively** (`ATH` for the 2022 Athletics, MLB API
  said `OAK`). Map by **`team` (short name) → MLB `teamName`** from `/teams?season=Y` — verified
  30/30 for 2022 and 2025. The OAA CSV already carries numeric MLB ids.
- Percentages arrive as 0–100 (`8.5`) → stored as **fractions** (`0.085`) to match the
  project convention (`web_player_season_stats.k_pct`).

**DB gaps:** `web_standings` and `web_games` have **no 2022–2023 rows** (2024–2026 exist
after P12 M0). `pull_standings.py` / `pull_schedule.py` accept any `--season` with no code
change. `backfill.py` does **not** (its `WINDOWS` only has 2024–2026 and every step is
Statcast-heavy) — **don't extend it**; P13 loops the light scripts.

## 1b. What P13 takes from P12 (verify after the merge)

| From P12 (as built) | Used by P13 |
|---|---|
| `013` `web_games.game_type`; schedule + standings now 2022–2026 (2022–2023 loaded by P13 N0) | ④ splits / trajectory (`game_type = 'R'`), Season-strip postseason result (F/D/L/W rows) |
| `019` `web_league_season` (`pull_league_averages.py`, same `/teams/stats` source; SLG from the API's `totalBases`) | N1 reconciliation: `web_v_mlb_season` must **equal** its MLB row. N1 also runs `pull_league_averages.py --season 2022 --season 2023` (additive rows) so all five seasons are checked and P12's 2022/2023 season pages get league context. |
| `lib/team-season.ts` (pure): `TeamGame`, `winLoss`, `runs`, `gamesAboveSeries`, `seasonSplits` (`home away oneRun blowouts vsDivision vsWinning vsLosing`, `BLOWOUT_MARGIN = 5`) | ④ calls them **per season** — no second implementation. "vs AL East" = `vsDivision`. |
| `lib/team-season-data.ts`: `getTeamSeasons()` (seasons with R finals, `cache`d), `getTeamGames(season)` | Loaders for ④ and the Season strip; `getTeamSeasons` also bounds the window. |
| `components/season/SeasonTrendChart.tsx` (2 seasons via `overlayByGame`) | ④ **generalises it to N seasons** (or wraps a shared core) rather than forking; M5 keeps its 2-season look. |
| `lib/season-deltas.ts`: `Direction` (`higher | lower | neutral`), `deltaTone` | `lib/team-metrics.ts` reuses the `Direction` type. |
| `components/PercentileBars.tsx` `scaleColor` (steel → neutral → brick via `color-mix`) | Extracted to `lib/percentile-color.ts`; rank shading (T9). |
| M7 `Exportable` (PNG of the largest `<svg>`), `CopyTableButton` (`headers`, `rows` → TSV) | Every P13 chart / table. |
| `Header.tsx` `Nav.team` → `/season/<getLatestTeamSeason()>` | N2 repoints it to `/team` (T7). |
| M1 `etl/season_report.py` | N6 adds `team_trends.md/.csv` |
| `fetch_team_season_stats` takes each player's numbers from `/people/{id}/stats` | **Not reused for 30 clubs** (≈ 1,200 calls/season). P13 has its own leaderboard-only fetcher (T6). |
| `web/lib/team-abbr.ts::teamAbbr`, `TeamLogo` | leader labels in tooltips |

---

## 2. N0 — Team data (ETL)

1. **Migration `020_team_season_stats.sql`** → `web_team_season_stats`, PK `(season, team_id)`,
   all `int` unless noted, nullable except keys:
   - `games`
   - batting: `bat_pa, bat_ab, bat_h, bat_2b, bat_3b, bat_hr, bat_bb, bat_ibb, bat_hbp, bat_so,
     bat_sf, bat_sb, bat_cs, bat_r, bat_gidp` · advanced: `bat_pitches, bat_swings, bat_whiffs,
     bat_gb, bat_fb, bat_ld, bat_pu` (outs + hits per type)
   - pitching: `pit_outs, pit_bf, pit_ab, pit_h, pit_r, pit_er, pit_hr, pit_bb, pit_ibb, pit_hbp,
     pit_so, pit_sf, pit_sv, pit_bs, pit_hld` · advanced: `pit_pitches, pit_swings, pit_whiffs,
     pit_qs, pit_gb, pit_fb, pit_ld, pit_pu`
   - role split: `sp_gs, sp_outs, sp_bf, sp_h, sp_er, sp_hr, sp_bb, sp_hbp, sp_so` and
     `rp_outs, rp_bf, rp_h, rp_er, rp_hr, rp_bb, rp_hbp, rp_so`
   - sabermetric aggregates (`numeric`): `bat_wrc_plus` (PA-weighted), `bat_war` (Σ), `pit_war` (Σ)
   - `updated_at timestamptz not null default now()`
   - Index `(season)`. Comment the table: 30 clubs, regular season, T6 aggregation rules.
2. **Migration `021_team_statcast_season.sql`** → `web_team_statcast_season`, PK `(season, team_id)`:
   for `bat_` and `pit_`: `bbe int, barrels int, ev95plus int, brl_pct, brl_pa, hard_hit_pct,
   sweet_spot_pct, avg_ev, avg_la, xpa int, ba, xba, slg, xslg, woba, xwoba` (`numeric`, fractions
   for the %s) + `oaa int`. Absent = NULL, **never 0**.
3. **`etl/mlb_api.py`** — add, don't change existing functions:
   - `_get_json(url, params, tries=3)` — retry on 5xx / timeout / `messageNumber` bodies.
   - `fetch_all_team_stats(season) -> dict[int, dict]` — `season` + `seasonAdvanced`, both
     groups, keyed by team id, raw stat dicts merged under `hitting` / `pitching`.
   - `fetch_team_role_splits(season, team_id) -> {"sp": stat, "rp": stat}`.
   - `fetch_team_player_leaderboard(season, group, team_id) -> list[dict]` — the plain
     leaderboard call (`season,sabermetrics`), **no** `/people` patching (T6).
   - `fetch_teams(season) -> list[dict]` — `{id, abbreviation, teamName}` for the name map.
4. **`etl/pull_team_stats.py --season Y [--season Y2 …]`** (`action="append"`, default =
   current season) → per season: one `fetch_all_team_stats`, 30 × `fetch_team_role_splits`,
   60 × `fetch_team_player_leaderboard` → aggregate (wRC+ weighted by that player's PA from the
   same call; players with NULL wRC+ or 0 PA skipped; IP via outs, never the `170.1` string) →
   `db.upsert_team_season_stats`. `time.sleep(0.2)` between calls. Warn if ≠ 30 clubs.
5. **`etl/pull_team_statcast.py --season Y [--season …]`** → the five Savant CSVs → name→id map
   (§1) → `db.upsert_team_statcast_season`. **Fail loudly** if any row doesn't map (a renamed
   club must be fixed, not skipped).
6. **`etl/db.py`**: `TEAM_SEASON_COLUMNS` / `upsert_team_season_stats` and
   `TEAM_STATCAST_COLUMNS` / `upsert_team_statcast_season`, in the column-list style of
   `upsert_standings` — **plain overwrite** (no `coalesce`: a corrected value must win).
7. **Backfill (one-shot, conda env):**
   ```
   conda run -n MLBxBaZi python etl/pull_standings.py --season 2022
   conda run -n MLBxBaZi python etl/pull_standings.py --season 2023
   conda run -n MLBxBaZi python etl/pull_schedule.py  --season 2022
   conda run -n MLBxBaZi python etl/pull_schedule.py  --season 2023
   conda run -n MLBxBaZi python etl/pull_team_stats.py     --season 2022 --season 2023 --season 2024 --season 2025 --season 2026
   conda run -n MLBxBaZi python etl/pull_team_statcast.py  --season 2022 --season 2023 --season 2024 --season 2025 --season 2026
   ```
   No box scores for 2022–2023 (P13 never reads players for those seasons).
8. **Cron** (`.github/workflows/etl.yml`, **refresh** job only — the nightly-finals job
   has no need for it): after `pull_standings`, `pull_team_stats.py --season $SEASON` and
   `pull_team_statcast.py --season $SEASON`. Offseason runs are harmless re-upserts.

**Verify (read-only SQL):**
- 30 rows per season 2022–2026 in both tables; no NULL `bat_pa` / `pit_outs`; `sp_outs + rp_outs = pit_outs` for every row.
- Jays 2022: `bat_pa` 6158, `bat_r` 775, `pit_r` 679, `bat_wrc_plus` ≈ 117.9, `bat_war` ≈ 33.6,
  `pit_war` ≈ 15.3, `sp_outs` 2483 (827.2 IP), `rp_outs` 1841 (613.2 IP), `bat_brl_pct` 0.085.
- `web_standings` 2022 Jays 92-70; `web_games` 2022 and 2023: 162 `R` rows each whose W/L equals
  `web_standings`; 2022 has 2 `F` rows, 2023 has 2 `F` rows (both Wild Card Series losses).
- **Staleness check (T6):** for each Jays season 2024–2026, the leaderboard-aggregated `bat_wrc_plus`
  is within ±1 of the PA-weighted wRC+ from `web_player_season_stats`, and `bat_war + pit_war`
  within ±1.0 of its Σ WAR. If 2026 fails, re-run after a few days (the leaderboard settles —
  P12 saw it lag right after the season) and note it in DATA_MODEL.

## 3. N1 — Metric views (migration `022_team_metric_views.sql`)

- **`web_v_mlb_season`** — one row per season from Σ of the 30 clubs: every §10 rate at MLB
  level, plus `lg_rpg` (Σruns / Σgames) and `cfip` (the FIP constant).
- **`web_v_team_season`** — one row per `(season, team_id)`: every §10 rate, joined with
  `web_standings` (`w, l, pct, runs_scored, runs_allowed, run_diff, x_w, x_l, division_rank,
  division_name, team_abbrev`), `luck = w − x_w`, run sources (`offense_runs`, `prevention_runs`,
  §10), and a `<metric>_rank` column for every ranked metric, computed with
  `rank() over (partition by season order by <metric> {desc|asc} nulls last)` per §10 direction;
  NULL metric → NULL rank (`case when <metric> is null then null else rank() … end`).
- All rates `float8`, fractions (not ×100). Comment every column with its §10 formula.

**Verify:**
- MLB OBP / SLG / OPS / ERA / K% / BB% in `web_v_mlb_season` == `web_league_season` (MLB row) for
  every season they share, to ±0.0005 (same source, same summing rule — any gap is a bug).
- For one season: rank 1 ERA = lowest ERA; rank 1 wRC+ = highest; rank 1 batting K% = lowest;
  rank 1 pitching K% = highest; one tied metric shows two equal ranks and a skipped next rank.
- `offense_runs + prevention_runs = run_diff` for every row (exact).
- Σ over teams of `offense_runs` ≈ 0 per season (≤ ±1 from rounding of `lg_rpg`).
- The direction of every ranked metric in the view == `direction` in `lib/team-metrics.ts`
  (a small node/tsx or SQL assertion in the N1 commit message is enough; don't add a test runner).

## 4. N2 — Page shell, nav, Season strip, module ①

- **`web/lib/team-trends.ts`** (server): `getTrendSeasons()` (latest `TREND_SEASONS` seasons with
  30 rows), `getTeamTrend(seasons)` → the 30-club rows of `web_v_team_season` for the window
  (needed for leaders in tooltips) + `web_v_mlb_season` rows; `getJaysGames(seasons)` (reuse
  P12 M5's loader if it takes a season list; otherwise extend it — don't fork it);
  `getPostseasonResult(season)` (see §10). `float8` casts as in `lib/standings.ts`.
- **`web/lib/team-metrics.ts`**: the registry — `{ key, column, rankColumn, group:
  'record'|'offense'|'prevention'|'rotation'|'bullpen', format, direction:
  'higher'|'lower'|'neutral', hintKey }`. Formatters reuse `lib/standings.ts` (`pct3`, `diff`,
  `record`); add only what's missing (`pct1` for fractions → "8.5%", `ord` for "3rd" / "T-3rd").
- **`web/app/[locale]/team/page.tsx`**: `setRequestLocale`, `getTranslations("Team")`, the
  standings-page skeleton (`max-w-5xl`, `Reveal` header), one `ScorecardFrame variant="panel"`
  per module (content `relative z-10`), `revalidate = 3600`, empty state when < 1 season.
- **`Header.tsx`**: repoint P12's `Nav.team` link from `/season/<latest>` to `/team` (T7);
  the key and both locale strings already exist.
- **`components/team/SeasonStrip.tsx`** (server): one cell per season — W-L, finish
  ("2nd · AL East"), postseason result, run diff; links to `/season/[year]`; current season
  marked "in progress" when `games < 162` and not final.
- **`components/team/RunSourcesChart.tsx`** (client, Recharts): per season, stacked diverging
  bars (`stackOffset="sign"`) — offense runs above average (brick) and run-prevention runs above
  average (navy) — with a lava marker for the net (= run diff). `ReferenceLine y={0}` like
  `WarBreakdown`. Footnote: "About 10 runs ≈ 1 win." Legend doubles as a data table (the
  `WarBreakdown` pattern). `WhenInView` + `useReducedMotion`.
- **`components/team/LuckTable.tsx`** (server): Season · W-L · Expected W-L (`x_w-x_l`) ·
  Luck (signed, `W − xW`) · One-run record · Run diff · MLB rank of run diff. Chrome from
  `standings-chrome.ts` — add a generic **`stripeBg(index, highlight = false)`** next to
  `rowBg` (which is typed to `StandingsRow`); `rowBg` keeps its behaviour.

## 5. N3 — Module ② Offense vs MLB

- **`components/team/RankGrid.tsx`** (client — it owns the toggle and the tooltip; data arrives
  as plain props from the server page): rows = the §10 offense metrics in registry order,
  columns = seasons (oldest → newest, newest bold). Cell = value + ordinal rank, shaded per T9.
  Neutral rows (GB% / FB% / LD% / PU%) under a "Batted-ball mix" sub-header, unshaded.
  - Toggle **Value | vs MLB** (`SlidingPill`, `ScorecardFrame variant="control"`): vs MLB shows
    the index `100 × team / MLB` (wRC+ is already an index — show it unchanged).
  - Hover **and keyboard focus** (cells `tabIndex={0}`) open a tooltip: MLB average, MLB leader
    (`TeamLogo` + abbr + value), Jays raw total where it helps (e.g. "200 HR"). Use
    `ChartTooltip` + `useLingeringHover` (CLAUDE.md Motion rule — never `hovered && <div>`).
  - Sticky first column + `overflow-x-auto` for phone widths.
  - The same component serves ③ (props: `metrics`, `rows`, `mlb`, `seedKey`).
- **`components/team/TrendSmallMultiples.tsx`** (client, Recharts): 2 × 2 — wRC+, K%, BB%,
  Barrel%. Jays line brick with dots, MLB average navy dashed (`strokeDasharray="4 3"`); x = season.
  Tooltip shows both values + rank. Axis styling from `charts/VeloTrendChart.tsx`.
- **Contact-luck chip** per season: wOBA − xwOBA with the P12 M6 wording ("hit into bad luck" /
  "outperformed contact"); reuse P12's chip component if it's generic, else a small local one.

## 6. N4 — Module ③ Run prevention vs MLB

- `RankGrid` with the §10 prevention metrics (incl. OAA and Barrel% / Hard-hit% / xwOBA allowed).
- **`components/team/RotationBullpenTable.tsx`** (server): per season two rows (SP / RP) —
  IP share, ERA, FIP, K-BB%, each with the MLB rank among the 30 rotations / 30 bullpens;
  shading per T9.
- **ERA − FIP note** per season (text): positive = runs allowed exceeded what the pitchers'
  K/BB/HR predicted (defense or sequencing), negative = the reverse. Plain English, no colour.

## 7. N5 — Module ④ Trajectory + splits

- **`components/team/SeasonTrajectoryChart.tsx`** (client, Recharts): games above .500 by game
  number, one line per season (x = game 1…162). Season chips (`SlidingPill`) pick the
  highlighted season (brick, 2 px); the others steel 35 %. Default highlight = newest season.
  End-of-line labels with the final W-L. Built on P12 M5's games-above-.500 helper, generalised
  to N seasons (update M5 to call the generalised version so there's one implementation).
- **`components/team/TeamSplitsTable.tsx`** (server): rows = seasons; columns = one-run,
  blowouts (margin ≥ 5), vs .500+ opponents (opponent's **final** pct in `web_standings` that
  season), vs AL East, home, away. W-L + pct per cell. Reuse P12 M5's split helpers.
- Extra-inning record is **not** included — `web_games` stores no innings (backlog).

## 8. N6 — Callouts, glossary, article pack, docs

- **`web/lib/team-callouts.ts`** (pure): per season, the **3 best and 3 worst** ranks among
  non-neutral registry metrics (ties broken by registry order; skip NULL ranks). Returns
  `{ season, metricKey, rank, tied, side }` — no strings.
- **`components/team/StrengthsWeaknesses.tsx`** (server): chips "1st in MLB · K%" + the metric's
  one-line hint (the same hint the glossary uses — no per-metric sentence explosion).
- **`components/team/TeamGlossary.tsx`** (server): every registry metric's hint, grouped; sources
  (MLB Stats API, Baseball Savant; wRC+/WAR are FanGraphs data licensed to MLB); the 2023
  rule-change note; "Expected W-L is MLB's own Pythagorean record".
- **Article pack:** `etl/season_report.py` writes `team_trends.md` + `team_trends.csv`
  (season × metric: Jays value, MLB average, rank) from `022` views only — same numbers as the site.
- M7 PNG export on `RunSourcesChart`, `TrendSmallMultiples`, `SeasonTrajectoryChart`;
  copy-table on `RankGrid` (current mode), `LuckTable`, `RotationBullpenTable`, `TeamSplitsTable`.

## 9. i18n

English first, then zh-TW, key parity; new namespace **`Team`** (+ `Nav.team`). Stat names stay
English in both (wRC+, OPS, ISO, BABIP, K%, BB%, Barrel%, Hard-hit%, xwOBA, ERA, FIP, WHIP,
K-BB%, HR/9, OAA, WAR, R/G, RA/G, SP, RP). Translated: headings, module questions ("Were they as
good as their record?"), hints, notes, glossary prose, postseason labels. Ordinals: English
"1st / 2nd / T-3rd"; zh-TW 「第 1 名 / 並列第 3」. Team names follow the P11 rule (English).

## 10. Formulas, directions & conventions

Counting-stat names are the `web_team_season_stats` columns; `IP = outs / 3`; `G = games`.
MLB versions use the same formula on Σ over 30 clubs (T3).

| Metric | Formula | Direction | Group |
|---|---|---|---|
| R/G | `bat_r / G` | higher | offense |
| wRC+ | `bat_wrc_plus` (PA-weighted, T6) | higher | offense |
| AVG / OBP / SLG | `H/AB` · `(H+BB+HBP)/(AB+BB+HBP+SF)` · `TB/AB`, `TB = H + 2B + 2·3B + 3·HR` | higher | offense |
| OPS | OBP + SLG | higher | offense |
| ISO | SLG − AVG | higher | offense |
| BABIP | `(H − HR) / (AB − SO − HR + SF)` | higher | offense |
| K% / BB% / HR% | `SO/PA` · `BB/PA` (BB incl. IBB) · `HR/PA` | lower / higher / higher | offense |
| SB/G · SB% | `SB/G` · `SB/(SB+CS)` | higher | offense |
| Whiff% | `bat_whiffs / bat_swings` | lower | offense |
| Barrel% · Hard-hit% · avg EV | `barrels/bbe` · `ev95plus/bbe` · Savant (MLB: BBE-weighted) | higher | offense |
| wOBA · xwOBA | Savant (MLB: `xpa`-weighted); luck chip = wOBA − xwOBA | higher | offense |
| bat WAR | `bat_war` | higher | offense |
| GB% / FB% / LD% / PU% | `bat_gb / (gb+fb+ld+pu)` … | neutral | offense (profile) |
| RA/G | `pit_r / G` | lower | prevention |
| ERA | `9·ER/IP` | lower | prevention |
| FIP | `(13·HR + 3·(BB+HBP) − 2·SO)/IP + cFIP`; `cFIP = lgERA − (13·lgHR + 3·(lgBB+lgHBP) − 2·lgSO)/lgIP`; BB incl. IBB (§1: 2022 cFIP 3.106) | lower | prevention |
| WHIP | `(H+BB)/IP` | lower | prevention |
| K% / BB% / K-BB% (pitching) | `SO/BF` · `BB/BF` · difference | higher / lower / higher | prevention |
| HR/9 | `9·HR/IP` | lower | prevention |
| BABIP against | same formula, pitching columns | lower | prevention |
| Whiff% induced | `pit_whiffs / pit_swings` | higher | prevention |
| Barrel% / Hard-hit% / xwOBA allowed | `pit_` Savant columns | lower | prevention |
| OAA | `oaa` | higher | prevention |
| pitch WAR | `pit_war` | higher | prevention |
| SP / RP ERA, FIP, K-BB% | same formulas on `sp_*` / `rp_*` (same season `cfip`) | as above | rotation / bullpen |
| SP IP share | `sp_outs / pit_outs` | higher | rotation |
| Run diff | `runs_scored − runs_allowed` (standings) | higher | record |
| Run sources | `lg_rpg = Σbat_r / Σgames`; `offense_runs = RS − lg_rpg·G`; `prevention_runs = lg_rpg·G − RA` → sum = run diff | higher | record |
| Luck | `w − x_w` (MLB's expected W-L from `web_standings`) | not ranked | record |
| vs MLB index | `100 × team / MLB` | colour follows rank | display |

```
games above .500   = cumulative (W − L) by game number, (game_date, game_number) order, R only   (= P12 §11)
one-run game       = |jays_score − opp_score| = 1        blowout = margin ≥ 5                     (= P12 §11)
vs .500+           = opponent's final web_standings.pct ≥ .500 that season
postseason result  = from web_games rows with game_type in (F, D, L, W):
                     none → "Missed playoffs"; last game a win in round W → "Won World Series";
                     otherwise "Lost <round of last game>" (F Wild Card Series · D ALDS · L ALCS · W World Series)
```

## 11. What NOT to change

| Item | Reason |
|---|---|
| Migrations `001`–`019` | Never edited or reordered; `020`–`022` are additive. |
| Existing `mlb_api` functions (incl. P12's `fetch_team_season_stats`) | P13 adds new fetchers beside them (T6); don't retrofit retries or change their call patterns. |
| `backfill.py` | Stays the player/Statcast orchestrator; P13 backfills via the light scripts (§2 step 7). |
| `web_standings` grain / `web_games` scope | Snapshot per season; Jays games only. 2022–2023 rows are backfill, not widening. |
| `rowBg` in `standings-chrome.ts` | Add `stripeBg` beside it; the standings tables keep theirs. |
| Player pages / P12 season page behaviour | Only the M5 helpers are generalised (same output for 2 seasons) and `/season/[year]` gains a back-link. |
| FanGraphs | No CSV, no scraping (CLAUDE.md). |
| `ScorecardFrame` / motion internals | Consume them; follow the CLAUDE.md **Motion** rules. |

## 12. Done-when checklist

| # | Criterion |
|---|---|
| N0-1 | Both tables hold 30 rows × 2022–2026; `sp_outs + rp_outs = pit_outs`; Jays 2022 values match §2 Verify. |
| N0-2 | `web_standings` + `web_games` (162 R each, W/L = standings) present for 2022 and 2023. |
| N0-3 | Staleness check passes for 2024–2026 (or the 2026 exception is documented). Cron wired in the refresh job. |
| N1 | `web_v_mlb_season` == `web_league_season` MLB row (±0.0005); rank directions and tie handling verified; run sources sum to run diff. |
| N2 | `/en/team` and `/zh-TW/team` render the Season strip and module ①; the one `Nav.team` link now points to `/team` (no "Season" link anywhere); `/season/[year]` links back. |
| N3 | Offense grid + toggle + keyboard-focus tooltip + small multiples render; the Jays 2022 wRC+ cell reads 118 and its ordinal equals `bat_wrc_plus_rank` in the view. |
| N4 | Prevention grid, rotation / bullpen table with ranks, ERA − FIP notes render. |
| N5 | Trajectory shows 5 seasons with a working highlight; splits table matches `season_report.py`'s `team.md` for 2025 and 2026. |
| N6 | Callouts + glossary render; `team_trends.csv` numbers == site numbers for three spot cells (e.g. 2025 OPS rank, 2023 FIP, 2024 Barrel%). |
| All | `npx tsc --noEmit -p .`, `pnpm lint`, `pnpm build` clean; **no new npm/pip deps**; reduced motion respected; no-JS render readable (`data-reveal`); headless-browser pass on `/en/team` + `/zh-TW/team` at desktop and 375 px; dev server stopped; docs reconciled via `docs/DOC_MAINTENANCE.md` (CLAUDE.md phases row P13, migrations line `020`–`022`, folder tree, cron notes; README; DATA_MODEL for both tables + both views + the Savant name-map and staleness notes; ETL_update_flow; `etl.yml` header) and a §14 "Reconciliation — as built" added here. |

## 13. Backlog (not in P13)

| Candidate | Note |
|---|---|
| AL East rival overlay / AL average | Data is already in the 30-club tables — a toggle on the small multiples. |
| Park-adjusted pitching (ERA-, FIP-), xFIP | Needs park factors / FB definitions; the per-team pitching leaderboard exposes player ERA-/FIP-/xFIP if wanted (IP-weighted). |
| Team plate discipline (Chase%, Z-Swing%) | No team endpoint; would need league-wide Statcast. |
| Extra-inning record | Needs innings per game (linescore) in `web_games`. |
| Seasons before 2022 | Endpoints work back further; 2020 (60 games) would need per-162 scaling. Pre-2022 has no universal DH. |
| Payroll / roster age | No free, reliable source. |

## 14. Reconciliation — as built (2026-09-30)

Branch `feat/p13-team-trends` (not pushed; the owner pushes), one commit per
milestone: `751b7f2` spec + kickoff · `1a11243` Nav.team handoff · `5816b53` N0 ·
`33c5599` N1 · `9670a53` N2 · `4771159` N3 · `43ce884` N4 · `1888779` N5 · N6 (the
commit that adds this section). N0 was built on the P12 branch in a separate
`git worktree` while P12 was still running, then rebased onto `main` after the P12
merge (conflicts only in shared docs / `etl.yml`, resolved keeping both sides).
Migrations used: `020`–`022`. No new npm / pip dependencies.

### What differs from the plan above (and why)

| Where | As built | Why |
|---|---|---|
| N0 | `mlb_api.fetch_team_player_leaderboard` is a plain leaderboard call (no `/people` patch) behind a small `_get_json` retry; `pull_team_stats` cross-checks the Jays row against `web_player_season_stats` and logs a warning outside ±1 wRC+ / ±1.0 WAR. | P12's `fetch_team_season_stats` now calls `/people` per player (~1,200 calls/season for 30 clubs). The check catches the post-season leaderboard lag P12 found. |
| N0 | Savant rows mapped by **team name** → MLB `teamName`; an unmapped name fails the run. | Savant abbreviations are retroactive (`ATH` for the 2022 Athletics, MLB said `OAK`). |
| N1 | Views are layered: `web_v_team_counts` (clubs + an MLB row of summed counts) → `web_v_team_rates` (one formula set for all 31 rows) → `web_v_mlb_season` / `web_v_team_season`. Ranks and raw counts are cast to `int`. | One definition per formula, so the MLB average is always Σ counts → rate. postgres.js returns `bigint` as strings. |
| N1 | `pull_league_averages.py --season 2022 --season 2023` was run (additive rows in P12's `web_league_season`). | All five seasons reconcile, and P12's 2022/2023 season pages gain league context. |
| N2 | **T9 amended:** rank shading uses P12's percentile scale, extracted to `lib/percentile-color.ts` (`percentileColor` / `rankPercentile` / `rankTint`); `PercentileBars` imports it. `ordinal` moved from the season page to `lib/ordinal.ts` (+ tied form). `stripeBg` added to `standings-chrome.ts` and the season page uses it. | One good-vs-bad scale site-wide; no duplicated helpers. |
| N3 | `TORONTO_TEAM_ID` moved to db-free `lib/team-ids.ts` (`lib/standings.ts` re-exports it); `standings-chrome.ts` imports it from there. | The client `RankGrid` imports `standings-chrome`, which pulled `lib/db.ts` (postgres) into the browser bundle — a build error. |
| N3 | Rank-grid card clamped inside the grid and `w-max`; "Best in MLB that season" when the leader is the Jays; trend charts use straight segments and round ticks in display units. | Phone readability; five points shouldn't be smoothed into invented curves. |
| N4 | **Added** trend small multiples for run prevention (RA/G, FIP, K-BB%, Hard-hit% allowed). ERA − FIP threshold 0.15 runs / 9, with the team OAA beside it. Sticky season column on the rotation / bullpen table. | Symmetry with ② at no new code; the table is 806 px wide on phones. |
| N5 | **Splits table transposed:** rows = splits, columns = seasons (the plan said the reverse); `vsLosing` included; no extra-inning record. `SeasonTrajectoryChart` is a new component; the shared part is the data merge — `lib/season-deltas.ts::mergeByGame` (N series), with P12's `overlayByGame` re-implemented on it (same output). PNG export wraps the chart only. | Split labels are long, seasons short. The trajectory needs N lines + a highlight picker, unlike M5's 2-season chart. Innings per game aren't stored. The PNG button covered the chips on phones. |
| N6 | **Callouts** come from 17 distinct skills (`CALLOUT_KEYS`: scoring, wRC+, power, K%, BB%, speed, Barrel%, Hard-hit%, RA/G, FIP, K-BB%, HR/9, Barrel% allowed, OAA, rotation FIP, bullpen FIP, rotation depth), **only top-10 / bottom-10 ranks**, up to 3 each, with descriptive labels ("Bullpen (FIP)"). The plan said "3 best / 3 worst among all non-neutral metrics". | OPS / OBP / SLG / AVG / wOBA move together — the plain rule printed one fact three times; a 14th place isn't a strength; bare labels repeat across sides (Barrel% hit vs allowed). |
| N6 | Glossary = method notes + every metric's hint in a `<details>` (works without JS). `season_report.py` writes `team_trends.md/.csv` with a Python label list mirroring `lib/team-metrics.ts` (values / MLB averages / ranks read from the `022` views). | Page length; labels are the only duplication, numbers are single-sourced. |

### Done-when (§12) — results

| # | Result |
|---|---|
| N0-1 | Both tables 30 clubs × 2022–2026; `sp_outs + rp_outs = pit_outs` everywhere; Jays 2022 PA 6158 / R 775 / RA 679 / wRC+ 117.9 / WAR 33.6 + 15.3 / SP 2483 + RP 1841 outs / Barrel% 0.085; balls in play 4,354 = Savant BBE. |
| N0-2 | `web_standings` + `web_games` for 2022 and 2023: 162 R games each with W/L = standings (92-70, 89-73); 2 `F` rows each (Wild Card Series losses). |
| N0-3 | Staleness check: 2024 wRC+ 101.1 vs 100.8, 2025 exact, 2026 94.2 vs 94.3 (WAR 34.8 vs 35.3) — within tolerance. Both scripts in the refresh cron. |
| N1 | `web_v_mlb_season` OBP / SLG / OPS / ERA / K% / BB% == `web_league_season` MLB row for 2022–2026 to ≤ 4e-15; rank 1 = min ERA / max wRC+ / min batting K% / max pitching K% every season; ties skip (three at 11th → 14th); offense + prevention runs == run diff and RS / RA == standings for all 150 club-seasons; Σ offense runs = 0; cFIP 2022 3.106. Registry directions == view rank order (45 ranked + 4 neutral). |
| N2 | `/en/team` + `/zh-TW/team` render the strip and module ①; one `Nav.team` → `/team`; `/season/[year]` has "← Team trends"; 2026 run diff shows T-21st. |
| N3 | Grid, Value \| vs MLB toggle (WAR +14.6 / +13.6), hover / focus / tap card (K% 2025: 17.8%, 1st of 30, MLB 22.2%), small multiples; Jays 2022 wRC+ cell 118 (2nd) = view. |
| N4 | Prevention grid, rotation / bullpen with ranks (2024 bullpen ERA 4.82, 29th; FIP 4.84, 30th), ERA − FIP notes (2023: 0.27 fewer runs than FIP). |
| N5 | Trajectory: 5 seasons, chip + line-click highlight. Splits equal the P12 season page cell by cell (2025: 54-27 / 40-41 / 27-20 / 25-23 / 29-23 / 49-41 / 45-27; 2024 too). P12 regressions: season-page overlays and Vladdy's rolling-OPS prior line unchanged. |
| N6 | Callouts + glossary render (en 1280, zh-TW 375); `team_trends.csv` == site for 2025 OPS (.761, 3rd), 2025 K% (17.8%, 1st), 2024 Barrel% (7.2%, 21st), 2023 FIP (4.05, 7th). |
| All | `tsc --noEmit`, `pnpm lint` (the one pre-existing SprayChart warning), `pnpm build` clean after every milestone; no new deps; reduced motion and no-JS checked (N2); real-time headless Chrome (CDP) at 1280 and 375 px; en / zh-TW key parity (588 each); dev servers stopped; docs reconciled (CLAUDE.md, README, DATA_MODEL, ETL_update_flow, `etl.yml` header). |

### Left for later (not in P13)

- The §13 backlog (AL East rival overlay / AL average, park-adjusted pitching, team
  plate discipline, extra-inning record, pre-2022 seasons).
- `pull_league_averages.py` (P12) and `mlb_api.fetch_all_team_stats` (P13) both call
  `/teams/stats`; the league script could reuse the P13 fetcher.
- `docs/P13_kickoff.md` (and P12's) are point-in-time launchers: archive or delete.
