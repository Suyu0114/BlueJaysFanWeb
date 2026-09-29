# P12 — Season Review & Year-over-Year (2026 vs 2025)

> Handoff spec, written at **plan time (2026-09-25)**. Follows `CLAUDE.md`
> (conda env `MLBxBaZi`, `web_` prefix, one concern per migration, server
> components by default, English-first i18n, brand tokens, the **Motion**
> section). Decisions in §0 are locked — **do not relitigate them**; flag a
> contradiction instead of silently working around it.
>
> Every data fact in §1 was **measured against the live DB / endpoints on
> 2026-09-25** with read-only probes. The 2026 season ends **2026-09-27**
> (3 games left at time of writing), so the final numbers land after that.
>
> **Revision 2026-09-29 (owner-approved, before any P12 code was written).** The
> owner wants each player compared **with himself across seasons, including time
> with other clubs** (e.g. Varsho's post-deadline Astros games, Dylan Cease's
> Padres seasons). Changes vs the 2026-09-25 draft: M0 gains a full-MLB history
> backfill for the 2026 roster (§2 steps 3–4) and migration `014`; the old M3
> `?vs=` mode is **replaced** by a dedicated Compare tab (§5); **D1 amended**,
> **D7 replaced**, **D13–D16 added**; migrations renumbered (`015` views,
> `016`–`019` M6). Probe facts for the revision are in §1b.

---

## 0. Scope

**Why.** The owner is writing two articles: **(A) a 2026 season review** and
**(B) 2026 vs 2025**. The site cannot support either today:

- every chart is single-season or an all-seasons blend — **no year-over-year view**;
- **no plate discipline** anywhere (Chase%, Z-Swing%, CSW%…), although the per-pitch
  data is in `web_statcast_events`;
- **no league context** — the DB only holds Jays players, so "is .695 OPS bad?"
  can't be answered on the page;
- **no team-season view** (record trajectory, run differential, splits);
- chart state lives only in client memory — an article **can't link to or export**
  a specific view;
- **only a player's Blue Jays time is known**: `web_player_season_stats` is
  team-scoped, and Statcast is pulled only for seasons the player was a Jay — a
  newcomer has no pre-Jays seasons, a deadline departure shows only his TOR line.

**Milestones — build in order, one commit each, each shippable on its own:**

| # | Milestone | Kind | Unblocks |
|---|---|---|---|
| M0 | Data repair + full-MLB history for the 2026 roster + season freeze | ETL, migrations `013`, `014` | everything (2026 hole, postseason mixing, 2024/2025 box scores, other-team seasons) |
| M1 | Article data pack (`etl/season_report.py`) | ETL/report, migration `015` (views) | the articles, immediately |
| M2 | Plate discipline + batted-ball profile | web | article B's core narrative |
| M3 | **Compare tab** `/[locale]/players/[id]/compare` + team labels on existing tabs | web | article B's charts, "how did he do elsewhere?" |
| M4 | Prior-season overlay on the rolling sparklines | web | "slow start / strong finish" stories |
| M5 | Team season page `/[locale]/season/[year]` | web | article A's backbone |
| M6 | League context: Savant percentiles, xwOBA-vs-wOBA, Barrel%, pitch run value, league averages | ETL + migrations `016`–`019` + web | "good or bad?" for English readers |
| M7 | Article tooling: PNG export + copy-table | web | putting charts into the articles |

**Out of scope (backlog, §14):** hosting the articles on the site, daily
standings history, player-vs-player `/compare`, BaZi (v2), WPA (frozen, no source).

### Decision log (locked)

| # | Decision | Choice |
|---|---|---|
| D1 | Scope of every **new** aggregate | *(amended 2026-09-29)* Two scopes, regular season (`e.game_type = 'R'`) in both. **`jays`** = "as a Blue Jay": the player is in **that game's Jays box score** — `exists web_player_game_stats (game_pk, mlbam_id)` for the row's batter (batter views) or pitcher (pitcher views). **`mlb`** = every row. `game_pk ∈ web_games` is **not** enough: Varsho-as-an-Astro faced Toronto 2026-08-03→05 and Cease-as-a-Padre faced Toronto, both inside Jays games (§1b). **Team aggregates** (the report's team files, M4, M5) stay `jays`, matching `web_player_season_stats` (team-scoped, `teamId=141`). **Per-player views** expose both scopes (`scope` column). Existing views keep their current behaviour (all rows, no scoping) apart from the M3 team labels. |
| D2 | Comparison pair | Default **current season vs previous** (`2026` vs `2025`); generic `season` / `vs` params so `2025 vs 2024` works with no extra code. |
| D3 | Plate coordinates across seasons | **Never overlay `plate_x`/`plate_z` across `plate_alignment` values** (CLAUDE.md invariant; 2026 moved the origin 1–3 in). Cross-season **location** comparisons use Savant's semantic `zone` cells (1–9 in-zone, 11–14 out) as bucket percentages. The heatmap stays single-alignment. |
| D4 | Where metric definitions live | **One place: SQL views (migration `015`)** read by both the web app and the Python report — so the article's numbers and the site's numbers cannot drift. Swing/whiff sets **mirror** `web/lib/pitch-arsenal.ts` (`SWINGS` / `WHIFFS`); cross-reference comments in both files. |
| D5 | Batted-ball types | `bb_type` is **not stored** (DATA_MODEL anti-index). Approximate from `launch_angle` with Savant's buckets (§11) and **label "approx."** in UI and report. Official **Barrel%** comes only from Savant's leaderboard (M6) — never computed locally. |
| D6 | League context source | Store **Savant's own percentile ranks / leaderboard values as-is** (pybaseball → Savant, unaffected by the FanGraphs 403). Only rows for players in `web_player_seasons` for that season (plus the D13 cohort's other-club seasons). Absent row = "not qualified", **never 0**. |
| D7 | Compare UX | *(replaced 2026-09-29)* A **dedicated tab** `/[locale]/players/[mlbam_id]/compare` next to Overview / Batting / Pitching / Fielding (**not** a `?vs=` mode on the existing pages). State lives in the URL — `season` (default latest MLB season), `vs` (default the previous MLB season), `scope=mlb\|jays` (default **`mlb`**) — so every view is a shareable article link and works without JS. Tab shown when the player has ≥ 2 MLB seasons in `web_player_team_season_stats`. Distinct from the v2 player-vs-player `/[locale]/compare/`. |
| D8 | Colours for two seasons | Current season **brick**, comparison season **steel** (muted / dashed / hollow). Deltas: improvement **grass**, decline **brick** — per-stat direction (ERA/WHIP/BB%/Chase%-as-batter: lower is better). Brand tokens only. |
| D9 | Article pack output | Markdown + CSV under `reports/season-review-<year>/`, **git-ignored** (add `reports/` to `.gitignore`). Numbers + definitions + caveats only — prose is the owner's. |
| D10 | Dependencies | **None new.** pybaseball already has the Savant functions; PNG export uses native `XMLSerializer` + canvas; `motion` is already installed. |
| D11 | New season page placement | `/[locale]/season/[year]`, `generateStaticParams` from seasons in `web_games`, `revalidate = 3600`; nav label "Season". |
| D12 | Sample thresholds for "same player, both seasons" | **Batters ≥ 150 PA, pitchers ≥ 40 IP** as Jays in *each* season (≥300 PA / ≥60 IP leaves only 6 batters / 2 pitchers — §1). Thresholds are constants, printed in the report header. The Compare tab reuses them for its "small sample" badge (in the selected scope). |
| D13 | History cohort | *(2026-09-29)* **Every player on the 2026 `fullSeason` roster** (`web_player_seasons` season 2026 — traded in **and** out; 64 players), **full MLB regular season 2024–2026** with every club. No minor leagues, no NPB/KBO (Okamoto has 2026 only). Other rosters' players are not backfilled. |
| D14 | Per-team season lines | *(2026-09-29)* New table `web_player_team_season_stats` (migration `014`), PK `(mlbam_id, season, team_id)`, from MLB Stats API `/people/{id}/stats` (per-team splits + the team-less total). **`team_id = 0` = MLB season total** and is **always written** (copied from the single split for one-team seasons), so "full season" readers never sum. `web_player_season_stats` is **unchanged** (Jays-only, existing pages keep reading it); the `team_id = 141` rows of the new table must equal it (M0 check). |
| D15 | `web_player_seasons` stays Jays-only | *(2026-09-29)* Other-club seasons are **not** written to `web_player_seasons` (it drives the roster, `getPlayerAvailability`, and the Statcast pull lists). Other-club membership is read from `web_player_team_season_stats`. |
| D16 | Other-club data on the existing tabs | *(2026-09-29)* **Shown, labelled.** After the backfill, Batting / Pitching / Fielding include other-club seasons (as they already include deadline departures' post-trade games); season chips and the fielding season cell carry team abbreviations (`2025 · SD`, `2026 · TOR/HOU`). `PitchingExplorer` gains a season filter so seasons with different clubs don't blend. Overview stays Jays-scoped. |

---

## 1. Verified data facts (probe 2026-09-25)

**`web_statcast_events` coverage (regular season):**

| Season | Pitches | Alignment | Notes |
|---|---:|---|---|
| 2024 | 55,103 | front | complete |
| 2025 | 53,696 (+5,625 postseason D/L/W) | front | complete (count / pfx / xwOBA ≥ 99%) |
| 2026 | 51,968 | middle | **HOLE: 15,824 rows dated 2026-07-08 → 2026-08-30 have NULL `balls`, `strikes`, `pfx_x`, `pfx_z`, `release_extension`, `estimated_woba`** |

Root cause of the hole: the P10 re-backfill ran locally ~2026-07-07, but the P10
ETL code was only pushed on 2026-09-06; in between, the GitHub cron ran the
pre-P10 column list and inserted new rows without the detail columns. The cron is
correct now (September rows are complete); the hole needs a **one-time re-pull**
(M0). After repair, xwOBA-on-contact coverage for 2026 should rise from 6,374 /
9,280 BIP to ~99% like 2024/2025.

- **Non-Jays games in Statcast** — 2025 R: 6,498 of 53,696 rows; 2026 R: 5,632
  of 51,968. Not documented anywhere yet → add to DATA_MODEL invariants (M0).
- `description` values (all seasons): `ball, foul, hit_into_play, called_strike,
  swinging_strike, blocked_ball, foul_tip, swinging_strike_blocked,
  automatic_ball, hit_by_pitch, foul_bunt, missed_bunt, automatic_strike,
  pitchout, bunt_foul_tip`.
- `zone` values: 1–9, 11–14, NULL (928 rows total).

**`web_games`:** 2025 = **180 rows = 162 regular + 18 postseason** (through
2025-11-01), **no `game_type` column** — the regular-season record can't be
separated today (180 rows give 104-76). 2026 = 162 rows, 159 final (77-82) at
probe time. `pull_schedule.py` already receives `game_type` from `mlb_api` and
keeps R/F/D/L/W, but doesn't store it.

**`web_player_game_stats`:** 2025 = **2 games only**; 2026 = 159 games. The
2025 per-game log must be backfilled (`pull_boxscore.py --season 2025` exists).

**`web_player_season_stats`:** 2024 56 rows · 2025 58 · 2026 63 (batters 25/24/25,
pitchers 34/38/40). **`web_standings`:** 30 rows for each of 2024–2026 (final
2024/2025 snapshots survive — use 2025's W/L to check M0's `game_type` split).

**Both-season cohort (Jays, strict thresholds):** batters ≥300 PA both years —
Clement, Guerrero Jr., Springer, Giménez, Lukes, Kirk; pitchers ≥60 IP both —
Gausman, Scherzer only. Hence D12.

**Savant via pybaseball 2.2.7 (all return 2026 data):**

| Function | Rows (2026) | Key columns |
|---|---:|---|
| `statcast_batter_percentile_ranks(y)` | 612 | xwoba, xba, xslg, brl_percent, exit_velocity, hard_hit_percent, k_percent, bb_percent, whiff_percent, chase_percent, sprint_speed, oaa, arm_strength, bat_speed, squared_up_rate |
| `statcast_pitcher_percentile_ranks(y)` | 697 | xwoba, xba, brl_percent, exit_velocity, hard_hit_percent, k_percent, bb_percent, whiff_percent, chase_percent, xera, fb_velocity, fb_spin, curve_spin |
| `statcast_batter_expected_stats(y)` | 248 | pa, bip, ba, est_ba, slg, est_slg, woba, est_woba (+ diffs) |
| `statcast_batter_exitvelo_barrels(y, minBBE=1)` | 657 | barrels, brl_percent, brl_pa, anglesweetspotpercent, ev95percent, avg_hit_speed, max_hit_speed |
| `statcast_pitcher_arsenal_stats(y)` | 1,940 | pitch_type, pitches, pitch_usage, run_value, run_value_per_100, whiff_percent, put_away, woba, est_woba, hard_hit_percent |

Note the `player_id` key and the `'last_name, first_name'` name column on some
of them. **MLB Stats API** `…/teams/stats?season=Y&sportIds=1&group={hitting|pitching}&stats=season`
returns 30 teams with counting stats (PA, AB, H, BB, HBP, SO, HR, TB, runs, era…)
— the league-average source for M6.

## 1b. Revision probe facts (2026-09-29, read-only)

- **Cohort:** `web_player_seasons` 2026 = 64 players (all `team_id = 141`; 2024 = 56,
  2025 = 58). Deadline-2026 departures: Varsho (→ HOU), Gausman, Hoffman, Nance,
  Heineman, Lauer, …; mid-season arrivals: Josh Smith, Waldron, Woods Richardson, …
- **API splits:** `/people/{id}/stats?stats=season,sabermetrics&group=hitting,pitching&season=Y&gameType=R`
  returns one split per club **plus a team-less total** (`numTeams`). Varsho 2026:
  total 526 PA / .636, TOR 365 / .682, HOU 161 / .535; Varland 2025: MIN 49.0 IP +
  TOR 23.2 = 72.2. Sabermetrics splits carry the keys the ETL already maps
  (`batting, baseRunning, fielding, positional, wLeague, replacement, rar, war, wRcPlus`).
  `stats=gameLog` gives per-game `team.id` + `date` → club chronology (Varsho: TOR
  03-27→08-02, 99 G; HOU 08-03→09-19, 41 G).
- **Statcast gaps:** a newcomer's pre-Jays seasons are absent — only incidental rows
  from facing Jays hitters/pitchers (Cease 2024: 11 pitches). Mid-season arrivals after
  the 2026-07-07 local backfill miss pre-trade 2026 games (Josh Smith 2026: 9 non-Jays
  pitches). Deadline departures' post-trade games **are** present (the cron pulls by id).
- **`web_games` ≠ "as a Blue Jay":** Varsho's statcast rows in `web_games` games run to
  2026-08-05, but his last Jays game was 08-02 — HOU played TOR 08-03→05.
- **`web_games` has no 2024 rows** (2024 box scores impossible until it does).
- **Size:** DB 100 MB (Statcast 62 MB / 167k rows); the history backfill adds an
  estimated ~100k rows (~40 MB) — fine on the free tier.
- All 30 club logos exist in `web/public/team-logos/`; `web/lib/team-abbr.ts::teamAbbr`.

---

## 2. M0 — Data repair + full-MLB history + season freeze

1. **Migration `013_games_game_type.sql`**: `alter table web_games add column
   game_type char(1)` + index `(season, game_type)`. Extend `db.upsert_games` and
   `pull_schedule.py` to write it. Run `pull_schedule.py --season 2024` (**new** —
   2024 has no rows), `--season 2025`, `--season 2026`. **Verify:** 2025
   `game_type='R'` count = 162 and its W/L equals `web_standings` 2025 `w`/`l`; 18
   postseason rows; 2024 R = 162 matching `web_standings` 2024; no NULLs left.
2. **Box scores 2024 + 2025:** `python etl/pull_boxscore.py --season 2024` and
   `--season 2025` (all finals incl. postseason — `game_type` separates them).
   They define "as a Blue Jay" (D1). **Verify:** ~162 R games per season with both
   `batting` and `pitching` rows.
3. **Migration `014_player_team_season_stats.sql`** (D14) → `web_player_team_season_stats`:
   PK `(mlbam_id, season, team_id)`, `team_id = 0` = MLB total, FK `mlbam_id →
   web_players`; the stat columns of `web_player_season_stats` (war_* / rar / basic
   line / pitcher line; no `wpa`) + `g`, `first_game`, `last_game` (date), `updated_at`.
   - `etl/mlb_api.py`: `fetch_player_season_splits(pid, season)` → per club + total,
     hitting and pitching merged per split; `fetch_player_team_dates(pid, season)`
     (gameLog → first/last date + G per club). `_fetch_player_team_split` reuses the
     former, so the traded-away patch path is unchanged.
   - The column mapping in `pull_season_stats.py` (`BATTING_COLS`, `PITCHING_COLS`,
     `war_fielding = rar − others`, `k_pct/bb_pct` from BF, two-way WAR sum) becomes one
     shared `to_row()` used by both scripts — never duplicated.
   - `etl/pull_player_splits.py --cohort-season 2026 --season 2024 --season 2025 --season 2026`
     (coalesce upsert). Nightly refresh job: `--cohort-season $SEASON --season $SEASON`.
4. **Statcast:**
   - **Re-pull 2026 for the whole cohort** — fixes the 07-08→08-30 NULL hole **and**
     mid-season arrivals' pre-trade games: `conda run -n MLBxBaZi python etl/backfill.py
     --season 2026` (read `backfill.py` / the argparse first; a narrower statcast-only
     run is fine). **Verify:** 2026 R rows with `balls is null` ≈ 0 (single-digit
     stragglers like the ~20/month `pfx` NULLs are normal).
   - **History (D13):** `pull_statcast.py` / `pull_pitcher.py` gain `--cohort-season`:
     player list = 2026 cohort (role from the 2026 `appeared_as_*`, `DISTINCT`) **∩**
     has a `team_id = 0` row for the target season **∖** already a Jay that season
     (already fully pulled). Window Mar 1 → Oct 5 + the existing `regular_season_only`
     filter (catches the Seoul / Tokyo openers). Run for 2024 and 2025.
   - Fielding needs no pull — `pull_fielding.py` is already league-wide; verify the
     cohort's 2024/2025 rows exist.
5. **Freeze (after 2026-09-27):** once both cron jobs have run after the final
   game, re-run `pull_season_stats.py --season 2026`, `pull_standings.py
   --season 2026` and `pull_player_splits.py --cohort-season 2026 --season 2026`;
   record the freeze timestamp (the report prints it).
6. **Verify (read-only SQL):** `team_id = 141` rows == `web_player_season_stats`
   (OPS, WAR ± 0.01) for every cohort Jays season; Σ club PA / IP == the `team_id = 0`
   row; Varsho 2026 = 526 / 365 / 161; per player-season Statcast PA (batters) / pitches
   (pitchers) within 3% of the API `plateAppearances` / `numberOfPitches`; the `jays`
   predicate gives Cease 2025 → 0 rows and Varsho 2026 → ~365 PA.
7. **Docs:** DATA_MODEL — `web_games.game_type` + migration `013`; the new table +
   migration `014`; invariants "Statcast holds non-Jays games — *as a Blue Jay* =
   box-score membership (D1)" and "`web_player_seasons` is Jays-only (D15)"; Known gap
   for the 2026-07-08…08-30 hole marked **RESOLVED** with root cause. CLAUDE.md
   migrations line + folder tree; ETL_update_flow (box-score + history backfill steps);
   `etl.yml` header comment.

## 3. M1 — Article data pack

**Migration `015_metric_views.sql`** (D4) — read-only views. Each emits a
**`scope` column (`'mlb'` | `'jays'`)** via `union all` (the `jays` half uses the D1
box-score predicate), so web and report read one definition for both scopes; the
report's team-level numbers filter `scope = 'jays'`:

- `web_v_batter_discipline` — per (batter_id, season): pitches, swings, whiffs,
  in-zone pitches, in-zone swings, out-of-zone pitches, chases, contact, first
  pitches, first-pitch swings, PA, K, BB → rates computed in the view.
- `web_v_pitcher_discipline` — per (pitcher_id, season): the same counts from
  the pitcher's side + called strikes → CSW%, Zone%, Chase% induced, Whiff%,
  first-pitch strike%, K%, BB%.
- `web_v_batted_ball_profile` — per (batter_id, season): BIP, GB/LD/FB/PU
  (approx, D5), Pull/Center/Oppo (by `stand`), sweet-spot%, hard-hit%, avg/max EV,
  xwOBAcon.

**`etl/season_report.py --season 2026 --vs 2025`** (conda env; SELECT only)
writes `reports/season-review-2026/`:

| File | Contents |
|---|---|
| `README.md` | freeze timestamp, D1/D5/D12 caveats, all §11 definitions, the D3 plate-frame warning |
| `team.md` | both seasons, **regular season only**: W-L, PCT, RS, RA, DIFF, x-W/L, division finish + GB (from `web_standings`), home/away, one-run games, blowouts (≥5), record vs AL East, record vs teams ≥ .500 (final pct from `web_standings`), monthly W-L, longest win/loss streaks |
| `batters.csv` / `.md` | every Jays batter either season: season line (PA, AVG/OBP/SLG/OPS, wRC+, HR, SB, WAR + components) + views (discipline, batted-ball profile), with Δ columns for the D12 cohort |
| `pitchers.csv` / `.md` | IP, ERA, FIP, WHIP, K%, BB%, WAR + discipline view + per-pitch arsenal (usage / velo / spin / whiff / xwOBAcon) per season with Δ; **NEW** / **DROPPED** pitch flags (usage 0 ↔ ≥ 5%) |
| `movers.md` | top improvers / decliners by ΔwRC+ and ΔERA (cohort only), biggest ΔFB velo, biggest ΔChase%, new pitches |
| `roster_moves.md` | *(2026-09-29)* from `web_player_team_season_stats`: **newcomers** — 2025 line with the prior club(s) vs the 2026 TOR line; **deadline departures** — TOR part vs post-trade part (club, `first_game`→`last_game`), plus the full-MLB total |
| `league_context.md` | league-average OPS / ERA / K% / BB% per season (after M6; until then: "pending M6") |

Arsenal numbers must reuse the same whiff/xwOBAcon rules as `pitch-arsenal.ts`
(xwOBAcon gated on `description = 'hit_into_play'` — DATA_MODEL warning).

## 4. M2 — Plate discipline + batted-ball profile (web)

- `web/lib/discipline.ts`: `getBatterDiscipline(id, scope)`, `getPitcherDiscipline(id, scope)`,
  `getBattedBallProfile(id, scope)` — read the `015` views, all seasons, `float8` casts.
  The overview passes `'jays'`; the Compare tab passes its URL scope.
- The cards take **two season columns** (`a`, `b` + Δ) rather than hard-coding
  "newest vs prior", so the Compare tab reuses them unchanged.
- **Batter overview:** `DisciplineCard` (Chase%, Z-Swing%, Whiff%, Contact%, K%,
  BB%, 1st-pitch swing%) and `BattedBallProfileCard` (GB/LD/FB/PU approx,
  Pull/Center/Oppo, Sweet-spot%, Hard-hit%) — on the overview: newest Jays season
  vs the prior Jays season, Δ chip (D8 direction). Place after `ContactQualityCard`.
- **Pitcher overview:** `PitcherDisciplineCard` (CSW%, Zone%, Chase%, Whiff%,
  1st-pitch strike%, K-BB%) after `PitcherRecentForm`.
- Each metric gets a one-line plain-English hint (like the P10 KPI hints) — this
  is what makes it readable for non-stat readers.

## 5. M3 — Compare tab `/[locale]/players/[mlbam_id]/compare` (web)

*(Replaced 2026-09-29 — D7 / D16.)*

**Route & state.** Server page, `revalidate = 86400` like its siblings. Reads
`searchParams`: `season` (default latest MLB season), `vs` (default the previous MLB
season; any two of 2024–2026 work), `scope=mlb|jays` (default `mlb`). Selectors are
`Link`s (the roster `?mode=` pattern) in `ScorecardFrame variant="control"` +
`SlidingPill`, so it works without JS and each view is an article link. The `jays`
option is disabled with a hint when the player has no Jays games in one of the two
seasons.

**Availability.** ≥ 2 seasons with a `team_id = 0` row in
`web_player_team_season_stats`. Add `compare` to `PlayerSection` / `PlayerAvailability`
/ `getPlayerAvailability` (`web/lib/players.ts`); tab after Fielding, before BaZi.

**Data.** `web/lib/compare.ts`: `getTeamSeasonLines(id)` (all rows of the new table)
and `getSeasonTeams(id)` (season → club ids ordered by `first_game`). `getBattedBalls`
/ `getPitches` gain an `as_jay` boolean (the D1 `exists`) and `estimated_woba` on
batted balls, so scope is applied in TS with the existing pure helpers.

**Modules** (`Reveal` entrances, `panel` frames, D8 colours):
1. **Header** — each season with its club logos in order (`TeamLogo`, `TOR → HOU`),
   small-sample badge under D12 thresholds.
2. **What changed** — the 3–5 largest meaningful deltas as plain-English sentences
   ("Chase% down 4.1 pts → fewer bad swings"). Pure `web/lib/season-deltas.ts` with
   per-stat direction + sample gate.
3. **Tale of the tape** — season line A | B | Δ. Batters: G, PA, AVG / OBP / SLG, OPS,
   wRC+, HR, SB, WAR. Pitchers: G, GS, IP, W-L, SV, ERA, FIP, WHIP, K%, BB%, K-BB%,
   WAR. Per-club sub-rows when a season spans clubs (scope `mlb`).
4. **2024–2026 arc** — Recharts small multiples in `WhenInView` (batters OPS / wRC+ /
   WAR / K% / BB%; pitchers ERA / FIP / WHIP / K% / BB% / WAR), the two compared
   seasons highlighted, club abbreviation under each tick.
5. **Statcast, batters** — M2 discipline + batted-ball cards (two seasons, the URL
   scope); contact (Avg / Max EV, Hard-hit%, Sweet-spot%, xwOBAcon via
   `computeExitVeloStats`); **side-by-side** `SprayChart`s (brick = season, steel
   frame = vs) with Pull / Center / Oppo bars.
6. **Statcast, pitchers** — `ArsenalCompareTable` (`buildArsenal` per season → usage,
   velo, spin, Whiff%, xwOBAcon, Δ, NEW / DROPPED at usage 0 ↔ ≥ 5%);
   `PitchMovementChart` gains `ghostMeans` (hollow steel vs-season means + arrow to the
   current mean — pfx is release-frame, alignment-safe); velo overlay on an
   **appearance-number** axis (`veloTrend` per season); `ZoneGrid` — two small
   Savant-style zone charts (cells 1–9 + 11–14, % of pitches) from the semantic `zone`,
   never `plate_x/z` (D3).

**Existing tabs (D16).** `SprayChartExplorer` season chips read `2025 · SD` /
`2026 · TOR/HOU` (new `seasonTeams` prop). `PitchingExplorer` gains season chips
(default newest, like the spray fix `3fbd789`); months are per season; the velo trend
follows the selected season; the "Zone coords" toggle shows only under "All". The
fielding season cell gets the club label. Overview: unchanged Jays-scoped modules plus a
one-line link to Compare when the player has other-club seasons;
`getBatterGamesPlayed` counts Jays box-score games so the pace matches the Jays-only WAR.

## 6. M4 — Prior-season overlay on the rolling sparklines

Now that 2025 box scores exist (M0), `RollingOpsSparkline` / `RollingEraSparkline`
take an optional `prior` series plotted on a **game-number** x-axis (dashed
steel), current season brick. Tooltip shows both values at that game number.
`getBatterGameLog` / `getPitcherGameLog` already take a `season` arg; after M0
they must also filter `g.game_type = 'R'` (2025 box scores include 18 postseason
games) and their "2024/2025 are not backfilled" header comments must be updated.
`rollingOps` / `rollingEra` get re-indexed by game number. Scope is `jays` by
construction (box scores are Jays-only); no other-club game logs exist (backlog).

## 7. M5 — Team season page `/[locale]/season/[year]`

Server page, `ScorecardFrame variant="panel"` modules, `Reveal` entrances. All
from `web_games` (`game_type='R'`), `web_standings`, `web_player_season_stats`:

1. **Record strip** — W-L, PCT, RS, RA, DIFF, x-W/L, division finish, each with Δ
   vs the prior season.
2. **Games above .500 by game number** — both seasons overlaid (Recharts, drawn
   on scroll-in via `WhenInView`).
3. **Cumulative run differential** — same axes.
4. **Monthly record** — table, both seasons.
5. **Splits** — home/away, one-run, blowouts, vs AL East, vs ≥ .500 teams.
6. **Team leaders** — WAR / OPS / HR / ERA / SO leaders with prior-season value.
7. **WAR by position group** (C, 1B, 2B, 3B, SS, OF, DH, SP, RP) — 2025 vs 2026
   bars. SP/RP split by `gs` share.

Header nav gains "Season" (→ latest season). `/zh-TW` mirrors; labels translated,
jargon English.

## 8. M6 — League context (ETL + web)

**Migrations (one concern each):**

- `016_savant_percentiles.sql` → `web_savant_percentiles` PK `(mlbam_id, season,
  role)`, `role in ('batter','pitcher')`, one nullable `smallint` per §1 percentile
  column.
- `017_savant_season.sql` → `web_savant_season` PK `(mlbam_id, season)`: pa, bip,
  ba, xba, slg, xslg, woba, xwoba, barrels, brl_percent, brl_pa, sweet_spot_pct,
  ev95_pct, avg_ev, max_ev (batters; expected-stats + exitvelo_barrels joined on
  `player_id`).
- `018_pitch_arsenal_rv.sql` → `web_pitch_arsenal_rv` PK `(mlbam_id, season,
  pitch_type)`: pitches, usage, run_value, run_value_per_100, whiff_pct,
  put_away, woba, xwoba, hard_hit_pct.
- `019_league_season.sql` → `web_league_season` PK `(season, league)` with
  `league in ('AL','NL','MLB')`: PA, OBP, SLG, OPS, ERA, K%, BB% (aggregate the 30
  teams' counting stats, then compute rates — never average the rates).

Savant values are season totals across clubs (full-MLB scope), which is what the
Compare tab's `mlb` scope shows; label them so on the Jays-scoped overview.

**ETL:** `etl/pull_savant_leaderboards.py --season Y` (filter each leaderboard to
ids in `web_player_seasons` for Y **plus the D13 cohort's players with a
`team_id = 0` row for Y**, upsert all three Savant tables) and
`etl/pull_league_averages.py --season Y`. Add both to the ~09:00 ET **refresh**
job (pybaseball is only installed there) and to `backfill.py`; backfill
2024–2026.

**Web:**
- `PercentileBars` (Savant-style 0–100 bars; low → steel, high → brick) on both
  overviews with a season switch; "not qualified" state (D6).
- Luck chip: wOBA vs xwOBA ("hit into bad luck" / "outperformed contact").
- `ArsenalTable`: Run Value / 100 column.
- League-average reference lines on the rolling sparklines and the season page.

## 9. M7 — Article tooling

- `web/lib/export-svg.ts` + a small "Download PNG" button on SVG charts (spray,
  EV/LA, movement, heatmap, the Recharts charts): serialize the `<svg>`,
  **resolve `var(--color-*)` to literal hex** (a standalone SVG image can't see
  page CSS), draw at 2× to a canvas, download, with a footer caption
  "Blue Jays Fan Hub · Baseball Savant / MLB Stats API · <date>". Known limit:
  web fonts don't load inside an SVG-as-image → system serif fallback; accept it.
- "Copy table" (TSV to clipboard) on the stat tables (year-by-year, arsenal,
  discipline, season-page tables) for pasting into the articles.
- Every M3/M5 view is already a stable URL — list the article-ready URLs in the
  report README.

## 10. i18n

English first, then zh-TW, key parity. New namespaces as needed (`Discipline`,
`Compare`, `Season`, `Percentiles`, `Export`). Stat names stay English in both
locales (Chase%, Z-Swing%, CSW%, Barrel%, xwOBA, wOBA, Run Value, Sweet-spot%,
GB/LD/FB/PU, Pull/Oppo); the one-line hints and sentences are translated.

## 11. Formulas & conventions

```
WHIFFS  = swinging_strike, swinging_strike_blocked, foul_tip, missed_bunt   (= pitch-arsenal.ts WHIFFS)
SWINGS  = WHIFFS + foul, hit_into_play, foul_bunt, bunt_foul_tip           (= pitch-arsenal.ts SWINGS)
in_zone = zone between 1 and 9          out_zone = zone between 11 and 14   (NULL zone excluded)
Chase%     = swings on out_zone / out_zone pitches
Z-Swing%   = swings on in_zone / in_zone pitches
Whiff%     = WHIFFS / SWINGS            Contact% = 1 − Whiff%
CSW%       = (called_strike + WHIFFS) / pitches
Zone%      = in_zone / pitches with zone
1st-pitch swing%  = swings with balls=0 and strikes=0 / pitches with balls=0 and strikes=0
1st-pitch strike% = (called/swinging strike, foul, foul_tip, in play) at 0-0 / pitches at 0-0
PA         = rows with event not null (exclude 'truncated_pa')
K%         = event in ('strikeout','strikeout_double_play') / PA
BB%        = event in ('walk','intent_walk') / PA
GB / LD / FB / PU (approx) = launch_angle < 10 / 10–25 / 25–50 / > 50
Sweet-spot%  = launch_angle between 8 and 32 / BIP with LA
Hard-hit%    = launch_speed >= 95 / BIP with EV       (same as lib/exit-velo-stats.ts)
spray angle  = degrees(atan2(x_feet, y_feet)); x > 0 = right-field side
Pull / Center / Oppo = angle < −15 / |angle| ≤ 15 / > 15 for RHB; mirrored for LHB (use `stand`)
xwOBAcon     = avg(estimated_woba) where description = 'hit_into_play'
games above .500 = cumulative (W − L) by game number (date, game_number order), R only
one-run game = |jays_score − opp_score| = 1        blowout = margin ≥ 5
league rates = computed from summed team counting stats, never averaged rates
```

Verify the spray-angle orientation against one known pulled home run before
shipping M1. Report numbers and site numbers must agree (§13, M2 item 3).

## 12. What NOT to change

| Item | Reason |
|---|---|
| `plate_alignment` invariant | No cross-alignment overlay of plate coordinates — D3. |
| Existing single-season defaults | Compare lives on its own tab (D7); existing pages only gain team labels + the pitching season filter (D16). |
| `web_player_season_stats` | Stays Jays-only, PK `(mlbam_id, season)`; other-club lines go to `web_player_team_season_stats` (D14). |
| `web_player_seasons` | Stays Jays-only (D15) — it drives the roster, availability and pull lists. |
| `web_games` / `web_player_game_stats` | Stay Jays-only (P11). Adding **2024 Jays games** is backfill, not widening. |
| `web_standings` grain | Stays a snapshot. Games-above-.500 comes from `web_games`, so no history table is needed. |
| Migrations `001`–`012` | Never edited or reordered; `013`–`019` are additive. |
| FanGraphs | No CSV path, no scraping (CLAUDE.md). Savant + MLB Stats API only. |
| `name_tc` / localized team names | Still forbidden. |
| `ScorecardFrame` / motion internals | Consume them; follow the CLAUDE.md **Motion** rules (tooltips via `ChartTooltip`, CSS keyframes for marks with `backwards` fill, `Reveal` for entrances). |

## 13. Done-when checklist

| # | Criterion |
|---|---|
| M0-1 | 2026 R rows with `balls is null` ≈ 0; 2026 BIP xwOBA coverage ≥ 98%. |
| M0-2 | `web_games.game_type` populated for 2024–2026; 2024 and 2025 R = 162 games each, matching `web_standings` W/L; 2025 has 18 postseason rows. |
| M0-3 | 2024 and 2025 box scores present for ~162 R games each. |
| M0-4 | `web_player_team_season_stats` holds every cohort player-season with an MLB line; `team_id = 141` rows == `web_player_season_stats` (OPS / WAR ± 0.01); Σ clubs == total; Varsho 2026 = 526 / 365 / 161. |
| M0-5 | Cohort Statcast within 3% of API PA (batters) / pitches (pitchers) for every player-season 2024–2026; `jays` predicate: Cease 2025 → 0 rows, Varsho 2026 ≈ 365 PA. |
| M1-1 | `reports/season-review-2026/` generated after the freeze; README lists definitions, thresholds, freeze time; `reports/` git-ignored. |
| M1-2 | Views return the same Whiff% as `buildArsenal` for one pitcher-season (±0.1 pt). |
| M2-1 | Discipline + batted-ball cards render for a batter (665489) and a pitcher (592332) in en + zh-TW. |
| M2-2 | Z-Swing / Chase / Zone% for 2025 and 2026 are in plausible MLB ranges (sanity check that `zone` is comparable across the alignment change). |
| M2-3 | Site numbers == report numbers for Vladdy 2026 Chase% and Gausman 2026 CSW%. |
| M3 | en + zh-TW: `/players/662139/compare` (Varsho, 2026 TOR→HOU vs 2025; `?scope=jays` ≈ 365 PA), `/players/656302/compare` (Cease, 2026 TOR vs 2025 SD; `jays` disabled), `/players/592332/compare` (pitcher), `/players/665489/compare?season=2025&vs=2024`; no Compare tab for Okamoto (672960); Cease's pitching season chips read `2025 · SD`; Tale-of-the-tape numbers == `roster_moves.md`. |
| M4 | Sparklines show a dashed 2025 line on a game-number axis. |
| M5 | `/en/season/2026` and `/zh-TW/season/2026` render all 7 modules; 2025 page also works; nav link present. |
| M6 | Four new tables populated for 2024–2026 (Jays players only); cron wired; percentile bars show "not qualified" for a low-PA player. |
| M7 | PNG export produces a correctly coloured image for the spray chart and a Recharts chart; copy-table pastes cleanly into a spreadsheet. |
| All | `tsc --noEmit`, `pnpm lint`, `pnpm build` clean; **no new npm/pip deps**; docs reconciled via `docs/DOC_MAINTENANCE.md` (CLAUDE.md phases row P12, folder tree, migrations line; README; DATA_MODEL for every new column/view/table). |

## 14. Backlog (not in P12)

| Candidate | Note |
|---|---|
| Hosting the articles on the site (`/articles`, MDX) | Owner currently writes elsewhere; revisit if wanted. |
| Player-vs-player `/compare` | M3's compare plumbing + `SprayChart.secondaryEvents` make this small later. |
| Other-club game logs | `stats=gameLog` has them; would need a table without the `web_games` FK. Unlocks full-MLB rolling trends for traded players. |
| History for other seasons' rosters | D13 covers the 2026 roster only; `--cohort-season` makes a 2027 run a one-liner. |
| Daily standings history / race chart | Needs a `standings_date` PK change (P11 D2). |
| Count-leverage heatmaps (by balls/strikes) | Data present after M0; no consumer yet. |
| Bat-speed / squared-up trends | Savant percentiles expose them; raw tracking data not stored. |
| WPA | Frozen since the FanGraphs CSV path died; no free source. |
