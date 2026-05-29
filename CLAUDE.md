# CLAUDE.md

This file gives Claude (and other AI coding agents) the project context that isn't obvious from the code alone. Read this before suggesting changes.

> 詳細設計與技術選型理由在 `C:\Users\jing8\.claude\plans\blue-jays-fan-piped-kurzweil.md`，這份 CLAUDE.md 只列出實作時最常踩到的規則。

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
- **Every table for this app is prefixed `web_`**: `web_players`, `web_statcast_events`, `web_player_season_stats`.
- Never create an unprefixed table here; it will collide.

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
- pybaseball returns playoffs by default. Filter `game_type == 'R'` for regular season.
- 2026 season changed Savant's `plate_x` / `plate_z` to middle-of-plate alignment. Beware when mixing seasons.
- Pitch classifications get retroactively corrected → daily ETL must re-pull the last 7 days and upsert.
- Spray chart coordinate transform (must apply in ETL, not in the chart component):
  ```
  x_feet = 2.5 * (hc_x - 125.42)
  y_feet = 2.5 * (198.27 - hc_y)
  ```
- Upsert key for `web_statcast_events`: `(game_pk, batter_id, pitcher_id, at_bat_number, pitch_number)`.

---

## Tech stack (decided — don't relitigate without reason)

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| i18n | `next-intl` with `[locale]` route segments |
| Charts | D3.js (spray / pitch zone / fielding heatmap) + Recharts (KPI bars / lines) |
| Database | Supabase Postgres |
| ETL | Python + pybaseball + Supabase Python client |
| Cron | GitHub Actions (`0 13 * * *` = 09:00 ET daily) |
| Deploy | Vercel (with daily ISR revalidate) |

ETL runs **outside** Next.js (Vercel functions can't run pybaseball). Next.js calls a `/api/revalidate` endpoint at the end of the cron run.

---

## Folder layout (target — not all exist yet)

```
/etl/                          # Python (conda env MLBxBaZi): pybaseball → Supabase
  pull_statcast.py
  transform.py                 # hc_x/y → feet, game_type filter
  db.py                        # psycopg3 connection + upserts
  roster.py                    # 26-man maintenance (not built yet)
/db/migrations/                # plain SQL, apply via psql or Supabase Studio
  001_initial_schema.sql
/.github/workflows/etl.yml     # daily cron
/web/                          # Next.js app
  app/[locale]/
    page.tsx                   # team home
    players/page.tsx           # roster list
    players/[mlbam_id]/
      page.tsx                 # overview
      batting/page.tsx         # spray chart
      pitching/page.tsx        # pitch distribution
      fielding/page.tsx        # heatmap + FRV
    about/page.tsx
  components/charts/
    SprayChart.tsx
    PitchDistribution.tsx
    FieldingHeatmap.tsx
  lib/
    supabase.ts                # server client
    field-geometry.ts          # Rogers Centre SVG paths
  messages/
    en.json                    # source of truth
    zh-TW.json                 # translation
```

v2 routes to leave room for but not implement: `/[locale]/players/[id]/bazi/`, `/[locale]/predictions/`.

---

## How to run things

Nothing is scaffolded yet. When initialized:

```powershell
# Web (needs DATABASE_URL in web/.env.local — Next.js does not read the repo-root .env)
cd web
pnpm install                   # if pnpm is missing: npm install -g pnpm
pnpm dev                       # http://localhost:3000  (locale routing via proxy.ts)

# ETL (one-shot, local) — uses the existing conda env, NOT a venv
conda activate MLBxBaZi
python etl/pull_statcast.py                         # defaults to Vladdy 2025
python etl/pull_statcast.py --player 665489 --start 2026-03-27 --end 2026-05-26
```

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

Reuse these tokens — don't introduce ad-hoc hex. The brand 5 (`papaya`/`navy`/`steel`/`lava`/`brick`) are for chrome and data marks; `grass`/`dirt` are *only* for the realistic ballpark surfaces in the SprayChart (applied via `var(--color-grass)` / `var(--color-dirt)` with per-layer `fillOpacity`, not as utility classes). SprayChart batted-ball markers use the brand tokens (HR=brick, single=navy, XBH=lava, out=steel).

> Turbopack gotcha: after changing `@theme` in `globals.css`, custom color utilities may not regenerate. Stop dev, delete `web/.next`, restart.

---

## Phases (current = P5)

| Phase | Status | Done when |
|---|---|---|
| P0 | done | Supabase schema created; Vladdy 2025 statcast in DB; row count matches Savant |
| P1 | done | Next.js skeleton + i18n + roster list page renders in en + zh-TW |
| P2 | done | SprayChart D3 component visually matches Savant with hard-coded data |
| P3 | done | SprayChart wired to Supabase + filters work client-side |
| P4 | done | Pitch distribution + fielding FRV pages live (en + zh-TW), PlayerNav links the three sub-pages |
| P5 | not started | GitHub Actions cron + Vercel deploy; data refreshes overnight |
