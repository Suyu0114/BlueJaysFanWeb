# Social queue

The posting plan for X and Instagram: what's next, what's ready, what's posted.
`/share-card` reads this file before it makes anything and updates it after. The
author posts by hand and sends back each post's URL, which goes in **Links**.

## Rules

- **X: English only.** The `x` card in English plus English text, at most 280
  weighted characters (a CJK character counts 2, a link 23). Article posts carry
  the article link in the text.
- **Instagram: English and Chinese are separate posts, one point each** (since
  2026-10-21). Each day's card goes up twice: the English `ig` card with an
  English-only caption, and the zh-TW card with a Chinese-only caption. One image
  per post: an article's parts are posted one by one like on X, never as one big
  carousel (the 14-slide D0 carousel got little reach; few people swipe that far,
  and half of every slide set was in a language the reader skips). Timing:
  Chinese around 8 AM Toronto (8–9 PM Taipei), English 6–8 PM Toronto. Links in
  captions aren't clickable: "link in bio" / 連結在個人檔案.
- **Player portraits:** a fact about one Jay can show his hand-drawn portrait
  (`"player": <mlbam_id>`, drawn on demand by `/player-portrait`: loose ink
  illustration, his features only, plain cap). Never photos.
- **Instagram hashtags: at most 5** (Instagram's limit), in the post's language.
  Article / part / news: en `#BlueJays #TorontoBlueJays #MLB #Baseball #BaseballStats`,
  zh `#藍鳥 #多倫多藍鳥 #大聯盟 #棒球 #MLB`. Baseball 101: en `#Sabermetrics
  #BaseballStats #MLB #Baseball #BlueJays`, zh `#棒球 #棒球數據 #大聯盟 #MLB #藍鳥`.
  A series about other clubs uses its own set (`SERIES_TAGS` in `build_kit.py`): the
  World Series preview is en `#WorldSeries #Brewers #Rays #MLB #BaseballStats`, zh
  `#世界大賽 #大聯盟 #棒球 #MLB #棒球數據`, and `#WorldSeries` on X.
- **Baseball 101 numbers follow posting order** and are fixed once a card is posted.
- **Status:** `idea` → `spec` (spec written) → `ready` (rendered + captions,
  waiting for the author) → `posted` (with links).
- **Where the files are:** every post renders to `reports/share-cards/kit/<day>/`
  (git-ignored) as `x.png`, `ig-en.png`, `ig-zh.png`. The captions live in
  `.claude/skills/share-card/kit/build_kit.py` (`POSTS`), which writes
  `posting-kit.html` + `captions.md` into that folder; the kit folder is published
  as the phone posting kit (link below). The older batch folders (`launch/`,
  `2027-outfield-upgrade/`) were rendered before the SN logo and still carry the
  Jays cap in the corner: don't post from them.

## Accounts

- X: `x.com/suyujaysnotes` (`SITE.links.x`). Being set up by the author.
- Instagram: `instagram.com/suyu.baseball.notes` (`SITE.links.instagram`, opened 2026-10-14).

## 2026 World Series preview (article 2026-10-22): post first

Time-sensitive: Game 1 is Friday 10/23, 8 PM ET. WS0 goes up before first pitch; WS1–WS3
within the first days of the series (a preview is stale once it's well underway). Three parts,
not one per section, for that reason. Same kit folder and phone kit (section WS0–WS3, at the top).

| Day | Date | Post | Spec | Status | Links |
|---|---|---|---|---|---|
| WS0 | before G1 | Article: 2026 World Series preview (+ link) | registry entry (no `card`: the stat cards are Jays-only, so title + the two clubs' logos from `teams`) + `content/cards/part/2026-world-series-preview.json` | ready | |
| WS1 | | Part 1/3 · Two ways to win | part 1 | ready | |
| WS2 | | Part 2/3 · Rays' rotation, Brewers' bullpen | part 2 | ready | |
| WS3 | | Part 3/3 · My pick: the Brewers | part 3 | ready | |

Facts: regular-season values (Brewers OBP .341, Rays K% 18.8%, 98 vs 90 x-W) from the 022
views / `web_standings`; postseason values (bullpen / starter IP and ERA, Rasmussen's 8 · 6 · 7,
Dodgers' 11 NLCS runs, Rays' .293 OBP, 3.8 IP per Brewers start) from the MLB Stats API
(`reports/world-series-2026/`), not in the DB.

## Launch: 2026 season review + Baseball 101, first arc

One day per row. Launch day (D0) is set when the accounts are ready; then fill in **Date**.
Each day is three posts: X (English), Instagram English, Instagram Chinese, all from
`reports/share-cards/kit/<day>/`. The review's six parts go out one by one on both
platforms. Phone posting kit (private page, save buttons + captions, a "posted" tick per
post): https://claude.ai/artifact/UH3ZzVzkFRCjKvrGLWd23U

| Day | Date | Post | Spec | Status | Links |
|---|---|---|---|---|---|
| D0 | | Article: The 2026 Blue Jays (+ link) | registry `card` + `content/cards/part/2026-season-review.json` | posted (IG: the old 14-slide en + zh carousel, article + parts 1–6) | |
| D1 | | Baseball 101 No. 001 · wRC+ | `content/cards/glossary/wrc-plus.json` | posted (IG: old en + zh carousel) | |
| D2 | | Part 1/6 · Plenty of contact, not much carry | part 1 | posted (IG: in the D0 carousel) | |
| D3 | | Baseball 101 No. 002 · ISO | `content/cards/glossary/iso.json` | posted (IG: old en + zh carousel) | |
| D4 | | Part 2/6 · Where the home runs went | part 2 | posted (IG: in the D0 carousel) | |
| D5 | | Baseball 101 No. 003 · Hard-hit% | `content/cards/glossary/hard-hit-pct.json` | posted (IG: old en + zh carousel) | |
| D6 | | Part 3/6 · The middle of the order went quiet | part 3 (Springer + Guerrero Jr. portraits) | ready: first day on the new IG split | |
| D7 | | Baseball 101 No. 004 · FIP | `content/cards/glossary/fip.json` | ready | |
| D8 | | Part 4/6 · Pitching: Cease and the bullpen held | part 4 | ready | |
| D9 | | Baseball 101 No. 005 · WAR | `content/cards/glossary/war.json` | ready | |
| D10 | | Part 5/6 · The home edge disappeared | part 5 | ready | |
| D11 | | Baseball 101 No. 006 · x-W/L | `content/cards/glossary/x-wl.json` | ready | |
| D12 | | Part 6/6 · Three questions for 2027 | part 6 | ready | |

Optional second image on the X part posts: the matching chart from the season
page's "PNG ↓" (`/season/2026`): part 1 team stats vs MLB (offense), part 2 value
by position (HR), part 3 value by position (Off), part 4 team stats vs MLB (run
prevention), part 5 splits or month by month.

## 2027 outfield upgrade (article 2026-10-17)

Article + seven parts, the same shape as the launch: one day per row, X + Instagram English +
Instagram Chinese. Post it any time after the article is live, ideally done before the CBA
expires on 12/1; it can interleave with the launch arc. Same kit folder and phone kit as
above (section OF0–OF7). Nothing posted yet: its 16-slide IG carousel was never used, and
OF0's Instagram is the article card alone, English and Chinese.

| Day | Date | Post | Spec | Status | Links |
|---|---|---|---|---|---|
| OF0 | | Article: The Blue Jays' 2027 outfield (+ link) | registry `card` + `content/cards/part/2027-outfield-upgrade.json` | ready | |
| OF1 | | Part 1/7 · An outfield that couldn't hit it out | part 1 | ready | |
| OF2 | | Part 2/7 · The 20-homer bats were on the IL | part 2 | ready | |
| OF3 | | Part 3/7 · Three bats that change a lineup | part 3 | ready | |
| OF4 | | Part 4/7 · Cheaper bats, and the Jays' glove habit | part 4 | ready | |
| OF5 | | Part 5/7 · The farm: depth, not a slugger | part 5 | ready | |
| OF6 | | Part 6/7 · December 1 is the line | part 6 | ready | |
| OF7 | | Part 7/7 · My take: one big deal, then wait | part 7 | ready | |

Facts not in the DB (cards say them, the article sources them): free-agent lines (MLB Stats
API), Sato's NPB line (Baseball-Reference), prospect lines (MLB Stats API), the posting
window / CBA date / 99-day 2021–22 lockout (MLB Trade Rumors, ESPN).

## Baseball 101 plan

| No. | Term | Example | Arc | Status |
|---|---|---|---|---|
| 001 | wRC+ | Guerrero Jr. 137 → 95 | 1 · read the 2026 review (Oct–Nov) | ready |
| 002 | ISO | the team .162 (12th) → .134 (30th) | 1 | ready |
| 003 | Hard-hit% | the team 41.2% (11th) → 34.0% (30th) | 1 | ready |
| 004 | FIP | Tyler Rogers 1.77 ERA / 3.35 FIP vs Jeff Hoffman 3.94 / 2.50 (2026; `players` × `stats` example) | 1 | ready |
| 005 | WAR | 2026 top three: Cease 5.5 (SP), Varland 3.1 (RP), Okamoto 3.0 (3B) | 1 | ready |
| 006 | x-W/L | 94-68 vs 88-74 (2025), 79-83 vs 76-86 (2026) (`x_wl` record example) | 1 | ready |
| 007– | OBP · SLG / OPS · K% / BB% · WHIP · OAA · Barrel% · xwOBA | | 2 · offseason basics (Dec–Jan) | idea |
| | Pitch clock · ABS challenge · Exit velocity / Launch angle · Spin rate · Chase% (2026 zone change: caveat) | | 3 · before Opening Day (Feb–Mar) | idea |

One a week after the launch arc. Numbers are given in posting order.

## Posted

| Date | Post | X | Instagram |
|---|---|---|---|
