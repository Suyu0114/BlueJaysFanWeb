"""Apply a plain .sql migration file to the database in DATABASE_URL.

Usage:
    python etl/apply_migration.py db/migrations/001_initial_schema.sql
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env")
load_dotenv(_HERE.parent / ".env")

import psycopg  # noqa: E402


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python apply_migration.py <path-to-.sql>", file=sys.stderr)
        return 2
    sql_path = Path(argv[0])
    if not sql_path.is_absolute():
        sql_path = Path.cwd() / sql_path
    if not sql_path.exists():
        print(f"file not found: {sql_path}", file=sys.stderr)
        return 1

    sql = sql_path.read_text(encoding="utf-8")
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    print(f"Applied {sql_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
