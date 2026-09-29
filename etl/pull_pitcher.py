"""Pull pitcher Statcast for a date range and upsert into Postgres.

Default: Kevin Gausman (592332), full 2025 regular season.
Usage:
    python pull_pitcher.py
    python pull_pitcher.py --pitcher 592332 --start 2025-03-27 --end 2025-09-28
    python pull_pitcher.py --all-pitchers --season 2024 --start 2024-03-28 --end 2024-09-29
    python pull_pitcher.py --all-pitchers --season 2025 --start 2025-03-27 --end 2025-11-01 --include-postseason
    # P12 history: the 2026 roster's 2024 seasons with OTHER clubs (window defaults wide)
    python pull_pitcher.py --all-pitchers --season 2024 --cohort-season 2026
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_players, upsert_statcast_events  # noqa: E402
from pull_statcast import (  # noqa: E402
    cohort_history_ids,
    history_window,
    normalize,
    resolve_player_names,
)

from pybaseball import statcast_pitcher  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_pitcher")

GAUSMAN_MLBAM = 592332
KNOWN_NAMES = {GAUSMAN_MLBAM: "Kevin Gausman"}


def fetch(player_id: int, start: date, end: date) -> pd.DataFrame:
    log.info("Fetching Statcast pitcher=%s start=%s end=%s", player_id, start, end)
    df = statcast_pitcher(start.isoformat(), end.isoformat(), player_id)
    log.info("Raw rows pulled: %d", len(df))
    return df


def upsert_referenced_players(conn, df: pd.DataFrame, primary: tuple[int, str]) -> None:
    pid, pname = primary
    ids: set[int] = set()
    ids.update(int(x) for x in df["batter_id"].dropna().unique())
    ids.update(int(x) for x in df["pitcher_id"].dropna().unique())
    to_lookup = sorted(ids - {pid})
    names = resolve_player_names(to_lookup)
    names[pid] = pname
    rows = [{"mlbam_id": mid, "name": names.get(mid, f"MLBAM-{mid}")} for mid in sorted(ids)]
    n = upsert_players(conn, rows)
    log.info("Upserted %d player rows (referenced by these events)", n)


def run(player_id: int, start: date, end: date, include_postseason: bool = False) -> None:
    raw = fetch(player_id, start, end)
    df = normalize(raw, include_postseason=include_postseason)
    log.info("After filter + cleanup: %d rows (include_postseason=%s)",
             len(df), include_postseason)

    pname = KNOWN_NAMES.get(player_id) or f"MLBAM-{player_id}"

    with connect() as conn:
        upsert_referenced_players(conn, df, (player_id, pname))
        n = upsert_statcast_events(conn, df)
        log.info("Upserted %d statcast_events rows", n)
        conn.commit()
    log.info("Done.")


def pitcher_ids_for_season(conn, season: int) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            "select mlbam_id from web_player_seasons "
            "where season = %s and appeared_as_pitcher = true "
            "order by mlbam_id",
            (season,),
        )
        return [row[0] for row in cur.fetchall()]


def run_all(season: int, start: date, end: date, include_postseason: bool = False,
            cohort_season: int | None = None) -> None:
    with connect() as conn:
        if cohort_season is None:
            ids = pitcher_ids_for_season(conn, season)
        else:
            ids = cohort_history_ids(conn, cohort_season, season, "pitcher")
    if cohort_season is None:
        log.info("--all-pitchers: %d pitchers appeared for the Jays in %s", len(ids), season)
    else:
        log.info("--all-pitchers --cohort-season %s: %d pitchers with other-club %s seasons",
                 cohort_season, len(ids), season)
    for i, pid in enumerate(ids, 1):
        log.info("[%d/%d] Pulling pitcher %s", i, len(ids), pid)
        try:
            run(pid, start, end, include_postseason=include_postseason)
        except Exception as exc:  # noqa: BLE001 -- keep loop running
            log.exception("Failed to pull pitcher %s: %s -- continuing", pid, exc)


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pitcher", type=int, default=GAUSMAN_MLBAM,
                    help=f"MLBAM player ID (default {GAUSMAN_MLBAM} = Kevin Gausman). Ignored when --all-pitchers is set.")
    ap.add_argument("--start", type=parse_date, default=None,
                    help="Season start YYYY-MM-DD (default 2025-03-27; Mar 1 of --season with --cohort-season)")
    ap.add_argument("--end", type=parse_date, default=None,
                    help="Season end YYYY-MM-DD (default 2025-09-28; Oct 5 of --season with --cohort-season)")
    ap.add_argument("--all-pitchers", action="store_true",
                    help="Loop over every pitcher in web_player_seasons for --season")
    ap.add_argument("--cohort-season", type=int, default=None,
                    help="With --all-pitchers: instead pull this roster's players' OTHER-club --season (P12 history)")
    ap.add_argument("--season", type=int, default=None,
                    help="Required with --all-pitchers; the season to enumerate")
    ap.add_argument("--include-postseason", action="store_true",
                    help="Keep playoff game_types (F/D/L/W) in addition to regular season")
    args = ap.parse_args(argv)

    if args.cohort_season is not None and args.season is not None:
        wide = history_window(args.season)
        args.start, args.end = args.start or wide[0], args.end or wide[1]
    args.start = args.start or date(2025, 3, 27)
    args.end = args.end or date(2025, 9, 28)

    if args.all_pitchers:
        if args.season is None:
            ap.error("--all-pitchers requires --season")
        run_all(args.season, args.start, args.end,
                include_postseason=args.include_postseason,
                cohort_season=args.cohort_season)
    else:
        run(args.pitcher, args.start, args.end,
            include_postseason=args.include_postseason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
