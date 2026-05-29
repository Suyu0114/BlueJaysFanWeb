"""Pull per-position OAA / FRV from Baseball Savant and upsert into
web_fielding_frv. Source: pybaseball.statcast_outs_above_average.

Usage:
    python pull_fielding.py                 # current season (2025) by default
    python pull_fielding.py --season 2025
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_players  # noqa: E402

from pybaseball import statcast_outs_above_average  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_fielding")

# Position codes per Baseball Savant: 3=1B, 4=2B, 5=3B, 6=SS, 7=LF, 8=CF, 9=RF.
# Pitchers (1) and catchers (2) are excluded from Savant's OAA leaderboard.
POSITIONS: list[int] = [3, 4, 5, 6, 7, 8, 9]

UPSERT_SQL = """
    insert into web_fielding_frv (
      mlbam_id, season, position,
      frv, oaa,
      oaa_in_front, oaa_lateral_toward_3b, oaa_lateral_toward_1b, oaa_behind,
      oaa_vs_rhh, oaa_vs_lhh
    ) values (
      %(mlbam_id)s, %(season)s, %(position)s,
      %(frv)s, %(oaa)s,
      %(oaa_in_front)s, %(oaa_lateral_toward_3b)s, %(oaa_lateral_toward_1b)s, %(oaa_behind)s,
      %(oaa_vs_rhh)s, %(oaa_vs_lhh)s
    )
    on conflict (mlbam_id, season, position) do update set
      frv                   = excluded.frv,
      oaa                   = excluded.oaa,
      oaa_in_front          = excluded.oaa_in_front,
      oaa_lateral_toward_3b = excluded.oaa_lateral_toward_3b,
      oaa_lateral_toward_1b = excluded.oaa_lateral_toward_1b,
      oaa_behind            = excluded.oaa_behind,
      oaa_vs_rhh            = excluded.oaa_vs_rhh,
      oaa_vs_lhh            = excluded.oaa_vs_lhh,
      updated_at            = now()
"""


def fetch(season: int) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for pos in POSITIONS:
        log.info("Fetching OAA/FRV season=%s pos=%s", season, pos)
        df = statcast_outs_above_average(year=season, pos=pos, min_att=1)
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def _to_int(v) -> int | None:
    if v is None or pd.isna(v):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def to_rows(df: pd.DataFrame, season: int) -> list[dict]:
    rows: list[dict] = []
    for _, r in df.iterrows():
        mlbam = _to_int(r.get("player_id"))
        if mlbam is None:
            continue
        rows.append(
            {
                "mlbam_id": mlbam,
                "season": season,
                "position": str(r.get("primary_pos_formatted") or "").strip(),
                "frv": _to_int(r.get("fielding_runs_prevented")),
                "oaa": _to_int(r.get("outs_above_average")),
                "oaa_in_front": _to_int(r.get("outs_above_average_infront")),
                "oaa_lateral_toward_3b": _to_int(
                    r.get("outs_above_average_lateral_toward3bline")
                ),
                "oaa_lateral_toward_1b": _to_int(
                    r.get("outs_above_average_lateral_toward1bline")
                ),
                "oaa_behind": _to_int(r.get("outs_above_average_behind")),
                "oaa_vs_rhh": _to_int(r.get("outs_above_average_rhh")),
                "oaa_vs_lhh": _to_int(r.get("outs_above_average_lhh")),
            }
        )
    return rows


def derive_player_seeds(df: pd.DataFrame) -> list[dict]:
    """Seed web_players for any fielder we haven't seen via the statcast ETL."""
    seeds: dict[int, str] = {}
    for _, r in df.iterrows():
        mid = _to_int(r.get("player_id"))
        if mid is None:
            continue
        raw_name = str(r.get("last_name, first_name") or "").strip()
        if "," in raw_name:
            last, first = (s.strip() for s in raw_name.split(",", 1))
            name = f"{first} {last}"
        else:
            name = raw_name or f"MLBAM-{mid}"
        seeds[mid] = name
    return [{"mlbam_id": mid, "name": name} for mid, name in seeds.items()]


def run(season: int) -> None:
    df = fetch(season)
    log.info("Total fielder-position rows fetched: %d", len(df))
    rows = to_rows(df, season)
    log.info("Prepared %d upsert rows", len(rows))

    with connect() as conn:
        seeds = derive_player_seeds(df)
        n = upsert_players(conn, seeds)
        log.info("Upserted %d player seeds (names only if blank)", n)
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, rows)
            log.info("Upserted %d fielding rows", cur.rowcount)
        conn.commit()
    log.info("Done.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--season", type=int, default=2025,
                    help="MLB season year (default 2025)")
    args = ap.parse_args(argv)
    run(args.season)
    return 0


if __name__ == "__main__":
    sys.exit(main())
