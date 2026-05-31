"""Enumerate every player on the Blue Jays' 40-man roster for a given season,
fetch their MLB Stats API bio, and upsert into web_players + web_player_seasons.

Usage:
    python etl/pull_team_players.py --season 2024
    python etl/pull_team_players.py --season 2024 --season 2025 --season 2026

Used by:
  - One-shot backfill (etl/backfill.py) to enumerate 2024-2026.
  - Nightly cron, restricted to the current season.

Source: MLB Stats API (no FanGraphs scrape -- FG has been 403-ing pybaseball).
Writes: web_players (bio); web_player_seasons (participation flags).

The "appeared_as_*" flags are seeded from MLB Stats API `position.code`:
  - code == '1'  -> pitcher only
  - code == 'Y'  -> two-way (both flags true; Ohtani-style)
  - otherwise    -> batter only
Position players who pitched a token inning in a blowout, or relievers who
took a pinch-hit at-bat, won't have the secondary flag set. We accept this
imprecision -- the upsert helper OR-merges, so if a later run (or a different
source) flips the flag true, it stays true.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_player_seasons, upsert_players_full  # noqa: E402
from mlb_api import (  # noqa: E402
    BLUE_JAYS_TEAM_ID,
    fetch_full_season_roster,
    fetch_people_details,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_team_players")


def _roles_from_position_code(code: str) -> tuple[bool, bool]:
    """Return (appeared_as_batter, appeared_as_pitcher)."""
    if code == "1":
        return (False, True)
    if code == "Y":  # two-way (rare)
        return (True, True)
    return (True, False)


def run(season: int) -> None:
    log.info("=== season %s ===", season)
    roster = fetch_full_season_roster(BLUE_JAYS_TEAM_ID, season)
    log.info("Fetched %d players from MLB Stats API (rosterType=fullSeason)", len(roster))

    mlbam_ids = [p["mlbam_id"] for p in roster]
    log.info("Fetching bio details for %d players", len(mlbam_ids))
    details = fetch_people_details(mlbam_ids)

    rows_players: list[dict] = []
    rows_seasons: list[dict] = []
    for p in roster:
        mid = p["mlbam_id"]
        d = details.get(mid, {})
        rows_players.append(
            {
                "mlbam_id": mid,
                "name": p["name"],
                # Prefer the position MLB API says is "primary"; fall back to
                # what the roster endpoint had for that slot.
                "position": d.get("primary_position") or p["position"],
                "bats": d.get("bats"),
                "throws": d.get("throws"),
                "birthdate": d.get("birthdate"),
                "birth_city": d.get("birth_city"),
                "birth_state_province": d.get("birth_state_province"),
                "birth_country": d.get("birth_country"),
                "headshot_url": d.get("headshot_url"),
            }
        )
        appeared_as_batter, appeared_as_pitcher = _roles_from_position_code(
            p["position_code"]
        )
        rows_seasons.append(
            {
                "mlbam_id": mid,
                "season": season,
                "team_id": BLUE_JAYS_TEAM_ID,
                "appeared_as_batter": appeared_as_batter,
                "appeared_as_pitcher": appeared_as_pitcher,
                # is_active_26 is owned by roster.py for the CURRENT season
                # only; never set it true here (upsert OR-merges).
                "is_active_26": False,
            }
        )

    with connect() as conn:
        n_players = upsert_players_full(conn, rows_players)
        n_seasons = upsert_player_seasons(conn, rows_seasons)
        conn.commit()
    log.info(
        "Upserted %d players + %d player_season rows for %s",
        n_players, n_seasons, season,
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--season", type=int, action="append", required=True,
                    help="Season year; pass multiple times for several seasons")
    args = ap.parse_args(argv)
    for s in args.season:
        run(s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
