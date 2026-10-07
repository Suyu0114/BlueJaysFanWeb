# Data Model — `web_*` tables

The **living** reference for this app's database. Prose description of every
table and column, the invariants the ETL relies on, and — just as important —
the columns that **don't** exist so nobody assumes them.

> **Source of truth & how to keep it honest.** This file is generated from
> `db/migrations/*.sql` and verified against the live database's
> `information_schema.columns`. **When you change the schema (a new migration),
> update this file in the same change.** To re-verify, dump the columns for every
> table below and diff — the verification recipe is at the bottom.
>
> **Verified against live DB: 2026-09-30** (migrations `001`–`019` applied, plus
> P13's `020`–`022`; `023` applied 2026-10-04 — `web_player_position_splits` at 17;
> `024` + `025` applied 2026-10-05 — `web_team_position_splits` at 17, `web_v_team_position` at 13;
> `026` applied 2026-10-06 — `web_article_views` at 3, RLS enabled;
> `027` applied 2026-10-06 — REST API lockdown: RLS on all 19 tables, the 9 views
> `security_invoker`, no `anon` / `authenticated` grants (invariant 11);
> `web_player_season_stats` at 32 columns, `web_statcast_events` at 29,
> `web_standings` at 38, `web_games` at 17, `web_player_team_season_stats` at 37,
> `web_team_season_stats` at 69, `web_team_statcast_season` at 36).
>
> This Supabase project is **shared** with other projects, so every table here is
> prefixed `web_`. See CLAUDE.md → "Supabase tables are shared — prefix everything
> with `web_`" for the rule and why.

---

## Table index (live row counts @ 2026-09-29)

| Table | Rows | Grain | Source |
|---|---:|---|---|
| [`web_players`](#web_players) | 1,828 | one row per MLBAM player | MLB Stats API roster + bio |
| [`web_statcast_events`](#web_statcast_events) | 235,474 | one row per pitch | Baseball Savant (Statcast) |
| [`web_player_season_stats`](#web_player_season_stats) | 178 | one row per (player, season) — **Jays only** | MLB Stats API `season` + `sabermetrics` (FanGraphs-licensed); nightly |
| [`web_player_team_season_stats`](#web_player_team_season_stats) | 324 | one row per (player, season, club) + season total (`team_id = 0`) — **every club** | MLB Stats API `/people/{id}/stats`; history one-shot + nightly (P12) |
| [`web_player_position_splits`](#web_player_position_splits) | 253 | one row per (player, season, position batted at) — **Jays only** | MLB Stats API `statSplits` by position (`sitCodes`); nightly (post-P13, @ 2026-10-04) |
| [`web_player_seasons`](#web_player_seasons) | 178 | one row per (player, season, team) | derived during ETL |
| [`web_fielding_frv`](#web_fielding_frv) | 1,808 | one row per (player, season, position) | Baseball Savant OAA leaderboard |
| [`web_id_map`](#web_id_map) | 0 | one row per MLBAM id | Chadwick register (lazy cache) |
| [`web_games`](#web_games) | 832 | one row per game_pk | MLB Stats API schedule |
| [`web_player_game_stats`](#web_player_game_stats) | 7,716 | one row per (game, player, stat group) | MLB Stats API boxscore |
| [`web_standings`](#web_standings) | 150 | one row per (team, season) — snapshot | MLB Stats API standings |
| `web_savant_percentiles` | 205 | (player, season, role) | Savant percentile ranks (P12 M6) |
| `web_savant_season` | 87 | (player, season) | Savant expected stats + barrels (P12 M6) |
| `web_pitch_arsenal_rv` | 595 | (player, season, pitch type) | Savant pitch run value (P12 M6) |
| `web_league_season` | 15 | (season, league) | MLB Stats API team totals, summed (P12 M6; 2022–2023 added by P13 N1) |
| [`web_team_season_stats`](#web_team_season_stats) | 150 | one row per (season, club) — **all 30 clubs**, counts | MLB Stats API team stats + per-club player leaderboard (P13) |
| [`web_team_statcast_season`](#web_team_statcast_season) | 150 | one row per (season, club) — **all 30 clubs** | Baseball Savant team leaderboards (P13) |
| [`web_team_position_splits`](#web_team_position_splits) | 1,606 | one row per (season, club, position batted at) — **all 30 clubs**, counts | MLB Stats API team `statSplits` by position; refresh cron (post-P13, @ 2026-10-05) |
| [`web_article_views`](#web_article_views) | 0 | one row per article slug | the site itself: `POST /api/views/[slug]` (post-P13, @ 2026-10-06) |

---

## ⚠️ Columns that DO NOT exist (anti-index)

Read this before assuming a column. Each of these has been assumed at least once
and is genuinely absent:

| Assumed column | Where on | Reality |
|---|---|---|
| `bb_type` | `web_statcast_events` | **Absent.** `docs/P7_spec.md:360` backlog assumed GB/FB/LD can be derived from it. They cannot — it was never pulled into the schema. To add GB/FB/LD you must extend the ETL (`STATCAST_COLUMNS` + a migration) or approximate from `launch_angle`. |
| `launch_speed_angle` / barrel flag | `web_statcast_events` | **Absent.** Statcast's per-event barrel classification is not stored. The P8 EV/LA "barrel zone" is a *visual reference rectangle only*, not per-point truth. |
| `position` as a **per-season** position | `web_players` | **It is the player's CURRENT MLB primary position** (bio), one value per player, overwritten by every ETL run — Bichette's 2025 row read `3B` once the Mets moved him there. A season's position = his most-PA position in [`web_player_position_splits`](#web_player_position_splits) (PH / P excluded), which the season-page readers resolve (`lib/season-position.ts` `seasonPosition`). A departed player's player-page header and all-time roster card show his **last Jays** position (`lastJaysPosition`, same file). |
| `name_tc` (Chinese name) | `web_players` | **Intentionally absent.** Single English `name` field by design — see CLAUDE.md → "What stays English even in zh-TW". Do not add it. |
| `woba` / `babip` / per-event run value | `web_statcast_events` | **Absent.** Only the raw Statcast fields below are stored; sabermetric aggregates live in `web_player_season_stats` (season grain), not per pitch. |
| `games_back` as a **number** | `web_standings` | **It is `text`, not numeric** — and deliberately so. MLB sends display strings with sentinels: `'-'` (this team *is* the reference), `'+9.5'` (ahead of the wild card cut line), `'E'` (eliminated, on `elimination_number`). Same for `wc_games_back`, `elimination_number`, `wc_elimination_number`, `magic_number`. Never cast or arithmetic them; **order by the `*_rank` columns instead.** |
| `fip` / `era` / any rate or rank | `web_team_season_stats`, `web_team_statcast_season` | **Absent by design (P13 T4).** The team tables hold counts (+ `bat_wrc_plus` / `bat_war` / `pit_war`); team rates, FIP (from counts + the league constant), MLB averages and ranks are computed in the P13 `022` views. Don't add rate columns — they'd drift from the views the article pack reads. |
| `standings_date` / any date dimension | `web_standings` | **Absent by design (P11 D2).** The table is a *snapshot*, overwritten nightly — 30 rows per season, not one row per day. A GB-over-time race chart needs a new column + PK change first. |

---

## `web_players`
*Migration: `001` (+ `003` added the three `birth_*` columns). Writer:
[`etl/db.py`](../etl/db.py) `upsert_players` / `upsert_players_full`. Conflict key: `(mlbam_id)`.*

**Not just Blue Jays.** `web_statcast_events.batter_id` and `.pitcher_id` are FKs
into this table, so **every opponent batter/pitcher a Jay has faced is also here**
— that's why it holds ~1,800 rows, not ~26. To identify actual Jays use
[`web_player_seasons`](#web_player_seasons) / `is_active_26`, not membership in this table.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `mlbam_id` | bigint | NO | **PK.** MLBAM player id. |
| `name` | text | NO | English display name (e.g. `Vladimir Guerrero Jr.`). |
| `position` | text | yes | **Current** MLB primary position (`/people` `primaryPosition`; `P` for pitchers), overwritten on every run — a bio field, **not** the position he played in a past season (see the anti-index + [`web_player_position_splits`](#web_player_position_splits)). |
| `bats` | char(1) | yes | `L` / `R` / `S`. |
| `throws` | char(1) | yes | `L` / `R`. |
| `is_active_26` | boolean | yes | On the 26-man active roster (set by `roster.py`). |
| `headshot_url` | text | yes | MLB headshot. |
| `birthdate` | date | yes | From MLB Stats API `/people`. |
| `birth_city` | text | yes | BaZi v2 prep (`003`). |
| `birth_state_province` | text | yes | BaZi v2 prep (`003`). |
| `birth_country` | text | yes | BaZi v2 prep (`003`). |

---

## `web_statcast_events`
*Migration: `001` (+ `004` added `plate_alignment`; + `011` added the P10 pitch
detail: `pfx_x`/`pfx_z`/`release_extension`/`estimated_woba`/`balls`/`strikes`).
Writer: [`etl/db.py`](../etl/db.py) `upsert_statcast_events`. Conflict key:
`(game_pk, batter_id, pitcher_id, at_bat_number, pitch_number)`.*

The big one (~235k rows). One row per pitch. **The writer inserts a hardcoded
column list** (`STATCAST_COLUMNS`, [etl/db.py:245-256](../etl/db.py)) — it does
**not** take the df∩table intersection, so a column added to the table is *not*
written until that list is also updated.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `id` | bigint | NO | **PK**, bigserial surrogate. |
| `game_pk` | bigint | NO | MLB game id (part of the unique key). |
| `game_date` | date | NO | Game date. |
| `game_type` | char(1) | yes | `R` = regular season; postseason rows also exist (see invariants). |
| `batter_id` | bigint | NO | FK → `web_players`. |
| `pitcher_id` | bigint | NO | FK → `web_players`. |
| `at_bat_number` | int | NO | Part of the unique key. |
| `pitch_number` | int | NO | Part of the unique key. |
| `event` | text | yes | At-bat outcome (`single` / `home_run` / `field_out` / …); null on non-terminal pitches. |
| `description` | text | yes | Per-pitch result (`called_strike` / `ball` / `hit_into_play` / …). Includes pitch-clock `automatic_ball` / `automatic_strike` rows, which are **not thrown pitches** — exclude them when counting pitches (they are exactly the gap to the API's `numberOfPitches`). |
| `pitch_type` | text | yes | `FF` / `SL` / `CH` / … |
| `release_speed` | numeric | yes | mph. |
| `spin_rate` | numeric | yes | rpm. |
| `plate_x` | numeric | yes | Horizontal plate location, ft. **Reference frame depends on `plate_alignment`.** |
| `plate_z` | numeric | yes | Vertical plate location, ft. Same caveat. |
| `hc_x_feet` | numeric | yes | Spray x, **pre-transformed in ETL** from raw `hc_x` (not raw Savant units). |
| `hc_y_feet` | numeric | yes | Spray y, pre-transformed. |
| `launch_speed` | numeric | yes | Exit velocity, mph (only on batted balls). |
| `launch_angle` | numeric | yes | Launch angle, degrees (only on batted balls). |
| `stand` | char(1) | yes | Batter handedness `L` / `R`. |
| `p_throws` | char(1) | yes | Pitcher handedness `L` / `R`. |
| `zone` | int | yes | Savant strike-zone cell (1–14). |
| `plate_alignment` | text | yes | `front` (≤2025) or `middle` (≥2026) — which plate reference frame `plate_x`/`plate_z` use. |
| `pfx_x` | numeric | yes | Horizontal movement vs a spinless pitch, **feet, catcher's perspective** (`011`). Charts flip the sign for pitcher's view and convert to inches. Release-frame → alignment-agnostic. |
| `pfx_z` | numeric | yes | Vertical movement vs a spinless pitch, feet (`011`). |
| `release_extension` | numeric | yes | Feet toward home at release (`011`). Stored but not yet consumed by the web app. |
| `estimated_woba` | numeric | yes | Savant `estimated_woba_using_speedangle` (`011`). ⚠️ **Not only on batted balls**: Savant also fills it on PA-ending non-contact pitches (K/BB/HBP) with the event's wOBA constant. Anything computing "xwOBA on contact" must gate on `description = 'hit_into_play'` (as `lib/pitch-arsenal.ts` does). |
| `balls` | int | yes | Count **before** the pitch, 0–3 (`011`). |
| `strikes` | int | yes | Count **before** the pitch, 0–2 (`011`). ⚠️ Unrelated to `web_player_game_stats.strikes` (strikes *thrown* in a game). |

---

## `web_player_season_stats`
*Migration: `001` (+ `008` added `war_*` / `rar` / `wpa`; + `009` added the
`avg`/`obp`/`slg`/`hr`/`rbi`/`sb`/`pa` basic line; + `010` added the pitcher line
`w`/`l`/`sv`/`gs`/`ip`/`whip`/`k_pct`/`bb_pct`). Writer:
[`etl/pull_season_stats.py`](../etl/pull_season_stats.py). Conflict key: `(mlbam_id, season)`.*

Pre-aggregated season lines from the **MLB Stats API** (`/stats?stats=season,sabermetrics&teamId=141`,
free, no key) — replaced the manual FanGraphs CSV export on 2026-09-23 when the
paid membership lapsed. The `sabermetrics` block is FanGraphs data licensed to
MLB, so `war` / `wrc_plus` / `fip` / the `war_*` Value components are the same
numbers the CSVs carried (verified vs the 2025 export: WAR ±0.05, the rest within
rounding). Refreshed for the current season by the ~09:00 ET cron. Rows are
**team-scoped** (a traded player's row covers his Blue Jays games only; his line
with other clubs is in [`web_player_team_season_stats`](#web_player_team_season_stats)).
The team leaderboard only **enumerates** players — each player's numbers come from
his own `/people/{id}/stats` split for Toronto, because the leaderboard's
sabermetrics block can lag (Known gaps #7). The
`war_*` block and the basic line (`avg`…`pa`) are batter-only; the pitcher line
(`w`…`bb_pct`) is pitcher-only. Upsert is `coalesce` per column — a NULL from the
API never erases a stored value, and rows are **never deleted** (see Known gaps #5).

| Column | Type | Null | Meaning |
|---|---|---|---|
| `mlbam_id` | bigint | NO | **PK** part. FK → `web_players`. |
| `season` | int | NO | **PK** part. |
| `ops` | numeric | yes | On-base + slugging. |
| `wrc_plus` | numeric | yes | wRC+. |
| `war` | numeric | yes | WAR (headline). |
| `era` | numeric | yes | Pitchers. |
| `fip` | numeric | yes | Pitchers. |
| `k_per_9` | numeric | yes | Pitchers. |
| `updated_at` | timestamptz | yes | default `now()`. |
| `war_batting` | numeric | yes | Bat (wRAA). Batter-only. |
| `war_baserunning` | numeric | yes | BsR. |
| `war_fielding` | numeric | yes | Fld (pure fielding, excl. positional; **incl. catcher framing**). Derived as `rar` − the other five components, because the API's `fielding` omits framing while its `rar` counts it — reproduces FanGraphs' `Fld` and keeps the chart reconciling exactly. |
| `war_positional` | numeric | yes | Pos. |
| `war_league` | numeric | yes | Lg. |
| `war_replacement` | numeric | yes | Rep. |
| `rar` | numeric | yes | Runs above replacement = Bat+BsR+Fld+Pos+Lg+Rep (checksum for the WAR breakdown chart). |
| `wpa` | numeric | yes | Season Win Probability Added. ⚠️ **Frozen**: the MLB API has no WPA, so the loader doesn't write it — values are whatever the last FanGraphs CSV import left (2024, 2025, 2026 through early June). Not rendered anywhere. |
| `avg` | numeric | yes | Batting average (H/AB). Batter-only (`009`). |
| `obp` | numeric | yes | On-base percentage. |
| `slg` | numeric | yes | Slugging (`ops` = `obp` + `slg`). |
| `hr` | numeric | yes | Home runs (stored numeric to dodge psycopg float→int). |
| `rbi` | numeric | yes | Runs batted in. |
| `sb` | numeric | yes | Stolen bases. |
| `pa` | numeric | yes | Plate appearances (volume context for the year-by-year table). |
| `w` | numeric | yes | Wins. Pitcher-only (`010`). |
| `l` | numeric | yes | Losses. |
| `sv` | numeric | yes | Saves (drives the conditional SV KPI card). |
| `gs` | numeric | yes | Games started (starter/reliever signal). |
| `ip` | numeric | yes | ⚠️ **Baseball notation**: `170.1` = 170⅓. **Display only — never sum or divide.** Arithmetic IP comes from `web_player_game_stats.outs_recorded`. |
| `whip` | numeric | yes | (H+BB)/IP. |
| `k_pct` | numeric | yes | Strikeout rate SO/BF as a **raw fraction** (`0.245`) — multiply by 100 at display. |
| `bb_pct` | numeric | yes | Walk rate BB/BF (IBB included), raw fraction. |

---

## `web_player_team_season_stats`
*Migration: `014` (P12). Writer: [`etl/pull_player_splits.py`](../etl/pull_player_splits.py)
(mapping shared with `pull_season_stats.py` via [`etl/season_line.py`](../etl/season_line.py)).
Conflict key: `(mlbam_id, season, team_id)`.*

**Full-MLB season lines, every club** (P12 D13/D14). Cohort = the **2026
`fullSeason` roster** (traded in *and* out, 64 players), seasons **2024–2026** —
including seasons spent entirely with other clubs (Dylan Cease 2025 = SD). Source:
`/people/{id}/stats?stats=season,sabermetrics&group=hitting,pitching` (one split per
club + a team-less total) and `stats=gameLog` (games + first/last date per club).
Seasons with no MLB line (Okamoto before 2026 = NPB) have **no rows**. Nightly for
the current season (`--cohort-season $SEASON --season $SEASON`); the 2024/2025
history is a one-shot (`ETL_update_flow.md`).

- **`team_id = 0` is the MLB season total and is always written** (copied from the
  only split for a one-club season). Read `team_id = 0` for "his season"; never sum
  the club rows yourself. Σ club `pa` / `g` = the total (M0 check).
- **`team_id = 141` rows equal `web_player_season_stats`** (same API split, same
  mapping) — that table stays the Jays-only source for the existing pages.
- Stat columns have the **same names, units and caveats** as
  [`web_player_season_stats`](#web_player_season_stats) (`ip` is baseball notation,
  `k_pct`/`bb_pct` are pitcher SO/BF, BB/BF raw fractions, `war_fielding` = `rar` −
  the other five). No `wpa`. Coalesce upsert, never deleted.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `mlbam_id` | bigint | NO | **PK** part. FK → `web_players`. |
| `season` | int | NO | **PK** part. |
| `team_id` | int | NO | **PK** part. MLB club id (141 = Jays); **`0` = season total**. |
| `g` | numeric | yes | Games (distinct gamePks in the game log; a two-way day counts once). |
| `first_game` `last_game` | date | yes | First / last game with that club — orders a traded player's clubs (`TOR → HOU`). On `team_id = 0`: the season's first / last game. |
| `ops` `wrc_plus` `war` `war_batting` `war_baserunning` `war_fielding` `war_positional` `war_league` `war_replacement` `rar` `avg` `obp` `slg` `hr` `rbi` `sb` `pa` | numeric | yes | Batting line — as in `web_player_season_stats` (NULL when 0 PA). `war` is batting + pitching (two-way sum). |
| `bat_k_pct` `bat_bb_pct` | numeric | yes | Batter K% / BB% = SO / PA, BB / PA, raw fractions. Batter-only (the pitcher `k_pct` is per BF). |
| `era` `fip` `k_per_9` `w` `l` `sv` `gs` `ip` `whip` `k_pct` `bb_pct` | numeric | yes | Pitching line — as in `web_player_season_stats`. |
| `updated_at` | timestamptz | NO | default `now()`. |

Index: `idx_web_player_team_season_stats_season (season, team_id)`.

---

## `web_player_position_splits`
*Migration: `023` (post-P13, 2026-10-04). Writer: [`etl/pull_position_splits.py`](../etl/pull_position_splits.py)
(`db.replace_position_splits`: delete + insert per season). Key: `(mlbam_id, season, position)`.*

Each Blue Jay's regular-season **batting line split by the position he was playing
when he batted**. **Jays-only**, like `web_player_season_stats`. Source: one call per
season — `/stats?stats=statSplits&group=hitting&teamId=141&gameType=R&playerPool=ALL&sitCodes=p1,p2,…,p9,pD,pH`
(team-scoped: a traded player's rows cover only his Toronto games). Nightly for the
current season; 2024–2026 backfilled. **Counts only** — no rates, no WAR (the API has
no by-position WAR / Off / wRC+).

- **Σ `pa` per (player, season) = `web_player_season_stats.pa`** (the writer logs any
  mismatch; 0 for 2024–2026). Σ per (season, position) = MLB's team split
  (`/teams/141/stats?stats=statSplits`, e.g. 2025 SS = 722 PA / 16 HR) = the Jays
  rows of [`web_team_position_splits`](#web_team_position_splits) on every count.
- **Season position** = the most-PA row excluding `PH` / `P` (ties → more `g`) —
  `seasonPosition` in [`web/lib/season-position.ts`](../web/lib/season-position.ts);
  falls back to `web_players.position` for pitchers / no rows.
- **Last Jays position** = the same rule over his latest season with rows —
  `lastJaysPosition` (same file). The player-page header and the all-time roster
  card show it for anyone not on the 26-man (`is_active_26` not true), e.g.
  Bichette → `SS (Blue Jays, 2025)`, not the Mets' `3B`. Pitchers have no rows and
  keep `web_players.position` (`P`).
- **Value by position** (season page) — [`valueByPosition`](../web/lib/team-season.ts):
  HR / PA / OPS summed from these counts (exact; OPS = OBP + SLG from summed counts,
  so it can differ by .001 from MLB's display OPS, which adds the rounded OBP and SLG);
  WAR / Off shared out by each player's PA share. LF/CF/RF → OF; `PH` and `P` → DH.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `mlbam_id` | bigint | NO | **PK** part. FK → `web_players`. |
| `season` | int | NO | **PK** part. |
| `position` | text | NO | **PK** part. `C` `1B` `2B` `3B` `SS` `LF` `CF` `RF` `DH`, `PH` = pinch-hitter, `P` = a position player batting while on the mound (1–2 PA a season). |
| `g` | int | yes | Games with a PA at that position. |
| `pa` `ab` `h` `doubles` `triples` `hr` `rbi` `bb` `so` `hbp` `sf` `tb` | int | yes | Counting line at that position (`tb` = total bases). |
| `updated_at` | timestamptz | NO | default `now()`. |

Index: `idx_web_player_position_splits_season (season)`.

---

## `web_player_seasons`
*Migration: `003`. Writer: [`etl/db.py`](../etl/db.py) `upsert_player_seasons`.
Conflict key: `(mlbam_id, season, team_id)`.*

Per-season participation. Drives (a) which years to query during backfill /
nightly refresh and (b) which of the Batting/Pitching/Fielding subpages to render
on the player overview. The boolean upserts are **OR-merged** (once true, stays true).

**Jays-only (P12 D15)** — every row is `team_id = 141`, despite the column. A
player's seasons with other clubs are **not** written here (it drives the roster,
`getPlayerAvailability` and the Statcast pull lists); read other-club membership
from [`web_player_team_season_stats`](#web_player_team_season_stats).

| Column | Type | Null | Meaning |
|---|---|---|---|
| `mlbam_id` | bigint | NO | **PK** part. FK → `web_players` (on delete cascade). |
| `season` | int | NO | **PK** part. |
| `team_id` | int | NO | **PK** part. default `141` (Toronto). |
| `appeared_as_batter` | boolean | NO | Had ≥1 PA that season. |
| `appeared_as_pitcher` | boolean | NO | Threw ≥1 pitch that season. |
| `is_active_26` | boolean | NO | On the 26-man at any point that season. |
| `updated_at` | timestamptz | NO | default `now()`. |

---

## `web_fielding_frv`
*Migration: `002`. Writer: [`etl/pull_fielding.py`](../etl/pull_fielding.py).
Conflict key: `(mlbam_id, season, position)`.*

Per-position fielding value from Savant's OAA leaderboard. **FRV, not DRS** (DRS
needs paid FanGraphs — see CLAUDE.md). A multi-position player gets multiple rows.
**Pitchers and catchers are absent** — Savant's OAA leaderboard doesn't cover them.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `mlbam_id` | bigint | NO | **PK** part. FK → `web_players`. |
| `season` | int | NO | **PK** part. |
| `position` | text | NO | **PK** part. `1B`/`2B`/`3B`/`SS`/`LF`/`CF`/`RF`. |
| `frv` | int | yes | Fielding Run Value (Savant `fielding_runs_prevented`). |
| `oaa` | int | yes | Outs Above Average. |
| `oaa_in_front` | int | yes | Directional OAA split. |
| `oaa_lateral_toward_3b` | int | yes | Directional OAA split. |
| `oaa_lateral_toward_1b` | int | yes | Directional OAA split. |
| `oaa_behind` | int | yes | Directional OAA split. |
| `oaa_vs_rhh` | int | yes | OAA vs RHH. |
| `oaa_vs_lhh` | int | yes | OAA vs LHH. |
| `updated_at` | timestamptz | yes | default `now()`. |

---

## `web_id_map`
*Migration: `005`. Writer: [`etl/db.py`](../etl/db.py) `upsert_id_map` (called by
`idmap.py` on lookup miss). Conflict key: `(key_mlbam)`.*

Slim cache of the Chadwick Bureau register (FanGraphs ↔ MLBAM ↔ bbref bridge), so
a fresh CI runner doesn't re-download ~30k rows nightly. **Currently 0 rows** —
it's a lazy cache, populated only on a lookup miss.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `key_mlbam` | bigint | NO | **PK.** MLBAM id. |
| `key_fangraphs` | int | yes | FanGraphs IDfg. |
| `key_bbref` | text | yes | Baseball-Reference id. |
| `name_first` | text | yes | |
| `name_last` | text | yes | |
| `refreshed_at` | timestamptz | NO | default `now()`. |

---

## `web_games`
*Migration: `006`. Writer: [`etl/db.py`](../etl/db.py) `upsert_games` (built by
`pull_schedule.py`). Conflict key: `(game_pk)`.*

Blue Jays schedule + results — the calendar source. **Doubleheaders → two rows**
(distinct `game_pk`, same `game_date`, different `game_number`). **Jays games only**
(P11: never widen it). Seasons 2022–2026: 2024 was added in P12 M0 (with box
scores); 2022–2023 schedules (+ their `web_standings` snapshots) were loaded on
2026-09-29 for P13 and have **no box scores or player stats**, so anything
player-level starts in 2024. 2025 = 162 regular + 18 postseason — **filter
`game_type = 'R'`** for the regular-season record.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `game_pk` | bigint | NO | **PK.** MLB game id. |
| `season` | int | NO | |
| `game_date` | date | NO | MLB officialDate (ET standings date). |
| `first_pitch_utc` | timestamptz | yes | `gameDate` UTC; convert to ET for display. |
| `game_number` | int | NO | `1` / `2` for doubleheaders. default `1`. |
| `doubleheader` | char(1) | NO | `N` / `Y` / `S`. default `N`. |
| `is_home` | boolean | NO | |
| `opponent_id` | int | NO | |
| `opponent_name` | text | NO | English (e.g. `New York Yankees`). |
| `jays_score` | int | yes | null until scored. |
| `opp_score` | int | yes | |
| `status` | text | NO | detailedState (`Scheduled` / `Final` / `Postponed` / …). |
| `is_final` | boolean | NO | default `false`. |
| `result` | char(1) | yes | `W` / `L` / null (derived on final). |
| `venue` | text | yes | |
| `updated_at` | timestamptz | NO | default `now()`. |
| `game_type` | char(1) | yes | `R` regular season, `F`/`D`/`L`/`W` postseason rounds (`013`). pull_schedule keeps only these five. Index `(season, game_type)`. |

---

## `web_player_game_stats`
*Migration: `007`. Writer: [`etl/db.py`](../etl/db.py) `upsert_player_game_stats`
(built by `pull_boxscore.py`). Conflict key: `(game_pk, mlbam_id, stat_group)`.*

Per-game box-score lines for **the Jays' side only** (2024–2026, every final
incl. the 2025 postseason). Because only Toronto's players are stored, a row here
**defines "as a Blue Jay"** for Statcast scoping (invariant 7).
**One row per (game, player, stat group)** — a two-way
player gets two rows (`batting` + `pitching`). Hitting columns are NULL on
pitching rows and vice-versa (the writer fills absent columns with NULL). The FK
on `mlbam_id` means an unknown call-up must be inserted into `web_players` first.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `game_pk` | bigint | NO | **PK** part. FK → `web_games` (cascade). |
| `mlbam_id` | bigint | NO | **PK** part. FK → `web_players`. |
| `stat_group` | text | NO | **PK** part. `batting` / `pitching`. |
| `pa` `ab` `r` `h` `doubles` `triples` `hr` `rbi` `bb` `so` `sb` `hbp` | int | yes | Hitting line (NULL on pitching rows). |
| `outs_recorded` | int | yes | Pitching — **store OUTS**, never `5.2` (5.2 ≠ 5⅔ IP). |
| `bf` | int | yes | Batters faced. |
| `p_h` `p_r` `er` `p_bb` `p_so` `p_hr` | int | yes | Pitching line (`p_` prefix avoids collision with hitting cols). |
| `pitches` `strikes` | int | yes | Pitch counts. |
| `decision` | char(1) | yes | `W` / `L` / `S` / `H` / null. |
| `updated_at` | timestamptz | NO | default `now()`. |

---

## `web_standings`
*Migration: `012`. Writer: [`etl/db.py`](../etl/db.py) `upsert_standings` (built by
`pull_standings.py` from `mlb_api.fetch_standings`). Conflict key: `(season, team_id)`.*

**A snapshot, not a history.** One row per team per season, overwritten by every
nightly run — 30 rows/season, seasons 2022–2026 (2022–2023 backfilled in P13 N0).
There is no date dimension (P11 D2), so you can read "where do the Jays stand right
now", never "where did they stand in June".

**All 30 clubs, both leagues** — unlike [`web_games`](#web_games), which is
Jays-only. The only other tables holding other clubs are the P13 team tables
([`web_team_season_stats`](#web_team_season_stats) /
[`web_team_statcast_season`](#web_team_statcast_season)); W/L/RS/RA/x-W-L stay here.

⚠️ **`games_back` / `wc_games_back` / `*_number` are `text` on purpose.** MLB
returns display strings carrying sentinels, and they are stored verbatim:

| Value | Means |
|---|---|
| `'-'` on `games_back` | this team leads its division |
| `'-'` on `wc_games_back` | this team **is** the third wild card — the cut line itself |
| `'+9.5'` on `wc_games_back` | 9.5 games **ahead** of the cut line |
| `'E'` on `elimination_number` | eliminated from contention |

Parsing them into signed numerics invents a sign convention that will eventually
be read backwards. **Every ordering uses the `*_rank` columns instead.**

⚠️ **`wild_card_rank` is NULL for division leaders** — the field is *absent* from
the upstream payload for them (not null, not `'-'`). Exactly 6 rows per season are
NULL. `wildCardRace()` in `web/lib/standings.ts` filters division leaders out
entirely, because MLB reports `wildCardGamesBack = '-'` for them too and leaving
them in would place a division leader on the cut line.

⚠️ **Division ids: the NL pair is reversed.** 200 = AL West, 201 = AL East,
202 = AL Central, **203 = NL West, 204 = NL East**, 205 = NL Central. Verified
against the live feed — do not "correct" 203/204 from memory.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `season` | int | NO | **PK part.** |
| `team_id` | int | NO | **PK part.** MLB Stats API team id (141 = Jays). |
| `team_name` `team_abbrev` | text | NO | English, e.g. "Toronto Blue Jays" / "TOR". No localized variant — see the `name_tc` rule. |
| `league_id` | int | NO | 103 = AL, 104 = NL. |
| `division_id` `division_name` | int / text | NO | See the reversed-NL warning above. |
| `games_played` | int | yes | |
| `w` `l` | int | NO | Wins / losses. |
| `pct` | numeric | yes | Winning percentage (`.599`). A real quantity — this one **is** parsed. |
| `division_rank` `league_rank` | int | yes | Cast from the API's strings. |
| `wild_card_rank` | int | yes | **NULL for division leaders** (absent upstream). |
| `games_back` `wc_games_back` | text | yes | **Display strings — see the warning above.** |
| `streak_code` | text | yes | `'W2'` / `'L3'`. |
| `l10_w` `l10_l` | int | yes | From `splitRecords` type `lastTen`. |
| `home_w` `home_l` `away_w` `away_l` | int | yes | From `splitRecords`. |
| `x_w` `x_l` | int | yes | Pythagorean expectation, from `expectedRecords` type `xWinLoss` — **not** derived locally. |
| `runs_scored` `runs_allowed` `run_diff` | int | yes | |
| `division_leader` `division_champ` `clinched` | boolean | NO | Default false. Feed the derived `z`/`y`/`x` clinch markers. |
| `wild_card_leader` `has_wildcard` | boolean | yes | |
| `elimination_number` `wc_elimination_number` `magic_number` | text | yes | **Display strings** — `'-'`, a number, or `'E'`. |
| `last_updated` | timestamptz | yes | The API's own `lastUpdated`. |
| `updated_at` | timestamptz | NO | Our write time. |

Indexes: `idx_web_standings_div (season, division_id, division_rank)`,
`idx_web_standings_wc (season, league_id, wild_card_rank)`.

---

## League context — `web_savant_percentiles`, `web_savant_season`, `web_pitch_arsenal_rv`, `web_league_season`
*Migrations: `016`–`019` (P12 M6). Writers: [`etl/pull_savant_leaderboards.py`](../etl/pull_savant_leaderboards.py)
(016–018) and [`etl/pull_league_averages.py`](../etl/pull_league_averages.py) (019). Both run in the
~09:00 ET refresh job for the current season and in `backfill.py` (steps 9–10); 2024–2026 loaded.*

**Savant tables (016–018) are stored exactly as Savant publishes them (P12 D6)** —
MLB-wide *season* values across every club, **not** Jays-only. Kept players: that
season's `web_player_seasons` ∪ the D13 cohort's `team_id = 0` rows. Each run
**replaces** the season's rows for the kept players, so a player who falls below a
leaderboard's qualifier loses his row: **an absent row means "not qualified", never 0**.

| Table | PK | Contents / units |
|---|---|---|
| `web_savant_percentiles` | `(mlbam_id, season, role)`, `role in ('batter','pitcher')` | One nullable `smallint` 0–100 per metric: `xwoba xba xslg brl_percent exit_velocity hard_hit_percent k_percent bb_percent whiff_percent chase_percent sprint_speed oaa arm_strength bat_speed squared_up_rate xera fb_velocity fb_spin curve_spin`. **100 = best for every metric** (Savant already orients K% / BB% / Chase% to the role). Metrics that don't apply to the role are NULL. Within-season, so the 2026 zone change (Known gaps #8) doesn't affect them. |
| `web_savant_season` | `(mlbam_id, season)` | Batters: `pa bip ba xba slg xslg woba xwoba` (decimals), `barrels`, `brl_percent brl_pa sweet_spot_pct ev95_pct` (**percent units**, 6.9 = 6.9%), `avg_ev max_ev` (mph). The **only** source of official Barrel% (never computed locally, P12 D5). |
| `web_pitch_arsenal_rv` | `(mlbam_id, season, pitch_type)` | `pitches`, `usage whiff_pct put_away hard_hit_pct` (**percent units**), `run_value run_value_per_100`, `woba xwoba`. One row per pitch type for the whole MLB season (a traded pitcher's clubs combined). ⚠️ **Run value is from the pitcher's view: POSITIVE = runs saved = good** — verified 2026-09-30, corr(RV/100, wOBA) = −0.78 over 1,253 pitch rows. |
| `web_league_season` | `(season, league)`, `league in ('AL','NL','MLB')` | `teams` (15/15/30), `pa`, `obp slg ops era k_pct bb_pct`. **Rates from summed team counting stats, never averaged team rates** (P13 relies on the MLB row). `k_pct`/`bb_pct` are raw fractions (SO/PA, BB/PA). League membership from MLB `/teams` for that season. Seasons 2022–2026 (2022–2023 added in P13 N1; the MLB row equals `web_v_mlb_season`). |

---

## `web_team_season_stats`
*Migration: `020` (P13). Writer: [`etl/db.py`](../etl/db.py) `upsert_team_season_stats`
(built by `pull_team_stats.py`). Conflict key: `(season, team_id)`. Plain overwrite.*

Every club's **regular-season team line** — 30 rows per season, 2022–2026 — so
the `/team` page can rank the Jays and compute MLB averages. **Raw counts only**:
every rate, MLB average and rank is computed in the P13 `022` views (N1), never
stored. Sources (MLB Stats API, `gameType=R`): `/teams/stats` `season` +
`seasonAdvanced` (1 call, all clubs), `/teams/{id}/stats?stats=statSplits&sitCodes=sp,rp`
(per club — the all-teams variant returned 50 of 60 splits), and the per-club
player leaderboard `/stats?stats=season,sabermetrics&teamId={id}&playerPool=ALL`.

⚠️ **Three columns are aggregates of player values, not counts** (there is no
team-level sabermetrics endpoint, and the league-wide player leaderboard merges a
traded player's clubs into one row, so it can't be split by team):
`bat_wrc_plus` = PA-weighted mean of the club's players' wRC+ (exact — one park
and league constant per club); `bat_war` / `pit_war` = sums. The per-club
leaderboard can **lag right after a season** (P12 M0 saw stale FIP/WAR on
2026-09-29), so `pull_team_stats` cross-checks the Jays row against
[`web_player_season_stats`](#web_player_season_stats) and logs a warning outside
±1 wRC+ / ±1.0 WAR (2026-09-29: 2024 101.1 vs 100.8, 2025 exact, 2026 94.2 vs 94.3,
WAR 34.8 vs 35.3). **FIP is deliberately not stored** — the view computes it from
counts + the season's league constant, which is exact and lag-free.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `season` `team_id` | int | NO | **PK.** MLB Stats API team id (141 = Jays). |
| `games` | int | yes | `gamesPlayed` (hitting). |
| `bat_pa` `bat_ab` `bat_h` `bat_2b` `bat_3b` `bat_hr` `bat_bb` `bat_ibb` `bat_hbp` `bat_so` `bat_sf` `bat_sb` `bat_cs` `bat_r` `bat_gidp` | int | yes | Batting counts (`stats=season`). `bat_bb` **includes** IBB. |
| `bat_pitches` `bat_swings` `bat_whiffs` | int | yes | `seasonAdvanced` `numberOfPitches` / `totalSwings` / `swingAndMisses`. |
| `bat_gb` `bat_fb` `bat_ld` `bat_pu` | int | yes | MLB's **own** batted-ball classification, outs + hits per type; the four sum to `ballsInPlay` (= Savant BBE; 4,354 for the 2022 Jays). Not the P12 launch-angle proxy. |
| `pit_outs` | int | yes | **Outs**, never IP strings — IP = `pit_outs / 3`. |
| `pit_bf` `pit_ab` `pit_h` `pit_r` `pit_er` `pit_hr` `pit_bb` `pit_ibb` `pit_hbp` `pit_so` `pit_sf` `pit_sv` `pit_bs` `pit_hld` | int | yes | Pitching counts. `pit_hbp` = `hitBatsmen`; `pit_bb` includes IBB. |
| `pit_pitches` `pit_swings` `pit_whiffs` `pit_qs` `pit_gb` `pit_fb` `pit_ld` `pit_pu` | int | yes | `seasonAdvanced` from the mound (`pit_qs` = quality starts). |
| `sp_gs` `sp_outs` `sp_bf` `sp_h` `sp_er` `sp_hr` `sp_bb` `sp_hbp` `sp_so` | int | yes | Starters' line (`sitCodes=sp`). |
| `rp_outs` `rp_bf` `rp_h` `rp_er` `rp_hr` `rp_bb` `rp_hbp` `rp_so` | int | yes | Relievers' line (`sitCodes=rp`). **`sp_outs + rp_outs = pit_outs`** (checked every run). |
| `bat_wrc_plus` | numeric | yes | PA-weighted player wRC+ (see ⚠️). 30-club PA-weighted mean ≈ 100 (2022: 100.09). |
| `bat_war` `pit_war` | numeric | yes | Σ player WAR (see ⚠️). |
| `updated_at` | timestamptz | NO | default `now()`. |

Index: `web_team_season_stats_season_idx (season)`.

---

## `web_team_statcast_season`
*Migration: `021` (P13). Writer: [`etl/db.py`](../etl/db.py) `upsert_team_statcast_season`
(built by `pull_team_statcast.py`). Conflict key: `(season, team_id)`. Plain overwrite.*

Baseball Savant's **team leaderboards** for all 30 clubs, 2022–2026: contact
quality (`leaderboard/statcast?type={batter|pitcher}-team`), expected stats
(`leaderboard/expected_statistics?type={batter|pitcher}-team`) and team OAA
(`leaderboard/outs_above_average?type=Fielding_Team`). `bat_*` = the club's hitters;
`pit_*` = contact **allowed** by its pitchers.

⚠️ **Savant's team abbreviations are retroactive** (`ATH` for the 2022 Athletics,
whose MLB abbreviation that year was `OAK`). Rows are mapped by Savant's short name
(`'Blue Jays'`) → MLB `/teams` `teamName`, and an unmapped name **fails the run**.
The OAA CSV carries numeric MLB ids directly.

⚠️ **Percentages are stored as fractions** (Savant's `8.5` → `0.085`), matching
`web_player_season_stats.k_pct`. Absent = NULL, never 0.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `season` `team_id` | int | NO | **PK.** MLB Stats API team id. |
| `bat_bbe` `bat_barrels` `bat_ev95plus` | int | yes | Batted-ball events (`attempts`), barrels, balls ≥ 95 mph. |
| `bat_brl_pct` `bat_brl_pa` `bat_hard_hit_pct` `bat_sweet_spot_pct` | numeric | yes | Fractions: barrels/BBE, barrels/PA, ev95plus/BBE, LA 8–32°/BBE. |
| `bat_avg_ev` `bat_avg_la` | numeric | yes | mph / degrees. |
| `bat_xpa` | int | yes | Savant's PA behind the expected stats (the weight for MLB averages). |
| `bat_ba` `bat_xba` `bat_slg` `bat_xslg` `bat_woba` `bat_xwoba` | numeric | yes | Actual vs expected. |
| `pit_*` | — | yes | The same 16 columns, allowed by the club's pitchers. |
| `oaa` | int | yes | Team Outs Above Average. |
| `updated_at` | timestamptz | NO | default `now()`. |

---

## `web_team_position_splits`
*Migration: `024` (post-P13, 2026-10-05). Writer: [`etl/pull_team_position_splits.py`](../etl/pull_team_position_splits.py)
(`db.replace_team_position_splits`: delete + insert per season). Key: `(season, team_id, position)`.*

Every club's regular-season **batting line split by the position its batters were
playing**, all 30 clubs, 2022–2026 — the reference for the season page's "each
position vs MLB". Source: **one call per season** —
`/teams/stats?stats=statSplits&group=hitting&gameType=R&sportIds=1&sitCodes=p1,p2,…,p9,pD,pH&limit=1000`
(`mlb_api.fetch_league_position_splits`, same codes / stat mapping as the Jays-only
fetcher). ⚠️ **`limit` is required**: the default page is 50 rows, which silently
dropped clubs (2025: 29 clubs on 4 codes, no error); the fetcher raises when any of
`p2`…`pH` has fewer than 30 clubs (`p1` legitimately has ~20). Refresh cron for the
current season (after `pull_team_stats`); 2022–2026 backfilled. **Counts only** —
OPS, the MLB row and ranks live in [`web_v_team_position`](#team-position-view-migration-025-post-p13).

- **Jays (141) rows = [`web_player_position_splits`](#web_player_position_splits)
  summed per position**, on every count but `g` (0 mismatches 2024–2026; no player
  rows before 2024).
- **Σ `pa` per club ≈ `web_team_season_stats.bat_pa`**: equal for most clubs, but
  7–14 clubs a season come up **1–3 PA short** upstream (`pX` / `pR` are empty, so
  nothing fills the gap). The writer logs a gap ≤ 3 as INFO, > 3 as WARNING.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `season` | int | NO | **PK** part. |
| `team_id` | int | NO | **PK** part. MLB Stats API team id (141 = Jays). |
| `position` | text | NO | **PK** part. As in `web_player_position_splits`: `C` … `RF`, `DH`, `PH` = pinch-hitters, `P` = a position player batting on the mound (not every club). |
| `g` | int | yes | Games with a PA at that position. |
| `pa` `ab` `h` `doubles` `triples` `hr` `rbi` `bb` `so` `hbp` `sf` `tb` | int | yes | Counting line at that position. |
| `updated_at` | timestamptz | NO | default `now()`. |

---

## `web_article_views`
*Migration: `026` (post-P13, 2026-10-06). Writer: [`web/app/api/views/[slug]/route.ts`](../web/app/api/views/[slug]/route.ts)
(not the ETL). Key: `slug`.*

The public view count shown on each article (once it reaches `MIN_PUBLIC_VIEWS` in
`web/lib/article-views.ts`). The **only table written by visitor activity**:
`web/components/article/ViewPing.tsx` POSTs once per browser per 24 h, and the route
upserts `views = views + 1`.

- **Only registry slugs** (`web/content/articles/index.ts`) are accepted, so no one can create
  rows; a slug with no row has 0 views.
- **Production only** (`VERCEL_ENV = 'production'`): dev and preview deployments share this
  database and get the current count back without incrementing.
- **Nothing about the reader is stored** — no IP, user agent or id. A scripted client could still
  inflate a number; nothing can be read or damaged through it.
- **RLS enabled, no policies**: blocks Supabase's REST API (this project is shared and exposes
  `public`); the site connects as `postgres` (owner, BYPASSRLS), unaffected. The first `web_` table
  with RLS on; `027` extended it to every `web_` object (invariant 11).
- Not the traffic source of truth: Vercel Web Analytics (the author's dashboard) counts every
  page view; this is a deduplicated, article-only number for display.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `slug` | text | NO | **PK**. The article's registry slug (= its URL segment). |
| `views` | bigint | NO | default `0`. Deduplicated views (one per browser per 24 h), production only. |
| `updated_at` | timestamptz | NO | default `now()`; set on every increment. |

---

## Views (migration `015`, P12)

Read-only metric views — **the one place** the plate-discipline and batted-ball
definitions live. The web app (`lib/discipline.ts`, M2) and `etl/season_report.py`
both read them, so the site and the article pack cannot drift. Regular season only.
Rates are raw fractions. Filter on `mlbam_id` (+ `scope`): both push down through the
`union all` / `group by` (~0.1–0.2 s per player).

| View | Grain | What |
|---|---|---|
| `web_v_pitch_scoped` | one row per pitch | `web_statcast_events` (`game_type = 'R'`) + `season`, `is_auto` (pitch-clock automatic ball/strike), `is_whiff`, `is_swing` (mirror `lib/pitch-arsenal.ts`), `is_pa`, `batter_as_jay`, `pitcher_as_jay` (box-score membership, invariant 7). |
| `web_v_batter_discipline` | (mlbam_id, season, scope) | counts (pitches, swings, whiffs, z/o pitches & swings, first pitches/swings, pa, k, bb) + `chase_pct`, `z_swing_pct`, `whiff_pct`, `contact_pct`, `swing_pct`, `first_swing_pct`, `k_pct`, `bb_pct`. |
| `web_v_pitcher_discipline` | (mlbam_id, season, scope) | same counts from the mound + `called_strikes`, `zoned_pitches`, `first_strikes` → `csw_pct`, `zone_pct`, `chase_pct`, `whiff_pct`, `first_strike_pct`, `k_pct`, `bb_pct`, `k_minus_bb_pct`. |
| `web_v_batted_ball_profile` | (mlbam_id, season, scope) | population `hc_x_feet is not null` (= the batting page, invariant 2): `bip`, `avg_ev`, `max_ev`, `hard_hit_pct`, GB/LD/FB/PU **approx.** from launch angle (<10 / 10–25 / 25–50 / >50), `sweet_spot_pct` (8–32°), `pull_pct` / `center_pct` / `oppo_pct` (±15° by `stand`), `xwoba_con` (gated on `hit_into_play`). |

- **`scope`**: `'mlb'` = every row; `'jays'` = only games in the player's Jays box score.
- **Pitch counts exclude `is_auto` rows** (not thrown, no zone, no pitch type), but
  PA / K / BB keep them — 218 of the 915 end a plate appearance.
- ⚠️ **Zone-based rates are not comparable raw across 2025 → 2026** — Known gaps #8.

---

## Team views (migration `022`, P13)

**The one place** team rates, MLB averages and 30-club ranks are defined — read by
the `/team` page (`lib/team-trends.ts`) and `etl/season_report.py`
(`team_trends.*`). Built on [`web_team_season_stats`](#web_team_season_stats) +
[`web_team_statcast_season`](#web_team_statcast_season) (+ `web_standings` for the
record). Every formula is written **once** and applied to the 30 clubs and to an MLB
row alike, so the MLB average is always Σ counts → rate. Rates are `float8`
fractions; IP = outs / 3. Ranks and raw counts (`games pa bf hr sb rs ra`) are cast to `int` in the view — postgres.js returns `bigint` as strings.

| View | Grain | What |
|---|---|---|
| `web_v_team_counts` | (season, team_id) + MLB row `team_id = 0` | The counts the rates need. The MLB row **sums** the clubs; Savant averages travel as weighted sums (`bat_ev_sum = avg_ev × BBE`, `bat_xwoba_sum = xwOBA × xpa` …). Exceptions: `bat_war` / `pit_war` / `oaa` = **mean per club** on the MLB row; wRC+ via `bat_wrc_sum` / `bat_wrc_pa` (PA-weighted). |
| `web_v_team_rates` | same 31 rows | `cfip` (season FIP constant) and every rate: offense `r_per_g wrc_plus avg obp slg ops iso babip k_pct bb_pct hr_pct sb_per_g sb_pct whiff_pct gb_pct fb_pct ld_pct pu_pct brl_pct hard_hit_pct sweet_spot_pct avg_ev woba xwoba bat_war`; prevention `ra_per_g era fip whip pit_k_pct pit_bb_pct pit_k_bb_pct hr9 pit_babip pit_whiff_pct pit_brl_pct pit_hard_hit_pct pit_woba pit_xwoba oaa pit_war`; roles `sp_era sp_fip sp_k_bb_pct sp_ip_share rp_era rp_fip rp_k_bb_pct`; raw `games pa bf ip hr sb rs ra`. |
| `web_v_mlb_season` | season | The MLB row + `lg_rpg` (runs per team-game). |
| `web_v_team_season` | (season, team_id), 30 clubs | Rates + `web_standings` (`team_name team_abbrev league_id division_id division_name division_rank w l pct x_w x_l runs_scored runs_allowed run_diff`) + `luck` (`w − x_w`) + `offense_runs` (`rs − lg_rpg × games`) / `prevention_runs` (`lg_rpg × games − ra`) — they sum to the run differential exactly — + `woba_minus_xwoba` + a **`<metric>_rank`** for every ranked metric. |

- **FIP** = `(13 HR + 3 (BB + HBP) − 2 SO) / IP + cfip`, BB incl. IBB;
  `cfip = lgERA − (13 lgHR + 3 (lgBB + lgHBP) − 2 lgSO) / lgIP` → 2022 **3.106**,
  2023 3.249, 2024 3.160, 2025 3.128, 2026 3.094. MLB FIP = MLB ERA by construction.
- **Ranks**: 1 = best, `rank()` (ties share a rank and the next is skipped: three
  clubs at 11th → next is 14th), NULL metric → NULL rank. **Lower is better** for
  `k_pct whiff_pct ra_per_g era fip whip pit_bb_pct hr9 pit_babip pit_brl_pct
  pit_hard_hit_pct pit_xwoba sp_era sp_fip rp_era rp_fip`; higher for every other
  ranked metric. `gb/fb/ld/pu_pct`, `woba_minus_xwoba`, `luck` and the offense /
  prevention run sources are **not ranked** (`run_diff_rank` and `pct_rank` are).
  The directions mirror `web/lib/team-metrics.ts` (P13 N2) — change both together.
- **Reconciled 2026-09-30**: `web_v_mlb_season` OBP / SLG / OPS / ERA / K% / BB% equal
  `web_league_season` (MLB row) for all five seasons to 1e-15 (SLG from the derived
  TB equals the API's `totalBases`); `offense_runs + prevention_runs = rs − ra` and
  `rs / ra = web_standings` for all 150 club-seasons; Σ `offense_runs` = 0 per season;
  MLB wRC+ 99.4–100.2.
- The MLB row's wOBA / xwOBA are weighted by Savant's `xpa` (an approximation; club
  rows are Savant's own values).

---

## Team position view (migration `025`, post-P13)

**The one place** by-position offense for all 30 clubs, the MLB average at each
position and the club's rank among 30 are defined — read by the season page
([`lib/team-position.ts`](../web/lib/team-position.ts) `getTeamPositionVsMlb`, the
"vs MLB" chart view + "Each position vs MLB" table). Built on
[`web_team_position_splits`](#web_team_position_splits). Rates are `float8` fractions.

| View | Grain | What |
|---|---|---|
| `web_v_team_position` | (season, team_id, pos_group): 30 clubs + an MLB row `team_id = 0` | `pa`, `hr`, `avg`, `obp`, `slg`, `ops`, `ops_rank`, `ops_tied`, `hr_rank`, `hr_tied`. |

- **`pos_group`** = `C` `1B` `2B` `3B` `SS`, `OF` = LF + CF + RF, `DH` = DH + PH + P —
  **the same grouping as `web/lib/team-season.ts::batterGroup`** (value by position);
  change both together.
- **Rates from summed counts** for clubs and the MLB row alike (never an average of
  club rates); OPS = OBP + SLG unrounded (can be .001 off MLB's display OPS).
- **MLB `pa` / `hr` = mean per club** (Σ ÷ clubs) — HR is a club total, so the
  reference is an average club (the `022` exception for WAR / OAA).
- **Ranks**: club rows only (NULL on the MLB row), 1 = best (higher OPS / more HR),
  `rank()` within (season, pos_group); `*_tied` = another club has the same value
  (HR ties are common — 650 of 1,050 club rows).
- **Verified 2026-10-05**: every (season, pos_group) has 30 ranks + 1 MLB row; 2025
  Jays 2B OPS = .617 (= the value-by-position chart), SS = 722 PA / 16 HR. MLB OPS by
  position (2022, 2025 checked): 1B highest in both; C lowest in 2022 (.663) but 2B
  lowest in 2025 (.680 vs C .700).

---

## Cross-cutting invariants (the ETL relies on these)

1. **Regular season = `game_type = 'R'`.** pybaseball returns postseason by
   default; both the batting fetch and pitching fetch filter `game_type = 'R'`.
   `transform.regular_season_only(df, keep_postseason=True)` opts postseason in
   (used for the 2025 playoff backfill). Postseason rows therefore *exist* in
   `web_statcast_events` — always filter unless you mean to include them.
2. **`hc_x_feet IS NOT NULL` is the "ball in play" proxy.** The batting fetch
   ([web/lib/batting.ts](../web/lib/batting.ts)) defines its population that way,
   **not** by `description = 'hit_into_play'`. A batted ball with EV/LA but no
   hit-coordinate (rare Savant gap) is therefore excluded — see Known gaps #3.
3. **Spray coords are pre-transformed in ETL, not in the chart.**
   `x_feet = 2.5*(hc_x − 125.42)`, `y_feet = 2.5*(198.27 − hc_y)`. The stored
   `hc_x_feet`/`hc_y_feet` are already in this frame.
4. **`plate_alignment` splits the plate coordinate frame.** `front` (≤2025) vs
   `middle` (≥2026). The `PitchZoneHeatmap` must consume a **single** alignment
   value at a time or it smears the zone by 1–3 inches. **Enforced** by the
   "Zone coords" filter in `PitchingExplorer` (the arsenal table, movement chart,
   and velo trend read release-frame/outcome fields only and stay cross-season;
   only the heatmap is alignment-scoped). `getPitches` still fetches all seasons,
   so any *new* plate-coordinate consumer must filter alignment itself. See Known gaps #1.
5. **`web_players` is a superset.** It contains every player referenced by a
   Statcast event (Jays + every opponent). "Is this a Jay?" = a row in
   `web_player_seasons` (or `is_active_26`), never mere presence in `web_players`.
6. **Statcast writer is a hardcoded column list.** Adding a column to
   `web_statcast_events` does nothing until `STATCAST_COLUMNS` in
   [etl/db.py](../etl/db.py) is also extended.
7. **Statcast holds non-Jays games; "as a Blue Jay" = box-score membership.**
   Statcast is pulled **by player id**, so a row can be from any club: a deadline
   departure's games with his new club, and (P12) the 2026 roster's whole
   2024/2025 seasons elsewhere. `game_pk ∈ web_games` is **not** the test — Varsho
   as an Astro faced Toronto 2026-08-03→05, inside Jays games. Use
   `exists (select 1 from web_player_game_stats s where s.game_pk = e.game_pk and
   s.mlbam_id = e.batter_id)` (or `e.pitcher_id` from the pitcher's side). The
   existing Batting / Pitching pages show **all** rows (club-labelled seasons, P12 D16).
8. **`web_player_seasons` and `web_player_season_stats` are Jays-only;**
   `web_player_team_season_stats` is the all-clubs table (P12 D14/D15).
9. **`web_players.position` is the current bio position, never per season.**
   Anything that labels a past season (season page Pos column, value by position)
   reads [`web_player_position_splits`](#web_player_position_splits), whose Σ `pa`
   per player-season equals `web_player_season_stats.pa`. The player-page header
   and the all-time roster card show a departed player's last Jays position
   (`lastJaysPosition` in `web/lib/season-position.ts`) instead.
10. **`web_team_position_splits` Jays rows = the player splits summed**, exactly
   (per position, every count but `g`); each club's Σ `pa` is within 3 of
   `web_team_season_stats.bat_pa` (an upstream gap, not an ETL bug). Position
   groups in `web_v_team_position` mirror `batterGroup` in `web/lib/team-season.ts`.
11. **No `web_` object is reachable through Supabase's REST API** (`027`, 2026-10-06).
   Every table has RLS on with no policies, every view is `security_invoker = on`, and
   `anon` / `authenticated` hold no grants. The site and the ETL connect as `postgres`
   (owner, BYPASSRLS) and never use the anon key, so they are unaffected. Supabase's
   default privileges re-grant `anon` ALL on **every new** table / view / sequence, and
   `create or replace view` resets `security_invoker` — so after any migration that
   creates or replaces a `web_` object, **re-run `027`** (idempotent). Without it a view
   runs as its owner and skips RLS; `web_v_pitch_scoped` is auto-updatable, so a REST
   `DELETE` on it would reach `web_statcast_events`.

---

## Known gaps / latent issues (documented, not yet fixed)

1. **Cross-season `plate_alignment` — RESOLVED 2026-06-03.** Previously `getPitches`
   pulled every season and `PitchZoneHeatmap` overlaid `front` (≤2025) + `middle`
   (≥2026) frames on one heatmap. Now `PitchEvent` carries `plate_alignment`,
   `getPitches` ([web/lib/pitching.ts](../web/lib/pitching.ts)) selects it, and
   `PitchingExplorer` scopes the heatmap to a single alignment — a "Zone coords"
   toggle appears when both eras are present, defaulting to the newest. The
   arsenal table / movement chart / velo trend stay cross-season (they don't read
   plate coords). The single-alignment guarantee is enforced client-side at the
   heatmap, **not** by the query — so a new plate-coordinate consumer must still
   scope alignment itself.
2. **`web_id_map` is empty (0 rows).** By design it's a lazy cache, but worth
   knowing nothing currently depends on it being warm.
3. **EV-but-no-coordinate batted balls are dropped** from the batting page (see
   invariant #2). Acceptable trade-off (keeps one filtered array driving both the
   spray chart and the P8 EV/LA scatter), but it means the scatter's "with EV"
   count can never exceed the spray population.
4. **Batting & Pitching subtitles "2025 regular season" — RESOLVED 2026-06-03.**
   The `Batting.subtitle` / `Pitching.subtitle` keys (en + zh-TW) now read
   season-agnostically ("…on file" / "…紀錄") to match the all-seasons fetch.
5. **Phantom 2026 `web_player_season_stats` rows (12, written 2026-06-05).** Old
   FanGraphs **2025** values stored under `season = 2026` for players who never
   played for Toronto in 2026 (Bichette, Santander, Kiner-Falefa, …) — most likely
   a 2025 CSV loaded as `batting_2026.csv` for a day. The loader never deletes, so
   they survived; `pickLatest` then shows those players' 2025 line labelled 2026.
   Identify with `season = 2026 and updated_at::date = '2026-06-05' and not exists
   (web_player_seasons row for 2026)` → delete.
6. **2026 Statcast detail hole — RESOLVED 2026-09-29.** 15,824 rows dated
   2026-07-08 → 2026-08-30 had NULL `balls`/`strikes`/`pfx_*`/`release_extension`/
   `estimated_woba`: the P10 re-backfill ran locally ~07-07 but the P10 ETL code was
   only pushed 09-06, so the cron inserted rows with the pre-P10 column list in
   between. Fixed by a full-season re-pull of every 2026 Jay (P12 M0), which also
   filled mid-season arrivals' pre-trade 2026 games.
7. **Team leaderboard sabermetrics can lag — RESOLVED 2026-09-29.** Right after the
   2026 season, `/stats?teamId=141`'s `sabermetrics` block (FIP / WAR / wRC+ …) was
   computed from stale counts for some players (Scherzer FIP 5.43 vs 5.11 on
   `/people` and on the league leaderboard; implied FIP constant 3.11–3.43 vs a
   uniform 3.101). `fetch_team_season_stats` now takes every player's numbers from
   his `/people/{id}/stats` Toronto split and uses the leaderboard only to enumerate.
   Settled seasons agree across all three sources.
8. **`zone` is not defined the same way in 2026 (open, cannot be fixed locally).**
   Across every regular-season pitch on file, Zone% 49.6 / 50.0 / **46.6** and Chase%
   28.8 / 29.0 / **31.8** for 2024 / 2025 / 2026, while Whiff% stays 24.0 / 24.0 / 24.1.
   A population-wide move with no change in swing-and-miss points to Savant assigning
   `zone` differently in 2026 — the season it moved `plate_x`/`plate_z` to the middle of
   the plate (the ABS-zone reference). Inferred, not confirmed. `sz_top`/`sz_bot` are
   not stored, so the zone can't be recomputed. **Any cross-season Chase% / Z-Swing% /
   Zone% delta must be read against this shift** (`season_report.py` prints the
   reference rates and a "net of shift" column). Whiff% / CSW% / K% / BB% / velo / spin /
   movement / batted-ball metrics are unaffected. Savant percentiles (M6) are
   within-season and sidestep it.

---

## Verification recipe

Re-confirm this file against the live DB (uses the conda env `MLBxBaZi`; loads
`DATABASE_URL` from the repo-root `.env`):

```python
# scratch script — dump every web_* table's columns and diff against this doc
import os, re, psycopg
from pathlib import Path
for line in Path(".env").read_text().splitlines():
    m = re.match(r"\s*DATABASE_URL\s*=\s*(.*)", line)
    if m: os.environ["DATABASE_URL"] = m.group(1).strip().strip('"').strip("'")
tables = ["web_players","web_statcast_events","web_player_season_stats",
          "web_player_seasons","web_fielding_frv","web_id_map",
          "web_games","web_player_game_stats","web_standings",
          "web_player_team_season_stats","web_player_position_splits",
          "web_team_position_splits"]
with psycopg.connect(os.environ["DATABASE_URL"], prepare_threshold=None) as c:
    for t in tables:
        cols = c.execute("""select column_name, data_type, is_nullable
            from information_schema.columns where table_name=%s
            order by ordinal_position""", (t,)).fetchall()
        print(t, len(cols)); [print("  ", *r) for r in cols]
```

Run: `conda run -n MLBxBaZi python <script>.py`. Expect the column counts in the
table index above (11 / 29 / 32 / 7 / 12 / 6 / 17 / 27 / 38 / 37 / 17 / 17). Re-confirm the anti-index
holds (`bb_type`, `launch_speed_angle` still absent).

Lockdown (invariant 11) — expect `r` 19/19 with RLS, `v` 9/9 `security_invoker`, and 0 grants:

```sql
select c.relkind, count(*), count(*) filter (where c.relrowsecurity) as rls,
       count(*) filter (where c.reloptions @> array['security_invoker=on']) as invoker
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'web\_%' and c.relkind in ('r', 'v')
group by 1;
select count(*) from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'web\_%'
  and grantee in ('anon', 'authenticated');
```
