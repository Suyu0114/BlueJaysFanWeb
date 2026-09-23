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

Two quirks the mapping handles:
  * Catcher framing. FanGraphs folds framing runs into `Fld`; the API's
    `fielding` excludes them while its `rar` / `war` include them. We store
    war_fielding = rar - (batting + baseRunning + positional + wLeague +
    replacement), which reproduces FanGraphs' Fld and keeps the WarBreakdown
    chart reconciling exactly to RAR.
  * No WPA in the API. `wpa` is left out of the upsert, so values from the old
    CSV imports survive and newer seasons stay NULL (not rendered anywhere).
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

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_season_stats")

# API stat key -> web_player_season_stats column. Rate stats arrive as strings
# ('.292', '3.59'); IP stays in baseball notation ('170.1' = 170 1/3), same as
# the FanGraphs export did -- the web layer formats it.
BATTING_COLS = {
    "ops":              "ops",
    "wRcPlus":          "wrc_plus",
    "batting":          "war_batting",
    "baseRunning":      "war_baserunning",
    "positional":       "war_positional",
    "wLeague":          "war_league",
    "replacement":      "war_replacement",
    "rar":              "rar",
    "avg":              "avg",
    "obp":              "obp",
    "slg":              "slg",
    "homeRuns":         "hr",
    "rbi":              "rbi",
    "stolenBases":      "sb",
    "plateAppearances": "pa",
}
PITCHING_COLS = {
    "era":               "era",
    "fip":               "fip",
    "strikeoutsPer9Inn": "k_per_9",
    "wins":              "w",
    "losses":            "l",
    "saves":             "sv",
    "gamesStarted":      "gs",
    "inningsPitched":    "ip",
    "whip":              "whip",
}
# Summed against RAR to derive war_fielding (see module docstring).
NON_FIELDING_COMPONENTS = ("batting", "baseRunning", "positional", "wLeague", "replacement")

STAT_COLS = [
    "ops", "wrc_plus", "war", "era", "fip", "k_per_9",
    "war_batting", "war_baserunning", "war_fielding", "war_positional",
    "war_league", "war_replacement", "rar",
    "avg", "obp", "slg", "hr", "rbi", "sb", "pa",
    "w", "l", "sv", "gs", "ip", "whip", "k_pct", "bb_pct",
]

UPSERT_SQL = f"""
    insert into web_player_season_stats (mlbam_id, season, {", ".join(STAT_COLS)})
    values (%(mlbam_id)s, %(season)s, {", ".join(f"%({c})s" for c in STAT_COLS)})
    on conflict (mlbam_id, season) do update set
      {", ".join(f"{c} = coalesce(excluded.{c}, web_player_season_stats.{c})" for c in STAT_COLS)},
      updated_at = now()
"""


def _num(v) -> float | None:
    """API numbers come as int, float or string; '-.--' / '.---' mean undefined."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _war_fielding(s: dict) -> float | None:
    rar = _num(s.get("rar"))
    parts = [_num(s.get(k)) for k in NON_FIELDING_COMPONENTS]
    if rar is None or any(p is None for p in parts):
        return _num(s.get("fielding"))
    return rar - sum(parts)


def _rate(num, den) -> float | None:
    """Stored as a raw fraction (0.245), matching the FanGraphs K% / BB% export."""
    n, d = _num(num), _num(den)
    return n / d if n is not None and d else None


def run(season: int) -> None:
    batting = fetch_team_season_stats(season, "hitting")
    pitching = fetch_team_season_stats(season, "pitching")
    log.info("%s: API returned %d hitting / %d pitching lines",
             season, len(batting), len(pitching))

    by_mlbam: dict[int, dict] = {}
    names: dict[int, str] = {}

    skipped = 0
    for rec in batting:
        s = rec["stat"]
        # Pitchers who never batted still get a hitting split (PA 0, WAR 0.0);
        # storing it would give them an OPS row and flip the overview to batter.
        if not s.get("plateAppearances"):
            skipped += 1
            continue
        entry = by_mlbam.setdefault(rec["mlbam_id"], {"mlbam_id": rec["mlbam_id"], "season": season})
        names[rec["mlbam_id"]] = rec["name"]
        for api_key, col in BATTING_COLS.items():
            entry[col] = _num(s.get(api_key))
        entry["war_fielding"] = _war_fielding(s)
        entry["war"] = _num(s.get("war"))

    for rec in pitching:
        s = rec["stat"]
        entry = by_mlbam.setdefault(rec["mlbam_id"], {"mlbam_id": rec["mlbam_id"], "season": season})
        names[rec["mlbam_id"]] = rec["name"]
        for api_key, col in PITCHING_COLS.items():
            entry[col] = _num(s.get(api_key))
        entry["k_pct"] = _rate(s.get("strikeOuts"), s.get("battersFaced"))
        entry["bb_pct"] = _rate(s.get("baseOnBalls"), s.get("battersFaced"))
        # Two-way players (incl. position players in mop-up duty): WAR may
        # already be set from batting; sum, as FanGraphs' player total does.
        pit_war = _num(s.get("war"))
        if pit_war is not None:
            entry["war"] = (entry.get("war") or 0.0) + pit_war

    if skipped:
        log.info("Skipped %d hitting line(s) with 0 PA", skipped)

    rows = [{c: None for c in STAT_COLS} | entry for entry in by_mlbam.values()]
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
