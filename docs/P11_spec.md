# P11 — Standings & Playoff Race (Division Tables · Wild Card · AL East Home Module · Playoff Picture)

> Handoff spec, written at **plan time** and **reconciled against the build at
> ship time (2026-09-06)** — see §10 for the as-built deltas.
> Follows the conventions in `CLAUDE.md` (conda env `MLBxBaZi`, `web_` table prefix,
> server-component data fetch, English-first i18n, brand color tokens, one concern
> per migration, no new dependencies). Design decisions were locked in a planning
> chat (`~/.claude/plans/p11-spec-md-1-resilient-yao.md`); **do not relitigate
> them**, but flag contradictions rather than silently working around them.
>
> Every API fact below was **verified against the live endpoint on 2026-09-06**, not
> assumed. Where the payload is surprising (string sentinels, reversed NL division
> ids, absent `wildCardRank`) the spec says so explicitly — those are the three
> things most likely to be got wrong from memory.

---

## 0. Scope

**Committed build (this spec):** give the site team-level context. Today a fan
cannot answer *"are the Jays in it?"* without leaving for mlb.com — there is no
standings data anywhere in the schema, and `web_games` is Jays-only
(`opponent_id` / `jays_score` / `opp_score`), so no other team's record is derivable
from what we already store.

**A. `/[locale]/standings` (new page)** — mirrors mlb.com/standings:

1. **Six division tables** — AL East first, then AL Central, AL West, NL East,
   NL Central, NL West. Columns W · L · PCT · GB · WCGB · L10 · STRK · RS · RA ·
   DIFF · X-W/L · HOME · AWAY.
2. **Two Wild Card tables** (AL, NL) — WC1–3 above a **cut line**, chasers below,
   division leaders excluded.
3. **Clinch legend** — `z` / `y` / `x` / `e` markers, derived not stored.

**B. Home page module (`/[locale]`)** — the user's brief, AL-focused:

1. **AL East standings** — compact: Team · W · L · PCT · GB · L10 · STRK.
2. **AL Playoff Race** — seeds 1–3 (division leaders), seeds 4–6 (WC1–3), cut line,
   then the next 3 chasers with WCGB.
3. Footer link → the full `/standings` page.

**ETL groundwork (this phase):** migration `012` (`web_standings`), a new
`fetch_standings` helper + `pull_standings.py`, a **one-shot** logo recolour
script, and the nightly cron wiring in both `etl.yml` jobs.

**Out of scope (P12 / later):**
- **Daily standings history** (a date dimension) and any GB-over-time race chart — D2.
- Head-to-head records, remaining strength of schedule, magic-number countdown widget.
- An NL-only / league toggle on the page (D1 renders both leagues statically).
- Any change to the player, batting, pitching, fielding or game-detail pages.
- BaZi (still v2), `/compare`.

### Decision log (locked)

| # | Decision | Choice |
|---|---|---|
| D1 | Page scope | **Full MLB** — six division tables + two Wild Card tables. AL section first, and within it **AL East on top** (Jays-first ordering, deliberately *not* the API's own 200/201/202 order and not alphabetical). NL below. Rejected: AL-only (too thin for a page of its own) and a league toggle (an extra client component for content that fits in one scroll). |
| D2 | Storage grain | **Current snapshot, PK `(season, team_id)`** — exactly 30 rows per season, upserted nightly, no date dimension. Standings are a "right now" artifact and every consumer reads the latest state. Daily history (~5.5k rows/season) would only pay off for a race-over-time chart, which is §9 backlog; adding the date column later is a `012`-style additive migration, not a rewrite. |
| D3 | GB / WCGB / elimination storage | Store **as `text`, verbatim from MLB**. Verified live values: `gamesBack ∈ {"-", "4.0", "13.5"}`, `wildCardGamesBack ∈ {"-", "+9.5", "0.5", "17.5"}`, `eliminationNumber ∈ {"-", "7", "E"}`. These are **display strings with sign and sentinel semantics**, not quantities: `"-"` means *is the reference* (division leader for GB, the WC3 cut line for WCGB) and `"+9.5"` means *ahead of the cut*. Parsing them into a signed numeric invents a sign convention that will eventually be read backwards, for zero gain — **all ordering uses the rank columns, never GB**. This is a deliberate exception to the "numeric for numbers" precedent of migrations `008`–`011` and **must be recorded in the `DATA_MODEL.md` anti-index**. `winningPercentage` *is* parsed to `numeric` (a real quantity, no sentinels). |
| D4 | Team identity in tables | **MLB cap logo, recoloured to the site palette** (monochrome, hand-drawn feel) rather than the plain `teamAbbr()` text badge. |
| D5 | How the logo is recoloured | **Bake at fetch time; do not recolour at runtime.** Verified: `team-cap-on-light/{id}.svg` is a 4-path SVG whose *interior detail* is `fill="#fff"` — so `mask-image` or `filter: brightness(0)` would fold the white paths into the alpha and flatten the mark into an unreadable blob. Instead a **one-shot script rewrites the fills**: every non-white fill → `#003049` (navy ink), every white fill → `#fdf0d5` (papaya paper); output committed to `web/public/team-logos/{id}.svg`. The result is a two-tone ink-on-paper woodcut that keeps interior detail and needs **no `next.config` `remotePatterns` and no `next/image`** (local file, plain `<img>`). The hand-drawn wobble is **one shared SVG `feTurbulence` + `feDisplacementMap` filter** declared once in the layout and applied by class — *not* 30 rough.js canvases (30 `ResizeObserver`s in one table would be a real perf regression). Logos render at **28px**; below that the displacement muddies the mark. Fallback if any logo reads badly: the `teamAbbr()` text badge. |
| D6 | Clinch markers | **Derived in TS, not stored** — `z` = `clinched && league_rank === 1`, `y` = `division_champ`, `x` = `clinched && !division_champ`, `e` = `elimination_number === "E"`. A pure `clinchMarker(row)` helper in `web/lib/standings.ts`. The underlying booleans/strings *are* stored, so the rule can change without an ETL re-run. |
| D7 | Home module composition | Two stacked blocks in **one** `<section>`: (a) AL East table, (b) AL Playoff Race (seeds 1–3 = division leaders ordered by `league_rank`; seeds 4–6 = `wild_card_rank` 1–3; cut line; next 3 chasers with WCGB). Jays row highlighted. Placed **between "Today's Blue Jays" and `ScheduleCalendar`** — above the calendar because "are we in it?" is the higher-value glance, and the calendar remains the page's closing signature piece. Wrapped in `ScorecardFrame` so it inherits the hero/roster parchment chrome. |
| D8 | Cron placement | `pull_standings.py` runs **after `pull_schedule.py` in both `etl.yml` jobs** (`refresh` `0 13 * * *` and `nightly-finals` `30 3 * * *`). It needs only `requests` + `psycopg`, both already installed in the light job. The stated order invariant becomes **schedule → standings → boxscore → revalidate**. |
| D9 | Season resolution | Reuse the home page's existing offseason fallback (`todayET` → season, fall back to `season - 1` when the query comes back empty) rather than inventing a second rule. The standings page uses the same helper shape. |
| D10 | Logo provenance | Recoloured cap logos are self-hosted **derivatives** of MLB club marks, used on a non-commercial fan site. Recorded here so it is a decision, not an oversight. If this ever becomes a concern, D5's fallback (abbr text badges) removes every logo in one component. |

---

## 1. Data sources

| Module | Source | Notes |
|---|---|---|
| All standings tables + home module | MLB Stats API `/api/v1/standings` → `web_standings` | Same host as `etl/mlb_api.py::BASE_URL`. No key, no scraping — **unaffected by the FanGraphs 403 problem** that killed `pybaseball.team_batting` et al. |
| Team logos | `https://www.mlbstatic.com/team-logos/team-cap-on-light/{team_id}.svg` | Fetched **once** by a one-shot script, recoloured, committed. Not a runtime dependency. |
| Team abbreviations | [`web/lib/team-abbr.ts`](../web/lib/team-abbr.ts) | Already maps all 30 ids. Used as the logo fallback and for compact cells. `team_abbrev` is also stored from the API as the authoritative value. |

### The exact request

```
GET https://statsapi.mlb.com/api/v1/standings
    ?leagueId=103,104
    &season=YEAR
    &standingsTypes=regularSeason
    &hydrate=team
```

**`hydrate=team` is required.** Without it, `team` is only `{id, name, link}` and
`name` is the *short* name (`"Rays"`, not `"Tampa Bay Rays"`), with no
`abbreviation` and no `division.name`.

### Payload shape (verified 2026-09-06)

`{copyright, records[]}` — **6 records**, one per division, each
`{standingsType, league{id}, division{id}, sport, lastUpdated, teamRecords[]}`
with 5 teams.

**Division ids — the NL pair is reversed from the intuitive order:**

| id | Division | id | Division |
|---|---|---|---|
| 200 | American League West | 203 | National League **West** |
| 201 | American League East | 204 | National League **East** |
| 202 | American League Central | 205 | National League Central |

Do not hardcode NL ids from memory; 203/204 are the reverse of the AL pattern.
`league.id`: **103 = AL, 104 = NL**.

Per `teamRecords[]` entry:

```
team.{id, name, abbreviation, teamName, division{id,name}, league{id,name}}   # hydrated
wins  losses  winningPercentage  gamesPlayed
runsScored  runsAllowed  runDifferential
divisionRank  leagueRank  wildCardRank        # all strings; wildCardRank ABSENT for division leaders
gamesBack  wildCardGamesBack                  # strings w/ sentinels — see D3
streak{streakCode, streakType, streakNumber}  # streakCode = "W2" / "L3"
divisionLeader  divisionChamp  wildCardLeader  clinched  hasWildcard
eliminationNumber  wildCardEliminationNumber  magicNumber   # strings; "-" / "E" / "17"
records.splitRecords[]     # includes type "lastTen", "home", "away", "oneRun", ...
records.expectedRecords[]  # includes type "xWinLoss"  -> X-W/L
lastUpdated
```

Three traps, all confirmed live:

1. **`wildCardRank` is absent** (not null, not `"-"`) on division leaders. Use
   `.get()` in Python and `| null` in TS.
2. **Rank fields are strings** (`"1"`, `"4"`) — cast to `int` in the ETL.
3. **`eliminationNumber` can literally be `"E"`.** Anything that treats it as a
   number will throw or silently produce `NaN`. Stored as `text` (D3).

---

## 2. Migrations

### `db/migrations/012_standings.sql`

```sql
-- P11: MLB standings snapshot (division tables, wild card race, home module).
-- Source: MLB Stats API
--   /api/v1/standings?leagueId=103,104&season=YEAR&standingsTypes=regularSeason&hydrate=team
-- Grain: ONE ROW PER TEAM PER SEASON — a live snapshot, overwritten nightly, no
--   date dimension (locked D2). 30 rows/season. History -> future migration.
-- GOTCHA: games_back / wc_games_back / *_number are TEXT on purpose (locked D3).
--   MLB returns display strings with sentinels: '-' (is the reference), '+9.5'
--   (ahead of the wild card cut line), 'E' (eliminated). Never cast them; all
--   ordering uses the *_rank columns.
-- Apply via:  python etl/apply_migration.py db/migrations/012_standings.sql

create table if not exists web_standings (
  season                int     not null,
  team_id               int     not null,      -- MLB Stats API team id (141 = Jays)
  team_name             text    not null,      -- English, e.g. "Toronto Blue Jays"
  team_abbrev           text    not null,      -- e.g. "TOR"
  league_id             int     not null,      -- 103 = AL, 104 = NL
  division_id           int     not null,      -- 200 ALW / 201 ALE / 202 ALC
                                               --   203 NLW / 204 NLE / 205 NLC  <- NL pair reversed
  division_name         text    not null,      -- English, e.g. "American League East"

  games_played          int,
  w                     int     not null,
  l                     int     not null,
  pct                   numeric,               -- winningPercentage parsed (.599); a real quantity

  division_rank         int,
  league_rank           int,
  wild_card_rank        int,                   -- NULL for division leaders (field is ABSENT upstream)

  games_back            text,                  -- '-' | '4.0'            (see GOTCHA)
  wc_games_back         text,                  -- '-' | '+9.5' | '3.0'   (see GOTCHA)
  streak_code           text,                  -- 'W2' | 'L3'

  l10_w                 int,
  l10_l                 int,
  home_w                int,
  home_l                int,
  away_w                int,
  away_l                int,
  x_w                   int,                   -- expectedRecords type='xWinLoss'
  x_l                   int,

  runs_scored           int,
  runs_allowed          int,
  run_diff              int,

  division_leader       boolean not null default false,
  division_champ        boolean not null default false,
  wild_card_leader      boolean,
  clinched              boolean not null default false,
  has_wildcard          boolean,
  elimination_number    text,                  -- '-' | '7' | 'E'        (see GOTCHA)
  wc_elimination_number text,
  magic_number          text,                  -- '-' | '17' | null

  last_updated          timestamptz,           -- the API's own lastUpdated
  updated_at            timestamptz not null default now(),
  primary key (season, team_id)
);

create index if not exists idx_web_standings_div on web_standings (season, division_id, division_rank);
create index if not exists idx_web_standings_wc  on web_standings (season, league_id, wild_card_rank);
```

After: `web_standings` = **38 columns**, new table. Apply with
`conda run -n MLBxBaZi python etl/apply_migration.py db/migrations/012_standings.sql`.

---

## 3. ETL

### `etl/mlb_api.py` (extend)

New section banner `# --- P11: standings ---` at the end of the module, matching
the existing `# --- P7: schedule + box score ---` style. Keeps the module's shape:
bare `requests.get(..., timeout=30)` → `raise_for_status()` → `.get()` dict-walking,
no logging, errors propagate to the caller script.

```python
STANDINGS_URL = f"{BASE_URL}/standings"

# MLB division ids. The NL pair is REVERSED relative to the AL pattern
# (203 = NL West, 204 = NL East) — verified against the live feed, do not
# "correct" this from memory.
AL_EAST_DIVISION_ID = 201
AMERICAN_LEAGUE_ID = 103
NATIONAL_LEAGUE_ID = 104


def _split(records: dict, group: str, type_: str) -> dict:
    """Pull one {wins, losses} block out of records.<group>[] by its `type`."""


def fetch_standings(season: int, league_ids: str = "103,104") -> list[dict]:
    """One flat web_standings row per team (30 for both leagues).

    NOTE: `hydrate=team` is REQUIRED — without it `team` carries only the short
    name and no abbreviation/division name.
    """
```

Mapping rules the implementation must honour:

- `wildCardRank` via `.get()` — **absent** on division leaders → `None`.
- Rank fields arrive as strings → `int(...)` guarded for `None`.
- `gamesBack` / `wildCardGamesBack` / `eliminationNumber` /
  `wildCardEliminationNumber` / `magicNumber` → **passed through untouched** (D3).
- `winningPercentage` (`".599"`) → `float(...)`.
- `l10_*` from `_split(records, "splitRecords", "lastTen")`;
  `home_*` / `away_*` from `splitRecords` types `home` / `away`;
  `x_w` / `x_l` from `_split(records, "expectedRecords", "xWinLoss")`.
- `streak_code` from `streak.streakCode` via `.get("streak", {})` — a team with
  zero games played has no `streak` block.

### `etl/db.py` (extend)

`upsert_standings(conn, rows)` under a `# --- P11: standings ---` banner, in the
**Variant-A** shape used by `upsert_games` (literal SQL, named params,
`executemany`, returns `cur.rowcount`, **caller commits**):

```python
def upsert_standings(conn, rows: Iterable[dict]) -> int:
    """Upsert web_standings. Conflict key: (season, team_id)."""
    sql = """
        insert into web_standings (season, team_id, ...)
        values (%(season)s, %(team_id)s, ...)
        on conflict (season, team_id) do update set
          ...
          updated_at = now()
    """
```

No `coalesce(excluded.x, ...)` here — the feed is always complete for every
column, so a straight overwrite is correct and a stale value must never survive.

### `etl/pull_standings.py` (new)

The standard `pull_*` skeleton: module docstring with `Usage:` / `Source:` /
`Writes:` lines, `from __future__ import annotations`, the verbatim dotenv
preamble, `# noqa: E402` imports, `log = logging.getLogger("pull_standings")`,
`run(season)`, `main(argv)`, `sys.exit(main())`.

```
python etl/pull_standings.py                 # current season
python etl/pull_standings.py --season 2025
```

`--season` is `type=int, default=date.today().year` (mirrors `pull_schedule.py`).
`run()` logs `"Upserted %d web_standings rows for %s"` and **warns if the row
count is not 30** — a short count means a division came back empty and the page
would silently render a missing table.

### `etl/fetch_team_logos.py` (new — ONE-SHOT, not in cron)

Downloads the 30 `team-cap-on-light/{id}.svg` marks, rewrites their fills per D5,
and writes `web/public/team-logos/{id}.svg`. Team ids come from the same
`/api/v1/teams?sportId=1` listing the site already trusts, or from the standings
feed itself.

```python
INK   = "#003049"   # navy   — keep in sync with @theme in web/app/globals.css
PAPER = "#fdf0d5"   # papaya

# Every non-white fill becomes ink; white becomes paper. Two-tone woodcut: the
# interior detail survives, which a mask/silhouette approach would destroy.
```

Match `fill="..."` case-insensitively; treat `#fff`, `#ffffff` and `white` as
white. Output is **committed to the repo** — the script is documented as run-once
and must never be added to `etl.yml`.

### `etl/backfill.py` (extend)

Add `import pull_standings  # noqa: E402` and call it in `run_season()`
immediately after `pull_schedule`; bump the `Step N/7` log labels to `N/8`.

### `.github/workflows/etl.yml` (extend)

Add a `pull_standings.py --season $SEASON` step after the `pull_schedule.py` step
in **both** jobs (`refresh` and `nightly-finals`) per D8. The light
`nightly-finals` job needs **no new pip deps**. Update the workflow's header
comment so the stated order reads **schedule → standings → boxscore → revalidate**
(required by `docs/DOC_MAINTENANCE.md`).

### Initial load

```
conda run -n MLBxBaZi python etl/apply_migration.py db/migrations/012_standings.sql
conda run -n MLBxBaZi python etl/pull_standings.py --season 2026     # expect 30 rows
conda run -n MLBxBaZi python etl/fetch_team_logos.py                 # expect 30 files
```

Past seasons (`--season 2024` / `2025`) return **final** standings and are worth
loading once so the page still works if it is ever pointed at a past season; not
required for the home module.

---

## 4. Web (Next.js)

### lib

- [`standings.ts`](../web/lib/standings.ts) (new):
  - `type StandingsRow` — snake_case fields matching the SQL aliases, `| null`
    where nullable (`wild_card_rank`, all the `text` race fields). Numeric casts
    happen **in SQL** per house style: `pct::float8 as pct`, `w::int as w`, …
  - `getStandings(season) -> Promise<StandingsRow[]>` — all 30 rows, ordered
    `division_id, division_rank`.
  - `DIVISION_ORDER: number[]` = `[201, 202, 200, 204, 205, 203]` — **AL East,
    AL Central, AL West, NL East, NL Central, NL West**. Written as ids with a
    comment naming each, because 203/204 are reversed (§1).
  - `groupByDivision(rows)` — returns groups in `DIVISION_ORDER`.
  - `wildCardRace(rows, leagueId) -> {inside: StandingsRow[], outside: StandingsRow[]}`
    — excludes `division_leader === true`; `inside` = `wild_card_rank` 1–3,
    `outside` = the rest by rank.
  - `playoffPicture(rows, leagueId) -> {seeds: StandingsRow[], chasers: StandingsRow[]}`
    — seeds 1–3 = division leaders ordered by `league_rank`; seeds 4–6 = WC1–3;
    chasers = next 3 outside the cut.
  - `clinchMarker(row) -> "z" | "y" | "x" | "e" | null` (D6).
  - Formatters mirroring the existing `avg3` / `int0` / `dec` convention in
    [`SeasonStatTable.tsx`](../web/components/SeasonStatTable.tsx), all rendering
    `"—"` for null: `pct3(v)` (drops the leading zero → `.599`),
    `record(w, l)` (→ `"7-3"`), `gb(text)` (passes MLB's string through, `"-"` → `"—"`),
    `diff(v)` (explicit `+` / `−` sign).

  **Pure helpers take rows and return rows** — no DB client, mirroring
  `batting-form.ts` / `pitching-form.ts`, so they stay unit-testable.

### components (server unless noted)

- [`SketchDefs.tsx`](../web/components/SketchDefs.tsx) (new) — one hidden
  `<svg aria-hidden>` holding `<filter id="sketch">` (`feTurbulence` +
  `feDisplacementMap`, `scale` ≈ 1.5). Rendered **once** in
  [`layout.tsx`](../web/app/[locale]/layout.tsx). Static markup, no client JS.
- [`TeamLogo.tsx`](../web/components/TeamLogo.tsx) (new) — a 28px `<img>` pointing
  at `/team-logos/<teamId>.svg`, `alt` = team name, `filter: url(#sketch)` applied
  by class. Plain `<img>`, **not** `next/image` (local static SVG; avoids a
  `next.config` change entirely). Falls back to a `teamAbbr()` text badge when no
  file exists.
- [`StandingsTable.tsx`](../web/components/StandingsTable.tsx) (new) — one division
  table. Markup follows `SeasonStatTable.tsx` exactly: wrapper
  `rounded-lg border border-navy/10 bg-white/50 p-4`, inner `overflow-x-auto`,
  table `w-full min-w-[46rem] text-right text-sm tabular-nums`, header row
  `border-b border-navy/15 text-[11px] uppercase tracking-wide text-navy/55`,
  body rows `border-b border-navy/5 text-navy last:border-0`, first column
  `text-left`. **Jays row** (`team_id === 141`) gets `bg-brick/10 font-medium`.
  Clinch marker rendered as a superscript before the team name.
- [`WildCardTable.tsx`](../web/components/WildCardTable.tsx) (new) — WC1–3, then a
  **cut line** (`border-t-2 border-brick` + a small `text-brick` label), then the
  chasers. Columns Team · W · L · PCT · WCGB · L10 · STRK.
- [`PlayoffRace.tsx`](../web/components/PlayoffRace.tsx) (new) — the home AL block:
  seeds 1–6 numbered, cut line, 3 chasers. Jays row highlighted and, when the Jays
  are inside, their seed number called out.

### page — [`app/[locale]/standings/page.tsx`](../web/app/[locale]/standings/page.tsx) (new)

Server component. `export const revalidate = 3600` (matches the home page —
standings move daily, and the cron hits `/api/revalidate` anyway).
`await params` → `setRequestLocale(locale)` → `getTranslations("Standings")`.
Season via the D9 fallback. Container `mx-auto max-w-5xl px-4 py-10`; `h1`
`font-display text-2xl uppercase tracking-wide text-navy`; section headings
`font-display text-xl uppercase tracking-wide text-navy`. Order: AL divisions →
AL Wild Card → NL divisions → NL Wild Card → clinch legend.

### home wiring — [`app/[locale]/page.tsx`](../web/app/[locale]/page.tsx) (extend)

`season` is already resolved before the hero fetches, so add
`getStandings(season)` to the existing `Promise.all` rather than a fourth serial
`await`. Render between the hero `</section>` and `<ScheduleCalendar>`:

```
<section className="mt-8">   AL East table  +  PlayoffRace  +  "Full standings →"
```

wrapped in [`ScorecardFrame`](../web/components/ScorecardFrame.tsx)
(`seedKey="al-east-standings"`, default `variant="card"`) with the inner content
carrying `relative z-10` — the frame's required contract. Self-hides when
`standings.length === 0` (offseason before the feed populates).

### nav — [`Header.tsx`](../web/components/Header.tsx) (extend)

One more `<Link href="/standings">` between `players` and `about`, using the
locale-aware `Link` from `@/i18n/navigation`, same
`transition-colors hover:text-steel` class as its siblings.

No change to [`api/revalidate/route.ts`](../web/app/api/revalidate/route.ts) — it
already calls `revalidatePath("/", "layout")`, which busts the new route.

---

## 5. i18n — `web/messages/{en,zh-TW}.json`

New **`Standings`** namespace, written **English first**, then mirrored
key-for-key and in the same position (after `Calendar`) in `zh-TW.json`.

- Page / sections: `title`, `subtitle`, `alEast`, `alCentral`, `alWest`, `nlEast`,
  `nlCentral`, `nlWest`, `alWildCard`, `nlWildCard`, `cutLine`, `updated`.
- Home module: `homeTitle`, `playoffRaceTitle`, `seed` (ICU `{n}`), `fullStandings`.
- Legend: `legendZ`, `legendY`, `legendX`, `legendE`.
- Empty state: `empty`.

**Column abbreviations stay English in both locales** per the project rule —
`W`, `L`, `PCT`, `GB`, `WCGB`, `L10`, `STRK`, `RS`, `RA`, `DIFF`, `X-W/L`,
`HOME`, `AWAY` are baseball jargon, as are the `z` / `y` / `x` / `e` markers
themselves (only their *explanations* are translated). Team names stay English
(`Toronto Blue Jays`, `New York Yankees`) exactly like player names. Division
names *are* translated in prose headings.

---

## 6. Formulas & conventions

```
PCT      = W / (W + L)                    # stored from the API, displayed .599 (no leading zero)
GB       = MLB's own string               # '-' = leads; NEVER computed or parsed locally (D3)
WCGB     = MLB's own string               # '+9.5' = ahead of the cut; '-' = IS the WC3 reference
DIFF     = runsScored - runsAllowed       # stored as run_diff; displayed with an explicit +/-
X-W/L    = expectedRecords['xWinLoss']    # Pythagorean expectation, from the API (not derived)
L10      = splitRecords['lastTen']        # displayed "7-3"
STRK     = streak.streakCode              # 'W2' / 'L3'
seeds    = 1-3 division leaders by league_rank; 4-6 = wild_card_rank 1-3
cut line = after wild_card_rank === 3
marker   = z: clinched && league_rank===1 | y: division_champ
           x: clinched && !division_champ | e: elimination_number === 'E'
```

Ordering is **always** by `division_rank` / `league_rank` / `wild_card_rank` —
never by a parsed GB.

---

## 7. What NOT to change

| Item | Reason |
|---|---|
| `web_games` | Jays-only by design. Standings are league-wide and belong in their own table; do not widen `web_games` to hold other clubs' records. |
| `plate_alignment` invariant / `web_statcast_events` | Untouched by P11. No standings consumer reads plate coordinates. |
| Localized team-name column | Same rule as `name_tc` on `web_players`: **do not add one**. Team names stay English in both locales. |
| Existing migrations `001`–`011` | Never reordered or edited. `012` is purely additive (new table). |
| `next.config` image config | D5's local-SVG approach exists specifically so no `remotePatterns` entry is needed. If someone switches to hotlinked logos, that decision must be re-opened, not patched around. |
| `ScorecardFrame` internals | The home module is a *consumer* (`seedKey` + `relative z-10` children), like `HeroCard`. Do not fork the frame. |
| Player / batting / pitching / fielding / game pages | Untouched by P11. |

---

## 8. Done-when checklist

| # | Criterion |
|---|---|
| 1 | Migration applied: `web_standings` exists, 38 columns, PK `(season, team_id)`, both indexes present. |
| 2 | `pull_standings.py --season 2026` writes exactly **30 rows**; re-running is idempotent (still 30, `updated_at` advances). |
| 3 | `games_back` / `wc_games_back` / `elimination_number` are `text` and hold MLB's raw strings — a row with `'-'`, one with `'+9.5'` and one with `'E'` all round-trip unmodified. |
| 4 | `wild_card_rank` is NULL for exactly the division leaders (6 rows), non-null for the other 24. |
| 5 | `/en/standings` and `/zh-TW/standings` render all six divisions with **AL East first**, and NL West/East are labelled correctly (203/204 not transposed). |
| 6 | Both Wild Card tables exclude division leaders and place the cut line **after WC3**. |
| 7 | Home page shows the AL East table + AL Playoff Race between "Today's Blue Jays" and the schedule calendar, inside a `ScorecardFrame`, with the Jays row highlighted and a working link to `/standings`. |
| 8 | 30 recoloured logos exist in `web/public/team-logos/`, render two-tone navy-on-papaya at 28px with interior detail intact, and a missing file falls back to the abbr badge without an error. |
| 9 | Column abbreviations English in zh-TW; brand tokens only (no ad-hoc hex outside the documented `INK` / `PAPER` constants); **no new npm or pip dependencies**. |
| 10 | `pnpm -C web exec tsc --noEmit` + `pnpm -C web lint` clean; docs reconciled per `DOC_MAINTENANCE.md` (incl. the D3 anti-index entry in `DATA_MODEL.md`). |

---

## 9. Candidate backlog (not built in P11)

| Candidate | Data dependency | Note |
|---|---|---|
| Playoff-race chart (GB over time) | Daily standings history — a `standings_date` column + PK change | The single reason to revisit D2. Additive migration, no rewrite. |
| Magic-number countdown widget | `magic_number` (**already stored**) | Pure UI; deferred only to keep the home page from growing further. |
| Head-to-head records | `records.divisionRecords[]` / a per-opponent feed | Available in the same payload; not stored, no consumer yet. |
| Strength of remaining schedule | `web_games` for all 30 clubs | Would require a league-wide schedule pull — a real ETL expansion. |
| League / MLB view toggle | none | D1 renders both leagues statically; a toggle is polish. |
| One-run and extra-inning splits | `splitRecords` types `oneRun`, `extraInning` | In the payload, dropped from `012` to keep the table honest about what the UI shows. |

---

## 10. Reconciliation — as built (2026-09-06)

Everything above shipped as specified. Deltas and observations found during the build:

| # | Observation | Impact |
|---|---|---|
| 1 | **The `#sketch` filter cannot be applied via a Tailwind class.** The specced `[filter:url(#sketch)]` utility *does* generate (`filter: url("#sketch")`), but it lands in an external stylesheet — and a fragment-only `url()` in external CSS resolves against the **stylesheet's** URL rather than the document's in WebKit/Chromium, so the filter silently no-ops. Moved to the inline `style` attribute on the `<img>` (which already carried width/height), where it unambiguously resolves against the document. Commented at the call site so nobody "tidies" it back into a class. | `TeamLogo.tsx` only. The specced visual result is unchanged. |
| 2 | The spec's §2 column count said **35**; the DDL as written declares **38**. Corrected in §2 and §8 before the build (the miscount was in the prose, never in the SQL). | None — caught pre-implementation. |
| 3 | Added one component the spec didn't name: **`HomeStandings.tsx`**. `StandingsTable` is 14 columns / `min-w-[46rem]`, far too wide for the home card, so the home module needed its own compact 7-column AL East table. Bundling it with `PlayoffRace` and the two `ScorecardFrame`s keeps `page.tsx` to a single `<HomeStandings rows={standings} />` line, matching how the hero cards are wired. | One extra file vs the spec's §4 list. |
| 4 | `TeamCell` (logo + clinch marker + name, with a `short` variant for narrow tables) was factored into `TeamLogo.tsx` rather than duplicated across the four table components. | Refactor detail. |
| 5 | Logo fallback is **not** an `onError` handler (that would force every logo into a client component — ~150 client islands on the standings page). Instead `hasTeamLogo()` in `lib/team-abbr.ts` gates on the existing 30-club `TEAM_ABBR` map. Verified the generated file set and the map are **exactly** the same 30 ids, so the proxy is sound and the whole page stays server-rendered with zero client JS. | Checklist #8 satisfied without a client boundary. |
| 6 | Loaded **2024 and 2025** as well as 2026 (the spec called this optional). Past seasons return that season's final standings, so the offseason fallback has real data to show. 90 rows total. | None. |
| 7 | Verified live rather than assumed: 38 columns; 30 rows/season across 3 seasons; re-running `pull_standings.py` leaves 30 rows with `updated_at` advanced (idempotent); `wild_card_rank` NULL on exactly the 6 division leaders; `'-'` / `'+9.5'` / `'E'` all round-trip unmodified (49 rows carry `'E'`); NL East renders ATL/PHI/MIA/WSH/NYM and NL West LAD/ARI/SD/SF/COL — i.e. **203/204 are not transposed**; all 30 logo files referenced; zh-TW keeps `WCGB`/`STRK`/`X-W/L` and full English club names while translating headings and prose; home order is hero → standings → calendar. | All of §8 confirmed except a human eyeball on the logo rendering. |
| 8 | **Two clubs' logos came back un-recoloured (KC 118, WSH 120).** The spec's recolour rule assumed every mark carries `fill="..."` attributes; those two instead declare their colour once as a CSS rule inside `<defs><style>` (`.cls-1 { fill: #0031a7; }`), which an attribute-only regex never touches — so they rendered in club colours next to 28 navy ones. `recolour()` now rewrites both forms. Audited all 30 afterwards: zero off-palette fills, no gradients, no coloured strokes anywhere. Note KC and WSH are single-fill marks upstream, so they are solid navy by nature, not by bug. | `fetch_team_logos.py` + regenerated assets. |
| 9 | **Standings tables restyled to the hand-drawn scorecard look** (user request after first ship). They no longer use the plain `border-navy/10 bg-white/50` card: each table now sits in a `panel` `ScorecardFrame` (new variant — `card` minus the hover lift, since a table has no click affordance), with the calendar's navy `font-display` header bar and papaya ledger striping. Shared class strings live in `components/standings-chrome.ts`. `rowBg()` resolves to a single class string because stacked equal-specificity utilities (`odd:` vs `bg-brick`) are resolved by stylesheet order, so the Jays highlight would otherwise be flaky. | 9 rough.js frames on the page (6 divisions + 2 wild card + legend). |
| 10 | **Browser tab icon switched to the recoloured Jays cap** (`/team-logos/141.svg`, via `metadata.icons`). The stock `app/favicon.ico` had to be **deleted**, not just overridden: Next's file convention auto-serves it at `/favicon.ico` regardless of the metadata, so both icons would have been advertised. Verified after: exactly one `<link rel="icon">`, pointing at the SVG (served 200, `image/svg+xml`), and `/favicon.ico` now 404s. | Favicon is navy-on-papaya, so it can read faint on a dark browser theme — a deliberate consequence of using the site-palette asset. |
| 11 | **`/standings` restructured into three views** (user request): American League, National League, Wild Card — the last with its own retro AL/NL switch. Done as a **client** switcher (`StandingsTabs.tsx`) rather than `?view=` links, following `RosterExplorer`: all three panels derive from the same 30 rows already fetched, so a navigation would refetch nothing and would drop the route from **● SSG to ƒ dynamic**. Panels are server-rendered and passed in as props; only 3 tables mount at a time while the other panels ride along in the RSC payload for instant switching. Build confirms the route is still ● SSG. | §4's single-scroll layout is superseded. |
| 12 | Chased a `MISSING_MESSAGE: Standings.tabWildCard` browser error that turned out **not** to be a code bug: the served payload contained the new keys in both the failing and the passing run, so the error came from an already-open browser tab running the pre-edit client bundle over HMR. The project's documented Turbopack-staleness remedy (stop dev, delete `web/.next`, restart) plus a hard refresh clears it. | None on production. Worth remembering that curl cannot reproduce client-side i18n errors — only a real browser surfaces them. |
| 13 | `pnpm exec tsc --noEmit` clean; `pnpm lint` clean apart from the **pre-existing** `SprayChart.tsx` `INFIELD_DIAMOND` unused-var warning (already noted in P10 §10 #8). i18n key parity: 197 keys in each locale, identical namespace order. | No new debt. |
