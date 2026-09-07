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
| 6 | `pull_season_stats` | OPS / wRC+ / ERA / FIP / WAR **+ Value 細項**（`war_*` / `rar` / `wpa`）→ `web_player_season_stats`（需要 Step 3 的 CSV 已就位） |
| 7 | `pull_boxscore --season` | 每場 final 的 box score → `web_player_game_stats` |

> 順序由 `backfill.py` 內部保證：`pull_schedule`（第 2 步）一定在 `pull_boxscore`
> （第 7 步）之前，因為 boxscore 用 `web_games.is_final` 當 final-game guard。
>
> 想讓第 6 步一次就把 `war_*` / KPI 寫進去，**先做 Step 3 把 CSV 放好再跑
> backfill**；否則第 6 步會 warning + 跳過（KPI 顯示「—」），等你補 CSV 後再
> 單獨跑 Step 4。

**Step 3：下載 FanGraphs CSV（手動，需付費會員）**

P7 改用**單一 Custom Report**匯出打者檔。**不要**再用 Dashboard preset 疊加多個
view — 那是先前產生重複 `wRC+` / `ISO` / `SLG` / `BsR` 欄位的原因。

到 https://www.fangraphs.com/leaders/major-league，放進 `etl/data/fangraphs/`：

| 檔案 | 設定 |
|---|---|
| `batting_2026.csv` | **Batting** 分頁 / Blue Jays / 2026 / Min PA: 1 / Regular Season / **不勾 Split Seasons** / 用 **Custom Report**：保留現有 dashboard 欄位（已含 P9 逐年表用的 `AVG`/`OBP`/`SLG`/`HR`/`RBI`/`SB`/`PA`），**再加上 Value 區** `Bat`、`BsR`、`Fld`、`Pos`、`Lg`、`Rep`、`RAR`、`WPA` |
| `pitching_2026.csv` | **Pitching** 分頁 / Blue Jays / 2026 / Min IP: 1 / Regular Season / **不勾 Split Seasons** / **P10 起改用 Custom Report**：保留 Dashboard 欄位（已含 `W`/`L`/`SV`/`GS`/`IP`/`ERA`/`FIP`/`K/9`/`WAR`），**再加上 `WHIP`、`K%`、`BB%`**（Dashboard preset 沒有這三欄；缺了投手 Overview 會顯示「—」） |

> - 兩個檔都必須含 identity 欄位 `Name` 與 `MLBAMID`（`MLBAMID` 是 join 到
>   `web_players` 的鍵）。
> - 8 個 Value 欄位全部在 Batting 分頁的 Value 區，**單檔即可**，不需另開
>   fielding CSV 來 join。
> - header 字串已對照確認（見 `pull_season_stats.py` 的 `WAR_COMPONENT_COLS`
>   與 P9 的 `BASIC_STAT_COLS`）；`pull_season_stats.py` 會在欄位重複或缺漏時
>   warning，不會 hard-fail。
> - **P9 basic line**：`AVG`/`OBP`/`SLG`/`HR`/`RBI`/`SB`/`PA` 是 Dashboard preset
>   既有欄位，照上面「保留現有 dashboard 欄位」匯出即可，逐年表會自動帶入；
>   舊 CSV 只要含這些欄位，重跑 `pull_season_stats.py` 就會補寫（不必重新匯出）。
> - **P10 pitcher line**：`W`/`L`/`SV`/`GS`/`IP` 舊 Dashboard CSV 已有（重跑
>   importer 即補寫）；`WHIP`/`K%`/`BB%` **必須**重新匯出 Custom Report 才會有，
>   2024 / 2025 / 2026 三個 pitching CSV 都要換。`K%`/`BB%` 匯出值是小數
>   （`0.245`），importer 原樣入庫，前端才 ×100 顯示。`IP` 是棒球記法
>   （`170.1` = 170⅓），只供顯示，運算用 box score 的 `outs_recorded`。

**Step 4：單獨補寫 KPI（只有在 backfill 之後又更新了 CSV 才需要）**
```powershell
python etl/pull_season_stats.py --season 2026
```
> 一般情況下 Step 2 的第 6 步已經寫過了；這步只是「換了新 CSV、不想重跑整個
> backfill」時的捷徑。

---

## 注意事項

- `backfill.py` 內部已處理好相依順序（roster 先、boxscore 最後），照 Step 2
  一次跑完即可。
- 第 6 步（season-stats）依賴 Step 3 的 CSV；CSV 不在時 warning + 跳過，**不會**
  中斷 backfill。
- FanGraphs CSV 是手動下載，in-season 需要時再更新。
- 歷史賽季（2024 / 2025）的 Statcast / 名單已經在 DB；要補它們的**賽程 + box
  score**（P7 新表）時重跑：
  ```powershell
  python etl/backfill.py --season 2024 --season 2025
  ```
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
  在這裡補完）、嘗試 FanGraphs KPI。
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
-- 期望：rar ≈ war_batting+war_baserunning+war_fielding+war_positional
--               +war_league+war_replacement（FanGraphs 顯示捨入內，±0.x 正常）

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

-- P10: 確認投手季 line 有進來（Gausman；WHIP/K%/BB% 在 Custom Report 匯出前為 NULL）
SELECT season, w, l, sv, gs, ip, era, whip, k_pct, bb_pct
FROM web_player_season_stats WHERE mlbam_id = 592332 ORDER BY season;

-- P10: 確認 Statcast 新欄位已回填（pfx 應 ≈ total；balls/strikes = total）
SELECT EXTRACT(year FROM game_date)::int AS season,
       COUNT(*) AS total, COUNT(pfx_x) AS with_pfx, COUNT(balls) AS with_count
FROM web_statcast_events GROUP BY 1 ORDER BY 1;
```
