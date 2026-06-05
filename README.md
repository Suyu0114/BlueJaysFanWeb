# Blue Jays Fan Web

一個給多倫多藍鳥隊球迷的觀察站。同時提供英文和繁體中文切換。

> Toronto Blue Jays fan website. English-primary UI with optional Traditional Chinese (zh-TW) toggle. Data visualizations powered by Statcast (via [pybaseball](https://github.com/jldbc/pybaseball)).

---

## Features

1. **Data visualizations** (per player, filterable by season / month / pitch type)
   - Spray chart — batted-ball locations, colored by outcome, sized by exit velocity
   - Pitching distribution — pitch types, zone heatmap
   - Fielding diagram + FRV table — primary position in brick, secondary positions in steel (so multi-position guys like Ernie Clement read at a glance)
2. **Player pages**
   - Overview with KPI cards (OPS / wRC+ / ERA / FIP / WAR) and a season-progress bar (pace projection for batters; current-vs-prior for pitchers, because `162/games` is meaningless for either starters or relievers)
   - WAR breakdown chart (batter-only) — a diverging stacked bar of the six FanGraphs run-value components (Bat / BsR / Fld / Pos / Lg / Rep) reconciling to RAR, with an on-page methodology note
   - Sub-tabs auto-hide for roles a player didn't appear in
3. **Roster**
   - Current 26-man (default) / All 2024-2026 toggle
4. **Home page**
   - Month schedule calendar — opponent (`vs` / `@`) + result/score or game time (ET); doubleheaders show both games; current / most-recent game day highlighted; click a final game to open its box score
   - "Today's Blue Jays" module — HR hero from the most recent game (hardest-contact fallback when nobody homered) + best pitching line (IP / K / H, no fake ERA)
5. **Per-game box scores**
   - Every Jays player's batting and/or pitching line for a finished game; innings pitched rendered correctly from stored outs (never the "5.2" decimal trap)

**v2 (not in this milestone):** BaZi personality analysis, matchup predictions, injury-risk beta, daily WAR snapshots, `/compare` page (the underlying SprayChart `secondaryEvents` prop is already in place).

---

## Tech stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- **i18n:** `next-intl` — default `en`, optional `zh-TW`
- **Charts:** D3.js (spray / pitch zone / fielding) + Recharts (WAR breakdown diverging stacked bar) + rough.js (hand-drawn schedule calendar)
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
│   ├── pull_boxscore.py          # per-game box scores → web_player_game_stats
│   ├── pull_season_stats.py      # OPS / wRC+ / ERA / FIP / WAR + WAR value components (CSV)
│   ├── backfill.py               # one-shot orchestrator
│   └── data/fangraphs/           # gitignored manual CSV drop zone
├── db/migrations/                # plain SQL: 001 → 008
├── web/                          # Next.js app
│   ├── app/[locale]/
│   │   ├── page.tsx              # Home: schedule calendar + "Today's Blue Jays"
│   │   ├── games/[gamePk]/       # Per-game box score detail
│   │   └── players/
│   │       ├── page.tsx          # Roster (Current 26-man / All 2024-2026)
│   │       └── [mlbam_id]/       # Overview + batting / pitching / fielding tabs
│   ├── components/
│   │   ├── PlayerNav.tsx
│   │   ├── SeasonProgressBar.tsx
│   │   ├── ScheduleCalendar.tsx  # rough.js hand-drawn parchment scorecard
│   │   ├── ScorecardFrame.tsx    # reusable rough.js parchment frame (hero + roster cards)
│   │   ├── HeroCard.tsx          # "Today's Blue Jays" cards (wraps ScorecardFrame)
│   │   ├── RosterExplorer.tsx    # roster filter (All/Pitchers/Batters) + all-time season grouping
│   │   └── charts/               # SprayChart, PitchDistribution, FieldingDiagram, WarBreakdown
│   ├── lib/                      # db, players, batting/pitching/fielding, season-stats,
│   │                             # recent-game, field-geometry, games, team-abbr
│   └── messages/{en,zh-TW}.json
├── .github/workflows/etl.yml     # two-job cron: ~09:00 ET full refresh + ~11:30 PM ET finals
├── ETL_update_flow.md            # backfill + FanGraphs CSV download steps
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

Season stats (OPS / wRC+ / ERA / FIP / WAR) require a manual FanGraphs CSV
download — pybaseball's FanGraphs scrapers are 403'd indefinitely. Step-by-step
in **[ETL_update_flow.md](ETL_update_flow.md)**.

The cron version runs in GitHub Actions; see `.github/workflows/etl.yml`.

---

## Deploy & cron

### Vercel

1. Import the repo, set **Root Directory** to `web/`. Vercel auto-detects Next.js + pnpm.
2. Add environment variables (Production **and** Preview):
   - `DATABASE_URL` — Supabase Postgres **pooler** connection string (port 6543). `web/lib/db.ts` uses `prepare: false` so PgBouncer transaction mode works.
   - `REVALIDATE_SECRET` — a long random string. The cron passes this to `/api/revalidate`.
3. Deploy. Note the production URL (e.g. `https://bluejaysfanweb.vercel.app`); the cron needs it.

### GitHub Actions cron (`.github/workflows/etl.yml`)

Two scheduled runs: `0 13 * * *` (≈09:00 ET) — full refresh (Statcast / roster / fielding / season-stats, then a schedule refresh + a 3-day box-score backfill for West-Coast / late finals); and `30 3 * * *` (≈11:30 PM ET) — light run (today's schedule + today's final box scores). Both drift an hour across DST. Trigger manually with **Actions → daily-etl → Run workflow**.

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
- **FanGraphs (manual CSV export)** — only source of OPS / wRC+ / ERA / FIP / WAR plus the WAR value components (Bat / BsR / Fld / Pos / Lg / Rep / RAR) and season WPA; requires a paid membership and human-in-the-loop download. See [ETL_update_flow.md](ETL_update_flow.md).

### Important Statcast gotchas

- Pybaseball **includes playoffs by default.** Filter `game_type == 'R'` for regular season; `transform.regular_season_only(df, keep_postseason=True)` opts in (used for the 2025 playoff backfill).
- 2026 changed `plate_x`/`plate_z` from front-of-plate to middle-of-plate alignment. `transform.tag_plate_alignment()` writes `'front'` (≤2025) or `'middle'` (≥2026) to `web_statcast_events.plate_alignment`. PitchDistribution must filter to a single alignment value at a time.
- Pitch classifications can be retroactively edited → daily ETL re-pulls the last 7 days (current season only). Historical seasons stay static after `etl/backfill.py`.
- Spray-chart coordinate transform:
  ```
  x_feet = 2.5 * (hc_x - 125.42)
  y_feet = 2.5 * (198.27 - hc_y)
  ```

### FanGraphs scraper is dead

`pybaseball.team_batting` / `team_pitching` / `batting_stats` / `pitching_stats` return HTTP 403 (server-side block; upgrading pybaseball won't help). Two workarounds in place:

- **Player enumeration** ("who appeared for the Jays in season X") uses MLB Stats API `rosterType=fullSeason` in `etl/mlb_api.py`. Includes a few 40-man members who never actually debuted — acceptable; their Statcast pulls just return zero rows.
- **Season stats** load from manually-exported FanGraphs CSVs in `etl/data/fangraphs/{batting,pitching}_{season}.csv` (directory gitignored). Missing file → warning + skip, not a hard failure.

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

---

## Credits & licensing

- Statcast data © MLB Advanced Media. Pulled via [pybaseball](https://github.com/jldbc/pybaseball).
- Player headshots from `https://midfield.mlbstatic.com/...` — non-commercial use only; see About page.
- This is a fan project, not affiliated with the Toronto Blue Jays or MLB.
