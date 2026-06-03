"""Pull per-game box-score lines for Blue Jays players and upsert
web_player_game_stats. Only FINAL games are ingested; the final-game guard
reads web_games (so pull_schedule.py must run first -- the backfill and cron
order guarantee this).

Usage:
    python etl/pull_boxscore.py --game-pk 778156     # one game
    python etl/pull_boxscore.py --date 2025-04-27     # all finals on a date
    python etl/pull_boxscore.py --recent 3            # finals in the last 3 days
    python etl/pull_boxscore.py                       # default: --recent 1

Unknown-player handling (required, spec §7.5): a mid-season call-up / trade
acquisition may not be in web_players yet, and web_player_game_stats.mlbam_id is
an FK. We PRE-CHECK with a SELECT, fetch bio from the MLB Stats API for any
missing ids, and insert them into web_players BEFORE the game stats -- we do not
rely on catching FK violations for control flow.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

from db import connect, upsert_player_game_stats, upsert_players_full  # noqa: E402
from mlb_api import fetch_boxscore, fetch_people_details  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
)
log = logging.getLogger("pull_boxscore")


def _targets(conn, *, game_pk, on_date, recent, season) -> list[int]:
    """Resolve the list of FINAL game_pks to ingest, from web_games."""
    with conn.cursor() as cur:
        if game_pk is not None:
            cur.execute(
                "select is_final from web_games where game_pk = %s", (game_pk,)
            )
            row = cur.fetchone()
            if row is None:
                log.warning(
                    "game_pk %s not in web_games -- run pull_schedule first. Skipping.",
                    game_pk,
                )
                return []
            if not row[0]:
                log.warning("game_pk %s is not final yet; skipping.", game_pk)
                return []
            return [game_pk]

        if on_date is not None:
            cur.execute(
                "select game_pk from web_games "
                "where game_date = %s and is_final order by game_number",
                (on_date,),
            )
            return [r[0] for r in cur.fetchall()]

        if season is not None:
            # All finals of a season (used by backfill.py).
            cur.execute(
                "select game_pk from web_games "
                "where season = %s and is_final order by game_date, game_number",
                (season,),
            )
            return [r[0] for r in cur.fetchall()]

        # --recent N: finals on/after today-N.
        since = date.today() - timedelta(days=recent)
        cur.execute(
            "select game_pk from web_games "
            "where is_final and game_date >= %s order by game_date, game_number",
            (since,),
        )
        return [r[0] for r in cur.fetchall()]


def _ensure_players(conn, players: list[dict]) -> None:
    """Insert any box-score players not already in web_players (FK precondition).

    Pre-check: SELECT the ids already present, fetch bio for the rest, upsert.
    """
    ids = [p["mlbam_id"] for p in players if p["mlbam_id"] is not None]
    if not ids:
        return
    with conn.cursor() as cur:
        cur.execute("select mlbam_id from web_players where mlbam_id = any(%s)", (ids,))
        known = {r[0] for r in cur.fetchall()}
    missing = [pid for pid in ids if pid not in known]
    if not missing:
        return

    log.info("Inserting %d unknown player(s) before game stats: %s", len(missing), missing)
    details = fetch_people_details(missing)
    name_by_id = {p["mlbam_id"]: p["name"] for p in players}
    rows = []
    for pid in missing:
        d = details.get(pid, {})
        rows.append(
            {
                "mlbam_id": pid,
                # fetch_people_details has no name field; the boxscore does.
                "name": name_by_id.get(pid) or str(pid),
                "position": d.get("primary_position"),
                "bats": d.get("bats"),
                "throws": d.get("throws"),
                "birthdate": d.get("birthdate"),
                "birth_city": d.get("birth_city"),
                "birth_state_province": d.get("birth_state_province"),
                "birth_country": d.get("birth_country"),
                "headshot_url": d.get("headshot_url"),
            }
        )
    upsert_players_full(conn, rows)


def _stat_rows(game_pk: int, players: list[dict]) -> list[dict]:
    """Flatten parsed box-score players into web_player_game_stats rows
    (one per stat_group; a two-way player => two rows)."""
    rows: list[dict] = []
    for p in players:
        if p["mlbam_id"] is None:
            continue
        if p["batting"]:
            rows.append(
                {"game_pk": game_pk, "mlbam_id": p["mlbam_id"], "stat_group": "batting",
                 **p["batting"]}
            )
        if p["pitching"]:
            rows.append(
                {"game_pk": game_pk, "mlbam_id": p["mlbam_id"], "stat_group": "pitching",
                 **p["pitching"]}
            )
    return rows


def run(*, game_pk=None, on_date=None, recent=None, season=None) -> None:
    """Ingest box scores for FINAL games selected by exactly one of:
    game_pk / on_date / season / recent. Defaults to recent=1 if none given."""
    if game_pk is None and on_date is None and recent is None and season is None:
        recent = 1  # default: today + yesterday
    with connect() as conn:
        pks = _targets(conn, game_pk=game_pk, on_date=on_date, recent=recent, season=season)
        if not pks:
            log.info("No final games to ingest.")
            return

        log.info("Ingesting box scores for %d game(s)", len(pks))
        total = 0
        for pk in pks:
            box = fetch_boxscore(pk)
            players = box["players"]
            if not players:
                log.warning("game_pk %s: no Jays players parsed; skipping", pk)
                continue
            _ensure_players(conn, players)
            rows = _stat_rows(pk, players)
            upsert_player_game_stats(conn, rows)
            total += len(rows)
            log.info(
                "game_pk %s: upserted %d stat rows (%d players)",
                pk, len(rows), len(players),
            )
        conn.commit()
    log.info("Done. %d total stat rows.", total)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--game-pk", type=int, help="Single game")
    g.add_argument("--date", type=date.fromisoformat, help="All finals on YYYY-MM-DD")
    g.add_argument("--recent", type=int, help="Finals in the last N days")
    g.add_argument("--season", type=int, help="All finals of a season (backfill)")
    args = ap.parse_args(argv)
    run(game_pk=args.game_pk, on_date=args.date, recent=args.recent, season=args.season)
    return 0


if __name__ == "__main__":
    sys.exit(main())
