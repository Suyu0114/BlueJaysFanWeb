---
name: publish-article
description: Publish one of Suyu's finished articles on the Suyu's Jays Notes site. It takes a draft (PDF, .docx, Markdown or pasted text — usually Chinese, often with screenshots of the site's charts) and turns it into web/content/articles/<slug>/{en,zh-TW}.mdx plus a registry entry. It swaps every screenshot for the live figure component, fact-checks every number against the Supabase database (the database wins over the draft), and verifies both locales render. Use whenever the user wants to put, add, post or publish an article, blog post, write-up, season review or 文章 on the website, hands over an article draft for the site, or says "幫我把這篇放上網站", even if they never say MDX or publish.
---

# Publish an article

The author writes the analysis; this skill turns the draft into a page on the site.
The page is built from:

- Markdown prose, and
- the site's own chart modules, embedded live by season.

Each article lives in `web/content/articles/<slug>/en.mdx` + `zh-TW.mdx` and is listed in
`web/content/articles/index.ts`. The routes (`/articles`, `/articles/[slug]`), the typography
(`web/mdx-components.tsx`) and the figure components (`web/components/article/figures.tsx`) already
exist. A normal run only adds content.

## Ground rules

- **The database is the source of truth; the draft's numbers are a reference.** The author writes
  from screenshots and spreadsheets that may be stale. The site's ETL also gets fixed over time;
  one position-grouping fix changed several by-position totals after the first article was drafted.
  Readers see a live chart right next to each sentence, so a sentence that disagrees with its chart
  looks wrong even when it was right on the day it was written.
  - Check every number.
  - Where the DB differs, use the DB value.
  - When a correction flips a claim (e.g. "outfield lost the most" → a different position did),
    rewrite that sentence minimally, in the author's voice, and report it.
- **English is the primary language.** The site's main readers are English-speaking Toronto fans.
  - Always produce both `en.mdx` and `zh-TW.mdx`. If the draft is Chinese, `zh-TW.mdx` is the
    author's text (with the fixes below) and `en.mdx` is a faithful translation.
  - The English should read as natural, plain English, not translationese. Keep the author's
    structure, claims and tone.
- **Site language rules hold inside articles too.** Player names and baseball jargon (OPS, wRC+,
  FIP, Off, Def, OAA, Hard-hit%…) stay English in zh-TW.
  - Write `Okamoto`, not 岡本和真.
  - Team and park names may be translated.
  - The site is **Suyu's Jays Notes**, never the old name "Blue Jays Fan Hub". `SITE` in
    `web/lib/site.ts` is the authority.
- **Figures are live components, never screenshots.** A screenshot of a site module becomes that
  module's figure tag. Real images (photos, diagrams) are the only PNGs, under
  `web/public/articles/<slug>/`.
- **Keep the author's voice.** Fix numbers, rule violations and unambiguous typos (a duplicated
  character, a wrong character). Anything ambiguous goes in the report, unchanged.
- **Don't commit or push** unless the author asks. Publishing = their `git push`.

## Workflow

### 1. Read the whole draft

- **PDF:** use `Read` with `pages`.
- **.docx:** `pandoc -t markdown` if available; otherwise the docx skill.
- **Markdown:** read it directly.

Write down:

- the title, the date and which season(s) it covers;
- the sections;
- every figure: which page, what it shows, any boxes or highlights drawn on it, and whether the
  author noted it doesn't exist on the site yet;
- every factual claim with a number in it, plus the comparative claims ("the most", "the only",
  "2nd-lowest").

### 2. Build the fact pack

Run this (SELECT-only, never writes the DB; output is git-ignored):

```powershell
conda run -n MLBxBaZi python etl/season_report.py --season <S> --vs <S-1>
```

It writes `reports/season-review-<S>/`. Never create a venv; the project uses the conda env
`MLBxBaZi`. Where to look:

| Claim about… | File |
|---|---|
| Record, RS / RA, run diff, x-W/L, division finish / GB, splits (home / road / one-run / blowouts / vs division / vs ≥ .500), streaks, month by month (W-L, RS-RA, R/G, RA/G) | `team.md` |
| Team stats vs the MLB average + rank among 30 (R/G, AVG…ISO, K%, BB%, Hard-hit%, xwOBA, RA/G, ERA, FIP, HR/9, OAA, rotation / bullpen…) | `team_trends.md` / `.csv` |
| Value by position: HR / OPS / Off / WAR per group, each position vs MLB, who made up each group | `positions.md` |
| A batter's line: PA, HR, wRC+, Off, Def, OAA, WAR (+ discipline, batted balls) | `batters.csv` (`batters.md` = the both-seasons cohort) |
| A pitcher's line: IP, GS, SV, ERA, FIP, WHIP, K%, BB%, WAR | `pitchers.csv` |
| Newcomers, departures, trades, lines with other clubs | `roster_moves.md` |
| League averages / reference rates | `league_context.md` |

For anything the pack doesn't hold, run a read-only query through `etl/db.py`'s `connect()`. Check
table and column names in `docs/DATA_MODEL.md` first; it also lists "columns that don't exist".
Read rates from the `015` / `022` / `025` views; never re-derive one.

### 3. Fact-check every claim

Build a table: claim → draft value → DB value → source file → action (ok / corrected / rewritten /
not checkable). Things that commonly go wrong:

- **Value by position.** Quote `positions.md`, which is the site chart's grouping: by PA at each
  position, OF = LF+CF+RF, DH includes PH. Never regroup by each player's "primary position"; that
  gives different totals than the chart beside the sentence.
- **Position labels.** `web_players.position` is a player's *current* position, not his position in
  a past season.
- **Season vs part-season.** A player's season HR is not his HR at one position. E.g. Barger hit
  21 HR in 2025, but only 10 of them as an outfielder.
- **Derived numbers.** Recompute sums, differences, shares and weighted averages, and show the
  arithmetic in the report.
  - IP is baseball notation: `170.1` = 170⅓ innings. Convert to outs before weighting an ERA.
- **Rounding.** Match what the site displays: rates like `.247`, one decimal for Off / Def / WAR,
  percentages to one decimal, half-up (4.625 → 4.63).
- **2026 zone stats.** Chase% / Zone% / Z-Swing% changed definition in 2026. A raw 2025 → 2026
  delta needs the caveat or the pack's net-of-shift figure.
- **Not in the DB** (an elimination date, someone's role as closer, a trade story). Keep the author's
  wording if nothing contradicts it, and list it as "not checkable".

### 4. Map the figures

Every figure takes `season` and an optional `caption`. They are registered globally, so MDX needs
no imports:

| Screenshot of… | Tag |
|---|---|
| The season header cards (record, PCT, RS / RA, run diff, x-W/L, finish, win streak) | `<SeasonRecord season={2026} />` |
| "Team stats vs MLB": offense or run prevention | `<TeamStats season={2026} block="offense" highlight={["k_pct", "iso"]} />` (`block` = `"offense"` / `"prevention"`, omit for both) |
| Value by position chart | `<PositionValue season={2026} metric="hr" />` (`metric` = `war` / `off` / `hr` / `ops`; `mode` = `compare` / `change` / `vsMlb`) |
| "Each position vs MLB" table | `<PositionVsMlb season={2026} />` |
| Splits table | `<SeasonSplits season={2026} highlight={["home", "away"]} />` (keys: `home`, `away`, `oneRun`, `blowouts`, `vsDivision`, `vsWinning`, `vsLosing`) |
| Month by month (runs-per-game chart + record table) | `<MonthByMonth season={2026} />` |
| A non-data image | `<Figure caption="…">![alt](/articles/<slug>/x.png)</Figure>` |

- **Boxes the author drew** on a table become `highlight` rows. Highlight only the rows the text
  talks about. `TeamStats` takes the metric keys in `web/lib/team-metrics.ts` (`r_per_g`, `avg`,
  `obp`, `slg`, `ops`, `iso`, `wrc_plus`, `k_pct`, `bb_pct`, `hr_pct`, `sb_per_g`, `bat_war`,
  `brl_pct`, `hard_hit_pct`, `xwoba`, `ra_per_g`, `era`, `fip`, `whip`, `pit_k_pct`, `pit_bb_pct`,
  `pit_k_bb_pct`, `hr9`, `pit_war`, `pit_brl_pct`, `pit_hard_hit_pct`, `pit_xwoba`, `oaa`).
- **MDX props aren't type-checked.** A wrong key silently highlights nothing, and a season with no
  data renders a visible "no data" line.
- **A chart the site doesn't have yet.** Stop and ask the author, with a recommendation:
  - **Usually:** build it as a site module (a component in `web/components/season/` or
    `web/components/team/`, shown on its page too), then add a figure wrapper in `figures.tsx`.
    Follow how `MonthlyRecordPanel` and `MonthByMonth` were added.
  - **Otherwise:** a one-off `Figure` image.
  - Don't fork a second copy of an existing module just for an article.

### 5. Write the files

**Registry** (`web/content/articles/index.ts`): add the entry at the top (newest first).

- `slug`: kebab-case, e.g. `2026-season-review`, `2027-bullpen`. It is the URL; don't change it
  after publishing.
- `date`: the draft's date, or today.
- `dataAsOf`: the day you ran the fact pack.
- `locales`: `["en", "zh-TW"]`.
- `title` / `summary`: both languages. The summary is one or two sentences for the list card and
  link previews. The title also goes on the article's share image (`opengraph-image.tsx`, built
  automatically), so keep it to a line or two.
- `discuss`: leave it out at first. The site has no comments; readers discuss each article on its
  X / Instagram post. Until the author posts and sends the URL, the article links the profile
  instead. When they send it, add `discuss: { x: "https://x.com/suyujaysnotes/status/…" }`.

**MDX bodies:**

- **Structure:** start with the first `##` section. The title comes from the registry, so no `#`
  heading. Put a short "Sources and notes" / 資料來源與註記 section last, linking the site pages
  used (`[2026](/season/2026)`).
- **Figures:** each figure tag sits on its own line with blank lines around it, placed where the
  screenshot was.
- **Links:** internal links are site paths (`/season/2026`, `/players/665489`); they keep the
  reader's locale.
- **Escaping:** a literal `{` or `<` in prose breaks MDX. Write `\{` or `&lt;`, or rephrase.
- **Comments:** `{/* … */}`. Don't leave any in a finished article.

### 6. Verify

From `web/`:

1. `pnpm exec tsc --noEmit` and `pnpm lint`. Lint has one known pre-existing warning (`SprayChart`
   `INFIELD_DIAMOND`).
2. Start `pnpm dev --port 3100` in the background and wait for "Ready". Next allows one dev server
   per project. If it says "Another next dev server is already running", use that one at its port
   (usually 3000) and leave it alone; it's the author's.
3. Fetch `/en/articles`, `/en/articles/<slug>` and `/zh-TW/articles/<slug>`. Check:
   - each returns 200;
   - each section heading is there;
   - no figure rendered the "no data" placeholder (the `border-dashed border-navy/25` box);
   - the key DB numbers appear in the HTML.
4. Stop the dev server if you started it.
5. Run `pnpm build` when the article added or changed components. The build should list both
   locales under `/[locale]/articles/[slug]`.

Charts mount when scrolled into view, so the fetched HTML can't prove they drew. Ask the author to
look at the page in a browser.

### 7. Report to the author

Write in the language the author used with you (usually Traditional Chinese). Keep it short and
concrete:

1. **Where it is:** the two MDX files + registry entry, the URLs to preview, not committed.
2. **Numbers corrected:** a table of claim | draft | database | source.
3. **Sentences rewritten** because a correction changed the claim: before → after.
4. **Other edits:** names (e.g. 岡本和真 → Okamoto), brand, typos fixed.
5. **Left as written:** possible typos or unclear phrasing you didn't touch, and claims the DB
   can't confirm.
6. **Figures:** screenshot → tag mapping, plus anything that needs a new component or the author's
   decision.
7. **Needs your eyes:** the English translation, and the client-side charts in a browser.
8. **After you publish:** post the link on X (the share image shows automatically), then send back
   the post's URL so the article's "Join the discussion" links straight to it.
