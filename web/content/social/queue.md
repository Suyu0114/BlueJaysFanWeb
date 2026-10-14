# Social queue

The posting plan for X and Instagram: what's next, what's ready, what's posted.
`/share-card` reads this file before it makes anything and updates it after. The
author posts by hand and sends back each post's URL, which goes in **Links**.

## Rules

- **X: English only.** The `x` card in English plus English text, at most 280
  weighted characters (a CJK character counts 2, a link 23). Article posts carry
  the article link in the text.
- **Instagram: English first, Chinese second.** One carousel per post: the English
  slide(s), then the zh-TW slide(s). Caption in English, a `—` line, then Chinese,
  then hashtags. Links in captions aren't clickable: "link in bio".
- **Baseball 101 numbers follow posting order** and are fixed once a card is posted.
- **Status:** `idea` → `spec` (spec written) → `ready` (rendered + captions,
  waiting for the author) → `posted` (with links).
- **Where the files are:** each batch renders to `reports/share-cards/<batch>/`
  (git-ignored): `x/`, `ig/` and an `index.html` posting page with every image and
  caption and a copy button.

## Accounts

- X: `x.com/suyujaysnotes` (`SITE.links.x`). Being set up by the author.
- Instagram: not open yet. When it is, set `SITE.links.instagram` in `web/lib/site.ts`.

## Launch: 2026 season review + Baseball 101, first arc

One post a day. Launch day (D0) is set when the accounts are ready; then fill in **Date**.
The review's six parts go on X one by one; on Instagram they are all in the D0
carousel. Batch: `reports/share-cards/launch/`. Phone posting kit (private page, save
buttons + captions): https://claude.ai/artifact/UH3ZzVzkFRCjKvrGLWd23U

| Day | Date | Post | X | Instagram | Spec | Status | Links |
|---|---|---|---|---|---|---|---|
| D0 | | Article: The 2026 Blue Jays (+ link) | `x/d0-article.png` | carousel: article + parts 1–6 in English, then zh-TW (14 slides) | registry `card` + `content/cards/part/2026-season-review.json` | ready | |
| D1 | | Baseball 101 No. 001 · wRC+ | `x/glossary-wrc-plus.png` | en + zh-TW | `content/cards/glossary/wrc-plus.json` | ready | |
| D2 | | Part 1/6 · Plenty of contact, not much carry | `x/part1.png` | in D0 | part 1 | ready | |
| D3 | | Baseball 101 No. 002 · ISO | `x/glossary-iso.png` | en + zh-TW | `content/cards/glossary/iso.json` | ready | |
| D4 | | Part 2/6 · Where the home runs went | `x/part2.png` | in D0 | part 2 | ready | |
| D5 | | Baseball 101 No. 003 · Hard-hit% | `x/glossary-hard-hit-pct.png` | en + zh-TW | `content/cards/glossary/hard-hit-pct.json` | ready | |
| D6 | | Part 3/6 · The middle of the order went quiet | `x/part3.png` | in D0 | part 3 | ready | |
| D7 | | Baseball 101 No. 004 · FIP | | en + zh-TW | — | idea | |
| D8 | | Part 4/6 · Pitching: Cease and the bullpen held | `x/part4.png` | in D0 | part 4 | ready | |
| D9 | | Baseball 101 No. 005 · WAR | | en + zh-TW | — | idea | |
| D10 | | Part 5/6 · The home edge disappeared | `x/part5.png` | in D0 | part 5 | ready | |
| D11 | | Baseball 101 No. 006 · x-W/L | | en + zh-TW | — | idea | |
| D12 | | Part 6/6 · Three questions for 2027 | `x/part6.png` | in D0 | part 6 | ready | |

Optional second image on the X part posts: the matching chart from the season
page's "PNG ↓" (`/season/2026`): part 1 team stats vs MLB (offense), part 2 value
by position (HR), part 3 value by position (Off), part 4 team stats vs MLB (run
prevention), part 5 splits or month by month.

## Baseball 101 plan

| No. | Term | Example | Arc | Status |
|---|---|---|---|---|
| 001 | wRC+ | Guerrero Jr. 137 → 95 | 1 · read the 2026 review (Oct–Nov) | ready |
| 002 | ISO | the team .162 (12th) → .134 (30th) | 1 | ready |
| 003 | Hard-hit% | the team 41.2% (11th) → 34.0% (30th) | 1 | ready |
| 004 | FIP | Rogers' 1.77 ERA vs 3.35 FIP (needs a same-season two-stat example) | 1 | idea |
| 005 | WAR | Cease 5.5 | 1 | idea |
| 006 | x-W/L | 76-86 expected vs 79-83 actual (needs a team-record example: x-W/L isn't a `022` metric) | 1 | idea |
| 007– | OBP · SLG / OPS · K% / BB% · WHIP · OAA · Barrel% · xwOBA | | 2 · offseason basics (Dec–Jan) | idea |
| | Pitch clock · ABS challenge · Exit velocity / Launch angle · Spin rate · Chase% (2026 zone change: caveat) | | 3 · before Opening Day (Feb–Mar) | idea |

One a week after the launch arc. Numbers are given in posting order.

## Posted

| Date | Post | X | Instagram |
|---|---|---|---|
