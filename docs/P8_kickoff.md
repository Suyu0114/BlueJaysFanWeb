# P8 — kickoff prompt (EV/LA scatter on the batting page)

> Paste the block below into a fresh session to implement P8. It is self-contained:
> it points at the full spec and the two reference docs, lists the constraints,
> build order, verified watch-outs, the verify commands, and the docs to update
> when done. Written 2026-06-03 — **archive/delete once P8 ships** (a point-in-time
> launcher, not a living doc).

---

Implement P8: the Exit Velocity / Launch Angle scatter on the batting page.
The full handoff spec is `docs/P8_spec.md` — read it first, end to end, then read
`CLAUDE.md` and `docs/DATA_MODEL.md`. Follow the spec; flag any contradiction
instead of silently working around it.

**Scope: Feature A only** — an EV/LA scatter + KPI chips below the existing spray
chart on `web/app/[locale]/players/[mlbam_id]/batting/page.tsx`. No new data:
`web/lib/batting.ts::getBattedBalls` already returns `launch_speed` / `launch_angle`.

**Hard constraints (from the spec):** zero ETL / migration / schema changes; no new
npm dependencies; brand color tokens only (no ad-hoc hex); English-first i18n with
both `en.json` and `zh-TW.json` updated and baseball jargon kept English in both;
D3 components stay framework-pure (plain JSON props, no next-intl / Supabase inside).

**Build order (spec §2):**
1. Extract `Category` / `CATEGORY_COLOR` / `CATEGORY_Z` / `categorize()` from
   `SprayChart.tsx` into new `web/lib/batted-ball-categories.ts` and import them
   back (behavior-preserving — the spec's reproduction was verified case-for-case).
2. New `web/components/charts/ExitVeloChart.tsx` (`"use client"`, D3 SVG scatter,
   points only where both EV and LA are non-null, colored by the shared `categorize`).
3. New `web/lib/exit-velo-stats.ts` pure `computeExitVeloStats()`.
4. Extend `SprayChartExplorer.tsx` to render the scatter + KPI chips from the
   **same `filtered` array** (no second filter bar) and switch the page off the
   fixed-viewport `h-[calc(100dvh-64px)]` layout to a scrollable one.
5. Add the `Batting` i18n keys in both locales.

**Watch-outs already verified (in `docs/DATA_MODEL.md`):** the "barrel zone" is a
*visual reference rectangle only* — `launch_speed_angle` does NOT exist in the DB.
The EV population is a *subset* of the spray population (`hc_x_feet IS NOT NULL`
upstream), so "with EV" count can't exceed the spray count. Hard-Hit%'s denominator
follows the active `outcome` filter — label honestly.

**Verify:**
- `web/node_modules/.bin/tsc --noEmit -p web/tsconfig.json` → exit 0
- eslint the new/changed files (run from `web/`)
- `node -e` parse both message JSONs and confirm en/zh key parity
- visual-check Vladdy (`665489`) batting page in `en` and `zh-TW`: scatter renders,
  all four filters drive both charts, tooltip + KPI chips update, RWD on mobile width

**When P8 is done, reconcile docs via `docs/DOC_MAINTENANCE.md` — at minimum:**
CLAUDE.md (batting page comment `# spray chart` → spray + EV/LA; add
`ExitVeloChart.tsx` to the charts list and `batted-ball-categories.ts` /
`exit-velo-stats.ts` to the lib list; add a P8 row to the Phases table),
README.md (Features + Status), and mark `docs/P8_spec.md` done. `DATA_MODEL.md`
only if the schema changed (it shouldn't).
