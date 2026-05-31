"""MLB Stats API helpers: roster fetch + people detail fetch.

Extracted from etl/roster.py so multiple ETL scripts (roster.py,
pull_team_players.py, future BaZi loader) can share one code path.
"""

from __future__ import annotations

from typing import Iterable

import requests


BLUE_JAYS_TEAM_ID = 141
BASE_URL = "https://statsapi.mlb.com/api/v1"
ROSTER_URL = f"{BASE_URL}/teams/{BLUE_JAYS_TEAM_ID}/roster"
PEOPLE_URL = f"{BASE_URL}/people"
HEADSHOT_URL = "https://midfield.mlbstatic.com/v1/people/{id}/spots/120"

# /people endpoint hard-caps at ~640 IDs per request in practice; keep batches
# well under that. 100 is comfortable and still ~few requests for a full season.
PEOPLE_BATCH_SIZE = 100


def fetch_active_roster(team_id: int = BLUE_JAYS_TEAM_ID) -> list[dict]:
    """Current 26-man (rosterType=active). One record per player."""
    r = requests.get(
        f"{BASE_URL}/teams/{team_id}/roster",
        params={"rosterType": "active"},
        timeout=30,
    )
    r.raise_for_status()
    return [
        {
            "mlbam_id": p["person"]["id"],
            "name": p["person"]["fullName"],
            "position": p["position"]["abbreviation"],
        }
        for p in r.json()["roster"]
    ]


def fetch_full_season_roster(
    team_id: int, season: int
) -> list[dict]:
    """Every player who was on the 40-man at any point in `season`.

    One record per player: {mlbam_id, name, position, position_code}.
    `position_code` follows MLB convention: '1' = pitcher, '2' = catcher,
    '3'-'9' = infield/outfield, 'Y' = two-way (Ohtani-style).

    Used by pull_team_players.py to enumerate Jays for 2024-2026 without
    hitting FanGraphs (which has been 403-ing pybaseball's scraper).
    NOTE: rosterType=fullSeason includes 40-man members who never actually
    debuted; downstream Statcast pulls will simply return zero rows for them.
    """
    r = requests.get(
        f"{BASE_URL}/teams/{team_id}/roster",
        params={"rosterType": "fullSeason", "season": season},
        timeout=30,
    )
    r.raise_for_status()
    return [
        {
            "mlbam_id": p["person"]["id"],
            "name": p["person"]["fullName"],
            "position": p["position"]["abbreviation"],
            "position_code": p["position"]["code"],
        }
        for p in r.json()["roster"]
    ]


def fetch_people_details(ids: Iterable[int]) -> dict[int, dict]:
    """Bio details keyed by MLBAM id.

    Returned per-player dict shape:
        bats              : 'L' | 'R' | 'S' | None
        throws            : 'L' | 'R' | None
        birthdate         : 'YYYY-MM-DD' | None
        birth_city        : str | None
        birth_state_province : str | None  (US states + Canadian provinces)
        birth_country     : str | None
        primary_position  : str | None  (abbreviation: 'SS', 'RF', 'P', ...)
        headshot_url      : str        (always available; URL pattern is stable)
    """
    ids = [int(x) for x in ids]
    out: dict[int, dict] = {}
    for i in range(0, len(ids), PEOPLE_BATCH_SIZE):
        chunk = ids[i : i + PEOPLE_BATCH_SIZE]
        r = requests.get(
            PEOPLE_URL,
            params={"personIds": ",".join(map(str, chunk))},
            timeout=30,
        )
        r.raise_for_status()
        for person in r.json().get("people", []):
            pid = person["id"]
            out[pid] = {
                "bats": person.get("batSide", {}).get("code"),
                "throws": person.get("pitchHand", {}).get("code"),
                "birthdate": person.get("birthDate"),
                "birth_city": person.get("birthCity"),
                "birth_state_province": person.get("birthStateProvince"),
                "birth_country": person.get("birthCountry"),
                "primary_position": person.get("primaryPosition", {}).get("abbreviation"),
                "headshot_url": HEADSHOT_URL.format(id=pid),
            }
    return out
