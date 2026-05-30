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


# DataFrame columns expected after normalization.
STATCAST_COLUMNS = [
    "game_pk", "game_date", "game_type",
    "batter_id", "pitcher_id",
    "at_bat_number", "pitch_number",
    "event", "description",
    "pitch_type", "release_speed", "spin_rate",
    "plate_x", "plate_z",
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
