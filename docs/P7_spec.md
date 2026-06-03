# P7 — Schedule Calendar + Per-Game Stats + FanGraphs Value Visualizations

> Handoff spec for Claude Code. Follows the conventions in `CLAUDE.md` (conda env
> `MLBxBaZi`, `web_` table prefix, MLB Stats API for enumeration/bio, English-first
> i18n, brand color tokens, one concern per migration). Design decisions in this
> file were locked in a discussion chat; **do not relitigate them**, but flag any
> contradiction discovered during implementation rather than working around it.

---

## 0. Scope

**Committed build (this spec):**
1. **A — Schedule calendar + per-game stats.** Month calendar on the home page;
   clicking a finished game opens a per-game box score (every Jays player's
   batting and/or pitching line for that game). Nightly refresh.
2. **C-partial — WAR breakdown chart + season WPA.** A batter-only stacked-bar
   "how WAR is built" chart on the player overview, plus storing season WPA.

**Candidate backlog (NOT built in P7 — documented only, see §9):** Statcast
EV/LA distribution, Batted Ball GB/FB/LD, Pitch Modeling, per-at-bat "most
clutch" WPA. The first two need **no new data** (already in `web_statcast_events`)
and are the cheapest follow-ups.

**Out of scope (still v2):** all BaZi features, `/compare`, `/predictions`,
injury-risk, daily WAR snapshots.

### Decision log (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Per-game data source | MLB Stats API **boxscore endpoint** + new tables (not Statcast reconstruction) |
| 2 | Refresh timing | **11:30 PM ET** run (freshness) **+ existing 09:00 ET** run (West-Coast / late-final backfill) |
| 3 | Home page | Calendar on home; current / most-recent game day highlighted; "Today's Blue Jays" becomes the **detail of that day's game** |
| 4 | WAR components storage | Add columns to **`web_player_season_stats`** (migration 008) |
| 5 | WPA | **Season total only** (from the batting CSV); per-at-bat "most clutch" deferred |
| 6 | WAR chart | **(B) reconciled version** — exact after the source CSV fix — with an on-page methodology note |
| 7 | `web_player_game_stats` shape | **DEFAULTED to single table + `stat_group` discriminator** (see §2). Flip to two tables is trivial if preferred during review. |

---

## 1. Data sources

- **Schedule + results:** MLB Stats API
  `GET /api/v1/schedule?sportId=1&teamId=141&season=YEAR` (141 = Blue Jays).
- **Box score:** MLB Stats API
  `GET /api/v1/game/{game_pk}/boxscore` (per-player `stats.batting` / `stats.pitching`).
- **WAR components + WPA:** FanGraphs **Value** columns via the existing manual
  CSV drop (`etl/data/fangraphs/batting_{season}.csv`) — see §6.

> **Verify during build (do not assume):**
> - Exact JSON field paths in the boxscore response (`teams.{home,away}.players.ID{mlbam}.stats.batting.*` / `.pitching.*`). Confirm against a live response before mapping.
> - ~~Exact FanGraphs CSV header strings for the Value columns~~ — **confirmed**: `Bat/BsR/Fld/Pos/Lg/Rep/RAR/WPA`, single file, Batting-tab Value section. (Earlier `BsR` duplicate removed at source.)

---

## 2. Migrations

### `db/migrations/006_games.sql`

```sql
-- P7: Blue Jays season schedule + results (calendar source).
-- Source: MLB Stats API /api/v1/schedule?sportId=1&teamId=141&season=YEAR
-- Doubleheaders => two rows (distinct game_pk; same game_date, different game_number).
-- Apply via:  python etl/apply_migration.py db/migrations/006_games.sql

create table if not exists web_games (
  game_pk         bigint  primary key,
  season          int     not null,
  game_date       date    not null,        -- MLB officialDate (ET standings date; late
                                            --   West-Coast games stay on the correct day)
  first_pitch_utc timestamptz,             -- gameDate (UTC); convert to ET for display
  game_number     int     not null default 1,   -- 1 / 2 for doubleheaders
  doubleheader    char(1) not null default 'N', -- 'N' | 'Y' | 'S'
  is_home         boolean not null,
  opponent_id     int     not null,
  opponent_name   text    not null,        -- English, e.g. "New York Yankees"
  jays_score      int,                     -- null until scored
  opp_score       int,
  status          text    not null,        -- detailedState: Scheduled / In Progress /
                                            --   Final / Postponed / Suspended / ...
  is_final        boolean not null default false,
  result          char(1),                 -- 'W' | 'L' | null (derived on final)
  venue           text,
  updated_at      timestamptz not null default now()
);

create index if not exists idx_web_games_date   on web_games (game_date);
create index if not exists idx_web_games_season  on web_games (season);
```

### `db/migrations/007_player_game_stats.sql`

```sql
-- P7: per-game box score lines for Blue Jays players.
-- Source: /api/v1/game/{game_pk}/boxscore (teams.{home,away}.players[].stats)
-- One row per (game, player, stat_group); a two-way player => two rows.
-- FK mlbam_id => only players already in web_players can be stored, so the
-- boxscore ingest MUST insert any unknown Jays player (call-up / trade) into
-- web_players first (fetch bio via mlb_api), or run roster ingest before it.
-- Apply via:  python etl/apply_migration.py db/migrations/007_player_game_stats.sql

create table if not exists web_player_game_stats (
  game_pk       bigint not null references web_games(game_pk) on delete cascade,
  mlbam_id      bigint not null references web_players(mlbam_id),
  stat_group    text   not null,           -- 'hitting' | 'pitching'

  -- hitting (null on pitching rows)
  pa            int,
  ab            int,
  r             int,
  h             int,
  doubles       int,
  triples       int,
  hr            int,
  rbi           int,
  bb            int,
  so            int,
  sb            int,
  hbp           int,

  -- pitching (null on hitting rows; p_ prefix avoids collision with hitting cols)
  outs_recorded int,                        -- store OUTS, never "5.2" (5.2 != 5 2/3 innings)
  bf            int,                         -- batters faced
  p_h           int,
  p_r           int,
  er            int,
  p_bb          int,
  p_so          int,
  p_hr          int,
  pitches       int,
  strikes       int,
  decision      char(1),                    -- 'W' | 'L' | 'S' | 'H' | null

  updated_at    timestamptz not null default now(),
  primary key (game_pk, mlbam_id, stat_group)
);

create index if not exists idx_web_pgs_player on web_player_game_stats (mlbam_id);
create index if not exists idx_web_pgs_game   on web_player_game_stats (game_pk);
```

**IP gotcha (must enforce in ETL + lib):** innings pitched are stored as
`outs_recorded` (int). The conventional "5.2" notation means 5⅔ innings, **not**
5.2 — never store or compute on the decimal form. Display conversion lives in
`lib/games.ts`: `ip = floor(outs/3) + (outs%3)/10` rendered as a string.

> **Two-table alternative (if preferred):** split into `web_player_game_batting`
> and `web_player_game_pitching` (no null halves, no `p_` prefixes, maps 1:1 to
> the two rendered tables on the detail page). Both live in this one migration
> (still one concern). Single-table is the default here for a uniform upsert path
> and clean two-way handling.

### `db/migrations/008_war_components.sql`

```sql
-- P7: FanGraphs WAR value components (batter-only) + season WPA.
-- Source columns from the FanGraphs "Value" preset, ingested by pull_season_stats.py.
-- Apply via:  python etl/apply_migration.py db/migrations/008_war_components.sql

alter table web_player_season_stats
  add column if not exists war_batting     numeric,  -- Bat  (wRAA, runs above average)
  add column if not exists war_baserunning numeric,  -- BsR
  add column if not exists war_fielding    numeric,  -- Fld  (pure fielding, excl. positional)
  add column if not exists war_positional  numeric,  -- Pos
  add column if not exists war_league      numeric,  -- Lg
  add column if not exists war_replacement numeric,  -- Rep
  add column if not exists rar             numeric,  -- = Bat+BsR+Fld+Pos+Lg+Rep (checksum)
  add column if not exists wpa             numeric;  -- season WPA
```

---

## 3. ETL

### `etl/mlb_api.py` (extend)
- `fetch_schedule(season, team_id=141) -> list[dict]` — one entry per game with
  `game_pk`, `officialDate`, `gameDate` (UTC), `gameNumber`, `doubleHeader`,
  home/away team ids+names, scores, `status.detailedState` /
  `status.abstractGameState`, venue.
- `fetch_boxscore(game_pk) -> dict` — Jays-side players with parsed batting /
  pitching stat blocks.

### `etl/pull_schedule.py` (new)
- `--season YEAR` (default current). Pulls the full-season schedule and **upserts
  `web_games`** keyed on `game_pk`. Stores future (unplayed) games too so the
  calendar is fully populated; status/score update as games are played.
- Derive `is_home`, `opponent_*`, `result` (only when `is_final`).
- Map `officialDate -> game_date`; `gameDate -> first_pitch_utc`.

### `etl/pull_boxscore.py` (new)
- Args: `--game-pk X` | `--date YYYY-MM-DD` | `--recent N` (last N days of finals).
- For each **final** game, parse Jays players, **upsert `web_player_game_stats`**
  (one row per stat_group).
- **Unknown player handling (required):** if a player's `mlbam_id` is not in
  `web_players`, fetch bio via `mlb_api` and insert a minimal `web_players` row
  **before** inserting the game stat, otherwise the FK fails. (Covers mid-season
  call-ups before the next roster run.)
- Skip non-final games (status guard) so partial lines never persist.

### `etl/pull_season_stats.py` (extend)
- Read the new Value columns and write them into `web_player_season_stats` using
  this confirmed header → column map:

```python
# P7: FanGraphs Value 細項 → web_player_season_stats（header 已對照確認）
WAR_COMPONENT_COLS = {
    "Bat": "war_batting",
    "BsR": "war_baserunning",
    "Fld": "war_fielding",
    "Pos": "war_positional",
    "Lg":  "war_league",
    "Rep": "war_replacement",
    "RAR": "rar",
    "WPA": "wpa",
}
# join / identity: MLBAMID -> mlbam_id
```

- **Dedup guard:** the CSV is a single Custom Report with no duplicate headers
  (the earlier `wRC+`/`ISO`/`SLG` and `BsR` duplicates are resolved at source).
  Safety net: if any duplicate header reappears, select the canonical column
  explicitly rather than relying on pandas' `.1` auto-suffix, and log a warning.
- Missing file / missing column → warn + skip (do not hard-fail), per existing convention.

### `etl/backfill.py` (extend)
- Add to the per-season chain, in order: roster → **schedule** → statcast →
  fielding → season stats → **boxscore (all finals)**. Idempotent.

---

## 4. Cron — `.github/workflows/etl.yml`

Two scheduled runs (both upsert; order matters for FKs):

1. **Existing ~09:00 ET** (`0 13 * * *`): add a current-season **schedule refresh**
   and a **boxscore re-pull of the last ~3 days**. This is the West-Coast / late-final
   backfill — games that were still in progress at 11:30 PM ET get completed here.
2. **New ~11:30 PM ET** (`30 3 * * *` UTC; **drifts ~1h across DST**, same as the
   existing job): schedule refresh for today + boxscore for **today's final** games.

Per-run order: roster (if scheduled) → schedule → boxscore → `curl` revalidate.

> **Caveats to keep in mind (do not try to engineer around):**
> - GitHub Actions cron is **best-effort** and can be delayed 10–15+ min; "11:30 PM
>   exactly" is not achievable. Most nights all games are final by then; West-Coast
>   road games (start ~10 PM ET, end ~1 AM ET) will be incomplete at 11:30 and are
>   intentionally left for the 09:00 ET backfill.
> - Calendar UI must render non-final games as "scheduled / in progress / result
>   pending" rather than blank or a fake score.

---

## 5. Web (Next.js)

### lib
- `lib/games.ts` (new): `getSchedule(season, month?)`, `getGame(gamePk)`,
  `getGameBoxscore(gamePk) -> { batting: GameBattingLine[]; pitching: GamePitchingLine[] }`.
  IP display conversion (`outs_recorded -> "X.Y"`) lives here.
- `lib/season-stats.ts` (extend): expose `war_*`, `rar`, `wpa`.

### Pages / components
- `app/[locale]/page.tsx`: replace the empty hero space with `ScheduleCalendar`.
  Highlight the current (or most-recent) game day. The old "Today's Blue Jays"
  content is **removed from the home page** and surfaced inside the game detail
  page for the highlighted day. (Keep a single compact "most recent game" link if
  desired, but do not duplicate the calendar's job.)
- `components/ScheduleCalendar.tsx` (new, `"use client"` for month nav + click):
  month grid; cells show opponent (`vs` / `@`) + result/score or game time (ET);
  empty cells for off-days; a cell with a doubleheader shows **both** games;
  click a final game → `/games/[gamePk]`. Server component fetches and passes
  plain JSON props (framework-pure, per existing convention).
- `app/[locale]/games/[gamePk]/page.tsx` (new): score header
  (`Jays N – M OPP`, W/L, date), then a **batting table** and a **pitching table**
  of Jays players. Player names link to their overview pages. Stat abbreviations
  stay English.
- `components/charts/WarBreakdown.tsx` (new): see §5.1.

### i18n (`messages/{en,zh-TW}.json`)
- New keys for: calendar (month names / weekday headers / `vs` / `@` / status
  labels), game detail (table headers stay English jargon; only chrome translated),
  and the WAR breakdown methodology note (§5.1). **English first.**

### 5.1 WAR breakdown chart (B, reconciled)

- **Batter-only.** Do not render on the pitcher overview (pitcher WAR is FIP-based
  and does not decompose into Bat/Fld/BsR).
- **Stacked bar** (Recharts) of six run components: Batting, Base Running,
  Fielding, Positional, League, Replacement → sum = **RAR**. Headline number =
  **WAR** (= RAR ÷ runs-per-win; RPW is implied by `rar/war` per row, no hardcode).
- **Negative segments:** Positional (e.g. DH) and Fielding can be negative — the
  chart must be a **diverging stacked bar** with baseline at 0 (negatives below).
  Verify Recharts renders negative stack segments as intended.
- **Checksum:** sum of the six components should equal `rar` within ±0.x
  (FanGraphs display rounding — not a bug).
- **Colors:** reuse brand tokens (`navy`/`steel`/`brick`/`lava`/`grass`/`dirt`);
  no ad-hoc hex.
- **On-page methodology note (required, en + zh-TW):**
  - *en:* "WAR is built from six run-value components — batting, base running,
    fielding, positional adjustment, league adjustment, and replacement level —
    that add up to Runs Above Replacement (RAR). Dividing RAR by the season's
    runs-per-win (~10) gives WAR. Fielding here is shown separately from the
    positional adjustment, so a designated hitter's negative positional value is
    visible on its own bar."
  - *zh-TW:* 「WAR 由六項 run value 組成——打擊、跑壘、守備、守位調整、聯盟調整、
    replacement——加總為 Runs Above Replacement (RAR);RAR 除以當季的 runs-per-win
    (約 10)即得 WAR。此處守備與守位調整分開呈現,因此 DH 的負守位值會單獨顯示在
    自己那根 bar 上。」

---

## 6. FanGraphs CSV re-export (ETL_update_flow.md addendum)

Fix at the source: rebuild the export as **one FanGraphs Custom Report** (not a
concatenation of presets — that is what produced the duplicate `wRC+` / `ISO` /
`SLG` columns). Include:

- **Identity:** Name, Team, PlayerId, MLBAMID
- **Existing dashboard stats already consumed:** G, PA, OPS, wRC+, WAR, … (keep
  the current set)
- **Value components (new) — 實際 CSV header(已對照截圖確認):** `Bat`、`BsR`、`Fld`、`Pos`、`Lg`、`Rep`、`RAR`。全部在 Batting 分頁 Value 區,單檔即可,不需另開 fielding CSV join。

- **WPA**(season):header = `WPA`

Drop into `etl/data/fangraphs/batting_{season}.csv` as before (directory
gitignored). Header strings are confirmed — see the `WAR_COMPONENT_COLS` map in §3.

> A matching **pitching** Value export is **not** needed for P7 — the WAR
> breakdown is batter-only.

---

## 7. Open items to verify during implementation

1. Exact MLB Stats API boxscore JSON field paths (batting / pitching blocks).
2. Exact FanGraphs Value column header strings — 已確認:Bat/BsR/Fld/Pos/Lg/Rep/RAR/WPA(單檔,Batting 分頁)。
3. Recharts diverging stacked bar with negative segments renders correctly.
4. Calendar cell layout for doubleheaders (two games, one date).
5. Boxscore unknown-player insert path (bio fetch → `web_players` → game stat).

---

## 8. P7 done-when

| Item | Done when |
|---|---|
| Calendar | Home page shows the current season as a month calendar (en + zh-TW); off-days blank; doubleheaders show both games; non-final games show status not a fake score |
| Game detail | Clicking a final game shows every Jays player's batting and/or pitching line, IP rendered correctly from `outs_recorded` |
| Refresh | 11:30 PM ET run populates today's finals; 09:00 ET run backfills West-Coast / late finals; both idempotent |
| WAR breakdown | Batter overview shows the six-component diverging stacked bar reconciling to RAR, with the methodology note; absent on pitcher pages |
| WPA | Season WPA stored in `web_player_season_stats` |

---

## 9. Candidate backlog (not built in P7)

| Candidate | Data dependency | Note |
|---|---|---|
| Statcast EV / Launch Angle distribution | **None new** — `web_statcast_events.launch_speed/launch_angle` | Cheapest follow-up; complements SprayChart |
| Batted Ball GB / FB / LD | **None new** — derive from `web_statcast_events` (`bb_type`) | No FanGraphs CSV needed |
| Pitch Modeling (pitcher effectiveness) | FanGraphs Stuff+/Location+ CSV **or** Statcast `delta_run_exp` | Two possible paths; pick one when scoped |
| Per-at-bat "most clutch" WPA | Needs a win-expectancy model (FanGraphs CSV gives season WPA only) | Higher complexity; explicitly deferred |
