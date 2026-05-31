"""Fetch the Toronto Blue Jays active roster from the MLB Stats API and
upsert it into web_players (is_active_26 = true).

Usage: python etl/roster.py
"""

from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_players_full  # noqa: E402
from mlb_api import fetch_active_roster, fetch_people_details  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("roster")


def main() -> None:
    roster = fetch_active_roster()
    log.info("Active roster: %d players", len(roster))
    details = fetch_people_details(p["mlbam_id"] for p in roster)

    rows = []
    for p in roster:
        d = details.get(p["mlbam_id"], {})
        rows.append(
            {
                "mlbam_id": p["mlbam_id"],
                "name": p["name"],
                # Prefer the position MLB API thinks is "primary"; fall back to
                # whatever the roster endpoint returned for this slot.
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

    with connect() as conn:
        with conn.cursor() as cur:
            # Clear the flag first so anyone no longer on the 26-man drops off.
            cur.execute(
                "update web_players set is_active_26 = false where is_active_26 = true"
            )
        upsert_players_full(conn, rows)
        # Then set the flag for everyone currently on the active roster.
        with conn.cursor() as cur:
            cur.execute(
                "update web_players set is_active_26 = true "
                "where mlbam_id = any(%s)",
                ([r["mlbam_id"] for r in rows],),
            )
        conn.commit()
    log.info("Upserted %d active players", len(rows))


if __name__ == "__main__":
    main()
