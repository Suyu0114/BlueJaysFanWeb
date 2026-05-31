"""Pure transforms on Statcast DataFrames."""

from __future__ import annotations

import pandas as pd


def regular_season_only(df: pd.DataFrame, keep_postseason: bool = False) -> pd.DataFrame:
    """Drop spring training; optionally keep postseason.

    Default: only game_type == 'R' (regular season). Set keep_postseason=True
    for the 2025 playoff backfill, which adds game_type in ('F','D','L','W').
    """
    if keep_postseason:
        return df[df["game_type"].isin(["R", "F", "D", "L", "W"])].copy()
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


def tag_plate_alignment(df: pd.DataFrame) -> pd.DataFrame:
    """Tag every row with the Savant plate_x/plate_z reference frame.

    'middle' for >=2026 (current Savant convention); 'front' for <=2025.
    The PitchDistribution chart must filter to a single value at a time --
    cross-alignment overlays would mis-align by 1-3 inches.
    """
    out = df.copy()
    years = pd.to_datetime(out["game_date"]).dt.year
    out["plate_alignment"] = years.where(years < 2026, other=2026)
    out["plate_alignment"] = out["plate_alignment"].apply(
        lambda y: "middle" if y >= 2026 else "front"
    )
    return out
