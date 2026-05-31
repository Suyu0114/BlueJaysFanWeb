"""FanGraphs IDfg -> MLBAM id mapping, backed by the Chadwick Bureau register
cached in web_id_map.

Usage:
    from idmap import resolve_fangraphs_ids
    mlbam_for_idfg = resolve_fangraphs_ids(conn, [20123, 19755, ...])
    # -> {20123: 665489, 19755: 592332, ...}

If the cache misses for any input ID, the full Chadwick register is refreshed
from pybaseball and persisted to web_id_map before re-trying. This keeps the
hot path fast while still self-healing when a new rookie shows up.
"""

from __future__ import annotations

import logging
from typing import Iterable

import pandas as pd

from db import upsert_id_map

log = logging.getLogger("idmap")


def _refresh_register(conn) -> int:
    """Pull the full Chadwick register and overwrite web_id_map. Returns the
    number of rows upserted."""
    # Imported lazily so this module is importable without pybaseball when only
    # the cached lookup is needed (the cache hit path doesn't need the package).
    from pybaseball import chadwick_register

    log.info("Refreshing Chadwick register (this can take 10-30s on first call)")
    df: pd.DataFrame = chadwick_register()
    log.info("Chadwick register has %d rows", len(df))

    df = df.dropna(subset=["key_mlbam"])  # only rows with an MLBAM id matter to us
    rows = [
        {
            "key_mlbam": int(r.key_mlbam),
            "key_fangraphs": int(r.key_fangraphs) if pd.notna(r.key_fangraphs) else None,
            "key_bbref": (str(r.key_bbref) if pd.notna(r.key_bbref) else None),
            "name_first": (str(r.name_first) if pd.notna(r.name_first) else None),
            "name_last": (str(r.name_last) if pd.notna(r.name_last) else None),
        }
        for r in df.itertuples(index=False)
    ]
    n = upsert_id_map(conn, rows)
    log.info("Upserted %d Chadwick rows into web_id_map", n)
    return n


def _lookup_from_cache(conn, idfgs: list[int]) -> dict[int, int]:
    if not idfgs:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            "select key_fangraphs, key_mlbam from web_id_map "
            "where key_fangraphs = any(%s)",
            (idfgs,),
        )
        return {int(idfg): int(mlbam) for idfg, mlbam in cur.fetchall() if idfg is not None}


def resolve_fangraphs_ids(conn, idfgs: Iterable[int]) -> dict[int, int]:
    """Return {key_fangraphs: key_mlbam} for as many inputs as we can resolve.

    Misses cause one register refresh from pybaseball; if a value is still
    missing after that, it's simply absent from the returned dict and the
    caller decides what to do (skip / fuzzy-match / log).
    """
    idfgs = [int(x) for x in idfgs if x is not None]
    if not idfgs:
        return {}

    hit = _lookup_from_cache(conn, idfgs)
    missing = [x for x in idfgs if x not in hit]
    if not missing:
        return hit

    log.info("Cache miss for %d FanGraphs ids; refreshing register", len(missing))
    _refresh_register(conn)
    conn.commit()
    hit = _lookup_from_cache(conn, idfgs)
    still_missing = [x for x in idfgs if x not in hit]
    if still_missing:
        log.warning(
            "Could not map %d FanGraphs ids even after refresh: %s",
            len(still_missing),
            still_missing[:10],
        )
    return hit
