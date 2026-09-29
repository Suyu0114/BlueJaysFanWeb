# P13 — kickoff prompt (Team Trends 2022–2026 vs MLB)

> Paste the block below into a fresh session to implement P13. It is
> self-contained: it points at the full spec and the reference docs, lists the
> constraints, build order, verified watch-outs, verify commands and the docs to
> update. Written 2026-09-29 — **archive/delete once P13 ships** (a point-in-time
> launcher, not a living doc).
>
> **Start only after P12 is merged to `main`.** P13 depends on P12's migrations
> `013`–`019`, `web_games.game_type`, the M5 season-page helpers, M6's
> `web_league_season` and M7's export / copy-table.

---

Implement P13: a multi-season team page `/[locale]/team` — Blue Jays 2022–2026,
every stat shown with the MLB average and the Jays' rank among 30 clubs. The full
handoff spec is `docs/P13_spec.md` — read it end to end first, then `CLAUDE.md`
(including the **Motion** section), `docs/DATA_MODEL.md`, and `docs/P12_spec.md`
§7 (M5), §8 (M6), §9 (M7) and its §15 "as built" (P13 reuses those pieces). The
decisions in P13 spec §0 (T1–T10) are locked: follow them, and flag any
contradiction instead of silently working around it.

**Before anything else:** confirm P12 is on `main` (`git log main --oneline | grep P12`),
`git worktree list` shows no other session using the folder you're in, then create
branch `feat/p13-team-trends` from `main`. Don't commit to `main`, don't push — the
owner pushes. If another agent is working in the main folder, use a separate
`git worktree` instead of switching branches there.

**Work milestone by milestone, in order (spec §0 table): N0 → N6.** Each milestone is
its own commit. After each, stop and give me a short summary of what shipped and
what you verified before starting the next. N0–N1 (data + views) come first: the
articles can use the numbers via `season_report.py` before the page exists.

**Hard constraints:**
- Python/ETL only via the existing conda env: `conda run -n MLBxBaZi python …`.
  Never create a venv or requirements.txt.
- New tables/views are `web_`-prefixed; migrations `020`–`022`, one concern each;
  never edit `001`–`019`. Update `docs/DATA_MODEL.md` in the same change as every
  schema change.
- **No new npm or pip dependencies** (Savant CSVs via `requests` + stdlib `csv`).
- English-first i18n, `en.json` and `zh-TW.json` together with key parity; stat
  names (wRC+, OPS, FIP, Barrel%, OAA, …) and team names stay English in both.
- Brand tokens only (spec T9): Jays brick, MLB average navy dashed, rank shading
  brick (best) → steel (worst) with the ordinal always printed.
- Follow the CLAUDE.md Motion rules: `Reveal` for entrances, `ChartTooltip` +
  `useLingeringHover` for tooltips (the rank grid too), `WhenInView` for Recharts,
  `SlidingPill` for toggles, reduced motion respected.

**Watch-outs already verified (spec §1) — do not rediscover them the hard way:**
1. **No team-level sabermetrics endpoint**, and the league-wide player leaderboard
   merges traded players into one row (Soto 2022). wRC+ / WAR must come from the
   **per-team** player leaderboard (`teamId=T`), 60 calls/season. Do **not** reuse
   P12's `fetch_team_season_stats` for this — it now calls `/people` per player
   (~1,200 calls/season for 30 clubs).
2. **FIP is computed in the view**, not aggregated: team counting stats + the
   season's league constant, BB **including** IBB (2022: cFIP 3.106, Jays FIP 3.842).
3. **SP/RP splits: call per team** (`/teams/{id}/stats?stats=statSplits&sitCodes=sp,rp`)
   — the all-teams variant returned 50 of 60 splits.
4. **Savant abbreviations are retroactive** (`ATH` for 2022; MLB API said `OAK`).
   Map Savant rows by short name → MLB `teamName`; fail loudly on a miss. CSVs need
   a browser User-Agent and `utf-8-sig`. Store Savant %s as fractions.
5. MLB API occasionally answers `messageNumber 13 "Operation taking longer than
   expected"` — the new fetchers need a retry; leave existing `mlb_api` functions alone.
6. `backfill.py` is Statcast-heavy and only knows 2024–2026 — **don't extend it**;
   backfill 2022–2023 standings / schedule and the two new tables with the light
   scripts (spec §2 step 7).
7. MLB averages are **Σ counts → rate**, never an average of team rates. They must
   equal P12's `web_league_season` MLB row to ±0.0005 (same source).
8. The per-team leaderboard's sabermetrics can lag right after a season (P12 saw it
   on 2026-09-29). Run the §2 staleness check; if 2026 is off, re-run later and
   document it.

**Verify (per milestone, see spec §12 for the exact criteria):**
- Read-only SQL for N0/N1 (row counts, Jays 2022 reference values in spec §2,
  `web_league_season` equality, rank directions, run sources = run diff).
- `cd web; npx tsc --noEmit -p .`, `pnpm lint`, `pnpm build` — all clean.
- Drive the pages in a real browser (dev server + headless Chrome) for `/en/team`
  and `/zh-TW/team` at desktop and 375 px: every module, the Value | vs MLB toggle,
  keyboard focus on grid cells, season highlight on the trajectory chart, the
  Season strip links, and the "← Team trends" back-link on `/en/season/2025`.
- Site numbers == `reports/season-review-2026/team_trends.csv` for the spot cells.
- **Stop any dev server you start** before finishing.

**When P13 is done, reconcile docs via `docs/DOC_MAINTENANCE.md`:** CLAUDE.md (P13
row in Phases, migrations line `020`–`022`, folder tree for the new lib /
components / page / ETL scripts, cron notes), README.md (features, layout, status),
`docs/DATA_MODEL.md` (both tables, both views, the Savant name-map and staleness
notes), `ETL_update_flow.md` (the new scripts + the 2022–2023 backfill),
`.github/workflows/etl.yml` header comment, and add a §14 "Reconciliation — as
built" to `docs/P13_spec.md`.
