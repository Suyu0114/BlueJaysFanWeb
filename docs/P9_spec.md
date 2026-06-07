# P9 — Batter Overview Deep-Dive (Year-by-Year · Recent Form · Game Log · Rolling OPS · Contact Quality)

> Handoff spec, written at ship time (reflects the implementation as built).
> Follows the conventions in `CLAUDE.md` (conda env `MLBxBaZi`, `web_` table prefix,
> server-component data fetch, D3/Recharts split, English-first i18n, brand color
> tokens, one concern per migration, no new dependencies). Design decisions were
> locked in a planning chat (`~/.claude/plans/mlb-batter-web-app-locale-players-page-misty-giraffe.md`);
> **do not relitigate them**, but flag any contradiction discovered later rather
> than silently working around it.

---

## 0. Scope

**Committed build (this spec):** five fan-friendly modules on the **individual
batter overview** (`/[locale]/players/[mlbam_id]`), all **batter-only** (the
pitcher overview is untouched):

1. **Year-by-Year table** — last 3 seasons, basic (AVG/OBP/SLG/OPS/HR/RBI/SB/PA) + advanced (wRC+/WAR).
2. **Recent Form** — Last 7 days / Last 30 days / Season slash lines + HR/RBI/SB.
3. **Recent Games** — last-10 per-game log (Date · Opp · Result · AB/H/HR/RBI/BB/K).
4. **Rolling OPS sparkline** — 15-game trailing-window OPS trend (hot/cold streaks).
5. **Contact Quality** — Avg EV / Max EV / Hard-Hit%, scoped to the latest season.

**Out of scope (future):**
- Pitcher-equivalent recent-form module (different stat set).
- Splits vs LHP/RHP at PA grain (box scores aren't split by hand; Statcast only covers batted balls).
- Backfilling 2024/2025 per-game box scores (recent-form/game-log/sparkline stay current-season).
- BaZi, `/compare`, `/predictions` (still v2).

### Decision log (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Source of per-season **basic** stats | **Extend the ETL** — add columns to `web_player_season_stats` (migration `009`) + read them from the existing FanGraphs CSV. Chosen over aggregating from game logs (which only cover the current season). |
| 2 | Extra modules to include | **All three** (game log + rolling-OPS sparkline + contact card), on top of the table + recent form. |
| 3 | Per-game data window | **Current season only** — `web_player_game_stats` is maintained by the nightly box-score ingest for the live season; 2024/2025 are not backfilled. |
| 4 | New season-stat columns type | **`numeric` for all** (incl. counting stats) — matches `008`'s precedent and avoids the psycopg `float`→`int` adaptation pitfall (`_num()` returns `float`). |
| 5 | Short-window OBP | **Omit sacrifice flies** — `web_player_game_stats` has no SF column. `OBP = (H+BB+HBP)/(AB+BB+HBP)`; reads a hair high. Footnoted on the card. The Year-by-Year OBP (from FanGraphs) is exact. |
| 6 | Contact-quality source | **Reuse** `computeExitVeloStats` (`web/lib/exit-velo-stats.ts`, pure) server-side; no new EV logic. |
| 7 | Placement | All five on the **overview** (the landing tab / summary page), not the Batting sub-page. |

---

## 1. Data sources

| Module | Source | Notes |
|---|---|---|
| Year-by-Year table | `web_player_season_stats` | `getSeasonStats` already returns **all** seasons desc — basic line added via `009`. |
| Recent Form / Game Log / Rolling OPS | `web_player_game_stats` ⨝ `web_games` | One fetch (`getBatterGameLog`), derived three ways. Current season, `is_final = true`. |
| Contact Quality | `web_statcast_events` via `getBattedBalls` | Filtered to the latest season in TS, then `computeExitVeloStats`. |

> **No new query for the table.** [`getSeasonStats`](../web/lib/season-stats.ts)
> already fetches every season; the overview previously used only the latest two
> (`pickLatest`). P9 reuses the same array for the 3-row table.

> **Basic stats were already in the CSV.** The FanGraphs Custom Report keeps the
> Dashboard columns, which already include `AVG`/`OBP`/`SLG`/`HR`/`RBI`/`SB`/`PA`.
> Re-running `pull_season_stats.py` on the **existing** 2024/25/26 CSVs populated
> them with no re-export (the importer warns + stores NULL only if absent).

---

## 2. Migration — `db/migrations/009_basic_season_stats.sql`

```sql
-- P9: basic batting stats per season (slash line + counting) for the
-- year-by-year table. OPTIONAL columns (like the war_* block): older CSV → NULL.
-- All numeric to match 008's precedent and dodge the psycopg float->int pitfall.
alter table web_player_season_stats
  add column if not exists avg numeric,  -- batting average (H/AB)
  add column if not exists obp numeric,  -- on-base percentage
  add column if not exists slg numeric,  -- slugging (OPS = obp + slg, already stored)
  add column if not exists hr  numeric,  -- home runs
  add column if not exists rbi numeric,  -- runs batted in
  add column if not exists sb  numeric,  -- stolen bases
  add column if not exists pa  numeric;  -- plate appearances (volume context)
```

Apply: `conda run -n MLBxBaZi python etl/apply_migration.py db/migrations/009_basic_season_stats.sql`.
After: `web_player_season_stats` = **24 columns** (was 17). See `docs/DATA_MODEL.md`.

---

## 3. ETL — `etl/pull_season_stats.py` (extend)

Add a `BASIC_STAT_COLS` map next to `WAR_COMPONENT_COLS`, with the **same
optional handling** (warn + NULL if absent, `coalesce` on upsert so a stripped
CSV never wipes data). `OPS` is already in `REQUIRED_COLS`.

```python
# P9: basic batting stats (slash line + counting) for the year-by-year table.
BASIC_STAT_COLS = {
    "AVG": "avg", "OBP": "obp", "SLG": "slg",
    "HR": "hr", "RBI": "rbi", "SB": "sb", "PA": "pa",
}
```

Wiring (mirrors the Value columns): detect `basic_present`/`basic_missing` and
warn; in the batter loop set `entry[BASIC_STAT_COLS[h]] = _num(r.get(h))` for
present headers; extend `UPSERT_SQL` (insert list + values + `coalesce` lines);
add the 7 keys to the `entry.setdefault(..., None)` block.

> **No new ETL scripts. No cron change.** P9 reuses the existing season-stat
> ingest and the existing nightly box-score job (which already keeps
> `web_player_game_stats` current). The basic line rides the same CSV.

---

## 4. Web (Next.js)

### lib
- [`season-stats.ts`](../web/lib/season-stats.ts) (extend): add `avg/obp/slg/hr/rbi/sb/pa` to `SeasonStats` and the `select` (rates `::float8`, counting `::int`).
- [`batter-game-log.ts`](../web/lib/batter-game-log.ts) (new): `getBatterGameLog(mlbamId, season) -> BatterGameRow[]`. Joins `web_player_game_stats` ⨝ `web_games`, `stat_group='batting'`, `is_final`, ordered oldest→newest. Reuses the join pattern from `lib/games.ts::getGameBoxscore`.
- [`batting-form.ts`](../web/lib/batting-form.ts) (new, **pure / no DB** — unit-testable):
  - `summarize(rows) -> BattingSplit` — sums counting stats and computes the slash line (formulas in §6).
  - `windowByDays(rows, days, asOf)` — rolling calendar window (`game_date > asOf − days`); `asOf` = today (page render date, UTC).
  - `rollingOps(rows, window=15) -> {date,ops}[]` — trailing-window OPS per game; returns `[]` when there are fewer than `window` games (sparkline hidden).

### components (server unless noted)
- [`SeasonStatTable.tsx`](../web/components/SeasonStatTable.tsx) — last 3 of `SeasonStats[]`: `Season | PA | HR | RBI | SB | AVG | OBP | SLG | OPS | wRC+ | WAR`. NULL → "—". No new query.
- [`RecentForm.tsx`](../web/components/RecentForm.tsx) — three columns (Last 7 / Last 30 / Season), each a slash line + `G · HR · RBI · SB`; SF-approximation footnote.
- [`GameLog.tsx`](../web/components/GameLog.tsx) — last 10 (most-recent first): `Date | Opp | Result | AB | H | HR | RBI | BB | K`. `Opp = (is_home?'vs':'@') + opponent_name`; result W/L colored **grass/brick** (the calendar's win/loss convention).
- [`ContactQualityCard.tsx`](../web/components/ContactQualityCard.tsx) — Avg EV / Max EV / Hard-Hit% from `computeExitVeloStats`; self-hides when `withEV === 0`.
- [`charts/RollingOpsSparkline.tsx`](../web/components/charts/RollingOpsSparkline.tsx) — **`"use client"`** Recharts `LineChart`, brick stroke, hidden axes, tooltip; self-hides on empty data.

### page wiring — [`players/[mlbam_id]/page.tsx`](../web/app/[locale]/players/[mlbam_id]/page.tsx)
Gate everything on `isBatter = role === "batter" && latest != null`. Batter-only
`Promise.all([getBatterGameLog(...), getBattedBalls(...)])`, then compute
`last7/last30/seasonSplit`, `rolling`, `recentGames` (last 10 reversed), `evStats`
(season-filtered). **Render order:**

```
KPI cards → RecentForm → RollingOpsSparkline → SeasonProgressBar
         → SeasonStatTable → ContactQualityCard → WarBreakdown → GameLog
```

RecentForm is additionally gated on `gameLog.length > 0`; the sparkline, contact
card, and game log self-hide when empty (so departed players still get the table).

**Colors:** brand tokens only (`brick` sparkline line; `grass`/`brick` W/L —
allowed for this win/loss chrome per CLAUDE.md §theme).

---

## 5. i18n — `web/messages/{en,zh-TW}.json` → `"Overview"` namespace

New keys (prose translated; **stat abbreviations stay English** in both locales):
`statTableTitle`, `recentFormTitle`, `last7`, `last30`, `noRecentGames`,
`obpApproxNote`, `rollingOpsTitle`, `contactTitle`, `contactSubtitle`,
`gameLogTitle`, `colDate`, `colOpp`, `colResult`. The contact card also reuses the
existing `Batting.avgEV` / `maxEV` / `hardHitPct` keys.

> AVG/OBP/SLG/OPS/HR/RBI/SB/PA/wRC+/WAR/AB/H/BB/K and `Avg EV`/`Max EV`/`Hard-Hit%`
> are baseball jargon → English in `zh-TW` too.

---

## 6. Formulas & conventions

From summed counting stats (nulls treated as 0):

```
AVG = H / AB
OBP = (H + BB + HBP) / (AB + BB + HBP)      # SF omitted (no SF column); IBB ⊂ BB
TB  = H + 2B + 2*3B + 3*HR
SLG = TB / AB
OPS = OBP + SLG
```

- **Slash formatting:** drop the leading zero on sub-1.000 rates (`.308`); keep it
  when ≥ 1.000 (`1.002`). Implemented as `avg3()` in the table/form/sparkline.
- **Recent-form window:** `game_date > (today − N days)` — a rolling N-day window
  ending at the render date; empty window → "No games in this window."
- **Rolling OPS:** trailing 15-game window; the page hides the chart for < 15 games.

---

## 7. What NOT to change

| Item | Reason |
|---|---|
| Cron / `.github/workflows/etl.yml` | No new refresh; nightly box-score job already feeds `web_player_game_stats`. |
| `web/lib/exit-velo-stats.ts` | Reused as-is (pure, server-callable). |
| `web/lib/batting.ts` | `getBattedBalls` already returns `launch_speed`/`launch_angle` + `game_date`. |
| Pitcher overview | All new modules are batter-only; pitcher branch unchanged. |

---

## 8. Discrepancies / observations found

| # | Observation | Impact |
|---|---|---|
| 1 | The 2026 FanGraphs CSV can carry full-season / projected figures (e.g. Vladdy `PA = 925`). The **Year-by-Year table + KPI cards read the CSV**, while **Recent Form / Game Log read real per-game box scores** — so if a 2026 CSV is full-season rather than to-date, those two sections can look out of step. | Data-content, not code. Keep the in-season `batting_2026.csv` to-date. |
| 2 | `next-intl` ships the whole `Overview` message bundle to the client (for the sparkline's `useTranslations`), so module **title strings** appear in the HTML payload even on pitcher pages where the components don't render. | Don't grep translated strings to test gating — check rendered structure (e.g. the `min-w-[34rem]` table markup or `>ERA<` vs `>OPS<` KPI labels). |
| 3 | CLAUDE.md folder layout previously described the overview as "KPI cards + SeasonProgressBar"; updated in this change to list the P9 modules. | Resolved (CLAUDE.md updated). |

---

## 9. Done-when checklist

| # | Criterion |
|---|---|
| 1 | `web_player_season_stats` has `avg/obp/slg/hr/rbi/sb/pa` (migration `009` applied; 24 columns live). |
| 2 | `pull_season_stats.py` populates the basic line from the FanGraphs CSV (warn + NULL if absent; `coalesce` keeps existing values). |
| 3 | Batter overview (en + zh-TW) shows Year-by-Year, Recent Form, Recent Games, Rolling OPS, Contact Quality. |
| 4 | Year-by-Year matches the FanGraphs/BBRef reference (e.g. Vladdy 2024 `.323/.396/.544/.940`, 30 HR, 103 RBI, 164 wRC+, 5.3 WAR). |
| 5 | Pitcher overview shows **no** batter modules (ERA/FIP/K9 branch only). |
| 6 | Stat abbreviations stay English in zh-TW; only chrome/prose translated. |
| 7 | No ad-hoc hex — brand tokens only. No new npm dependencies. |
| 8 | Graceful degradation: NULL basic cells render "—"; sparse/no game-log → modules hide; the page never crashes. |

---

## 10. Verification plan (as run)

### Automated
- `pnpm -C web exec tsc --noEmit` — clean.
- `pnpm -C web lint` — clean (one pre-existing unrelated `SprayChart` warning).

### Data
- Apply `009`; dump `information_schema.columns` for `web_player_season_stats` → 24 cols, the 7 new ones present.
- `python etl/pull_season_stats.py --season {2024,2025,2026}` — no "basic stat column(s) absent" warning; spot-check Vladdy (`665489`) rows.

### Web (dev smoke)
- `GET /en/players/665489` → 200; Year-by-Year renders real values; all five modules present.
- `GET /zh-TW/players/665489` → section titles translated (逐年成績 / 近期狀態 / 近期出賽 / 滾動 OPS / 擊球品質).
- `GET /en/players/{pitcher}` → `>ERA<` KPI present, zero `min-w-[34rem]` table markup (no batter modules).

---

## 11. Candidate backlog (not built in P9)

| Candidate | Data dependency | Note |
|---|---|---|
| Exact short-window OBP (incl. SF) | Add a `sf` column to `web_player_game_stats` (boxscore has it) **or** count `event='sac_fly'` from Statcast | Current OBP omits SF — a few-thousandths overstatement |
| Multi-season Recent Form / Game Log | Backfill 2024/2025 box scores into `web_player_game_stats` | Currently current-season only |
| Pitcher recent-form module | Same `web_player_game_stats` (pitching rows already stored) | Different stat set (ERA/IP/K window) |
| Splits vs LHP/RHP (PA grain) | Not derivable from box scores; Statcast only covers batted balls | Deferred — incomplete at PA level |
