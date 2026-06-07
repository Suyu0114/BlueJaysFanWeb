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
> **Verified against live DB: 2026-06-05** (migrations `001`–`009` applied;
> `web_player_season_stats` re-confirmed at 24 columns).
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
| [`web_player_season_stats`](#web_player_season_stats) | 170 | one row per (player, season) | FanGraphs CSV export (manual) |
| [`web_player_seasons`](#web_player_seasons) | 157 | one row per (player, season, team) | derived during ETL |
| [`web_fielding_frv`](#web_fielding_frv) | 1,570 | one row per (player, season, position) | Baseball Savant OAA leaderboard |
| [`web_id_map`](#web_id_map) | 0 | one row per MLBAM id | Chadwick register (lazy cache) |
| [`web_games`](#web_games) | 342 | one row per game_pk | MLB Stats API schedule |
| [`web_player_game_stats`](#web_player_game_stats) | 984 | one row per (game, player, stat group) | MLB Stats API boxscore |

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
*Migration: `001` (+ `004` added `plate_alignment`). Writer:
[`etl/db.py`](../etl/db.py) `upsert_statcast_events`. Conflict key:
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

---

## `web_player_season_stats`
*Migration: `001` (+ `008` added `war_*` / `rar` / `wpa`; + `009` added the
`avg`/`obp`/`slg`/`hr`/`rbi`/`sb`/`pa` basic line). Writer:
[`etl/pull_season_stats.py`](../etl/pull_season_stats.py). Conflict key: `(mlbam_id, season)`.*

Pre-aggregated season lines from **manually-exported FanGraphs CSVs** (the
scraper is dead — see CLAUDE.md → "FanGraphs scraping is dead"). Missing CSVs warn
and skip (leave NULLs), never hard-fail. The `war_*` block is **batter-only**
(from the FanGraphs "Value" preset); the P9 basic line (`avg`…`pa`) is also
batter-only and comes from the standard Dashboard columns of the same CSV — both
are OPTIONAL (warn + NULL if the export lacks them, `coalesce` on upsert).

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
| `war_fielding` | numeric | yes | Fld (pure fielding, excl. positional). |
| `war_positional` | numeric | yes | Pos. |
| `war_league` | numeric | yes | Lg. |
| `war_replacement` | numeric | yes | Rep. |
| `rar` | numeric | yes | Runs above replacement = Bat+BsR+Fld+Pos+Lg+Rep (checksum for the WAR breakdown chart). |
| `wpa` | numeric | yes | Season Win Probability Added. |
| `avg` | numeric | yes | Batting average (H/AB). Batter-only (`009`). |
| `obp` | numeric | yes | On-base percentage. |
| `slg` | numeric | yes | Slugging (`ops` = `obp` + `slg`). |
| `hr` | numeric | yes | Home runs (stored numeric to dodge psycopg float→int). |
| `rbi` | numeric | yes | Runs batted in. |
| `sb` | numeric | yes | Stolen bases. |
| `pa` | numeric | yes | Plate appearances (volume context for the year-by-year table). |

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
   "Zone coords" filter in `PitchingExplorer` (the usage bars stay cross-season;
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
   toggle appears when both eras are present, defaulting to the newest. The usage
   bars stay cross-season (they don't read plate coords). The single-alignment
   guarantee is enforced client-side at the heatmap, **not** by the query — so a
   new plate-coordinate consumer must still scope alignment itself.
2. **`web_id_map` is empty (0 rows).** By design it's a lazy cache, but worth
   knowing nothing currently depends on it being warm.
3. **EV-but-no-coordinate batted balls are dropped** from the batting page (see
   invariant #2). Acceptable trade-off (keeps one filtered array driving both the
   spray chart and the P8 EV/LA scatter), but it means the scatter's "with EV"
   count can never exceed the spray population.
4. **Batting & Pitching subtitles "2025 regular season" — RESOLVED 2026-06-03.**
   The `Batting.subtitle` / `Pitching.subtitle` keys (en + zh-TW) now read
   season-agnostically ("…on file" / "…紀錄") to match the all-seasons fetch.

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
table index above (11 / 23 / 24 / 7 / 12 / 6 / 16 / 27). Re-confirm the anti-index
holds (`bb_type`, `launch_speed_angle` still absent).
