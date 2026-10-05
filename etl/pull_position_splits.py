"""Load every Blue Jay's batting line split by position for a season from the
MLB Stats API and replace that season of web_player_position_splits.

Usage:
    python etl/pull_position_splits.py --season 2026
    python etl/pull_position_splits.py --season 2024 --season 2025 --season 2026

Source: `/api/v1/stats?stats=statSplits&group=hitting&teamId=141&sitCodes=...`
(one call per season, free, no key). Jays-scoped: a traded player's rows cover
only his Toronto games.

Why: web_players.position is the CURRENT MLB primary position (one value per
player), so it mislabels past seasons -- Bichette 2025 read 3B once the Mets
moved him there. The season page derives each season's position (most PA, PH
excluded) and the "value by position" chart from this table.

Reconciliation: each player's PA summed over positions must equal his
web_player_season_stats.pa (run pull_season_stats.py first); mismatches are
logged as warnings, never fixed up.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, replace_position_splits  # noqa: E402
from mlb_api import fetch_team_position_splits  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_position_splits")


def run(season: int) -> None:
    rows = fetch_team_position_splits(season)
    log.info("%s: API returned %d (player, position) rows", season, len(rows))

    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select mlbam_id from web_players where mlbam_id = any(%s)",
                ([r["mlbam_id"] for r in rows],),
            )
            known = {r[0] for r in cur.fetchall()}
        unknown = sorted({r["mlbam_id"] for r in rows} - known)
        if unknown:
            log.warning("%s: skipping %d player(s) not in web_players: %s",
                        season, len(unknown), unknown)
        rows = [r for r in rows if r["mlbam_id"] in known]

        n = replace_position_splits(conn, season, rows)

        # Reconcile against the season line (same transaction, so it sees the
        # rows just written).
        split_pa: dict[int, int] = defaultdict(int)
        for r in rows:
            split_pa[r["mlbam_id"]] += r["pa"] or 0
        with conn.cursor() as cur:
            cur.execute(
                "select mlbam_id, pa::int from web_player_season_stats "
                "where season = %s and pa > 0",
                (season,),
            )
            season_pa = dict(cur.fetchall())
        bad = sorted(
            (pid, season_pa.get(pid, 0), split_pa.get(pid, 0))
            for pid in set(season_pa) | set(split_pa)
            if season_pa.get(pid, 0) != split_pa.get(pid, 0)
        )
        conn.commit()

    log.info("%s: wrote %d rows for %d players", season, n, len(split_pa))
    if bad:
        log.warning("%s: %d player(s) whose split PA != season PA "
                    "(mlbam_id, season_pa, split_pa): %s", season, len(bad), bad)
    else:
        log.info("%s: split PA reconciles with web_player_season_stats for every player",
                 season)


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
