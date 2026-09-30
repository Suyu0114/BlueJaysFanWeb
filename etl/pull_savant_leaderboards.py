"""Baseball Savant leaderboards -> web_savant_percentiles / web_savant_season /
web_pitch_arsenal_rv (P12 M6, migrations 016-018).

Usage:
    python etl/pull_savant_leaderboards.py --season 2026
    python etl/pull_savant_leaderboards.py --season 2024 --season 2025 --season 2026

Values are stored exactly as Savant publishes them (P12 D6) -- MLB-wide season
numbers, every club. Players kept: that season's Jays roster (web_player_seasons)
plus the P12 D13 cohort's other-club seasons (web_player_team_season_stats,
team_id 0). Savant's leaderboards are league-wide, so this is a filter, not a
per-player pull: five requests per season in total.

"Absent row = not qualified" (D6): each run replaces the season's rows for the
kept players, so a player who drops below a leaderboard's qualifier loses his
stale row instead of keeping last week's percentile.
"""

from __future__ import annotations

import argparse
import logging
import math
import sys
import warnings
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect  # noqa: E402

from pybaseball import (  # noqa: E402
    statcast_batter_exitvelo_barrels,
    statcast_batter_expected_stats,
    statcast_batter_percentile_ranks,
    statcast_pitcher_arsenal_stats,
    statcast_pitcher_percentile_ranks,
)

warnings.filterwarnings("ignore", category=FutureWarning)
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_savant_leaderboards")

PCT_COLS = [
    "xwoba", "xba", "xslg", "brl_percent", "exit_velocity", "hard_hit_percent",
    "k_percent", "bb_percent", "whiff_percent", "chase_percent",
    "sprint_speed", "oaa", "arm_strength", "bat_speed", "squared_up_rate",
    "xera", "fb_velocity", "fb_spin", "curve_spin",
]
# Savant expected-stats / exit-velo column -> web_savant_season column.
XSTATS = {"pa": "pa", "bip": "bip", "ba": "ba", "est_ba": "xba", "slg": "slg",
          "est_slg": "xslg", "woba": "woba", "est_woba": "xwoba"}
EVBRL = {"barrels": "barrels", "brl_percent": "brl_percent", "brl_pa": "brl_pa",
         "anglesweetspotpercent": "sweet_spot_pct", "ev95percent": "ev95_pct",
         "avg_hit_speed": "avg_ev", "max_hit_speed": "max_ev"}
SEASON_COLS = list(XSTATS.values()) + list(EVBRL.values())
ARSENAL = {"pitches": "pitches", "pitch_usage": "usage", "run_value": "run_value",
           "run_value_per_100": "run_value_per_100", "whiff_percent": "whiff_pct",
           "put_away": "put_away", "woba": "woba", "est_woba": "xwoba",
           "hard_hit_percent": "hard_hit_pct"}
ARSENAL_COLS = list(ARSENAL.values())


def clean(v):
    """pandas NaN / numpy scalars -> plain Python (None for missing)."""
    if v is None:
        return None
    try:
        if math.isnan(v):
            return None
    except TypeError:
        return v
    return v.item() if hasattr(v, "item") else v


def kept_ids(conn, season: int) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select mlbam_id from web_player_seasons where season = %(s)s
            union
            select mlbam_id from web_player_team_season_stats where season = %(s)s and team_id = 0
            """,
            {"s": season},
        )
        return sorted(r[0] for r in cur.fetchall())


def percentile_rows(df, role: str, season: int, ids: set[int]) -> list[dict]:
    rows = []
    for rec in df.to_dict("records"):
        pid = int(rec["player_id"])
        if pid not in ids:
            continue
        row = {"mlbam_id": pid, "season": season, "role": role}
        for c in PCT_COLS:
            v = clean(rec.get(c))
            row[c] = None if v is None else int(round(float(v)))
        rows.append(row)
    return rows


def season_rows(xstats, evbrl, season: int, ids: set[int]) -> list[dict]:
    by: dict[int, dict] = {}
    for df, mapping in ((xstats, XSTATS), (evbrl, EVBRL)):
        for rec in df.to_dict("records"):
            pid = int(rec["player_id"])
            if pid not in ids:
                continue
            row = by.setdefault(pid, {"mlbam_id": pid, "season": season} | {c: None for c in SEASON_COLS})
            for src, dst in mapping.items():
                row[dst] = clean(rec.get(src))
    return list(by.values())


def arsenal_rows(df, season: int, ids: set[int]) -> list[dict]:
    by: dict[tuple[int, str], dict] = {}
    for rec in df.to_dict("records"):
        pid = int(rec["player_id"])
        pt = rec.get("pitch_type")
        if pid not in ids or not pt:
            continue
        row = {"mlbam_id": pid, "season": season, "pitch_type": pt} | {
            dst: clean(rec.get(src)) for src, dst in ARSENAL.items()
        }
        prev = by.get((pid, pt))
        # One row per pitcher x pitch type; keep the larger sample if Savant
        # ever repeats a pair.
        if prev is None or (row["pitches"] or 0) > (prev["pitches"] or 0):
            by[(pid, pt)] = row
    return list(by.values())


def upsert(conn, table: str, key: list[str], cols: list[str], rows: list[dict], season: int, ids: list[int]) -> None:
    with conn.cursor() as cur:
        # Replace the season's rows for the kept players (absent = not qualified).
        cur.execute(f"delete from {table} where season = %s and mlbam_id = any(%s)", (season, ids))
        if rows:
            all_cols = key + cols
            cur.executemany(
                f"insert into {table} ({', '.join(all_cols)}) values ({', '.join(f'%({c})s' for c in all_cols)})",
                rows,
            )
    log.info("%s %s: %d rows", table, season, len(rows))


def run(season: int) -> None:
    with connect() as conn:
        ids = kept_ids(conn, season)
    idset = set(ids)
    log.info("Season %s: %d players (Jays roster + other-club cohort seasons)", season, len(ids))

    bat_pct = statcast_batter_percentile_ranks(season)
    pit_pct = statcast_pitcher_percentile_ranks(season)
    xstats = statcast_batter_expected_stats(season, minPA=1)
    evbrl = statcast_batter_exitvelo_barrels(season, minBBE=1)
    arsenal = statcast_pitcher_arsenal_stats(season, minPA=1)

    pct = percentile_rows(bat_pct, "batter", season, idset) + percentile_rows(pit_pct, "pitcher", season, idset)
    seas = season_rows(xstats, evbrl, season, idset)
    ars = arsenal_rows(arsenal, season, idset)

    with connect() as conn:
        upsert(conn, "web_savant_percentiles", ["mlbam_id", "season", "role"], PCT_COLS, pct, season, ids)
        upsert(conn, "web_savant_season", ["mlbam_id", "season"], SEASON_COLS, seas, season, ids)
        upsert(conn, "web_pitch_arsenal_rv", ["mlbam_id", "season", "pitch_type"], ARSENAL_COLS, ars, season, ids)
        conn.commit()
    log.info("Done %s.", season)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--season", type=int, action="append", required=True)
    args = ap.parse_args(argv)
    for s in args.season:
        run(s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
