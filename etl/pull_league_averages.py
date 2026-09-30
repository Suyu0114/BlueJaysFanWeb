"""League-average batting / pitching per season -> web_league_season (P12 M6,
migration 019).

Usage:
    python etl/pull_league_averages.py --season 2026
    python etl/pull_league_averages.py --season 2024 --season 2025 --season 2026

Source: MLB Stats API /teams/stats (all 30 clubs, regular season; hitting and
pitching groups) plus /teams for each club's league that season. Rates come
from the SUMMED counting stats, never an average of team rates -- P13's checks
rely on the MLB row being built exactly this way.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect  # noqa: E402
from mlb_api import AMERICAN_LEAGUE_ID, BASE_URL, NATIONAL_LEAGUE_ID  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_league_averages")

LEAGUE_CODE = {AMERICAN_LEAGUE_ID: "AL", NATIONAL_LEAGUE_ID: "NL"}
HIT = ("plateAppearances", "atBats", "hits", "baseOnBalls", "hitByPitch", "sacFlies", "totalBases", "strikeOuts")
PIT = ("earnedRuns", "outs")

UPSERT_SQL = """
    insert into web_league_season (season, league, teams, pa, obp, slg, ops, era, k_pct, bb_pct)
    values (%(season)s, %(league)s, %(teams)s, %(pa)s, %(obp)s, %(slg)s, %(ops)s, %(era)s, %(k_pct)s, %(bb_pct)s)
    on conflict (season, league) do update set
      teams = excluded.teams, pa = excluded.pa, obp = excluded.obp, slg = excluded.slg,
      ops = excluded.ops, era = excluded.era, k_pct = excluded.k_pct, bb_pct = excluded.bb_pct,
      updated_at = now()
"""


def team_stats(season: int, group: str) -> dict[int, dict]:
    r = requests.get(
        f"{BASE_URL}/teams/stats",
        params={"season": season, "sportIds": 1, "group": group, "stats": "season", "gameType": "R"},
        timeout=30,
    )
    r.raise_for_status()
    return {s["team"]["id"]: s["stat"] for s in r.json()["stats"][0]["splits"]}


def team_leagues(season: int) -> dict[int, str]:
    r = requests.get(f"{BASE_URL}/teams", params={"sportId": 1, "season": season}, timeout=30)
    r.raise_for_status()
    return {t["id"]: LEAGUE_CODE[t["league"]["id"]] for t in r.json()["teams"] if t.get("league", {}).get("id") in LEAGUE_CODE}


def aggregate(season: int, league: str, team_ids: list[int], hit: dict, pit: dict) -> dict:
    h = {k: sum(int(hit[t].get(k) or 0) for t in team_ids) for k in HIT}
    p = {k: sum(int(pit[t].get(k) or 0) for t in team_ids) for k in PIT}
    obp_den = h["atBats"] + h["baseOnBalls"] + h["hitByPitch"] + h["sacFlies"]
    obp = (h["hits"] + h["baseOnBalls"] + h["hitByPitch"]) / obp_den if obp_den else None
    slg = h["totalBases"] / h["atBats"] if h["atBats"] else None
    return {
        "season": season,
        "league": league,
        "teams": len(team_ids),
        "pa": h["plateAppearances"],
        "obp": obp,
        "slg": slg,
        "ops": obp + slg if obp is not None and slg is not None else None,
        "era": 9 * p["earnedRuns"] / (p["outs"] / 3) if p["outs"] else None,
        "k_pct": h["strikeOuts"] / h["plateAppearances"] if h["plateAppearances"] else None,
        "bb_pct": h["baseOnBalls"] / h["plateAppearances"] if h["plateAppearances"] else None,
    }


def run(season: int) -> None:
    hit, pit, league_of = team_stats(season, "hitting"), team_stats(season, "pitching"), team_leagues(season)
    teams = sorted(set(hit) & set(pit) & set(league_of))
    if len(teams) != 30:
        log.warning("%s: expected 30 clubs, got %d", season, len(teams))
    rows = [aggregate(season, "MLB", teams, hit, pit)] + [
        aggregate(season, code, [t for t in teams if league_of[t] == code], hit, pit) for code in ("AL", "NL")
    ]
    with connect() as conn:
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, rows)
        conn.commit()
    for r in rows:
        log.info("%s %s (%d clubs): OPS %.3f  ERA %.2f  K%% %.1f  BB%% %.1f",
                 season, r["league"], r["teams"], r["ops"], r["era"], 100 * r["k_pct"], 100 * r["bb_pct"])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--season", type=int, action="append", required=True)
    args = ap.parse_args(argv)
    for s in args.season:
        run(s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
