"""One-shot historical backfill for 2024 + 2025 (and optionally 2026 to-date).

Do NOT add this to the nightly cron -- it intentionally pulls full seasons.
For nightly refresh see .github/workflows/etl.yml.

Usage:
    python etl/backfill.py                       # 2024 + 2025 (default)
    python etl/backfill.py --season 2024
    python etl/backfill.py --season 2024 --season 2025 --season 2026

Order matters per season:
  1. pull_team_players   -> populates web_player_seasons (everyone needed below)
  2. pull_statcast       --all-batters   (regular season + 2025 postseason)
  3. pull_pitcher        --all-pitchers  (regular season + 2025 postseason)
  4. pull_fielding       -> season-aggregate OAA/FRV per position
  5. pull_season_stats   -> OPS/wRC+/ERA/FIP/WAR
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

import pull_fielding  # noqa: E402
import pull_pitcher  # noqa: E402
import pull_season_stats  # noqa: E402
import pull_statcast  # noqa: E402
import pull_team_players  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("backfill")

# (regular-season start, regular-season end-or-postseason-end). We pull the
# full window even for non-postseason years -- a few extra empty days cost
# nothing. 2024 had no Jays postseason; 2025 did (loss in WS).
WINDOWS: dict[int, tuple[date, date, bool]] = {
    2024: (date(2024, 3, 28), date(2024, 9, 29), False),
    2025: (date(2025, 3, 27), date(2025, 11, 5), True),
    2026: (date(2026, 3, 26), date(2026, 11, 5), False),
}


def run_season(season: int) -> None:
    if season not in WINDOWS:
        raise SystemExit(f"No backfill window defined for season {season}")
    start, end, include_postseason = WINDOWS[season]
    log.info("==== BACKFILL %s (%s -> %s, postseason=%s) ====",
             season, start, end, include_postseason)

    log.info("Step 1/5: pull_team_players")
    pull_team_players.run(season)

    log.info("Step 2/5: pull_statcast --all-batters")
    pull_statcast.run_all(season, start, end, include_postseason=include_postseason)

    log.info("Step 3/5: pull_pitcher --all-pitchers")
    pull_pitcher.run_all(season, start, end, include_postseason=include_postseason)

    log.info("Step 4/5: pull_fielding")
    pull_fielding.run(season)

    log.info("Step 5/5: pull_season_stats")
    pull_season_stats.run(season)

    log.info("==== BACKFILL %s COMPLETE ====", season)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--season", type=int, action="append",
                    help="Season(s) to backfill. Default: 2024 + 2025")
    args = ap.parse_args(argv)
    seasons = args.season or [2024, 2025]
    for s in seasons:
        run_season(s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
