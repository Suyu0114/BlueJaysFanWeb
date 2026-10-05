"""Load every club's batting line split by position for a season from the MLB
Stats API and replace that season of web_team_position_splits.

Usage:
    python etl/pull_team_position_splits.py                              # current season
    python etl/pull_team_position_splits.py --season 2022 --season 2023  # repeatable

Source: `/api/v1/teams/stats?stats=statSplits&group=hitting&sitCodes=p1..p9,pD,pH&limit=1000`
(ONE call per season for all 30 clubs, free, no key). The fetcher raises if a
position comes back short of 30 clubs (the default 50-row page did that
silently).

Why: the season page's "each position vs MLB" needs the MLB average at every
position and the Jays' rank among 30 -- both computed in the 025 view
(web_v_team_position) from these counts.

Reconciliation (logged, never fixed up):
  1. each club's PA summed over positions vs web_team_season_stats.bat_pa
     (run pull_team_stats.py first): MLB's by-position splits come up 1-3 PA
     short for 8-9 clubs a season upstream -> INFO; a gap > 3 -> WARNING.
  2. the Jays' rows vs web_player_position_splits summed per position: must be
     equal on every count -> WARNING otherwise (no player rows before 2024).
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import POSITION_SPLIT_COLUMNS, connect, replace_team_position_splits  # noqa: E402
from mlb_api import BLUE_JAYS_TEAM_ID, fetch_league_position_splits  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_team_position_splits")

PA_GAP_TOL = 3  # upstream gap between the position splits and the team line
COUNTS = POSITION_SPLIT_COLUMNS[3:]  # g, pa, ab, ... tb


def run(season: int) -> None:
    rows = fetch_league_position_splits(season)
    clubs = {r["team_id"] for r in rows}
    log.info("%s: API returned %d (club, position) rows for %d clubs",
             season, len(rows), len(clubs))

    with connect() as conn:
        n = replace_team_position_splits(conn, season, rows)

        with conn.cursor() as cur:
            cur.execute(
                "select team_id, bat_pa::int from web_team_season_stats where season = %s",
                (season,),
            )
            team_pa = dict(cur.fetchall())
            # g is per position for a player and per position for a club, but a
            # club's g is not the sum of its players' g -- compare the rest.
            cols = [c for c in COUNTS if c != "g"]
            cur.execute(
                f"select position, {', '.join(f'sum({c})::int' for c in cols)} "
                "from web_player_position_splits where season = %s group by position",
                (season,),
            )
            player_sums = {r[0]: dict(zip(cols, r[1:])) for r in cur.fetchall()}
        conn.commit()

    log.info("%s: wrote %d rows", season, n)

    # 1. Σ PA per club vs the team line.
    split_pa: dict[int, int] = defaultdict(int)
    for r in rows:
        split_pa[r["team_id"]] += r["pa"] or 0
    if not team_pa:
        log.warning("%s: no web_team_season_stats rows -- run pull_team_stats.py "
                    "to reconcile PA", season)
    else:
        gaps = sorted(
            (tid, team_pa.get(tid), split_pa.get(tid, 0))
            for tid in set(team_pa) | set(split_pa)
            if team_pa.get(tid) != split_pa.get(tid, 0)
        )
        small = [g for g in gaps if g[1] is not None and abs(g[1] - g[2]) <= PA_GAP_TOL]
        big = [g for g in gaps if g not in small]
        if small:
            log.info("%s: %d club(s) whose position PA is within %d of bat_pa "
                     "(upstream gap; team_id, bat_pa, split_pa): %s",
                     season, len(small), PA_GAP_TOL, small)
        if big:
            log.warning("%s: %d club(s) whose position PA is off bat_pa by more "
                        "than %d (team_id, bat_pa, split_pa): %s",
                        season, len(big), PA_GAP_TOL, big)
        if not gaps:
            log.info("%s: position PA reconciles with bat_pa for every club", season)

    # 2. Jays rows vs the player splits.
    if not player_sums:
        log.info("%s: no web_player_position_splits rows -- Jays check skipped", season)
        return
    jays = {r["position"]: r for r in rows if r["team_id"] == BLUE_JAYS_TEAM_ID}
    bad = []
    for pos in sorted(set(jays) | set(player_sums)):
        team = jays.get(pos, {})
        players = player_sums.get(pos, {})
        diff = {c: (team.get(c) or 0, players.get(c) or 0)
                for c in cols if (team.get(c) or 0) != (players.get(c) or 0)}
        if diff:
            bad.append((pos, diff))
    if bad:
        log.warning("%s: %d Jays position(s) != web_player_position_splits summed "
                    "(position, {column: (team, players)}): %s", season, len(bad), bad)
    else:
        log.info("%s: Jays rows reconcile with web_player_position_splits (0 mismatches)",
                 season)


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
