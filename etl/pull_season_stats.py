"""Load season aggregates (OPS / wRC+ / ERA / FIP / K-9 / WAR + WAR components
+ basic batting line + pitcher line) for every Blue Jay in a given season from
the MLB Stats API and upsert into web_player_season_stats.

Usage:
    python pull_season_stats.py --season 2024
    python pull_season_stats.py --season 2026

Source: `/api/v1/stats?stats=season,sabermetrics&teamId=141` (free, no key).
The sabermetrics block is FanGraphs data licensed to MLB, so WAR / wRC+ / FIP /
the Value components are the same numbers the old manual FanGraphs CSV export
carried (verified against the 2025 export: WAR within +-0.05, every other
column within rounding). This replaced the CSV path once the paid FanGraphs
membership lapsed -- and unlike the CSVs (gitignored, so never present on the
CI runner) it runs in the nightly cron.

The column mapping (incl. the catcher-framing war_fielding derivation and
the absent WPA) lives in season_line.py, shared with pull_player_splits.py.
`wpa` is left out of the upsert, so values from the old CSV imports survive
and newer seasons stay NULL (not rendered anywhere).
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_players  # noqa: E402
from mlb_api import fetch_team_season_stats  # noqa: E402
from season_line import STAT_COLS, has_batting, to_row  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_season_stats")

UPSERT_SQL = f"""
    insert into web_player_season_stats (mlbam_id, season, {", ".join(STAT_COLS)})
    values (%(mlbam_id)s, %(season)s, {", ".join(f"%({c})s" for c in STAT_COLS)})
    on conflict (mlbam_id, season) do update set
      {", ".join(f"{c} = coalesce(excluded.{c}, web_player_season_stats.{c})" for c in STAT_COLS)},
      updated_at = now()
"""


def run(season: int) -> None:
    batting = fetch_team_season_stats(season, "hitting")
    pitching = fetch_team_season_stats(season, "pitching")
    log.info("%s: API returned %d hitting / %d pitching lines",
             season, len(batting), len(pitching))

    lines: dict[int, dict] = {}
    names: dict[int, str] = {}
    for group, recs in (("hitting", batting), ("pitching", pitching)):
        for rec in recs:
            lines.setdefault(rec["mlbam_id"], {})[group] = rec["stat"]
            names[rec["mlbam_id"]] = rec["name"]

    skipped = sum(1 for rec in batting if not has_batting(rec["stat"]))
    if skipped:
        log.info("Skipped %d hitting line(s) with 0 PA", skipped)

    rows = []
    for pid, g in lines.items():
        row = to_row(g.get("hitting"), g.get("pitching"))
        if row is not None:
            rows.append({"mlbam_id": pid, "season": season} | row)
    names = {pid: names[pid] for pid in (r["mlbam_id"] for r in rows)}
    if not rows:
        log.warning("No season stats for %s (season not started?); nothing to upsert.", season)
        return

    log.info("Upserting %d season-stat rows for %s", len(rows), season)
    with connect() as conn:
        # FK guard: pull_team_players normally inserts every Jay first, but a
        # missing parent row would abort the whole batch (and the cron steps
        # after it). Name-only insert; never overwrites an existing name.
        upsert_players(conn, [{"mlbam_id": k, "name": v} for k, v in names.items()])
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, rows)
        conn.commit()
    log.info("Done.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--season", type=int, required=True, help="MLB season year")
    args = ap.parse_args(argv)
    run(args.season)
    return 0


if __name__ == "__main__":
    sys.exit(main())
