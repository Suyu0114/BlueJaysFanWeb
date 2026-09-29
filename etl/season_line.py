"""MLB Stats API season line -> web_player_season_stats columns.

Shared by pull_season_stats.py (Jays-only leaderboard -> web_player_season_stats)
and pull_player_splits.py (per-club splits -> web_player_team_season_stats) so
the two tables can never map the same API payload differently.

Two quirks the mapping handles:
  * Catcher framing. FanGraphs folds framing runs into `Fld`; the API's
    `fielding` excludes them while its `rar` / `war` include them. We store
    war_fielding = rar - (batting + baseRunning + positional + wLeague +
    replacement), which reproduces FanGraphs' Fld and keeps the WarBreakdown
    chart reconciling exactly to RAR.
  * No WPA in the API, so `wpa` is not a mapped column.
"""

from __future__ import annotations

# API stat key -> column. Rate stats arrive as strings ('.292', '3.59'); IP
# stays in baseball notation ('170.1' = 170 1/3), same as the FanGraphs export
# did -- the web layer formats it.
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


def num(v) -> float | None:
    """API numbers come as int, float or string; '-.--' / '.---' mean undefined."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def rate(n, d) -> float | None:
    """Stored as a raw fraction (0.245), matching the FanGraphs K% / BB% export."""
    n, d = num(n), num(d)
    return n / d if n is not None and d else None


def _war_fielding(s: dict) -> float | None:
    rar = num(s.get("rar"))
    parts = [num(s.get(k)) for k in NON_FIELDING_COMPONENTS]
    if rar is None or any(p is None for p in parts):
        return num(s.get("fielding"))
    return rar - sum(parts)


def has_batting(hitting: dict | None) -> bool:
    # Pitchers who never batted still get a hitting split (PA 0, WAR 0.0);
    # storing it would give them an OPS row and flip the overview to batter.
    return bool(hitting and hitting.get("plateAppearances"))


def to_row(hitting: dict | None, pitching: dict | None) -> dict | None:
    """Map raw (season + sabermetrics merged) API stat dicts to STAT_COLS.

    Returns None when there is nothing to store (no PA and no pitching line).
    """
    use_bat = has_batting(hitting)
    if not use_bat and not pitching:
        return None
    row: dict = {c: None for c in STAT_COLS}
    if use_bat:
        for api_key, col in BATTING_COLS.items():
            row[col] = num(hitting.get(api_key))
        row["war_fielding"] = _war_fielding(hitting)
        row["war"] = num(hitting.get("war"))
    if pitching:
        for api_key, col in PITCHING_COLS.items():
            row[col] = num(pitching.get(api_key))
        row["k_pct"] = rate(pitching.get("strikeOuts"), pitching.get("battersFaced"))
        row["bb_pct"] = rate(pitching.get("baseOnBalls"), pitching.get("battersFaced"))
        # Two-way players (incl. position players in mop-up duty): WAR may
        # already be set from batting; sum, as FanGraphs' player total does.
        pit_war = num(pitching.get("war"))
        if pit_war is not None:
            row["war"] = (row["war"] or 0.0) + pit_war
    return row
