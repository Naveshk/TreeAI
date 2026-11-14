"""Dataset profiling: counts, statistics, target suitability and warnings.

Pure pandas logic. The returned dict is JSON-safe (no NumPy scalars, NaN or infinity),
which `json.dumps(..., allow_nan=False)` verifies in the tests.
"""

import math
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd

from app.ml.type_inference import (
    ColumnKind,
    infer_column_kind,
    parse_iso_datetimes,
)

MAX_CLASSES = 50
REGRESSION_SUGGEST_MIN_UNIQUE = 20
HIGH_MISSING_RATIO = 0.5
SAMPLE_VALUES = 5
TOP_VALUES = 10

_UNSUITABLE_TARGET_REASONS: dict[str, str] = {
    "constant": "The column has only one distinct value.",
    "id_like": "The column looks like an identifier (every value is unique).",
    "datetime": "Date/time columns cannot be used as a target.",
    "text": "Free-text columns with many distinct values cannot be used as a target.",
}


def to_jsonable(value: Any) -> Any:
    """Convert pandas/NumPy values to plain JSON types; NaN/inf/NA/NaT become None."""
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return str(value)


def _round(value: Any, digits: int = 6) -> float | None:
    number = to_jsonable(value)
    return None if number is None else round(float(number), digits)


def _numeric_stats(series: pd.Series) -> dict[str, float | None]:
    values = series.dropna().astype(float)
    if values.empty:
        return dict.fromkeys(("mean", "std", "min", "q1", "median", "q3", "max"))
    return {
        "mean": _round(values.mean()),
        "std": _round(values.std()) if len(values) > 1 else None,
        "min": _round(values.min()),
        "q1": _round(values.quantile(0.25)),
        "median": _round(values.median()),
        "q3": _round(values.quantile(0.75)),
        "max": _round(values.max()),
    }


def _top_values(series: pd.Series) -> list[dict[str, Any]]:
    counts = series.dropna().value_counts().head(TOP_VALUES)
    return [{"value": to_jsonable(v), "count": int(c)} for v, c in counts.items()]


def _datetime_range(series: pd.Series) -> dict[str, str | None]:
    parsed = parse_iso_datetimes(series.dropna())
    parsed = parsed.dropna()
    if parsed.empty:
        return {"min": None, "max": None}
    return {"min": to_jsonable(parsed.min()), "max": to_jsonable(parsed.max())}


def _has_non_integer_values(series: pd.Series) -> bool:
    values = series.dropna().astype(float)
    return bool((values != np.floor(values)).any())


def target_suitability(series: pd.Series, kind: ColumnKind, n_unique: int) -> dict[str, Any]:
    """Whether a column can serve as a classification and/or regression target.

    Full training-configuration validation happens in M4; this only describes the column.
    """
    missing = int(series.isna().sum())
    if kind in _UNSUITABLE_TARGET_REASONS:
        return {
            "classification": False,
            "regression": False,
            "suggested_task": None,
            "missing_target_rows": missing,
            "reason": _UNSUITABLE_TARGET_REASONS[kind],
        }

    classification = 2 <= n_unique <= MAX_CLASSES
    regression = kind == "numeric" and n_unique >= 2

    suggested: str | None
    if regression and (n_unique > REGRESSION_SUGGEST_MIN_UNIQUE or _has_non_integer_values(series)):
        suggested = "regression"
    elif classification:
        suggested = "classification"
    elif regression:
        suggested = "regression"
    else:
        suggested = None

    reason = None
    if not classification and not regression:
        reason = f"Too many distinct values for classification ({n_unique} > {MAX_CLASSES})."
    return {
        "classification": classification,
        "regression": regression,
        "suggested_task": suggested,
        "missing_target_rows": missing,
        "reason": reason,
    }


def profile_column(series: pd.Series, position: int, n_rows: int) -> dict[str, Any]:
    kind = infer_column_kind(series)
    non_null = series.dropna()
    n_unique = int(non_null.nunique())
    missing = int(series.isna().sum())

    return {
        "position": position,
        "name": str(series.name),
        "dtype": str(series.dtype),
        "inferred_kind": kind,
        "missing_count": missing,
        "missing_pct": round(100 * missing / n_rows, 4) if n_rows else 0.0,
        "unique_count": n_unique,
        "sample_values": [to_jsonable(v) for v in non_null.unique()[:SAMPLE_VALUES]],
        "numeric_stats": _numeric_stats(series) if kind == "numeric" else None,
        "top_values": (
            _top_values(series) if kind in ("categorical", "boolean", "text", "constant") else None
        ),
        "datetime_range": _datetime_range(series) if kind == "datetime" else None,
        "target": target_suitability(series, kind, n_unique),
    }


def _warnings(columns: list[dict[str, Any]], duplicate_rows: int) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    for col in columns:
        name = col["name"]
        if col["inferred_kind"] == "id_like":
            warnings.append(
                {
                    "code": "ID_LIKE_COLUMN",
                    "column": name,
                    "message": f"'{name}' looks like an identifier and should not be used as a "
                    "feature or target.",
                }
            )
        elif col["inferred_kind"] == "constant":
            warnings.append(
                {
                    "code": "CONSTANT_COLUMN",
                    "column": name,
                    "message": f"'{name}' has at most one distinct value "
                    "and carries no information.",
                }
            )
        if col["missing_pct"] > 100 * HIGH_MISSING_RATIO:
            warnings.append(
                {
                    "code": "HIGH_MISSING",
                    "column": name,
                    "message": f"'{name}' is missing {col['missing_pct']:.1f}% of its values.",
                }
            )
    if duplicate_rows:
        warnings.append(
            {
                "code": "DUPLICATE_ROWS",
                "column": None,
                "message": f"The dataset contains {duplicate_rows} duplicate row(s). "
                "Copies may land in both the training and test split and inflate "
                "evaluation metrics.",
            }
        )
    return warnings


def profile_dataframe(frame: pd.DataFrame) -> dict[str, Any]:
    n_rows, n_cols = frame.shape
    columns = [
        profile_column(frame[name], position, n_rows) for position, name in enumerate(frame.columns)
    ]
    duplicate_rows = int(frame.duplicated().sum())
    total_missing = int(frame.isna().sum().sum())
    total_cells = n_rows * n_cols
    return {
        "n_rows": int(n_rows),
        "n_cols": int(n_cols),
        "duplicate_rows": duplicate_rows,
        "total_missing": total_missing,
        "missing_pct": round(100 * total_missing / total_cells, 4) if total_cells else 0.0,
        "columns": columns,
        "warnings": _warnings(columns, duplicate_rows),
    }
