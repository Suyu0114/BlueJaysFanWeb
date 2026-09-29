"""Pull Baseball Savant's team leaderboards and upsert web_team_statcast_season
(P13: contact quality, expected stats and OAA for all 30 clubs).

Usage:
    python etl/pull_team_statcast.py                                # current season
    python etl/pull_team_statcast.py --season 2022 --season 2023    # repeatable

Source: Baseball Savant CSV leaderboards (5 calls per season, all clubs each):
    leaderboard/statcast?type={batter|pitcher}-team             barrels, hard-hit, EV, sweet spot
    leaderboard/expected_statistics?type={batter|pitcher}-team  BA/xBA, SLG/xSLG, wOBA/xwOBA
    leaderboard/outs_above_average?type=Fielding_Team           team OAA
Writes: web_team_statcast_season (30 rows per season, overwritten in place)

GOTCHAS
- Savant rejects requests without a browser User-Agent, and its CSVs start with
  a UTF-8 BOM (decoded with utf-8-sig).
- Savant's abbreviations are RETROACTIVE ('ATH' for the 2022 Athletics, whose
  MLB abbreviation was 'OAK'), so rows are mapped by short name ('Blue Jays') to
  MLB /teams teamName. An unmapped row FAILS the run -- a renamed club must be
  fixed here, not silently dropped. The OAA CSV carries numeric MLB ids.
- Percentages arrive as 0-100 and are stored as fractions (8.5 -> 0.085).
Plain requests + csv: this script needs neither pybaseball nor pandas.
"""

from __future__ import annotations

import argparse
import csv
import io
import logging
import sys
import time
from datetime import date
from pathlib import Path

import requests
from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_team_statcast_season  # noqa: E402
from mlb_api import fetch_teams  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_team_statcast")

SAVANT = "https://baseballsavant.mlb.com/leaderboard"
HEADERS = {"User-Agent": "Mozilla/5.0 (BlueJaysFanHub ETL)"}
EXPECTED_TEAMS = 30

# CSV column -> table column suffix, and whether it is a 0-100 percentage.
CONTACT = {
    "attempts": ("bbe", "int"),
    "barrels": ("barrels", "int"),
    "ev95plus": ("ev95plus", "int"),
    "brl_percent": ("brl_pct", "pct"),
    "brl_pa": ("brl_pa", "pct"),
    "ev95percent": ("hard_hit_pct", "pct"),
    "anglesweetspotpercent": ("sweet_spot_pct", "pct"),
    "avg_hit_speed": ("avg_ev", "num"),
    "avg_hit_angle": ("avg_la", "num"),
}
EXPECTED = {
    "pa": ("xpa", "int"),
    "ba": ("ba", "num"),
    "est_ba": ("xba", "num"),
    "slg": ("slg", "num"),
    "est_slg": ("xslg", "num"),
    "woba": ("woba", "num"),
    "est_woba": ("xwoba", "num"),
}


def _get_csv(path: str, params: dict, tries: int = 3) -> list[dict]:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            r = requests.get(
                f"{SAVANT}/{path}", params={**params, "csv": "true"},
                headers=HEADERS, timeout=60,
            )
            r.raise_for_status()
            return list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig"))))
        except requests.RequestException as exc:
            last = exc
            if attempt < tries - 1:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Savant {path} failed after {tries} tries: {last}")


def _convert(value: str | None, kind: str):
    if value is None or value.strip() in ("", "null", "NaN"):
        return None
    x = float(value)
    if kind == "int":
        return int(round(x))
    if kind == "pct":
        return round(x / 100.0, 6)
    return x


def _board(season: int, path: str, type_: str) -> list[dict]:
    return _get_csv(
        path,
        {"type": type_, "year": season, "position": "", "team": "", "min": "q"},
    )


def build_rows(season: int) -> list[dict]:
    name_to_id = {t["team_name"]: t["id"] for t in fetch_teams(season)}
    rows: dict[int, dict] = {}

    def row_for(team_name: str, source: str) -> dict:
        team_id = name_to_id.get(team_name)
        if team_id is None:
            raise SystemExit(
                f"{season} {source}: Savant team '{team_name}' has no MLB teamName match "
                f"-- add a mapping in pull_team_statcast.py"
            )
        return rows.setdefault(team_id, {"season": season, "team_id": team_id})

    for side in ("batter", "pitcher"):
        prefix = "bat" if side == "batter" else "pit"
        for path, spec in (("statcast", CONTACT), ("expected_statistics", EXPECTED)):
            board = _board(season, path, f"{side}-team")
            if len(board) != EXPECTED_TEAMS:
                log.warning("%s %s %s-team: %d rows", season, path, side, len(board))
            for rec in board:
                row = row_for(rec["team"], f"{path} {side}-team")
                for src, (col, kind) in spec.items():
                    row[f"{prefix}_{col}"] = _convert(rec.get(src), kind)
            time.sleep(0.5)

    oaa = _get_csv(
        "outs_above_average",
        {
            "type": "Fielding_Team", "startYear": season, "endYear": season,
            "split": "no", "team": "", "range": "year", "min": 10, "pos": "",
            "roles": "", "viz": "hide",
        },
    )
    for rec in oaa:
        team_id = int(rec["team_id"])
        rows.setdefault(team_id, {"season": season, "team_id": team_id})["oaa"] = (
            _convert(rec.get("outs_above_average"), "int")
        )

    if len(rows) != EXPECTED_TEAMS:
        log.warning("Expected %d clubs for %s, got %d", EXPECTED_TEAMS, season, len(rows))
    return list(rows.values())


def run(season: int) -> None:
    rows = build_rows(season)
    if not rows:
        log.warning("No Savant team rows for %s", season)
        return
    with connect() as conn:
        upsert_team_statcast_season(conn, rows)
        conn.commit()
    log.info("Upserted %d web_team_statcast_season rows for %s", len(rows), season)


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
