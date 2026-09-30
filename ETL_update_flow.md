# 藍鳥 Fan Hub — ETL 更新流程

## 每季一次性 Backfill（新賽季或補歷史資料）

```powershell
conda activate MLBxBaZi
cd C:\Users\jing8\Desktop\myProject\BlueJaysFanWeb
```

**Step 1：同步球員名單（P7 起為選用）**
```powershell
python etl/pull_team_players.py --season 2026
```
> P7 起 `backfill.py` 的第 1 步已經會自己跑 `pull_team_players`，所以這步單獨跑
> 是「無害但非必要」。只有想單獨刷新名單（例如趕快補一個剛交易來、還沒進
> `web_players` 的球員）時才需要。

**Step 2：跑完整 backfill（P7 起為 7 步驟串接）**
```powershell
python etl/backfill.py --season 2026
```
`backfill.py` 會依序跑下面 7 步（每步都 idempotent，可安全重跑）：

| # | Script | 寫入 |
|---|---|---|
| 1 | `pull_team_players` | roster bio → `web_players` + `web_player_seasons` |
| 2 | `pull_schedule` | 整季賽程，含未來未打場次 → `web_games` |
| 3 | `pull_statcast --all-batters` | 打者 Statcast → `web_statcast_events` |
| 4 | `pull_pitcher --all-pitchers` | 投手 Statcast → `web_statcast_events` |
| 5 | `pull_fielding` | OAA / FRV → `web_fielding_frv` |
| 6 | `pull_season_stats` | OPS / wRC+ / ERA / FIP / WAR **+ Value 細項**（`war_*` / `rar`）+ 打者 basic line + 投手 line → `web_player_season_stats`（MLB Stats API，全自動） |
| 7 | `pull_boxscore --season` | 每場 final 的 box score → `web_player_game_stats` |

> 順序由 `backfill.py` 內部保證：`pull_schedule`（第 2 步）一定在 `pull_boxscore`
> （第 7 步）之前，因為 boxscore 用 `web_games.is_final` 當 final-game guard。

**Step 3：單獨補寫 season stats（選用）**
```powershell
python etl/pull_season_stats.py --season 2026
```
> 2026-09-23 起 season stats（OPS / wRC+ / ERA / FIP / WAR + Value 細項 + 打者
> basic line + 投手 W/L/SV/GS/IP/WHIP/K%/BB%）改從 **MLB Stats API** 抓
> （`stats=season,sabermetrics`，免費、不用 key），**不再需要 FanGraphs 會員或
> 手動下載 CSV**。API 的 sabermetrics 就是 MLB 授權的 FanGraphs 數據，WAR 跟
> FanGraphs 排行榜差 ±0.05 以內。每天 ~09:00 ET 的 cron 會自動跑當季；這步只在
> 想馬上刷新、或補過去球季時才需要。
>
> - 捕手的 `war_fielding` 是用 `rar` 減掉其他五項推出來的（API 的 `fielding`
>   不含 framing，但 `rar`/`war` 有含），這樣才跟 FanGraphs 的 `Fld` 一致。
> - API 沒有 WPA，所以 `wpa` 不再更新（停在最後一次 CSV 匯入的值；網站沒顯示）。
> - `etl/data/fangraphs/` 的舊 CSV 已經沒有程式在讀，可以刪。
> - 2026-09-29 起 team leaderboard 只拿來「列出有哪些球員」，每個人的數字改抓
>   他自己的 `/people/{id}/stats` 藍鳥 split（季末 leaderboard 的 sabermetrics
>   會延遲，Scherzer FIP 5.43 vs 正確的 5.11）。所以這步會多打 ~100 個 request，約 30 秒。

**Step 4（P12）：球員「在其他隊」的歷史（一次性）**

名單 = 某季藍鳥 `fullSeason` 名單（交易進來 **和** 送走的都算），補他們 2024–2026
**整個大聯盟**的資料，包括整季都在別隊的球季（例：Dylan Cease 2025 = 教士）。
順序有相依，要照這樣跑：
```powershell
# 0) 先確認該季名單已在 web_player_seasons（backfill.py 第 1 步會寫）
# 1) 每隊一列 + 全季合計（team_id = 0）→ web_player_team_season_stats
python etl/pull_player_splits.py --cohort-season 2026 --season 2024 --season 2025 --season 2026
# 2) 名單球員「不在藍鳥」的那幾季 Statcast（會讀第 1 步的表決定要抓誰；日期窗自動放寬成 3/1–10/5）
python etl/pull_statcast.py --all-batters  --season 2024 --cohort-season 2026
python etl/pull_pitcher.py  --all-pitchers --season 2024 --cohort-season 2026
python etl/pull_statcast.py --all-batters  --season 2025 --cohort-season 2026
python etl/pull_pitcher.py  --all-pitchers --season 2025 --cohort-season 2026
```
> - 在藍鳥的球季本來就是「整季、所有球隊」抓的（Statcast 是用球員 id 抓），所以
>   `--cohort-season` 只會抓他整季都在別隊的球季。
> - 守備（`pull_fielding`）本來就是全聯盟，不用另外補。
> - 「以藍鳥身份」= 他出現在那場藍鳥 box score 裡（`web_player_game_stats`），
>   **不是**「那場是藍鳥的比賽」——被交易走的球員回頭打藍鳥時，那場也在 `web_games`。
>   所以 box score 要先補齊（見下方 2024/2025 box score）。
> - 當季（`--cohort-season $SEASON --season $SEASON`）已排進 09:00 ET cron；
>   明年要補 2027 名單的歷史，把 2026 換成 2027 再跑一次即可。

**Step 5（P12）：產生季末文章數據包（唯讀，不會寫 DB）**
```powershell
python etl/season_report.py --season 2026 --vs 2025
```
輸出到 `reports/season-review-2026/`（已 git-ignore）：`README.md`（凍結時間、定義、
注意事項）、`team.md`、`batters.*`、`pitchers.*`、`pitchers_arsenal.csv`、`movers.md`、
`roster_moves.md`（新加入 / 季中交易進出，含在其他隊的成績）、`league_context.md`。
> - 要在 season stats / splits 都刷新過之後再跑（季末：兩班 cron 都跑過最後一場之後）。
> - Chase% / Zone% 這類「看好壞球帶」的數字，2026 跟之前的季**不能直接比**（Savant
>   2026 的 zone 定義變了，全體樣本 Chase% 自己就 +2.8）。報告裡有「扣掉整體位移」
>   的欄位，寫文章時請用那個。

**Step 6（P12 M6）：聯盟脈絡（Savant 排行榜 + 聯盟平均）**
```powershell
python etl/pull_savant_leaderboards.py --season 2024 --season 2025 --season 2026
python etl/pull_league_averages.py     --season 2024 --season 2025 --season 2026
```
> - 兩支都已排進 09:00 ET cron（當季）和 `backfill.py`（第 9、10 步）。
> - Savant 的數字是**整季、所有球隊合計**，照 Savant 原樣存；百分位 100 = 最好。
>   沒有那一列 = 未達門檻（不是 0）。每次跑會替換該季的列，所以掉出門檻的人會被移除。
> - **Pitch run value 正值 = 對投手好**（已用 2025 全聯盟資料驗證）。
> - 聯盟平均是把 30 隊的計數數據加總後再算比率，不是 30 隊比率的平均。

---

## 注意事項

- `backfill.py` 內部已處理好相依順序（roster 先、boxscore 最後），照 Step 2
  一次跑完即可。
- 第 6 步（season-stats）打 MLB Stats API；API 掛掉會讓該步失敗（跟 schedule /
  standings 一樣），重跑即可。
- 歷史賽季（2024 / 2025）的 Statcast / 名單已經在 DB；**賽程 + box score** 已在
  2026-09-29（P12 M0）補齊（2024 162 場、2025 162 + 18 季後賽，全部有 box score）。
  只補這兩張表、不想重抓 Statcast 的話：
  ```powershell
  python etl/pull_schedule.py --season 2024
  python etl/pull_boxscore.py --season 2024
  ```
  `web_games.game_type`（migration `013`）分開例行賽 `R` 和季後賽 `F/D/L/W`——
  算戰績一定要 `game_type = 'R'`。
- **P11 戰績排名（`web_standings`）**：`pull_standings.py` 已排進 `backfill.py`
  (Step 3/8) 和**兩班** cron，平常不用手動跑。單獨補某一季：
  ```powershell
  python etl/pull_standings.py --season 2026     # 應該是 30 rows / 6 divisions
  ```
  這張表是**快照**不是歷史：每次跑都覆寫該季的 30 列，沒有日期維度。過去球季
  抓回來的是該季**最終**排名，重跑安全。
- **球隊 Logo 是一次性的**（`etl/fetch_team_logos.py`）：把 30 隊的球帽 logo 下載
  後改成本站配色（navy ink / papaya paper）寫進 `web/public/team-logos/`，**產物
  已 commit 進 repo**。除非要換配色，否則不用再跑，**也絕對不要**加進 cron。
  ```powershell
  python etl/fetch_team_logos.py                 # 應該寫出 30 個檔案
  ```

---

## 每日 Cron（自動，不用手動）

P7 起 GitHub Actions 有**兩個**排程（都 idempotent、都會 upsert）：

- **~09:00 ET**：2026 rolling 7 天 Statcast、守備、`web_games` 賽程 refresh、
  `web_standings` 排名 refresh、近 ~3 天 box score 補抓（West-Coast / 晚場 final
  在這裡補完）、season stats（WAR / OPS / ERA …，MLB Stats API）、當季名單的每隊
  season line（`pull_player_splits`，被交易走的球員在新球隊的成績也會每天更新）。
- **~23:30 ET**：今天的賽程 refresh + 排名 refresh + 今天 final 場次的 box score。

> 兩班的順序都是 **schedule → standings → boxscore → revalidate**。

> GitHub cron 是 best-effort，可能延遲 10–15 分鐘；西岸客場（~22:00 ET 開打、
> ~01:00 ET 結束）在 23:30 還沒打完是正常的，會留給隔天 09:00 那班補。

---

## 快速 Spot-check（跑完驗證用）

```sql
-- 確認 2026 球員有進來
SELECT COUNT(*) FROM web_player_seasons WHERE season = 2026;

-- P11 排名：每季應該剛好 30 列、6 個分區
SELECT season, COUNT(*), COUNT(DISTINCT division_id) FROM web_standings GROUP BY season;

-- wild_card_rank 應該剛好在 6 支分區龍頭上是 NULL（上游本來就沒有這個欄位）
SELECT COUNT(*) FILTER (WHERE wild_card_rank IS NULL) AS wc_null,
       COUNT(*) FILTER (WHERE division_leader)        AS leaders
FROM web_standings WHERE season = 2026;

-- 確認 Vladdy 的 KPI 有值
SELECT * FROM web_player_season_stats WHERE mlbam_id = 665489 AND season = 2026;

-- P7: 確認 Vladdy 的 WAR 細項有值（war_* / rar / wpa）
SELECT mlbam_id, season, war, rar, wpa,
       war_batting, war_baserunning, war_fielding,
       war_positional, war_league, war_replacement
FROM web_player_season_stats
WHERE mlbam_id = 665489 AND season = 2026;
-- 期望：rar = war_batting+war_baserunning+war_fielding+war_positional
--               +war_league+war_replacement（war_fielding 是用 rar 反推的，所以會精準相等）
-- wpa 從 2026-06 起不再更新（MLB API 沒有 WPA）

-- P7: 確認賽程有進來（含未來未打的場次；finals < games）
SELECT season,
       COUNT(*)                            AS games,
       COUNT(*) FILTER (WHERE is_final)    AS finals
FROM web_games
WHERE season = 2026
GROUP BY season;

-- P7: 確認 box score 有進來（每場 final 應該有十幾個 batting/pitching row）
SELECT COUNT(DISTINCT pgs.game_pk)                          AS games_with_lines,
       COUNT(*)                                             AS stat_rows,
       COUNT(*) FILTER (WHERE pgs.stat_group = 'batting')   AS batting_rows,
       COUNT(*) FILTER (WHERE pgs.stat_group = 'pitching')  AS pitching_rows
FROM web_player_game_stats pgs
JOIN web_games g ON g.game_pk = pgs.game_pk
WHERE g.season = 2026;

-- 確認最新比賽日期（首頁用這個）
SELECT MAX(game_date) FROM web_statcast_events;

-- P10: 確認投手季 line 有進來（Gausman；每季 WHIP/K%/BB% 都應該有值）
SELECT season, w, l, sv, gs, ip, era, whip, k_pct, bb_pct
FROM web_player_season_stats WHERE mlbam_id = 592332 ORDER BY season;

-- P12: 每隊 season line。Varsho 2026 應該是 3 列：0（合計 526 PA）/ 117 HOU 161 / 141 TOR 365
SELECT team_id, pa, ops, war, g, first_game, last_game
FROM web_player_team_season_stats WHERE mlbam_id = 662139 AND season = 2026 ORDER BY team_id;

-- P12: team_id = 141 的列必須跟 web_player_season_stats 一致（應該回 0 列）
SELECT t.mlbam_id, t.season, t.war, s.war
FROM web_player_team_season_stats t
JOIN web_player_season_stats s USING (mlbam_id, season)
WHERE t.team_id = 141 AND abs(coalesce(t.war,0) - coalesce(s.war,0)) > 0.01;

-- P12: 例行賽戰績要等於 web_standings（2025 = 94-68）
SELECT season, COUNT(*) FILTER (WHERE result = 'W') AS w, COUNT(*) FILTER (WHERE result = 'L') AS l
FROM web_games WHERE game_type = 'R' GROUP BY season ORDER BY season;

-- P10: 確認 Statcast 新欄位已回填（pfx 應 ≈ total；balls/strikes = total）
SELECT EXTRACT(year FROM game_date)::int AS season,
       COUNT(*) AS total, COUNT(pfx_x) AS with_pfx, COUNT(balls) AS with_count
FROM web_statcast_events GROUP BY 1 ORDER BY 1;
```
