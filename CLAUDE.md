# CLAUDE.md

This file gives Claude (and other AI coding agents) the project context that isn't obvious from the code alone. Read this before suggesting changes.

> 詳細設計與技術選型理由在 `C:\Users\jing8\.claude\plans\blue-jays-fan-piped-kurzweil.md`，這份 CLAUDE.md 只列出實作時最常踩到的規則。
>
> **Reference docs** — schema dictionary (every `web_*` table, the invariants the ETL relies on, and the "columns that don't exist" anti-index): `docs/DATA_MODEL.md`. Per-feature handoff specs: `docs/Pn_spec.md` (e.g. `P7_spec.md`, `P8_spec.md`). After any change, reconcile the docs via `docs/DOC_MAINTENANCE.md` (trigger → which docs to update).

---

## What this project is

**Suyu's Jays Notes** (formerly "Blue Jays Fan Hub", renamed 2026-10-04): a Toronto Blue Jays data site by Suyu Cheng. It doubles as the author's portfolio for sports-analytics work, so the author credit (About page, site-wide footer, every exported PNG / copied table) is a feature, not decoration. It started with two MVP features:

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
- **Every table for this app is prefixed `web_`**: `web_players`, `web_statcast_events`, `web_player_season_stats`, `web_player_team_season_stats`, `web_player_position_splits`, `web_player_seasons`, `web_fielding_frv`, `web_id_map`, `web_games`, `web_player_game_stats`, `web_standings`, `web_savant_percentiles`, `web_savant_season`, `web_pitch_arsenal_rv`, `web_league_season`, `web_team_season_stats`, `web_team_statcast_season`, `web_team_position_splits`, `web_article_views`.
- Never create an unprefixed table here; it will collide.
- **Every `web_` object is locked out of Supabase's REST API** (`027`): RLS on (no policies), views `security_invoker = on`, no `anon` / `authenticated` grants. The site and the ETL connect as `postgres` (owner, BYPASSRLS) and never use the anon key. Supabase's default privileges re-grant `anon` ALL on every new table / view, and `create or replace view` resets `security_invoker` — so **after any migration that creates or replaces a `web_` table or view, re-run `027`** (idempotent). See `docs/DATA_MODEL.md` invariant 11.
- Schema is layered: `001_initial_schema.sql` (P0) → `002_fielding_frv.sql` (P4) → `003_player_seasons.sql` + `004_plate_alignment.sql` + `005_id_map.sql` (P6) → `006_games.sql` + `007_player_game_stats.sql` + `008_war_components.sql` (P7) → `009_basic_season_stats.sql` (P9) → `010_pitching_season_stats.sql` + `011_statcast_pitch_detail.sql` (P10) → `012_standings.sql` (P11) → `013_games_game_type.sql` + `014_player_team_season_stats.sql` + `015_metric_views.sql` + `016_savant_percentiles.sql` + `017_savant_season.sql` + `018_pitch_arsenal_rv.sql` + `019_league_season.sql` (P12) → `020_team_season_stats.sql` + `021_team_statcast_season.sql` + `022_team_metric_views.sql` (P13) → `023_player_position_splits.sql` (post-P13) → `024_team_position_splits.sql` + `025_team_position_views.sql` (post-P13) → `026_article_views.sql` (post-P13) → `027_rest_api_lockdown.sql` (post-P13). One concern per migration file.

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
- **`web_players.position` is the player's CURRENT MLB primary position** (a bio field, one value per player, overwritten every run) — never use it to label a past season (Bichette 2025 read `3B` after the Mets moved him there). A season's position = his most-PA position in `web_player_position_splits` (PH / P excluded; `seasonPosition` in `web/lib/season-position.ts`), whose Σ PA per player-season equals `web_player_season_stats.pa`. A departed player (not `is_active_26`) shows his **last Jays** position on the player-page header and the all-time roster card (`lastJaysPosition`, same file — Bichette = `SS (Blue Jays, 2025)`); pitchers have no split rows and keep `P`. It is batting-by-position counts only — the API has no by-position WAR / Off.
- Pitch classifications get retroactively corrected → daily ETL re-pulls the last 7 days and upserts (current season only). Historical seasons are static after `etl/backfill.py`.
- Spray chart coordinate transform (must apply in ETL, not in the chart component):
  ```
  x_feet = 2.5 * (hc_x - 125.42)
  y_feet = 2.5 * (198.27 - hc_y)
  ```
- Upsert key for `web_statcast_events`: `(game_pk, batter_id, pitcher_id, at_bat_number, pitch_number)`.
- **Standings GB columns are `text`, not numbers.** `web_standings.games_back` /
  `wc_games_back` / `elimination_number` / `magic_number` hold MLB's own display
  strings, sentinels included: `'-'` = "is the reference", `'+9.5'` = ahead of the
  wild card cut line, `'E'` = eliminated. Stored verbatim, never parsed — **order
  by the `*_rank` columns.** Also: `wild_card_rank` is NULL for division leaders
  (absent upstream), and MLB's NL division ids are reversed (**203 = NL West,
  204 = NL East**). See `docs/DATA_MODEL.md` → `web_standings`.

### FanGraphs scraping is dead — use these workarounds
- `pybaseball.team_batting` / `team_pitching` / `batting_stats` / `pitching_stats` return **HTTP 403**. The block is server-side; updating pybaseball won't help.
- **Player enumeration** for "who appeared for the Jays in season X" now uses MLB Stats API `rosterType=fullSeason` (`etl/mlb_api.py::fetch_full_season_roster`). It includes 40-man members who never debuted — accept the small over-inclusion. Run via `python etl/pull_team_players.py --season YEAR`.
- **Season stats** (OPS / wRC+ / ERA / FIP / K/9 / WAR + Value components + batter basic line + P10 pitcher line W/L/SV/GS/IP/WHIP/K%/BB%) come from the **MLB Stats API** `/stats?stats=season,sabermetrics&teamId=141` (`etl/mlb_api.py::fetch_team_season_stats`, free, no key) and refresh in the ~09:00 ET cron. The `sabermetrics` block is FanGraphs data licensed to MLB, so WAR matches the FanGraphs leaderboard (±0.05). This replaced the manual FanGraphs CSV export on 2026-09-23 (membership lapsed) — **don't reintroduce a CSV path.** Gotchas: (a) `playerPool=ALL` is required (default = qualified only); (b) the team leaderboard is only used to *enumerate* players — each player's numbers come from his own `/people/{id}/stats` Toronto split, because right after the season the leaderboard's sabermetrics were computed from stale counts (Scherzer 2026 FIP 5.43 vs 5.11) and it can drop a stat type for a player traded *away*; (c) catcher framing is in the API's `rar`/`war` but not its `fielding`, so `war_fielding` is derived as `rar` − the other five components; (d) no WPA in the API — `wpa` is frozen at the last CSV import.
- Statcast event pulls (`statcast_batter` / `statcast_pitcher`) and fielding leaderboard (`statcast_outs_above_average`) hit Baseball Savant directly — these are **unaffected**.

### Other clubs: Jays-only tables vs the all-clubs table (P12)
- **`web_player_season_stats`, `web_player_seasons`, `web_games`, `web_player_game_stats` are Jays-only.** Never write another club's season into `web_player_seasons` — it drives the roster, tab availability and the Statcast pull lists.
- **`web_player_team_season_stats`** holds the 2026 roster's full-MLB lines 2024–2026, one row per club **plus `team_id = 0` = season total** (always written; read it instead of summing). Written by `etl/pull_player_splits.py` (history one-shot + nightly for the current season); mapping shared with `pull_season_stats.py` via `etl/season_line.py`.
- **Statcast holds other clubs' games** (it is pulled by player id): deadline departures' post-trade games, and the 2026 roster's whole 2024/2025 seasons elsewhere (`pull_statcast.py` / `pull_pitcher.py --cohort-season 2026`). **"As a Blue Jay" = the player is in that game's Jays box score** (`exists web_player_game_stats (game_pk, mlbam_id)`), **not** `game_pk ∈ web_games` — Varsho as an Astro faced Toronto 2026-08-03→05.
- `web_games.game_type` (`013`): 2025 = 162 `R` + 18 postseason. Any team record must filter `game_type = 'R'`.
- **Discipline / batted-ball definitions live only in the `015` views** (`web_v_pitch_scoped`, `web_v_batter_discipline`, `web_v_pitcher_discipline`, `web_v_batted_ball_profile`), each with a `scope` column (`'mlb'` | `'jays'`). Don't re-derive Chase% / CSW% / Hard-hit% in TS or Python — read the views. Pitch counts exclude pitch-clock `automatic_ball`/`automatic_strike` rows (not thrown); PA/K/BB keep them.
- **Savant tables (`016`–`018`) are MLB-wide season values stored as Savant publishes them** — label them "all MLB clubs" next to Jays-scoped modules. An absent percentile row = **not qualified**, never 0. Percentiles: 100 = best for every metric. `web_savant_season` / `web_pitch_arsenal_rv` percentages are in **percent units** (6.9 = 6.9%). **Pitch run value: positive = good for the pitcher** (verified; the opposite of what one might assume). `web_league_season` rates come from summed team counts — keep it that way (P13 checks the MLB row).
- **Team tables (P13) hold all 30 clubs, 2022–2026**: `web_team_season_stats` (MLB Stats API counts + `bat_wrc_plus` PA-weighted / `bat_war` / `pit_war` summed from the **per-club** player leaderboard — no team sabermetrics endpoint exists, and the league-wide leaderboard merges traded players) and `web_team_statcast_season` (Savant team leaderboards mapped by team **name** because Savant's abbreviations are retroactive). ⚠️ Its percentages are **fractions** (0.085), *unlike* P12's Savant tables above (percent units) — the P13 views output fractions like the `015` views. Counts only — team rates, FIP (counts + league constant), MLB averages (Σ counts → rate, never averaged rates) and ranks live only in the `022` views (`web_v_team_counts` → `web_v_team_rates` → `web_v_mlb_season` / `web_v_team_season`); read them, never re-derive a team rate in TS or Python. `web_games` / `web_standings` also reach back to 2022 (no box scores / player data for 2022–2023).
- **By-position vs MLB (post-P13)**: `web_team_position_splits` (`024`, all 30 clubs' batting by position, one `/teams/stats?stats=statSplits&sitCodes=p1..pH` call per season — **`limit` is required**, the default 50-row page silently drops clubs) → the `025` view `web_v_team_position` (OPS from summed counts, MLB `pa` / `hr` = mean per club, `ops_rank` / `hr_rank` among 30). **Its `pos_group` must match `batterGroup` in `web/lib/team-season.ts`** (OF = LF+CF+RF, DH = DH+PH+P) — change both together. Jays rows = the player splits summed, exactly; each club's Σ PA runs 1–3 short of `bat_pa` upstream (logged, not fixed).
- **2026 `zone` is not comparable to earlier seasons.** Zone% fell ~3.4 pts and Chase% rose ~2.8 pts across every pitch on file while Whiff% didn't move — a Savant definition change (inferred). Never present a raw 2025→2026 Chase% / Z-Swing% / Zone% delta without that caveat or a "net of shift" figure. See `docs/DATA_MODEL.md` Known gaps #8.

---

## Tech stack (decided — don't relitigate without reason)

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| i18n | `next-intl` with `[locale]` route segments |
| Charts | D3.js (spray / pitch zone / fielding heatmap) + Recharts (KPI bars / lines) + rough.js (hand-drawn schedule calendar) |
| Motion | `motion` (framer-motion) — added 2026-09 because the UI read as too static and hovers felt abrupt; see **Motion** below |
| Articles | MDX via `@next/mdx` (added 2026-10-06): prose in Markdown, figures as live React components; no CMS / editor — see **Articles** below |
| Analytics | `@vercel/analytics` (Vercel Web Analytics, cookieless; the author reads it in the Vercel dashboard). Public article view counts are our own table (`026`) |
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
  pull_statcast.py             # batter Statcast; --all-batters / --include-postseason / --cohort-season (P12 other-club history)
  pull_pitcher.py              # pitcher Statcast; --all-pitchers / --include-postseason / --cohort-season
  pull_fielding.py             # OAA / FRV per position (Savant leaderboard)
  pull_standings.py            # MLB standings snapshot, both leagues (MLB Stats API)
  fetch_team_logos.py          # ONE-SHOT: cap logos -> web/public/team-logos (recoloured, committed)
  pull_season_stats.py         # OPS/wRC+/ERA/FIP/WAR + Value components + basic line + pitcher line (MLB Stats API)
  season_line.py               # P12: shared API season line -> stat columns mapping (season stats + splits)
  pull_player_splits.py        # P12: full-MLB lines per club + season total for a roster (web_player_team_season_stats)
  pull_position_splits.py      # post-P13: each Jay's batting line by position (statSplits sitCodes, 1 call/season; reconciles vs season PA)
  season_report.py             # P12: SELECT-only article data pack -> reports/season-review-<year>/ (git-ignored); P13 adds team_trends.md/.csv from the 022 views; post-P13 adds positions.md (mirrors valueByPosition + the 025 view), monthly RS-RA / R/G / RA/G, batter Off / Def / OAA — the fact source for /publish-article
  pull_savant_leaderboards.py  # P12 M6: Savant percentiles / xStats + barrels / pitch run value (league-wide, filtered to the roster)
  pull_league_averages.py      # P12 M6: MLB / AL / NL averages from summed team counting stats
  pull_team_stats.py           # P13: all 30 clubs' team lines + SP/RP split + wRC+/WAR aggregates (web_team_season_stats)
  pull_team_statcast.py        # P13: Savant team leaderboards, all 30 clubs (web_team_statcast_season)
  pull_team_position_splits.py # post-P13: all 30 clubs' batting by position (1 call/season, limit=1000; reconciles vs bat_pa + the Jays player splits)
  backfill.py                  # one-shot orchestrator for 2024 + 2025 (and optional 2026)
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
  010_pitching_season_stats.sql # web_player_season_stats: w/l/sv/gs/ip/whip/k_pct/bb_pct (pitcher line, P10)
  011_statcast_pitch_detail.sql # web_statcast_events: pfx_x/pfx_z/release_extension/estimated_woba/balls/strikes (P10)
  012_standings.sql            # web_standings (MLB standings snapshot, all 30 clubs, P11)
  013_games_game_type.sql      # web_games.game_type (R vs postseason rounds, P12)
  014_player_team_season_stats.sql # web_player_team_season_stats (per-club + total season lines, P12)
  015_metric_views.sql         # web_v_* discipline / batted-ball views with mlb|jays scope (P12)
  016_savant_percentiles.sql   # web_savant_percentiles (P12 M6)
  017_savant_season.sql        # web_savant_season (P12 M6)
  018_pitch_arsenal_rv.sql     # web_pitch_arsenal_rv (P12 M6)
  019_league_season.sql        # web_league_season (P12 M6)
  020_team_season_stats.sql    # web_team_season_stats (all 30 clubs, counts + wRC+/WAR aggregates, P13)
  021_team_statcast_season.sql # web_team_statcast_season (Savant team leaderboards, all 30 clubs, P13)
  022_team_metric_views.sql    # web_v_team_counts / _rates / web_v_mlb_season / web_v_team_season: team rates, MLB averages, 30-club ranks (P13)
  023_player_position_splits.sql # web_player_position_splits (Jays batting line by position; per-season position + value by position)
  024_team_position_splits.sql # web_team_position_splits (all 30 clubs' batting by position, counts)
  025_team_position_views.sql  # web_v_team_position: by-position OPS / HR per club + MLB row (team_id 0) + rank among 30; groups mirror batterGroup
  026_article_views.sql        # web_article_views: public view count per article slug (RLS on, no policies; written only by /api/views)
  027_rest_api_lockdown.sql    # every web_ object off the REST API: RLS on, views security_invoker, revoke anon/authenticated; idempotent — re-run after any new web_ table/view
/.claude/skills/publish-article/ # project skill: draft (PDF/docx/md) -> registry + en/zh-TW MDX, live figures, DB fact check, verify
/.github/workflows/etl.yml     # daily cron (rolling 7-day window for current season)
/ETL_update_flow.md            # backfill + manual re-run steps
/web/                          # Next.js app
  app/[locale]/
    page.tsx                   # team home + "Today's Blue Jays" module
    template.tsx               # page-to-page fade on client navigation (skipped on first load)
    players/page.tsx           # roster list with Current 26-man / All 2024-2026 toggle
    players/[mlbam_id]/
      page.tsx                 # overview: batter = KPI + RecentForm + RollingOpsSparkline + SeasonProgressBar + SeasonStatTable + ContactQualityCard + DisciplineCard + BattedBallProfileCard + WarBreakdown + GameLog; pitcher (P10) = KPI(W-L/SV/IP/ERA/WHIP/K%/WAR + hints) + PitcherRecentForm + PitcherDisciplineCard + RollingEraSparkline + SeasonProgressBar + PitcherSeasonStatTable + PitcherGameLog. Overview modules are Jays-scoped (P12).
      batting/page.tsx         # spray chart + EV/LA scatter
      pitching/page.tsx        # P10: arsenal table + movement chart + zone heatmap + velo trend
      fielding/page.tsx        # FRV table + multi-position diagram (season cell carries the club label)
      compare/page.tsx         # P12: season vs season incl. other clubs; URL state ?season=&vs=&scope=mlb|jays; What changed + season line + by-club + arc + Statcast
    standings/page.tsx         # P11: three views (AL / NL / Wild Card) + clinch legend
    season/[year]/page.tsx     # P12 M5: team season vs prior (record strip, games above .500 + run diff by game number, months, splits, leaders, value by position); generateStaticParams = seasons with R finals; player modules hide when a season has no player rows (< 2024). Post-P13: TeamNav tabs; MLB rank chips on PCT / RS / RA / run diff + "Where {season} ranked" (StrengthsWeaknesses single) from the 022 views, hidden without a Jays row; leaders WAR/OPS/HR/SB + ERA/WHIP/SO/SV, each card "All →" (#stats-<tab>-<column>) into the player stats table (last panel), preceded by "team stats vs MLB" (TeamSeasonStats); getTeamTrend loads season + prior. Value by position panel = chart (2024+, player rows) + PositionVsMlbTable (any season in the 025 view, 2022+). Record strip / month by month / splits are components (`SeasonRecordStrip` / `MonthlyRecordPanel` / `SeasonSplitsPanel`, panels via `SeasonPanel`) so articles embed the same modules
    team/page.tsx              # P13: Blue Jays over the latest 5 seasons vs the MLB average + 30-club ranks — season strip, ① record & run differential, ② offense, ③ run prevention, ④ trajectory + splits, ⑤ strengths & weaknesses, ⑥ glossary & method; TeamNav tabs on top; SSG, revalidate 3600
    articles/page.tsx          # article list (content/articles registry, newest first; a missing locale is listed in the language it has)
    articles/[slug]/page.tsx   # one article: dynamic import of content/articles/<slug>/<locale>.mdx (falls back to the first locale + notice); byline, date, dataAsOf line, view count (>= MIN_PUBLIC_VIEWS), JSON-LD Article, canonical + hreflang; ArticleEnd (share + discussion) + ViewPing; revalidate 3600 (figures read live data)
    articles/[slug]/opengraph-image.tsx # share card per article per locale (next/og; title, byline, date, wordmark); prerendered — lists its own locale × slug params
    opengraph-image.tsx        # site default share card per locale (wordmark, cap logo, Home.subtitle); inherited by every page without its own
    about/page.tsx             # bio + contact card (#contact: LinkedIn / portfolio / email / X / Instagram when set) + how the data works + sharing credit; JSON-LD Person (no email)
  app/sitemap.ts               # /sitemap.xml: every page in both locales with hreflang alternates (static pages, articles, seasons, all-time roster players); revalidate 1 day
  app/robots.ts                # /robots.txt: allow all but /api/, points to the sitemap
  app/api/views/[slug]/route.ts # POST: +1 article view — registry slugs only, VERCEL_ENV=production only (dev / preview return the count), one parameterized upsert, nothing about the reader stored
  components/
    PlayerNav.tsx              # tabs with `available` prop (compare = >= 2 MLB seasons, P12; bazi slot reserved for v2)
    TeamNav.tsx                # team section tabs (mirrors PlayerNav): Season review -> /season/[year] | Five-season trends -> /team
    SeasonProgressBar.tsx      # batter pace projection / pitcher current-vs-prior
    ScheduleCalendar.tsx       # home schedule (rough.js hand-drawn parchment scorecard)
    ScorecardFrame.tsx         # reusable rough.js parchment frame (hero + roster cards)
    HeroCard.tsx               # "Today's Blue Jays" cards (wraps ScorecardFrame)
    RosterExplorer.tsx         # client roster filter (All/Pitchers/Batters) + all-time active/departed grouping
    SeasonStatTable.tsx        # P9 year-by-year basic+advanced table (overview, batter-only)
    RecentForm.tsx             # P9 Last 7 / Last 30 / Season slash lines (overview)
    GameLog.tsx                # P9 last-10 game log (overview)
    ContactQualityCard.tsx     # P9 Avg/Max EV + Hard-Hit% (reuses computeExitVeloStats; as-a-Jay batted balls)
    SeasonCompareCard.tsx      # P12 generic season A vs B table + Δ chips (per-metric direction, † = net of 2026 zone shift)
    DisciplineCards.tsx        # P12 DisciplineCard / BattedBallProfileCard / PitcherDisciplineCard / ContactCompareCard (015 views; scope prop)
    Exportable.tsx             # P12 M7 wrap any chart -> "PNG ↓" button (exports the largest <svg> inside; generic, P13 reuses)
    TableExport.tsx            # "PNG ↓" (lib/export-table) + "Copy table" (TSV + source line) from plain headers + rows; replaced P12's CopyTableButton (2026-10-04). Pass `name` + `caption` (player tables take an `exportName` prop = player name)
    Footer.tsx                 # site-wide credit + contact strip (navy, mirrors the header); static, never queries the DB
    ContactEmail.tsx           # email as "(at)" text on the server / no-JS, a mailto: link after hydration
    PercentileBars.tsx         # P12 M6 Savant percentile bars (steel -> neutral -> brick), season switch, not-qualified state, batter luck line (wOBA vs xwOBA, Barrel%)
    compare/                   # P12 Compare tab pieces
      CompareControls.tsx      # season / vs / scope Links (URL state, SlidingPill in control frames)
      ClubSplits.tsx           # per-club rows when a season spans a trade
      SeasonArc.tsx            # 2024-2026 small multiples (Recharts, compared seasons highlighted)
      ArsenalCompareTable.tsx  # usage / velo / spin / Whiff% / xwOBAcon A vs B + NEW / DROPPED
      VeloCompareChart.tsx     # primary-FB velo by appearance number, two seasons
      ZoneGrid.tsx             # Savant zone-cell chart (semantic zone, never plate_x/z)
    PitcherSeasonStatTable.tsx # P10 year-by-year pitching line (overview, pitcher-only)
    PitcherRecentForm.tsx      # P10 Last 5 outings / Last 30 / Season (ERA/IP/K/BB/WHIP)
    PitcherGameLog.tsx         # P10 last-10 outings log (overview)
    SketchDefs.tsx             # P11 shared SVG #sketch filter (hand-drawn logo wobble), mounted once in layout
    TeamLogo.tsx               # P11 recoloured cap logo + TeamCell (logo + clinch marker + name)
    StandingsTable.tsx         # P11 one division table (W/L/PCT/GB/WCGB/L10/STRK/RS/RA/DIFF/X-W/L/HOME/AWAY)
    WildCardTable.tsx          # P11 wild card race + cut line (division leaders excluded)
    PlayoffRace.tsx            # P11 AL seeds 1-6 + cut line + chasers
    HomeStandings.tsx          # P11 home module: AL East table + PlayoffRace in ScorecardFrames
    Header.tsx                 # brand = SITE.name; link order from lib/nav.ts NAV_ITEMS; "Team ▾" (Nav.team, after Standings) = TeamMenu, fed getTeamSeasons + getTrendSeasons (P12 linked /season/<latest>, P13 /team); then Nav.articles -> /articles. md+: inline links + LocaleSwitcher; below md: one row = brand · LocaleSwitcher · ☰ (MobileMenu)
    TeamMenu.tsx               # client <details> menu (works without JS, md+ only): TeamLinks = newest season review + earlier-season chips + five-season trends (exported; MobileMenu reuses it with `touch` chips); closes on Escape / outside click / navigation (lib/use-details-menu)
    MobileMenu.tsx             # client: phone ☰ <details> (works without JS) -> full-width papaya panel under the header, every NAV_ITEMS link (44px rows, current section in brick) + TeamLinks inline; navy/30 backdrop closes it; .drop-in entrance
    LocaleSwitcher.tsx         # EN | 中文 pill: current locale filled, the other a plain Link to the same path (one tap, works without JS; query string dropped)
    team/                      # P13 team page modules
      TeamPanel.tsx            # panel ScorecardFrame + heading + plain-English question; PanelBlock (sub-heading + PNG/copy action + note)
      SeasonStrip.tsx          # one card per season (record, finish, postseason result, run diff + rank chip) -> /season/[year]
      RunSourcesChart.tsx      # "where the wins came from": offense / run-prevention runs vs MLB average, stacked from zero, net dot
      LuckTable.tsx            # record vs expected (x-W/L), luck, one-run record, run diff + MLB rank
      RankChip.tsx             # MLB rank chip tinted on the shared percentile scale (ordinal always printed)
      RankKey.tsx              # legend for the rank shading (30th ... 1st)
      RankGrid.tsx             # client: metric × season grid, value + rank heat map, Value | vs MLB toggle, hover/focus card (MLB avg, leader, hint) via ChartTooltip; copy table
      TrendSmallMultiples.tsx  # client: one metric per chart, Jays (brick) vs MLB average (navy dashed), straight segments, nice ticks, PNG each
      ContactLuck.tsx          # per season wOBA vs xwOBA (same .010 threshold as the player luck line)
      RotationBullpenTable.tsx # per season rotation (IP share / ERA / FIP / K-BB%) vs bullpen, each ranked among 30; sticky season column; copy table
      EraFipGap.tsx            # per season ERA − FIP read in plain English (0.15 threshold) + team OAA and rank
      SeasonTrajectoryChart.tsx # client: games above .500 by game number, all window seasons; chips / line click pick the highlight; end labels; PNG of the chart only
      TeamSplitsTable.tsx      # situational records (P12 seasonSplits + Season labels), rows = splits, columns = seasons; copy table
      StrengthsWeaknesses.tsx  # per season up to 3 top-10 / 3 bottom-10 ranks among distinct skills (lib/team-callouts.ts), descriptive labels; copy table; `single` = one season, strengths | weaknesses side by side (season page)
      TeamGlossary.tsx         # method notes + every metric's hint grouped like the grids, in a <details> (works without JS)
    season/                    # P12 M5 season modules (also embedded by article figures)
      SeasonPanel.tsx          # server: one season module — panel ScorecardFrame + Graduate heading + optional TableExport (headers + rows) + note
      SeasonRecordStrip.tsx    # server: record / PCT / RS / RA / run diff / x-W/L / finish / win streak, Δ chips vs prior + RankChips (022 views)
      MonthlyRecordPanel.tsx   # server: month by month — MonthlyRunsChart + record & RS-RA vs prior (Mar -> Apr, Oct -> Sep)
      MonthlyRunsChart.tsx     # client: R/G (brick) vs RA/G (navy) per month + MLB R/G dashed steel; value labels + end labels so the PNG reads without the HTML legend
      SeasonSplitsPanel.tsx    # server: situational records vs prior + longest losing streak; `highlight` rows
      SeasonTrendChart.tsx     # games above .500 / cumulative run diff by game number, prior season dashed
      PositionValueChart.tsx   # client: value by position group — WAR / Off / HR / OPS switch, season vs prior bars | change (grass up / brick down) | vs MLB (HR / OPS only: Jays − MLB at the position from the 025 view, grass above / brick below, rank ordinal on each bar — no rank tint here, brick means "worse" in this chart; WAR / Off fall back to the side-by-side view); PNG caption follows the switch (replaced WarByPositionChart); `initialMetric` / `initialMode` for article figures, pill groups made unique with useId (an article can show it twice)
      PositionVsMlbTable.tsx   # server: HR / OPS at each position + RankChip vs the MLB average (HR = per club) — the 025 view, nothing computed; TableExport in its own sub-heading
      TeamSeasonStats.tsx      # server: the team's season line vs the MLB average + 30-club rank + prior season — offense (run scoring / contact) | run prevention (incl. contact allowed / OAA); P13 buildGrid over the 022 views, nothing computed; `only` = one side, `highlight` = MetricKey rows in brick (article figures)
      PlayerStatsTable.tsx     # client: every Jay's season line, sortable — position players (Offense: slash/HR/RBI/SB/wRC+/Off | Defense: Def/OAA | WAR) and pitchers tabs; All | Regulars (100+ PA / 20+ IP); copy table; leader-card hash jumps (rate stats -> Regulars); "MLB average" row pinned in <tfoot> (rate columns, same 022 MLB row)
    article/
      ArticleEnd.tsx           # server: end-of-article panel — ArticleShare + "Join the discussion" (the article's X / IG post from the registry's `discuss`, else the profile; hidden with neither)
      ArticleShare.tsx         # client: Share on X (intent, via the site handle) / Copy link / native share sheet (useSyncExternalStore, like ContactEmail)
      ViewPing.tsx             # client: POST /api/views once per browser per 24 h (localStorage, guarded); skips navigator.webdriver
      figures.tsx              # MDX figures keyed by season — SeasonRecord / TeamStats / PositionValue / PositionVsMlb / SeasonSplits / MonthByMonth / Figure — live reads through the season page's readers, React cache() per season; no data -> a visible "no data" line
    standings-chrome.ts        # P11 shared table chrome (navy header bar / ledger stripes / rowBg); P13 stripeBg(i, highlight) for any table
    StandingsTabs.tsx          # P11 client view switcher: AL / NL / Wild Card (+ AL-NL toggle inside WC)
    motion/
      MotionProvider.tsx       # MotionConfig (reducedMotion="user"), mounted once in layout
      Reveal.tsx               # Reveal / RevealGroup / RevealItem — scroll-into-view fade + rise
      CountUp.tsx              # KPI number roll-up (plain decimals only — never IP / W-L)
      SlidingPill.tsx          # shared-layout highlight for segmented toggles + PlayerNav underline
      WhenInView.tsx           # defers mounting a Recharts chart until visible (so its draw-in is seen)
    charts/
      ChartTooltip.tsx         # shared animated tooltip for the SVG charts (pairs with use-lingering-hover)
      SprayChart.tsx           # optional secondaryEvents prop for /compare
      SprayChartExplorer.tsx   # client filter wrapper around SprayChart (season chips w/ club labels, month/pitch/outcome/hand)
      PitchingExplorer.tsx     # client filter wrapper: season chips (P12, club labels) + ArsenalTable + PitchMovementChart + PitchZoneHeatmap + VeloTrendChart
      ArsenalTable.tsx         # P10 per-pitch-type usage bar + velo/spin/whiff%/xwOBAcon (replaced PitchDistribution); P12 M6 optional RV/100 column (single full season only)
      PitchMovementChart.tsx   # P10 pfx scatter, pitcher's view (alignment-agnostic); P12 ghostMeans = comparison-season rings + arrows
      VeloTrendChart.tsx       # P10 per-game primary-fastball velo (Recharts line)
      PitchZoneHeatmap.tsx     # pitch-location heatmap (16x20 grid + Gaussian kernel + SVG blur)
      FieldingDiagram.tsx      # primary chip (brick) + secondary chips (steel)
      WarBreakdown.tsx         # batter WAR diverging stacked bar (P7)
      RollingOpsSparkline.tsx  # P9 15-game rolling-OPS trend (Recharts line); P12 M4 optional prior-season dashed line by game number
      RollingEraSparkline.tsx  # P10 5-outing rolling-ERA trend (Recharts line); P12 M4 optional prior-season dashed line by outing number
  lib/
    db.ts                      # postgres.js client (Supavisor transaction pooler: prepare: false + max_pipeline: 0)
    players.ts                 # roster modes + getPlayerAvailability; getPlayer adds is_active_26 + last_jays_position/season; all-time roster: departed players show lastJaysPosition
    season-position.ts         # SQL fragments over web_player_position_splits: seasonPosition (season page readers) / lastJaysPosition (player header + roster cards); most PA, PH / P excluded
    team-position.ts           # post-P13 reader over the 025 view: getTeamPositionVsMlb(season) -> Jays + MLB row per position group; nothing re-derived
    batting.ts / pitching.ts / fielding.ts
    season-stats.ts            # web_player_season_stats (incl. P9 basic line + P10 pitcher line) + batter games-played
    discipline.ts              # P12 015-view readers (batter/pitcher discipline, batted-ball profile, zone reference), scope 'mlb'|'jays'
    season-format.ts           # r3 / signed / wl / streakText — display helpers shared by the season modules
    site.ts                    # SITE (name / author / url / contact links incl. x + instagram / email parts) + sourceLine() + xHandle(): the only place the brand and contacts live
    article-views.ts           # getArticleViews (one query, cached) + publicViews / MIN_PUBLIC_VIEWS (counts stay hidden below 50)
    og.ts                      # share-image helpers: OG_SIZE, hex palette (mirror @theme), loadGoogleFont (css2 text= subset, TTF; null on failure), ogFonts, capLogo
    export-png.ts              # shared PNG back half: papaya paper, brick rule, credit footer (caption | wordmark in Graduate, host · data sources · date), 2x canvas, download
    export-svg.ts              # P12 M7 any <svg> -> PNG: resolves var(--color-*), inlines class paint, rasterises, then export-png
    export-table.ts            # headers + rows -> ledger-style table PNG on a canvas (navy header bar, papaya stripes; numeric columns right-aligned), then export-png. Flat: no per-cell tints
    copy-table.ts              # P12 M7 toTsv (N-N record cells -> en dash so Excel/Sheets don't read dates; optional source line after a blank row) + copyText (clipboard w/ fallback)
    savant.ts                  # P12 M6 readers: percentiles, Savant season (xwOBA / Barrel%), pitch RV/100, league season
    season-deltas.ts           # P12 pure: delta / per-metric tone / 2026 zone-change helpers, biggestChanges (What changed), overlayByGame (M4) — now built on P13's N-series mergeByGame
    batter-game-log.ts         # P9 per-game batting log (web_player_game_stats + web_games), any 2024-2026 season, game_type 'R' only
    batting-form.ts            # P9 pure helpers: summarize / windowByDays (generic) / rollingOps
    pitcher-game-log.ts        # P10 per-appearance pitching log (mirrors batter-game-log; 'R' only)
    pitching-form.ts           # P10 pure helpers: summarizePitching / lastNAppearances / rollingEra
    pitch-arsenal.ts           # P10 pure: PitchEvent type + buildArsenal (whiff%/xwOBAcon) + veloTrend; P12: movementMeans / compareArsenals / zoneDistribution
    compare.ts                 # P12 web_player_team_season_stats readers + clubsBySeason / getSeasonClubLabels ("2026 · TOR/HOU")
    pitch-colors.ts            # P10: shared PITCH_COLOR map (was in PitchDistribution)
    standings.ts               # P11 web_standings + byDivision / wildCardRace / playoffPicture / clinchMarker
    team-season.ts             # P12 M5 PURE (P13 reuses): gamesAboveSeries / runDiffSeries / monthlyRecords / seasonSplits / longestStreak / teamLeaders (WAR/OPS/HR/SB/ERA/WHIP/SO/SV) / positionGroup / offRuns (Off = Bat + BsR) / valueByPosition (PA-share WAR/Off, exact HR/OPS from position splits; PH + P -> DH); P13 postseasonResult
    team-season-data.ts        # P12 M5 DB readers: getTeamSeasons (cached; season-page resolver) / getTeamGames / getTeamPlayerSeasons; getSeasonPlayerStats (season line + box-score G/SO + summed Savant OAA); getTeamPositionSplits; both player readers resolve that season's position via seasonPosition (lib/season-position.ts, not web_players.position)
    season-player-stats.ts     # PURE: splitPlayerStats (isBatter / isPitcher split, Off = Bat+BsR, Def = Fld+Pos, SP/RP role) + column registry + sortRows + leader anchors
    team-trends.ts             # P13 DB readers over the 022 views: getTrendSeasons (latest 5 with 30 clubs) / getTeamTrend (30 clubs + MLB row) / getPostseasonGames
    team-metrics.ts            # P13 display registry (label / format / group / direction / vsMlb) — directions mirror the 022 view ranks; formatMetric / vsMlb / tiedRank
    percentile-color.ts        # shared steel -> neutral -> brick scale: percentileColor (P12 bars) / rankPercentile / rankTint (P13 ranks)
    ordinal.ts                 # 1st / T-3rd, zh-TW 第 1 名 / 並列第 3 名 (season page + team page)
    team-callouts.ts           # P13 PURE: CALLOUT_KEYS (distinct skills) + seasonCallouts (top-10 / bottom-10, ≤ 3 each)
    team-grid.ts               # P13 PURE: 022 rows -> metric × season grid (value, rank, tie, MLB avg, leader, raw count) + toTrends
    team-ids.ts                # TORONTO_TEAM_ID in a db-free module (client components import it; lib/standings re-exports)
    recent-game.ts             # Today's Blue Jays helpers (HR hero, hardest contact, IP/K/H)
    field-geometry.ts          # Rogers Centre SVG paths (exports polar())
    motion.ts                  # motion timing tokens (EASE_SOFT / DUR / STAGGER / SPRING_*)
    ink-draw.ts                # inkify(): split rough.js strokes + stagger a pen draw-in
    use-lingering-hover.ts     # chart hover state that lingers 120ms so tooltips glide, not blink
    use-details-menu.ts        # header <details> menus (TeamMenu / MobileMenu): open per pathname (navigating closes), Escape (focus back to summary) / outside click close
    nav.ts                     # NAV_ITEMS: header link order shared by Header (md+) and MobileMenu (phones)
  messages/
    en.json                    # source of truth
    zh-TW.json                 # translation
  content/articles/
    index.ts                   # registry: slug / date / dataAsOf / locales / title + summary per locale (no frontmatter)
    <slug>/en.mdx, zh-TW.mdx   # article bodies, English first
  mdx-components.tsx           # required by @next/mdx: article typography (headings in Gabriela — sentences, often CJK) + locale-aware internal links + the figure components
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

# C) Just season stats (MLB Stats API; the cron already does the current season):
python etl/pull_season_stats.py --season 2026
```

Full update flow lives in `ETL_update_flow.md`.

Env vars live in `.env` at the repo root (single `DATABASE_URL`). The ETL loads
`.env` from the repo root or `etl/`, whichever exists. See `.env.example`.

---

## Conventions

- **Server components by default.** Fetch from Supabase in server components; only drop to `"use client"` when D3 / interactivity demands it.
- **Pre-aggregate in ETL where possible.** Player season stats go in `web_player_season_stats`; pages should not aggregate 3000 rows on every request.
- **D3 components receive plain JSON props** (`BattedBallEvent[]`), not Supabase clients. Keep them framework-pure for easier testing.
- **No new dependencies without a clear reason.** The stack is intentionally small.
- **Site name, author and contact links live only in `web/lib/site.ts`.** Header, footer, About, layout metadata and every export read `SITE`; the brand is a proper noun and stays English in zh-TW, so it is not in `messages/` (there is no `Nav.brand`). A profile link (`SITE.links.x`, `SITE.links.instagram`) shows up in the footer, About, the Person JSON-LD and the articles' discussion block as soon as it's set; `null` hides it everywhere. X is `x.com/suyujaysnotes` (2026-10-06); Instagram isn't open yet.
- **Articles are MDX in the repo, not a CMS.** Data figures are the live season modules embedded by season (`<TeamStats season={2026} block="offense" highlight={["iso"]} />`), never screenshots; PNG only for non-data images (`web/public/articles/<slug>/`). The text's own numbers are dated by the registry's `dataAsOf`. Add a figure by reusing a season component — don't fork a second copy of a module for articles.
- **`/api/views/[slug]` is the only write path visitors can trigger.** Keep it that narrow: a whitelisted slug, production only, one parameterized statement, no reader data. Anything new that writes from the site needs the same scrutiny (and its own `web_` table with RLS on).
- **In an article, the database wins over the draft.** The author's numbers are a reference: every one is fact-checked against the DB (via `etl/season_report.py`), DB values replace draft values, and a sentence whose claim flips is rewritten minimally and reported. The whole workflow is the project skill `/publish-article` (`.claude/skills/publish-article/SKILL.md`).
- **Keep `max_pipeline: 0` in `web/lib/db.ts`.** Past 10 concurrent queries in one process, postgres.js pipelines onto busy connections; through Supavisor's transaction pooler that leaves backends stuck in `ClientRead`, and later queries on those connections fail with a statement timeout (2026-10-01: `next build` timed out on /season, /team, /standings once the header queried the DB). Any query in `Header.tsx` / the layout runs on every page.

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

The home **schedule calendar** (`ScheduleCalendar.tsx`), the **home hero cards** (`HeroCard.tsx`, "Today's Blue Jays"), and the **roster cards** (`players/page.tsx`) all share one hand-drawn "scorecard" look and are the one piece of chrome allowed to use `grass`/`dirt`: `grass` for the Win badge (vs `brick` for Loss), and `dirt` as the warm "parchment" surface (`bg-dirt/40`) so empty days read as paper (not white) and game days / cards float as lighter `papaya`. The "today" highlight (cell border + `TODAY` badge) is **`steel`** — deliberately *not* `brick`/`grass`, which already mean loss/win. The hand-drawn frame (rough.js, navy outer + faint-navy inner rule `INK_FAINT`) is factored into **`ScorecardFrame.tsx`** — a reusable client wrapper (SVG overlay sized by a `ResizeObserver`, stable per-`seedKey` `seed` so the wobble doesn't shimmer); the hero and roster cards just wrap their content in it. Its `variant="control"` (single tighter line, no shadow/hover) frames the roster's mode + filter segmented toggles so the controls match the cards, and `variant="panel"` (same double-line frame + shadow as `card`, but **no hover lift**) wraps the P11 standings tables — a table isn't clickable, so the lift would signal an affordance that isn't there. The calendar keeps its own overlay (it also draws the per-day game boxes). rough.js needs literal hex strings, so the components re-declare the token hexes as `const NAVY/STEEL/PAPAYA` — keep those in sync with the `@theme` block above. The `bg-dirt/40` surface lives in `ScorecardFrame.tsx` (hero + roster cards) and `ScheduleCalendar.tsx` (calendar panel); change both together.

The **standings tables** (P11) reuse this same vocabulary rather than inventing a second table look: a `panel` `ScorecardFrame` for the parchment + wobbly ink border, the calendar's navy header bar (`bg-navy text-papaya` in `font-display` uppercase) for the column row, and ledger striping in `bg-papaya/70` / `bg-papaya/35` so rows read as ruled scorecard paper. Those class strings live in one place, **`components/standings-chrome.ts`** (`HEAD_ROW` / `TH*` / `TD*` / `rowBg`), so the four standings tables can't drift apart. `rowBg()` returns **one resolved class string** rather than stacking `odd:` and `bg-brick` utilities — equal-specificity utilities are resolved by stylesheet order, not class order, so the Jays highlight would otherwise win or lose at random. `stripeBg(i, highlight)` is the same striping for any other table (P12 season page, P13 team page).

The **P13 team page** (`/team`) adds one more encoding on top of that chrome: an **MLB rank among 30 clubs** is always shown as the ordinal *and* a tint on the site's one good-vs-bad scale — `lib/percentile-color.ts` (steel → neutral → brick via `color-mix`, the same scale as the P12 percentile bars): `rankTint()` for heat-map cells / `RankChip`, `percentileColor()` for bars and the `RankKey` legend. 1st is always best, so for K% / ERA / RA/G the lowest value is brick. Don't introduce a second rank palette; reuse these helpers.

The **browser tab icon** is the recoloured Jays cap, `/team-logos/141.svg`, wired through `metadata.icons` in `app/[locale]/layout.tsx`. The stock create-next-app `app/favicon.ico` was **deleted on purpose** — Next auto-serves that file at `/favicon.ico` by convention, so leaving it would have competed with the SVG.

**Graduate is labels-only, and that includes table captions.** Column abbreviations (`W`, `PCT`, `WCGB`) are labels and take `font-display`; the cut-line caption and the clinch-legend entries are *sentences* and stay in Gabriela — Graduate has no lowercase and would render them as unreadable all-caps.

Typography pairs two Eduardo Tunni faces, both loaded in `app/[locale]/layout.tsx` via next/font. The retro varsity **display** face **Graduate** (`font-display` → `--font-display`) is the **heading layer**: the nav brand wordmark (`Header.tsx`), section headings (`Today's Blue Jays`, `Schedule`), and the calendar chrome (month label / weekday row / day numbers). The serif **Gabriela** (`--font-gabriela`) is everything else — it is the body default (`globals.css`) and is mapped to **both** `--font-sans` and `--font-mono` because Gabriela ships a single 400 style with **no Sans/Mono variants**. So `font-mono` + `tabular-nums` no longer give true monospaced/tabular digits (kept on data cells as a no-op in case a mono is reintroduced); `font-semibold`/`font-bold` render as synthesized faux-bold (Gabriela has only weight 400).

Graduate is an **all-caps slab display face with no true lowercase** — use it only for headings/labels (apply `uppercase`). Never put it on body prose, player names, or paragraph text (they'd render all-caps and tank readability), and never put a hand-drawn font into the calendar cells — 30+ wobbly cells become unreadable; the hand-drawn motif lives in the rough.js lines only.

> Turbopack gotcha: after changing `@theme` in `globals.css`, custom color utilities may not regenerate. Stop dev, delete `web/.next`, restart.

## Motion

The site moves with **one rhythm**: every timing comes from `web/lib/motion.ts`
(`EASE_SOFT` ease-out-quint, `DUR`, `STAGGER`, `SPRING_SOFT`, `SPRING_TOOLTIP`),
mirrored in CSS as `--ease-soft`. Don't hand-tune durations in components.

- **Hovers are 300ms, not 150ms.** `globals.css` overrides Tailwind's
  `--default-transition-duration` / `--default-transition-timing-function`, so
  every plain `transition-colors` is already soft — don't add `duration-150`.
- **Only `ScorecardFrame variant="card"` lifts** (spring y/tilt + deeper shadow).
  `panel` and `control` never move on hover — same affordance rule as above. The
  card shadow lives in the motion `style` (as rgba, offsets first) so it can
  interpolate; don't put a `shadow-[…]` class back on it.
- **Ink draw-in**: `ScorecardFrame` / `ScheduleCalendar` run `inkify()` on
  their rough.js output the first time they scroll into view. Redraws skip when
  the size is unchanged — ResizeObserver's initial callback lands a frame after
  the first draw and would otherwise wipe the animation.
- **Chart marks** use CSS keyframes (`.ball-fly`, `.dot-pop`), not motion
  components — there can be 1,500 of them. Their fill-mode must stay
  **`backwards`**: `both`/`forwards` pins the final transform and kills the
  `.chart-dot[data-hot]` hover scale. Charts hold marks paused (`.anim-paused`)
  until `useInView` says they're visible.
- **Tooltips** on the SVG charts go through `ChartTooltip` +
  `useLingeringHover` — never `hovered && <div>` with `onMouseLeave → null`,
  which blinks between neighbouring dots.
- **Reduced motion**: `MotionConfig reducedMotion="user"` covers motion
  components; the CSS keyframes have their own `prefers-reduced-motion` block;
  Recharts and `CountUp` check `useReducedMotion()`. New animation must do the
  same.
- **No-JS**: `Reveal` SSRs `opacity: 0`. The `<noscript>` rule in the layout
  forces `[data-reveal]` visible — anything new that SSRs hidden needs
  `data-reveal` (or a matching noscript rule). Client tabs hide the inactive
  panel with the `hidden` **class** + `data-tabpanel` (the noscript rule shows
  every panel); never the `hidden` attribute — Tailwind v4's preflight pins it
  with `display:none !important` inside `@layer base`, and a layered
  `!important` beats the unlayered noscript one.

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
| P10 | done | Pitcher deep-dive (en + zh-TW). Overview: KPI (W-L/SV/IP/ERA/WHIP/K%/WAR + plain-language hints), Recent Form (Last 5 outings/30d/Season), 5-outing rolling-ERA sparkline, year-by-year pitching table, last-10 outings log (migration `010`; pitching rows of `web_player_game_stats`). Pitching page: arsenal table (usage/velo/spin/Whiff%/xwOBAcon), pfx movement chart, velo trend (migration `011` + full 2024-2026 Statcast re-backfill adds pfx/xwOBA/count). WHIP/K%/BB% need the FanGraphs pitching **Custom Report** re-export. See `docs/P10_spec.md`. |

| P11 | done | Standings & playoff race (en + zh-TW). `/standings` page: six division tables (AL East first) + AL/NL wild card with a cut line + clinch legend. Home module: AL East table + AL playoff picture, between "Today's Blue Jays" and the calendar. Migration `012` + `etl/pull_standings.py` (nightly, both cron jobs) + one-shot `etl/fetch_team_logos.py` (cap logos recoloured to navy-on-papaya, committed to `web/public/team-logos/`). See `docs/P11_spec.md`. |
| P12 | done | Season review & year-over-year (en + zh-TW). M0: 2024 schedule + 2024/2025 box scores, `web_games.game_type` (`013`), full-MLB 2024–2026 history for the 2026 roster — per-club season lines `web_player_team_season_stats` (`014`, team_id 0 = total) + Statcast `--cohort-season`; 2026 Statcast hole re-pulled. M1: metric views (`015`, scope mlb/jays) + `etl/season_report.py`. M2: discipline + batted-ball cards. M3: Compare tab (`/players/[id]/compare`) + club labels / pitching season filter. M4: prior-season sparkline overlay. M5: `/season/[year]` + `Nav.team`. M6: Savant percentiles / xStats / pitch RV + league averages (`016`–`019`). M7: PNG export + copy-table. See `docs/P12_spec.md` §15 (as built). |
| P13 | done | Team trends (en + zh-TW): `/team` (Nav.team repointed from `/season/<latest>`), the latest five seasons (2022–2026) with every number next to that season's MLB average and the Jays' rank among 30 clubs. N0: all 30 clubs' team data 2022–2026 — `web_team_season_stats` (`020`, MLB Stats API counts + SP/RP split + wRC+/WAR aggregated from per-club player leaderboards) and `web_team_statcast_season` (`021`, Savant team leaderboards) via `pull_team_stats.py` / `pull_team_statcast.py` (refresh cron); standings + schedule 2022–2023. N1: `022` views (one formula set for clubs and the MLB row; FIP from counts + league constant; ranks). N2–N6: season strip, record & run sources, offense / run-prevention rank grids + trends, rotation vs bullpen, ERA vs FIP, five-season trajectory + splits, strengths & weaknesses, glossary; `team_trends.md/.csv` in the article pack. See `docs/P13_spec.md` §14 (as built). |

**Team section (2026-10-01, post-P13):** "Team" is a menu over two views — the single-season review `/season/[year]` (P12) and the five-season trends `/team` (P13) — and both pages carry `TeamNav` tabs. This supersedes P13 T7 (one link → `/team`), which had left the season pages reachable only from the season strip.

**Articles (2026-10-06, post-P13):** `/articles` + `/articles/[slug]` (nav after Team). One `.mdx` per locale under `web/content/articles/<slug>/` (English first), listed in `content/articles/index.ts`. Figures are the season page's modules, extracted into components for this (`SeasonPanel`, `SeasonRecordStrip`, `MonthlyRecordPanel`, `SeasonSplitsPanel`) and read live by season, so an article's charts always match the site; the season page also gained the runs-per-game-by-month chart. New articles go through `/publish-article`. Reach (same day): Vercel Web Analytics, a public view count (`026`, shown from 50 views), share cards (`opengraph-image`), sitemap / robots / hreflang, and share + "Join the discussion" at the end of each article. The site deliberately has no comments; discussion lives on the article's X / Instagram post. Plan: `~/.claude/plans/pasted-content-id-0a6a-1-jazzy-abelson.md`.

v2 (deferred): BaZi personality / fortune / matchup-prediction / injury-risk; daily WAR snapshots for strict same-date pace comparisons; player-vs-player `/compare` page (SprayChart `secondaryEvents` prop is already wired; the per-player season Compare tab shipped in P12). Team-level backlog after P13 (see `docs/P13_spec.md` §13): AL East rival overlay / AL average toggle, park-adjusted pitching (ERA- / FIP-), extra-inning record (needs innings per game), seasons before 2022.
