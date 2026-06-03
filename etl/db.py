"""Postgres helpers: connection + upsert routines for players and statcast_events.

Connects via DATABASE_URL (Supabase Postgres connection string).
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterable

import pandas as pd
import psycopg


DATABASE_URL = os.environ["DATABASE_URL"]


@contextmanager
def connect():
    # prepare_threshold=None disables psycopg's automatic prepared statements.
    # Supabase's pooler (port 6543) runs PgBouncer in transaction mode, which
    # recycles connections between transactions and chokes on cached statement
    # names with "DuplicatePreparedStatement: _pg3_0 already exists".
    with psycopg.connect(DATABASE_URL, prepare_threshold=None) as conn:
        yield conn


def _to_python(value: Any) -> Any:
    """Convert pandas/numpy scalars to plain Python; NaN/NaT → None."""
    if value is None:
        return None
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def upsert_players(conn, rows: Iterable[dict]) -> int:
    """Insert players; on conflict, only fill name if the existing one is blank."""
    sql = """
        insert into web_players (mlbam_id, name)
        values (%(mlbam_id)s, %(name)s)
        on conflict (mlbam_id) do update
        set name = excluded.name
        where web_players.name is null or web_players.name = ''
    """
    rows = list(rows)
    if not rows:
        return 0
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount


def upsert_players_full(conn, rows: Iterable[dict]) -> int:
    """Upsert full player bio (used by roster.py and pull_team_players.py).

    Each row must include: mlbam_id, name. Optional: position, bats, throws,
    headshot_url, birthdate, birth_city, birth_state_province, birth_country.
    Caller is responsible for setting is_active_26 separately if needed.
    """
    sql = """
        insert into web_players
          (mlbam_id, name, position, bats, throws,
           headshot_url, birthdate,
           birth_city, birth_state_province, birth_country)
        values
          (%(mlbam_id)s, %(name)s, %(position)s, %(bats)s, %(throws)s,
           %(headshot_url)s, %(birthdate)s,
           %(birth_city)s, %(birth_state_province)s, %(birth_country)s)
        on conflict (mlbam_id) do update set
          name                 = excluded.name,
          position             = coalesce(excluded.position, web_players.position),
          bats                 = coalesce(excluded.bats, web_players.bats),
          throws               = coalesce(excluded.throws, web_players.throws),
          headshot_url         = coalesce(excluded.headshot_url, web_players.headshot_url),
          birthdate            = coalesce(excluded.birthdate, web_players.birthdate),
          birth_city           = coalesce(excluded.birth_city, web_players.birth_city),
          birth_state_province = coalesce(excluded.birth_state_province, web_players.birth_state_province),
          birth_country        = coalesce(excluded.birth_country, web_players.birth_country)
    """
    rows = [_full_player_row(r) for r in rows]
    if not rows:
        return 0
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount


def _full_player_row(r: dict) -> dict:
    return {
        "mlbam_id": r["mlbam_id"],
        "name": r["name"],
        "position": r.get("position"),
        "bats": r.get("bats"),
        "throws": r.get("throws"),
        "headshot_url": r.get("headshot_url"),
        "birthdate": r.get("birthdate"),
        "birth_city": r.get("birth_city"),
        "birth_state_province": r.get("birth_state_province"),
        "birth_country": r.get("birth_country"),
    }


def upsert_player_seasons(conn, rows: Iterable[dict]) -> int:
    """Upsert into web_player_seasons.

    Each row: mlbam_id, season, team_id (default 141),
    appeared_as_batter, appeared_as_pitcher, is_active_26.
    """
    sql = """
        insert into web_player_seasons
          (mlbam_id, season, team_id,
           appeared_as_batter, appeared_as_pitcher, is_active_26)
        values
          (%(mlbam_id)s, %(season)s, %(team_id)s,
           %(appeared_as_batter)s, %(appeared_as_pitcher)s, %(is_active_26)s)
        on conflict (mlbam_id, season, team_id) do update set
          appeared_as_batter  = web_player_seasons.appeared_as_batter  or excluded.appeared_as_batter,
          appeared_as_pitcher = web_player_seasons.appeared_as_pitcher or excluded.appeared_as_pitcher,
          is_active_26        = web_player_seasons.is_active_26        or excluded.is_active_26,
          updated_at          = now()
    """
    rows = [
        {
            "mlbam_id": r["mlbam_id"],
            "season": r["season"],
            "team_id": r.get("team_id", 141),
            "appeared_as_batter": bool(r.get("appeared_as_batter", False)),
            "appeared_as_pitcher": bool(r.get("appeared_as_pitcher", False)),
            "is_active_26": bool(r.get("is_active_26", False)),
        }
        for r in rows
    ]
    if not rows:
        return 0
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount


def upsert_id_map(conn, rows: Iterable[dict]) -> int:
    """Upsert into web_id_map (Chadwick register cache)."""
    sql = """
        insert into web_id_map (key_mlbam, key_fangraphs, key_bbref, name_first, name_last)
        values (%(key_mlbam)s, %(key_fangraphs)s, %(key_bbref)s, %(name_first)s, %(name_last)s)
        on conflict (key_mlbam) do update set
          key_fangraphs = excluded.key_fangraphs,
          key_bbref     = excluded.key_bbref,
          name_first    = excluded.name_first,
          name_last     = excluded.name_last,
          refreshed_at  = now()
    """
    rows = list(rows)
    if not rows:
        return 0
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount


# --- P7: schedule + per-game box score -------------------------------------

def upsert_games(conn, rows: Iterable[dict]) -> int:
    """Upsert into web_games keyed on game_pk.

    Each row: game_pk, season, game_date, first_pitch_utc, game_number,
    doubleheader, is_home, opponent_id, opponent_name, jays_score, opp_score,
    status, is_final, result, venue. (pull_schedule.py builds these.)
    """
    sql = """
        insert into web_games
          (game_pk, season, game_date, first_pitch_utc, game_number,
           doubleheader, is_home, opponent_id, opponent_name,
           jays_score, opp_score, status, is_final, result, venue)
        values
          (%(game_pk)s, %(season)s, %(game_date)s, %(first_pitch_utc)s, %(game_number)s,
           %(doubleheader)s, %(is_home)s, %(opponent_id)s, %(opponent_name)s,
           %(jays_score)s, %(opp_score)s, %(status)s, %(is_final)s, %(result)s, %(venue)s)
        on conflict (game_pk) do update set
          season          = excluded.season,
          game_date       = excluded.game_date,
          first_pitch_utc = excluded.first_pitch_utc,
          game_number     = excluded.game_number,
          doubleheader    = excluded.doubleheader,
          is_home         = excluded.is_home,
          opponent_id     = excluded.opponent_id,
          opponent_name   = excluded.opponent_name,
          jays_score      = excluded.jays_score,
          opp_score       = excluded.opp_score,
          status          = excluded.status,
          is_final        = excluded.is_final,
          result          = excluded.result,
          venue           = excluded.venue,
          updated_at      = now()
    """
    rows = list(rows)
    if not rows:
        return 0
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount


# All non-key columns; callers pass partial dicts (a batting row leaves the p_*
# columns absent and vice-versa) and the normalizer fills the rest with None.
PLAYER_GAME_STAT_COLUMNS = [
    "game_pk", "mlbam_id", "stat_group",
    "pa", "ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb", "hbp",
    "outs_recorded", "bf", "p_h", "p_r", "er", "p_bb", "p_so", "p_hr",
    "pitches", "strikes", "decision",
]


def upsert_player_game_stats(conn, rows: Iterable[dict]) -> int:
    """Upsert into web_player_game_stats keyed on (game_pk, mlbam_id, stat_group).

    Rows may be partial (batting rows omit p_* columns and vice-versa); missing
    columns are stored as NULL.
    """
    rows = list(rows)
    if not rows:
        return 0
    cols = ", ".join(PLAYER_GAME_STAT_COLUMNS)
    placeholders = ", ".join(f"%({c})s" for c in PLAYER_GAME_STAT_COLUMNS)
    key_cols = {"game_pk", "mlbam_id", "stat_group"}
    set_clause = ", ".join(
        f"{c} = excluded.{c}" for c in PLAYER_GAME_STAT_COLUMNS if c not in key_cols
    )
    sql = f"""
        insert into web_player_game_stats ({cols}, updated_at)
        values ({placeholders}, now())
        on conflict (game_pk, mlbam_id, stat_group) do update set
          {set_clause},
          updated_at = now()
    """
    norm = [{c: r.get(c) for c in PLAYER_GAME_STAT_COLUMNS} for r in rows]
    with conn.cursor() as cur:
        cur.executemany(sql, norm)
        return cur.rowcount


# DataFrame columns expected after normalization.
STATCAST_COLUMNS = [
    "game_pk", "game_date", "game_type",
    "batter_id", "pitcher_id",
    "at_bat_number", "pitch_number",
    "event", "description",
    "pitch_type", "release_speed", "spin_rate",
    "plate_x", "plate_z", "plate_alignment",
    "hc_x_feet", "hc_y_feet",
    "launch_speed", "launch_angle",
    "stand", "p_throws", "zone",
]


def upsert_statcast_events(conn, df: pd.DataFrame) -> int:
    """Upsert rows into statcast_events keyed on
    (game_pk, batter_id, pitcher_id, at_bat_number, pitch_number).
    """
    if df.empty:
        return 0

    cols = ", ".join(STATCAST_COLUMNS)
    placeholders = ", ".join(["%s"] * len(STATCAST_COLUMNS))
    key_cols = {"game_pk", "batter_id", "pitcher_id", "at_bat_number", "pitch_number"}
    set_clause = ", ".join(
        f"{c} = excluded.{c}" for c in STATCAST_COLUMNS if c not in key_cols
    )
    sql = f"""
        insert into web_statcast_events ({cols})
        values ({placeholders})
        on conflict (game_pk, batter_id, pitcher_id, at_bat_number, pitch_number)
        do update set {set_clause}
    """

    subset = df[STATCAST_COLUMNS]
    rows = [
        tuple(_to_python(v) for v in record)
        for record in subset.itertuples(index=False, name=None)
    ]
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
        return cur.rowcount
