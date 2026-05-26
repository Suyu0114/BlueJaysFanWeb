"""Pure transforms on Statcast DataFrames."""

from __future__ import annotations

import pandas as pd


def regular_season_only(df: pd.DataFrame) -> pd.DataFrame:
    """Drop spring training and playoff rows (keep only game_type == 'R')."""
    return df[df["game_type"] == "R"].copy()


def to_field_feet(df: pd.DataFrame) -> pd.DataFrame:
    """Add hc_x_feet, hc_y_feet columns transformed from raw Statcast units.

    Origin = home plate. Positive y = toward center field.
    NaN inputs (strikeouts/walks with no ball in play) propagate to NaN outputs.
    """
    out = df.copy()
    out["hc_x_feet"] = 2.5 * (out["hc_x"] - 125.42)
    out["hc_y_feet"] = 2.5 * (198.27 - out["hc_y"])
    return out
