---
name: share-card
description: Make social share cards (PNG) for Suyu's Jays Notes — an article's card, a "Baseball 101" glossary card that explains a stat, or a Blue Jays news card — in X (1200×675) and Instagram (1080×1440) sizes, in English and zh-TW, with every number read from the database, plus ready-to-paste X and Instagram captions. Use whenever the user wants a share image, 圖卡, 分享圖, IG 圖, X 圖 or a post for an article, a baseball term (名詞, 棒球 101, "explain wRC+") or a piece of Jays news (時事), or types /share-card, even if they never say PNG or card.
---

# Share cards

The site's hand-drawn scorecard (rough.js double frame, offset print shadow, papaya stat cards)
as PNGs for social posts. One renderer draws every kind; a normal run only adds a spec and
renders it.

| Kind | Tag | Paper | Spec lives in | Render |
|---|---|---|---|---|
| `article` | ARTICLE / 文章 | parchment | the registry entry's `card` field (`web/content/articles/index.ts`) | `og`, `x`, `ig` |
| `glossary` | BASEBALL 101 / 棒球名詞 + No. 001 | steel | `web/content/cards/glossary/<slug>.json` | `x`, `ig` |
| `news` | NEWS / 時事 + date stamp | navy | `web/content/cards/news/<YYYY-MM-DD-slug>.json` | `x`, `ig` |

| Size | Pixels | Used for |
|---|---|---|
| `og` | 1200×630 | link previews (X / LINE / Facebook). The article's is the site's own `opengraph-image`, built automatically; render it only to check it |
| `x` | 1200×675 | an X image post (16:9, not cropped in the timeline) |
| `ig` | 1080×1440 | an Instagram post (3:4: shown whole in the feed and the profile grid) |

The code: `web/lib/share-card/` (`card.tsx` layouts, `tokens.ts` papers, `rough.tsx` frame, `fonts.ts`,
`stats.ts` DB readers, `spec.ts` spec types) and the dev route `web/app/api/dev/share-card/route.ts`.

## Ground rules

- **The database is the source of truth**, as in `/publish-article`. The article and glossary cards
  store DB *keys* and read the values when rendered. A news card's facts are written values, so
  check every one against the DB first. A fact the DB doesn't hold (a trade, an injury, a quote)
  gets its outlet as `source` and is listed in the report as not checkable.
- **English first, then zh-TW.** Every card ships in both. Player names and baseball jargon (wRC+,
  OPS, FIP, Statcast…) stay English in zh-TW; team names may be translated.
- **The design lives only in `web/lib/share-card/`.** Colours are the `@theme` tokens re-declared as
  hex in `tokens.ts`. Don't hand-tune a single card. If a layout breaks on reasonable copy, fix
  `card.tsx` and re-render every kind (the site's link previews use it too).
- **The brand is `SITE`** (`web/lib/site.ts`): Suyu's Jays Notes, never the old name.
- **Don't commit or push** unless the author asks.

## Workflow

### 1. Pick the kind and gather the content

- `/share-card article <slug>`: the slug must be in the registry. Read the article's MDX to see what
  its argument rests on.
- `/share-card glossary <term>`: e.g. `wRC+`, `FIP`, `Barrel%`.
- `/share-card news <what happened>`: the author's summary, a link or a date.

Ask only when the kind or the story is unclear.

### 2. Check the facts

- Season / team numbers: `conda run -n MLBxBaZi python etl/season_report.py --season <S> --vs <S-1>`
  (SELECT-only, writes the git-ignored `reports/season-review-<S>/`; see `/publish-article` step 2
  for which file holds what).
- Anything else: a read-only query through `etl/db.py`'s `connect()`. Check names in
  `docs/DATA_MODEL.md` first, and read rates from the `015` / `022` / `025` views. Game results:
  `web_games` (filter `game_type`). Standings: `web_standings` (GB columns are display text). A
  Jays box-score line: `web_player_game_stats`.
- Never create a venv; the project uses the conda env `MLBxBaZi`.

Keep a claim → DB value → source table for the report.

### 3. Write the spec

Types are in `web/lib/share-card/spec.ts`; the existing specs are working examples.

**Article.** Add (or check) `card` on the registry entry:

```ts
card: { season: 2026, stats: ["record", "r_per_g", "ra_per_g"] },
```

- 2–3 keys: `"record"` or a team metric key from `web/lib/team-metrics.ts` (`r_per_g`, `ops`,
  `wrc_plus`, `k_pct`, `ra_per_g`, `era`, `fip`, `oaa`…; the same list `/publish-article` uses for
  `TeamStats` highlights). Pick the numbers the article's argument rests on.
- Each stat card shows the value, the change vs the prior season, the MLB rank among 30 and the
  prior season's value, all from the `022` views and game results.
- Without `card` an article still gets a title-only card.

**Glossary** (`content/cards/glossary/<slug>.json`, slug = kebab-case term, `wrc-plus`):

```json
{
  "kind": "glossary", "slug": "wrc-plus", "date": "2026-10-11", "number": 1,
  "term": "wRC+", "aka": "Weighted Runs Created Plus",
  "definition": { "en": "…", "zh-TW": "…" },
  "scale": [{ "value": "100", "label": { "en": "League average", "zh-TW": "聯盟平均" } }],
  "example": { "player": 665489, "stat": "wrc_plus", "seasons": [2025, 2026] }
}
```

- `number`: the highest `number` in `content/cards/glossary/*.json` + 1. Never reuse or renumber a
  number; it is the series' identity on the Instagram grid.
- `term` keeps its case (wRC+, not WRC+). `aka` = what the abbreviation stands for (optional).
- `definition`: one or two plain sentences a new fan follows. Keep the English to about 200
  characters, or it won't fit the landscape card.
- `scale`: 2–3 reading-guide rows (what's average, good, great). These are conventions, not DB
  values, but they must agree with the league context in the fact pack.
- `example` (optional): a Blue Jay whose numbers make the term concrete (a big change, an extreme).
  `stat` is a key of `PLAYER_STAT` in `stats.ts`; `seasons` must be seasons he played for Toronto
  (`web_player_season_stats` is Jays-only). Look up his `mlbam_id` in the DB.

**News** (`content/cards/news/<date>-<short-slug>.json`):

```json
{
  "kind": "news", "slug": "2026-09-23-eliminated", "date": "2026-09-23",
  "headline": { "en": "…", "zh-TW": "…" },
  "deck": { "en": "…", "zh-TW": "…" },
  "facts": [{ "label": { "en": "Game 1 vs BAL", "zh-TW": "第一戰 vs BAL" }, "value": "L 2-4" }],
  "source": "MLB Stats API"
}
```

- `date` = the day it happened (it becomes the stamp). The `slug` starts with it.
- `headline`: about 60 English characters at most. `deck` (optional): about 140.
- `facts` (optional, up to 3): short values, each checked in step 2.
- `source`: "MLB Stats API" when the DB backs every fact (its games and standings come from there),
  otherwise the outlet you took it from.

### 4. Render

From `web/`, start `pnpm dev --port 3100` in the background and wait for "Ready". Next allows one dev
server per project. If it says another is running, use that one at its port (usually 3000) and
leave it alone; it's the author's.

```bash
OUT=reports/share-cards/<kind>/<slug>; mkdir -p "$OUT"   # from the repo root; git-ignored
for size in x ig; do for loc in en zh-TW; do
  curl -s -o "$OUT/$size-$loc.png" -w "%{http_code} $size-$loc\n" \
    "http://localhost:3100/api/dev/share-card?kind=<kind>&slug=<slug>&size=$size&locale=$loc"
done; done
```

Add `og` to the sizes for an article. A 400 means a bad parameter. A 404 means no spec: the file
name, `kind` and `slug` must all match, and an article must be in the registry. The route answers
only under `next dev`; in production it returns 404 on purpose.

### 5. Check every PNG

Open each one with `Read`:

- **Fit:** the title / headline / definition doesn't run into the stat cards or the footer, and
  nothing is cut off. Fix the copy first (shorter, or reworded so a CJK line doesn't break a
  two-character word).
- **Language:** a zh-TW card that came out in English means the Chinese font didn't download.
  Re-render it.
- **Numbers:** they match the fact table.
- **Contrast:** secondary text on the paper stays readable.

Then stop the dev server if you started it, and confirm the port is free. A leftover `node` process
can keep listening after the task stops; end that PID too.

### 6. Report to the author

Write in the language the author used (usually Traditional Chinese):

1. **Files:** the PNG paths and the spec / registry change, not committed.
2. **Facts:** the claim → DB → source table, and anything not checkable.
3. **Post copy, English and zh-TW:**
   - **X** (attach `x-<locale>.png`): at most 280 *weighted* characters. X counts each CJK
     character as 2 and any link as 23, so a zh-TW post with a link holds about 125 Chinese
     characters. Count before handing it over. An article post carries its URL (`SITE.url` +
     `/<locale>/articles/<slug>`): a post with an image shows no link card, so the link goes in the
     text. Posting the bare link instead shows the `og` card. Glossary / news posts link a site
     page when one fits (`/season/<year>`, `/players/<id>`, `/standings`). One or two hashtags at
     most (#BlueJays).
   - **Instagram** (upload `ig-<locale>.png`): links in captions aren't clickable, so articles say
     "link in bio" / 連結在個人檔案. A hook line, 2–4 short lines, then 5–10 hashtags on their own:
     #BlueJays #TorontoBlueJays #MLB #Baseball plus the topic (#Sabermetrics for Baseball 101). The
     zh-TW caption may add #藍鳥 #棒球; names and jargon stay English.
4. **Article posts:** once posted, send back the X / Instagram post URL so the registry's `discuss`
   field links "Join the discussion" to it.

## Adding a kind

1. `tokens.ts`: add it to `CardKind` and `KIND`. Each kind gets its **own paper**: one shared paper
   across kinds made the feed monotonous. Offer the author the spares in `PAPERS` first (`bulletin`
   pale red, `indexCard` pale blue-grey, `navyBoard`, `lava`). Renders of them are in
   `reports/share-cards/paper-review/` if that folder is still on this machine.
2. `spec.ts`: the spec type, `CARD_KINDS`, and where its JSON lives.
3. `card.tsx`: a body component with landscape and portrait layouts; render it from
   `renderShareCard`.
4. `web/messages/en.json` + `zh-TW.json`: any new `ShareCard` strings, English first.
5. Render every size × locale of every kind, since the code is shared.

Satori (next/og) rules that have bitten before:

- A `<div>` with more than one child needs `display: flex`. Write a number as `{String(n)}`.
- Don't return a Fragment from a body component: Satori lays its children out in a row. Wrap them
  in a column flex `<div>`.
- No CSS variables or `color-mix()`: use the hex and `mix()` in `tokens.ts`.
- A portrait card with little content: let the body `justifyContent: center` share the space.
  The footer may wrap, with the URL on `marginLeft: auto`.
