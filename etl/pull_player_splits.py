"""Full-MLB season lines, per club + season total, for one season's Blue Jays
roster -- including seasons they spent entirely with other clubs (P12 D13/D14).

Usage:
    # one-shot history for the 2026 roster (traded in AND out)
    python etl/pull_player_splits.py --cohort-season 2026 --season 2024 --season 2025 --season 2026
    # nightly (refresh job): keep this season's traded players current
    python etl/pull_player_splits.py --cohort-season 2026 --season 2026

Cohort = web_player_seasons for --cohort-season (the fullSeason roster, so
deadline departures and mid-season arrivals are both in). For every cohort
player x --season, two MLB Stats API calls:
  /people/{id}/stats?stats=season,sabermetrics  -> one split per club + total
  /people/{id}/stats?stats=gameLog              -> G + first/last date per club
Rows go to web_player_team_season_stats (team_id 0 = season total), mapped by
season_line.to_row -- the same mapping pull_season_stats.py uses, so the
team_id = 141 rows equal web_player_season_stats. Seasons with no MLB line
(NPB, minors, not yet debuted) simply produce no rows.
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

from db import connect  # noqa: E402
from mlb_api import (  # noqa: E402
    BLUE_JAYS_TEAM_ID,
    fetch_player_season_splits,
    fetch_player_team_dates,
)
from season_line import STAT_COLS, has_batting, rate, to_row  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_player_splits")

EXTRA_COLS = ["g", "first_game", "last_game", "bat_k_pct", "bat_bb_pct"]
COLS = STAT_COLS + EXTRA_COLS

UPSERT_SQL = f"""
    insert into web_player_team_season_stats (mlbam_id, season, team_id, {", ".join(COLS)})
    values (%(mlbam_id)s, %(season)s, %(team_id)s, {", ".join(f"%({c})s" for c in COLS)})
    on conflict (mlbam_id, season, team_id) do update set
      {", ".join(f"{c} = coalesce(excluded.{c}, web_player_team_season_stats.{c})" for c in COLS)},
      updated_at = now()
"""


def cohort_ids(conn, cohort_season: int) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            "select distinct mlbam_id from web_player_seasons "
            "where season = %s and team_id = %s order by mlbam_id",
            (cohort_season, BLUE_JAYS_TEAM_ID),
        )
        return [r[0] for r in cur.fetchall()]


def rows_for(mlbam_id: int, season: int) -> list[dict]:
    splits = fetch_player_season_splits(mlbam_id, season)
    if not splits:
        return []
    dates = fetch_player_team_dates(mlbam_id, season)
    rows = []
    for team_id, groups in splits.items():
        hitting, pitching = groups.get("hitting"), groups.get("pitching")
        row = to_row(hitting, pitching)
        if row is None:
            continue
        d = dates.get(team_id, {})
        row |= {
            "mlbam_id": mlbam_id,
            "season": season,
            "team_id": team_id,
            "g": d.get("g"),
            "first_game": d.get("first"),
            "last_game": d.get("last"),
            "bat_k_pct": None,
            "bat_bb_pct": None,
        }
        if has_batting(hitting):
            row["bat_k_pct"] = rate(hitting.get("strikeOuts"), hitting.get("plateAppearances"))
            row["bat_bb_pct"] = rate(hitting.get("baseOnBalls"), hitting.get("plateAppearances"))
        rows.append(row)
    return rows


def run(cohort_season: int, seasons: list[int]) -> None:
    with connect() as conn:
        ids = cohort_ids(conn, cohort_season)
    log.info("Cohort: %d players on the %s roster; seasons %s", len(ids), cohort_season, seasons)

    rows: list[dict] = []
    for i, pid in enumerate(ids, 1):
        for season in seasons:
            try:
                got = rows_for(pid, season)
            except Exception as exc:  # noqa: BLE001 -- keep the loop running
                log.exception("[%d/%d] %s %s failed: %s -- continuing", i, len(ids), pid, season, exc)
                continue
            clubs = sorted(r["team_id"] for r in got if r["team_id"] != 0)
            log.info("[%d/%d] %s %s: clubs %s", i, len(ids), pid, season, clubs or "-")
            rows.extend(got)

    if not rows:
        log.warning("No MLB lines found; nothing to upsert.")
        return
    log.info("Upserting %d rows into web_player_team_season_stats", len(rows))
    with connect() as conn:
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, rows)
        conn.commit()
    log.info("Done.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cohort-season", type=int, required=True,
                    help="Roster season whose players to pull (web_player_seasons)")
    ap.add_argument("--season", type=int, action="append", required=True,
                    help="MLB season(s) to pull for that cohort (repeatable)")
    args = ap.parse_args(argv)
    run(args.cohort_season, args.season)
    return 0


if __name__ == "__main__":
    sys.exit(main())
