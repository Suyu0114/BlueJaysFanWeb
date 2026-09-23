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
> **Verified against live DB: 2026-09-06** (migrations `001`–`012` applied;
> `web_player_season_stats` at 32 columns, `web_statcast_events` at 29,
> `web_standings` at 38).
>
> This Supabase project is **shared** with other projects, so every table here is
> prefixed `web_`. See CLAUDE.md → "Supabase tables are shared — prefix everything
> with `web_`" for the rule and why.

---

## Table index (live row counts @ 2026-06-03)

| Table | Rows | Grain | Source |
|---|---:|---|---|
| [`web_players`](#web_players) | 1,576 | one row per MLBAM player | MLB Stats API roster + bio |
| [`web_statcast_events`](#web_statcast_events) | 132,502 | one row per pitch | Baseball Savant (Statcast) |
| [`web_player_season_stats`](#web_player_season_stats) | 189 | one row per (player, season) | MLB Stats API `season` + `sabermetrics` (FanGraphs-licensed); nightly |
| [`web_player_seasons`](#web_player_seasons) | 157 | one row per (player, season, team) | derived during ETL |
| [`web_fielding_frv`](#web_fielding_frv) | 1,570 | one row per (player, season, position) | Baseball Savant OAA leaderboard |
| [`web_id_map`](#web_id_map) | 0 | one row per MLBAM id | Chadwick register (lazy cache) |
| [`web_games`](#web_games) | 342 | one row per game_pk | MLB Stats API schedule |
| [`web_player_game_stats`](#web_player_game_stats) | 984 | one row per (game, player, stat group) | MLB Stats API boxscore |
| [`web_standings`](#web_standings) | 90 | one row per (team, season) — snapshot | MLB Stats API standings |

---

## ⚠️ Columns that DO NOT exist (anti-index)

Read this before assuming a column. Each of these has been assumed at least once
and is genuinely absent:

| Assumed column | Where on | Reality |
|---|---|---|
| `bb_type` | `web_statcast_events` | **Absent.** `docs/P7_spec.md:360` backlog assumed GB/FB/LD can be derived from it. They cannot — it was never pulled into the schema. To add GB/FB/LD you must extend the ETL (`STATCAST_COLUMNS` + a migration) or approximate from `launch_angle`. |
| `launch_speed_angle` / barrel flag | `web_statcast_events` | **Absent.** Statcast's per-event barrel classification is not stored. The P8 EV/LA "barrel zone" is a *visual reference rectangle only*, not per-point truth. |
| `name_tc` (Chinese name) | `web_players` | **Intentionally absent.** Single English `name` field by design — see CLAUDE.md → "What stays English even in zh-TW". Do not add it. |
| `woba` / `babip` / per-event run value | `web_statcast_events` | **Absent.** Only the raw Statcast fields below are stored; sabermetric aggregates live in `web_player_season_stats` (season grain), not per pitch. |
| `games_back` as a **number** | `web_standings` | **It is `text`, not numeric** — and deliberately so. MLB sends display strings with sentinels: `'-'` (this team *is* the reference), `'+9.5'` (ahead of the wild card cut line), `'E'` (eliminated, on `elimination_number`). Same for `wc_games_back`, `elimination_number`, `wc_elimination_number`, `magic_number`. Never cast or arithmetic them; **order by the `*_rank` columns instead.** |
| `standings_date` / any date dimension | `web_standings` | **Absent by design (P11 D2).** The table is a *snapshot*, overwritten nightly — 30 rows per season, not one row per day. A GB-over-time race chart needs a new column + PK change first. |

---

## `web_players`
*Migration: `001` (+ `003` added the three `birth_*` columns). Writer:
[`etl/db.py`](../etl/db.py) `upsert_players` / `upsert_players_full`. Conflict key: `(mlbam_id)`.*

**Not just Blue Jays.** `web_statcast_events.batter_id` and `.pitcher_id` are FKs
into this table, so **every opponent batter/pitcher a Jay has faced is also here**
— that's why it holds ~1,576 rows, not ~26. To identify actual Jays use
[`web_player_seasons`](#web_player_seasons) / `is_active_26`, not membership in this table.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `mlbam_id` | bigint | NO | **PK.** MLBAM player id. |
| `name` | text | NO | English display name (e.g. `Vladimir Guerrero Jr.`). |
| `position` | text | yes | Primary position. |
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

The big one (~132k rows). One row per pitch. **The writer inserts a hardcoded
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
| `description` | text | yes | Per-pitch result (`called_strike` / `ball` / `hit_into_play` / …). |
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
**team-scoped** (a traded player's row covers his Blue Jays games only). The
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

## `web_player_seasons`
*Migration: `003`. Writer: [`etl/db.py`](../etl/db.py) `upsert_player_seasons`.
Conflict key: `(mlbam_id, season, team_id)`.*

Per-season participation. Drives (a) which years to query during backfill /
nightly refresh and (b) which of the Batting/Pitching/Fielding subpages to render
on the player overview. The boolean upserts are **OR-merged** (once true, stays true).

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
(distinct `game_pk`, same `game_date`, different `game_number`).

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

---

## `web_player_game_stats`
*Migration: `007`. Writer: [`etl/db.py`](../etl/db.py) `upsert_player_game_stats`
(built by `pull_boxscore.py`). Conflict key: `(game_pk, mlbam_id, stat_group)`.*

Per-game box-score lines. **One row per (game, player, stat group)** — a two-way
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
nightly run — 30 rows/season. There is no date dimension (P11 D2), so you can read
"where do the Jays stand right now", never "where did they stand in June".

**All 30 clubs, both leagues** — unlike [`web_games`](#web_games), which is
Jays-only. This is the only table holding other clubs' records.

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
          "web_games","web_player_game_stats"]
with psycopg.connect(os.environ["DATABASE_URL"], prepare_threshold=None) as c:
    for t in tables:
        cols = c.execute("""select column_name, data_type, is_nullable
            from information_schema.columns where table_name=%s
            order by ordinal_position""", (t,)).fetchall()
        print(t, len(cols)); [print("  ", *r) for r in cols]
```

Run: `conda run -n MLBxBaZi python <script>.py`. Expect the column counts in the
table index above (11 / 29 / 32 / 7 / 12 / 6 / 16 / 27). Re-confirm the anti-index
holds (`bb_type`, `launch_speed_angle` still absent).
