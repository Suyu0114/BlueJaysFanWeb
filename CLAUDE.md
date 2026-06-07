# CLAUDE.md

This file gives Claude (and other AI coding agents) the project context that isn't obvious from the code alone. Read this before suggesting changes.

> 詳細設計與技術選型理由在 `C:\Users\jing8\.claude\plans\blue-jays-fan-piped-kurzweil.md`，這份 CLAUDE.md 只列出實作時最常踩到的規則。
>
> **Reference docs** — schema dictionary (every `web_*` table, the invariants the ETL relies on, and the "columns that don't exist" anti-index): `docs/DATA_MODEL.md`. Per-feature handoff specs: `docs/Pn_spec.md` (e.g. `P7_spec.md`, `P8_spec.md`). After any change, reconcile the docs via `docs/DOC_MAINTENANCE.md` (trigger → which docs to update).

---

## What this project is

A Toronto Blue Jays fan website with two MVP features:

1. **Data visualizations** — spray chart, pitching distribution, fielding heatmap (filterable by season / month / pitch type)
2. **Player pages** — beginner-friendly overview cards for the 26-man active roster

BaZi (八字) personality / fortune / matchup-prediction / injury-risk features are **v2** — do not implement them in this phase.

---

## Critical rules (must follow)

### Python environment (no exceptions)
- **Always use the existing conda env `MLBxBaZi`** for any Python / ETL work.
- **Never** create a `venv`, `.venv`, or a `requirements.txt` for a fresh venv.
- Run scripts via `conda run -n MLBxBaZi python ...` or after `conda activate MLBxBaZi`.
- Install missing packages into that env: `conda run -n MLBxBaZi pip install <pkg>`.

### Supabase tables are shared — prefix everything with `web_`
- This Supabase project is **shared with other projects** that already have a `players` table.
- **Every table for this app is prefixed `web_`**: `web_players`, `web_statcast_events`, `web_player_season_stats`, `web_player_seasons`, `web_fielding_frv`, `web_id_map`.
- Never create an unprefixed table here; it will collide.
- Schema is layered: `001_initial_schema.sql` (P0) → `002_fielding_frv.sql` (P4) → `003_player_seasons.sql` + `004_plate_alignment.sql` + `005_id_map.sql` (P6) → `006_games.sql` + `007_player_game_stats.sql` + `008_war_components.sql` (P7) → `009_basic_season_stats.sql` (P9). One concern per migration file.

### Audience & language
- **Primary audience: English-speaking Toronto locals**, including non-Chinese speakers curious about BaZi. Chinese (TW/HK) fans are secondary.
- UI default locale = `en`. `zh-TW` is an optional switch.
- **Write English first, translate to Chinese second.** Never the other way around.
- When BaZi ships in v2, English readers must be able to understand it without prior knowledge of 天干地支.

### What stays English even in zh-TW
- All player names: `Vladimir Guerrero Jr.`, `Bichette`, `Gausman`, …
- All baseball jargon: `OPS`, `wRC+`, `ERA`, `FIP`, `Spray Chart`, `Statcast`, `Launch Angle`, `Exit Velocity`, `FRV`, …
- Only translate: navigation, buttons, prose descriptions, BaZi explanations.
- **Do not add a `name_tc` column to `web_players`.** The schema has a single `name` (English) field.

### Data sources
- pybaseball is the only data source for MVP (free, covers Statcast batter/pitcher/fielding).
- Use **FRV** (Fielding Run Value) for fielding, **not DRS** — DRS requires paid FanGraphs.
- Do not add FanGraphs paid integration in MVP. Defer to v2.
- BaZi tables live in Supabase but are v2 scope — do not query them yet.

### ETL gotchas (will silently produce wrong data if missed)
- pybaseball returns playoffs by default. Filter `game_type == 'R'` for regular season; `transform.regular_season_only(df, keep_postseason=True)` opts in (used for 2025 playoff backfill).
- 2026 season changed Savant's `plate_x` / `plate_z` from front-of-plate to middle-of-plate alignment. `transform.tag_plate_alignment()` writes `'front'` (≤2025) or `'middle'` (≥2026) to `web_statcast_events.plate_alignment`. `PitchZoneHeatmap` must render rows from a single alignment value at a time — overlaying both mis-aligns the zone by 1–3 inches. Enforced in `PitchingExplorer` via the "Zone coords" filter (the heatmap is scoped to one alignment; the usage bars stay cross-season). `getPitches` still fetches all seasons, so any **new** plate-coordinate consumer must filter alignment itself. See `docs/DATA_MODEL.md` → plate_alignment invariant.
- Pitch classifications get retroactively corrected → daily ETL re-pulls the last 7 days and upserts (current season only). Historical seasons are static after `etl/backfill.py`.
- Spray chart coordinate transform (must apply in ETL, not in the chart component):
  ```
  x_feet = 2.5 * (hc_x - 125.42)
  y_feet = 2.5 * (198.27 - hc_y)
  ```
- Upsert key for `web_statcast_events`: `(game_pk, batter_id, pitcher_id, at_bat_number, pitch_number)`.

### FanGraphs scraping is dead — use these workarounds
- `pybaseball.team_batting` / `team_pitching` / `batting_stats` / `pitching_stats` return **HTTP 403**. The block is server-side; updating pybaseball won't help.
- **Player enumeration** for "who appeared for the Jays in season X" now uses MLB Stats API `rosterType=fullSeason` (`etl/mlb_api.py::fetch_full_season_roster`). It includes 40-man members who never debuted — accept the small over-inclusion. Run via `python etl/pull_team_players.py --season YEAR`.
- **Season stats** (OPS / wRC+ / ERA / FIP / K/9 / WAR) load from **manually-exported FanGraphs CSVs** dropped into `etl/data/fangraphs/{batting,pitching}_{season}.csv` (directory gitignored, requires a paid FanGraphs membership). `etl/pull_season_stats.py` reads them; missing files log a warning, do not fail. Full step-by-step in `ETL_update_flow.md`.
- Statcast event pulls (`statcast_batter` / `statcast_pitcher`) and fielding leaderboard (`statcast_outs_above_average`) hit Baseball Savant directly — these are **unaffected**.

---

## Tech stack (decided — don't relitigate without reason)

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| i18n | `next-intl` with `[locale]` route segments |
| Charts | D3.js (spray / pitch zone / fielding heatmap) + Recharts (KPI bars / lines) + rough.js (hand-drawn schedule calendar) |
| Database | Supabase Postgres |
| ETL | Python + pybaseball + Supabase Python client |
| Cron | GitHub Actions (`0 13 * * *` = 09:00 ET daily) |
| Deploy | Vercel (with daily ISR revalidate) |

ETL runs **outside** Next.js (Vercel functions can't run pybaseball). Next.js calls a `/api/revalidate` endpoint at the end of the cron run.

---

## Folder layout (current — post-P7)

```
/etl/                          # Python (conda env MLBxBaZi): pybaseball → Supabase
  mlb_api.py                   # MLB Stats API helpers (active + fullSeason roster, /people bio)
  idmap.py                     # Chadwick register → MLBAM lookup (web_id_map cache)
  transform.py                 # hc_x/y → feet, postseason flag, tag_plate_alignment
  db.py                        # psycopg3 connection + upserts (incl. player_seasons, id_map)
  roster.py                    # 26-man active roster (sets is_active_26)
  pull_team_players.py         # full-season Jays enumeration (MLB Stats API)
  pull_statcast.py             # batter Statcast; --all-batters / --include-postseason
  pull_pitcher.py              # pitcher Statcast; --all-pitchers / --include-postseason
  pull_fielding.py             # OAA / FRV per position (Savant leaderboard)
  pull_season_stats.py         # OPS/wRC+/ERA/FIP/WAR + basic line (avg/obp/slg/hr/rbi/sb/pa) from FanGraphs CSV exports
  backfill.py                  # one-shot orchestrator for 2024 + 2025 (and optional 2026)
  data/fangraphs/              # gitignored manual CSV drop zone for season stats
/db/migrations/                # plain SQL, apply via psql or Supabase Studio
  001_initial_schema.sql       # web_players, web_statcast_events, web_player_season_stats
  002_fielding_frv.sql         # web_fielding_frv
  003_player_seasons.sql       # web_player_seasons + birth_city/state/country on web_players
  004_plate_alignment.sql      # web_statcast_events.plate_alignment column
  005_id_map.sql               # web_id_map (Chadwick register cache)
  006_games.sql                # web_games (schedule + results)
  007_player_game_stats.sql    # web_player_game_stats (per-game box score)
  008_war_components.sql       # web_player_season_stats: war_*/rar/wpa (batter WAR breakdown)
  009_basic_season_stats.sql   # web_player_season_stats: avg/obp/slg/hr/rbi/sb/pa (batter basic line, P9)
/.github/workflows/etl.yml     # daily cron (rolling 7-day window for current season)
/ETL_update_flow.md            # backfill + FanGraphs CSV download steps
/web/                          # Next.js app
  app/[locale]/
    page.tsx                   # team home + "Today's Blue Jays" module
    players/page.tsx           # roster list with Current 26-man / All 2024-2026 toggle
    players/[mlbam_id]/
      page.tsx                 # overview: KPI + RecentForm + RollingOpsSparkline + SeasonProgressBar + SeasonStatTable + ContactQualityCard + WarBreakdown + GameLog (batter modules are batter-only)
      batting/page.tsx         # spray chart
      pitching/page.tsx        # pitch distribution
      fielding/page.tsx        # FRV table + multi-position diagram
    about/page.tsx
  components/
    PlayerNav.tsx              # tabs with `available` prop (bazi slot reserved for v2)
    SeasonProgressBar.tsx      # batter pace projection / pitcher current-vs-prior
    ScheduleCalendar.tsx       # home schedule (rough.js hand-drawn parchment scorecard)
    ScorecardFrame.tsx         # reusable rough.js parchment frame (hero + roster cards)
    HeroCard.tsx               # "Today's Blue Jays" cards (wraps ScorecardFrame)
    RosterExplorer.tsx         # client roster filter (All/Pitchers/Batters) + all-time active/departed grouping
    SeasonStatTable.tsx        # P9 year-by-year basic+advanced table (overview, batter-only)
    RecentForm.tsx             # P9 Last 7 / Last 30 / Season slash lines (overview)
    GameLog.tsx                # P9 last-10 game log (overview)
    ContactQualityCard.tsx     # P9 Avg/Max EV + Hard-Hit% (reuses computeExitVeloStats)
    charts/
      SprayChart.tsx           # optional secondaryEvents prop for /compare
      SprayChartExplorer.tsx   # client filter wrapper around SprayChart (month/pitch/outcome/hand)
      PitchDistribution.tsx
      PitchingExplorer.tsx     # client filter wrapper: PitchDistribution + PitchZoneHeatmap
      PitchZoneHeatmap.tsx     # pitch-location heatmap (16x20 grid + Gaussian kernel + SVG blur)
      FieldingDiagram.tsx      # primary chip (brick) + secondary chips (steel)
      WarBreakdown.tsx         # batter WAR diverging stacked bar (P7)
      RollingOpsSparkline.tsx  # P9 15-game rolling-OPS trend (Recharts line)
  lib/
    db.ts                      # postgres.js client (PgBouncer-safe: prepare: false)
    players.ts                 # roster modes + getPlayerAvailability
    batting.ts / pitching.ts / fielding.ts
    season-stats.ts            # web_player_season_stats (incl. P9 basic line) + batter games-played
    batter-game-log.ts         # P9 per-game batting log (web_player_game_stats + web_games), current season
    batting-form.ts            # P9 pure helpers: summarize / windowByDays / rollingOps
    recent-game.ts             # Today's Blue Jays helpers (HR hero, hardest contact, IP/K/H)
    field-geometry.ts          # Rogers Centre SVG paths (exports polar())
  messages/
    en.json                    # source of truth
    zh-TW.json                 # translation
```

v2 routes to leave room for but not implement: `/[locale]/players/[id]/bazi/`, `/[locale]/predictions/`, `/[locale]/compare/`. The BaZi tab slot already exists in `PlayerNav` (passed `available.bazi: false` everywhere in P6); the SprayChart already accepts a `secondaryEvents` prop ready for the compare page.

---

## How to run things

```powershell
# Web (needs DATABASE_URL in web/.env.local — Next.js does not read the repo-root .env)
cd web
pnpm install                   # if pnpm is missing: npm install -g pnpm
pnpm dev                       # http://localhost:3000  (locale routing via proxy.ts)

# ETL (one-shot, local) — uses the existing conda env, NOT a venv
conda activate MLBxBaZi

# A) Ad-hoc single-player pull (debugging)
python etl/pull_statcast.py                         # defaults to Vladdy 2025
python etl/pull_statcast.py --player 665489 --start 2026-03-27 --end 2026-05-26

# B) Full backfill for a season (2024/2025/2026): roster -> statcast (all players)
#    -> fielding -> season stats. Idempotent; re-run as needed.
python etl/backfill.py --season 2026
python etl/backfill.py                              # default = 2024 + 2025

# C) Just season stats (after dropping FanGraphs CSVs into etl/data/fangraphs/):
python etl/pull_season_stats.py --season 2026
```

Full update flow (incl. the manual FanGraphs CSV step) lives in `ETL_update_flow.md`.

Env vars live in `.env` at the repo root (single `DATABASE_URL`). The ETL loads
`.env` from the repo root or `etl/`, whichever exists. See `.env.example`.

---

## Conventions

- **Server components by default.** Fetch from Supabase in server components; only drop to `"use client"` when D3 / interactivity demands it.
- **Pre-aggregate in ETL where possible.** Player season stats go in `web_player_season_stats`; pages should not aggregate 3000 rows on every request.
- **D3 components receive plain JSON props** (`BattedBallEvent[]`), not Supabase clients. Keep them framework-pure for easier testing.
- **No new dependencies without a clear reason.** The stack is intentionally small.

## Theme / colors

Light/warm theme (no dark mode). Palette is defined as Tailwind v4 `@theme` tokens in `web/app/globals.css` and used via utilities (`bg-papaya`, `text-navy`, `border-brick`, …):

| Token | Hex | Role |
|---|---|---|
| `papaya` | `#fdf0d5` | primary page background |
| `navy` | `#003049` | secondary surfaces (header) + body text |
| `steel` | `#669bbc` | accents / hover (not body text — too low contrast on papaya) |
| `lava` | `#780000` | lines / dark-red hover (e.g. button hover) |
| `brick` | `#c1121f` | lines / primary action (buttons, card borders) |
| `grass` | `#84934D` | field surface fill (SprayChart fair/foul grass) |
| `dirt` | `#DAB681` | field surface fill (SprayChart warning track + infield dirt) |

Reuse these tokens — don't introduce ad-hoc hex. The brand 5 (`papaya`/`navy`/`steel`/`lava`/`brick`) are for chrome and data marks; `grass`/`dirt` are primarily for the realistic ballpark surfaces in the SprayChart (applied via `var(--color-grass)` / `var(--color-dirt)` with per-layer `fillOpacity`, not as utility classes). SprayChart batted-ball markers use the brand tokens (HR=brick, single=navy, XBH=lava, out=steel).

The home **schedule calendar** (`ScheduleCalendar.tsx`), the **home hero cards** (`HeroCard.tsx`, "Today's Blue Jays"), and the **roster cards** (`players/page.tsx`) all share one hand-drawn "scorecard" look and are the one piece of chrome allowed to use `grass`/`dirt`: `grass` for the Win badge (vs `brick` for Loss), and `dirt` as the warm "parchment" surface (`bg-dirt/40`) so empty days read as paper (not white) and game days / cards float as lighter `papaya`. The "today" highlight (cell border + `TODAY` badge) is **`steel`** — deliberately *not* `brick`/`grass`, which already mean loss/win. The hand-drawn frame (rough.js, navy outer + faint-navy inner rule `INK_FAINT`) is factored into **`ScorecardFrame.tsx`** — a reusable client wrapper (SVG overlay sized by a `ResizeObserver`, stable per-`seedKey` `seed` so the wobble doesn't shimmer); the hero and roster cards just wrap their content in it. Its `variant="control"` (single tighter line, no shadow/hover) frames the roster's mode + filter segmented toggles so the controls match the cards. The calendar keeps its own overlay (it also draws the per-day game boxes). rough.js needs literal hex strings, so the components re-declare the token hexes as `const NAVY/STEEL/PAPAYA` — keep those in sync with the `@theme` block above. The `bg-dirt/40` surface lives in `ScorecardFrame.tsx` (hero + roster cards) and `ScheduleCalendar.tsx` (calendar panel); change both together.

Typography pairs two Eduardo Tunni faces, both loaded in `app/[locale]/layout.tsx` via next/font. The retro varsity **display** face **Graduate** (`font-display` → `--font-display`) is the **heading layer**: the nav brand wordmark (`Header.tsx`), section headings (`Today's Blue Jays`, `Schedule`), and the calendar chrome (month label / weekday row / day numbers). The serif **Gabriela** (`--font-gabriela`) is everything else — it is the body default (`globals.css`) and is mapped to **both** `--font-sans` and `--font-mono` because Gabriela ships a single 400 style with **no Sans/Mono variants**. So `font-mono` + `tabular-nums` no longer give true monospaced/tabular digits (kept on data cells as a no-op in case a mono is reintroduced); `font-semibold`/`font-bold` render as synthesized faux-bold (Gabriela has only weight 400).

Graduate is an **all-caps slab display face with no true lowercase** — use it only for headings/labels (apply `uppercase`). Never put it on body prose, player names, or paragraph text (they'd render all-caps and tank readability), and never put a hand-drawn font into the calendar cells — 30+ wobbly cells become unreadable; the hand-drawn motif lives in the rough.js lines only.

> Turbopack gotcha: after changing `@theme` in `globals.css`, custom color utilities may not regenerate. Stop dev, delete `web/.next`, restart.

---

## Phases (current = maintenance; MVP + P7 shipped)

| Phase | Status | Done when |
|---|---|---|
| P0 | done | Supabase schema created; Vladdy 2025 statcast in DB; row count matches Savant |
| P1 | done | Next.js skeleton + i18n + roster list page renders in en + zh-TW |
| P2 | done | SprayChart D3 component visually matches Savant with hard-coded data |
| P3 | done | SprayChart wired to Supabase + filters work client-side |
| P4 | done | Pitch distribution + fielding FRV pages live (en + zh-TW), PlayerNav links the three sub-pages |
| P5 | done | GitHub Actions cron + Vercel deploy; data refreshes overnight |
| P6 | done | 2024 + 2025 (incl. playoffs) + 2026-to-date backfilled for every 40-man Jay; multi-position fielding diagram (RF chip stays inside the wall); player overview page with KPI cards + SeasonProgressBar; "Today's Blue Jays" home module; Current 26-man / All 2024-2026 roster toggle; PlayerNav reserves the BaZi tab slot for v2 |
| P7 | done | Schedule calendar on home page (en + zh-TW); per-game box score detail page; nightly cron two-job refresh; WAR breakdown chart (batter-only, diverging stacked bar, RAR reconcile) on player overview; WPA stored |
| P8 | done | EV/LA scatter + KPI chips on batting page |
| P9 | done | Batter overview deep-dive (en + zh-TW): year-by-year basic+advanced table (migration `009` adds avg/obp/slg/hr/rbi/sb/pa, ingested from FanGraphs Dashboard CSV); Recent Form (Last 7/30/Season slash lines) + last-10 game log + 15-game rolling-OPS sparkline (from `web_player_game_stats`, current season); contact-quality card (reuses `computeExitVeloStats`). Pitcher overview unchanged. |

v2 (deferred): BaZi personality / fortune / matchup-prediction / injury-risk; daily WAR snapshots for strict same-date pace comparisons; `/compare` page (SprayChart `secondaryEvents` prop is already wired).
