# Blue Jays Fan Web

一個給多倫多藍鳥隊球迷的觀察站。同時提供英文和繁體中文切換。

> Toronto Blue Jays fan website. English-primary UI with optional Traditional Chinese (zh-TW) toggle. Data visualizations powered by Statcast (via [pybaseball](https://github.com/jldbc/pybaseball)).

---

## MVP features

1. **Data visualizations**
   - Spray chart (batted-ball locations, colored by outcome, sized by exit velocity)
   - Pitching distribution (pitch types, zone heatmap)
   - Fielding heatmap with FRV
   - Filters: this season / this month / pitch type / vs LHP / vs RHP
2. **Player pages** — beginner-friendly overview for the 26-man active roster

**v2 (not in this milestone):** BaZi personality analysis, matchup predictions, injury-risk beta, BaZi-based cheer guides.

---

## Tech stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui
- **i18n:** `next-intl` — default `en`, optional `zh-TW`
- **Charts:** D3.js (spray / pitch zone / fielding) + Recharts (KPI bars / lines)
- **Database:** Supabase Postgres
- **ETL:** Python + pybaseball, scheduled via GitHub Actions (daily)
- **Deploy:** Vercel

---

## Project layout

```
.
├── etl/                          # Python ETL: pybaseball → Supabase
│   ├── pull_statcast.py
│   ├── transform.py
│   ├── roster.py
│   └── requirements.txt
├── web/                          # Next.js app
│   ├── app/[locale]/
│   ├── components/charts/
│   ├── lib/
│   └── messages/
│       ├── en.json               # source of truth
│       └── zh-TW.json            # translation
├── .github/workflows/etl.yml     # daily cron (09:00 ET)
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

Schedule: `0 13 * * *` (≈09:00 ET; drifts an hour across DST). Trigger manually with **Actions → daily-etl → Run workflow**.

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

- **[pybaseball](https://github.com/jldbc/pybaseball)** — free wrapper around Baseball Savant / Statcast. Covers batting (spray data), pitching (location, velocity, spin), and fielding (FRV via `statcast_outs_above_average`, which returns `fielding_runs_prevented`).
- **Baseball Savant** is the upstream source; data updates within minutes of game end.
- **FanGraphs paid** — not used in MVP. Reconsider in v2 if vs-LHP/RHP splits or DRS become must-haves.

### Important Statcast gotchas

- Pybaseball **includes playoffs by default.** Filter `game_type == 'R'` for regular season.
- 2026 changed `plate_x`/`plate_z` to middle-of-plate alignment.
- Pitch classifications can be retroactively edited → daily ETL re-pulls the last 7 days.
- Spray-chart coordinate transform:
  ```
  x_feet = 2.5 * (hc_x - 125.42)
  y_feet = 2.5 * (198.27 - hc_y)
  ```

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

---

## Credits & licensing

- Statcast data © MLB Advanced Media. Pulled via [pybaseball](https://github.com/jldbc/pybaseball).
- Player headshots from `https://midfield.mlbstatic.com/...` — non-commercial use only; see About page.
- This is a fan project, not affiliated with the Toronto Blue Jays or MLB.
