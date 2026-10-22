---
name: share-card
description: Make social share cards (PNG) for Suyu's Jays Notes — an article's card and its series of takeaway posts, a "Baseball 101" glossary card that explains a stat, or a Blue Jays news card — in X (1200×675) and Instagram (1080×1440) sizes, with every number read from or checked against the database, plus ready-to-paste X and Instagram captions and the social queue updated. Use whenever the user wants a share image, 圖卡, 分享圖, IG 圖, X 圖, 貼文 or a post for an article (or to split one into posts), a baseball term (名詞, 棒球 101, "explain wRC+") or a piece of Jays news (時事), asks what to post next, or types /share-card, even if they never say PNG or card.
---

# Share cards

The site's hand-drawn scorecard (rough.js double frame, offset print shadow, papaya stat cards)
as PNGs for social posts. One renderer draws every kind; a normal run only adds a spec, renders
it, writes the captions and updates the queue.

| Kind | Tag | Paper | Spec lives in | Render |
|---|---|---|---|---|
| `article` | ARTICLE / 文章 | parchment | the registry entry's `card` field (`web/content/articles/index.ts`) | `og` (check), `x`, `ig` |
| `part` | ARTICLE + `2 / 6` | parchment (the article's series, so its paper) | `web/content/cards/part/<article slug>.json`, every part in one file; the route takes `&part=N` | `x`, `ig` |
| `glossary` | BASEBALL 101 / 棒球名詞 + No. 001 | steel | `web/content/cards/glossary/<slug>.json` | `x`, `ig` |
| `news` | NEWS / 時事 + date stamp | navy | `web/content/cards/news/<YYYY-MM-DD-slug>.json` | `x`, `ig` |

| Size | Pixels | Used for |
|---|---|---|
| `og` | 1200×630 | link previews (X / LINE / Facebook). The article's is the site's own `opengraph-image`, built automatically; render it only to check it |
| `x` | 1200×675 | an X image post (16:9, not cropped in the timeline) |
| `ig` | 1080×1440 | an Instagram post (3:4: shown whole in the feed and the profile grid) |

The code: `web/lib/share-card/` (`card.tsx` layouts, `tokens.ts` papers, `rough.tsx` frame, `fonts.ts`,
`stats.ts` DB readers, `spec.ts` spec types) and the dev route `web/app/api/dev/share-card/route.ts`.
The plan and its status: **`web/content/social/queue.md`**.

## Ground rules

- **The queue is the plan.** Read `web/content/social/queue.md` first: what's next, the Baseball 101
  numbering, the platform rules. Update it at the end of every run.
- **Per platform:** X is **English only** (the `x` card in English, English text). Instagram gets
  **two separate posts, one image each**: the English `ig` card with an English-only caption, and the
  zh-TW card with a Chinese-only caption. **One point per post**: an article's parts go up one by one
  like on X, never as one carousel (the author's call on 2026-10-21, after a 14-slide en + zh carousel
  drew little reach). Render `ig` in both languages, `x` in English.
- **The database is the source of truth**, as in `/publish-article`. Article, part `stats` and
  glossary cards store DB *keys* and read the values when rendered. News and part `facts` are
  written values: check every one against the DB first. A fact the DB doesn't hold (a trade, an
  injury, a quote) gets its outlet as `source` and goes in the report as not checkable.
- **An article's posts follow the article, but the DB wins.** If the DB disagrees with the article
  text, the card uses the DB value; report the article sentence so the author can fix it.
- **English first, then zh-TW.** Player names and baseball jargon (wRC+, OPS, FIP, Statcast…) stay
  English in zh-TW; team and park names may be translated.
- **The design lives only in `web/lib/share-card/`.** Colours are the `@theme` tokens re-declared as
  hex in `tokens.ts`. Don't hand-tune a single card. If a layout breaks on reasonable copy, fix
  `card.tsx` and re-render every kind (the site's link previews use it too).
- **The brand is `SITE`** (`web/lib/site.ts`): Suyu's Jays Notes, never the old name.
- **Don't commit or push** unless the author asks.

## Workflow

### 1. Pick the work

- `/share-card` alone, or "what's next": the next `idea` / `spec` rows in the queue.
- `/share-card article <slug>`: the article card. To split an article into posts, also write its
  `part` file: one part per section, each a takeaway with its own numbers.
- `/share-card glossary <term>`: the next number in the Baseball 101 plan, or a new term.
- `/share-card news <what happened>`: the author's summary, a link or a date.

Ask only when the kind or the story is unclear.

### 2. Check the facts

- Season / team numbers: `conda run -n MLBxBaZi python etl/season_report.py --season <S> --vs <S-1>`
  (SELECT-only, writes the git-ignored `reports/season-review-<S>/`; see `/publish-article` step 2
  for which file holds what).
- Anything else: a read-only query through `etl/db.py`'s `connect()`, from a script file that
  first loads the repo-root `.env` (`load_dotenv`). Check names in `docs/DATA_MODEL.md` first and
  read rates from the `015` / `022` / `025` views. Game results: `web_games` (filter `game_type`).
  Standings: `web_standings` (GB columns are display text). By position: `web_player_position_splits`.
- Never create a venv; the project uses the conda env `MLBxBaZi`. `conda run` rejects a multi-line
  `python -c`: write the script to a file.

Keep a claim → DB value → source table for the report.

### 3. Write the spec

Types are in `web/lib/share-card/spec.ts`; the existing specs are working examples.

**Article.** `card` on the registry entry: 2–3 keys, `"record"` or a team metric key from
`web/lib/team-metrics.ts` (`r_per_g`, `ops`, `iso`, `k_pct`, `hard_hit_pct`, `ra_per_g`, `era`,
`fip`, `hr9`, `oaa`…). Each stat card shows the value, the change vs the prior season, the MLB rank
among 30 and the prior season, all live. Without `card` an article gets a title-only card.

**Part** (`content/cards/part/<article slug>.json`, one file for the series):

```json
{
  "kind": "part", "slug": "2026-season-review",
  "series": { "en": "2026 season review", "zh-TW": "2026 賽季回顧" },
  "season": 2026,
  "parts": [
    { "title": {…}, "text": {…}, "stats": ["k_pct", "iso", "hard_hit_pct"] },
    { "title": {…}, "text": {…}, "facts": [{ "label": {…}, "value": "69 → 41" }] }
  ]
}
```

- One part per section, in the article's order. Up to 3 tiles each: `stats` (live team metrics,
  like the article card) and/or `facts` (written values, checked in step 2; `"from → to"` works).
- A fact about one Jay can carry `"player": <mlbam_id>`: the tile then shows his hand-drawn portrait
  (two side by side on Instagram). Draw it first with `/player-portrait` if
  `web/content/portraits/<id>.svg` doesn't exist; without it the tile stays plain text.
- `title` about 40 English characters; `text` one or two sentences, about 150. Each part is its
  own post on both platforms, so it has to make sense without the article card before it.

**Glossary** (`content/cards/glossary/<slug>.json`, slug = kebab-case term: `wrc-plus`, `hard-hit-pct`):

```json
{
  "kind": "glossary", "slug": "iso", "date": "2026-10-14", "number": 2,
  "term": "ISO", "aka": "Isolated Power",
  "definition": { "en": "…", "zh-TW": "…" },
  "scale": [{ "value": ".156", "label": { "en": "MLB average, 2026", "zh-TW": "2026 大聯盟平均" } }],
  "example": { "team": true, "stat": "iso", "seasons": [2025, 2026] }
}
```

- `number`: from the queue's Baseball 101 plan (numbers follow posting order). Never reuse or
  renumber a posted number.
- `term` keeps its case (wRC+, not WRC+). `definition`: one or two plain sentences, about 200
  English characters. A stat with two formulas can list them: `\n` breaks a line, `1. ` starts a
  numbered step (see `iso.json`). Spell out every step: "divide by at-bats" was the line the first
  ISO draft left out. `scale`: 2–3 reading-guide rows; an "MLB average" row uses the DB's value.
- `example`, one of:
  - a player: `{ "player": <mlbam_id>, "stat": "<PLAYER_STAT key>", "seasons": […] }`, seasons he
    played for Toronto (`web_player_season_stats` is Jays-only);
  - the team: `{ "team": true, "stat": "<team metric key>", "seasons": […] }`: value and MLB rank
    per season from the `022` views;
  - several Jays in one season, as a table (a row per player, a column per stat):
    `{ "players": [<mlbam_id>, …], "stats": ["era", "fip"], "season": 2026, "positions": true, "title": {…} }`
    (`positions` adds SP / RP / the season position; see `fip.json`, `war.json`);
  - the team's record vs expected: `{ "team": true, "stat": "x_wl", "seasons": […] }`: record,
    x-W/L and the gap per season (`x-wl.json`).
- A scale label may break with `\n`: an Instagram tile breaks there (Satori otherwise splits CJK
  anywhere, 預/期); the wide X rows read it as a space.

**News** (`content/cards/news/<date>-<short-slug>.json`): `headline` (about 60 English characters),
optional `deck` (about 140), up to 3 `facts`, `source` ("MLB Stats API" when the DB backs every
fact, else the outlet), `date` = the day it happened (the stamp).

### 4. Render

From `web/`, start `pnpm dev --port 3100` in the background and wait for "Ready". Next allows one dev
server per project. If it says another is running, use that one at its port (usually 3000) and
leave it alone; it's the author's.

Write every post to `reports/share-cards/kit/<day>/` (git-ignored; `<day>` = the queue's Day, lower
case: `d4`, `of2`) as three files: `x.png` (English), `ig-en.png`, `ig-zh.png`. For example:

```bash
B="http://localhost:3100/api/dev/share-card"; OUT=reports/share-cards/kit/of2; mkdir -p $OUT
curl -s -o "$OUT/x.png" -w "%{http_code}\n" "$B?kind=part&slug=<article>&part=2&size=x&locale=en"
curl -s -o "$OUT/ig-en.png" -w "%{http_code}\n" "$B?kind=part&slug=<article>&part=2&size=ig&locale=en"
curl -s -o "$OUT/ig-zh.png" -w "%{http_code}\n" "$B?kind=part&slug=<article>&part=2&size=ig&locale=zh-TW"
```

A change to `web/lib/share-card/` (layout, logo, fonts) means re-rendering every day still waiting to
be posted: the kit must never hold a card from an older renderer (on 2026-10-21 every launch card
still carried the Jays cap the SN roundel had replaced the day before).

- **400** = a bad parameter (`kind=part` also needs `part=N`). **404 with plain text** = no spec: the
  file name, `kind` and `slug` must match, and an article must be in the registry.
- **404 with Next's HTML "page could not be found"** after a `pnpm build`: stale build output.
  Stop the dev server, delete `web/.next`, start it again.
- The route answers only under `next dev`; in production it returns 404 on purpose.

### 5. Check every PNG

Open each one with `Read` (a contact sheet of several, made with Pillow in the conda env, is fine
for a first pass; open any doubtful one at full size):

- **Fit:** titles and text don't run into the tiles or the footer; nothing is cut off; tiles don't
  wrap their values. Fix the copy first. English prose already keeps hyphenated words together
  (`Hard-hit%`, `79-83`) and Chinese titles break only after punctuation (，、：…); a title with no punctuation wraps anywhere, so give a long one a comma where it should break (「能打 20 轟的人，都在傷兵名單」).
- **Language:** a zh-TW card that came out in English means the Chinese font didn't download.
  Re-render it.
- **Numbers:** they match the fact table.

Then stop the dev server if you started it, and confirm the port is free. A leftover `node` process
can keep listening after the task stops; end that PID too.

### 6. Captions, posting page, queue

- **X** (English, attach the `x` image): at most 280 *weighted* characters (each CJK character 2,
  any link 23); count them before handing over. An article or part post carries the article URL
  (`SITE.url` + `/en/articles/<slug>`): a post with an image shows no link card. Glossary / news
  posts link a site page when one fits (`/en/season/<year>`, `/en/players/<id>`, `/en/standings`).
  One hashtag, #BlueJays.
- **Instagram**, two captions per day, each in one language only: a hook line, 2–4 short lines, for a
  part `Part 2 of 7 · <series>. Full piece with live charts: link in bio.` / `<系列> 2／7。完整文章
  （含互動圖表）：連結在個人檔案。`, then **at most 5 hashtags** in that language (Instagram's limit;
  the sets are in the queue's Rules). A question at the end of an opinion part ("Who would you sign?")
  invites comments, which is where the site's discussion lives. Never write "swipe" or "中文版在後".
- Add each day to `POSTS` in `.claude/skills/share-card/kit/build_kit.py` (day, series, kind, part,
  title, the X text and the `en` / `zh` Instagram text; a new series also goes in `SERIES`), then run
  `conda run -n MLBxBaZi python .claude/skills/share-card/kit/build_kit.py`. It checks every image is
  there and every X post fits 280 weighted characters, and writes `posting-kit.html` + `captions.md`
  into `reports/share-cards/kit/`.
- The author posts from a phone: publish that page to the kit already linked in the queue (pass its
  `url`, so the link stays the same). Copy `reports/share-cards/kit/` into the scratchpad first (the
  Artifact tool takes sources from the working directory or the scratchpad), publish with that copy
  as `root`, the page as `file_path` and each new or changed `<day>/*.png` in `files`. The page keeps
  its `downloads` capability (save buttons) and a "posted" tick per post on the device.
- Update `web/content/social/queue.md`: rows → `ready`, file paths, anything that still needs the
  author.

### 7. Report to the author

In the language the author used (usually Traditional Chinese): the kit folder and posting page,
the fact table (anything corrected or not checkable, and any article sentence the DB contradicts),
what's ready by day, and what's next in the queue. After posting, the author sends back the post
URLs: add them to the queue's **Links** / **Posted**, and for an article also to the registry's
`discuss` field.

## Adding a kind

1. `tokens.ts`: add it to `CardKind` and `KIND`. Each kind gets its **own paper**: one shared paper
   across kinds made the feed monotonous. Offer the author the spares in `PAPERS` first (`bulletin`
   pale red, `indexCard` pale blue-grey, `navyBoard`, `lava`). Renders of them are in
   `reports/share-cards/paper-review/` if that folder is still on this machine. (A kind that is
   part of another, like `part`, shares its parent's paper.)
2. `spec.ts`: the spec type, `CARD_KINDS`, and where its JSON lives.
3. `card.tsx`: a body component with landscape and portrait layouts; render it from
   `renderShareCard`.
4. `web/messages/en.json` + `zh-TW.json`: any new `ShareCard` strings, English first.
5. Render every size × locale of every kind, since the code is shared.

Satori (next/og) rules that have bitten before:

- A `<div>` with more than one child needs `display: flex`. Write a number as `{String(n)}`.
- Don't return a Fragment from a body component: Satori lays its children out in a row. Wrap them
  in a column flex `<div>`.
- `flex: 1` on a card inside a *column* collapses its height to the padding: use it only in rows.
- No CSS variables or `color-mix()`: use the hex and `mix()` in `tokens.ts`.
- A glyph must be in the font subset: `allText()` in `card.tsx` lists the strings sent to Google
  Fonts; a character the renderer adds itself (like U+2011) has to be listed there.
- A portrait card with little content: let the body `justifyContent: center` share the space.
  The footer may wrap, with the URL on `marginLeft: auto`.
