# P10 — Pitcher Deep-Dive (Season Line · Recent Form · Game Log · Rolling ERA · Arsenal · Movement · Velo Trend)

> Handoff spec, written at **plan time** and **reconciled against the build at
> ship time (2026-07-08)** — see §10 for the as-built deltas.
> Follows the conventions in `CLAUDE.md` (conda env `MLBxBaZi`, `web_` table prefix,
> server-component data fetch, D3/Recharts split, English-first i18n, brand color
> tokens, one concern per migration, no new dependencies). Design decisions were
> locked in a planning chat (`~/.claude/plans/twinkling-petting-rocket.md`, which
> also holds the P11 direction: batting-page storytelling + roster stat cards +
> fielding polish); **do not relitigate them**, but flag contradictions rather
> than silently working around them.

---

## 0. Scope

**Committed build (this spec):** turn the pitcher experience from a stub into a
full deep-dive, in two places:

**A. Pitcher overview** (`/[locale]/players/[mlbam_id]`, pitcher branch — today
only 4 hardcoded KPI cards + SeasonProgressBar):

1. **KPI cards** — W-L · IP · ERA · WHIP · K% · WAR (+ SV card only when `sv > 0`;
   FIP moves into the year-by-year table), each with a one-line plain-language
   hint (i18n) — the "junior analyst" voice.
2. **Year-by-Year table** — last 3 seasons: W-L / SV / GS / IP / ERA / WHIP / K% / BB% / FIP / WAR.
3. **Recent Form** — Last 5 appearances / Last 30 days / Season: G · IP · ERA · WHIP · K · BB.
4. **Game Log** — last 10 appearances: Date · Opp · Result · Dec · IP · H · R · ER · BB · K · HR · P.
5. **Rolling ERA sparkline** — trailing-5-appearance aggregate ERA trend.

**B. Pitching sub-page** (`/[locale]/players/[mlbam_id]/pitching` — today pitch
mix bars + zone heatmap):

1. **Arsenal table** (replaces `PitchDistribution`) — per pitch type:
   Usage (inline bar + %) · # · Velo · Spin · Whiff% · xwOBA on contact.
2. **Pitch movement chart** (new) — Savant-style pfx scatter, pitcher's view.
3. **Zone heatmap** — kept as-is (single-alignment invariant unchanged).
4. **Velocity trend** (new) — per-game primary-fastball velo, latest season
   (health/fatigue story).
5. Plain-language story captions (i18n) under every section.

**ETL groundwork (this phase):** migrations `010` (pitcher season line) + `011`
(Statcast pitch detail), season-stats importer extension, Statcast writer
extension, and a **full 2024–2026 re-backfill** to populate the new columns.

**Out of scope (P11 / later):**
- Batting-page storytelling, roster stat cards, fielding polish (P11 — see plan file).
- Whiff/usage by count situation (`balls`/`strikes` land in the DB now, module deferred).
- Backfilling 2024/2025 per-game box scores (recent form/game log/rolling stay current-season, mirroring P9).
- Pitcher WAR decomposition (FIP-based WAR doesn't decompose — `WarBreakdown` stays batter-only).

### Decision log (locked)

| # | Decision | Choice |
|---|---|---|
| D1 | Rolling trend metric | **Trailing-5-appearance ERA** — aggregate `9·ΣER/(Σouts/3)` over the window (IP-weighted, **not** a mean of per-game ERAs). ERA is the one pitching stat casual fans read fluently; K-BB% rejected as unfamiliar. Hidden below 5 appearances (mirrors `rollingOps`). |
| D2 | Velocity trend placement | **Pitching sub-page** — it derives from the Statcast rows the page already fetches; the overview stays box-score/CSV-driven (no second Statcast query). |
| D3 | PitchDistribution vs arsenal | **Replace** — `ArsenalTable` absorbs the usage bars as an inline column; `PitchDistribution.tsx` deleted; `PITCH_COLOR`/`PitchEvent` move to shared homes. |
| D4 | "xwOBA against" metric | **xwOBA on contact** (mean `estimated_woba` over `description = 'hit_into_play'`), labeled honestly — `estimated_woba` is NULL on non-contact, so true per-pitch xwOBA isn't derivable. Whiff% in the adjacent column completes the story. |
| D5 | Count-situation splits | **Deferred** — data lands (`balls`/`strikes`), module doesn't. Avoid page overload. |
| D6 | Pitcher KPI set | **W-L · IP · ERA · WHIP · K% · WAR** (+ conditional SV). FIP demoted to the table where the analyst voice can explain it. KPI hints are the i18n-ification of the previously hardcoded labels. |
| D7 | Build order | Migrations → ETL edits → kick off re-backfill (hours, background) → box-score/CSV web modules in parallel → Statcast charts last. All web code NULL-tolerant regardless. |
| D8 | CSV reality (verified) | Existing `pitching_{2024,2025,2026}.csv` (Dashboard preset) have `W,L,SV,G,GS,IP,K/9,BB/9,ERA,FIP,WAR` but **lack `WHIP`,`K%`,`BB%`** → one-time re-export as FanGraphs **Custom Report** (Dashboard + WHIP + K% + BB%), same filenames. All 8 new columns optional (warn + NULL + coalesce): W-L/SV/GS/IP work day one, WHIP/K%/BB% fill on re-export. FanGraphs exports percentages as **raw fractions** (`0.245`) → store as-is, ×100 at display. FanGraphs `IP` is baseball notation (`170.1` = 170⅓) → **display-only**; arithmetic IP always from `outs_recorded`. |

---

## 1. Data sources

| Module | Source | Notes |
|---|---|---|
| KPI cards / Year-by-Year | `web_player_season_stats` | `getSeasonStats` already returns all seasons desc; pitcher line added via `010`. |
| Recent Form / Game Log / Rolling ERA | `web_player_game_stats` (`stat_group='pitching'`) ⨝ `web_games` | Pitching rows **already exist** (007): `outs_recorded, bf, p_h, p_r, er, p_bb, p_so, p_hr, pitches, strikes, decision`. One fetch (`getPitcherGameLog`), derived three ways. Current season, `is_final = true`. |
| Arsenal / Movement / Velo trend | `web_statcast_events` via `getPitches` | Whiff from `description`; velo/spin already stored; movement + xwOBA arrive via `011` + re-backfill. |

---

## 2. Migrations

### `db/migrations/010_pitching_season_stats.sql`

```sql
-- P10: pitcher season line for KPI cards + year-by-year table. OPTIONAL columns
-- (like 009's basic batting block): absent CSV header -> warn + NULL.
-- All numeric per 008/009 precedent (dodges the psycopg float->int pitfall).
alter table web_player_season_stats
  add column if not exists w      numeric,  -- wins
  add column if not exists l      numeric,  -- losses
  add column if not exists sv     numeric,  -- saves
  add column if not exists gs     numeric,  -- games started (starter/reliever signal)
  add column if not exists ip     numeric,  -- FanGraphs baseball notation: 170.1 = 170 1/3. DISPLAY ONLY — never sum/divide
  add column if not exists whip   numeric,  -- (H+BB)/IP
  add column if not exists k_pct  numeric,  -- strikeout rate, raw fraction (0.245) as exported by FanGraphs
  add column if not exists bb_pct numeric;  -- walk rate, raw fraction
```

After: `web_player_season_stats` = **32 columns** (was 24).

### `db/migrations/011_statcast_pitch_detail.sql`

```sql
-- P10: per-pitch detail for the movement chart, xwOBA-on-contact, and future
-- count-based modules. Populated by the 2024-2026 re-backfill; older rows NULL
-- until re-pulled. NOTE: `strikes` here is the count BEFORE the pitch (0-2) —
-- unrelated to web_player_game_stats.strikes (strikes thrown in a game).
alter table web_statcast_events
  add column if not exists pfx_x             numeric,  -- horizontal movement, FEET, catcher's perspective (raw Savant)
  add column if not exists pfx_z             numeric,  -- vertical movement vs spinless pitch, FEET
  add column if not exists release_extension numeric,  -- feet toward home at release
  add column if not exists estimated_woba    numeric,  -- estimated_woba_using_speedangle; batted balls only, NULL otherwise
  add column if not exists balls             int,      -- count before the pitch (0-3)
  add column if not exists strikes           int;      -- count before the pitch (0-2)
```

After: `web_statcast_events` = **29 columns** (was 23).

Apply both: `conda run -n MLBxBaZi python etl/apply_migration.py db/migrations/010_....sql` (then `011`).

---

## 3. ETL

### `etl/pull_season_stats.py` (extend — mirrors P9's `BASIC_STAT_COLS` recipe)

```python
# P10: pitcher season line. WHIP/K%/BB% require the Custom Report re-export
# (Dashboard preset lacks them) — optional handling covers the gap.
PITCHING_STAT_COLS = {
    "W": "w", "L": "l", "SV": "sv", "GS": "gs", "IP": "ip",
    "WHIP": "whip", "K%": "k_pct", "BB%": "bb_pct",
}
```

Wiring: detect present/missing against `pit.columns` (warns for WHIP/K%/BB%
until re-export — expected); in the pitching loop set
`entry[PITCHING_STAT_COLS[h]] = _num(r.get(h))`; extend `UPSERT_SQL` (insert
list + values + `coalesce` lines) and the `entry.setdefault(..., None)` block.
`_num()` needs no change (fractions and `170.1` parse as-is).

### `etl/db.py` + `etl/pull_statcast.py`

- `STATCAST_COLUMNS` += `pfx_x, pfx_z, release_extension, estimated_woba, balls, strikes`
  (invariant #6: hardcoded list — nothing writes without this).
- `COLUMN_RENAMES` += `"estimated_woba_using_speedangle": "estimated_woba"`
  (the other five arrive under their own names).
- `normalize()`: add `balls, strikes` to the `Int64` cast loop.
- `pull_pitcher.py` imports `normalize` from `pull_statcast` → no edit.

### Re-backfill (idempotent on the 5-col upsert key; row counts must not change)

```
python etl/pull_season_stats.py --season 2024        # then 2025, 2026; re-run after CSV re-export
python etl/pull_statcast.py --all-batters  --season 2024 --start 2024-03-28 --end 2024-09-29
python etl/pull_pitcher.py  --all-pitchers --season 2024 --start 2024-03-28 --end 2024-09-29
python etl/pull_statcast.py --all-batters  --season 2025 --start 2025-03-27 --end 2025-11-05 --include-postseason
python etl/pull_pitcher.py  --all-pitchers --season 2025 --start 2025-03-27 --end 2025-11-05 --include-postseason
python etl/pull_statcast.py --all-batters  --season 2026 --start 2026-03-26 --end <today>
python etl/pull_pitcher.py  --all-pitchers --season 2026 --start 2026-03-26 --end <today>
```

**No cron change** — the nightly 7-day window fills the new columns automatically
once `STATCAST_COLUMNS` is extended.

**Manual step (user):** re-export the 3 pitching CSVs from FanGraphs as a Custom
Report = Dashboard columns + `WHIP` + `K%` + `BB%`, same filenames, then re-run
`pull_season_stats.py` per season. Documented in `ETL_update_flow.md`.

---

## 4. Web (Next.js)

### lib
- [`season-stats.ts`](../web/lib/season-stats.ts) (extend): add `w/l/sv/gs/ip/whip/k_pct/bb_pct` to `SeasonStats` + select (`::float8`).
- [`pitcher-game-log.ts`](../web/lib/pitcher-game-log.ts) (new; mirrors `batter-game-log.ts`): `getPitcherGameLog(mlbamId, season) -> PitcherGameRow[]` — `stat_group='pitching'`, `is_final`, oldest→newest; aliases `p_h→h, p_r→r, p_bb→bb, p_so→so, p_hr→hr`; includes `outs_recorded, bf, er, pitches, decision` + game join fields.
- [`pitching-form.ts`](../web/lib/pitching-form.ts) (new, **pure / no DB**):
  - `summarizePitching(rows) -> PitchingSplit` — sums `outs/er/h/bb/so/hr/bf`; `era = 9·er/(outs/3)`, `whip = (h+bb)/(outs/3)`; **`outs === 0` → null** (render "—", never Infinity/NaN).
  - `lastNAppearances(rows, n)` — tail slice (**appearances, not starts** — reliever-safe).
  - `rollingEra(rows, window = 5) -> {date, era}[]` — trailing-window aggregate ERA; `[]` below window.
  - Reuses `windowByDays` from `batting-form.ts`, genericized to `<T extends { game_date: string }>` (tiny safe refactor).
- [`pitching.ts`](../web/lib/pitching.ts) (extend `getPitches` select): `spin_rate::float8, description, pfx_x, pfx_z, estimated_woba` (movement rounded to 3 decimals in SQL to trim payload). Keeps `game_type = 'R'`.
- [`pitch-arsenal.ts`](../web/lib/pitch-arsenal.ts) (new, pure): `buildArsenal(pitches) -> ArsenalRow[]` (count, usage%, avgVelo, avgSpin, whiff%, xwOBAcon per pitch type) + `veloTrend(pitches)` (per-game avg velo of the primary fastball — highest-usage among FF/SI/FC/FT, fallback top-usage overall — latest season). Whiff/swing description sets are documented constants (Savant convention: whiffs = `swinging_strike, swinging_strike_blocked, foul_tip, missed_bunt`; swings add `foul, hit_into_play, foul_bunt, bunt_foul_tip`).
- [`pitch-colors.ts`](../web/lib/pitch-colors.ts) (new): `PITCH_COLOR`/`colorFor()` moved out of `PitchDistribution.tsx`; `PitchEvent` type rehomed.

### components (server unless noted)
- [`PitcherSeasonStatTable.tsx`](../web/components/PitcherSeasonStatTable.tsx) — last 3 seasons: `Season | W-L | SV | GS | IP | ERA | WHIP | K% | BB% | FIP | WAR`. `k_pct` displayed `(v*100).toFixed(1)%`; `ip` via `toFixed(1)` (already baseball notation); NULL → "—".
- [`PitcherRecentForm.tsx`](../web/components/PitcherRecentForm.tsx) — Last 5 appearances / Last 30 days / Season: `G · IP · ERA · WHIP · K · BB`; IP from summed outs via `formatInningsPitched` (`web/lib/games.ts`). Exact (no SF-style footnote — box-score ER/outs are exact).
- [`PitcherGameLog.tsx`](../web/components/PitcherGameLog.tsx) — last 10 appearances, most-recent first; `vs`/`@` + grass/brick W-L chrome reused from `GameLog.tsx`.
- [`charts/RollingEraSparkline.tsx`](../web/components/charts/RollingEraSparkline.tsx) — **`"use client"`** Recharts line mirroring `RollingOpsSparkline`; caption states **lower is better**; self-hides on `[]`.
- **KpiCard** (in overview `page.tsx`) — optional `hint` prop: small plain-language line under the value.

### pitching sub-page (client work inside [`PitchingExplorer.tsx`](../web/components/charts/PitchingExplorer.tsx))
- Filters unchanged: Month / Pitch type / Batter hand / Zone-coords alignment toggle.
- [`ArsenalTable.tsx`](../web/components/charts/ArsenalTable.tsx) (new, replaces `PitchDistribution.tsx`) — computed from the *filtered* rows via `buildArsenal`; usage bar inline; alignment-agnostic → cross-season safe; xwOBA column labeled "on contact".
- [`PitchMovementChart.tsx`](../web/components/charts/PitchMovementChart.tsx) (new client SVG, follows `ExitVeloChart.tsx`'s pattern): x = `-pfx_x·12`, y = `pfx_z·12` (inches, **pitcher's view** — sign flip commented once); shared `PITCH_COLOR`; faint per-pitch points + bold per-type mean markers; 0/0 crosshair ("a pitch with no spin"). pfx is release-frame → **alignment-agnostic** (stated in header comment).
- [`PitchZoneHeatmap.tsx`] — unchanged.
- [`VeloTrendChart.tsx`](../web/components/charts/VeloTrendChart.tsx) (new client Recharts line): per-game primary-fastball velo, latest season, y-domain padded ±2 mph, hidden < 5 games.
- Layout: Arsenal (full width) → Movement | Location grid → Velo trend; story caption under each; Graduate/uppercase headings; brand tokens only.

### overview wiring — [`players/[mlbam_id]/page.tsx`](../web/app/[locale]/players/[mlbam_id]/page.tsx)
Keep role detection. Gate on `isPitcher = role === "pitcher" && latest != null`.
Pitcher branch fetches `getPitcherGameLog(id, latest.season)`; derives
`last5 / last30 / seasonSplit / rolling / recentApps`. **Render order (mirrors batter):**

```
KPI cards → PitcherRecentForm → RollingEraSparkline → SeasonProgressBar
         → PitcherSeasonStatTable → PitcherGameLog
```

RecentForm additionally gated on `log.length > 0`; sparkline/log self-hide.
Departed pitchers (no current-season box scores) still get KPI + table.

---

## 5. i18n — `web/messages/{en,zh-TW}.json` (stat abbreviations stay English in both)

- **`Overview`**: `pitcherStatTableTitle`, `pitcherRecentFormTitle`, `pitcherGameLogTitle`,
  `lastNApp` (ICU `{n}`), `rollingEraTitle`, `rollingEraNote`, `colDec`, `colPitches`,
  KPI hints `kpiHintWl / kpiHintSv / kpiHintIp / kpiHintEra / kpiHintWhip / kpiHintKPct / kpiHintWar`.
- **`Pitching`**: `arsenalTitle`, `arsenalStory`, `colUsage`, `colSpin`, `colWhiff`,
  `colXwobaCon`, `xwobaConNote`, `movementTitle`, `movementStory`, `axisHorzBreak`,
  `axisVertBreak`, `pitcherViewNote`, `veloTrendTitle`, `veloTrendStory`, `locationStory`
  (existing `colCount`/`colAvgVelo` reused by the arsenal table).

---

## 6. Formulas & conventions

```
IP display   = formatInningsPitched(Σ outs)          # "5.2" = 5 2/3; never arithmetic on the notation
ERA          = 9 · Σ ER / (Σ outs / 3)               # null when Σ outs = 0
WHIP         = (Σ H + Σ BB) / (Σ outs / 3)           # null when Σ outs = 0
Rolling ERA  = ERA over trailing 5 appearances       # aggregate, not mean of game ERAs
Whiff%       = whiffs / swings                        # description sets above
Usage%       = pitches of type / all pitches (filtered)
xwOBAcon     = mean(estimated_woba | hit_into_play)   # "on contact" — NULL off contact
K% / BB%     = stored as fraction; display ×100
```

---

## 7. What NOT to change

| Item | Reason |
|---|---|
| Cron / `.github/workflows/etl.yml` | Nightly 7-day window + boxscore job already cover the new columns post-ETL-edit. |
| `PitchZoneHeatmap.tsx` + alignment invariant | New charts read release-frame fields (`pfx_*`, `release_speed`) — alignment-agnostic. Only the heatmap consumes plate coords; the explorer's alignment scoping stays as-is. Any **future** count/location module must scope alignment itself. |
| Role-detection heuristic (two-way → batter) | Accepted: two-way players keep the batter overview; the pitching sub-page still gives full pitcher treatment. |
| `WarBreakdown` | Stays batter-only (pitcher WAR doesn't decompose). |
| Batter overview modules | Untouched by P10. |

---

## 8. Done-when checklist

| # | Criterion |
|---|---|
| 1 | Migrations applied: `web_player_season_stats` = 32 cols, `web_statcast_events` = 29 cols. |
| 2 | `pull_season_stats.py` populates W/L/SV/GS/IP from existing CSVs (warns WHIP/K%/BB% absent until re-export; fills them after). |
| 3 | Re-backfill done: per-season row counts unchanged; `pfx_x` ≈ fully populated; `estimated_woba` non-null only on batted balls. |
| 4 | Pitcher overview (en + zh-TW) shows KPI (W-L/IP/ERA/WHIP/K%/WAR, +SV when relevant, hints), Recent Form, Rolling ERA, Year-by-Year, Game Log. |
| 5 | Year-by-Year matches FanGraphs (spot-check Gausman 592332). |
| 6 | Pitching page: arsenal usage/velo/whiff within ~1% of Savant's player page; movement plot shape matches Savant (x-sign mirror-checked); heatmap unchanged. |
| 7 | Batter overview (e.g. Vladdy 665489) shows **zero** pitcher modules (check structure, not strings — P9 §8.2). |
| 8 | `outs_recorded = 0` appearance renders "0.0 IP" / "—" ERA — no NaN/Infinity anywhere. |
| 9 | Stat abbreviations English in zh-TW; brand tokens only; no new npm dependencies. |
| 10 | `pnpm -C web exec tsc --noEmit` + `pnpm -C web lint` clean; docs reconciled per `DOC_MAINTENANCE.md`. |

---

## 9. Candidate backlog (not built in P10)

| Candidate | Data dependency | Note |
|---|---|---|
| Whiff%/usage by count (ahead/behind/2-strike) | `balls`/`strikes` (landing now) | Deferred to avoid page overload. |
| Per-pitch run value / true xwOBA against | `delta_run_exp` (not pulled) or wOBA constants | xwOBAcon + Whiff% chosen instead (D4). |
| Pitcher recent form across seasons | 2024/2025 box-score backfill | Mirrors P9 batter limitation. |
| Release-point chart | `release_pos_x/z` (not pulled) | Movement + extension cover the "stuff" story for now. |

---

## 10. Reconciliation — as built (2026-07-08)

Everything above shipped as specified. Deltas and observations found during the build:

| # | Observation | Impact |
|---|---|---|
| 1 | **`estimated_woba` is NOT contact-only in the raw feed.** Savant also fills it on PA-ending non-contact pitches (K/BB/HBP) with the event's wOBA constant (~11k such rows post-backfill). | The `description = 'hit_into_play'` gate in `lib/pitch-arsenal.ts` (decision D4) already excludes them — xwOBAcon is unaffected. Documented in `DATA_MODEL.md` on the column. Any future consumer must gate the same way. |
| 2 | The re-backfill took **~25 minutes**, not hours (Savant CSV fetches are fast). Verified after: `pfx_x` ≈ 99% populated per season (small residue = untracked pitches), `balls`/`strikes` = 100%, `estimated_woba` on ~25% of rows. A strict before/after row-count diff was **not** captured — the 5-column unique upsert key is what guarantees no duplication; 2026 also legitimately grew (end date extended to 2026-07-08). | None. Idempotency held. |
| 3 | Arsenal sanity check ran against the **DB**, not Savant's page: Gausman 2026 = FF 51.2% usage / 93.8 mph / 17.8% whiff, FS 38.7% / 83.9 / **39.9% whiff**, SL 10.0% / 36.2% — consistent with his profile (elite splitter). The formal "within ~1% of Savant" eyeball is still worth doing once in a browser. | Low. Whiff/swing sets follow the Savant convention as specced. |
| 4 | Game-log headers `DEC` and `P` are **static English** (like AB/H/HR), not i18n keys — the specced `colDec`/`colPitches` keys were dropped as unnecessary jargon-column labels. | Fewer keys; consistent with `GameLog.tsx`. |
| 5 | `Pitching.title` changed from "Pitch Mix" to **"Pitching Breakdown"** (zh-TW: 投球分析) and the subtitle now tells the arsenal/location/quality story. `usageTitle` key removed (section replaced by `arsenalTitle`). | i18n only. |
| 6 | The pitcher KPI row renders **6–7 cards** (SV conditional) in the existing 2/3/4-col responsive grid — no grid change needed. | None. |
| 7 | `PitchEvent` moved to `lib/pitch-arsenal.ts` (pure module) rather than a component file, so client charts can import the type without touching the server-only postgres client; `PITCH_COLOR` moved to `lib/pitch-colors.ts`. `PitchZoneHeatmap` import updated; `PitchDistribution.tsx` deleted. | Refactor detail. |
| 8 | Verification status: tsc + lint clean (one pre-existing `SprayChart` warning); en/zh-TW smoke on Gausman 592332 (starter), Varland 686973 (reliever, SV card renders), Vladdy 665489 (zero pitcher modules — structural check per P9 §8.2); Gausman year-by-year matches FanGraphs (2025: 10-11, 32 GS, 193 IP). **WHIP/K%/BB% pending the user's one-time Custom Report re-export** (importer warns as designed). | Open item = the manual CSV re-export only. |
