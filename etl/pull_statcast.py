"""Pull batter Statcast for a date range and upsert into Postgres.

Default: Vladimir Guerrero Jr. (665489), full 2025 regular season.
Usage:
    python pull_statcast.py
    python pull_statcast.py --player 665489 --start 2026-03-27 --end 2026-05-26
    python pull_statcast.py --all-batters --season 2024 --start 2024-03-28 --end 2024-09-29
    python pull_statcast.py --all-batters --season 2025 --start 2025-03-27 --end 2025-11-01 --include-postseason
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
# load_dotenv won't overwrite existing env vars; first hit wins.
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_players, upsert_statcast_events  # noqa: E402
from transform import regular_season_only, tag_plate_alignment, to_field_feet  # noqa: E402

from pybaseball import statcast_batter, playerid_reverse_lookup  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_statcast")

VLADDY_MLBAM = 665489
KNOWN_NAMES = {VLADDY_MLBAM: "Vladimir Guerrero Jr."}

COLUMN_RENAMES = {
    "batter": "batter_id",
    "pitcher": "pitcher_id",
    "events": "event",
    "release_spin_rate": "spin_rate",
}


def fetch(player_id: int, start: date, end: date) -> pd.DataFrame:
    log.info("Fetching Statcast player=%s start=%s end=%s", player_id, start, end)
    df = statcast_batter(start.isoformat(), end.isoformat(), player_id)
    log.info("Raw rows pulled: %d", len(df))
    return df


def normalize(df: pd.DataFrame, include_postseason: bool = False) -> pd.DataFrame:
    df = regular_season_only(df, keep_postseason=include_postseason)
    df = to_field_feet(df)
    df = tag_plate_alignment(df)
    df = df.rename(columns=COLUMN_RENAMES)
    # game_date arrives as object/string; coerce to date.
    df["game_date"] = pd.to_datetime(df["game_date"]).dt.date
    # Required-NOT-NULL keys should never be missing for valid Statcast rows,
    # but guard anyway by dropping rows that are missing them.
    required = ["game_pk", "batter_id", "pitcher_id", "at_bat_number", "pitch_number"]
    before = len(df)
    df = df.dropna(subset=required)
    if len(df) != before:
        log.warning("Dropped %d rows missing required key columns", before - len(df))
    # Cast IDs/integers to int (pybaseball returns float when NaNs are present).
    for col in ("game_pk", "batter_id", "pitcher_id", "at_bat_number", "pitch_number", "zone"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
    return df


def resolve_player_names(mlbam_ids: list[int]) -> dict[int, str]:
    if not mlbam_ids:
        return {}
    lookup = playerid_reverse_lookup(mlbam_ids, key_type="mlbam")
    return {
        int(row["key_mlbam"]): f"{row['name_first']} {row['name_last']}".strip()
        for _, row in lookup.iterrows()
    }


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


def batter_ids_for_season(conn, season: int) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            "select mlbam_id from web_player_seasons "
            "where season = %s and appeared_as_batter = true "
            "order by mlbam_id",
            (season,),
        )
        return [row[0] for row in cur.fetchall()]


def run_all(season: int, start: date, end: date, include_postseason: bool = False) -> None:
    with connect() as conn:
        ids = batter_ids_for_season(conn, season)
    log.info("--all-batters: %d batters appeared for the Jays in %s", len(ids), season)
    for i, pid in enumerate(ids, 1):
        log.info("[%d/%d] Pulling batter %s", i, len(ids), pid)
        try:
            run(pid, start, end, include_postseason=include_postseason)
        except Exception as exc:  # noqa: BLE001 -- keep loop running
            log.exception("Failed to pull batter %s: %s -- continuing", pid, exc)


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--player", type=int, default=VLADDY_MLBAM,
                    help=f"MLBAM player ID (default {VLADDY_MLBAM} = Vladdy). Ignored when --all-batters is set.")
    ap.add_argument("--start", type=parse_date, default=date(2025, 3, 27),
                    help="Season start YYYY-MM-DD (default 2025-03-27)")
    ap.add_argument("--end", type=parse_date, default=date(2025, 9, 28),
                    help="Season end YYYY-MM-DD (default 2025-09-28)")
    ap.add_argument("--all-batters", action="store_true",
                    help="Loop over every batter in web_player_seasons for --season")
    ap.add_argument("--season", type=int, default=None,
                    help="Required with --all-batters; the season to enumerate")
    ap.add_argument("--include-postseason", action="store_true",
                    help="Keep playoff game_types (F/D/L/W) in addition to regular season")
    args = ap.parse_args(argv)

    if args.all_batters:
        if args.season is None:
            ap.error("--all-batters requires --season")
        run_all(args.season, args.start, args.end,
                include_postseason=args.include_postseason)
    else:
        run(args.player, args.start, args.end,
            include_postseason=args.include_postseason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
