"""Fetch the Toronto Blue Jays active roster from the MLB Stats API and
upsert it into web_players (is_active_26 = true).

Usage: python etl/roster.py
"""

from __future__ import annotations

import logging
from pathlib import Path

import requests
from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("roster")

BLUE_JAYS_TEAM_ID = 141
ROSTER_URL = f"https://statsapi.mlb.com/api/v1/teams/{BLUE_JAYS_TEAM_ID}/roster"
PEOPLE_URL = "https://statsapi.mlb.com/api/v1/people"
HEADSHOT = "https://midfield.mlbstatic.com/v1/people/{id}/spots/120"

UPSERT = """
    insert into web_players
      (mlbam_id, name, position, bats, throws, is_active_26, headshot_url, birthdate)
    values
      (%(mlbam_id)s, %(name)s, %(position)s, %(bats)s, %(throws)s, true,
       %(headshot_url)s, %(birthdate)s)
    on conflict (mlbam_id) do update set
      name         = excluded.name,
      position     = excluded.position,
      bats         = excluded.bats,
      throws       = excluded.throws,
      is_active_26 = true,
      headshot_url = excluded.headshot_url,
      birthdate    = excluded.birthdate
"""


def fetch_active_roster() -> list[dict]:
    r = requests.get(ROSTER_URL, params={"rosterType": "active"}, timeout=30)
    r.raise_for_status()
    return [
        {
            "mlbam_id": p["person"]["id"],
            "name": p["person"]["fullName"],
            "position": p["position"]["abbreviation"],
        }
        for p in r.json()["roster"]
    ]


def fetch_people_details(ids: list[int]) -> dict[int, dict]:
    r = requests.get(
        PEOPLE_URL, params={"personIds": ",".join(map(str, ids))}, timeout=30
    )
    r.raise_for_status()
    return {
        person["id"]: {
            "bats": person.get("batSide", {}).get("code"),
            "throws": person.get("pitchHand", {}).get("code"),
            "birthdate": person.get("birthDate"),
        }
        for person in r.json()["people"]
    }


def main() -> None:
    roster = fetch_active_roster()
    log.info("Active roster: %d players", len(roster))
    details = fetch_people_details([p["mlbam_id"] for p in roster])

    rows = [
        {
            **p,
            "bats": details.get(p["mlbam_id"], {}).get("bats"),
            "throws": details.get(p["mlbam_id"], {}).get("throws"),
            "birthdate": details.get(p["mlbam_id"], {}).get("birthdate"),
            "headshot_url": HEADSHOT.format(id=p["mlbam_id"]),
        }
        for p in roster
    ]

    with connect() as conn:
        with conn.cursor() as cur:
            # Clear the flag first so anyone no longer on the 26-man drops off.
            cur.execute(
                "update web_players set is_active_26 = false where is_active_26 = true"
            )
            cur.executemany(UPSERT, rows)
        conn.commit()
    log.info("Upserted %d active players", len(rows))


if __name__ == "__main__":
    main()
