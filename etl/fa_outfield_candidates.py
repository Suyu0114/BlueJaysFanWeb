"""Pending free-agent outfielders (2026-27 class) -> reports/free-agents-2026/
(git-ignored). Research pack for an offseason article; never touches the DB.

Usage:
    python etl/fa_outfield_candidates.py

Writes:
    outfield.csv   one row per player (UTF-8 with BOM so Excel keeps the accents)
    README.md      freeze time, sources, column definitions, caveats

Who: MLB Trade Rumors' position-by-position previews of the class (center field
+ corner outfield) -- tier, 2027 season age, option notes. There is no official
list of *pending* free agents: the MLB Stats API's /people/freeAgents only fills
in after players file (days after the World Series), so it is merged in as the
`official_status` column and the script is meant to be re-run then.

What: each player's full-MLB line for 2026 and 2025 (MLB Stats API; the
season_line.py mapping, so Off / Def / WAR match the site) + 2026 Savant
xwOBA / Barrel% / Hard-hit% / avg EV, outfield OAA / FRV and sprint speed.

No contract dollars: no free source publishes them (Spotrac answers HTTP 402 to
scripts). Add them by hand from MLBTR / Cot's / Spotrac, citing the source.
"""

from __future__ import annotations

import csv
import html
import logging
import re
import sys
import unicodedata
import warnings
from datetime import date, datetime
from pathlib import Path

import requests

from mlb_api import (
    PEOPLE_URL,
    SEASON_TOTAL,
    _get_json,
    fetch_people_details,
    fetch_player_season_splits,
    fetch_player_team_dates,
    fetch_teams,
)
from season_line import has_batting, rate, to_row

from pybaseball import (
    statcast_batter_exitvelo_barrels,
    statcast_batter_expected_stats,
    statcast_outs_above_average,
    statcast_sprint_speed,
)

warnings.filterwarnings("ignore", category=FutureWarning)
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("fa_outfield_candidates")

SEASON = 2026  # the season just played; the class hits the market after it
PRIOR = SEASON - 1
OUT_DIR = Path(__file__).resolve().parent.parent / "reports" / f"free-agents-{SEASON}"

# MLBTR's 2026-27 previews; names within a tier are alphabetical, not ranked.
MLBTR_PREVIEWS = {
    "CF": "https://www.mlbtraderumors.com/2026/09/previewing-the-upcoming-center-field-class.html",
    "Corner OF": "https://www.mlbtraderumors.com/2026/10/previewing-the-upcoming-corner-outfield-class.html",
}

# "Luis Robert Jr. (29) -- $20MM club option with $2MM buyout"
ENTRY = re.compile(r"(?P<name>[^()]+?) \((?P<age>\d{2})\)(?:\s*[-–—]+\s*(?P<note>.+))?")
# Depth tier: "Dylan Carlson (28), Adam Frazier (35), ..."
LIST_ITEM = re.compile(r"(?:^|,\s*)(?P<name>[^,()]+?) \((?P<age>\d{2})\)")
BLOCK = re.compile(r"<(p|li)\b[^>]*>(.*?)</\1>", re.S)
TAG = re.compile(r"<[^>]+>")
UNDERLINE = re.compile(r"</?(?:span|u)\b[^>]*>")  # tiers are sometimes wrapped in an underline span

COLUMNS = [
    "name", "mlbam_id", "mlbtr_class", "mlbtr_tier", "age_2027", "mlbtr_note",
    "official_status", "bats", "throws", "primary_pos", f"teams_{SEASON}",
    f"pa_{SEASON}", f"avg_{SEASON}", f"obp_{SEASON}", f"slg_{SEASON}", f"ops_{SEASON}",
    f"hr_{SEASON}", f"sb_{SEASON}", f"k_pct_{SEASON}", f"bb_pct_{SEASON}",
    f"wrc_plus_{SEASON}", f"off_{SEASON}", f"def_{SEASON}", f"war_{SEASON}",
    f"xwoba_{SEASON}", f"woba_{SEASON}", f"barrel_pct_{SEASON}", f"hard_hit_pct_{SEASON}",
    f"avg_ev_{SEASON}", f"of_oaa_{SEASON}", f"of_frv_{SEASON}", f"sprint_speed_{SEASON}",
    f"pa_{PRIOR}", f"ops_{PRIOR}", f"wrc_plus_{PRIOR}", f"war_{PRIOR}",
]


def text_of(fragment: str) -> str:
    return " ".join(html.unescape(TAG.sub("", fragment)).split())


def parse_preview(page: str, mlbtr_class: str) -> list[dict]:
    """Tiers are bold-only paragraphs; a player is a paragraph that is exactly
    'Name (age)' plus an optional option note, or one item of the depth list."""
    start = page.index('<div class="entry-content">')
    end = page.index('<div class="entry-footer">', start)
    tier, players = None, []
    for tag, inner in BLOCK.findall(page[start:end]):
        inner = UNDERLINE.sub("", inner).strip()
        text = text_of(inner)
        if tag == "li":
            players += [
                {"name": m["name"], "age_2027": int(m["age"]), "mlbtr_class": mlbtr_class,
                 "mlbtr_tier": tier, "mlbtr_note": None}
                for m in LIST_ITEM.finditer(text)
            ]
        elif not inner.startswith("<strong>"):
            continue
        elif m := ENTRY.fullmatch(text):
            players.append(
                {"name": m["name"], "age_2027": int(m["age"]), "mlbtr_class": mlbtr_class,
                 "mlbtr_tier": tier, "mlbtr_note": m["note"]}
            )
        elif re.fullmatch(r"<strong>.*</strong>", inner, re.S):
            tier = text
    return players


def fetch_preview_players() -> list[dict]:
    by_name: dict[str, dict] = {}
    for mlbtr_class, url in MLBTR_PREVIEWS.items():
        r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        r.raise_for_status()
        found = parse_preview(r.text, mlbtr_class)
        log.info("MLBTR %s: %d players", mlbtr_class, len(found))
        for p in found:
            prev = by_name.get(p["name"])
            if prev is None:
                by_name[p["name"]] = p
            else:  # listed in both previews (e.g. a CF who also plays the corners)
                prev["mlbtr_class"] += f" / {mlbtr_class}"
    return list(by_name.values())


def season_age(birthdate: str, season: int) -> int:
    """Baseball season age = age on June 30 of that season."""
    b = date.fromisoformat(birthdate)
    return season - b.year - ((b.month, b.day) > (6, 30))


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def resolve_id(name: str, age_2027: int) -> int | None:
    """MLBAM id by name. Ties (shared names) go to the player whose 2027 season
    age matches MLBTR's; None for players with no MLB record (e.g. NPB)."""
    queries = dict.fromkeys([name, strip_accents(name), re.sub(r"\s+(Jr|Sr|II|III)\.?$", "", name)])
    for q in queries:
        people = [
            p for p in _get_json(f"{PEOPLE_URL}/search", {"names": q}).get("people", [])
            if p.get("isPlayer")
        ]
        if not people:
            continue
        same_age = [p for p in people if p.get("birthDate") and season_age(p["birthDate"], 2027) == age_2027]
        if len(same_age) != 1:
            log.warning("%s: %d search hits, %d with age %d", name, len(people), len(same_age), age_2027)
        return (same_age or people)[0]["id"]
    return None


def batting_line(mlbam_id: int, season: int) -> tuple[dict | None, dict]:
    """(season-total batting row, splits by club) -- row None without a PA."""
    splits = fetch_player_season_splits(mlbam_id, season, groups=("hitting",))
    hitting = splits.get(SEASON_TOTAL, {}).get("hitting")
    if not has_batting(hitting):
        return None, splits
    row = to_row(hitting, None)
    row["k_pct"] = rate(hitting.get("strikeOuts"), hitting.get("plateAppearances"))
    row["bb_pct"] = rate(hitting.get("baseOnBalls"), hitting.get("plateAppearances"))
    return row, splits


def r(v, nd: int):
    return None if v is None else round(v, nd)


def pct(v):
    return None if v is None else round(v * 100, 1)


def plus(a, b):
    return None if a is None or b is None else round(a + b, 1)


def official_status() -> dict[int, str]:
    """Filed / signed per /people/freeAgents (empty until after the World Series)."""
    data = _get_json(f"{PEOPLE_URL}/freeAgents", {"season": SEASON})
    out = {}
    for fa in data.get("freeAgents", []):
        new_team = fa.get("newTeam", {}).get("name")
        notes = (fa.get("notes") or "").strip(" .")
        if new_team:
            out[fa["player"]["id"]] = f"signed {new_team} {fa.get('dateSigned', '')} ({notes})".strip()
        else:
            out[fa["player"]["id"]] = f"filed {fa.get('dateDeclared', '')} {notes}".strip()
    return out


def savant_by_id() -> dict[int, dict]:
    out: dict[int, dict] = {}

    def put(df, mapping):
        for rec in df.to_dict("records"):
            row = out.setdefault(int(rec["player_id"]), {})
            for src, dst in mapping.items():
                v = rec.get(src)
                row[dst] = None if v is None or v != v else v  # NaN -> None

    put(statcast_batter_expected_stats(SEASON, minPA=1), {"est_woba": "xwoba", "woba": "woba"})
    put(statcast_batter_exitvelo_barrels(SEASON, minBBE=1),
        {"brl_percent": "barrel_pct", "ev95percent": "hard_hit_pct", "avg_hit_speed": "avg_ev"})
    put(statcast_outs_above_average(SEASON, pos="of", min_att=1),
        {"outs_above_average": "of_oaa", "fielding_runs_prevented": "of_frv"})
    put(statcast_sprint_speed(SEASON, min_opp=1), {"sprint_speed": "sprint_speed"})
    return out


def build_rows(players: list[dict]) -> list[dict]:
    abbr = {t["id"]: t["abbreviation"] for t in fetch_teams(SEASON)}
    status = official_status()
    savant = savant_by_id()
    for p in players:
        p["mlbam_id"] = resolve_id(p["name"], p["age_2027"])
    bio = fetch_people_details([p["mlbam_id"] for p in players if p["mlbam_id"]])

    rows = []
    for p in players:
        pid = p["mlbam_id"]
        row = {c: None for c in COLUMNS} | {k: p[k] for k in
               ("name", "mlbam_id", "mlbtr_class", "mlbtr_tier", "age_2027", "mlbtr_note")}
        if pid is None:
            log.warning("%s: no MLB player record (NPB / KBO?) -- stats left blank", p["name"])
            rows.append(row)
            continue
        b = bio.get(pid, {})
        row |= {"official_status": status.get(pid), "bats": b.get("bats"),
                "throws": b.get("throws"), "primary_pos": b.get("primary_position")}

        cur, splits = batting_line(pid, SEASON)
        dates = fetch_player_team_dates(pid, SEASON)
        clubs = sorted((t for t in splits if t != SEASON_TOTAL), key=lambda t: dates.get(t, {}).get("first", ""))
        row[f"teams_{SEASON}"] = "/".join(abbr.get(t, str(t)) for t in clubs) or None
        if cur:
            row |= {
                f"pa_{SEASON}": r(cur["pa"], 0), f"avg_{SEASON}": r(cur["avg"], 3),
                f"obp_{SEASON}": r(cur["obp"], 3), f"slg_{SEASON}": r(cur["slg"], 3),
                f"ops_{SEASON}": r(cur["ops"], 3), f"hr_{SEASON}": r(cur["hr"], 0),
                f"sb_{SEASON}": r(cur["sb"], 0), f"k_pct_{SEASON}": pct(cur["k_pct"]),
                f"bb_pct_{SEASON}": pct(cur["bb_pct"]), f"wrc_plus_{SEASON}": r(cur["wrc_plus"], 0),
                # Off = Bat + BsR, Def = Fld + Pos -- as on the site's player stats table
                f"off_{SEASON}": plus(cur["war_batting"], cur["war_baserunning"]),
                f"def_{SEASON}": plus(cur["war_fielding"], cur["war_positional"]),
                f"war_{SEASON}": r(cur["war"], 1),
            }
        sv = savant.get(pid, {})
        row |= {
            f"xwoba_{SEASON}": r(sv.get("xwoba"), 3), f"woba_{SEASON}": r(sv.get("woba"), 3),
            f"barrel_pct_{SEASON}": r(sv.get("barrel_pct"), 1), f"hard_hit_pct_{SEASON}": r(sv.get("hard_hit_pct"), 1),
            f"avg_ev_{SEASON}": r(sv.get("avg_ev"), 1), f"of_oaa_{SEASON}": sv.get("of_oaa"),
            f"of_frv_{SEASON}": sv.get("of_frv"), f"sprint_speed_{SEASON}": r(sv.get("sprint_speed"), 1),
        }
        prior, _ = batting_line(pid, PRIOR)
        if prior:
            row |= {f"pa_{PRIOR}": r(prior["pa"], 0), f"ops_{PRIOR}": r(prior["ops"], 3),
                    f"wrc_plus_{PRIOR}": r(prior["wrc_plus"], 0), f"war_{PRIOR}": r(prior["war"], 1)}
        rows.append(row)
    return rows


README = """# Pending free-agent outfielders, {klass} class

Generated {now} by `etl/fa_outfield_candidates.py`. Re-run after the World Series
to fill `official_status`.

## Sources
- **Who**: MLB Trade Rumors' class previews (tier, 2027 season age, option notes):
{urls}
- **Stats**: MLB Stats API, regular season, all clubs (season total). The
  `sabermetrics` block is FanGraphs data licensed to MLB (wRC+, Off, Def, WAR).
- **Statcast**: Baseball Savant leaderboards (xwOBA, Barrel%, Hard-hit%, avg EV,
  outfield OAA / FRV, sprint speed); blank = no tracked events.
- **official_status**: MLB Stats API `/people/freeAgents?season={season}`.

## Columns
- `age_2027`: MLBTR's age for the 2027 season.
- `mlbtr_note`: option terms as MLBTR lists them (club / mutual / player option).
- `k_pct`, `bb_pct`, `barrel_pct`, `hard_hit_pct`: percent units (22.4 = 22.4%).
  Hard-hit = batted balls 95+ mph.
- `off` = batting + baserunning runs, `def` = fielding + positional runs (FanGraphs
  components, same as the site's player stats table).
- `of_oaa` / `of_frv`: Savant Outs Above Average / Fielding Run Value, outfield only.

## Caveats
- No contract dollars: no free source publishes them. Add them by hand (MLBTR's
  Contract Tracker, Cot's Baseball Contracts, Spotrac), citing the source per row.
- Players with no MLB record (NPB postings) have blank stats; NPB lines don't
  translate one-to-one to MLB.
- Club / mutual options are decided after the World Series; a listed player may
  never reach the market.
- The CBA expires 2026-12-01. A lockout would freeze signings and trades.
"""


def main() -> int:
    players = fetch_preview_players()
    rows = build_rows(players)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with (OUT_DIR / "outfield.csv").open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    (OUT_DIR / "README.md").write_text(
        README.format(
            klass=f"{SEASON}-{str(SEASON + 1)[-2:]}",
            now=datetime.now().strftime("%Y-%m-%d %H:%M"),
            urls="\n".join(f"  - {k}: {u}" for k, u in MLBTR_PREVIEWS.items()),
            season=SEASON,
        ),
        encoding="utf-8",
    )
    log.info("Wrote %d players to %s", len(rows), OUT_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
