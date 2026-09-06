"""Load FanGraphs season aggregates (OPS / wRC+ / ERA / FIP / K-9 / WAR) for
all Blue Jays in a given season from manually-exported CSVs and upsert into
web_player_season_stats.

Usage:
    python pull_season_stats.py --season 2024
    python pull_season_stats.py --season 2026

CSVs are exported by hand from FanGraphs (paid membership) and dropped into
etl/data/fangraphs/{batting,pitching}_{season}.csv. The directory is
gitignored. pybaseball's batting_stats / pitching_stats are unusable -- they
have been 403'd by FanGraphs indefinitely. See the plan file for download
steps.

The CSV exports already include an `MLBAMID` column, so the IDfg -> MLBAM
hop through Chadwick (etl/idmap.py) is not needed here. Rows with a missing
MLBAMID are skipped with a count in the logs.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Literal

import pandas as pd
from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_season_stats")

CSV_DIR = _HERE / "data" / "fangraphs"

REQUIRED_COLS: dict[str, list[str]] = {
    "batting":  ["MLBAMID", "OPS", "wRC+", "WAR"],
    "pitching": ["MLBAMID", "ERA", "FIP", "K/9", "WAR"],
}

# P7: FanGraphs Value 細項 -> web_player_season_stats (header 已對照確認).
# Batter-only and OPTIONAL: unlike REQUIRED_COLS these warn + skip (store NULL)
# if absent, so an older batting CSV without the Value preset won't hard-fail.
WAR_COMPONENT_COLS = {
    "Bat": "war_batting",
    "BsR": "war_baserunning",
    "Fld": "war_fielding",
    "Pos": "war_positional",
    "Lg":  "war_league",
    "Rep": "war_replacement",
    "RAR": "rar",
    "WPA": "wpa",
}

# P9: basic batting stats (slash line + counting) for the year-by-year table on
# the player overview. Batter-only and OPTIONAL, same warn-if-absent handling as
# WAR_COMPONENT_COLS so an older Dashboard-only CSV won't hard-fail. From the
# FanGraphs Dashboard/Standard preset; OPS is already in REQUIRED_COLS.
BASIC_STAT_COLS = {
    "AVG": "avg",
    "OBP": "obp",
    "SLG": "slg",
    "HR":  "hr",
    "RBI": "rbi",
    "SB":  "sb",
    "PA":  "pa",
}

# P10: pitcher season line (W-L/SV/GS/IP + WHIP/K%/BB%) for the pitcher overview.
# Pitcher-only and OPTIONAL, same warn-if-absent handling. The plain Dashboard
# preset lacks WHIP/K%/BB% — those need a Custom Report re-export (Dashboard +
# WHIP + K% + BB%); W/L/SV/GS/IP are in every Dashboard export. K%/BB% arrive as
# raw fractions (0.245) and IP as baseball notation (170.1 = 170 1/3) — stored
# verbatim; the web layer formats them.
PITCHING_STAT_COLS = {
    "W":    "w",
    "L":    "l",
    "SV":   "sv",
    "GS":   "gs",
    "IP":   "ip",
    "WHIP": "whip",
    "K%":   "k_pct",
    "BB%":  "bb_pct",
}
# join / identity: MLBAMID -> mlbam_id

UPSERT_SQL = """
    insert into web_player_season_stats
      (mlbam_id, season, ops, wrc_plus, war, era, fip, k_per_9,
       war_batting, war_baserunning, war_fielding, war_positional,
       war_league, war_replacement, rar, wpa,
       avg, obp, slg, hr, rbi, sb, pa,
       w, l, sv, gs, ip, whip, k_pct, bb_pct)
    values
      (%(mlbam_id)s, %(season)s, %(ops)s, %(wrc_plus)s, %(war)s,
       %(era)s, %(fip)s, %(k_per_9)s,
       %(war_batting)s, %(war_baserunning)s, %(war_fielding)s, %(war_positional)s,
       %(war_league)s, %(war_replacement)s, %(rar)s, %(wpa)s,
       %(avg)s, %(obp)s, %(slg)s, %(hr)s, %(rbi)s, %(sb)s, %(pa)s,
       %(w)s, %(l)s, %(sv)s, %(gs)s, %(ip)s, %(whip)s, %(k_pct)s, %(bb_pct)s)
    on conflict (mlbam_id, season) do update set
      ops             = coalesce(excluded.ops,             web_player_season_stats.ops),
      wrc_plus        = coalesce(excluded.wrc_plus,        web_player_season_stats.wrc_plus),
      war             = coalesce(excluded.war,             web_player_season_stats.war),
      era             = coalesce(excluded.era,             web_player_season_stats.era),
      fip             = coalesce(excluded.fip,             web_player_season_stats.fip),
      k_per_9         = coalesce(excluded.k_per_9,         web_player_season_stats.k_per_9),
      war_batting     = coalesce(excluded.war_batting,     web_player_season_stats.war_batting),
      war_baserunning = coalesce(excluded.war_baserunning, web_player_season_stats.war_baserunning),
      war_fielding    = coalesce(excluded.war_fielding,    web_player_season_stats.war_fielding),
      war_positional  = coalesce(excluded.war_positional,  web_player_season_stats.war_positional),
      war_league      = coalesce(excluded.war_league,      web_player_season_stats.war_league),
      war_replacement = coalesce(excluded.war_replacement, web_player_season_stats.war_replacement),
      rar             = coalesce(excluded.rar,             web_player_season_stats.rar),
      wpa             = coalesce(excluded.wpa,             web_player_season_stats.wpa),
      avg             = coalesce(excluded.avg,             web_player_season_stats.avg),
      obp             = coalesce(excluded.obp,             web_player_season_stats.obp),
      slg             = coalesce(excluded.slg,             web_player_season_stats.slg),
      hr              = coalesce(excluded.hr,              web_player_season_stats.hr),
      rbi             = coalesce(excluded.rbi,             web_player_season_stats.rbi),
      sb              = coalesce(excluded.sb,              web_player_season_stats.sb),
      pa              = coalesce(excluded.pa,              web_player_season_stats.pa),
      w               = coalesce(excluded.w,               web_player_season_stats.w),
      l               = coalesce(excluded.l,               web_player_season_stats.l),
      sv              = coalesce(excluded.sv,              web_player_season_stats.sv),
      gs              = coalesce(excluded.gs,              web_player_season_stats.gs),
      ip              = coalesce(excluded.ip,              web_player_season_stats.ip),
      whip            = coalesce(excluded.whip,            web_player_season_stats.whip),
      k_pct           = coalesce(excluded.k_pct,           web_player_season_stats.k_pct),
      bb_pct          = coalesce(excluded.bb_pct,          web_player_season_stats.bb_pct),
      updated_at = now()
"""


def _num(v) -> float | None:
    if v is None or pd.isna(v):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _load_csv(kind: Literal["batting", "pitching"], season: int) -> pd.DataFrame:
    """Read a manually-exported FanGraphs leaderboard CSV.

    Path: etl/data/fangraphs/{kind}_{season}.csv

    Missing file -> warning + empty DataFrame so backfill / nightly cron keep
    going (matches the prior 403-fallback behavior; KPI cards just show "—"
    until the user drops a fresh CSV in place).

    Missing required column -> RuntimeError. Silently writing NULL OPS/WAR
    because someone exported a stripped-down custom view would be worse than
    a loud failure.
    """
    path = CSV_DIR / f"{kind}_{season}.csv"
    if not path.exists():
        log.warning(
            "%s %s: %s not found; skipping season-stat ingest for this slice. "
            "Drop a FanGraphs export there to populate KPI cards.",
            kind, season, path,
        )
        return pd.DataFrame()

    df = pd.read_csv(path)
    missing = [c for c in REQUIRED_COLS[kind] if c not in df.columns]
    if missing:
        raise RuntimeError(
            f"{path.name} missing required columns: {missing}. "
            f"Re-export from FanGraphs using the default Dashboard view."
        )
    log.info("%s %s: loaded %d rows from %s", kind, season, len(df), path.name)
    return df


def _mlbam(row) -> int | None:
    v = row.get("MLBAMID")
    if v is None or pd.isna(v):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _warn_duplicate_value_headers(df: pd.DataFrame, season: int) -> None:
    """Spec §3 dedup guard. A clean Custom Report has no duplicate headers, but
    if one reappears pandas auto-suffixes the twin ('Bat.1'). We always read the
    canonical name ('Bat'); warn loudly if a suffixed twin shows up so the
    export can be fixed at source rather than silently grabbing the wrong column.
    """
    for header in WAR_COMPONENT_COLS:
        if f"{header}.1" in df.columns:
            log.warning(
                "batting %s: duplicate header %r detected (pandas suffixed a twin "
                "as %r); using canonical %r. Re-export as a single Custom Report.",
                season, header, f"{header}.1", header,
            )


def run(season: int) -> None:
    bat = _load_csv("batting", season)
    pit = _load_csv("pitching", season)

    if bat.empty and pit.empty:
        log.warning("No FanGraphs CSV for %s; nothing to upsert.", season)
        return

    # P7 Value columns (batter-only, optional). Determine which are present once;
    # warn for any absent / duplicated header rather than hard-failing.
    value_present = [h for h in WAR_COMPONENT_COLS if h in bat.columns]
    value_missing = [h for h in WAR_COMPONENT_COLS if h not in bat.columns]
    basic_present = [h for h in BASIC_STAT_COLS if h in bat.columns]
    basic_missing = [h for h in BASIC_STAT_COLS if h not in bat.columns]
    pitching_present = [h for h in PITCHING_STAT_COLS if h in pit.columns]
    pitching_missing = [h for h in PITCHING_STAT_COLS if h not in pit.columns]
    if not pit.empty and pitching_missing:
        log.warning(
            "pitching %s: stat column(s) absent, storing NULL: %s "
            "(WHIP/K%%/BB%% need a Custom Report export — Dashboard + those three)",
            season, pitching_missing,
        )
    if not bat.empty:
        _warn_duplicate_value_headers(bat, season)
        if value_missing:
            log.warning(
                "batting %s: Value column(s) absent, storing NULL: %s",
                season, value_missing,
            )
        if basic_missing:
            log.warning(
                "batting %s: basic stat column(s) absent, storing NULL: %s",
                season, basic_missing,
            )

    by_mlbam: dict[int, dict] = {}
    skipped_bat = skipped_pit = 0

    for _, r in bat.iterrows():
        mlbam = _mlbam(r)
        if mlbam is None:
            skipped_bat += 1
            continue
        entry = by_mlbam.setdefault(mlbam, {"mlbam_id": mlbam, "season": season})
        entry["ops"] = _num(r.get("OPS"))
        entry["wrc_plus"] = _num(r.get("wRC+"))
        entry["war"] = _num(r.get("WAR"))
        for header in value_present:
            entry[WAR_COMPONENT_COLS[header]] = _num(r.get(header))
        for header in basic_present:
            entry[BASIC_STAT_COLS[header]] = _num(r.get(header))

    for _, r in pit.iterrows():
        mlbam = _mlbam(r)
        if mlbam is None:
            skipped_pit += 1
            continue
        entry = by_mlbam.setdefault(mlbam, {"mlbam_id": mlbam, "season": season})
        entry["era"] = _num(r.get("ERA"))
        entry["fip"] = _num(r.get("FIP"))
        entry["k_per_9"] = _num(r.get("K/9"))
        for header in pitching_present:
            entry[PITCHING_STAT_COLS[header]] = _num(r.get(header))
        # Two-way players: WAR may already be set from batting; sum if both.
        pit_war = _num(r.get("WAR"))
        if pit_war is not None:
            entry["war"] = (entry.get("war") or 0.0) + pit_war

    if skipped_bat or skipped_pit:
        log.warning("Skipped rows with missing MLBAMID: batting=%d pitching=%d",
                    skipped_bat, skipped_pit)

    rows = []
    for mlbam, entry in by_mlbam.items():
        entry.setdefault("ops", None)
        entry.setdefault("wrc_plus", None)
        entry.setdefault("war", None)
        entry.setdefault("era", None)
        entry.setdefault("fip", None)
        entry.setdefault("k_per_9", None)
        for target in WAR_COMPONENT_COLS.values():
            entry.setdefault(target, None)
        for target in BASIC_STAT_COLS.values():
            entry.setdefault(target, None)
        for target in PITCHING_STAT_COLS.values():
            entry.setdefault(target, None)
        rows.append(entry)

    log.info("Upserting %d season-stat rows for %s", len(rows), season)
    with connect() as conn, conn.cursor() as cur:
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
