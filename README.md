# Suyu's Jays Notes

Built by **Suyu Cheng** · [LinkedIn](https://www.linkedin.com/in/suyu-cheng) · [Portfolio](https://suyu-portfolio.vercel.app) · Live: [bluejaysfanweb.vercel.app](https://bluejaysfanweb.vercel.app/en)

一個給多倫多藍鳥隊球迷的觀察站。同時提供英文和繁體中文切換。

> Toronto Blue Jays fan website. English-primary UI with optional Traditional Chinese (zh-TW) toggle. Data visualizations powered by Statcast (via [pybaseball](https://github.com/jldbc/pybaseball)).

---

## Features

1. **Data visualizations** (per player, filterable by season / month / pitch type)
   - Spray chart — batted-ball locations, colored by outcome, sized by exit velocity
   - Pitching breakdown — season filter, arsenal table (usage / velo / spin / Whiff% / xwOBA on contact, plus Savant RV/100 for a full season), pitch-movement plot (pitcher's view), zone heatmap, and per-game fastball velocity trend
   - Season chips carry club labels (`2025 · SD`, `2026 · TOR/HOU`): for the 2026 roster the Statcast data covers 2024–2026 with **every** club, not just Toronto
   - Fielding diagram + FRV table — primary position in brick, secondary positions in steel (so multi-position guys like Ernie Clement read at a glance)
2. **Player pages**
   - Overview with KPI cards (batters: OPS / wRC+ / WAR; pitchers: W-L / SV / IP / ERA / WHIP / K% / WAR, each with a plain-language hint) and a season-progress bar (pace projection for batters; current-vs-prior for pitchers, because `162/games` is meaningless for either starters or relievers)
   - WAR breakdown chart (batter-only) — a diverging stacked bar of the six FanGraphs run-value components (Bat / BsR / Fld / Pos / Lg / Rep) reconciling to RAR, with an on-page methodology note
   - Batter deep-dive (batter-only) — year-by-year table (AVG / OBP / SLG / OPS / HR / RBI / SB / wRC+ / WAR), Recent Form (Last 7 / Last 30 / Season slash lines), last-10 game log, a 15-game rolling-OPS sparkline, and a Statcast contact-quality card (Avg / Max EV, Hard-Hit%)
   - Pitcher deep-dive (pitcher-only) — year-by-year pitching table (W-L / SV / IP / ERA / FIP / WHIP / K% / BB% / WAR), Recent Form (Last 5 outings / Last 30 / Season), last-10 outings log, and a 5-outing rolling-ERA sparkline
   - Plate discipline + batted-ball cards (Chase% / Z-Swing% / Whiff% / K% / BB% …; GB/LD/FB/PU approx, Pull/Center/Oppo, Hard-Hit%, Sweet-Spot%; pitchers CSW% / Zone% / Chase% / K-BB%), newest Jays season vs the one before, with plain-language hints; zone-based changes across 2025→2026 are shown net of Savant's 2026 zone change (†)
   - Rolling OPS / ERA sparklines overlay the prior season (dashed, by game number) and the MLB average
   - Savant percentile rankings (Savant-style bars, season switch, "not qualified" state) + a wOBA-vs-xwOBA luck line and official Barrel%
   - **Compare tab** — the player against himself, any two seasons 2024–2026, **including time with other clubs** (All MLB by default, or as a Blue Jay): What changed (plain-language), season line + per-club rows for trade seasons, three-season arc, Statcast (discipline / contact / side-by-side spray charts; arsenal with NEW/DROPPED pitches, movement with last season's shapes, zone grids, fastball velo by outing). State lives in the URL, so every view is a shareable link
   - Sub-tabs auto-hide for roles a player didn't appear in
3. **Roster**
   - Current 26-man (default) / All 2024-2026 toggle
4. **Standings & playoff race**
   - `/standings` — three views behind a hand-drawn segmented toggle: **American League** and **National League** (three division tables each, AL East first, with the full mlb.com column set — W / L / PCT / GB / WCGB / L10 / STRK / RS / RA / DIFF / X-W/L / HOME / AWAY), and **Wild Card** with its own retro AL/NL switch, a cut line, and a clinch-marker legend (z / y / x / e)
   - Club cap logos recoloured to the site palette (navy ink on papaya paper) and wobbled with a shared SVG filter, so they read as hand-drawn stamps rather than glossy vectors
5. **Home page**
   - "In the Race" module — AL East standings + the AL playoff picture (seeds 1-6, cut line, chasers), in the parchment scorecard chrome
   - Month schedule calendar — opponent (`vs` / `@`) + result/score or game time (ET); doubleheaders show both games; current / most-recent game day highlighted; click a final game to open its box score
   - "Today's Blue Jays" module — HR hero from the most recent game (hardest-contact fallback when nobody homered) + best pitching line (IP / K / H, no fake ERA)
6. **Per-game box scores**
   - Every Jays player's batting and/or pitching line for a finished game; innings pitched rendered correctly from stored outs (never the "5.2" decimal trap)
7. **Team trends** (`/team`, nav "Team ▾" → Five-season trends) — the latest five seasons (2022–2026) as a team, every number next to that season's MLB average and the Jays' rank among 30 clubs
   - Season strip (record, division finish, postseason result, run diff + rank) linking to each season page
   - Record & run differential: "where the wins came from" (offense vs run-prevention runs above an average club) and record vs expected record (luck, one-run games)
   - Offense and run-prevention rank grids (value + rank heat map, Value | vs MLB toggle, hover for the MLB average, the league leader and a plain-English definition), trend small multiples vs the MLB average, contact luck (wOBA vs xwOBA), rotation vs bullpen, ERA vs FIP with team OAA
   - Games above .500 for all five seasons on one chart (pick a season to highlight) + situational splits, strengths & weaknesses in MLB ranks, glossary & method
8. **Team season review** (`/season/2026`, nav "Team ▾" → Season review, or the team page's season strip; tabs switch between the two team views)
   - Record strip vs the prior season with MLB ranks among 30 clubs, games above .500 and cumulative run differential by game number (both seasons), where the season ranked (top-10 / bottom-10 skills), month by month, splits (home/road, one-run, blowouts, vs division, vs .500+ teams), team leaders (WAR / OPS / HR / SB / ERA / WHIP / SO / SV) with last year's value, value by position group (WAR / Off / HR / OPS, vs last year or the change)
   - Team stats vs MLB: the club's offense and run-prevention line next to the MLB average, its rank among 30 clubs and the prior season
   - Player stats: every Blue Jay's season line, sortable — position players (offense incl. FanGraphs Off, defense = Def + Savant OAA, WAR) and pitchers; All / Regulars filter, copy table; each leader card's "All →" opens it sorted by that stat; an MLB-average row stays pinned at the bottom
9. **Article tooling**
   - "PNG ↓" on every chart and every stat table (brand colours; footer = caption, the site wordmark, address, data sources and date) and "Copy table" on the stat tables (TSV that pastes into a spreadsheet as a real table, ending with a source line)
10. **About & credit**: `/about` (bio, contact card, how the data works, sharing credit) and a footer on every page with the author and contact links
   - `etl/season_report.py` writes a season-review data pack (team / batters / pitchers / movers / roster moves with every club / league context / five-season team trends vs MLB + definitions and caveats) to `reports/` (git-ignored)

**v2 (not in this milestone):** BaZi personality analysis, matchup predictions, injury-risk beta, daily WAR snapshots, player-vs-player `/compare` page (the per-player season Compare tab shipped in P12; the SprayChart `secondaryEvents` prop is still in place for it).

---

## Tech stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- **i18n:** `next-intl` — default `en`, optional `zh-TW`
- **Charts:** D3.js (spray / pitch zone / pitch movement / fielding) + Recharts (WAR breakdown diverging stacked bar, rolling OPS / ERA sparklines, velocity trend, team run sources / trend small multiples / five-season trajectory) + rough.js (hand-drawn schedule calendar)
- **Motion:** `motion` (framer-motion) — scroll reveals, card hover springs, sliding toggle highlights, tab/panel crossfades, chart tooltips that glide between marks; CSS keyframes for the rough.js "ink" draw-in and chart mark entrances. Honours `prefers-reduced-motion`.
- **Database:** Supabase Postgres
- **ETL:** Python + pybaseball, scheduled via GitHub Actions (daily)
- **Deploy:** Vercel

---

## Project layout

```
.
├── etl/                          # Python ETL (conda env MLBxBaZi)
│   ├── mlb_api.py                # MLB Stats API: rosters, /people bio, schedule, boxscore
│   ├── idmap.py                  # Chadwick register → MLBAM cache
│   ├── transform.py              # hc_x/y → feet; postseason flag; plate_alignment tag
│   ├── db.py                     # psycopg3 connection + upserts
│   ├── roster.py                 # 26-man active roster (sets is_active_26)
│   ├── pull_team_players.py      # full-season Jays enumeration
│   ├── pull_statcast.py          # batter Statcast (single or --all-batters)
│   ├── pull_pitcher.py           # pitcher Statcast (single or --all-pitchers)
│   ├── pull_fielding.py          # OAA / FRV per position
│   ├── pull_schedule.py          # season schedule + results → web_games
│   ├── pull_standings.py         # MLB standings snapshot (all 30 clubs) → web_standings
│   ├── pull_boxscore.py          # per-game box scores → web_player_game_stats
│   ├── pull_season_stats.py      # OPS / wRC+ / ERA / FIP / WAR + value components + batter basic
│   │                             # line + pitcher line W/L/SV/GS/IP/WHIP/K%/BB% (MLB Stats API)
│   ├── season_line.py            # shared API season line -> stat columns mapping
│   ├── pull_player_splits.py     # per-club + total season lines, every club (P12)
│   ├── pull_position_splits.py   # each Jay's batting line by position (per-season position)
│   ├── pull_savant_leaderboards.py # Savant percentiles / xStats + barrels / pitch run value (P12)
│   ├── pull_league_averages.py   # MLB / AL / NL averages from summed team stats (P12)
│   ├── season_report.py          # SELECT-only article data pack -> reports/ (P12; team_trends P13)
│   ├── pull_team_stats.py        # all 30 clubs' team lines + SP/RP split + wRC+/WAR (P13)
│   ├── pull_team_statcast.py     # Savant team leaderboards, all 30 clubs (P13)
│   ├── fetch_team_logos.py       # ONE-SHOT: cap logos → web/public/team-logos (recoloured)
│   └── backfill.py               # one-shot orchestrator
├── db/migrations/                # plain SQL: 001 → 023
├── web/                          # Next.js app
│   ├── app/[locale]/
│   │   ├── page.tsx              # Home: standings + schedule calendar + "Today's Blue Jays"
│   │   ├── template.tsx          # page-to-page fade (skipped on first load)
│   │   ├── standings/            # Divisions + wild card + clinch legend
│   │   ├── team/                 # Team trends: five seasons vs MLB (P13)
│   │   ├── season/[year]/        # Team season review vs the prior season + MLB ranks (P12)
│   │   ├── games/[gamePk]/       # Per-game box score detail
│   │   └── players/
│   │       ├── page.tsx          # Roster (Current 26-man / All 2024-2026)
│   │       └── [mlbam_id]/       # Overview + batting / pitching / fielding / compare tabs
│   ├── components/
│   │   ├── PlayerNav.tsx
│   │   ├── Header.tsx / TeamMenu.tsx  # nav; "Team ▾" menu (season review / five-season trends)
│   │   ├── TeamNav.tsx           # team section tabs (season review | five-season trends)
│   │   ├── SeasonProgressBar.tsx
│   │   ├── ScheduleCalendar.tsx  # rough.js hand-drawn parchment scorecard
│   │   ├── ScorecardFrame.tsx    # reusable rough.js parchment frame (hero + roster cards)
│   │   ├── HeroCard.tsx          # "Today's Blue Jays" cards (wraps ScorecardFrame)
│   │   ├── RosterExplorer.tsx    # roster filter (All/Pitchers/Batters) + all-time season grouping
│   │   ├── SeasonStatTable / RecentForm / GameLog / ContactQualityCard  # batter overview modules
│   │   ├── PitcherSeasonStatTable / PitcherRecentForm / PitcherGameLog  # pitcher overview modules
│   │   ├── StandingsTable / WildCardTable / PlayoffRace / HomeStandings # P11 standings modules
│   │   ├── StandingsTabs.tsx    # AL / NL / Wild Card view switcher (client)
│   │   ├── SeasonCompareCard / DisciplineCards / PercentileBars  # P12 season-vs-season + Savant cards
│   │   ├── compare/              # P12 Compare tab: controls, club splits, arc, arsenal compare, velo, zone grid
│   │   ├── season/               # season page: trend by game number, value by position, player stats table
│   │   ├── team/                 # P13 team page: season strip, run sources, rank grid, trends,
│   │   │                         # rotation/bullpen, ERA vs FIP, trajectory, splits, callouts, glossary
│   │   ├── Exportable / TableExport  # "PNG ↓" on charts; "PNG ↓" + "Copy table" on tables (generic)
│   │   ├── Footer.tsx / ContactEmail.tsx  # site-wide credit strip; scraper-shy email link
│   │   ├── TeamLogo.tsx          # recoloured cap logo + TeamCell
│   │   ├── SketchDefs.tsx        # shared SVG #sketch filter (hand-drawn wobble)
│   │   ├── motion/               # MotionProvider, Reveal/RevealGroup/RevealItem, CountUp,
│   │   │                         # SlidingPill, WhenInView
│   │   └── charts/               # SprayChart, ArsenalTable, PitchMovementChart, PitchZoneHeatmap,
│   │                             # FieldingDiagram, WarBreakdown, ExitVeloChart, ChartTooltip,
│   │                             # RollingOpsSparkline, RollingEraSparkline, VeloTrendChart
│   ├── lib/                      # db, players, batting/pitching/fielding, season-stats,
│   │                             # recent-game, field-geometry, games, team-abbr,
│   │                             # batter-game-log, batting-form, exit-velo-stats,
│   │                             # pitcher-game-log, pitching-form, pitch-arsenal, pitch-colors,
│   │                             # motion (timing tokens), ink-draw, use-lingering-hover,
│   │                             # P12: compare, discipline, season-deltas, savant,
│   │                             # team-season (pure) + team-season-data, export-svg, copy-table,
│   │                             # site (brand + contacts), export-png, export-table,
│   │                             # P13: team-trends, team-metrics, team-grid, team-callouts,
│   │                             # percentile-color, ordinal, team-ids
│   └── messages/{en,zh-TW}.json
├── .github/workflows/etl.yml     # two-job cron: ~09:00 ET full refresh + ~11:30 PM ET finals
├── ETL_update_flow.md            # backfill + manual re-run steps
├── CLAUDE.md                     # guidance for AI coding agents
├── .env.example                  # template for env vars
└── README.md
```

Detailed design (architecture, schema, spray-chart spec) lives in the personal plan file at `~/.claude/plans/blue-jays-fan-piped-kurzweil.md`.

---

## Setup

### Prerequisites

- Node.js 20+ and pnpm
- The existing conda env **`MLBxBaZi`** for the Python ETL (do **not** create a venv)
- A Supabase project (free tier is fine for MVP)

### Environment

The app talks to Supabase Postgres through a single `DATABASE_URL` connection
string. Copy the template into both git-ignored locations and fill it in:

```powershell
Copy-Item .env.example web\.env.local   # read by the Next.js app
Copy-Item .env.example .env             # read by the Python ETL
```

Set `DATABASE_URL` to your Supabase Postgres connection string (Supabase project
→ Settings → Database). The other vars are optional until P5.

### Web

```powershell
cd web
pnpm install
pnpm dev
# open http://localhost:3000
```

### ETL (one-shot, local)

Uses the existing conda env `MLBxBaZi` — never a venv or `requirements.txt`.

```powershell
conda activate MLBxBaZi

# Default run = Vladimir Guerrero Jr. (665489), full 2025 regular season
python etl/pull_statcast.py

# Or pass a specific player / date range
python etl/pull_statcast.py --player 665489 --start 2025-03-27 --end 2025-09-28
```

### Backfill a whole season

`etl/backfill.py` runs the full chain in order (roster → schedule → Statcast for
every player → fielding → season-stat CSV ingest → per-game box scores).
Idempotent; re-run as needed.

```powershell
python etl/backfill.py --season 2026
python etl/backfill.py                              # default = 2024 + 2025
```

Season stats (OPS / wRC+ / ERA / FIP / WAR + components) come from the MLB Stats
API and need no manual step. Runbook in **[ETL_update_flow.md](ETL_update_flow.md)**.

The cron version runs in GitHub Actions; see `.github/workflows/etl.yml`.

---

## Deploy & cron

### Vercel

1. Import the repo, set **Root Directory** to `web/`. Vercel auto-detects Next.js + pnpm.
2. Add environment variables (Production **and** Preview):
   - `DATABASE_URL` — Supabase Postgres **pooler** connection string (port 6543). `web/lib/db.ts` uses `prepare: false` (no prepared statements in transaction mode) and `max_pipeline: 0` (pipelined queries through the pooler can hang).
   - `REVALIDATE_SECRET` — a long random string. The cron passes this to `/api/revalidate`.
3. Deploy. Note the production URL (e.g. `https://bluejaysfanweb.vercel.app`); the cron needs it.

### GitHub Actions cron (`.github/workflows/etl.yml`)

Two scheduled runs: `0 13 * * *` (≈09:00 ET) — full refresh (Statcast / roster / fielding / season-stats / per-club season lines / Savant leaderboards / league averages, then a schedule + standings refresh, all 30 clubs' team lines + Savant team leaderboards + a 3-day box-score backfill for West-Coast / late finals); and `30 3 * * *` (≈11:30 PM ET) — light run (today's schedule + today's final box scores). Both drift an hour across DST. Trigger manually with **Actions → daily-etl → Run workflow**.

Required repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `DATABASE_URL` | Same Supabase pooler string as Vercel |
| `REVALIDATE_URL` | `https://<your-vercel-app>/api/revalidate` |
| `REVALIDATE_SECRET` | Same value as Vercel |

The workflow installs Python deps with `pip` rather than the local conda env — runners are ephemeral and `MLBxBaZi` does not exist there. The header of the workflow file explains this exception.

After ETL writes to Supabase, the final step `curl`s the revalidate endpoint so Next.js ISR caches drop in seconds rather than waiting out the 24-hour `revalidate` window.

---

## i18n conventions

UI strings live in `web/messages/{en,zh-TW}.json`. **Write English first.**

What gets translated to zh-TW:
- Navigation labels, button text, page descriptions, BaZi prose (v2)

What stays English in zh-TW (do **not** translate):
- Player names (`Vladimir Guerrero Jr.`, `Bichette`, …)
- Baseball jargon (`OPS`, `wRC+`, `ERA`, `FIP`, `Spray Chart`, `Statcast`, `Launch Angle`, `Exit Velocity`, …)

---

## Data sources

- **[pybaseball](https://github.com/jldbc/pybaseball)** — wrapper around Baseball Savant. Covers batting (spray data), pitching (location, velocity, spin), and fielding (FRV via `statcast_outs_above_average`, which returns `fielding_runs_prevented`). **Savant pulls work; FanGraphs scrapers do not** — see workaround below.
- **MLB Stats API** (`statsapi.mlb.com`) — player bio (incl. birth city/country), full-season roster enumeration, primary position.
- **Baseball Savant leaderboards** (via pybaseball) — percentile ranks, expected stats + barrels, pitch-arsenal run value, stored as Savant publishes them (MLB-wide season values). **Pitch run value: positive = good for the pitcher.**
- **MLB Stats API `/people/{id}/stats`** — per-club season splits + game-log dates for the 2026 roster, 2024–2026, every club; **`/teams/stats`** — league averages (summed team counting stats).
- **Team level, all 30 clubs, 2022–2026 (P13)** — MLB Stats API `/teams/stats` (season + seasonAdvanced), per-club starter / reliever splits and per-club player leaderboards (team wRC+ = PA-weighted, WAR = sum); Baseball Savant team leaderboards (Barrel% / Hard-hit% / xwOBA / OAA). Every team rate, MLB average and rank is computed once, in the migration-022 views.
- **MLB Stats API `season` + `sabermetrics` stats** — source of OPS / wRC+ / ERA / FIP / WAR, the WAR value components (Bat / BsR / Fld / Pos / Lg / Rep / RAR), the basic slash line (AVG / OBP / SLG / HR / RBI / SB / PA), and the pitcher line (W / L / SV / GS / IP / WHIP / K% / BB%). Free, no key; the sabermetrics block is FanGraphs data licensed to MLB, so the numbers match FanGraphs. Replaced the manual FanGraphs CSV export in Sept 2026. (Season WPA isn't in the API and is frozen at the last CSV import.)

### Important Statcast gotchas

- Pybaseball **includes playoffs by default.** Filter `game_type == 'R'` for regular season; `transform.regular_season_only(df, keep_postseason=True)` opts in (used for the 2025 playoff backfill).
- 2026 changed `plate_x`/`plate_z` from front-of-plate to middle-of-plate alignment. `transform.tag_plate_alignment()` writes `'front'` (≤2025) or `'middle'` (≥2026) to `web_statcast_events.plate_alignment`. `PitchZoneHeatmap` must render a single alignment value at a time (enforced by the "Zone coords" filter in `PitchingExplorer`); the arsenal table, movement chart, and velocity trend read release-frame fields only and are alignment-agnostic.
- Statcast is pulled **by player id**, so it holds games with other clubs. "As a Blue Jay" = the player is in that game's Jays box score (`web_player_game_stats`), **not** "it was a Jays game" (a traded player can face Toronto).
- Savant's 2026 `zone` is not comparable to earlier seasons (Zone% −3.4 pts, Chase% +2.8 pts across every pitch while Whiff% held) — cross-season Chase% / Zone% are shown net of that shift.
- Pitch classifications can be retroactively edited → daily ETL re-pulls the last 7 days (current season only). Historical seasons stay static after `etl/backfill.py`.
- Spray-chart coordinate transform:
  ```
  x_feet = 2.5 * (hc_x - 125.42)
  y_feet = 2.5 * (198.27 - hc_y)
  ```

### FanGraphs scraper is dead

`pybaseball.team_batting` / `team_pitching` / `batting_stats` / `pitching_stats` return HTTP 403 (server-side block; upgrading pybaseball won't help). Both needs are served by the MLB Stats API instead:

- **Player enumeration** ("who appeared for the Jays in season X") uses MLB Stats API `rosterType=fullSeason` in `etl/mlb_api.py`. Includes a few 40-man members who never actually debuted — acceptable; their Statcast pulls just return zero rows.
- **Season stats** come from `/stats?stats=season,sabermetrics&teamId=141` (`etl/mlb_api.py::fetch_team_season_stats`), refreshed nightly. Catcher `war_fielding` is derived as `rar` minus the other five components so it includes framing, as FanGraphs' `Fld` does.

---

## Status

| Phase | What | Status |
|---|---|---|
| P0 | Supabase schema + first player ETL | done |
| P1 | Next.js skeleton + i18n + roster list | done |
| P2 | SprayChart D3 component | done |
| P3 | SprayChart + Supabase + filters | done |
| P4 | Pitch distribution + fielding pages | done |
| P5 | Cron ETL + Vercel deploy | done |
| P6 | 2024-2026 backfill, multi-position fielding, player overview, Today's Blue Jays, BaZi v2 prep | done |
| P7 | Schedule calendar + per-game box scores + batter WAR breakdown + season WPA | done |
| P8 | EV/LA scatter + KPI chips on batting page | done |
| P9 | Batter overview deep-dive: year-by-year table + recent form + game log + rolling OPS + contact quality | done |
| P10 | Pitcher deep-dive: pitcher KPI set + recent form + outings log + rolling ERA + year-by-year table; arsenal table, pitch-movement chart, velocity trend | done |
| P11 | Standings & playoff race: `/standings` (six divisions + AL/NL wild card + clinch legend) and a home AL East + AL playoff-picture module; migration `012`, nightly `pull_standings.py`, one-shot recoloured cap logos | done |
| P12 | Season review & year-over-year: full-MLB 2024–2026 history for the 2026 roster (every club), Compare tab, discipline + batted-ball cards, prior-season sparkline overlays, team season page + nav "Team", Savant percentiles + league averages, PNG export + copy-table, article data pack; migrations `013`–`019` | done |
| P13 | Team trends: `/team` (nav "Team"), five seasons vs the MLB average and 30-club ranks — record & run sources, offense / run-prevention rank grids, trends, rotation vs bullpen, ERA vs FIP, five-season trajectory + splits, strengths & weaknesses, glossary; all 30 clubs' team data 2022–2026; migrations `020`–`022`; `team_trends` in the article pack | done |

---

## Credits & licensing

- Statcast data © MLB Advanced Media. Pulled via [pybaseball](https://github.com/jldbc/pybaseball).
- Player headshots from `https://midfield.mlbstatic.com/...` — non-commercial use only; see About page.
- Built and maintained by Suyu Cheng. Brand name, author and contact links live in `web/lib/site.ts`.
- This is a fan project, not affiliated with the Toronto Blue Jays or MLB.
