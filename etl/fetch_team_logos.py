"""ONE-SHOT: download the 30 MLB cap logos and recolour them to the site palette.

Usage:
    python etl/fetch_team_logos.py

Source: https://www.mlbstatic.com/team-logos/team-cap-on-light/{team_id}.svg
Writes: web/public/team-logos/{team_id}.svg  (COMMITTED to the repo)

Run this ONCE. The output is checked in and served as a static asset, so this
script must never be added to .github/workflows/etl.yml -- it is not part of the
nightly refresh.

Why recolour at fetch time instead of in CSS: the source SVG paints its interior
detail with fill="#fff". A CSS mask-image or filter:brightness(0) folds those
white paths into the alpha channel and flattens the mark into an unreadable
blob. Rewriting the fills keeps the two-tone structure -- ink where the club
colour was, paper where the white was -- which reads as a woodcut / hand-drawn
stamp and matches the site's parchment chrome (locked P11 D5).
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from pathlib import Path

import requests

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("fetch_team_logos")

LOGO_URL = "https://www.mlbstatic.com/team-logos/team-cap-on-light/{id}.svg"
TEAMS_URL = "https://statsapi.mlb.com/api/v1/teams?sportId=1"

# Keep in sync with the @theme block in web/app/globals.css.
INK = "#003049"  # navy
PAPER = "#fdf0d5"  # papaya

_WHITE = {"#fff", "#ffffff", "white"}
# Two colour forms in the wild, both seen across the 30 clubs:
#   1. a fill="#134a8e" attribute on the path            (28 clubs)
#   2. a `.cls-1 { fill: #0031a7; }` rule inside <defs><style>  (KC 118, WSH 120)
# Handling only the first silently leaves those two clubs in their own colours.
_FILL_ATTR_RE = re.compile(r'fill="([^"]*)"', re.IGNORECASE)
_FILL_CSS_RE = re.compile(r"fill\s*:\s*([^;}\s]+)", re.IGNORECASE)

_HERE = Path(__file__).resolve().parent
OUT_DIR = _HERE.parent / "web" / "public" / "team-logos"


def recolour(svg: str) -> str:
    """Every non-white fill -> INK, every white fill -> PAPER.

    Covers BOTH colour forms: the fill="..." attribute and `fill: ...` inside a
    <defs><style> rule (or a style="" attribute). Attribute-only matching leaves
    the CSS-class clubs (KC 118, WSH 120) in their original colours.

    `fill="none"` / `fill: none` is left alone: it means "don't paint", not
    "paint white", and overriding it would fill shapes meant to be open.
    """

    def pick(value: str) -> str:
        return PAPER if value.strip().lower() in _WHITE else INK

    def sub_attr(m: re.Match[str]) -> str:
        value = m.group(1).strip().lower()
        if value == "none":
            return m.group(0)
        return f'fill="{pick(value)}"'

    def sub_css(m: re.Match[str]) -> str:
        value = m.group(1).strip().lower()
        if value == "none":
            return m.group(0)
        return f"fill: {pick(value)}"

    return _FILL_CSS_RE.sub(sub_css, _FILL_ATTR_RE.sub(sub_attr, svg))


def fetch_team_ids() -> list[int]:
    r = requests.get(TEAMS_URL, timeout=30)
    r.raise_for_status()
    return sorted(t["id"] for t in r.json().get("teams", []))


def run(out_dir: Path = OUT_DIR) -> None:
    team_ids = fetch_team_ids()
    log.info("Fetching %d cap logos -> %s", len(team_ids), out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    for team_id in team_ids:
        r = requests.get(LOGO_URL.format(id=team_id), timeout=30)
        if r.status_code != 200:
            log.warning("No cap logo for team %s (HTTP %s)", team_id, r.status_code)
            continue
        svg = recolour(r.text)
        (out_dir / f"{team_id}.svg").write_text(svg, encoding="utf-8")
        written += 1

    log.info("Wrote %d recoloured logos (ink %s / paper %s)", written, INK, PAPER)
    if written != len(team_ids):
        log.warning(
            "%d of %d logos missing -- TeamLogo.tsx falls back to the abbr badge",
            len(team_ids) - written, len(team_ids),
        )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--out", type=Path, default=OUT_DIR, help="output directory for the SVGs"
    )
    args = ap.parse_args(argv)
    run(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
