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
STATS_URL = f"{BASE_URL}/stats"
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


# --- P11: standings ---

STANDINGS_URL = f"{BASE_URL}/standings"

AMERICAN_LEAGUE_ID = 103
NATIONAL_LEAGUE_ID = 104

# MLB division ids. The NL pair is REVERSED relative to the AL pattern
# (203 = NL West, 204 = NL East) -- verified against the live feed, do not
# "correct" this from memory.
AL_EAST_DIVISION_ID = 201


def _split(records: dict, group: str, type_: str) -> dict:
    """Pull one {wins, losses} block out of records.<group>[] by its `type`.

    Returns {} when absent (a team with no games played has no splits yet), so
    callers can .get() their way to None rather than KeyError.
    """
    for entry in records.get(group, []) or []:
        if entry.get("type") == type_:
            return entry
    return {}


def _int(value) -> int | None:
    """MLB sends ranks as strings ('1', '4'). '-'/'E'/None are not ranks."""
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def fetch_standings(season: int, league_ids: str = "103,104") -> list[dict]:
    """One flat web_standings row per team (30 across both leagues).

    NOTE: `hydrate=team` is REQUIRED -- without it `team` carries only the short
    name ('Rays', not 'Tampa Bay Rays') and no abbreviation / division name.

    Sentinel-bearing fields (gamesBack, wildCardGamesBack, eliminationNumber,
    wildCardEliminationNumber, magicNumber) are passed through UNTOUCHED as the
    strings MLB sends: '-' means "is the reference", '+9.5' means "ahead of the
    wild card cut line", 'E' means eliminated. Parsing them into signed numbers
    invents a sign convention that will eventually be read backwards; ordering
    always uses the *_rank columns instead. See db/migrations/012_standings.sql.
    """
    r = requests.get(
        STANDINGS_URL,
        params={
            "leagueId": league_ids,
            "season": season,
            "standingsTypes": "regularSeason",
            "hydrate": "team",
        },
        timeout=30,
    )
    r.raise_for_status()

    rows: list[dict] = []
    for record in r.json().get("records", []):
        for t in record.get("teamRecords", []):
            team = t.get("team", {})
            rec = t.get("records", {})
            l10 = _split(rec, "splitRecords", "lastTen")
            home = _split(rec, "splitRecords", "home")
            away = _split(rec, "splitRecords", "away")
            xwl = _split(rec, "expectedRecords", "xWinLoss")
            streak = t.get("streak", {})
            pct = t.get("winningPercentage")

            rows.append(
                {
                    "season": season,
                    "team_id": team["id"],
                    "team_name": team["name"],
                    "team_abbrev": team.get("abbreviation"),
                    "league_id": team.get("league", {}).get("id"),
                    "division_id": team.get("division", {}).get("id"),
                    "division_name": team.get("division", {}).get("name"),
                    "games_played": t.get("gamesPlayed"),
                    "w": t.get("wins"),
                    "l": t.get("losses"),
                    "pct": float(pct) if pct is not None else None,
                    "division_rank": _int(t.get("divisionRank")),
                    "league_rank": _int(t.get("leagueRank")),
                    # ABSENT (not null) for division leaders -- .get() is load-bearing.
                    "wild_card_rank": _int(t.get("wildCardRank")),
                    "games_back": t.get("gamesBack"),
                    "wc_games_back": t.get("wildCardGamesBack"),
                    "streak_code": streak.get("streakCode"),
                    "l10_w": l10.get("wins"),
                    "l10_l": l10.get("losses"),
                    "home_w": home.get("wins"),
                    "home_l": home.get("losses"),
                    "away_w": away.get("wins"),
                    "away_l": away.get("losses"),
                    "x_w": xwl.get("wins"),
                    "x_l": xwl.get("losses"),
                    "runs_scored": t.get("runsScored"),
                    "runs_allowed": t.get("runsAllowed"),
                    "run_diff": t.get("runDifferential"),
                    "division_leader": bool(t.get("divisionLeader", False)),
                    "division_champ": bool(t.get("divisionChamp", False)),
                    "wild_card_leader": t.get("wildCardLeader"),
                    "clinched": bool(t.get("clinched", False)),
                    "has_wildcard": t.get("hasWildcard"),
                    "elimination_number": t.get("eliminationNumber"),
                    "wc_elimination_number": t.get("wildCardEliminationNumber"),
                    "magic_number": t.get("magicNumber"),
                    "last_updated": t.get("lastUpdated"),
                }
            )
    return rows


# ---------------------------------------------------------------------------
# Season stats (replaces the manual FanGraphs CSV export)
# ---------------------------------------------------------------------------


def fetch_team_season_stats(
    season: int, group: str, team_id: int = BLUE_JAYS_TEAM_ID
) -> list[dict]:
    """Regular-season line for every player who played for `team_id` in
    `season`. `group` is 'hitting' or 'pitching'.

    Merges two stat types per player: `season` (traditional line) and
    `sabermetrics` (wRC+ / FIP / WAR + run-value components). The sabermetrics
    block is FanGraphs data licensed to MLB -- WAR matches the FanGraphs
    leaderboard to within +-0.05 -- so it is a drop-in for the old CSV export.

    Team-scoped like the old FanGraphs `Team=TOR` export: a traded player's
    row covers only his Blue Jays games. `playerPool=ALL` is load-bearing --
    the default pool is qualified players only.

    One record per player: {mlbam_id, name, position_code, stat}. `stat` is
    the raw merged API dict; rate stats arrive as strings ('.292', '3.59',
    '-.--' when undefined) and `inningsPitched` in baseball notation ('170.1').
    """
    types = {"season", "sabermetrics"}
    r = requests.get(
        STATS_URL,
        params={
            "stats": ",".join(sorted(types)),
            "group": group,
            "season": season,
            "teamId": team_id,
            "sportId": 1,
            "gameType": "R",
            "playerPool": "ALL",
            "limit": 500,
        },
        timeout=30,
    )
    r.raise_for_status()
    by_id: dict[int, dict] = {}
    have: dict[int, set[str]] = {}
    for block in r.json().get("stats", []):
        for s in block.get("splits", []):
            pid = s["player"]["id"]
            rec = by_id.setdefault(
                pid,
                {
                    "mlbam_id": pid,
                    "name": s["player"].get("fullName"),
                    "position_code": s.get("position", {}).get("code"),
                    "stat": {},
                },
            )
            rec["stat"].update(s.get("stat", {}))
            have.setdefault(pid, set()).add(block["type"]["displayName"])

    # The team leaderboard sometimes drops one stat type for a player traded
    # AWAY mid-season (2024: Jansen + Kikuchi kept their sabermetrics line but
    # lost the traditional one). The per-player endpoint still has the split
    # for this team, so patch those few players one request each.
    for pid, rec in by_id.items():
        missing = types - have[pid]
        if missing:
            rec["stat"].update(
                _fetch_player_team_split(pid, season, group, missing, team_id)
            )
    return list(by_id.values())


def _fetch_player_team_split(
    mlbam_id: int, season: int, group: str, types: set[str], team_id: int
) -> dict:
    r = requests.get(
        f"{PEOPLE_URL}/{mlbam_id}/stats",
        params={
            "stats": ",".join(sorted(types)),
            "group": group,
            "season": season,
            "gameType": "R",
        },
        timeout=30,
    )
    r.raise_for_status()
    out: dict = {}
    for block in r.json().get("stats", []):
        for s in block.get("splits", []):
            # Traded players get one split per team plus a team-less total.
            if s.get("team", {}).get("id") == team_id:
                out.update(s.get("stat", {}))
    return out
