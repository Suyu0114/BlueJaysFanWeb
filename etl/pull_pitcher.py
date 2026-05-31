"""Pull pitcher Statcast for a date range and upsert into Postgres.

Default: Kevin Gausman (592332), full 2025 regular season.
Usage:
    python pull_pitcher.py
    python pull_pitcher.py --pitcher 592332 --start 2025-03-27 --end 2025-09-28
    python pull_pitcher.py --all-pitchers --season 2024 --start 2024-03-28 --end 2024-09-29
    python pull_pitcher.py --all-pitchers --season 2025 --start 2025-03-27 --end 2025-11-01 --include-postseason
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
from pull_statcast import normalize, resolve_player_names  # noqa: E402

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


def run_all(season: int, start: date, end: date, include_postseason: bool = False) -> None:
    with connect() as conn:
        ids = pitcher_ids_for_season(conn, season)
    log.info("--all-pitchers: %d pitchers appeared for the Jays in %s", len(ids), season)
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
    ap.add_argument("--start", type=parse_date, default=date(2025, 3, 27),
                    help="Season start YYYY-MM-DD (default 2025-03-27)")
    ap.add_argument("--end", type=parse_date, default=date(2025, 9, 28),
                    help="Season end YYYY-MM-DD (default 2025-09-28)")
    ap.add_argument("--all-pitchers", action="store_true",
                    help="Loop over every pitcher in web_player_seasons for --season")
    ap.add_argument("--season", type=int, default=None,
                    help="Required with --all-pitchers; the season to enumerate")
    ap.add_argument("--include-postseason", action="store_true",
                    help="Keep playoff game_types (F/D/L/W) in addition to regular season")
    args = ap.parse_args(argv)

    if args.all_pitchers:
        if args.season is None:
            ap.error("--all-pitchers requires --season")
        run_all(args.season, args.start, args.end,
                include_postseason=args.include_postseason)
    else:
        run(args.pitcher, args.start, args.end,
            include_postseason=args.include_postseason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
