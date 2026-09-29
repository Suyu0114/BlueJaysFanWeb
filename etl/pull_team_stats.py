"""Pull every club's regular-season team line and upsert web_team_season_stats
(P13: the /team page's ranks and MLB averages need all 30 clubs).

Usage:
    python etl/pull_team_stats.py                                # current season
    python etl/pull_team_stats.py --season 2022 --season 2023    # repeatable

Source: MLB Stats API, ~91 calls per season:
    /teams/stats?stats=season,seasonAdvanced&group=hitting,pitching   1 call, all clubs
    /teams/{id}/stats?stats=statSplits&sitCodes=sp,rp                  30 calls (rotation / bullpen)
    /stats?stats=season,sabermetrics&teamId={id}&playerPool=ALL        60 calls (wRC+ / WAR)
Writes: web_team_season_stats (30 rows per season, overwritten in place)

Counts are stored raw; every rate / MLB average / rank lives in the 022 views.
Sabermetric aggregates (P13 T6): bat_wrc_plus = PA-weighted mean of the
club's players' wRC+, bat_war / pit_war = sums. After upserting, the Jays
aggregate is cross-checked against web_player_season_stats (which takes each
player from /people and so is immune to the leaderboard's post-season lag);
a gap is logged as a warning, not an error.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_team_season_stats  # noqa: E402
from mlb_api import (  # noqa: E402
    BLUE_JAYS_TEAM_ID,
    fetch_all_team_stats,
    fetch_team_player_leaderboard,
    fetch_team_role_splits,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_team_stats")

EXPECTED_TEAMS = 30
PAUSE_S = 0.2  # between per-club calls -- be polite to a free API

# Staleness-check tolerances (P13 spec §2 Verify).
WRC_PLUS_TOL = 1.0
WAR_TOL = 1.0

# API key -> column. Traditional line (stats=season).
BAT_SEASON = {
    "games": "gamesPlayed",
    "bat_pa": "plateAppearances", "bat_ab": "atBats", "bat_h": "hits",
    "bat_2b": "doubles", "bat_3b": "triples", "bat_hr": "homeRuns",
    "bat_bb": "baseOnBalls", "bat_ibb": "intentionalWalks",
    "bat_hbp": "hitByPitch", "bat_so": "strikeOuts", "bat_sf": "sacFlies",
    "bat_sb": "stolenBases", "bat_cs": "caughtStealing", "bat_r": "runs",
    "bat_gidp": "groundIntoDoublePlay",
}
PIT_SEASON = {
    "pit_outs": "outs", "pit_bf": "battersFaced", "pit_ab": "atBats",
    "pit_h": "hits", "pit_r": "runs", "pit_er": "earnedRuns",
    "pit_hr": "homeRuns", "pit_bb": "baseOnBalls",
    "pit_ibb": "intentionalWalks", "pit_hbp": "hitBatsmen",
    "pit_so": "strikeOuts", "pit_sf": "sacFlies", "pit_sv": "saves",
    "pit_bs": "blownSaves", "pit_hld": "holds",
}
# stats=seasonAdvanced, same keys for both sides (prefix added below).
ADVANCED = {
    "pitches": "numberOfPitches", "swings": "totalSwings",
    "whiffs": "swingAndMisses",
}
# MLB's own batted-ball classification: outs + hits per trajectory. The four
# sum to seasonAdvanced.ballsInPlay (= Savant's BBE; checked 2022).
BATTED_BALL = {
    "gb": ("groundOuts", "groundHits"), "fb": ("flyOuts", "flyHits"),
    "ld": ("lineOuts", "lineHits"), "pu": ("popOuts", "popHits"),
}
ROLE = {
    "outs": "outs", "bf": "battersFaced", "h": "hits", "er": "earnedRuns",
    "hr": "homeRuns", "bb": "baseOnBalls", "hbp": "hitBatsmen",
    "so": "strikeOuts",
}


def _i(v) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _f(v) -> float | None:
    """Rates arrive as strings ('117.9', '-.--'); undefined -> None."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _advanced(stat: dict, prefix: str) -> dict:
    row = {f"{prefix}_{col}": _i(stat.get(key)) for col, key in ADVANCED.items()}
    for col, (outs, hits) in BATTED_BALL.items():
        a, b = _i(stat.get(outs)), _i(stat.get(hits))
        row[f"{prefix}_{col}"] = None if a is None or b is None else a + b
    return row


def _aggregate_hitting(players: list[dict]) -> dict:
    """bat_wrc_plus = PA-weighted wRC+ (players with no wRC+ or 0 PA skipped);
    bat_war = sum of WAR."""
    num = den = 0.0
    war = 0.0
    for p in players:
        s = p["stat"]
        pa, wrc = _i(s.get("plateAppearances")), _f(s.get("wRcPlus"))
        if pa and wrc is not None:
            num += pa * wrc
            den += pa
        war += _f(s.get("war")) or 0.0
    return {
        "bat_wrc_plus": round(num / den, 3) if den else None,
        "bat_war": round(war, 3),
    }


def _aggregate_pitching(players: list[dict]) -> dict:
    return {"pit_war": round(sum(_f(p["stat"].get("war")) or 0.0 for p in players), 3)}


def build_rows(season: int) -> list[dict]:
    teams = fetch_all_team_stats(season)
    if len(teams) != EXPECTED_TEAMS:
        log.warning("Expected %d clubs for %s, got %d", EXPECTED_TEAMS, season, len(teams))

    rows = []
    for team_id in sorted(teams):
        t = teams[team_id]
        hit = t.get("hitting", {})
        pit = t.get("pitching", {})
        row: dict = {"season": season, "team_id": team_id}
        row |= {col: _i(hit.get("season", {}).get(k)) for col, k in BAT_SEASON.items()}
        row |= {col: _i(pit.get("season", {}).get(k)) for col, k in PIT_SEASON.items()}
        row |= _advanced(hit.get("seasonAdvanced", {}), "bat")
        row |= _advanced(pit.get("seasonAdvanced", {}), "pit")
        row["pit_qs"] = _i(pit.get("seasonAdvanced", {}).get("qualityStarts"))

        roles = fetch_team_role_splits(season, team_id)
        time.sleep(PAUSE_S)
        for code in ("sp", "rp"):
            stat = roles.get(code, {})
            row |= {f"{code}_{col}": _i(stat.get(k)) for col, k in ROLE.items()}
        row["sp_gs"] = _i(roles.get("sp", {}).get("gamesStarted"))
        if row["sp_outs"] is not None and row["rp_outs"] is not None and row["pit_outs"] is not None:
            if row["sp_outs"] + row["rp_outs"] != row["pit_outs"]:
                log.warning(
                    "%s team %s: sp_outs %s + rp_outs %s != pit_outs %s",
                    season, team_id, row["sp_outs"], row["rp_outs"], row["pit_outs"],
                )
        else:
            log.warning("%s team %s: missing starter/reliever split", season, team_id)

        row |= _aggregate_hitting(fetch_team_player_leaderboard(season, "hitting", team_id))
        time.sleep(PAUSE_S)
        row |= _aggregate_pitching(fetch_team_player_leaderboard(season, "pitching", team_id))
        time.sleep(PAUSE_S)
        rows.append(row)
    return rows


def check_jays(conn, season: int, row: dict) -> None:
    """Compare the leaderboard aggregate with web_player_season_stats (P13 §2)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            select sum(pa * wrc_plus) filter (where pa > 0 and wrc_plus is not null)
                     / nullif(sum(pa) filter (where pa > 0 and wrc_plus is not null), 0),
                   sum(war)
            from web_player_season_stats
            where season = %s
            """,
            (season,),
        )
        ref_wrc, ref_war = cur.fetchone()
    if ref_wrc is None:
        log.info("%s: no web_player_season_stats rows -- Jays check skipped", season)
        return
    wrc, war = row["bat_wrc_plus"], (row["bat_war"] or 0) + (row["pit_war"] or 0)
    ok_wrc = wrc is not None and abs(float(ref_wrc) - wrc) <= WRC_PLUS_TOL
    ok_war = ref_war is not None and abs(float(ref_war) - war) <= WAR_TOL
    level = logging.INFO if ok_wrc and ok_war else logging.WARNING
    log.log(
        level,
        "%s Jays check: wRC+ %.1f vs %.1f (player table), WAR %.1f vs %.1f -> %s",
        season, wrc or float("nan"), float(ref_wrc), war, float(ref_war or 0),
        "ok" if ok_wrc and ok_war else "OUT OF TOLERANCE (leaderboard lag? re-run later)",
    )


def run(season: int) -> None:
    rows = build_rows(season)
    if not rows:
        log.warning("No team rows returned for %s", season)
        return
    with connect() as conn:
        upsert_team_season_stats(conn, rows)
        conn.commit()
        jays = next((r for r in rows if r["team_id"] == BLUE_JAYS_TEAM_ID), None)
        if jays:
            check_jays(conn, season, jays)
    log.info("Upserted %d web_team_season_stats rows for %s", len(rows), season)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--season", type=int, action="append",
        help="MLB season year (repeatable); default = current year",
    )
    args = ap.parse_args(argv)
    for season in args.season or [date.today().year]:
        run(season)
    return 0


if __name__ == "__main__":
    sys.exit(main())
