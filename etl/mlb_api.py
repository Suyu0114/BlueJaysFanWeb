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
SCHEDULE_URL = f"{BASE_URL}/schedule"
BOXSCORE_URL = f"{BASE_URL}/game/{{game_pk}}/boxscore"
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


# ---------------------------------------------------------------------------
# P7: schedule + box score
# ---------------------------------------------------------------------------


def fetch_schedule(season: int, team_id: int = BLUE_JAYS_TEAM_ID) -> list[dict]:
    """Full-season schedule for `team_id`. One dict per game, INCLUDING unplayed
    games (so the calendar can be fully populated).

    Per-game dict is raw-ish; pull_schedule.py derives is_home / opponent /
    result / is_final from these:
        game_pk, season, official_date ('YYYY-MM-DD'),
        game_datetime_utc (ISO 'Z'), game_number, doubleheader ('N'|'Y'|'S'),
        game_type ('R'|'S'|'F'|'D'|'L'|'W'|'A'|'E'|...),
        home / away: {id, name, score (int | None until played)},
        detailed_state, abstract_state, venue (str | None)

    Doubleheaders => two entries (distinct game_pk, same official_date). The
    schedule endpoint returns spring training / all-star games too; the caller
    filters by game_type.
    """
    r = requests.get(
        SCHEDULE_URL,
        params={"sportId": 1, "teamId": team_id, "season": season},
        timeout=30,
    )
    r.raise_for_status()
    out: list[dict] = []
    for d in r.json().get("dates", []):
        for g in d.get("games", []):
            teams = g.get("teams", {})
            home = teams.get("home", {})
            away = teams.get("away", {})
            status = g.get("status", {})
            out.append(
                {
                    "game_pk": g["gamePk"],
                    "season": int(g.get("season", season)),
                    "official_date": g.get("officialDate"),
                    "game_datetime_utc": g.get("gameDate"),
                    "game_number": g.get("gameNumber", 1),
                    "doubleheader": g.get("doubleHeader", "N"),
                    "game_type": g.get("gameType"),
                    "home": {
                        "id": home.get("team", {}).get("id"),
                        "name": home.get("team", {}).get("name"),
                        "score": home.get("score"),
                    },
                    "away": {
                        "id": away.get("team", {}).get("id"),
                        "name": away.get("team", {}).get("name"),
                        "score": away.get("score"),
                    },
                    "detailed_state": status.get("detailedState"),
                    "abstract_state": status.get("abstractGameState"),
                    "venue": g.get("venue", {}).get("name"),
                }
            )
    return out


def _parse_batting(b: dict) -> dict | None:
    """Map a boxscore `stats.batting` block to web_player_game_stats columns.

    Returns None for players who did not appear (empty block / gamesPlayed 0).
    """
    if not b or b.get("gamesPlayed", 0) < 1:
        return None
    return {
        "pa": b.get("plateAppearances"),
        "ab": b.get("atBats"),
        "r": b.get("runs"),
        "h": b.get("hits"),
        "doubles": b.get("doubles"),
        "triples": b.get("triples"),
        "hr": b.get("homeRuns"),
        "rbi": b.get("rbi"),
        "bb": b.get("baseOnBalls"),
        "so": b.get("strikeOuts"),
        "sb": b.get("stolenBases"),
        "hbp": b.get("hitByPitch"),
    }


def _pitch_decision(p: dict) -> str | None:
    """Single-char decision from the per-game count fields (note string is
    cosmetic). W/L take precedence over S/H; blown saves are not tracked."""
    if p.get("wins"):
        return "W"
    if p.get("losses"):
        return "L"
    if p.get("saves"):
        return "S"
    if p.get("holds"):
        return "H"
    return None


def _parse_pitching(p: dict) -> dict | None:
    """Map a boxscore `stats.pitching` block to web_player_game_stats columns.

    Stores OUTS (int), never the "5.2" innings-pitched string. Returns None for
    players who did not pitch.
    """
    if not p or p.get("gamesPlayed", 0) < 1:
        return None
    return {
        "outs_recorded": p.get("outs"),
        "bf": p.get("battersFaced"),
        "p_h": p.get("hits"),
        "p_r": p.get("runs"),
        "er": p.get("earnedRuns"),
        "p_bb": p.get("baseOnBalls"),
        "p_so": p.get("strikeOuts"),
        "p_hr": p.get("homeRuns"),
        "pitches": p.get("numberOfPitches", p.get("pitchesThrown")),
        "strikes": p.get("strikes"),
        "decision": _pitch_decision(p),
    }


def fetch_boxscore(game_pk: int, team_id: int = BLUE_JAYS_TEAM_ID) -> dict:
    """Box-score lines for `team_id`'s players in `game_pk`.

    Returns:
        {
          "game_pk": int,
          "team_id": int,
          "players": [
            {"mlbam_id", "name",
             "batting": {<cols> } | None,
             "pitching": {<cols> } | None},
            ...
          ],
        }

    Only players who actually appeared (gamesPlayed >= 1 in a block) are
    returned; a two-way player carries both blocks. The boxscore endpoint has no
    game status, so the caller (pull_boxscore.py) must enforce the final-game
    guard via web_games before persisting.
    """
    r = requests.get(BOXSCORE_URL.format(game_pk=game_pk), timeout=30)
    r.raise_for_status()
    teams = r.json().get("teams", {})

    side = None
    for s, t in teams.items():
        if t.get("team", {}).get("id") == team_id:
            side = s
            break
    if side is None:
        return {"game_pk": game_pk, "team_id": team_id, "players": []}

    players_out: list[dict] = []
    for pdata in teams[side].get("players", {}).values():
        person = pdata.get("person", {})
        stats = pdata.get("stats", {})
        batting = _parse_batting(stats.get("batting", {}))
        pitching = _parse_pitching(stats.get("pitching", {}))
        if batting is None and pitching is None:
            continue
        players_out.append(
            {
                "mlbam_id": person.get("id"),
                "name": person.get("fullName"),
                "batting": batting,
                "pitching": pitching,
            }
        )
    return {"game_pk": game_pk, "team_id": team_id, "players": players_out}
