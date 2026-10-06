"""Season-review article data pack (P12 M1). SELECT-only: never writes the DB.

Usage:
    python etl/season_report.py --season 2026 --vs 2025

Writes reports/season-review-<season>/ (git-ignored):
    README.md          freeze time, scopes, thresholds, definitions, caveats
    team.md            team season, regular season only, both seasons + delta
    batters.csv / .md  every Jays batter either season (Jays scope) + delta for the cohort
    pitchers.csv / .md every Jays pitcher either season (Jays scope) + delta for the cohort
    pitchers_arsenal.csv  per pitch type per season (Jays scope), NEW / DROPPED flags
    movers.md          biggest risers / fallers in the both-seasons cohort
    roster_moves.md    newcomers / mid-season arrivals / departures, full-MLB lines per club
    league_context.md  reference rates from every pitch on file (true league averages: M6)
    team_trends.md / .csv  P13: latest five seasons, every team stat with the MLB
                       average + 30-club rank, read from the migration-022 views
    positions.md       value by position (HR / OPS / Off / WAR per group, the season
                       page's chart) + each position vs MLB (the 025 view) + who made it

Metric definitions are NOT re-implemented here: discipline and batted-ball numbers
come from the migration-015 views (web_v_*), the same ones the site reads. The
only local aggregates are the per-pitch arsenal, which mirrors
web/lib/pitch-arsenal.ts::buildArsenal (swing/whiff flags from web_v_pitch_scoped,
xwOBAcon gated on description = 'hit_into_play'), and value by position, which
mirrors web/lib/team-season.ts::valueByPosition (PA-share Off / WAR, exact HR / OPS).
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from psycopg.rows import dict_row  # noqa: E402

from db import connect  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("season_report")

JAYS = 141
AL_EAST = 201
# D12: "same player, both seasons" = at least this much work as a Jay in EACH season.
MIN_PA = 150
MIN_IP = 40
NEW_PITCH_USAGE = 0.05  # NEW / DROPPED = usage 0 in one season, >= 5% in the other
FASTBALLS = ("FF", "FT", "SI", "FC")  # = pitch-arsenal.ts FASTBALL_FAMILY

# ---------------------------------------------------------------------------
# formatting
# ---------------------------------------------------------------------------


def f(v) -> float | None:
    return None if v is None else float(v)


def r3(v) -> str:  # .292
    if v is None:
        return "–"
    s = f"{float(v):.3f}"
    return s[1:] if s.startswith("0.") else s.replace("-0.", "-.")


def pct(v, d: int = 1) -> str:  # 0.245 -> 24.5%
    return "–" if v is None else f"{100 * float(v):.{d}f}%"


def num(v, d: int = 0) -> str:
    return "–" if v is None else f"{float(v):.{d}f}"


def ip(v) -> str:  # baseball notation stays as-is: 170.1
    return "–" if v is None else f"{float(v):.1f}"


def signed(v, d: int = 1, scale: float = 1.0, suffix: str = "") -> str:
    if v is None:
        return "–"
    x = float(v) * scale
    return f"{x:+.{d}f}{suffix}"


def signed_r3(v) -> str:  # +.052 / -.160
    if v is None:
        return "–"
    return ("+" if v >= 0 else "-") + r3(abs(v))


def ordinal(n) -> str:
    n = int(n)
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def delta(a, b):
    return None if a is None or b is None else float(a) - float(b)


def md_table(headers: list[str], rows: list[list[str]]) -> str:
    out = ["| " + " | ".join(headers) + " |",
           "|" + "|".join("---" if i == 0 else "---:" for i in range(len(headers))) + "|"]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(out)


def q(conn, sql: str, params=None) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params or {})
        return cur.fetchall()


# ---------------------------------------------------------------------------
# team
# ---------------------------------------------------------------------------


def team_section(conn, seasons: list[int]) -> tuple[str, dict]:
    stand = {s: {r["team_id"]: r for r in q(conn, "select * from web_standings where season = %(s)s", {"s": s})}
             for s in seasons}
    games = {s: q(conn, """
        select game_date, game_number, is_home, opponent_id, jays_score, opp_score, result
        from web_games where season = %(s)s and game_type = 'R' and is_final
        order by game_date, game_number""", {"s": s}) for s in seasons}

    def rec(gs):
        w = sum(1 for g in gs if g["result"] == "W")
        l = sum(1 for g in gs if g["result"] == "L")
        return w, l

    def wl(gs) -> str:
        w, l = rec(gs)
        return f"{w}-{l}" if gs else "–"

    stats: dict[int, dict] = {}
    for s in seasons:
        gs, st, me = games[s], stand[s], stand[s].get(JAYS, {})
        margin = lambda g: g["jays_score"] - g["opp_score"]  # noqa: E731
        opp_pct = lambda g: float(st.get(g["opponent_id"], {}).get("pct") or 0)  # noqa: E731
        streaks = {"W": (0, None, None), "L": (0, None, None)}
        cur_res, cur_len, cur_start = None, 0, None
        above, best, worst = 0, (0, None), (0, None)
        for g in gs:
            if g["result"] == cur_res:
                cur_len += 1
            else:
                cur_res, cur_len, cur_start = g["result"], 1, g["game_date"]
            if cur_res in streaks and cur_len > streaks[cur_res][0]:
                streaks[cur_res] = (cur_len, cur_start, g["game_date"])
            above += 1 if g["result"] == "W" else -1 if g["result"] == "L" else 0
            if above > best[0]:
                best = (above, g["game_date"])
            if above < worst[0]:
                worst = (above, g["game_date"])
        # March folds into April and October into September, as on the season page
        # (web/lib/team-season.ts::monthlyRecords) and in MLB's own splits.
        months: dict[str, list] = defaultdict(list)
        for g in gs:
            m = g["game_date"].month
            key = "Mar/Apr" if m <= 4 else "Sep/Oct" if m >= 9 else date(2000, m, 1).strftime("%b")
            months[key].append(g)
        w, l = rec(gs)
        rs = sum(g["jays_score"] for g in gs)
        ra = sum(g["opp_score"] for g in gs)
        stats[s] = {
            "W-L": f"{w}-{l}", "PCT": r3(w / (w + l)) if w + l else "–",
            "RS": rs, "RA": ra, "DIFF": f"{rs - ra:+d}",
            "x-W/L": f"{me.get('x_w')}-{me.get('x_l')}" if me else "–",
            "Division finish": (f"{ordinal(me.get('division_rank'))} in {me.get('division_name')}"
                                f" (GB {me.get('games_back')})") if me else "–",
            "Wild card": (f"rank {me.get('wild_card_rank')} (WCGB {me.get('wc_games_back')})"
                          if me and me.get("wild_card_rank") else "division leader" if me else "–"),
            "Home": wl([g for g in gs if g["is_home"]]),
            "Away": wl([g for g in gs if not g["is_home"]]),
            "One-run games": wl([g for g in gs if abs(margin(g)) == 1]),
            "Blowouts (≥5 runs)": wl([g for g in gs if abs(margin(g)) >= 5]),
            "vs AL East": wl([g for g in gs if st.get(g["opponent_id"], {}).get("division_id") == AL_EAST]),
            "vs teams ≥ .500": wl([g for g in gs if opp_pct(g) >= 0.5]),
            "vs teams < .500": wl([g for g in gs if opp_pct(g) < 0.5]),
            "Longest win streak": (f"{streaks['W'][0]} ({streaks['W'][1]:%b %d}–{streaks['W'][2]:%b %d})"
                                   if streaks["W"][1] else "–"),
            "Longest losing streak": (f"{streaks['L'][0]} ({streaks['L'][1]:%b %d}–{streaks['L'][2]:%b %d})"
                                      if streaks["L"][1] else "–"),
            "Most games above .500": f"{best[0]:+d} ({best[1]:%b %d})" if best[1] else "never above",
            "Most games below .500": f"{worst[0]:+d} ({worst[1]:%b %d})" if worst[1] else "never below",
            "_months": dict(months),
            "_check": (w, l, me.get("w"), me.get("l"), me.get("runs_scored"), me.get("runs_allowed"), rs, ra),
        }

    s, vs = seasons
    keys = [k for k in stats[s] if not k.startswith("_")]
    rows = []
    for k in keys:
        a, b = stats[s][k], stats[vs][k]
        d = ""
        if k in ("RS", "RA"):
            d = f"{a - b:+d}"
        elif k == "W-L":
            d = f"{int(a.split('-')[0]) - int(b.split('-')[0]):+d} W"
        rows.append([k, a, b, d])
    month_keys = ["Mar/Apr", "May", "Jun", "Jul", "Aug", "Sep/Oct"]

    def month_cells(yr: int, m: str) -> list[str]:
        gs = stats[yr]["_months"].get(m)
        if not gs:
            return ["–"] * 4
        rs = sum(g["jays_score"] for g in gs)
        ra = sum(g["opp_score"] for g in gs)
        # Half up, like the site's toFixed (111 / 24 = 4.625 -> 4.63, not banker's 4.62).
        per_game = lambda runs: str((Decimal(runs) / len(gs)).quantize(Decimal("0.01"), ROUND_HALF_UP))  # noqa: E731
        return [wl(gs), f"{rs}-{ra}", per_game(rs), per_game(ra)]

    mrows = [[m, *month_cells(s, m), *month_cells(vs, m)] for m in month_keys]

    checks = []
    for yr in seasons:
        w, l, sw, sl, srs, sra, rs, ra = stats[yr]["_check"]
        ok = (w, l) == (sw, sl) and (srs is None or (rs, ra) == (srs, sra))
        checks.append(f"- {yr}: games {w}-{l}, RS {rs} / RA {ra} vs web_standings {sw}-{sl}, "
                      f"RS {srs} / RA {sra} → {'OK' if ok else '**MISMATCH**'}")

    text = f"""# Team season — {s} vs {vs} (regular season only)

Source: `web_games` (`game_type = 'R'`, finals) for everything computed game by game;
`web_standings` (final snapshot) for x-W/L, division finish, games back and each
opponent's final winning percentage.

{md_table(["", str(s), str(vs), "Δ"], rows)}

## Monthly record

March games are folded into April and October games into September, as MLB's own
splits and the season page do. R/G / RA/G = runs scored / allowed per game that month.

{md_table(["Month", str(s), "RS-RA", "R/G", "RA/G", str(vs), "RS-RA", "R/G", "RA/G"], mrows)}

## Cross-check

{chr(10).join(checks)}
"""
    return text, stats


# ---------------------------------------------------------------------------
# players
# ---------------------------------------------------------------------------

BAT_LINE = ["pa", "avg", "obp", "slg", "ops", "wrc_plus", "hr", "sb", "war",
            "war_batting", "war_baserunning", "war_fielding", "war_positional"]
BAT_DISC = ["chase_pct", "z_swing_pct", "whiff_pct", "contact_pct", "first_swing_pct", "k_pct", "bb_pct"]
BAT_BIP = ["bip", "avg_ev", "max_ev", "hard_hit_pct", "sweet_spot_pct", "gb_pct", "ld_pct", "fb_pct",
           "pu_pct", "pull_pct", "center_pct", "oppo_pct", "xwoba_con"]
# Derived like the site's player-stats table (web/lib/season-player-stats.ts): Off = Bat +
# BsR, Def = Fld + Pos (runs above average); OAA = Savant's season total summed over
# positions (all MLB clubs; no row for catchers / DHs).
BAT_DERIVED = ["off", "def", "oaa"]
PIT_LINE = ["ip", "gs", "w", "l", "sv", "era", "fip", "whip", "k_pct", "bb_pct", "war"]
PIT_DISC = ["pitches", "csw_pct", "zone_pct", "chase_pct", "whiff_pct", "first_strike_pct", "k_minus_bb_pct"]


def load_players(conn, seasons: list[int], role: str) -> dict[int, dict]:
    """{mlbam_id: {"name", season: {metric: value}}} -- Jays scope throughout."""
    line_cols = BAT_LINE if role == "batter" else PIT_LINE
    cond = "s.pa > 0" if role == "batter" else "s.ip is not null"
    out: dict[int, dict] = {}
    for r in q(conn, f"""
        select s.mlbam_id, s.season, p.name, {", ".join("s." + c for c in line_cols)}
        from web_player_season_stats s join web_players p using (mlbam_id)
        where s.season = any(%(seasons)s) and {cond}""", {"seasons": seasons}):
        e = out.setdefault(r["mlbam_id"], {"name": r["name"]})
        e[r["season"]] = {c: f(r[c]) for c in line_cols}
    ids = list(out)
    views = ([("web_v_batter_discipline", BAT_DISC, ""), ("web_v_batted_ball_profile", BAT_BIP, "")]
             if role == "batter" else [("web_v_pitcher_discipline", PIT_DISC, "d_")])
    for view, cols, prefix in views:
        for r in q(conn, f"""select mlbam_id, season, {", ".join(cols)} from {view}
                            where scope = 'jays' and season = any(%(seasons)s) and mlbam_id = any(%(ids)s)""",
                   {"seasons": seasons, "ids": ids}):
            season_row = out[r["mlbam_id"]].get(r["season"])
            if season_row is not None:
                season_row.update({prefix + c: f(r[c]) for c in cols})
    if role == "batter":
        add = lambda a, b: None if a is None or b is None else a + b  # noqa: E731
        for p in out.values():
            for yr in seasons:
                row = p.get(yr)
                if row is not None:
                    row["off"] = add(row["war_batting"], row["war_baserunning"])
                    row["def"] = add(row["war_fielding"], row["war_positional"])
                    row["oaa"] = None
        for r in q(conn, """select mlbam_id, season, sum(oaa) as oaa from web_fielding_frv
                            where season = any(%(seasons)s) and mlbam_id = any(%(ids)s)
                            group by 1, 2""", {"seasons": seasons, "ids": ids}):
            row = out[r["mlbam_id"]].get(r["season"])
            if row is not None:
                row["oaa"] = f(r["oaa"])
    return out


def in_cohort(p: dict, seasons: list[int], role: str) -> bool:
    key, floor = ("pa", MIN_PA) if role == "batter" else ("ip", MIN_IP)
    return all((p.get(s) or {}).get(key) is not None and p[s][key] >= floor for s in seasons)


def write_csv(path: Path, players: dict[int, dict], seasons: list[int], metrics: list[str], role: str) -> None:
    s, vs = seasons
    header = ["mlbam_id", "name", "cohort"]
    for m in metrics:
        header += [f"{m}_{s}", f"{m}_{vs}", f"{m}_delta"]
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        for pid, p in sorted(players.items(), key=lambda kv: kv[1]["name"]):
            coh = in_cohort(p, seasons, role)
            row = [pid, p["name"], coh]
            for m in metrics:
                a, b = (p.get(s) or {}).get(m), (p.get(vs) or {}).get(m)
                row += [a, b, delta(a, b) if coh else None]
            w.writerow(row)


def batters_md(players: dict, seasons: list[int], shift: dict) -> str:
    s, vs = seasons
    coh = {k: v for k, v in players.items() if in_cohort(v, seasons, "batter")}
    rows = []
    for pid, p in sorted(coh.items(), key=lambda kv: -(delta(kv[1][s]["wrc_plus"], kv[1][vs]["wrc_plus"]) or 0)):
        a, b = p[s], p[vs]
        rows.append([p["name"], f"{num(a['pa'])} / {num(b['pa'])}",
                     f"{r3(a['ops'])} / {r3(b['ops'])}", signed_r3(delta(a["ops"], b["ops"])),
                     f"{num(a['wrc_plus'])} / {num(b['wrc_plus'])}", signed(delta(a["wrc_plus"], b["wrc_plus"]), 0),
                     f"{num(a['war'], 1)} / {num(b['war'], 1)}", signed(delta(a["war"], b["war"]), 1),
                     f"{pct(a.get('chase_pct'))} / {pct(b.get('chase_pct'))}",
                     signed(delta(a.get("chase_pct"), b.get("chase_pct")), 1, 100),
                     f"{pct(a.get('hard_hit_pct'))} / {pct(b.get('hard_hit_pct'))}",
                     f"{r3(a.get('xwoba_con'))} / {r3(b.get('xwoba_con'))}"])
    others = []
    for pid, p in sorted(players.items(), key=lambda kv: kv[1]["name"]):
        if pid in coh:
            continue
        for yr in seasons:
            if yr in p:
                a = p[yr]
                others.append([p["name"], yr, num(a["pa"]), f"{r3(a['avg'])}/{r3(a['obp'])}/{r3(a['slg'])}",
                               r3(a["ops"]), num(a["wrc_plus"]), num(a["hr"]), num(a["war"], 1)])
    return f"""# Batters — {s} vs {vs} (as a Blue Jay)

Season lines from `web_player_season_stats` (Blue Jays games only); discipline and
batted-ball numbers from the `web_v_*` views, scope `jays`. Full columns in
`batters.csv`.

## Both seasons, ≥ {MIN_PA} PA each ({len(coh)} players) — sorted by ΔwRC+

Cells read "{s} / {vs}". ⚠️ Chase% is zone-based: every stored pitch's Chase% moved
{signed(shift.get('chase'), 1, 100, ' pts')} from {vs} to {s} on its own (see
`league_context.md`), so a batter's ΔChase% should be read against that.

{md_table(["Batter", "PA", "OPS", "ΔOPS", "wRC+", "ΔwRC+", "WAR", "ΔWAR", "Chase%", "ΔChase (pts)",
           "Hard-hit%", "xwOBAcon"], rows)}

## Everyone else (one season, or under {MIN_PA} PA in one of them)

{md_table(["Batter", "Season", "PA", "AVG/OBP/SLG", "OPS", "wRC+", "HR", "WAR"], others)}
"""


def load_arsenal(conn, seasons: list[int]) -> dict[int, dict[int, dict[str, dict]]]:
    """{pitcher: {season: {pitch_type: row}}}, Jays scope. Mirrors buildArsenal."""
    out: dict = defaultdict(lambda: defaultdict(dict))
    for r in q(conn, """
        select pitcher_id, season, pitch_type, count(*) as n,
               avg(release_speed)::float8 as velo, avg(spin_rate)::float8 as spin,
               count(*) filter (where is_swing) as swings,
               count(*) filter (where is_whiff) as whiffs,
               avg(estimated_woba) filter (where description = 'hit_into_play')::float8 as xwoba_con
        from web_v_pitch_scoped
        where pitcher_as_jay and pitch_type is not null and season = any(%(seasons)s)
        group by 1, 2, 3""", {"seasons": seasons}):
        out[r["pitcher_id"]][r["season"]][r["pitch_type"]] = r
    for pid, by_season in out.items():
        for yr, rows in by_season.items():
            total = sum(r["n"] for r in rows.values())
            for r in rows.values():
                r["usage"] = r["n"] / total
                r["whiff_pct"] = r["whiffs"] / r["swings"] if r["swings"] else None
    return out


def primary_fastball(rows: dict[str, dict]) -> str | None:
    if not rows:
        return None
    ordered = sorted(rows.values(), key=lambda r: -r["n"])
    fb = next((r for r in ordered if r["pitch_type"] in FASTBALLS), None)
    return (fb or ordered[0])["pitch_type"]


def arsenal_rows(ars: dict, pid: int, seasons: list[int], cohort: bool) -> list[dict]:
    s, vs = seasons
    a, b = ars.get(pid, {}).get(s, {}), ars.get(pid, {}).get(vs, {})
    rows = []
    for pt in sorted(set(a) | set(b), key=lambda t: -((a.get(t) or b.get(t))["n"])):
        ra, rb = a.get(pt), b.get(pt)
        flag = ""
        if cohort and ra and not rb and ra["usage"] >= NEW_PITCH_USAGE:
            flag = "NEW"
        elif cohort and rb and not ra and rb["usage"] >= NEW_PITCH_USAGE:
            flag = "DROPPED"
        rows.append({"pitch_type": pt, "a": ra, "b": rb, "flag": flag})
    return rows


def pitchers_md(players: dict, ars: dict, seasons: list[int]) -> str:
    s, vs = seasons
    coh = {k: v for k, v in players.items() if in_cohort(v, seasons, "pitcher")}
    rows = []
    for pid, p in sorted(coh.items(), key=lambda kv: delta(kv[1][s]["era"], kv[1][vs]["era"]) or 0):
        a, b = p[s], p[vs]
        rows.append([p["name"], f"{ip(a['ip'])} / {ip(b['ip'])}",
                     f"{num(a['era'], 2)} / {num(b['era'], 2)}", signed(delta(a["era"], b["era"]), 2),
                     f"{num(a['fip'], 2)} / {num(b['fip'], 2)}",
                     f"{pct(a['k_pct'])} / {pct(b['k_pct'])}", f"{pct(a['bb_pct'])} / {pct(b['bb_pct'])}",
                     f"{pct(a.get('d_csw_pct'))} / {pct(b.get('d_csw_pct'))}",
                     f"{pct(a.get('d_whiff_pct'))} / {pct(b.get('d_whiff_pct'))}",
                     f"{num(a['war'], 1)} / {num(b['war'], 1)}", signed(delta(a["war"], b["war"]), 1)])
    arsenal_blocks = []
    for pid, p in sorted(coh.items(), key=lambda kv: kv[1]["name"]):
        arows = []
        for r in arsenal_rows(ars, pid, seasons, True):
            ra, rb = r["a"] or {}, r["b"] or {}
            arows.append([r["pitch_type"] + (f" **{r['flag']}**" if r["flag"] else ""),
                          f"{pct(ra.get('usage'))} / {pct(rb.get('usage'))}",
                          f"{num(ra.get('velo'), 1)} / {num(rb.get('velo'), 1)}",
                          signed(delta(ra.get("velo"), rb.get("velo")), 1),
                          f"{num(ra.get('spin'))} / {num(rb.get('spin'))}",
                          f"{pct(ra.get('whiff_pct'))} / {pct(rb.get('whiff_pct'))}",
                          f"{r3(ra.get('xwoba_con'))} / {r3(rb.get('xwoba_con'))}"])
        arsenal_blocks.append(f"### {p['name']}\n\n" + md_table(
            ["Pitch", "Usage", "Velo", "ΔVelo", "Spin", "Whiff%", "xwOBAcon"], arows))
    others = []
    for pid, p in sorted(players.items(), key=lambda kv: kv[1]["name"]):
        if pid in coh:
            continue
        for yr in seasons:
            if yr in p:
                a = p[yr]
                others.append([p["name"], yr, ip(a["ip"]), num(a["gs"]), num(a["era"], 2), num(a["fip"], 2),
                               pct(a["k_pct"]), pct(a["bb_pct"]), num(a["war"], 1)])
    nl = "\n\n"
    return f"""# Pitchers — {s} vs {vs} (as a Blue Jay)

Season lines from `web_player_season_stats` (Blue Jays games only); CSW% / Whiff% from
`web_v_pitcher_discipline`, scope `jays`; arsenal mirrors the site's `buildArsenal`.
Full columns in `pitchers.csv` and `pitchers_arsenal.csv`.

## Both seasons, ≥ {MIN_IP} IP each ({len(coh)} pitchers) — sorted by ΔERA (best first)

Cells read "{s} / {vs}".

{md_table(["Pitcher", "IP", "ERA", "ΔERA", "FIP", "K%", "BB%", "CSW%", "Whiff%", "WAR", "ΔWAR"], rows)}

## Arsenals (cohort)

**NEW** = not thrown as a Jay in {vs}, ≥ {NEW_PITCH_USAGE:.0%} usage in {s}; **DROPPED** = the reverse.
Pitch-type labels are Savant's and get reclassified occasionally — a NEW sweeper
next to a DROPPED slider may be one pitch renamed. Check velo/spin before writing it up.

{nl.join(arsenal_blocks)}

## Everyone else (one season, or under {MIN_IP} IP in one of them)

{md_table(["Pitcher", "Season", "IP", "GS", "ERA", "FIP", "K%", "BB%", "WAR"], others)}
"""


def write_arsenal_csv(path: Path, players: dict, ars: dict, seasons: list[int]) -> None:
    s, vs = seasons
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["mlbam_id", "name", "cohort", "pitch_type", "flag"]
                   + [f"{m}_{yr}" for m in ("n", "usage", "velo", "spin", "whiff_pct", "xwoba_con")
                      for yr in (s, vs)])
        for pid, p in sorted(players.items(), key=lambda kv: kv[1]["name"]):
            coh = in_cohort(p, seasons, "pitcher")
            for r in arsenal_rows(ars, pid, seasons, coh):
                ra, rb = r["a"] or {}, r["b"] or {}
                vals = []
                for m in ("n", "usage", "velo", "spin", "whiff_pct", "xwoba_con"):
                    vals += [ra.get(m), rb.get(m)]
                w.writerow([pid, p["name"], coh, r["pitch_type"], r["flag"]] + vals)


def movers_md(bats: dict, pits: dict, ars: dict, seasons: list[int], shift: dict) -> str:
    s, vs = seasons
    bcoh = {k: v for k, v in bats.items() if in_cohort(v, seasons, "batter")}
    pcoh = {k: v for k, v in pits.items() if in_cohort(v, seasons, "pitcher")}

    def ranked(pop, key, rising):
        """Top 5 strictly rising (rising=True) or falling -- the lists never overlap."""
        vals = [(p["name"], p[s].get(key), p[vs].get(key), delta(p[s].get(key), p[vs].get(key)))
                for p in pop.values()]
        vals = [v for v in vals if v[3] is not None and (v[3] > 0 if rising else v[3] < 0)]
        return sorted(vals, key=lambda v: v[3], reverse=rising)[:5]

    def block(title, items, fmt, dfmt):
        if not items:
            return f"### {title}\n\nNone in the cohort."
        return f"### {title}\n\n" + md_table(["Player", str(s), str(vs), "Δ"],
                                             [[n, fmt(a), fmt(b), dfmt(d)] for n, a, b, d in items])

    wrc = lambda v: num(v)  # noqa: E731
    era = lambda v: num(v, 2)  # noqa: E731
    parts = [
        block("Batters — wRC+ gains", ranked(bcoh, "wrc_plus", True), wrc, lambda d: signed(d, 0)),
        block("Batters — wRC+ drops", ranked(bcoh, "wrc_plus", False), wrc, lambda d: signed(d, 0)),
        block("Pitchers — ERA improvements (lower)", ranked(pcoh, "era", False), era, lambda d: signed(d, 2)),
        block("Pitchers — ERA jumps (higher)", ranked(pcoh, "era", True), era, lambda d: signed(d, 2)),
    ]
    sh = shift.get("chase") or 0.0
    chase = [(p["name"], p[s].get("chase_pct"), p[vs].get("chase_pct"),
              delta(p[s].get("chase_pct"), p[vs].get("chase_pct"))) for p in bcoh.values()]
    chase = sorted([c for c in chase if c[3] is not None], key=lambda c: abs(c[3] - sh), reverse=True)[:8]
    parts.append(f"""### Batters — biggest Chase% changes (net of the {vs}→{s} shift)

Every stored pitch's Chase% moved {signed(sh, 1, 100, ' pts')} on its own
(`league_context.md`), so the ranking uses Δ minus that shift. Lower Chase% = better.

""" + md_table(["Batter", str(s), str(vs), "Δ (pts)", "Δ net of shift (pts)"],
               [[n, pct(a), pct(b), signed(d, 1, 100), signed(d - sh, 1, 100)] for n, a, b, d in chase]))

    velo = []
    for pid, p in pcoh.items():
        pt = primary_fastball(ars.get(pid, {}).get(s, {}))
        ra, rb = ars.get(pid, {}).get(s, {}).get(pt), ars.get(pid, {}).get(vs, {}).get(pt)
        if ra and rb:
            velo.append((p["name"], pt, ra["velo"], rb["velo"], ra["velo"] - rb["velo"]))
    velo.sort(key=lambda v: abs(v[4]), reverse=True)
    parts.append("### Pitchers — biggest primary-fastball velo changes\n\n" + md_table(
        ["Pitcher", "Pitch", str(s), str(vs), "Δ mph"],
        [[n, pt, num(a, 1), num(b, 1), signed(d, 1)] for n, pt, a, b, d in velo[:8]]))

    flags = []
    for pid, p in sorted(pcoh.items(), key=lambda kv: kv[1]["name"]):
        for r in arsenal_rows(ars, pid, seasons, True):
            if r["flag"]:
                ref = r["a"] or r["b"]
                flags.append([p["name"], r["pitch_type"], r["flag"], pct(ref["usage"]), num(ref["velo"], 1)])
    parts.append("### New / dropped pitches\n\n" + (md_table(
        ["Pitcher", "Pitch", "Flag", "Usage (season thrown)", "Velo"], flags) if flags else "None."))
    nl = "\n\n"
    return f"""# Movers — {s} vs {vs}

Cohort only (as a Blue Jay, ≥ {MIN_PA} PA / ≥ {MIN_IP} IP in each season). Small
populations: {len(bcoh)} batters, {len(pcoh)} pitchers.

{nl.join(parts)}
"""


# ---------------------------------------------------------------------------
# roster moves (full-MLB lines per club)
# ---------------------------------------------------------------------------


def roster_moves_md(conn, seasons: list[int]) -> str:
    s, vs = seasons
    abbr = {r["team_id"]: r["team_abbrev"] for r in q(conn, "select distinct team_id, team_abbrev from web_standings")}
    abbr[0] = "MLB total"
    roster = {r["mlbam_id"]: r for r in q(conn, """
        select c.mlbam_id, p.name, c.appeared_as_pitcher,
               exists (select 1 from web_player_seasons j where j.mlbam_id = c.mlbam_id and j.season = %(vs)s) as jay_before
        from web_player_seasons c join web_players p using (mlbam_id)
        where c.season = %(s)s and c.team_id = 141""", {"s": s, "vs": vs})}
    lines: dict = defaultdict(lambda: defaultdict(dict))
    for r in q(conn, """select * from web_player_team_season_stats
                        where season = any(%(seasons)s) and mlbam_id = any(%(ids)s)""",
               {"seasons": seasons, "ids": list(roster)}):
        lines[r["mlbam_id"]][r["season"]][r["team_id"]] = r

    def bat(r):
        return [num(r["g"]), num(r["pa"]), f"{r3(r['avg'])}/{r3(r['obp'])}/{r3(r['slg'])}",
                r3(r["ops"]), num(r["wrc_plus"]), num(r["hr"]), num(r["war"], 1)]

    def pit(r):
        return [num(r["g"]), num(r["gs"]), ip(r["ip"]), num(r["era"], 2), num(r["fip"], 2),
                pct(r["k_pct"]), pct(r["bb_pct"]), num(r["war"], 1)]

    BH = ["G", "PA", "AVG/OBP/SLG", "OPS", "wRC+", "HR", "WAR"]
    PH = ["G", "GS", "IP", "ERA", "FIP", "K%", "BB%", "WAR"]

    def has_line(r, is_p):
        return r is not None and (r["ip"] is not None if is_p else (r["pa"] or 0) > 0)

    def when(r):
        return f"{r['first_game']:%b %d}–{r['last_game']:%b %d}" if r.get("first_game") else ""

    sections = {"new": {False: [], True: []}, "arrived": {False: [], True: []}, "left": {False: [], True: []}}
    for pid, info in sorted(roster.items(), key=lambda kv: kv[1]["name"]):
        is_p = bool(info["appeared_as_pitcher"])
        fmt = pit if is_p else bat
        cur = lines[pid].get(s, {})
        tor = cur.get(JAYS)
        if not has_line(tor, is_p):
            continue  # on the 40-man, never appeared for Toronto
        others = [r for t, r in cur.items() if t not in (0, JAYS) and has_line(r, is_p)]
        if not info["jay_before"]:
            prev = lines[pid].get(vs, {})
            prev_total = prev.get(0)
            clubs = "/".join(abbr.get(t, str(t)) for t, r in sorted(prev.items(), key=lambda kv: str(kv[1].get("first_game")))
                             if t != 0 and has_line(r, is_p))
            if has_line(prev_total, is_p):
                sections["new"][is_p].append([info["name"], f"{vs} {clubs}"] + fmt(prev_total))
            else:
                sections["new"][is_p].append([info["name"], f"{vs}: no MLB line"] + [""] * len(PH if is_p else BH))
            sections["new"][is_p].append(["", f"{s} TOR {when(tor)}"] + fmt(tor))
        for o in others:
            if o["first_game"] and tor["first_game"] and o["first_game"] < tor["first_game"]:
                sections["arrived"][is_p].append([info["name"], f"{abbr.get(o['team_id'])} {when(o)}"] + fmt(o))
                sections["arrived"][is_p].append(["", f"TOR {when(tor)}"] + fmt(tor))
            if o["last_game"] and tor["last_game"] and o["last_game"] > tor["last_game"]:
                total = cur.get(0)
                sections["left"][is_p].append([info["name"], f"TOR {when(tor)}"] + fmt(tor))
                sections["left"][is_p].append(["", f"{abbr.get(o['team_id'])} {when(o)}"] + fmt(o))
                if total is not None:
                    sections["left"][is_p].append(["", f"{s} {abbr[0]}"] + fmt(total))

    def sec(key, title, blurb):
        out = [f"## {title}\n\n{blurb}"]
        for is_p, head in ((False, BH), (True, PH)):
            rows = sections[key][is_p]
            if rows:
                out.append(f"### {'Pitchers' if is_p else 'Batters'}\n\n" + md_table(["Player", "Club / span"] + head, rows))
        return "\n\n".join(out)

    nl = "\n\n"
    return f"""# Roster moves — the {s} Blue Jays, with every club

Full-MLB lines per club from `web_player_team_season_stats` (MLB Stats API, regular
season). Unlike the other files these include time with **other clubs**. Spans are
first–last game with that club. Players on the {s} 40-man who never appeared for
Toronto are left out.

{sec("new", f"New for {s} (not a Blue Jay in {vs})",
     f"Their {vs} line (all clubs combined, clubs in order) above their {s} Toronto line.")}

{sec("arrived", f"Acquired during {s}", "Pre-trade club, then Toronto.")}

{sec("left", f"Left during {s}", "Toronto, then the new club, then the full-season total.")}
""".replace(nl + nl, nl)


# ---------------------------------------------------------------------------
# value by position
# ---------------------------------------------------------------------------

POSITION_GROUPS = ["C", "1B", "2B", "3B", "SS", "OF", "DH", "SP", "RP"]
BATTING_GROUPS = POSITION_GROUPS[:7]
SPLIT_COUNTS = ("hr", "pa", "ab", "h", "bb", "hbp", "sf", "tb")


def batter_group(position: str | None) -> str:
    """= web/lib/team-season.ts::batterGroup and the 025 view's pos_group: PH / P count as DH."""
    p = (position or "").upper()
    if p in ("LF", "CF", "RF", "OF"):
        return "OF"
    return p if p in ("C", "1B", "2B", "3B", "SS") else "DH"


def value_by_position(conn, seasons: list[int]) -> dict[int, tuple[dict, dict]]:
    """{season: (group -> totals, group -> {player: share})}.

    Mirrors web/lib/team-season.ts::valueByPosition, the season page's "value by
    position" chart: a position player is split across the positions he batted at
    by PA — HR / PA / OPS summed from MLB's by-position splits (exact), Off and WAR
    shared out by his PA at each position. A batter without split rows goes whole
    to his season position; pitchers' WAR goes to SP / RP by share of starts.
    """
    players = q(conn, """
        with pitching as (
          select s.mlbam_id, g.season, count(*)::int as apps
          from web_player_game_stats s join web_games g on g.game_pk = s.game_pk
          where s.stat_group = 'pitching' and g.game_type = 'R' and g.season = any(%(s)s)
          group by 1, 2
        ), pos as (
          select distinct on (mlbam_id, season) mlbam_id, season, position
          from web_player_position_splits
          where season = any(%(s)s) and position not in ('PH', 'P')
          order by mlbam_id, season, pa desc, g desc, position
        )
        select s.mlbam_id, s.season, p.name, coalesce(pos.position, p.position) as position,
          s.pa::int as pa, s.hr::int as hr, s.gs::int as gs, s.war::float8 as war,
          s.war_batting::float8 as bat, s.war_baserunning::float8 as bsr, pi.apps
        from web_player_season_stats s
        join web_players p using (mlbam_id)
        left join pitching pi on pi.mlbam_id = s.mlbam_id and pi.season = s.season
        left join pos on pos.mlbam_id = s.mlbam_id and pos.season = s.season
        where s.season = any(%(s)s)""", {"s": seasons})
    splits = q(conn, f"""
        select mlbam_id, season, position, {", ".join(f"coalesce({c}, 0)::int as {c}" for c in SPLIT_COUNTS)}
        from web_player_position_splits where season = any(%(s)s)""", {"s": seasons})

    out = {}
    for season in seasons:
        acc = {g: {"war": 0.0, "off": 0.0, **{c: 0 for c in SPLIT_COUNTS}} for g in POSITION_GROUPS}
        who: dict[str, dict[str, float]] = {g: defaultdict(float) for g in POSITION_GROUPS}
        own_splits: dict[int, list] = defaultdict(list)
        for sp in splits:
            if sp["season"] == season:
                own_splits[sp["mlbam_id"]].append(sp)
        for r in players:
            if r["season"] != season:
                continue
            war = r["war"] or 0.0
            batter = (r["pa"] or 0) > 0
            off = None if r["bat"] is None or r["bsr"] is None else r["bat"] + r["bsr"]
            own = own_splits.get(r["mlbam_id"], []) if batter else []
            total = sum(sp["pa"] for sp in own)
            if total == 0:
                if batter:
                    g = batter_group(r["position"])
                else:
                    apps, gs = r["apps"] or 0, r["gs"] or 0
                    g = "SP" if (gs / apps >= 0.5 if apps > 0 else gs > 0) else "RP"
                acc[g]["war"] += war
                if batter:
                    acc[g]["off"] += off or 0.0
                    acc[g]["hr"] += r["hr"] or 0
                who[g][r["name"]] += (off or 0.0) if batter else war
                continue
            for sp in own:
                g = batter_group(sp["position"])
                share = sp["pa"] / total
                acc[g]["war"] += war * share
                acc[g]["off"] += (off or 0.0) * share
                for c in SPLIT_COUNTS:
                    acc[g][c] += sp[c]
                who[g][r["name"]] += (off or 0.0) * share
        for a in acc.values():
            den = a["ab"] + a["bb"] + a["hbp"] + a["sf"]
            a["ops"] = (a["h"] + a["bb"] + a["hbp"]) / den + a["tb"] / a["ab"] if a["ab"] > 0 and den > 0 else None
        out[season] = (acc, who)
    return out


def positions_md(conn, seasons: list[int]) -> str:
    s, vs = seasons
    vbp = value_by_position(conn, seasons)
    (a, who_a), (b, who_b) = vbp[s], vbp[vs]

    rows = []
    for g in POSITION_GROUPS:
        x, y = a[g], b[g]
        if g in BATTING_GROUPS:
            rows.append([g, num(x["pa"]), f"{x['hr']} / {y['hr']}", f"{x['hr'] - y['hr']:+d}",
                         f"{r3(x['ops'])} / {r3(y['ops'])}", f"{signed(x['off'])} / {signed(y['off'])}",
                         signed(x["off"] - y["off"]), f"{x['war']:.1f} / {y['war']:.1f}", signed(x["war"] - y["war"])])
        else:
            rows.append([g, "", "", "", "", "", "", f"{x['war']:.1f} / {y['war']:.1f}", signed(x["war"] - y["war"])])
    tot = lambda acc, k, groups=BATTING_GROUPS: sum(acc[g][k] for g in groups)  # noqa: E731
    totals = (f"Team totals (position players): HR {tot(a, 'hr')} / {tot(b, 'hr')}, "
              f"Off {signed(tot(a, 'off'))} / {signed(tot(b, 'off'))}; "
              f"WAR, everyone {tot(a, 'war', POSITION_GROUPS):.1f} / {tot(b, 'war', POSITION_GROUPS):.1f}.")

    vs_mlb = q(conn, """
        select team_id, pos_group, hr::float8 as hr, ops::float8 as ops, hr_rank, hr_tied, ops_rank, ops_tied
        from web_v_team_position where season = %(s)s and team_id in (%(j)s, 0)""", {"s": s, "j": JAYS})
    rank = lambda n, tied: "–" if n is None else ("T-" if tied else "") + ordinal(n)  # noqa: E731
    mrows = []
    for g in BATTING_GROUPS:
        j = next((r for r in vs_mlb if r["team_id"] == JAYS and r["pos_group"] == g), None)
        m = next((r for r in vs_mlb if r["team_id"] == 0 and r["pos_group"] == g), None)
        if j and m:
            mrows.append([g, num(j["hr"]), num(m["hr"], 1), rank(j["hr_rank"], j["hr_tied"]),
                          r3(j["ops"]), r3(m["ops"]), rank(j["ops_rank"], j["ops_tied"])])

    def top(who: dict, g: str) -> str:
        best = sorted(who[g].items(), key=lambda kv: -abs(kv[1]))[:3]
        return ", ".join(f"{n} {signed(v)}" for n, v in best if round(v, 1) != 0) or "–"

    contrib = [[g, top(who_a, g), top(who_b, g)] for g in POSITION_GROUPS]
    mlb_part = (md_table(["Group", "Jays HR", "MLB HR (per club)", "HR rank", "Jays OPS", "MLB OPS", "OPS rank"], mrows)
                if mrows else f"_No rows for {s} in `web_v_team_position` yet._")
    return f"""# Value by position — {s} vs {vs} (as a Blue Jay)

The season page's **Value by position** chart, as numbers. A position player is split
across the positions he batted at by plate appearances: **HR / PA / OPS are exact**
(MLB's by-position splits); **Off (Bat + BsR) and WAR are his season values shared out by
his PA at each position**. OF = LF + CF + RF; DH includes pinch-hitters (PH) and batting
while on the mound (P). Pitchers: SP vs RP by share of appearances that were starts.
Mirrors `web/lib/team-season.ts::valueByPosition` — quote these, not a regrouping by
each player's primary position (that gives different totals per group).

Cells are `{s} / {vs}`; Δ = {s} − {vs}.

{md_table(["Group", f"PA {s}", "HR", "ΔHR", "OPS", "Off", "ΔOff", "WAR", "ΔWAR"], rows)}

{totals}

## Each position vs MLB, {s}

From the `025` view (`web_v_team_position`) — the season page's "each position vs MLB"
table. MLB HR = an average club's total at that position; MLB OPS = all 30 clubs' summed
counts. Rank 1st = best among 30.

{mlb_part}

## Who made up each group (Off; WAR for SP / RP), biggest three by size

{md_table(["Group", str(s), str(vs)], contrib)}
"""


# ---------------------------------------------------------------------------
# league context + README
# ---------------------------------------------------------------------------


def reference_rates(conn, seasons: list[int]) -> dict[int, dict]:
    out = {}
    for r in q(conn, """
        select season,
          count(*) filter (where not is_auto) as pitches,
          (count(*) filter (where zone between 1 and 9))::float8 / nullif(count(zone), 0) as zone_pct,
          (count(*) filter (where zone between 11 and 14 and is_swing))::float8
            / nullif(count(*) filter (where zone between 11 and 14), 0) as chase_pct,
          (count(*) filter (where zone between 1 and 9 and is_swing))::float8
            / nullif(count(*) filter (where zone between 1 and 9), 0) as z_swing_pct,
          (count(*) filter (where is_whiff))::float8 / nullif(count(*) filter (where is_swing), 0) as whiff_pct,
          (count(*) filter (where description = 'called_strike') + count(*) filter (where is_whiff))::float8
            / nullif(count(*) filter (where not is_auto), 0) as csw_pct
        from web_v_pitch_scoped group by season"""):
        out[r["season"]] = r
    return out


def league_md(ref: dict, seasons: list[int], league: list[dict]) -> str:
    rows = [[yr, f"{ref[yr]['pitches']:,}", pct(ref[yr]["zone_pct"]), pct(ref[yr]["chase_pct"]),
             pct(ref[yr]["z_swing_pct"]), pct(ref[yr]["whiff_pct"]), pct(ref[yr]["csw_pct"])]
            for yr in sorted(ref)]
    lrows = [[r["season"], r["league"], r3(r["obp"]), r3(r["slg"]), r3(r["ops"]), num(r["era"], 2),
              pct(r["k_pct"]), pct(r["bb_pct"])] for r in league]
    s, vs = seasons
    return f"""# League context

## League averages (web_league_season)

Regular season, all clubs. Rates are computed from the **summed** team counting
stats (MLB Stats API), not averaged team rates. The Blue Jays are in the AL.

{md_table(["Season", "League", "OBP", "SLG", "OPS", "ERA", "K%", "BB%"], lrows) if lrows else "Not loaded — run etl/pull_league_averages.py."}

Savant percentile ranks, expected stats and pitch run value for every player
are in the database (`web_savant_percentiles`, `web_savant_season`,
`web_pitch_arsenal_rv`) and on each player's overview; they are MLB-wide season
values (every club), 100 = best.

## Reference rates from every pitch on file

Every regular-season pitch in `web_statcast_events` for the season: all Blue Jays
games (both sides) plus the {s} roster's seasons with other clubs. Not a true league
average — a large, Jays-weighted sample — but it shows **definitional drift**:

{md_table(["Season", "Pitches", "Zone%", "Chase%", "Z-Swing%", "Whiff%", "CSW%"], rows)}

⚠️ **The zone-based rates moved in {s} while Whiff% did not.** From {vs} to {s},
Zone% moved {signed(delta(ref[s]['zone_pct'], ref[vs]['zone_pct']), 1, 100, ' pts')} and Chase%
{signed(delta(ref[s]['chase_pct'], ref[vs]['chase_pct']), 1, 100, ' pts')} across the whole sample, but
Whiff% only {signed(delta(ref[s]['whiff_pct'], ref[vs]['whiff_pct']), 1, 100, ' pts')}, and the seasons
before {s} agree with each other. A population-wide move like that points to a change
in how Savant assigns `zone` in {s}, the same season it moved plate coordinates to the
middle of the plate (the ABS-zone reference). That cause is inferred, not confirmed.
Read a player's ΔChase% / ΔZone% against this shift, not raw.
Whiff%, CSW%, K%, BB%, velo, spin, movement and batted-ball numbers are unaffected.
"""


def article_links(conn, seasons: list[int], bats: dict, pits: dict) -> str:
    """Stable site URLs for the article (P12 M7): the season page, the Compare
    tab for the both-seasons cohort (as a Jay) and for newcomers (all MLB)."""
    s, vs = seasons
    cmp = lambda pid, scope: f"/en/players/{pid}/compare?season={s}&vs={vs}&scope={scope}"  # noqa: E731
    lines = [
        f"- Team season: `/en/season/{s}` (zh-TW: `/zh-TW/season/{s}`)",
        "- Team trends, five seasons vs MLB (P13): `/en/team` (zh-TW: `/zh-TW/team`)",
    ]
    cohort = sorted(
        [(p["name"], pid) for pid, p in bats.items() if in_cohort(p, seasons, "batter")]
        + [(p["name"], pid) for pid, p in pits.items() if in_cohort(p, seasons, "pitcher")]
    )
    if cohort:
        lines.append(f"- Same player, {s} vs {vs}, as a Blue Jay:")
        lines += [f"  - {n}: `{cmp(pid, 'jays')}`" for n, pid in cohort]
    newcomers = q(conn, """
        select distinct p.mlbam_id, p.name
        from web_player_seasons c join web_players p using (mlbam_id)
        join web_player_team_season_stats t on t.mlbam_id = c.mlbam_id and t.season = %(vs)s and t.team_id = 0
        where c.season = %(s)s
          and not exists (select 1 from web_player_seasons j where j.mlbam_id = c.mlbam_id and j.season = %(vs)s)
        order by p.name""", {"s": s, "vs": vs})
    if newcomers:
        lines.append(f"- Newcomers, {s} with Toronto vs {vs} elsewhere (all MLB):")
        lines += [f"  - {r['name']}: `{cmp(r['mlbam_id'], 'mlb')}`" for r in newcomers]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# team trends (P13) — five seasons vs the MLB average, from the 022 views
# ---------------------------------------------------------------------------

TREND_SEASONS = 5  # = web/lib/team-trends.ts TREND_SEASONS

# Labels / groups / formats only — mirrors web/lib/team-metrics.ts (METRICS, in
# display order). Every value, MLB average and rank is READ from
# web_v_team_season / web_v_mlb_season (migration 022), the views the /team page
# reads, so the pack and the site cannot drift. Change both lists together.
TEAM_GROUPS = [
    ("offense", "Run scoring"),
    ("contact", "Contact quality (Statcast)"),
    ("profile", "Batted-ball mix (not ranked)"),
    ("prevention", "Run prevention"),
    ("contactAllowed", "Contact allowed (Statcast)"),
    ("defense", "Defense"),
    ("rotation", "Rotation"),
    ("bullpen", "Bullpen"),
]
TEAM_METRICS = [  # (view column, label, group, format)
    ("r_per_g", "R/G", "offense", "dec2"), ("wrc_plus", "wRC+", "offense", "int"),
    ("ops", "OPS", "offense", "rate3"), ("obp", "OBP", "offense", "rate3"),
    ("slg", "SLG", "offense", "rate3"), ("avg", "AVG", "offense", "rate3"),
    ("iso", "ISO", "offense", "rate3"), ("babip", "BABIP", "offense", "rate3"),
    ("k_pct", "K%", "offense", "pct1"), ("bb_pct", "BB%", "offense", "pct1"),
    ("hr_pct", "HR%", "offense", "pct1"), ("sb_per_g", "SB/G", "offense", "dec2"),
    ("sb_pct", "SB%", "offense", "pct1"), ("whiff_pct", "Whiff%", "offense", "pct1"),
    ("bat_war", "WAR", "offense", "dec1"),
    ("brl_pct", "Barrel%", "contact", "pct1"), ("hard_hit_pct", "Hard-hit%", "contact", "pct1"),
    ("sweet_spot_pct", "Sweet-spot%", "contact", "pct1"), ("avg_ev", "Avg EV", "contact", "dec1"),
    ("xwoba", "xwOBA", "contact", "rate3"), ("woba", "wOBA", "contact", "rate3"),
    ("gb_pct", "GB%", "profile", "pct1"), ("ld_pct", "LD%", "profile", "pct1"),
    ("fb_pct", "FB%", "profile", "pct1"), ("pu_pct", "PU%", "profile", "pct1"),
    ("ra_per_g", "RA/G", "prevention", "dec2"), ("era", "ERA", "prevention", "dec2"),
    ("fip", "FIP", "prevention", "dec2"), ("whip", "WHIP", "prevention", "dec2"),
    ("pit_k_pct", "K%", "prevention", "pct1"), ("pit_bb_pct", "BB%", "prevention", "pct1"),
    ("pit_k_bb_pct", "K-BB%", "prevention", "pct1"), ("hr9", "HR/9", "prevention", "dec2"),
    ("pit_babip", "BABIP", "prevention", "rate3"), ("pit_whiff_pct", "Whiff%", "prevention", "pct1"),
    ("pit_war", "WAR", "prevention", "dec1"),
    ("pit_brl_pct", "Barrel%", "contactAllowed", "pct1"),
    ("pit_hard_hit_pct", "Hard-hit%", "contactAllowed", "pct1"),
    ("pit_xwoba", "xwOBA", "contactAllowed", "rate3"),
    ("oaa", "OAA", "defense", "int"),
    ("sp_ip_share", "IP share", "rotation", "pct1"), ("sp_era", "ERA", "rotation", "dec2"),
    ("sp_fip", "FIP", "rotation", "dec2"), ("sp_k_bb_pct", "K-BB%", "rotation", "pct1"),
    ("rp_era", "ERA", "bullpen", "dec2"), ("rp_fip", "FIP", "bullpen", "dec2"),
    ("rp_k_bb_pct", "K-BB%", "bullpen", "pct1"),
]
TEAM_FMT = {
    "rate3": r3,
    "pct1": pct,
    "dec2": lambda v: num(v, 2),
    "dec1": lambda v: num(v, 1),
    "int": lambda v: num(v, 0),
}


def team_trends(conn) -> tuple[str, list[dict]]:
    """team_trends.md + the CSV rows: the latest TREND_SEASONS seasons with all 30
    clubs loaded (= getTrendSeasons on the site), Jays value / MLB average / rank."""
    seasons = sorted(r["season"] for r in q(conn, """
        select season from web_team_season_stats group by season
        having count(*) = 30 order by season desc limit %(n)s""", {"n": TREND_SEASONS}))
    if not seasons:
        return "# Team trends\n\nNo team data loaded (run etl/pull_team_stats.py).\n", []
    clubs = q(conn, "select * from web_v_team_season where season = any(%(s)s)", {"s": seasons})
    mlb = {r["season"]: r for r in q(conn, "select * from web_v_mlb_season where season = any(%(s)s)", {"s": seasons})}
    jays = {r["season"]: r for r in clubs if r["team_id"] == JAYS}

    def rank_text(season: int, key: str) -> tuple[int | None, bool, str]:
        rank = jays.get(season, {}).get(f"{key}_rank")
        if rank is None:
            return None, False, ""
        tied = sum(1 for c in clubs if c["season"] == season and c.get(f"{key}_rank") == rank) > 1
        return rank, tied, f" ({'T-' if tied else ''}{ordinal(rank)})"

    span = f"{seasons[0]}–{seasons[-1]}"
    parts = [f"""# Team trends {span} — Blue Jays vs MLB

Regular season. All 30 clubs are loaded; every number below is read from the
migration-022 views (`web_v_team_season`, `web_v_mlb_season`) — the same ones the
site's `/en/team` page reads (zh-TW: `/zh-TW/team`).

- Cell = the Jays' value and their MLB rank that season (**1st = best**; lowest for
  K%, ERA, RA/G …; `T-` = tied).
- **MLB average** = the league's summed totals turned into a rate (never an average of
  team rates). WAR and OAA rows show the mean per club; wRC+ averages ~100 by design.
- Team wRC+ = plate-appearance-weighted average of the club's hitters; team WAR = sum of
  its players (FanGraphs data licensed to MLB). FIP = (13·HR + 3·(BB+HBP) − 2·SO)/IP +
  the season's league constant. Batted-ball mix = MLB's own trajectory classification.
- Why "vs MLB": the 2023 rules (pitch clock, shift limits, bigger bases) lifted steals,
  batting averages and scoring league-wide.

## Record
"""]
    rec_rows = []
    for s in seasons:
        j = jays.get(s, {})
        _, _, rd_rank = rank_text(s, "run_diff")
        rec_rows.append([
            str(s),
            f"{j.get('w')}-{j.get('l')}",
            f"{j.get('x_w')}-{j.get('x_l')}",
            signed(j.get("luck"), 0),
            signed(j.get("run_diff"), 0) + rd_rank,
            signed(j.get("offense_runs"), 0),
            signed(j.get("prevention_runs"), 0),
        ])
    parts.append(md_table(
        ["Season", "W-L", "Expected W-L", "Luck (W − xW)", "Run diff (MLB rank)",
         "Offense runs vs avg", "Run prevention vs avg"], rec_rows))
    parts.append("\nOffense + run prevention = run differential (runs above / below an average "
                 "MLB team over the same games; ~10 runs ≈ 1 win).")

    csv_rows: list[dict] = []
    for group, title in TEAM_GROUPS:
        jays_rows, mlb_rows = [], []
        for key, label, g, fmt in TEAM_METRICS:
            if g != group:
                continue
            show = TEAM_FMT[fmt]
            cells, lg = [], []
            for s in seasons:
                v = jays.get(s, {}).get(key)
                m = mlb.get(s, {}).get(key)
                rank, tied, rt = rank_text(s, key)
                cells.append(show(v) + rt)
                lg.append(show(m))
                csv_rows.append({"season": s, "group": group, "metric": key, "label": label,
                                 "jays": v, "mlb_avg": m, "rank": rank, "tied": tied})
            jays_rows.append([label, *cells])
            mlb_rows.append([label, *lg])
        parts.append(f"\n## {title}\n")
        parts.append(md_table(["Blue Jays", *map(str, seasons)], jays_rows))
        parts.append("\n" + md_table(["MLB average", *map(str, seasons)], mlb_rows))
    return "\n".join(parts) + "\n", csv_rows


def write_team_trends_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["season", "group", "metric", "label", "jays", "mlb_avg", "rank", "tied"])
        w.writeheader()
        w.writerows(rows)


def readme_md(conn, seasons: list[int], team_stats: dict, ref: dict, links: str = "") -> str:
    s, vs = seasons
    freeze = q(conn, """select max(updated_at) as t from web_player_season_stats where season = %(s)s""", {"s": s})[0]["t"]
    split_t = q(conn, """select max(updated_at) as t from web_player_team_season_stats where season = %(s)s""", {"s": s})[0]["t"]
    return f"""# Season review {s} — data pack

Generated {date.today():%Y-%m-%d} by `etl/season_report.py --season {s} --vs {vs}`.
Numbers and definitions only — the prose is yours.

- **Freeze:** season stats last written {freeze:%Y-%m-%d %H:%M} UTC; per-club lines
  {split_t:%Y-%m-%d %H:%M} UTC. Statcast and box scores cover every regular-season game.
- **Sources:** MLB Stats API (season lines, WAR / wRC+ / FIP = FanGraphs data licensed to
  MLB; schedule, box scores, standings) and Baseball Savant (Statcast pitches).

## Files

| File | What |
|---|---|
| `team.md` | Team season, regular season only: record, runs, splits, streaks, months (W-L, RS-RA, R/G, RA/G) |
| `positions.md` | Value by position (HR / OPS / Off / WAR per group, the season page's chart) + each position vs MLB + who made up each group |
| `batters.md` / `.csv` | Every Blue Jays batter in {s} or {vs}, as a Jay; Δ for the both-seasons cohort (the CSV adds Off / Def / OAA) |
| `pitchers.md` / `.csv` | Same for pitchers; `pitchers_arsenal.csv` per pitch type |
| `movers.md` | Biggest risers / fallers in the cohort, velo changes, new pitches |
| `roster_moves.md` | Newcomers, mid-season arrivals and departures **with every club** |
| `league_context.md` | League averages (MLB / AL / NL) + reference rates + the {s} zone-definition caveat |
| `team_trends.md` / `.csv` | P13: the latest five seasons as a team — every stat with the MLB average and the Jays' rank among 30 clubs (same views as `/en/team`) |

## Scopes

- **As a Blue Jay** (`team.md`, `batters`, `pitchers`, `movers`): only games in which
  the player appears in Toronto's box score. A traded player's line with another club
  is excluded, as is a future Jay's game *against* Toronto.
- **All MLB** (`roster_moves.md`): every club, per club and combined.
- Regular season only everywhere; the 2025 postseason is excluded.

## Thresholds

- "Both seasons" cohort: **≥ {MIN_PA} PA** (batters) / **≥ {MIN_IP} IP** (pitchers) as a
  Jay in **each** of {s} and {vs}. Stricter cuts (300 PA / 60 IP) leave too few players.
- NEW / DROPPED pitch: usage 0 in one season, ≥ {NEW_PITCH_USAGE:.0%} in the other.

## Definitions

Discipline and batted-ball numbers come from the database views
`web_v_batter_discipline`, `web_v_pitcher_discipline`, `web_v_batted_ball_profile`
(migration `015`) — the same ones the website reads, so the site and this pack agree.

```
Whiff    = swinging_strike, swinging_strike_blocked, foul_tip, missed_bunt
Swing    = Whiff + foul, hit_into_play, foul_bunt, bunt_foul_tip
In zone  = Savant zone 1-9      Out of zone = zone 11-14 (no zone = excluded)
Chase%   = swings at out-of-zone pitches / out-of-zone pitches
Z-Swing% = swings at in-zone pitches / in-zone pitches
Whiff%   = whiffs / swings      Contact% = 1 - Whiff%
CSW%     = (called strikes + whiffs) / pitches
Zone%    = in-zone pitches / pitches with a zone
1st-pitch swing% / strike% = at 0-0 counts (strike = called strike or any swing)
PA       = pitches ending a plate appearance (truncated_pa excluded)
K% / BB% = strikeouts (incl. K-DP) / PA, walks (incl. IBB) / PA
Pitches  = thrown pitches: pitch-clock automatic balls / strikes are excluded
           (they still count for PA / K / BB when they end a plate appearance)
Batted balls = balls with a Statcast hit location (the site's spray-chart population)
GB / LD / FB / PU (approx.) = launch angle < 10 / 10-25 / 25-50 / > 50 degrees
Sweet-spot% = launch angle 8-32   Hard-hit% = exit velo >= 95 mph
Pull / Center / Oppo = spray angle beyond 15 degrees to the batter's pull side / within
           15 / beyond 15 the other way (by the side he batted from on that pitch)
xwOBAcon = mean Statcast xwOBA on balls put in play
```

## Article-ready links

Every view below is a stable URL — prefix it with the site's domain (e.g.
`https://bluejaysfanweb.vercel.app`). Charts on those pages have a **PNG ↓** button
(caption + source line included) and tables a **Copy table** button (pastes into
a spreadsheet as a real table).

{links}

## Caveats

- **GB/LD/FB/PU are approximations** from launch angle (Savant's batted-ball type is
  not stored). Say "approx." if you quote them. Official Barrel% arrives with M6.
- **Zone-based rates are not comparable raw across {vs}→{s}** — see `league_context.md`.
  Reference Chase% {pct(ref[vs]['chase_pct'])} → {pct(ref[s]['chase_pct'])} on its own.
- **Pitch locations:** {s} Statcast measures plate location at the middle of the plate,
  earlier seasons at the front, so never overlay raw pitch-location plots across seasons.
- WAR / wRC+ / FIP are the MLB Stats API's FanGraphs values at freeze time; FanGraphs
  can revise them slightly after the season.
- Cross-check: team record from game results vs the official standings —
  {"; ".join(f"{yr} {team_stats[yr]['W-L']}" for yr in seasons)} (see `team.md` → Cross-check).
"""


# ---------------------------------------------------------------------------


def run(season: int, vs: int, out_dir: Path) -> None:
    seasons = [season, vs]
    out_dir.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.read_only = True
        ref = reference_rates(conn, seasons)
        shift = {"chase": delta(ref[season]["chase_pct"], ref[vs]["chase_pct"])}
        team_text, team_stats = team_section(conn, seasons)
        bats = load_players(conn, seasons, "batter")
        pits = load_players(conn, seasons, "pitcher")
        ars = load_arsenal(conn, seasons)
        trends_text, trends_rows = team_trends(conn)
        files = {
            "team_trends.md": trends_text,
            "team.md": team_text,
            "positions.md": positions_md(conn, seasons),
            "batters.md": batters_md(bats, seasons, shift),
            "pitchers.md": pitchers_md(pits, ars, seasons),
            "movers.md": movers_md(bats, pits, ars, seasons, shift),
            "roster_moves.md": roster_moves_md(conn, seasons),
            "league_context.md": league_md(ref, seasons, q(conn, """
                select season, league, obp::float8 as obp, slg::float8 as slg, ops::float8 as ops,
                       era::float8 as era, k_pct::float8 as k_pct, bb_pct::float8 as bb_pct
                from web_league_season where season = any(%(s)s)
                order by season desc, array_position(array['MLB','AL','NL'], league)""", {"s": seasons})),
            "README.md": readme_md(conn, seasons, team_stats, ref, article_links(conn, seasons, bats, pits)),
        }
    for name, text in files.items():
        (out_dir / name).write_text(text, encoding="utf-8")
    write_csv(out_dir / "batters.csv", bats, seasons, BAT_LINE + BAT_DERIVED + BAT_DISC + BAT_BIP, "batter")
    write_csv(out_dir / "pitchers.csv", pits, seasons, PIT_LINE + ["d_" + c for c in PIT_DISC], "pitcher")
    write_arsenal_csv(out_dir / "pitchers_arsenal.csv", pits, ars, seasons)
    write_team_trends_csv(out_dir / "team_trends.csv", trends_rows)
    log.info("Wrote %d files to %s", len(files) + 4, out_dir)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--vs", type=int, default=None, help="Comparison season (default: season - 1)")
    ap.add_argument("--out", type=Path, default=None, help="Output dir (default reports/season-review-<season>)")
    args = ap.parse_args(argv)
    vs = args.vs or args.season - 1
    out = args.out or (_HERE.parent / "reports" / f"season-review-{args.season}")
    run(args.season, vs, out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
