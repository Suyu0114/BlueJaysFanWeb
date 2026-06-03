"""Pull the Blue Jays' full-season schedule from the MLB Stats API and upsert
web_games (the calendar source). Future/unplayed games are stored too so the
calendar is fully populated; their status/score fill in as games are played.

Usage:
    python etl/pull_schedule.py                 # current season
    python etl/pull_schedule.py --season 2025

Game-type filter: only regular season + postseason rounds (R / F / D / L / W)
are kept. Spring training ('S'), exhibition ('E') and all-star ('A') games are
skipped so the calendar reflects the real season. web_games has no game_type
column by design (locked spec §2); the filter lives here.
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

from db import connect, upsert_games  # noqa: E402
from mlb_api import BLUE_JAYS_TEAM_ID, fetch_schedule  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_schedule")

# Regular season + the four postseason rounds. Excludes spring ('S'),
# exhibition ('E') and all-star ('A').
KEEP_GAME_TYPES = {"R", "F", "D", "L", "W"}


def _to_row(g: dict) -> dict:
    """Derive a web_games row from a fetch_schedule entry."""
    home, away = g["home"], g["away"]
    is_home = home["id"] == BLUE_JAYS_TEAM_ID
    jays = home if is_home else away
    opp = away if is_home else home

    jays_score = jays["score"]
    opp_score = opp["score"]

    # A genuinely final game always has both scores. Postponed / suspended games
    # may report abstractGameState 'Final' with no score -> not final here, so
    # the calendar shows status instead of a fake score.
    is_final = (
        g["abstract_state"] == "Final"
        and jays_score is not None
        and opp_score is not None
    )

    result = None
    if is_final:
        if jays_score > opp_score:
            result = "W"
        elif jays_score < opp_score:
            result = "L"
        # equal scores => tie (suspended/weather, extremely rare) => leave null

    return {
        "game_pk": g["game_pk"],
        "season": g["season"],
        "game_date": g["official_date"],
        "first_pitch_utc": g["game_datetime_utc"],
        "game_number": g["game_number"],
        "doubleheader": g["doubleheader"],
        "is_home": is_home,
        "opponent_id": opp["id"],
        "opponent_name": opp["name"],
        "jays_score": jays_score,
        "opp_score": opp_score,
        "status": g["detailed_state"],
        "is_final": is_final,
        "result": result,
        "venue": g["venue"],
    }


def _dedupe(rows: list[dict]) -> list[dict]:
    """A suspended-and-resumed game appears twice in the feed under the SAME
    game_pk (suspension date + completion date). Keep one row per game_pk,
    preferring the final/scored entry so we never persist the partial one
    (independent of feed ordering)."""
    by_pk: dict[int, dict] = {}
    for r in rows:
        prev = by_pk.get(r["game_pk"])
        if prev is None or (r["is_final"] and not prev["is_final"]):
            by_pk[r["game_pk"]] = r
        elif r["is_final"] == prev["is_final"]:
            by_pk[r["game_pk"]] = r  # same finality: later-seen entry wins
    return list(by_pk.values())


def run(season: int) -> None:
    games = fetch_schedule(season)
    kept = [g for g in games if g.get("game_type") in KEEP_GAME_TYPES]
    rows = _dedupe([_to_row(g) for g in kept])
    log.info(
        "season %s: %d games from API, %d after game-type filter + dedupe",
        season, len(games), len(rows),
    )
    if not rows:
        log.warning("No games to upsert for %s", season)
        return

    with connect() as conn:
        upsert_games(conn, rows)
        conn.commit()

    finals = sum(1 for r in rows if r["is_final"])
    log.info("Upserted %d web_games rows for %s (%d final)", len(rows), season, finals)


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
