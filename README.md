# Blue Jays Fan Web

一個給多倫多藍鳥隊球迷的觀察站。主要受眾是英語使用者（包含對中華 BaZi 文化好奇的非華人），同時提供繁體中文切換。

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

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
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
- Python 3.11+
- A Supabase project (free tier is fine for MVP)

### Environment

Copy `.env.example` to `.env.local` (for the web app) and `.env` (for the ETL):

```powershell
Copy-Item .env.example .env.local
Copy-Item .env.example etl\.env
```

Fill in the Supabase URL, anon key, and service role key from your Supabase project settings.

### Web

```powershell
cd web
pnpm install
pnpm dev
# open http://localhost:3000
```

### ETL (one-shot, local)

```powershell
cd etl
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Pull one player one season (Vladdy MLBAM id = 665489)
python pull_statcast.py --player 665489 --season 2026
```

The cron version runs in GitHub Actions; see `.github/workflows/etl.yml`.

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

- **[pybaseball](https://github.com/jldbc/pybaseball)** — free wrapper around Baseball Savant / Statcast. Covers batting (spray data), pitching (location, velocity, spin), and fielding (FRV via `statcast_fielding_run_value`).
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
| P0 | Supabase schema + first player ETL | not started |
| P1 | Next.js skeleton + i18n + roster list | not started |
| P2 | SprayChart D3 component (mock data) | not started |
| P3 | SprayChart + Supabase + filters | not started |
| P4 | Pitch distribution + fielding pages | not started |
| P5 | Cron ETL + Vercel deploy | not started |

---

## Credits & licensing

- Statcast data © MLB Advanced Media. Pulled via [pybaseball](https://github.com/jldbc/pybaseball).
- Player headshots from `https://midfield.mlbstatic.com/...` — non-commercial use only; see About page.
- This is a fan project, not affiliated with the Toronto Blue Jays or MLB.
