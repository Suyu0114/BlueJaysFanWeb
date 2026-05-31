# 藍鳥 Fan Hub — ETL 更新流程

## 每季一次性 Backfill（新賽季或補歷史資料）

```powershell
conda activate MLBxBaZi
cd C:\Users\jing8\Desktop\myProject\BlueJaysFanWeb
```

**Step 1：同步球員名單**
```powershell
python etl/pull_team_players.py --season 2026
```

**Step 2：跑 Statcast + 守備資料**
```powershell
python etl/backfill.py --season 2026
```

**Step 3：下載 FanGraphs CSV（手動）**

到 https://www.fangraphs.com/leaders/major-league，下載四個檔案放進 `etl/data/fangraphs/`：

| 檔案 | 設定 |
|---|---|
| `batting_2026.csv` | Batting / Blue Jays / 2026 / Min PA: 1 / Regular Season / **不勾 Split Seasons** |
| `pitching_2026.csv` | Pitching / Blue Jays / 2026 / Min IP: 1 / Regular Season / **不勾 Split Seasons** |

**Step 4：寫入 KPI 數據**
```powershell
python etl/pull_season_stats.py --season 2026
```

---

## 注意事項

- Step 1 必須在 Step 4 之前跑，否則 FK 錯誤（新球員不在 `web_players` 裡）
- Step 2 和 Step 4 可以分開跑，互不影響
- FanGraphs CSV 是手動下載，in-season 需要時再更新
- 歷史賽季（2024 / 2025）資料已經在 DB，不需要重跑

---

## 每日 Cron（自動，不用手動）

GitHub Actions 每天 09:00 ET 自動執行：
- 更新 2026 rolling 7 天 Statcast
- 更新守備資料
- 嘗試 FanGraphs KPI（若 CSV 不存在則 warning + 跳過）

---

## 快速 Spot-check（跑完驗證用）

```sql
-- 確認 2026 球員有進來
SELECT COUNT(*) FROM web_player_seasons WHERE season = 2026;

-- 確認 Vladdy 的 KPI 有值
SELECT * FROM web_player_season_stats WHERE mlbam_id = 665489 AND season = 2026;

-- 確認最新比賽日期（首頁用這個）
SELECT MAX(game_date) FROM web_statcast_events;
```