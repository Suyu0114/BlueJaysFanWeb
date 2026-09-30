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

Metric definitions are NOT re-implemented here: discipline and batted-ball numbers
come from the migration-015 views (web_v_*), the same ones the site reads. The
only local aggregate is the per-pitch arsenal, which mirrors
web/lib/pitch-arsenal.ts::buildArsenal (swing/whiff flags from web_v_pitch_scoped,
xwOBAcon gated on description = 'hit_into_play').
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from collections import defaultdict
from datetime import date
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
        months: dict[str, list] = defaultdict(list)
        for g in gs:
            m = g["game_date"].month
            key = "Mar/Apr" if m <= 4 else date(2000, m, 1).strftime("%b")
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
            "_months": {k: wl(v) for k, v in months.items()},
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
    month_keys = ["Mar/Apr", "May", "Jun", "Jul", "Aug", "Sep"]
    mrows = [[m, stats[s]["_months"].get(m, "–"), stats[vs]["_months"].get(m, "–")] for m in month_keys]

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

March games are folded into April, as MLB's own splits do.

{md_table(["Month", str(s), str(vs)], mrows)}

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
    lines = [f"- Team season: `/en/season/{s}` (zh-TW: `/zh-TW/season/{s}`)"]
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
| `team.md` | Team season, regular season only: record, runs, splits, streaks, months |
| `batters.md` / `.csv` | Every Blue Jays batter in {s} or {vs}, as a Jay; Δ for the both-seasons cohort |
| `pitchers.md` / `.csv` | Same for pitchers; `pitchers_arsenal.csv` per pitch type |
| `movers.md` | Biggest risers / fallers in the cohort, velo changes, new pitches |
| `roster_moves.md` | Newcomers, mid-season arrivals and departures **with every club** |
| `league_context.md` | League averages (MLB / AL / NL) + reference rates + the {s} zone-definition caveat |

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
        files = {
            "team.md": team_text,
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
    write_csv(out_dir / "batters.csv", bats, seasons, BAT_LINE + BAT_DISC + BAT_BIP, "batter")
    write_csv(out_dir / "pitchers.csv", pits, seasons, PIT_LINE + ["d_" + c for c in PIT_DISC], "pitcher")
    write_arsenal_csv(out_dir / "pitchers_arsenal.csv", pits, ars, seasons)
    log.info("Wrote %d files to %s", len(files) + 3, out_dir)


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
