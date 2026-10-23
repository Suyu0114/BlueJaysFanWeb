"""Build the phone posting kit (posting-kit.html) and captions.md from POSTS below.

Images come from reports/share-cards/kit/<day>/{x,ig-en,ig-zh}.png (rendered by the /share-card dev route);
the page and captions.md are written next to them. Published as a private Artifact with the kit folder as
`root` and the same relative paths; the link is in web/content/social/queue.md.

    conda run -n MLBxBaZi python .claude/skills/share-card/kit/build_kit.py
"""
import html, json, pathlib, re

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(__file__).resolve().parents[4] / "reports" / "share-cards" / "kit"
SITE = "https://bluejaysfanweb.vercel.app/en"
REVIEW, OUTFIELD = f"{SITE}/articles/2026-season-review", f"{SITE}/articles/2027-outfield-upgrade"
WS = f"{SITE}/articles/2026-world-series-preview"

TAGS = {
    ("article", "en"): "#BlueJays #TorontoBlueJays #MLB #Baseball #BaseballStats",
    ("article", "zh"): "#藍鳥 #多倫多藍鳥 #大聯盟 #棒球 #MLB",
    ("glossary", "en"): "#Sabermetrics #BaseballStats #MLB #Baseball #BlueJays",
    ("glossary", "zh"): "#棒球 #棒球數據 #大聯盟 #MLB #藍鳥",
}
# A series about other clubs (the World Series) swaps the Jays hashtags for the event's.
SERIES_TAGS = {
    "ws": {"en": "#WorldSeries #Brewers #Rays #MLB #BaseballStats", "zh": "#世界大賽 #大聯盟 #棒球 #MLB #棒球數據"},
}
BIO = {"en": "Full piece with live charts: link in bio.", "zh": "完整文章（含互動圖表）：連結在個人檔案。"}


def part_footer(series_en, series_zh, n, total):
    return {"en": f"Part {n} of {total} · {series_en}. {BIO['en']}", "zh": f"{series_zh} {n}／{total}。{BIO['zh']}"}


# kind: article (launch + parts) | glossary. x = the X post; en / zh = the Instagram captions without hashtags.
POSTS = [
    dict(day="d0", series="review", kind="article", title="Article launch: the 2026 season review",
         x=f"""New on Suyu's Jays Notes: the 2026 Blue Jays, from AL champions to last in the AL East.

79-83, with 150 fewer runs scored and only 27 fewer allowed. The pitching held up; the bats stopped carrying.

{REVIEW}
#BlueJays""",
         en="""The 2026 Blue Jays: the pitching held up, the bats stopped carrying.

From AL champions to last in the AL East: 79-83, with 150 fewer runs scored and only 27 fewer allowed.

Six takeaways follow, one post at a time. The full review, with live charts: link in bio.""",
         zh="""2026 藍鳥賽季分析：投手撐住了，打線卻打不遠了。

從美聯冠軍到分區墊底：79 勝 83 敗，得分少了 150 分，失分只少 27 分。

接下來分六篇，一次講一個重點。完整文章（含互動圖表）：連結在個人檔案。"""),
    dict(day="d1", series="review", kind="glossary", title="Baseball 101 · No. 001 wRC+",
         x="""Baseball 101 · No. 001: wRC+

How many runs a hitter creates, next to the league average and adjusted for his home park. 100 is average; every point above or below is 1%.

Vladimir Guerrero Jr.: 137 in 2025, 95 in 2026.

https://bluejaysfanweb.vercel.app/en/players/665489
#BlueJays""",
         en="""Baseball 101 · No. 001: wRC+

One number for "how good is this hitter?": the runs he creates, next to the league average and adjusted for his home park. 100 is average, 115 above average, 140 great.

Vladimir Guerrero Jr. went from 137 in 2025 to 95 in 2026: from 37% better than average to 5% worse.""",
         zh="""棒球名詞 No. 001：wRC+

一個數字回答「這位打者到底好不好」：他創造的得分和聯盟平均比較，並扣除主場球場的影響。100 是平均，115 高於平均，140 是頂尖。

Vladimir Guerrero Jr. 從 2025 年的 137 掉到 2026 年的 95：從比平均好 37%，變成比平均差 5%。"""),
    dict(day="d2", series="review", kind="article", part=1, title="Part 1/6 · Plenty of contact, not much carry",
         x=f"""The 2026 Jays put the ball in play: their 19.0% strikeout rate was the 2nd-lowest in MLB.

But they ranked 30th in ISO (.134) and 30th in Hard-hit% (34.0%), and scored 4.00 runs a game, the fewest in the majors.

Part 1 of 6: {REVIEW}
#BlueJays""",
         en="""The 2026 Jays put the ball in play. They just didn't hit it hard.

Their 19.0% strikeout rate was the 2nd-lowest in MLB, but they ranked 30th in ISO (.134) and 30th in Hard-hit% (34.0%). The result: 4.00 runs a game, the fewest in the majors.""",
         zh="""2026 年的藍鳥碰得到球，卻打不遠。

三振率 19.0% 是大聯盟第 2 低，ISO（.134）和 Hard-hit%（34.0%）卻都是 30 隊最後一名。結果是每場只得 4.00 分，全聯盟最少。"""),
    dict(day="d3", series="review", kind="glossary", title="Baseball 101 · No. 002 ISO",
         x="""Baseball 101 · No. 002: ISO (Isolated Power)

Raw power in one number. Two ways to get it:
1. SLG minus AVG
2. Extra bases (double +1, triple +2, home run +3) divided by at-bats

2026 MLB average: .156. The Jays: .134, 30th (2025: .162, 12th).

https://bluejaysfanweb.vercel.app/en/season/2026
#BlueJays""",
         en="""Baseball 101 · No. 002: ISO (Isolated Power)

Raw power in one number. Two ways to get it:
1. SLG minus AVG
2. Add up the extra bases (single 0, double +1, triple +2, home run +3), then divide by at-bats (AB)

The MLB average in 2026 was .156.

The 2026 Blue Jays: .134, 30th of 30 clubs, down from .162 (12th) in 2025.""",
         zh="""棒球名詞 No. 002：ISO（純長打率 / Isolated Power）

用一個數字看長打能力。有兩種算法：
1. 長打率（SLG）直接減去打擊率（AVG）
2. 只算「額外壘包數」（一壘安打 0、二壘安打 +1、三壘安打 +2、全壘打 +3），加總後再除以打數（AB）。2026 年大聯盟平均是 .156。

2026 年的藍鳥：.134，30 隊中第 30；2025 年是 .162（第 12）。"""),
    dict(day="d4", series="review", kind="article", part=2, title="Part 2/6 · Where the home runs went",
         x=f"""Where did the home runs go? Toronto hit 152 in 2026, down from 191.

Outfielders went from 69 to 41, about 70% of the drop. The bright spot: Kazuma Okamoto's 33 in his first season in Toronto.

Part 2 of 6: {REVIEW}
#BlueJays""",
         en="""Where did the home runs go?

Toronto hit 152 in 2026, down from 191. The outfield went from 69 to 41, about 70% of the drop.

The bright spot: Kazuma Okamoto's 33 in his first season in Toronto.""",
         zh="""全壘打去哪了？

藍鳥 2026 年打 152 轟，2025 年是 191 轟。外野從 69 轟掉到 41 轟，約佔跌幅的七成。

唯一的亮點：Kazuma Okamoto 來多倫多的第一年就打了 33 轟。"""),
    dict(day="d5", series="review", kind="glossary", title="Baseball 101 · No. 003 Hard-hit%",
         x="""Baseball 101 · No. 003: Hard-hit%

The share of batted balls hit 95 mph or harder. Hard contact turns into hits, and extra bases, far more often. MLB average in 2026: 38.6%.

The 2026 Jays: 34.0%, 30th in MLB (2025: 41.2%, 11th).

https://bluejaysfanweb.vercel.app/en/season/2026
#BlueJays""",
         en="""Baseball 101 · No. 003: Hard-hit%

The share of a hitter's batted balls that leave the bat at 95 mph or faster (Statcast). Hard contact turns into hits, and extra bases, far more often. The MLB average in 2026 was 38.6%.

The 2026 Blue Jays: 34.0%, 30th of 30 clubs, down from 41.2% (11th) in 2025.""",
         zh="""棒球名詞 No. 003：Hard-hit%

擊球初速達到 95 英里（約 153 公里）以上的擊球比例（Statcast）。打得越強，越容易變成安打和長打。2026 年大聯盟平均是 38.6%。

2026 年的藍鳥：34.0%，30 隊中第 30；2025 年是 41.2%（第 11）。"""),
    dict(day="d6", series="review", kind="article", part=3, title="Part 3/6 · The middle of the order went quiet",
         x=f"""The middle of the order went quiet.

George Springer: +48.3 → +4.0 Off
Vladimir Guerrero Jr.: +27.0 → −5.4 Off

Together about 77 runs, roughly 60% of the lineup's 128-run drop. (Off = hitting + baserunning runs vs average.)

Part 3 of 6: {REVIEW}
#BlueJays""",
         en="""The middle of the order went quiet.

George Springer: +48.3 → +4.0 Off
Vladimir Guerrero Jr.: +27.0 → −5.4 Off

Together about 77 runs, roughly 60% of the lineup's 128-run drop. Off = the runs a hitter adds with his bat and on the bases, compared with an average player.""",
         zh="""中心打線熄火了。

George Springer：Off +48.3 → +4.0
Vladimir Guerrero Jr.：Off +27.0 → −5.4

兩人合計少了約 77 分，約佔全隊打線跌幅 128 分的六成。Off 是打擊加跑壘，和平均球員相比多創造的得分。"""),
    dict(day="d7", series="review", kind="glossary", title="Baseball 101 · No. 004 FIP",
         x="""Baseball 101 · No. 004: FIP

An ERA built only from what a pitcher controls: strikeouts, walks, hit batters, home runs. Defense and luck drop out.

2026 Jays:
Tyler Rogers 1.77 ERA, 3.35 FIP (lucky)
Jeff Hoffman 3.94 ERA, 2.50 FIP (unlucky)

https://bluejaysfanweb.vercel.app/en/season/2026
#BlueJays""",
         en="""Baseball 101 · No. 004: FIP (Fielding Independent Pitching)

ERA depends on the defense behind a pitcher and on where balls in play happen to land. FIP keeps only what the pitcher controls: strikeouts, walks, hit batters and home runs. A league constant puts it on the ERA scale, so the MLB average is the same for both (4.17 in 2026). Read it like ERA: lower is better.

Two 2026 Jays relievers, two directions:
Tyler Rogers: 1.77 ERA, 3.35 FIP (the lucky one)
Jeff Hoffman: 3.94 ERA, 2.50 FIP (the unlucky one)
A gap that big usually means the ERA got help (Rogers) or bad luck (Hoffman), so both are worth watching next year.""",
         zh="""棒球名詞 No. 004：FIP（Fielding Independent Pitching）

ERA 會受到背後守備，以及球被打進場內後落點運氣的影響。FIP 只看投手自己能掌控的：三振、保送、觸身球和全壘打，再加上聯盟常數，換算成和 ERA 同一個尺度，所以兩者的大聯盟平均相同（2026 年都是 4.17）。看法和 ERA 一樣：越低越好。

2026 年藍鳥兩位後援投手，呈現兩個方向：
Tyler Rogers 的 ERA 1.77、FIP 3.35（運氣比較好）
Jeff Hoffman 的 ERA 3.94、FIP 2.50（運氣不好）
兩個數值差這麼多，通常代表 ERA 被幫了忙（Rogers）或是運氣不好（Hoffman），所以明年我們可以繼續觀察。"""),
    dict(day="d8", series="review", kind="article", part=4, title="Part 4/6 · Pitching: Cease and the bullpen held",
         x=f"""The pitching held: runs allowed fell from 721 to 694 (10th in MLB), with a 3.97 FIP (8th).

Dylan Cease: a 34.9% strikeout rate and 5.5 WAR, best on the team. The back of the bullpen held too; the back of the rotation didn't.

Part 4 of 6: {REVIEW}
#BlueJays""",
         en="""The pitching held.

Runs allowed fell from 721 to 694 (10th in MLB), with a 3.97 FIP (8th).

Dylan Cease struck out 34.9% of the hitters he faced and led the team with 5.5 WAR. The back of the bullpen held too; the back of the rotation didn't.""",
         zh="""投手撐住了。

失分從 721 分降到 694 分（大聯盟第 10），FIP 3.97（第 8）。

Dylan Cease 三振率 34.9%、WAR 5.5，全隊最高。牛棚後段也很穩，破口在輪值後段。"""),
    dict(day="d9", series="review", kind="glossary", title="Baseball 101 · No. 005 WAR",
         x="""Baseball 101 · No. 005: WAR

The wins a player adds over a replacement-level call-up from the minors, with hitting, baserunning, fielding and pitching on one scale.

2026 Jays leaders: Dylan Cease 5.5, Louis Varland 3.1, Kazuma Okamoto 3.0.

https://bluejaysfanweb.vercel.app/en/players/656302
#BlueJays""",
         en="""Baseball 101 · No. 005: WAR (Wins Above Replacement)

How many wins a player is worth over a replacement-level call-up from the minors, with hitting, baserunning, fielding and pitching all counted. Because everything lands on one scale, a starter, a closer and a third baseman can be compared directly. Over a full season, about 2 is a solid starter, 4 an All-Star, 6 MVP level.

This site shows FanGraphs' version, which builds pitcher WAR on FIP (Baseball 101 No. 004).

The 2026 Blue Jays' top three: Dylan Cease 5.5 (starter), Louis Varland 3.1 (closer), Kazuma Okamoto 3.0 (third base).""",
         zh="""棒球名詞 No. 005：WAR（Wins Above Replacement）

一位球員比「隨時能從小聯盟叫上來的替補」多幫球隊贏幾場，打擊、跑壘、守備和投球都算進去。因為全部換算成同一把尺，先發投手、終結者和三壘手可以直接比較。一整季大約 2 是穩定先發、4 是全明星、6 是 MVP 等級。

本站用的是 FanGraphs 版本，投手的 WAR 以 FIP 為基礎（棒球名詞 No. 004）。

2026 年藍鳥前三名：Dylan Cease 5.5（先發）、Louis Varland 3.1（終結者）、Kazuma Okamoto 3.0（三壘）。"""),
    dict(day="d10", series="review", kind="article", part=5, title="Part 5/6 · The home edge disappeared",
         x=f"""The home edge disappeared.

The Jays won 15 fewer games than in 2025, and 12 of those were lost at Rogers Centre: 54-27 at home in 2025, 42-39 in 2026. The road record barely moved (40-41 → 37-44).

Part 5 of 6: {REVIEW}
#BlueJays""",
         en="""The home edge disappeared.

The Jays won 15 fewer games than in 2025, and 12 of those were lost at Rogers Centre: 54-27 at home in 2025, 42-39 in 2026.

The road record barely moved: 40-41, then 37-44.""",
         zh="""主場優勢消失了。

藍鳥比 2025 年少贏 15 場，其中 12 場少在羅杰斯中心：主場從 54-27 變成 42-39。

客場戰績幾乎沒變：從 40-41 到 37-44。"""),
    dict(day="d11", series="review", kind="glossary", title="Baseball 101 · No. 006 x-W/L",
         x="""Baseball 101 · No. 006: x-W/L

The record a team's runs scored and allowed "should" produce. The gap to the real record is mostly close games.

The Jays beat it twice: 94-68 vs 88-74 expected in 2025, 79-83 vs 76-86 in 2026.

https://bluejaysfanweb.vercel.app/en/team
#BlueJays""",
         en="""Baseball 101 · No. 006: x-W/L (expected won-lost record)

Runs scored and runs allowed say a lot about how good a team is. x-W/L turns them into the record a team "should" have, with the Pythagorean formula: expected win % = RS^1.83 ÷ (RS^1.83 + RA^1.83), times games played. With the 1.83 power it matches MLB's own figure for every club from 2022 to 2026. The gap to the real record mostly comes from close games, which is why it often gets called luck.

From 2022 to 2026, 74% of clubs landed within 4 wins of it. Both extremes are from 2026: the Reds won 75 games with a 65-win run differential, the Tigers 76 with an 89-win one.

The Blue Jays won 6 more than expected in 2025 (94-68 vs 88-74) and 3 more in 2026 (79-83 vs 76-86).""",
         zh="""棒球名詞 No. 006：x-W/L（預期勝敗）

得分和失分最能看出一支球隊的實力。x-W/L 用畢氏勝率公式，把它們換算成「應該」有的戰績：預期勝率 = RS^1.83 ÷ (RS^1.83 + RA^1.83)，再乘以出賽場數。用 1.83 次方算，2022 到 2026 年每一隊都和大聯盟官方的數字一致。和實際戰績的落差大多來自比分接近的比賽，所以常被叫做「運氣」。

2022 到 2026 年，有 74% 的球隊落差在 4 場以內。兩個極端都在 2026 年：紅人的得失分只值 65 勝，卻贏了 75 場；老虎的得失分值 89 勝，只贏 76 場。

藍鳥 2025 年比預期多贏 6 場（94-68，預期 88-74），2026 年多贏 3 場（79-83，預期 76-86）。"""),
    dict(day="d12", series="review", kind="article", part=6, title="Part 6/6 · Three questions for 2027",
         x=f"""Three questions for the 2027 Blue Jays:

1. Outfield power? Only Nathan Lukes reached 10 HR.
2. Guerrero Jr.: 137 → 95 wRC+. A dip or a trend?
3. The rotation after Cease? Gausman's ERA rose from 3.59 to 4.38.

Part 6 of 6: {REVIEW}
#BlueJays""",
         en="""Three questions for the 2027 Blue Jays:

1. Outfield power? Only Nathan Lukes reached 10 home runs.
2. Vladimir Guerrero Jr.: 137 → 95 wRC+. A dip or a trend?
3. The rotation after Cease? Kevin Gausman's ERA rose from 3.59 to 4.38.

Which one worries you most?""",
         zh="""2027 年藍鳥的三個問題：

1. 外野的長打？只有 Nathan Lukes 打到 10 轟。
2. Vladimir Guerrero Jr. 的 wRC+ 從 137 掉到 95，是一時低潮還是趨勢？
3. Cease 之後的輪值？Kevin Gausman 的 ERA 從 3.59 升到 4.38。

你最擔心哪一個？"""),
    dict(day="of0", series="outfield", kind="article", title="Article launch: the 2027 outfield upgrade",
         x=f"""The 2026 Blue Jays outfield hit 41 home runs, tied for 29th in MLB. Who on the free-agent market can fix that, who's coming back from injury, and what the farm can offer. New piece: {OUTFIELD} #BlueJays""",
         en="""The Blue Jays' 2027 outfield: free agents, players coming back and the farm.

The 2026 outfield hit 41 home runs, tied for 29th in MLB. Arozarena, Suzuki and NPB slugger Teruaki Sato can fill that gap on their own; Santander and Barger barely played in 2026; the farm has depth but no slugger yet.

My take: one big contract at most, and I think Suzuki fits best 🤞

Seven takeaways follow, one post at a time. The full piece, with live charts: link in bio.""",
         zh="""藍鳥 2027 外野補強：自由市場、傷兵回歸與自家農場。

2026 年藍鳥外野只打 41 轟，30 隊並列第 29。自由市場上 Arozarena、Suzuki 和日職的 Teruaki Sato 能直接補上缺口；Santander 和 Barger 2026 年幾乎沒上場；農場有深度，但還沒有強打。

我的想法：最多一張大合約，我認為 Suzuki 最適合 🤞

接下來分七篇，一次講一個重點。完整文章（含互動圖表）：連結在個人檔案。"""),
    dict(day="of1", series="outfield", kind="article", part=1, title="Part 1/7 · An outfield that couldn't hit it out",
         x=f"""The outfield's OPS was close to average (.707 vs .723), but its 41 homers tied for 29th of 30. DH was worse: a .644 OPS, 28th. Part 1/7 of the 2027 outfield piece: {OUTFIELD} #BlueJays""",
         en="""An outfield that couldn't hit it out.

The 2026 Jays outfield's OPS was close to average (.707, MLB .723), but its 41 home runs tied for 29th of 30 clubs (MLB average: 58).

DH was an even bigger hole: a .644 OPS, 28th.""",
         zh="""外野打不出全壘打。

2026 年藍鳥外野的 OPS 接近平均（.707，大聯盟平均 .723），但只打 41 轟，30 隊並列第 29（平均 58 轟）。

DH 的洞更深：OPS .644，第 28。"""),
    dict(day="of2", series="outfield", kind="article", part=2, title="Part 2/7 · The 20-homer bats were on the IL",
         x=f"""No Jays outfielder hit more than 10 homers in 2026. The two who can, Santander (44 in 2024) and Barger (21 in 2025), barely played. Part 2/7: {OUTFIELD} #BlueJays""",
         en="""The 20-homer bats were on the IL.

No Jays outfielder hit more than 10 home runs in 2026. The two who can barely played: Anthony Santander (44 in 2024) had no MLB plate appearances, and Addison Barger (21 in 2025) had 28.""",
         zh="""能打 20 轟的人，都在傷兵名單。

2026 年沒有一位藍鳥外野手超過 10 轟。有這個能力的兩個人幾乎都沒上場：Anthony Santander（2024 年 44 轟）整季沒有大聯盟打席，Addison Barger（2025 年 21 轟）只有 28 個打席。"""),
    dict(day="of3", series="outfield", kind="article", part=3, title="Part 3/7 · Three bats that change a lineup",
         x=f"""Only three free-agent outfielders can fill a 20-homer gap on their own: Arozarena (26 HR, 151 wRC+), Suzuki (26, 134) and NPB's Teruaki Sato (39). Part 3/7: {OUTFIELD} #BlueJays""",
         en="""Three bats that change a lineup.

Only three free-agent outfielders can fill a 20-homer gap on their own:
Randy Arozarena: 26 HR, 151 wRC+
Seiya Suzuki: 26 HR, 134 wRC+
Teruaki Sato (NPB): 39 HR, .306 AVG

Two steady veterans and an unknown from Japan.""",
         zh="""能改變打線的三個人。

自由市場上只有三位外野手能直接補上 20 轟的缺口：
Randy Arozarena：26 轟，wRC+ 151
Seiya Suzuki：26 轟，wRC+ 134
Teruaki Sato（NPB）：39 轟，打擊率 .306

兩位穩定的老將，和一位日本職棒的未知數。"""),
    dict(day="of4", series="outfield", kind="article", part=4, title="Part 4/7 · Cheaper bats, and the Jays' glove habit",
         x=f"""Bauers (143 wRC+) and Grichuk (139) can hit, but the Jays' team OAA has ranked top 12 five years running, so weak gloves look like DHs in Toronto. Part 4/7: {OUTFIELD} #BlueJays""",
         en="""Cheaper bats, and the Jays' glove habit.

Jake Bauers (143 wRC+) and Randal Grichuk (139) can hit, but their Def is −14.5 and −6.5 (fielding runs plus the position adjustment).

The Jays' team OAA has ranked in the top 12 five years running, so in Toronto weak gloves look more like DHs.""",
         zh="""便宜選項，和藍鳥的守備偏好。

Jake Bauers（wRC+ 143）和 Randal Grichuk（139）都能打，但 Def 分別是 −14.5 和 −6.5（守備得分加上守位調整）。

藍鳥的球隊 OAA 連續五季都在前 12 名，守備差的人在多倫多比較像 DH。"""),
    dict(day="of5", series="outfield", kind="article", part=5, title="Part 5/7 · The farm: depth, not a slugger",
         x=f"""The farm offers outfield depth, not a slugger: Piñango and Schreck are on-base types, and Jake Cook's 80-grade speed is still in Single-A. Part 5/7: {OUTFIELD} #BlueJays""",
         en="""The farm: depth, not a slugger.

The closest outfield prospects are on-base types: Yohendrick Piñango (11 HR, .351 OBP in Triple-A) and RJ Schreck (.378 OBP). The best tool, Jake Cook's 80-grade speed, is still in Single-A.

Brett Bateman is already up, with a 138 wRC+.""",
         zh="""農場：有深度，缺強打。

最接近大聯盟的外野新秀都是上壘型：Yohendrick Piñango（3A 11 轟、OBP .351）和 RJ Schreck（OBP .378）。工具最好的 Jake Cook（80 分跑速）還在 Single-A。

Brett Bateman 已經上來了，wRC+ 138。"""),
    dict(day="of6", series="outfield", kind="article", part=6, title="Part 6/7 · December 1 is the line",
         x=f"""December 1: the CBA expires, and most reports expect a lockout that would freeze signings and trades. The big outfield deals will likely land before it. Part 6/7: {OUTFIELD} #BlueJays""",
         en="""December 1 is the line.

The CBA expires on December 1, and most reports expect a lockout, which would freeze signings and trades. The last one lasted 99 days (2021–22). NPB's posting window runs Nov 1 – Dec 15.

The big outfield deals will likely land before December 1.""",
         zh="""12/1 是分水嶺。

勞資協議 12/1 到期，多數報導預期會停擺，簽約和交易都會凍結。上次停擺（2021–22）持續 99 天。日職的 posting 期間是 11/1 到 12/15。

大型的外野簽約，很可能都擠在 12/1 之前。"""),
    dict(day="of7", series="outfield", kind="article", part=7, title="Part 7/7 · My take: one big deal, then wait",
         x=f"""My take: one big contract at most, and I think Suzuki fits best. Give center to Bateman and Straw, wait on Barger and Santander, and let the farm supply the depth 🤞 Part 7/7: {OUTFIELD} #BlueJays""",
         en="""My take: one big deal, then wait.

One big contract at most, and I think Seiya Suzuki fits best: a 134 wRC+ and a +1.5 Def in right field (Arozarena: −11.7 in left).

Give center to Bateman and Straw, wait on Barger and Santander, and let the farm supply the depth 🤞

Who would you sign?""",
         zh="""我的想法：最多一張大合約。

我認為 Seiya Suzuki 最適合：wRC+ 134，右外野 Def +1.5（Arozarena 在左外野是 −11.7）。

中外野交給 Bateman 和 Straw，再等 Barger、Santander 回歸，深度交給農場 🤞

如果是你，會簽誰？"""),
    dict(day="ws0", series="ws", kind="article", title="Article launch: 2026 World Series preview",
         x=f"""New on Suyu's Jays Notes: a 2026 World Series preview.

The Brewers won 103 games by getting on base and leaning on a lockdown bullpen. The Rays won 98, eight more than their run differential predicts. How they match up, and my pick.

{WS}
#WorldSeries""",
         en="""2026 World Series preview: Brewers vs. Rays.

Two clubs chasing a first title. The Brewers won 103 games by getting on base and leaning on a lockdown bullpen; the Rays won 98 by not striking out and not walking anyone, eight more than their run differential predicts.

Three takeaways follow, one post at a time. The full preview, with live charts: link in bio.""",
         zh="""2026 世界大賽賽前預測：Brewers vs Rays。

兩支都還沒拿過冠軍的球隊。Brewers 靠上壘和鐵牛棚拿下 103 勝；Rays 靠不被三振、不投保送贏了 98 場，比得失分預期多 8 勝。

接下來分三篇，一次講一個重點。完整文章（含互動圖表）：連結在個人檔案。"""),
    dict(day="ws1", series="ws", kind="article", part=1, title="Part 1/3 · Two ways to win",
         x=f"""Two ways to win: the Brewers led MLB in OBP (.341) and pitcher strikeout rate. The Rays had the lowest strikeout rate in baseball (18.8%) and won 98 games, 8 more than their run differential predicts.

Part 1/3: {WS}
#WorldSeries""",
         en="""Two ways to win.

The Brewers get on base and strike hitters out: 1st in MLB in OBP (.341) and in pitcher strikeout rate (25.8%).

The Rays rarely strike out (18.8%, lowest in MLB) or walk anyone (6.9%, also lowest), and won 98 games, 8 more than their run differential predicts.""",
         zh="""兩種不同的贏球方式。

Brewers 靠上壘和三振：上壘率 .341、投手三振率 25.8%，都是大聯盟第 1。

Rays 很少被三振（18.8%，30 隊最低），投手也很少保送（6.9%，同樣最低），贏了 98 場，比得失分預期多 8 場。"""),
    dict(day="ws2", series="ws", kind="article", part=2, title="Part 2/3 · Rays' rotation, Brewers' bullpen",
         x=f"""The Brewers' bullpen has thrown more postseason innings than their starters: 40.2 IP, 1.33 ERA. The Rays are the opposite: a 1.98 starters' ERA over 50 innings, led by Rasmussen (8, 6 and 7 IP).

Part 2/3: {WS}
#WorldSeries""",
         en="""Rays' rotation, Brewers' bullpen.

This postseason the Brewers' bullpen has thrown 40⅔ innings, more than their starters' 30⅓, with a 1.33 ERA.

The Rays are the opposite: their starters have a 1.98 ERA over 50 innings, and Drew Rasmussen went 8, 6 and 7 innings in his three starts. Jacob Misiorowski starts Game 1 for Milwaukee.""",
         zh="""先發看 Rays，牛棚看 Brewers。

這次季後賽 Brewers 牛棚投了 40.2 局，比先發的 30.1 局還多，ERA 1.33。

Rays 剛好相反：先發 50 局 ERA 1.98，Rasmussen 三場先發投了 8、6、7 局。Brewers 的 Game 1 由 Misiorowski 先發。"""),
    dict(day="ws3", series="ws", kind="article", part=3, title="Part 3/3 · My pick: the Brewers",
         x=f"""My pick: the Brewers. Their bullpen has a 1.33 postseason ERA, Milwaukee held the Dodgers to 11 runs in 4 NLCS games, and the Rays' postseason OBP is .293. The Rays' path: starters who go deep and a long series.

Part 3/3: {WS}
#WorldSeries""",
         en="""My pick: the Brewers.

Their bullpen has a 1.33 ERA this postseason, and Milwaukee held the Dodgers to 11 runs in four NLCS games. The Rays' bats are less steady: a .293 postseason OBP.

The Rays' path: starters who go six or seven innings, and a long series that wears the Brewers' bullpen down. Still, I'm hoping this goes six or seven games!

Who's your pick?""",
         zh="""我的預測：Brewers。

Brewers 牛棚季後賽 ERA 1.33，NLCS 四場只讓 Dodgers 拿 11 分。Rays 的打線比較不穩：季後賽上壘率只有 .293。

Rays 的劇本：先發每場吃 6、7 局，把系列賽拖長、拖累 Brewers 的牛棚。不過我還是希望打到第六或第七場!

你看好哪一隊？"""),
]

SERIES = {
    "review": ("2026 season review", "2026 賽季回顧", 6),
    "outfield": ("2027 outfield upgrade", "2027 外野補強", 7),
    "ws": ("World Series preview", "世界大賽賽前預測", 3),
}


def ig_caption(p, lang):
    body = p[lang]
    if p["kind"] == "article" and "part" in p:
        en_name, zh_name, total = SERIES[p["series"]]
        body += "\n\n" + part_footer(en_name, zh_name, p["part"], total)[lang]
    return body + "\n\n" + (SERIES_TAGS.get(p["series"], {}).get(lang) or TAGS[(p["kind"], lang)])


def x_weight(text):
    """X's weighted length: a link counts 23; code points outside X's Latin ranges count 2."""
    text = re.sub(r"https?://\S+", "x" * 23, text)
    light = lambda c: c <= 4351 or 8192 <= c <= 8205 or 8208 <= c <= 8223 or 8242 <= c <= 8247
    return sum(1 if light(ord(ch)) else 2 for ch in text)


IG_TIME = {"en": "英文 · 多倫多晚上 6–8 點", "zh": "中文 · 多倫多早上 8 點左右（台北晚上）"}
OLD_IG_DAYS = ["d0", "d1", "d3", "d5", "d7", "d9", "d11", "of0"]  # days whose Instagram post the old kit (carousels) covered
# Days whose posts are all up (the queue's posted rows): ticked and locked on every device.
# D2 / D4 Instagram went out inside the D0 carousel (14 slides, before the 2026-10-21 split).
POSTED_DAYS = ["d0", "d1", "d2", "d3", "d4", "d5"]


def block(day, kind, label, meta, img, w, h, caption, name):
    bid = f"{day}-{kind}"
    posted = " checked disabled data-posted" if day in POSTED_DAYS else ""
    return f"""  <div class="block {kind}" id="b-{bid}">
  <div class="block-head"><span class="platform">{label}</span><span class="meta">{meta}</span>
    <label class="done"><input type="checkbox" id="done-{bid}" data-done="{bid}" data-day="{day}"{posted}> 已發</label></div>
  <img class="shot" src="{img}" width="{w}" height="{h}" alt="{day.upper()} {label} 圖卡" loading="lazy">
  <div class="row">
    <button class="btn save" type="button" data-save="{img}" data-name="{name}">存圖</button>
    <button class="btn" type="button" data-copy="cap-{bid}">{'複製貼文' if kind == 'x' else '複製說明文字'}</button>
  </div>
  <pre class="cap" id="cap-{bid}">{html.escape(caption)}</pre>
</div>"""


def section(p):
    d = p["day"]
    xw = x_weight(p["x"])
    assert xw <= 280, (d, xw)
    for lang in ("en", "zh"):
        assert len(ig_caption(p, lang)) <= 2200, (d, lang)
    return f"""<section class="post" id="{d}">
  <header class="post-head">
    <span class="day">{d.upper()}</span>
    <h2>{html.escape(p['title'])}</h2>
  </header>
{block(d, 'x', 'X', f'英文 · {xw} / 280', f'{d}/x.png', 1200, 675, p['x'], f'suyu-jays-{d}-x.png')}
  <div class="pair">
{block(d, 'ig-en', 'IG English', IG_TIME['en'], f'{d}/ig-en.png', 1080, 1440, ig_caption(p, 'en'), f'suyu-jays-{d}-ig-en.png')}
{block(d, 'ig-zh', 'IG 中文', IG_TIME['zh'], f'{d}/ig-zh.png', 1080, 1440, ig_caption(p, 'zh'), f'suyu-jays-{d}-ig-zh.png')}
  </div>
</section>"""


def page():
    chips = "".join(f'<a class="chip" href="#{p["day"]}" data-chip="{p["day"]}">{p["day"].upper()}</a>' for p in POSTS)
    review = "\n".join(section(p) for p in POSTS if p["series"] == "review")
    outfield = "\n".join(section(p) for p in POSTS if p["series"] == "outfield")
    ws = "\n".join(section(p) for p in POSTS if p["series"] == "ws")
    return (HERE / "kit_template.html").read_text(encoding="utf-8") \
        .replace("{{CHIPS}}", chips).replace("{{REVIEW}}", review).replace("{{OUTFIELD}}", outfield) \
        .replace("{{WS}}", ws) \
        .replace("{{OLD_IG_DAYS}}", json.dumps(OLD_IG_DAYS))


def captions_md():
    out = ["# Posting kit captions\n", "Generated by build_kit.py. X = English; Instagram = an English post and a Chinese post, one image each.\n"]
    for p in POSTS:
        out.append(f"\n## {p['day'].upper()} · {p['title']}\n")
        out.append(f"\n### X ({x_weight(p['x'])} / 280) · `{p['day']}/x.png`\n\n```\n{p['x']}\n```\n")
        for lang, label in (("en", "Instagram · English"), ("zh", "Instagram · 中文")):
            out.append(f"\n### {label} · `{p['day']}/ig-{lang}.png`\n\n```\n{ig_caption(p, lang)}\n```\n")
    return "".join(out)


if __name__ == "__main__":
    for p in POSTS:
        for f in ("x", "ig-en", "ig-zh"):
            assert (OUT / p["day"] / f"{f}.png").exists(), (p["day"], f)
    (OUT / "posting-kit.html").write_text(page(), encoding="utf-8")
    (OUT / "captions.md").write_text(captions_md(), encoding="utf-8")
    print("ok", len(POSTS), "days")
