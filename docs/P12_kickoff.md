# P12 — kickoff prompt (Season Review & Year-over-Year)

> Paste the block below into a fresh session to implement P12. It is
> self-contained: it points at the full spec and the reference docs, lists the
> constraints, build order, verified watch-outs, verify commands and the docs to
> update. Written 2026-09-25, revised 2026-09-29 (full-MLB history + Compare tab) — **archive/delete once P12 ships** (a point-in-time
> launcher, not a living doc).

---

Implement P12: season review + year-over-year (2026 vs 2025) support for the
owner's two articles. The full handoff spec is `docs/P12_spec.md` — read it end
to end first, then `CLAUDE.md` (including the **Motion** section) and
`docs/DATA_MODEL.md`. The decisions in spec §0 (D1–D16) are locked: follow them,
and flag any contradiction instead of silently working around it.

**Work milestone by milestone, in order (spec §0 table): M0 → M7.** Each
milestone is its own commit on a branch `feat/p12-season-review` (don't commit to
`main`, don't push — the owner pushes). After each milestone, stop and give me a
short summary of what shipped and what you verified before starting the next. M0
and M1 are the priority: the articles need numbers before site features.

**Hard constraints:**
- Python/ETL only via the existing conda env: `conda run -n MLBxBaZi python …`.
  Never create a venv or requirements.txt.
- New tables/views are `web_`-prefixed; migrations `013`–`019`, one concern each;
  never edit `001`–`012`. Update `docs/DATA_MODEL.md` in the same change as
  every schema change.
- **No new npm or pip dependencies** (pybaseball already has the Savant
  leaderboard functions; PNG export uses native canvas; `motion` is installed).
- English-first i18n, `en.json` and `zh-TW.json` together with key parity;
  stat names (Chase%, CSW%, xwOBA, Barrel%, …) stay English in both.
- Brand tokens only; 2 seasons = current **brick**, comparison **steel** (D8).
- Follow the CLAUDE.md Motion rules: `Reveal` for entrances, `ChartTooltip` +
  `useLingeringHover` for SVG chart tooltips, CSS keyframes with `backwards`
  fill for chart marks, `WhenInView` for Recharts, reduced-motion respected.

**Watch-outs already verified (spec §1) — do not rediscover them the hard way:**
1. **2026 Statcast hole:** 15,824 rows dated 2026-07-08 → 2026-08-30 have NULL
   `balls/strikes/pfx_x/pfx_z/release_extension/estimated_woba` (the cron ran
   pre-P10 code until 2026-09-06). M0 re-pulls it; nothing count- or
   movement-based for 2026 is trustworthy before that.
2. **`web_games` has no `game_type`** and 2025 holds 18 postseason games (180
   rows). Migration `013` adds it; until then no 2025 team record is correct.
3. **2025 box scores cover 2 games, 2024 has no `web_games` rows at all** — run
   `pull_schedule.py --season 2024` first, then `pull_boxscore.py --season 2024|2025`.
4. **~11–12% of Statcast rows are non-Jays games**, and `game_pk ∈ web_games` does
   **not** mean "as a Blue Jay" (Varsho-as-an-Astro faced TOR 2026-08-03→05). The
   `jays` scope is box-score membership (D1); per-player views expose `mlb` + `jays`.
4b. **Other-club history (D13–D16):** the 2026 roster (64, traded in and out) gets
   full-MLB 2024–2026 — per-club season lines in `web_player_team_season_stats`
   (`team_id = 0` = total, migration `014`) and Statcast via `--cohort-season`.
   `web_player_seasons` and `web_player_season_stats` stay Jays-only.
5. **Never overlay `plate_x`/`plate_z` across 2025/2026** (alignment change) —
   compare locations via `zone` buckets (D3).
6. Swing/whiff sets must match `web/lib/pitch-arsenal.ts` exactly (spec §11).
7. The 2026 season ends **2026-09-27**; generate the M1 report only after the
   final cron run (M0 step 5 "freeze").

**Verify (per milestone, see spec §13 for the exact criteria):**
- Read-only SQL checks for M0 (NULL counts, 162 R games = `web_standings` W/L,
  split sums, Statcast-vs-API coverage — spec §2 step 6).
- `cd web; npx tsc --noEmit -p .`, `pnpm lint`, `pnpm build` — all clean.
- Drive the pages in a real browser (dev server + headless Chrome) for
  `/en` and `/zh-TW`: Vladdy `665489` (batter) and Gausman `592332` (pitcher),
  their `/compare` tabs plus Varsho `662139` and Cease `656302` (both scopes),
  plus `/en/season/2026` and `/en/season/2025`.
- Site numbers must equal report numbers (M2-3).
- **Stop any dev server you start** before finishing.

**When P12 is done, reconcile docs via `docs/DOC_MAINTENANCE.md`:** CLAUDE.md
(P12 row in Phases, migrations line `013`–`019`, folder tree for new
lib/components/pages/ETL scripts, cron notes), README.md (features, layout,
status), `docs/DATA_MODEL.md` (every new column/view/table, the non-Jays-games
and as-a-Jay invariants, the 2026-hole gap marked RESOLVED), `ETL_update_flow.md` (new
scripts + 2024/2025 box-score + history backfill), `.github/workflows/etl.yml` header comment,
and add a §15 "Reconciliation — as built" to `docs/P12_spec.md`.
