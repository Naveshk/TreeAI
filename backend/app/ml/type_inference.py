"""Infer a semantic kind for each column. Pure pandas logic.

Rules are applied to non-missing values, in this order:
  1. constant    - at most one distinct value (includes entirely-missing columns)
  2. boolean     - bool dtype
  3. id_like     - no missing values, all values distinct, >= 20 rows, and either text or
                   integers forming a consecutive run (e.g. 1..n); arbitrary unique
                   integers such as prices stay numeric
  4. boolean     - text with exactly two values from {true,false} {yes,no} {t,f} {y,n}
  5. numeric     - any numeric dtype (low-cardinality numbers stay numeric; the user may
                   override to categorical per model in M4)
  6. datetime    - text where >= 90% of values are ISO-8601 dates/datetimes
  7. categorical - text with <= 100 distinct values
  8. text        - text with more distinct values

dtype checks use pandas.api.types helpers (never dtype-name strings), so the logic works
with pandas 3's default `str` dtype as well as legacy `object` columns.
"""

import re
from typing import Literal

import pandas as pd
from pandas.api import types as ptypes

ColumnKind = Literal["constant", "id_like", "boolean", "numeric", "datetime", "categorical", "text"]

ID_LIKE_MIN_ROWS = 20
CATEGORICAL_MAX_UNIQUE = 100
DATETIME_MIN_RATIO = 0.9
_BOOLEAN_PAIRS = ({"true", "false"}, {"yes", "no"}, {"t", "f"}, {"y", "n"})
_BOOLEAN_MAX_RAW_VALUES = 10  # e.g. yes/Yes/YES/no/No/NO spelling variants
_ISO_DATETIME = re.compile(
    r"^\d{4}-\d{2}-\d{2}"
    r"([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$"
)


def is_text(series: pd.Series) -> bool:
    return bool(ptypes.is_string_dtype(series) or ptypes.is_object_dtype(series))


def is_numeric(series: pd.Series) -> bool:
    return bool(ptypes.is_numeric_dtype(series) and not ptypes.is_bool_dtype(series))


def parse_iso_datetimes(values: pd.Series) -> pd.Series:
    """Parse ISO-8601 strings; non-matching values become NaT."""
    as_str = values.astype(str).str.strip()
    matches = as_str.str.match(_ISO_DATETIME)
    parsed = pd.to_datetime(as_str.where(matches), format="ISO8601", errors="coerce", utc=True)
    return parsed


def _is_consecutive(unique_integers: pd.Series) -> bool:
    """True if distinct integers form one gap-free run (in any order), e.g. 1..n."""
    span = int(unique_integers.max()) - int(unique_integers.min()) + 1
    return span == len(unique_integers)


def _looks_like_iso_datetime(non_null: pd.Series) -> bool:
    if non_null.empty:
        return False
    parsed = parse_iso_datetimes(non_null)
    return bool(parsed.notna().mean() >= DATETIME_MIN_RATIO)


def infer_column_kind(series: pd.Series) -> ColumnKind:
    non_null = series.dropna()
    n_unique = int(non_null.nunique())

    if n_unique <= 1:
        return "constant"
    if ptypes.is_bool_dtype(series):
        return "boolean"

    text = is_text(series)
    if (
        len(series) >= ID_LIKE_MIN_ROWS
        and len(non_null) == len(series)
        and n_unique == len(series)
        and (text or (ptypes.is_integer_dtype(series) and _is_consecutive(non_null)))
    ):
        return "id_like"

    # Case-insensitive: "Yes"/"yes"/"NO" are 3 raw values but 2 boolean values.
    # The bound only skips the lowercase pass for columns that clearly are not boolean.
    if text and n_unique <= _BOOLEAN_MAX_RAW_VALUES:
        lowered = set(non_null.astype(str).str.strip().str.lower().unique())
        if lowered in _BOOLEAN_PAIRS:
            return "boolean"

    if is_numeric(series):
        return "numeric"
    if ptypes.is_datetime64_any_dtype(series):
        return "datetime"
    if text:
        if _looks_like_iso_datetime(non_null):
            return "datetime"
        return "categorical" if n_unique <= CATEGORICAL_MAX_UNIQUE else "text"
    return "text"
