"""Pull batter Statcast for a date range and upsert into Postgres.

Default: Vladimir Guerrero Jr. (665489), full 2025 regular season.
Usage:
    python pull_statcast.py
    python pull_statcast.py --player 665489 --start 2026-03-27 --end 2026-05-26
    python pull_statcast.py --all-batters --season 2024 --start 2024-03-28 --end 2024-09-29
    python pull_statcast.py --all-batters --season 2025 --start 2025-03-27 --end 2025-11-01 --include-postseason
    # P12 history: the 2026 roster's 2024 seasons with OTHER clubs (window defaults wide)
    python pull_statcast.py --all-batters --season 2024 --cohort-season 2026
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
    # P10: pfx_x / pfx_z / release_extension / balls / strikes keep their raw names.
    "estimated_woba_using_speedangle": "estimated_woba",
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
    # P10 columns are standard Savant fields, but guard so an unexpected payload
    # can't KeyError the df[STATCAST_COLUMNS] subset in upsert_statcast_events.
    for col in ("pfx_x", "pfx_z", "release_extension", "estimated_woba", "balls", "strikes"):
        if col not in df.columns:
            df[col] = pd.NA
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
    for col in ("game_pk", "batter_id", "pitcher_id", "at_bat_number", "pitch_number",
                "zone", "balls", "strikes"):
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


def cohort_history_ids(conn, cohort_season: int, season: int, role: str) -> list[int]:
    """P12 D13: players on the `cohort_season` Jays roster who have an MLB line
    in `season` (web_player_team_season_stats, team_id 0) but were NOT Jays that
    season -- i.e. the seasons spent entirely with other clubs. Seasons they were
    Jays are already pulled in full by the plain --all-* run. Role comes from
    the cohort season's appeared_as_* flag."""
    flag, has_line = {
        "batter": ("appeared_as_batter", "t.pa > 0"),
        "pitcher": ("appeared_as_pitcher", "t.ip is not null"),
    }[role]
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select distinct c.mlbam_id
            from web_player_seasons c
            join web_player_team_season_stats t
              on t.mlbam_id = c.mlbam_id and t.season = %(season)s and t.team_id = 0
            where c.season = %(cohort)s and c.team_id = 141 and c.{flag}
              and {has_line}
              and not exists (
                select 1 from web_player_seasons j
                where j.mlbam_id = c.mlbam_id and j.season = %(season)s
              )
            order by c.mlbam_id
            """,
            {"season": season, "cohort": cohort_season},
        )
        return [row[0] for row in cur.fetchall()]


def history_window(season: int) -> tuple[date, date]:
    """Wide enough for any club's schedule (Seoul / Tokyo openers in March,
    makeup games into October); regular_season_only drops spring + playoffs."""
    return date(season, 3, 1), date(season, 10, 5)


def run_all(season: int, start: date, end: date, include_postseason: bool = False,
            cohort_season: int | None = None) -> None:
    with connect() as conn:
        if cohort_season is None:
            ids = batter_ids_for_season(conn, season)
        else:
            ids = cohort_history_ids(conn, cohort_season, season, "batter")
    if cohort_season is None:
        log.info("--all-batters: %d batters appeared for the Jays in %s", len(ids), season)
    else:
        log.info("--all-batters --cohort-season %s: %d batters with other-club %s seasons",
                 cohort_season, len(ids), season)
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
    ap.add_argument("--start", type=parse_date, default=None,
                    help="Season start YYYY-MM-DD (default 2025-03-27; Mar 1 of --season with --cohort-season)")
    ap.add_argument("--end", type=parse_date, default=None,
                    help="Season end YYYY-MM-DD (default 2025-09-28; Oct 5 of --season with --cohort-season)")
    ap.add_argument("--all-batters", action="store_true",
                    help="Loop over every batter in web_player_seasons for --season")
    ap.add_argument("--cohort-season", type=int, default=None,
                    help="With --all-batters: instead pull this roster's players' OTHER-club --season (P12 history)")
    ap.add_argument("--season", type=int, default=None,
                    help="Required with --all-batters; the season to enumerate")
    ap.add_argument("--include-postseason", action="store_true",
                    help="Keep playoff game_types (F/D/L/W) in addition to regular season")
    args = ap.parse_args(argv)

    if args.cohort_season is not None and args.season is not None:
        wide = history_window(args.season)
        args.start, args.end = args.start or wide[0], args.end or wide[1]
    args.start = args.start or date(2025, 3, 27)
    args.end = args.end or date(2025, 9, 28)

    if args.all_batters:
        if args.season is None:
            ap.error("--all-batters requires --season")
        run_all(args.season, args.start, args.end,
                include_postseason=args.include_postseason,
                cohort_season=args.cohort_season)
    else:
        run(args.player, args.start, args.end,
            include_postseason=args.include_postseason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
