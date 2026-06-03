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
| `batting_2026.csv` | **Batting** 分頁 / Blue Jays / 2026 / Min PA: 1 / Regular Season / **不勾 Split Seasons** / 用 **Custom Report**：保留現有 dashboard 欄位，**再加上 Value 區** `Bat`、`BsR`、`Fld`、`Pos`、`Lg`、`Rep`、`RAR`、`WPA` |
| `pitching_2026.csv` | **Pitching** 分頁 / Blue Jays / 2026 / Min IP: 1 / Regular Season / **不勾 Split Seasons**（維持原樣 — P7 的 WAR 細項只做打者，投手不需要 Value 匯出） |

> - 兩個檔都必須含 identity 欄位 `Name` 與 `MLBAMID`（`MLBAMID` 是 join 到
>   `web_players` 的鍵）。
> - 8 個 Value 欄位全部在 Batting 分頁的 Value 區，**單檔即可**，不需另開
>   fielding CSV 來 join。
> - header 字串已對照確認（見 `pull_season_stats.py` 的 `WAR_COMPONENT_COLS`）；
>   `pull_season_stats.py` 會在欄位重複或缺漏時 warning，不會 hard-fail。

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

---

## 每日 Cron（自動，不用手動）

P7 起 GitHub Actions 有**兩個**排程（都 idempotent、都會 upsert）：

- **~09:00 ET**：2026 rolling 7 天 Statcast、守備、`web_games` 賽程 refresh、
  近 ~3 天 box score 補抓（West-Coast / 晚場 final 在這裡補完）、嘗試 FanGraphs KPI。
- **~23:30 ET**：今天的賽程 refresh + 今天 final 場次的 box score。

> GitHub cron 是 best-effort，可能延遲 10–15 分鐘；西岸客場（~22:00 ET 開打、
> ~01:00 ET 結束）在 23:30 還沒打完是正常的，會留給隔天 09:00 那班補。

---

## 快速 Spot-check（跑完驗證用）

```sql
-- 確認 2026 球員有進來
SELECT COUNT(*) FROM web_player_seasons WHERE season = 2026;

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
```
