"""Pull a batter's Statcast for a date range and upsert into Postgres.

Default: Vladimir Guerrero Jr. (665489), full 2025 regular season.
Usage:
    python pull_statcast.py
    python pull_statcast.py --player 665489 --start 2026-03-27 --end 2026-05-26
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
from transform import regular_season_only, to_field_feet  # noqa: E402

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


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = regular_season_only(df)
    df = to_field_feet(df)
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


def run(player_id: int, start: date, end: date) -> None:
    raw = fetch(player_id, start, end)
    df = normalize(raw)
    log.info("After regular-season filter + cleanup: %d rows", len(df))

    pname = KNOWN_NAMES.get(player_id) or f"MLBAM-{player_id}"

    with connect() as conn:
        upsert_referenced_players(conn, df, (player_id, pname))
        n = upsert_statcast_events(conn, df)
        log.info("Upserted %d statcast_events rows", n)
        conn.commit()
    log.info("Done.")


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--player", type=int, default=VLADDY_MLBAM,
                    help=f"MLBAM player ID (default {VLADDY_MLBAM} = Vladdy)")
    ap.add_argument("--start", type=parse_date, default=date(2025, 3, 27),
                    help="Season start YYYY-MM-DD (default 2025-03-27)")
    ap.add_argument("--end", type=parse_date, default=date(2025, 9, 28),
                    help="Season end YYYY-MM-DD (default 2025-09-28)")
    args = ap.parse_args(argv)
    run(args.player, args.start, args.end)
    return 0


if __name__ == "__main__":
    sys.exit(main())
