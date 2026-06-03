# P8 — Exit Velocity / Launch Angle Scatter Plot on Batting Page

> Handoff spec for AI coding agent. Follows the conventions in `CLAUDE.md` (brand
> color tokens, D3 for spray/zone charts, server component data fetch, D3 component
> receives plain JSON props, English-first i18n, light theme, no new dependencies).
> **Flag any contradiction discovered during implementation rather than silently
> working around it.**

---

## 0. Scope

**Feature A only** — add an EV/LA scatter plot and KPI chips to the batting page.

**Hard constraints:**
- Zero migrations, zero ETL changes, zero DB schema changes.
- Do **not** touch `etl/`, `db/migrations/`, or `CLAUDE.md`.
- No new npm dependencies.

---

## 1. Data source verification

### ✅ Confirmed: data already exists

[`web/lib/batting.ts::getBattedBalls`](file:///c:/Users/jing8/Desktop/myProject/BlueJaysFanWeb/web/lib/batting.ts#L6-L26)
already SELECTs `launch_speed::float8` and `launch_angle::float8`.

[`BattedBallEvent`](file:///c:/Users/jing8/Desktop/myProject/BlueJaysFanWeb/web/components/charts/SprayChart.tsx#L24-L34)
type includes both fields as `number | null`.

The query filters `hc_x_feet IS NOT NULL` (= balls in play, foul balls excluded).
This is the same population used by SprayChart. **No query changes needed.**

> **Population caveat:** the EV/LA scatter plots a *subset* of this array — only
> points with non-null `launch_speed` AND `launch_angle`. A batted ball with EV/LA
> but a null hit-coordinate (rare Savant gap) is already excluded upstream by the
> shared `hc_x_feet IS NOT NULL` fetch. That is the right trade-off (one `filtered`
> array drives both charts), but it means the scatter's "with EV" count can never
> exceed the spray-chart count. See `docs/DATA_MODEL.md` → Known gaps #3.

### Event → color mapping

[`CATEGORY_COLOR`](file:///c:/Users/jing8/Desktop/myProject/BlueJaysFanWeb/web/components/charts/SprayChart.tsx#L50-L55)
and [`categorize()`](file:///c:/Users/jing8/Desktop/myProject/BlueJaysFanWeb/web/components/charts/SprayChart.tsx#L60-L72)
are defined **inline in SprayChart.tsx** — they are NOT extracted into a shared
module. Both are small (< 25 lines total).

> **Decision:** Extract `CATEGORY_COLOR`, `categorize()`, and the `Category` type
> into a new shared file `web/lib/batted-ball-categories.ts` so both `SprayChart`
> and `ExitVeloChart` import the same source. This is preferable to duplicating the
> mapping, since any future color/category change must stay in sync.

---

## 2. Files to create / modify

### 2.1 [NEW] `web/lib/batted-ball-categories.ts`

Extract from SprayChart:

```ts
export type Category = "hr" | "xbh" | "single" | "out";

export const CATEGORY_COLOR: Record<Category, string> = {
  hr:     "var(--color-brick)",
  xbh:    "var(--color-lava)",
  single: "var(--color-navy)",
  out:    "var(--color-steel)",
};

// Draw order: outs at the back, home runs on top.
export const CATEGORY_Z: Record<Category, number> = { out: 0, single: 1, xbh: 2, hr: 3 };

export function categorize(event: string | null): Category {
  switch (event) {
    case "home_run":  return "hr";
    case "double":
    case "triple":    return "xbh";
    case "single":    return "single";
    default:          return "out";
  }
}
```

### 2.2 [MODIFY] `web/components/charts/SprayChart.tsx`

- Remove the inline `Category` type, `CATEGORY_COLOR`, `CATEGORY_Z`, and
  `categorize()` definitions.
- Import them from `@/lib/batted-ball-categories`.
- No behavioral change.

### 2.3 [NEW] `web/components/charts/ExitVeloChart.tsx`

`"use client"` component, pure D3 (SVG), receives plain JSON props.

```ts
type ExitVeloChartProps = {
  events: BattedBallEvent[];
  labels: ExitVeloChartLabels;
  width?: number;  // default ~560, responsive
};
```

**Scatter plot:**

| Axis | Mapping | Label |
|---|---|---|
| X | `launch_angle` (degrees) | `Launch Angle (°)` |
| Y | `launch_speed` (exit velocity, mph) | `Exit Velocity (mph)` |

- **Only plot points where both `launch_speed` AND `launch_angle` are non-null.**
  Null values cannot be positioned → skip silently.
- Each point = one batted ball event, colored via the shared
  `categorize(event)` → `CATEGORY_COLOR` mapping.
- Point opacity: `out` = 0.3, others = 0.85 (same visual treatment as SprayChart).
- Axis domain: auto-fit from data with reasonable padding (~5% each side or a
  sensible minimum range, e.g. LA: at least −30° to +50°, EV: at least 60 to 115 mph).
- Grid lines: subtle, using `var(--color-navy)` at very low opacity.
- **Barrel zone overlay (stretch, visual only):** a semi-transparent rectangle/
  polygon at roughly EV ≥ 98 mph, LA 26°–30° (the "sweet spot" narrowing). Filled
  with `var(--color-brick)` at ~0.08 opacity, labeled "Barrel Zone" in small text.
  This is purely a reference area — per-point barrel classification requires
  `launch_speed_angle` data that is not yet in the DB.
- **Tooltip on hover:** same pattern as SprayChart — show result, date, EV, LA,
  pitch type. Position tooltip relative to the hovered point.
- **RWD:** the SVG should be fluid (`viewBox` + responsive container). On mobile
  (< 640px), the chart fills the card width. On desktop, it sits alongside SprayChart
  in a side-by-side or stacked layout.
- **Legend:** reuse the same 4-category legend (HR / XBH / Single / Out) with
  color dots. Can share legend rendering with SprayChart or render its own — both fine.

**Colors: only brand tokens.**
- Points: `var(--color-brick)`, `var(--color-lava)`, `var(--color-navy)`, `var(--color-steel)`.
- Axes / gridlines / text: `var(--color-navy)`.
- Background: transparent (inherits page `papaya`).
- Barrel zone fill: `var(--color-brick)` at low opacity.

### 2.4 [NEW] `web/lib/exit-velo-stats.ts`

Pure function (no DB calls) that computes KPI values from the same `BattedBallEvent[]`:

```ts
export type ExitVeloStats = {
  totalBattedBalls: number;  // all in-play (the full array length)
  withEV: number;            // subset with non-null launch_speed
  avgEV: number | null;      // mean of launch_speed (only non-null)
  maxEV: number | null;      // max of launch_speed
  hardHitPct: number | null; // % of withEV events where launch_speed ≥ 95
};

export function computeExitVeloStats(events: BattedBallEvent[]): ExitVeloStats;
```

This is called **client-side** from the explorer (not a server function), so it
recomputes whenever filters change and always reflects the filtered subset.

> **Denominator note:** `hardHitPct` is computed over the *filtered* events with
> non-null `launch_speed`. Because the existing `outcome` filter also drives this
> array, selecting e.g. `outcome = hr` makes Hard-Hit% read as "% of home runs
> that were hard-hit" — honest, but the label/UX must not imply a season-wide
> hard-hit rate.

### 2.5 [MODIFY] `web/components/charts/SprayChartExplorer.tsx`

**Key change:** expand SprayChartExplorer to also render the ExitVeloChart below
the SprayChart, fed by the **same `filtered` array**. This guarantees the existing
month/pitch-type/outcome/hand filters drive both charts simultaneously — no
second filter UI.

Rename is optional (it could become `BattedBallExplorer`), but since the batting
page only imports `SprayChartExplorer`, renaming the default export alone is
enough. Keep the file path unchanged to minimize diff noise.

Layout changes inside the component:

```
┌─────────────────────────────────────────────┐
│  Filter bar (unchanged)                     │
│  "Showing N of M batted balls"              │
├─────────────────────────────────────────────┤
│  SprayChart (existing, min-height preserved)│
├─────────────────────────────────────────────┤
│  ── EV/LA section ──                        │
│  KPI chips: Avg EV · Max EV · Hard-Hit%     │
│  "N batted balls (M with Exit Velocity)"    │
│  ExitVeloChart scatter plot                 │
└─────────────────────────────────────────────┘
```

- The page layout changes from `h-[calc(100dvh-64px)]` fixed viewport to a
  scrollable layout, since we're adding a second chart. The SprayChart + scatter
  shouldn't be crammed into a single viewport.
- **KPI chips** display `Avg EV`, `Max EV`, `Hard-Hit%` (all English jargon even
  in zh-TW). Values computed from `computeExitVeloStats(filtered)`.
- **Population honesty line:** below the chips, render:
  `"{N} batted balls ({M} with Exit Velocity)"` — making it clear how many of the
  filtered subset have EV data. Use i18n key but keep jargon English.

### 2.6 [MODIFY] `web/app/[locale]/players/[mlbam_id]/batting/page.tsx`

- Change the outer container from fixed-viewport `h-[calc(100dvh-64px)]` to a
  scrollable layout that accommodates both charts.
- The page heading could be updated from just "Spray Chart" to a more general
  "Batting" section title, with sub-headings for each chart, but this is cosmetic
  and optional — the spec defers to implementation judgment.

### 2.7 [MODIFY] `web/messages/en.json` — add keys under `"Batting"`

```jsonc
{
  "Batting": {
    // ... existing keys unchanged ...
    "exitVeloTitle": "Exit Velocity vs Launch Angle",
    "evSubtitle": "{total} batted balls ({withEV} with Exit Velocity)",
    "avgEV": "Avg EV",
    "maxEV": "Max EV",
    "hardHitPct": "Hard-Hit%",
    "barrelZone": "Barrel Zone",
    "axisEV": "Exit Velocity (mph)",
    "axisLA": "Launch Angle (°)"
  }
}
```

All baseball jargon stays English. Only chrome/section titles are translatable.

### 2.8 [MODIFY] `web/messages/zh-TW.json` — matching keys

```jsonc
{
  "Batting": {
    // ... existing keys unchanged ...
    "exitVeloTitle": "Exit Velocity vs Launch Angle",
    "evSubtitle": "共 {total} 顆擊球（{withEV} 顆有 Exit Velocity）",
    "avgEV": "Avg EV",
    "maxEV": "Max EV",
    "hardHitPct": "Hard-Hit%",
    "barrelZone": "Barrel Zone",
    "axisEV": "Exit Velocity (mph)",
    "axisLA": "Launch Angle (°)"
  }
}
```

Per CLAUDE.md: `Exit Velocity`, `Launch Angle`, `Hard-Hit%`, `Avg EV`, `Max EV`,
`Barrel Zone` are all baseball jargon → stay English in both locales.

---

## 3. What NOT to change

| Item | Reason |
|---|---|
| `etl/*` | Out of scope — zero ETL |
| `db/migrations/*` | Zero schema changes |
| `CLAUDE.md` | Doc updates are a separate task |
| `web/lib/batting.ts` | Query already returns `launch_speed` / `launch_angle` |
| Filter UI | Existing filters in SprayChartExplorer drive both charts; no second filter bar |

---

## 4. Discrepancies found (code ↔ doc)

| # | Observation | Impact |
|---|---|---|
| 1 | CLAUDE.md §Folder layout line 118 says batting page = "spray chart" only. After P8 it also contains EV/LA scatter — but we are **not updating CLAUDE.md** per scope. | None for this task; the doc-update task should note this. |
| 2 | `Batting.subtitle` / `Pitching.subtitle` (en + zh-TW) previously hardcoded "2025 regular season" while the fetches pull *all* seasons. **Fixed 2026-06-03** (now season-agnostic). | Resolved; see `docs/DATA_MODEL.md` → Known gaps #4. |

---

## 5. Done-when checklist

| # | Criterion |
|---|---|
| 1 | Batting page in **en** and **zh-TW** shows the EV/LA scatter plot below the SprayChart. |
| 2 | Points are colored by batted-ball outcome and match SprayChart exactly (same `categorize` + `CATEGORY_COLOR`). |
| 3 | Existing month / pitch-type / outcome / pitcher-hand filters simultaneously update **both** SprayChart and the scatter (single `filtered` array). |
| 4 | KPI chips display Avg EV / Max EV / Hard-Hit%, computed only from events with non-null `launch_speed`. |
| 5 | Population line honestly shows `"{N} batted balls ({M} with Exit Velocity)"`. |
| 6 | No ad-hoc hex colors — only brand tokens from `globals.css`. |
| 7 | Zero changes to `etl/`, `db/migrations/`, `CLAUDE.md`. |
| 8 | `SprayChart.tsx` still works identically after the category extraction refactor. |
| 9 | RWD: chart is usable on both desktop and mobile viewports. |

---

## 6. Verification plan

### Automated
- `pnpm build` (or `pnpm dev`) — no TypeScript errors, no missing imports.
- Visual check: load the batting page for a player with known Statcast data
  (e.g. Vladdy, mlbam_id `665489`) in both `en` and `zh-TW` locales.

### Manual
- Toggle each filter and confirm both charts update.
- Hover a point in the scatter to verify tooltip content.
- Resize the browser to mobile width and confirm RWD.
- Verify the KPI chips recalculate when filters change.
- Confirm the barrel zone overlay renders as a subtle reference area (if implemented).
