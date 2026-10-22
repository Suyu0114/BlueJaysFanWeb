"""2026 World Series preview pack (Brewers vs Rays) -> reports/world-series-2026/
(git-ignored). Research pack for the preview article; SELECT-only on the DB.

Usage:
    python etl/world_series_preview.py

Neither club is the Jays, so their players are in no web_ table. Team-level
numbers come from the all-30-club views the site reads (022 / 025), so the
article's live figures and this pack agree. Player and postseason numbers come
straight from the MLB Stats API (season_line.py mapping, so wRC+ / Off / Def /
WAR match the site's definitions) and Baseball Savant, and go to CSV only:
writing them into web_statcast_events / web_player_* would leak other clubs
into the Jays-only tables and shift the site's league reference rates.

Writes:
    README.md         freeze time, sources, definitions, caveats
    teams.md / .csv   both clubs' 2026 regular season vs MLB average + 30-club rank
    positions.md      batting by position vs MLB (025 view) + who played there
    trends.md         2022-2026 record / run diff / wRC+ / FIP, TOR / TB / MIL
    postseason.md     both clubs' 2026 postseason games + team lines, WS schedule
    roster.csv        both active rosters: 2026 full-MLB line, postseason line,
                      Savant, OAA, 2026 clubs, former-Jay flag
    arsenal.csv       roster pitchers' 2026 pitch run values (Savant)
    vs_jays.md        Jays vs TB / MIL: records 2022-2026, 2026 games, box-score
                      lines, the pitchers the Jays saw most
    former_jays.md    roster players with an MLB game for Toronto

Re-run before Game 1: the World Series rosters are filed that morning and the
probable starters appear in the schedule.
"""

from __future__ import annotations

import csv
import logging
import sys
import warnings
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from mlb_api import (
    PEOPLE_URL,
    SCHEDULE_URL,
    SEASON_TOTAL,
    TEAMS_URL,
    _get_json,
    fetch_active_roster,
    fetch_player_season_splits,
    fetch_player_team_dates,
    fetch_schedule,
    fetch_team_position_splits,
    fetch_teams,
)
from season_line import has_batting, rate, to_row
from season_report import (  # also loads .env and the db module
    TEAM_FMT,
    TEAM_GROUPS,
    TEAM_METRICS,
    batter_group,
    connect,
    md_table,
    num,
    ordinal,
    pct,
    q,
    r3,
    signed,
)

from pybaseball import (
    statcast_batter_exitvelo_barrels,
    statcast_batter_expected_stats,
    statcast_batter_percentile_ranks,
    statcast_pitcher_arsenal_stats,
    statcast_pitcher_percentile_ranks,
)

warnings.filterwarnings("ignore", category=FutureWarning)
log = logging.getLogger("world_series_preview")

SEASON = 2026
JAYS = 141
CLUBS = {158: "MIL", 139: "TB"}  # NL champion first: home field in the World Series
TREND_SEASONS = [2022, 2023, 2024, 2025, 2026]
POSTSEASON_TYPES = ("F", "D", "L", "W")
ROUND = {"F": "Wild Card", "D": "Division Series", "L": "LCS", "W": "World Series"}
POSITION_ORDER = ["C", "1B", "2B", "3B", "SS", "OF", "DH"]
OUT_DIR = Path(__file__).resolve().parent.parent / "reports" / f"world-series-{SEASON}"

HITS = ("single", "double", "triple", "home_run")
STRIKEOUTS = ("strikeout", "strikeout_double_play")
WALKS = ("walk", "intent_walk")


def club_rank(clubs: list[dict], row: dict, key: str) -> str:
    rank = row.get(f"{key}_rank")
    if rank is None:
        return ""
    tied = sum(1 for c in clubs if c.get(f"{key}_rank") == rank) > 1
    return f" ({'T-' if tied else ''}{ordinal(rank)})"


# ---------------------------------------------------------------------------
# DB: team level (all 30 clubs are loaded)
# ---------------------------------------------------------------------------


def teams_md(conn) -> tuple[str, list[dict]]:
    clubs = q(conn, "select * from web_v_team_season where season = %(s)s", {"s": SEASON})
    mlb = q(conn, "select * from web_v_mlb_season where season = %(s)s", {"s": SEASON})[0]
    by = {c["team_id"]: c for c in clubs}
    stand = {r["team_id"]: r for r in q(conn, """
        select team_id, division_name, division_rank, home_w, home_l, away_w, away_l
        from web_standings where season = %(s)s and team_id = any(%(t)s)""",
        {"s": SEASON, "t": list(CLUBS)})}
    names = list(CLUBS.values())

    rec = []
    for label, cell in [
        ("W-L", lambda c, s: f"{c['w']}-{c['l']}"),
        ("Expected W-L (x-W/L)", lambda c, s: f"{c['x_w']}-{c['x_l']}"),
        ("Luck (W − xW)", lambda c, s: signed(c["luck"], 0)),
        ("Run diff", lambda c, s: signed(c["run_diff"], 0) + club_rank(clubs, c, "run_diff")),
        ("Offense runs vs avg", lambda c, s: signed(c["offense_runs"], 0)),
        ("Run prevention vs avg", lambda c, s: signed(c["prevention_runs"], 0)),
        ("Division finish", lambda c, s: f"{ordinal(s['division_rank'])}, {s['division_name']}"),
        ("Home / road", lambda c, s: f"{s['home_w']}-{s['home_l']} / {s['away_w']}-{s['away_l']}"),
    ]:
        rec.append([label, *(cell(by[t], stand[t]) for t in CLUBS)])

    parts = [f"""# {SEASON} regular season — {' vs '.join(names)} vs MLB

Read from the migration-022 views (`web_v_team_season`, `web_v_mlb_season`), the same
rows the site's team modules read. Cell = value (MLB rank among 30; **1st = best**,
lowest for K%, ERA, RA/G …; `T-` = tied). MLB average = league totals turned into a
rate. Team wRC+ / WAR = the club's players (FanGraphs data licensed to MLB).

## Record
""", md_table(["", *names], rec),
        "\nOffense + run prevention = run differential vs an average MLB team (~10 runs ≈ 1 win)."]

    csv_rows = []
    for group, title in TEAM_GROUPS:
        rows = []
        for key, label, g, fmt in TEAM_METRICS:
            if g != group:
                continue
            show = TEAM_FMT[fmt]
            rows.append([label, *(show(by[t].get(key)) + club_rank(clubs, by[t], key) for t in CLUBS),
                         show(mlb.get(key))])
            csv_rows.append({"group": group, "metric": key, "label": label, "mlb_avg": mlb.get(key)}
                            | {f"{a}": by[t].get(key) for t, a in CLUBS.items()}
                            | {f"{a}_rank": by[t].get(f"{key}_rank") for t, a in CLUBS.items()})
        parts.append(f"\n## {title}\n")
        parts.append(md_table(["", *names, "MLB avg"], rows))
    return "\n".join(parts) + "\n", csv_rows


def positions_md(conn) -> str:
    view = q(conn, "select * from web_v_team_position where season = %(s)s", {"s": SEASON})
    by = {(r["team_id"], r["pos_group"]): r for r in view}

    def cell(t, g, key, fmt):
        r = by.get((t, g))
        if r is None:
            return "–"
        rank = r.get(f"{key}_rank")
        tie = "T-" if r.get(f"{key}_tied") else ""
        return fmt(r[key]) + (f" ({tie}{ordinal(rank)})" if rank else "")

    rows = [[g, *(cell(t, g, "ops", r3) + " · " + cell(t, g, "hr", lambda v: num(v, 0)) for t in CLUBS),
             r3(by[(0, g)]["ops"]) + " · " + num(by[(0, g)]["hr"], 1)] for g in POSITION_ORDER]
    parts = [f"""# {SEASON} batting by position — {' vs '.join(CLUBS.values())} vs MLB

The 025 view (`web_v_team_position`) — the site's PositionVsMlb module. Cell = OPS
(rank among 30) · HR (rank). MLB = OPS from summed counts · HR per club. Groups:
OF = LF+CF+RF, DH = DH+PH+P (batting while playing that position, not each
player's primary position).
""", md_table(["Pos", *CLUBS.values(), "MLB"], rows)]

    # Who made up each group: the API's per-player position splits (counts only).
    ids = set()
    splits = {t: fetch_team_position_splits(SEASON, t) for t in CLUBS}
    for rows_ in splits.values():
        ids |= {r["mlbam_id"] for r in rows_}
    who = person_names(ids)
    for t, abbr in CLUBS.items():
        groups: dict[str, dict[int, dict]] = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
        for r in splits[t]:
            acc = groups[batter_group(r["position"])][r["mlbam_id"]]
            for k in ("pa", "ab", "h", "hr", "bb", "hbp", "sf", "tb"):
                acc[k] += r.get(k) or 0
        lines = []
        for g in POSITION_ORDER:
            players = sorted(groups[g].items(), key=lambda kv: -kv[1]["pa"])
            total = sum(p["pa"] for _, p in players)
            top = []
            for pid, p in players[:4]:
                obp = (p["h"] + p["bb"] + p["hbp"]) / max(p["ab"] + p["bb"] + p["hbp"] + p["sf"], 1)
                slg = p["tb"] / max(p["ab"], 1)
                top.append(f"{who.get(pid, pid)} {p['pa']} PA ({p['pa'] / max(total, 1):.0%}), "
                           f"{p['hr']} HR, {r3(obp + slg)} OPS")
            lines.append(f"- **{g}** ({total} PA): " + "; ".join(top))
        parts.append(f"\n## {abbr}: who played there (top 4 by PA at the position)\n")
        parts.append("\n".join(lines))
    parts.append("\nPer-player OPS here is from the position split's counts; the view's group "
                 "OPS above is the number to quote.")
    return "\n".join(parts) + "\n"


def trends_md(conn) -> str:
    rows = q(conn, """
        select season, team_id, w, l, x_w, x_l, run_diff, run_diff_rank, wrc_plus, wrc_plus_rank,
               fip, fip_rank, oaa, oaa_rank
        from web_v_team_season where season = any(%(s)s) and team_id = any(%(t)s)""",
        {"s": TREND_SEASONS, "t": [JAYS, *CLUBS]})
    stand = {(r["season"], r["team_id"]): r for r in q(conn, """
        select season, team_id, division_rank from web_standings
        where season = any(%(s)s) and team_id = any(%(t)s)""", {"s": TREND_SEASONS, "t": [JAYS, *CLUBS]})}
    by = {(r["season"], r["team_id"]): r for r in rows}
    parts = ["# 2022–2026: Blue Jays, Rays, Brewers\n\nRegular season, 022 view. Rank among 30 in brackets.\n"]
    for t, name in [(JAYS, "TOR"), *CLUBS.items()]:
        out = []
        for s in TREND_SEASONS:
            r = by.get((s, t))
            if r is None:
                continue
            out.append([str(s), f"{r['w']}-{r['l']}", f"{r['x_w']}-{r['x_l']}",
                        ordinal(stand[(s, t)]["division_rank"]),
                        f"{signed(r['run_diff'], 0)} ({ordinal(r['run_diff_rank'])})",
                        f"{num(r['wrc_plus'], 0)} ({ordinal(r['wrc_plus_rank'])})",
                        f"{num(r['fip'], 2)} ({ordinal(r['fip_rank'])})",
                        f"{num(r['oaa'], 0)} ({ordinal(r['oaa_rank'])})"])
        parts.append(f"\n## {name}\n")
        parts.append(md_table(["Season", "W-L", "x-W/L", "Div", "Run diff", "wRC+", "FIP", "OAA"], out))
    return "\n".join(parts) + "\n"


def jays_md(conn, who: dict[int, str]) -> str:
    rec = q(conn, """
        select season, opponent_id, count(*) as g,
               sum((jays_score > opp_score)::int) as w, sum((jays_score < opp_score)::int) as l,
               sum(jays_score) as rs, sum(opp_score) as ra
        from web_games
        where opponent_id = any(%(t)s) and game_type = 'R' and is_final
        group by 1, 2 order by 2, 1""", {"t": list(CLUBS)})
    parts = ["# Blue Jays vs the two pennant winners\n\nRegular season, `web_games` (Jays games only).\n",
             md_table(["Opponent", "Season", "W-L", "RS-RA"],
                      [[CLUBS[r["opponent_id"]], str(r["season"]), f"{r['w']}-{r['l']}",
                        f"{r['rs']}-{r['ra']}"] for r in rec])]

    for t, abbr in CLUBS.items():
        games = q(conn, """
            select game_pk, game_date, is_home, jays_score, opp_score
            from web_games where season = %(s)s and opponent_id = %(t)s and game_type = 'R' and is_final
            order by game_date, game_number""", {"s": SEASON, "t": t})
        pks = [g["game_pk"] for g in games]
        parts.append(f"\n## {SEASON} vs {abbr}: {len(games)} games\n")
        parts.append(md_table(["Date", "", "Score (TOR-opp)", "Result"], [
            [str(g["game_date"]), "home" if g["is_home"] else "@", f"{g['jays_score']}-{g['opp_score']}",
             "W" if g["jays_score"] > g["opp_score"] else "L"] for g in games]))

        bat = q(conn, """
            select sum(pa) pa, sum(ab) ab, sum(h) h, sum(hr) hr, sum(bb) bb, sum(so) so, sum(hbp) hbp
            from web_player_game_stats where game_pk = any(%(p)s) and stat_group = 'batting'""", {"p": pks})[0]
        pit = q(conn, """
            select sum(outs_recorded) outs, sum(er) er, sum(p_so) so, sum(p_bb) bb, sum(p_hr) hr, sum(p_h) h
            from web_player_game_stats where game_pk = any(%(p)s) and stat_group = 'pitching'""", {"p": pks})[0]
        if bat["pa"]:
            parts.append(f"\nJays batting: {bat['pa']} PA, AVG {r3(bat['h'] / bat['ab'])}, {bat['hr']} HR, "
                         f"K% {pct(bat['so'] / bat['pa'])}, BB% {pct(bat['bb'] / bat['pa'])}.")
        if pit["outs"]:
            parts.append(f"Jays pitching: {pit['outs'] // 3}.{pit['outs'] % 3} IP, ERA "
                         f"{num(27 * pit['er'] / pit['outs'], 2)}, {pit['so']} K, {pit['bb']} BB, {pit['hr']} HR allowed.")

        # Opposing pitchers = Statcast pitchers in these games who are not in the Jays box score.
        seen = q(conn, """
            select e.pitcher_id, count(*) pitches,
                   count(*) filter (where e.event is not null) pa,
                   count(*) filter (where e.event = any(%(k)s)) k,
                   count(*) filter (where e.event = any(%(bb)s)) bb,
                   count(*) filter (where e.event = any(%(h)s)) h,
                   count(*) filter (where e.event = 'home_run') hr
            from web_statcast_events e
            where e.game_pk = any(%(p)s)
              and not exists (select 1 from web_player_game_stats b
                              where b.game_pk = e.game_pk and b.mlbam_id = e.pitcher_id)
            group by 1 order by 2 desc limit 8""",
            {"p": pks, "k": list(STRIKEOUTS), "bb": list(WALKS), "h": list(HITS)})
        who.update(person_names({r["pitcher_id"] for r in seen} - set(who)))
        parts.append(f"\n{abbr} pitchers the Jays saw most (Statcast, pitches thrown to Jays batters):\n")
        parts.append(md_table(["Pitcher", "Pitches", "PA", "H", "HR", "K", "BB"], [
            [who.get(r["pitcher_id"], str(r["pitcher_id"])), r["pitches"], r["pa"], r["h"], r["hr"],
             r["k"], r["bb"]] for r in seen]))
    return "\n".join(parts) + "\n"


def oaa_by_player(conn, ids: list[int]) -> dict[int, dict]:
    rows = q(conn, """
        select mlbam_id, sum(oaa) oaa, sum(frv) frv, string_agg(position || ' ' || oaa, ', ' order by oaa desc) by_pos
        from web_fielding_frv where season = %(s)s and mlbam_id = any(%(i)s) group by 1""",
        {"s": SEASON, "i": ids})
    return {r["mlbam_id"]: r for r in rows}


# ---------------------------------------------------------------------------
# MLB Stats API: rosters, player lines, postseason
# ---------------------------------------------------------------------------


def person_names(ids) -> dict[int, str]:
    ids, out = sorted(ids), {}
    for i in range(0, len(ids), 100):
        data = _get_json(PEOPLE_URL, {"personIds": ",".join(map(str, ids[i:i + 100]))})
        out |= {p["id"]: p["fullName"] for p in data.get("people", [])}
    return out


def people(ids: list[int]) -> dict[int, dict]:
    """Bio + MLB year-by-year clubs (for the former-Jay check), one batched call."""
    data = _get_json(PEOPLE_URL, {
        "personIds": ",".join(map(str, ids)),
        "hydrate": "stats(group=[hitting,pitching],type=[yearByYear])",
    })
    out = {}
    for p in data.get("people", []):
        jays_years = sorted({
            int(s["season"]) for block in p.get("stats", []) for s in block.get("splits", [])
            if s.get("team", {}).get("id") == JAYS and s.get("sport", {}).get("id", 1) == 1
        })
        out[p["id"]] = {
            "name": p["fullName"], "age": p.get("currentAge"), "bats": p.get("batSide", {}).get("code"),
            "throws": p.get("pitchHand", {}).get("code"),
            "primary_pos": p.get("primaryPosition", {}).get("abbreviation"), "jays_years": jays_years,
        }
    return out


def postseason_line(pid: int) -> dict[str, dict]:
    data = _get_json(f"{PEOPLE_URL}/{pid}/stats", {
        "stats": "season", "group": "hitting,pitching", "season": SEASON, "gameType": "P"})
    out = {}
    for block in data.get("stats", []):
        for s in block.get("splits", []):
            out[block["group"]["displayName"]] = s["stat"]
    return out


def team_postseason(team_id: int) -> dict[str, dict]:
    data = _get_json(f"{TEAMS_URL}/{team_id}/stats", {
        "stats": "season", "group": "hitting,pitching", "season": SEASON, "gameType": "P"})
    return {b["group"]["displayName"]: (b.get("splits") or [{}])[0].get("stat", {}) for b in data.get("stats", [])}


def team_postseason_roles(team_id: int) -> dict[str, dict]:
    """Starter / reliever postseason lines (= mlb_api.fetch_team_role_splits with gameType P)."""
    data = _get_json(f"{TEAMS_URL}/{team_id}/stats", {
        "stats": "statSplits", "sitCodes": "sp,rp", "group": "pitching", "season": SEASON, "gameType": "P"})
    return {s["split"]["code"]: s["stat"] for b in data.get("stats", []) for s in b.get("splits", [])}


def postseason_md(abbr_of: dict[int, str]) -> str:
    parts = [f"# {SEASON} postseason so far\n\nMLB Stats API (`gameType` F/D/L/W). Not in the DB.\n"]
    for t, abbr in CLUBS.items():
        games = [g for g in fetch_schedule(SEASON, t) if g["game_type"] in POSTSEASON_TYPES
                 and g["abstract_state"] == "Final" and g["home"]["score"] is not None]
        series: dict[tuple[str, int], list] = defaultdict(list)
        rows = []
        for g in games:
            home = g["home"]["id"] == t
            us, them = (g["home"], g["away"]) if home else (g["away"], g["home"])
            opp = abbr_of.get(them["id"], them["name"])
            series[(g["game_type"], them["id"])].append(us["score"] > them["score"])
            rows.append([g["official_date"], ROUND[g["game_type"]], ("vs " if home else "@ ") + opp,
                         f"{us['score']}-{them['score']}", "W" if us["score"] > them["score"] else "L"])
        summary = "; ".join(f"{ROUND[gt]} vs {abbr_of.get(o, o)} {sum(w)}-{len(w) - sum(w)}"
                            for (gt, o), w in series.items())
        line = team_postseason(t)
        h, p = line.get("hitting", {}), line.get("pitching", {})
        parts.append(f"\n## {abbr}: {summary}\n")
        parts.append(md_table(["Date", "Round", "Opponent", "Score", ""], rows))
        parts.append(f"\nBatting: {h.get('gamesPlayed')} G, {h.get('runs')} R "
                     f"({num(int(h.get('runs', 0)) / max(int(h.get('gamesPlayed', 1)), 1), 2)} R/G), "
                     f"{h.get('avg')}/{h.get('obp')}/{h.get('slg')}, {h.get('homeRuns')} HR, "
                     f"{h.get('strikeOuts')} K, {h.get('baseOnBalls')} BB.")
        parts.append(f"Pitching: {p.get('inningsPitched')} IP, ERA {p.get('era')}, WHIP {p.get('whip')}, "
                     f"{p.get('strikeOuts')} K, {p.get('baseOnBalls')} BB, {p.get('homeRuns')} HR, "
                     f"{p.get('runs')} R allowed.")
        for code, role in (("sp", "Starters"), ("rp", "Bullpen")):
            s = team_postseason_roles(t).get(code, {})
            parts.append(f"{role}: {s.get('inningsPitched')} IP, ERA {s.get('era')}, WHIP {s.get('whip')}, "
                         f"{s.get('strikeOuts')} K, {s.get('baseOnBalls')} BB, {s.get('homeRuns')} HR.")

    reg = [g for g in fetch_schedule(SEASON, list(CLUBS)[0]) if g["game_type"] == "R"
           and {g["home"]["id"], g["away"]["id"]} == set(CLUBS) and g["home"]["score"] is not None]
    parts.append(f"\n## {SEASON} regular-season meetings\n")
    parts.append(md_table(["Date", "Away", "Home", "Score (away-home)"], [
        [g["official_date"], abbr_of[g["away"]["id"]], abbr_of[g["home"]["id"]],
         f"{g['away']['score']}-{g['home']['score']}"] for g in reg]))

    ws = _get_json(SCHEDULE_URL, {"sportId": 1, "season": SEASON, "gameType": "W",
                                  "hydrate": "probablePitcher"})
    rows = []
    for d in ws.get("dates", []):
        for g in d["games"]:
            a, h = g["teams"]["away"], g["teams"]["home"]
            rows.append([g.get("description", ""), d["date"], f"{abbr_of[a['team']['id']]} @ {abbr_of[h['team']['id']]}",
                         g.get("venue", {}).get("name", ""),
                         a.get("probablePitcher", {}).get("fullName", "TBD") + " vs "
                         + h.get("probablePitcher", {}).get("fullName", "TBD")])
    parts.append("\n## World Series schedule + probable starters (away vs home)\n")
    parts.append(md_table(["Game", "Date", "Matchup", "Park", "Probables"], rows))
    return "\n".join(parts) + "\n"


# ---------------------------------------------------------------------------
# roster.csv / arsenal.csv
# ---------------------------------------------------------------------------

ROSTER_COLS = [
    "team", "name", "mlbam_id", "roster_pos", "role", "age", "bats", "throws", "clubs_2026", "former_jay",
    # hitters: 2026 regular season, all clubs
    "pa", "avg", "obp", "slg", "ops", "hr", "sb", "k_pct", "bb_pct", "wrc_plus", "off", "def",
    "oaa", "frv", "oaa_by_pos", "xwoba", "woba", "barrel_pct", "hard_hit_pct", "avg_ev",
    "pctl_xwoba", "pctl_chase", "pctl_whiff", "pctl_sprint",
    # pitchers
    "g", "gs", "ip", "era", "fip", "whip", "p_k_pct", "p_bb_pct", "sv", "w", "l",
    "pctl_p_xera", "pctl_p_k", "pctl_p_bb", "pctl_p_whiff", "pctl_p_chase", "pctl_fb_velo",
    "war",
    # 2026 postseason
    "post_g", "post_pa", "post_slash", "post_hr", "post_rbi", "post_ip", "post_era", "post_k", "post_bb", "post_sv",
]


def savant_frames() -> dict:
    log.info("Savant leaderboards (league-wide, five requests)")
    return {
        "bat_pct": statcast_batter_percentile_ranks(SEASON),
        "pit_pct": statcast_pitcher_percentile_ranks(SEASON),
        "xstats": statcast_batter_expected_stats(SEASON, minPA=1),
        "evbrl": statcast_batter_exitvelo_barrels(SEASON, minBBE=1),
        "arsenal": statcast_pitcher_arsenal_stats(SEASON, minPA=1),
    }


def by_player(df) -> dict[int, dict]:
    out = {}
    for rec in df.to_dict("records"):
        out[int(rec["player_id"])] = {k: (None if v != v else v) for k, v in rec.items()}  # NaN -> None
    return out


def rnd(v, d: int):
    return None if v is None else round(float(v), d)


def roster_rows(conn, rosters: dict[int, list[dict]], abbr_of: dict[int, str], sv: dict) -> list[dict]:
    ids = [p["mlbam_id"] for ps in rosters.values() for p in ps]
    bio = people(ids)
    oaa = oaa_by_player(conn, ids)
    bat_pct, pit_pct = by_player(sv["bat_pct"]), by_player(sv["pit_pct"])
    xs, ev = by_player(sv["xstats"]), by_player(sv["evbrl"])
    rows = []
    for t, players in rosters.items():
        for p in players:
            pid, b = p["mlbam_id"], bio.get(p["mlbam_id"], {})
            pitcher = p["position"] == "P"
            splits = fetch_player_season_splits(pid, SEASON)
            total = splits.get(SEASON_TOTAL, {})
            dates = fetch_player_team_dates(pid, SEASON)
            clubs = sorted((c for c in splits if c != SEASON_TOTAL), key=lambda c: dates.get(c, {}).get("first", ""))
            row = {c: None for c in ROSTER_COLS} | {
                "team": CLUBS[t], "name": p["name"], "mlbam_id": pid, "roster_pos": p["position"],
                "role": "P" if pitcher else "H", "age": b.get("age"), "bats": b.get("bats"),
                "throws": b.get("throws"), "clubs_2026": "/".join(abbr_of.get(c, str(c)) for c in clubs),
                "former_jay": ", ".join(map(str, b.get("jays_years", []))) or None,
            }
            hitting = total.get("hitting")
            if not pitcher and has_batting(hitting):
                line = to_row(hitting, None)
                bp, x, e, f = bat_pct.get(pid, {}), xs.get(pid, {}), ev.get(pid, {}), oaa.get(pid, {})
                row |= {
                    "pa": rnd(line["pa"], 0), "avg": rnd(line["avg"], 3), "obp": rnd(line["obp"], 3),
                    "slg": rnd(line["slg"], 3), "ops": rnd(line["ops"], 3), "hr": rnd(line["hr"], 0),
                    "sb": rnd(line["sb"], 0),
                    "k_pct": rnd(100 * rate(hitting.get("strikeOuts"), hitting.get("plateAppearances")), 1),
                    "bb_pct": rnd(100 * rate(hitting.get("baseOnBalls"), hitting.get("plateAppearances")), 1),
                    "wrc_plus": rnd(line["wrc_plus"], 0),
                    # Off = Bat + BsR, Def = Fld + Pos -- the site's player stats table
                    "off": rnd((line["war_batting"] or 0) + (line["war_baserunning"] or 0), 1),
                    "def": rnd((line["war_fielding"] or 0) + (line["war_positional"] or 0), 1),
                    "war": rnd(line["war"], 1),
                    "oaa": f.get("oaa"), "frv": f.get("frv"), "oaa_by_pos": f.get("by_pos"),
                    "xwoba": rnd(x.get("est_woba"), 3), "woba": rnd(x.get("woba"), 3),
                    "barrel_pct": rnd(e.get("brl_percent"), 1), "hard_hit_pct": rnd(e.get("ev95percent"), 1),
                    "avg_ev": rnd(e.get("avg_hit_speed"), 1),
                    "pctl_xwoba": bp.get("xwoba"), "pctl_chase": bp.get("chase_percent"),
                    "pctl_whiff": bp.get("whiff_percent"), "pctl_sprint": bp.get("sprint_speed"),
                }
            pitching = total.get("pitching")
            if pitcher and pitching:
                line, pp = to_row(None, pitching), pit_pct.get(pid, {})
                row |= {
                    "g": pitching.get("gamesPlayed"), "gs": rnd(line["gs"], 0), "ip": pitching.get("inningsPitched"),
                    "era": rnd(line["era"], 2), "fip": rnd(line["fip"], 2), "whip": rnd(line["whip"], 2),
                    "p_k_pct": rnd(100 * line["k_pct"], 1) if line["k_pct"] is not None else None,
                    "p_bb_pct": rnd(100 * line["bb_pct"], 1) if line["bb_pct"] is not None else None,
                    "sv": rnd(line["sv"], 0), "w": rnd(line["w"], 0), "l": rnd(line["l"], 0),
                    "war": rnd(line["war"], 1),
                    "pctl_p_xera": pp.get("xera"), "pctl_p_k": pp.get("k_percent"),
                    "pctl_p_bb": pp.get("bb_percent"), "pctl_p_whiff": pp.get("whiff_percent"),
                    "pctl_p_chase": pp.get("chase_percent"), "pctl_fb_velo": pp.get("fb_velocity"),
                }
            post = postseason_line(pid)
            ph, pp_ = post.get("hitting"), post.get("pitching")
            if not pitcher and ph and ph.get("plateAppearances"):
                row |= {"post_g": ph.get("gamesPlayed"), "post_pa": ph.get("plateAppearances"),
                        "post_slash": f"{ph.get('avg')}/{ph.get('obp')}/{ph.get('slg')}",
                        "post_hr": ph.get("homeRuns"), "post_rbi": ph.get("rbi")}
            if pitcher and pp_:
                row |= {"post_g": pp_.get("gamesPlayed"), "post_ip": pp_.get("inningsPitched"),
                        "post_era": pp_.get("era"), "post_k": pp_.get("strikeOuts"),
                        "post_bb": pp_.get("baseOnBalls"), "post_sv": pp_.get("saves")}
            rows.append(row)
        log.info("%s: %d players", CLUBS[t], len(players))
    return rows


ARSENAL_COLS = ["team", "name", "mlbam_id", "pitch_type", "pitch_name", "pitches", "usage", "run_value",
                "run_value_per_100", "whiff_pct", "put_away", "ba", "slg", "woba", "xwoba", "hard_hit_pct"]


def arsenal_rows(df, roster: list[dict]) -> list[dict]:
    team_of = {r["mlbam_id"]: r for r in roster if r["role"] == "P"}
    rows = []
    for rec in df.to_dict("records"):
        pid = int(rec["player_id"])
        if pid not in team_of:
            continue
        g = lambda k: None if rec.get(k) != rec.get(k) else rec.get(k)  # noqa: E731  NaN -> None
        rows.append({"team": team_of[pid]["team"], "name": team_of[pid]["name"], "mlbam_id": pid,
                     "pitch_type": g("pitch_type"), "pitch_name": g("pitch_name"), "pitches": g("pitches"),
                     "usage": g("pitch_usage"), "run_value": g("run_value"),
                     "run_value_per_100": g("run_value_per_100"), "whiff_pct": g("whiff_percent"),
                     "put_away": g("put_away"), "ba": g("ba"), "slg": g("slg"), "woba": g("woba"),
                     "xwoba": g("est_woba"), "hard_hit_pct": g("hard_hit_percent")})
    return sorted(rows, key=lambda r: (r["team"], r["name"], -(r["pitches"] or 0)))


def former_jays_md(roster: list[dict]) -> str:
    rows = [[r["team"], r["name"], r["roster_pos"], r["former_jay"]] for r in roster if r["former_jay"]]
    body = md_table(["Team", "Player", "Pos", "MLB seasons with TOR"], rows) if rows else "None."
    # Not web_players: the Statcast pulls also store the opponents the Jays faced.
    return ("# Former Blue Jays on the World Series rosters\n\nMLB seasons with Toronto (API year-by-year "
            "splits; minor-league time in the organization is not counted).\n\n" + body + "\n")


def write_csv(path: Path, cols: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


README = """# {season} World Series preview pack: {matchup}

Generated {now} by `etl/world_series_preview.py`. SELECT-only on the DB; re-run on
Game 1 day for the filed World Series rosters and the probable starters.

## Sources
- **Team numbers** (`teams.md`, `positions.md`, `trends.md`, `vs_jays.md`): the site's
  database — the migration-022 / 025 views, `web_standings`, `web_games`,
  `web_player_game_stats`, `web_statcast_events`. Same rows the live figures read.
- **Player lines** (`roster.csv`): MLB Stats API, regular season, all clubs (season
  total), mapped through `etl/season_line.py`. wRC+ / Off / Def / WAR are FanGraphs
  data licensed to MLB, same definitions as the site's player tables.
- **Postseason** (`postseason.md`, `post_*` columns): MLB Stats API `gameType=P`.
- **Statcast** (`roster.csv` xwOBA / Barrel% / percentiles, `arsenal.csv`): Baseball
  Savant leaderboards via pybaseball, MLB-wide season values. Blank percentile =
  not qualified. OAA / FRV: `web_fielding_frv` (all MLB fielders).
- **Rosters**: `rosterType=active` on the run date ({roster_note}).

## Definitions
- Percentiles: 100 = best for every metric (Savant).
- `k_pct`, `bb_pct`, `barrel_pct`, `hard_hit_pct`, `usage`, `whiff_pct`: percent units.
- Pitch `run_value`: positive = good for the pitcher (Savant's sign, verified on the site).
- IP is baseball notation (`170.1` = 170⅓).
- `off` = batting + baserunning runs; `def` = fielding + positional runs.

## Caveats
- Postseason samples are tiny (7-9 games); treat rates as colour, not evidence.
- 2026 Chase% / Zone% changed definition vs 2025 (Savant); comparisons inside 2026
  are fine, a 2025 → 2026 delta is not.
- Non-Jays team wRC+ / WAR come from the per-club leaderboard with no per-player
  re-check (DATA_MODEL known gap #7); tiny drift is possible.
- Not covered by any free source here: odds, injuries, team Chase% (needs
  league-wide Statcast). Cite outside sources for those.
"""


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    abbr_of = {t["id"]: t["abbreviation"] for t in fetch_teams(SEASON)}
    rosters = {t: fetch_active_roster(t) for t in CLUBS}
    sv = savant_frames()
    with connect() as conn:
        conn.read_only = True
        team_text, team_csv = teams_md(conn)
        roster = roster_rows(conn, rosters, abbr_of, sv)
        who = {r["mlbam_id"]: r["name"] for r in roster}
        files = {
            "teams.md": team_text,
            "positions.md": positions_md(conn),
            "trends.md": trends_md(conn),
            "vs_jays.md": jays_md(conn, who),
        }
    files["postseason.md"] = postseason_md(abbr_of)
    files["former_jays.md"] = former_jays_md(roster)
    files["README.md"] = README.format(
        season=SEASON, matchup=" vs ".join(CLUBS.values()), now=datetime.now().strftime("%Y-%m-%d %H:%M"),
        roster_note=", ".join(f"{CLUBS[t]} {len(p)}" for t, p in rosters.items()))
    for name, text in files.items():
        (OUT_DIR / name).write_text(text, encoding="utf-8")
    write_csv(OUT_DIR / "teams.csv", ["group", "metric", "label", *[f"{a}{s}" for a in CLUBS.values()
                                       for s in ("", "_rank")], "mlb_avg"], team_csv)
    write_csv(OUT_DIR / "roster.csv", ROSTER_COLS, roster)
    write_csv(OUT_DIR / "arsenal.csv", ARSENAL_COLS, arsenal_rows(sv["arsenal"], roster))
    log.info("Wrote %d files to %s", len(files) + 3, OUT_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
