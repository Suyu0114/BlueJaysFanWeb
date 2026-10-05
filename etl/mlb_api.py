"""MLB Stats API helpers: roster fetch + people detail fetch.

Extracted from etl/roster.py so multiple ETL scripts (roster.py,
pull_team_players.py, future BaZi loader) can share one code path.
"""

from __future__ import annotations

import time
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

    The team leaderboard is used to ENUMERATE players; each player's numbers
    are then taken from his own /people/{id}/stats split for this team. The
    leaderboard's sabermetrics block can lag: on 2026-09-29 its FIP / WAR for
    several Jays were computed from stale counting stats (implied FIP constant
    3.11-3.43 across pitchers vs a uniform 3.101 on /people and on the
    league-wide leaderboard). For settled seasons all three sources agree.
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

    # Prefer the per-player split for this team (see docstring: the
    # leaderboard's sabermetrics can be stale). This also covers the case of
    # the leaderboard dropping one stat type for a player traded AWAY
    # mid-season (2024: Jansen + Kikuchi lost their traditional line). The
    # leaderboard values stay as the fallback if the split is missing.
    for pid, rec in by_id.items():
        rec["stat"].update(
            _fetch_player_team_split(pid, season, group, types, team_id)
        )
    return list(by_id.values())


def _fetch_player_team_split(
    mlbam_id: int, season: int, group: str, types: set[str], team_id: int
) -> dict:
    splits = fetch_player_season_splits(mlbam_id, season, groups=(group,), types=types)
    return splits.get(team_id, {}).get(group, {})


# MLB situation codes for "batting while playing position X" -> our label.
# p1 = a position player batting while he was the pitcher (mop-up duty).
POSITION_SIT_CODES = {
    "p1": "P", "p2": "C", "p3": "1B", "p4": "2B", "p5": "3B", "p6": "SS",
    "p7": "LF", "p8": "CF", "p9": "RF", "pD": "DH", "pH": "PH",
}

# API stat key -> web_player_position_splits column.
_POSITION_SPLIT_STATS = {
    "gamesPlayed": "g", "plateAppearances": "pa", "atBats": "ab", "hits": "h",
    "doubles": "doubles", "triples": "triples", "homeRuns": "hr", "rbi": "rbi",
    "baseOnBalls": "bb", "strikeOuts": "so", "hitByPitch": "hbp",
    "sacFlies": "sf", "totalBases": "tb",
}


def fetch_team_position_splits(
    season: int, team_id: int = BLUE_JAYS_TEAM_ID
) -> list[dict]:
    """Regular-season batting line per (player, position) for `team_id`.

    One call per season: the team-scoped statSplits leaderboard with one
    situation code per position. A traded player's rows cover only his games
    for `team_id`, and each player's PA summed over positions equals his
    season PA (verified 2024-2026). Counts only -- no rates, no WAR.

    One record per (player, position): {mlbam_id, season, position, <counts>}.
    """
    data = _get_json(
        STATS_URL,
        {
            "stats": "statSplits",
            "group": "hitting",
            "season": season,
            "teamId": team_id,
            "sportId": 1,
            "gameType": "R",
            "sitCodes": ",".join(POSITION_SIT_CODES),
            "playerPool": "ALL",
            "limit": 2000,
        },
    )
    rows: list[dict] = []
    for block in data.get("stats", []):
        for s in block.get("splits", []):
            position = POSITION_SIT_CODES.get(s.get("split", {}).get("code"))
            if position is None:
                continue
            stat = s.get("stat", {})
            rows.append(
                {
                    "mlbam_id": s["player"]["id"],
                    "season": season,
                    "position": position,
                    **{col: stat.get(key) for key, col in _POSITION_SPLIT_STATS.items()},
                }
            )
    return rows


# ---------------------------------------------------------------------------
# P12: full-MLB season lines per club (other-club history for the roster)
# ---------------------------------------------------------------------------

SEASON_TOTAL = 0  # team_id used for the all-clubs season total


def fetch_player_season_splits(
    mlbam_id: int,
    season: int,
    groups: Iterable[str] = ("hitting", "pitching"),
    types: Iterable[str] = ("season", "sabermetrics"),
) -> dict[int, dict[str, dict]]:
    """Regular-season line per club for one player, with every club -- not just
    the Jays.

    Returns {team_id: {group: merged stat dict}} where team_id SEASON_TOTAL (0)
    is the all-clubs total. The API sends one split per club plus a team-less
    total only when a player changed clubs; for a one-club season the total is
    the club split, so it is copied to 0 and callers never have to sum.
    {} when the player has no MLB line that season (e.g. NPB, minors only).
    """
    r = requests.get(
        f"{PEOPLE_URL}/{mlbam_id}/stats",
        params={
            "stats": ",".join(sorted(types)),
            "group": ",".join(groups),
            "season": season,
            "gameType": "R",
        },
        timeout=30,
    )
    r.raise_for_status()
    out: dict[int, dict[str, dict]] = {}
    clubs: dict[str, set[int]] = {}
    for block in r.json().get("stats", []):
        group = block.get("group", {}).get("displayName")
        for s in block.get("splits", []):
            # Traded players get one split per team plus a team-less total.
            team_id = s.get("team", {}).get("id", SEASON_TOTAL)
            out.setdefault(team_id, {}).setdefault(group, {}).update(s.get("stat", {}))
            if team_id != SEASON_TOTAL:
                clubs.setdefault(group, set()).add(team_id)
    for group, ids in clubs.items():
        if len(ids) == 1 and group not in out.get(SEASON_TOTAL, {}):
            (only,) = ids
            out.setdefault(SEASON_TOTAL, {})[group] = dict(out[only][group])
    return out


def fetch_player_team_dates(mlbam_id: int, season: int) -> dict[int, dict]:
    """First / last game date and games played per club from the game log.

    Returns {team_id: {"first": 'YYYY-MM-DD', "last": ..., "g": int}}, including
    SEASON_TOTAL. Hitting and pitching logs are merged by gamePk so a two-way
    appearance counts once. Orders a traded player's clubs ("TOR -> HOU").
    """
    r = requests.get(
        f"{PEOPLE_URL}/{mlbam_id}/stats",
        params={
            "stats": "gameLog",
            "group": "hitting,pitching",
            "season": season,
            "gameType": "R",
        },
        timeout=30,
    )
    r.raise_for_status()
    games: dict[int, dict[int, str]] = {}  # team_id -> {gamePk: date}
    for block in r.json().get("stats", []):
        for s in block.get("splits", []):
            team_id = s.get("team", {}).get("id")
            pk = s.get("game", {}).get("gamePk")
            if team_id is None or pk is None:
                continue
            for key in (team_id, SEASON_TOTAL):
                games.setdefault(key, {})[pk] = s["date"]
    return {
        team_id: {"first": min(d.values()), "last": max(d.values()), "g": len(d)}
        for team_id, d in games.items()
    }


# --- P13: team season stats (all 30 clubs) ---

TEAMS_URL = f"{BASE_URL}/teams"
TEAMS_STATS_URL = f"{BASE_URL}/teams/stats"


def _get_json(url: str, params: dict, tries: int = 3) -> dict:
    """GET with a small retry, for the P13 fetchers (~90 calls per season).

    The stats endpoints occasionally time out, 5xx, or answer 200 with a body
    like {"messageNumber": 13, "message": "Operation taking longer than
    expected - please try again"} -- all retried with backoff. The older
    helpers above keep their single call.
    """
    last: Exception | None = None
    for attempt in range(tries):
        try:
            r = requests.get(url, params=params, timeout=60)
            r.raise_for_status()
            data = r.json()
            if "messageNumber" in data:
                raise RuntimeError(data.get("message"))
            return data
        except (requests.RequestException, RuntimeError, ValueError) as exc:
            last = exc
            if attempt < tries - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"{url} {params} failed after {tries} tries: {last}")


def fetch_teams(season: int) -> list[dict]:
    """The MLB clubs of `season`: {id, abbreviation, team_name, name}.

    `team_name` is the short name ('Blue Jays', 'Athletics') -- the key Savant's
    team leaderboards can be joined on (their abbreviations are retroactive).
    """
    data = _get_json(TEAMS_URL, {"sportId": 1, "season": season})
    return [
        {
            "id": t["id"],
            "abbreviation": t.get("abbreviation"),
            "team_name": t.get("teamName"),
            "name": t.get("name"),
        }
        for t in data.get("teams", [])
    ]


def fetch_all_team_stats(season: int) -> dict[int, dict]:
    """Regular-season team lines for every club, in ONE call.

    Returns {team_id: {"hitting": {"season": stat, "seasonAdvanced": stat},
                       "pitching": {...}}}. The two stat types are kept apart
    because both carry keys like `groundOuts` with different meanings.
    """
    data = _get_json(
        TEAMS_STATS_URL,
        {
            "season": season,
            "sportIds": 1,
            "group": "hitting,pitching",
            "stats": "season,seasonAdvanced",
            "gameType": "R",
        },
    )
    out: dict[int, dict] = {}
    for block in data.get("stats", []):
        group = block["group"]["displayName"]
        type_ = block["type"]["displayName"]
        for s in block.get("splits", []):
            team = out.setdefault(s["team"]["id"], {})
            team.setdefault(group, {})[type_] = s.get("stat", {})
    return out


def fetch_team_role_splits(season: int, team_id: int) -> dict[str, dict]:
    """Starter / reliever pitching lines for one club: {"sp": stat, "rp": stat}.

    Per club on purpose: the all-teams variant (/teams/stats?stats=statSplits)
    returned only 50 of 60 splits on 2026-09-29.
    """
    data = _get_json(
        f"{TEAMS_URL}/{team_id}/stats",
        {
            "stats": "statSplits",
            "sitCodes": "sp,rp",
            "group": "pitching",
            "season": season,
            "gameType": "R",
        },
    )
    out: dict[str, dict] = {}
    for block in data.get("stats", []):
        for s in block.get("splits", []):
            code = s.get("split", {}).get("code")
            if code in ("sp", "rp"):
                out[code] = s.get("stat", {})
    return out


def fetch_team_player_leaderboard(
    season: int, group: str, team_id: int
) -> list[dict]:
    """Every player's `season` + `sabermetrics` line for one club, as the plain
    team leaderboard returns it: [{mlbam_id, stat}].

    Unlike fetch_team_season_stats this does NOT re-fetch each player from
    /people (that would be ~1,200 calls per season for 30 clubs). Used only for
    team aggregates (P13 T6), which tolerate the leaderboard's small post-season
    lag; pull_team_stats.py checks the Jays aggregate against
    web_player_season_stats.
    """
    data = _get_json(
        STATS_URL,
        {
            "stats": "season,sabermetrics",
            "group": group,
            "season": season,
            "teamId": team_id,
            "sportId": 1,
            "gameType": "R",
            "playerPool": "ALL",
            "limit": 500,
        },
    )
    by_id: dict[int, dict] = {}
    for block in data.get("stats", []):
        for s in block.get("splits", []):
            pid = s["player"]["id"]
            by_id.setdefault(pid, {"mlbam_id": pid, "stat": {}})["stat"].update(
                s.get("stat", {})
            )
    return list(by_id.values())


# --- Post-P13: batting by position, all 30 clubs ---

# Codes every club has a row for (p1 = a position player pitching: ~20 clubs).
_EVERY_CLUB_POSITION_CODES = [c for c in POSITION_SIT_CODES if c != "p1"]


def fetch_league_position_splits(season: int, expected_teams: int = 30) -> list[dict]:
    """Regular-season batting line per (club, position) for every club, in ONE
    call: the team statSplits leaderboard with one situation code per position
    (the same codes and stat mapping as fetch_team_position_splits).

    `limit` is required: the default page is 50 rows, which silently dropped
    clubs (2025: 29 clubs on 4 codes, no error). Raises if any code other than
    p1 comes back with fewer than `expected_teams` clubs.

    One record per (club, position): {season, team_id, position, <counts>}.
    """
    data = _get_json(
        TEAMS_STATS_URL,
        {
            "stats": "statSplits",
            "group": "hitting",
            "season": season,
            "sportIds": 1,
            "gameType": "R",
            "sitCodes": ",".join(POSITION_SIT_CODES),
            "limit": 1000,
        },
    )
    rows: list[dict] = []
    clubs_by_code: dict[str, set[int]] = {}
    for block in data.get("stats", []):
        for s in block.get("splits", []):
            code = s.get("split", {}).get("code")
            position = POSITION_SIT_CODES.get(code)
            if position is None:
                continue
            team_id = s["team"]["id"]
            clubs_by_code.setdefault(code, set()).add(team_id)
            stat = s.get("stat", {})
            rows.append(
                {
                    "season": season,
                    "team_id": team_id,
                    "position": position,
                    **{col: stat.get(key) for key, col in _POSITION_SPLIT_STATS.items()},
                }
            )
    short = {
        code: len(clubs_by_code.get(code, ()))
        for code in _EVERY_CLUB_POSITION_CODES
        if len(clubs_by_code.get(code, ())) < expected_teams
    }
    if short:
        raise RuntimeError(
            f"{season}: position splits short of {expected_teams} clubs "
            f"(code -> clubs): {short}"
        )
    return rows
