"""Pull the MLB standings snapshot (both leagues, all six divisions) and upsert
web_standings -- the source for the /standings page and the home-page AL East +
playoff-race module.

Usage:
    python etl/pull_standings.py                 # current season
    python etl/pull_standings.py --season 2025

Source: MLB Stats API
    /api/v1/standings?leagueId=103,104&season=YEAR&standingsTypes=regularSeason&hydrate=team
Writes: web_standings (30 rows per season, overwritten in place)

Grain: ONE ROW PER TEAM PER SEASON -- a live snapshot, not a daily history
(locked P11 D2). Past seasons return their final standings, so re-running for
2024/2025 is safe and idempotent.
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

from db import connect, upsert_standings  # noqa: E402
from mlb_api import fetch_standings  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_standings")

# 30 clubs across 6 divisions. A short count means a division came back empty
# and the page would silently render a missing table -- worth a loud warning.
EXPECTED_TEAMS = 30


def run(season: int) -> None:
    rows = fetch_standings(season)
    if not rows:
        log.warning("No standings rows returned for %s", season)
        return
    if len(rows) != EXPECTED_TEAMS:
        log.warning(
            "Expected %d teams for %s, got %d -- a division may be missing",
            EXPECTED_TEAMS, season, len(rows),
        )

    with connect() as conn:
        upsert_standings(conn, rows)
        conn.commit()

    divisions = len({r["division_id"] for r in rows})
    log.info(
        "Upserted %d web_standings rows for %s (%d divisions)",
        len(rows), season, divisions,
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--season", type=int, default=date.today().year, help="MLB season year"
    )
    args = ap.parse_args(argv)
    run(args.season)
    return 0


if __name__ == "__main__":
    sys.exit(main())
