"""Validate user-supplied prediction inputs against a model's input schema.

Produces a one-row DataFrame in the exact form `prepare_features` produces at training
time, so the saved pipeline's own fitted preprocessor handles it. Missing values are
allowed and filled by that fitted imputer (reported back as `imputed_features`).
"""

import math
from typing import Any

import numpy as np
import pandas as pd

from app.errors import UnprocessableError
from app.ml.feature_mapping import format_number
from app.ml.preprocessing import to_category_value


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def _parse_number(name: str, value: Any) -> float:
    if isinstance(value, bool):
        raise UnprocessableError("INVALID_NUMBER", f"'{name}' must be a number.", {"feature": name})
    try:
        number = float(value.strip()) if isinstance(value, str) else float(value)
    except (TypeError, ValueError) as exc:
        raise UnprocessableError(
            "INVALID_NUMBER", f"'{name}' must be a number.", {"feature": name}
        ) from exc
    if not math.isfinite(number):
        raise UnprocessableError(
            "INVALID_NUMBER", f"'{name}' must be a finite number.", {"feature": name}
        )
    return number


def build_input_frame(
    inputs: dict[str, Any], schema: list[dict[str, Any]]
) -> tuple[pd.DataFrame, dict[str, Any], list[dict[str, Any]], list[str]]:
    """Return (frame, display_values, imputed_features, warnings)."""
    known = {f["name"] for f in schema}
    unknown = sorted(set(inputs) - known)
    if unknown:
        raise UnprocessableError(
            "UNKNOWN_FEATURE",
            f"Unknown feature(s): {', '.join(unknown)}.",
            {"features": unknown},
        )

    row: dict[str, Any] = {}
    display: dict[str, Any] = {}
    imputed: list[dict[str, Any]] = []
    warnings: list[str] = []
    for feature in schema:
        name = feature["name"]
        raw = inputs.get(name)
        if _is_blank(raw):
            if feature["kind"] == "numeric":
                row[name] = np.nan
                fill = feature["train_median"]
                imputed.append({"feature": name, "value": fill, "strategy": "training median"})
            else:
                row[name] = np.nan
                fill = feature["train_mode"]
                imputed.append(
                    {"feature": name, "value": fill, "strategy": "most frequent training value"}
                )
            display[name] = None
            continue

        if feature["kind"] == "numeric":
            number = _parse_number(name, raw)
            row[name] = number
            display[name] = format_number(number)
            low, high = feature["train_min"], feature["train_max"]
            if low is not None and high is not None and not (low <= number <= high):
                warnings.append(
                    f"'{name}' = {format_number(number)} is outside the training range "
                    f"[{format_number(low)}, {format_number(high)}]."
                )
        else:
            category = to_category_value(raw)
            if category not in feature["categories"]:
                raise UnprocessableError(
                    "UNKNOWN_CATEGORY",
                    f"'{raw}' is not a known category for '{name}'.",
                    {"feature": name, "allowed": feature["categories"]},
                )
            row[name] = category
            display[name] = category

    columns = [f["name"] for f in schema]
    frame = pd.DataFrame([row], columns=columns)
    for feature in schema:
        name = feature["name"]
        if feature["kind"] == "numeric":
            frame[name] = frame[name].astype("float64")
        else:
            frame[name] = frame[name].astype(object)
    return frame, display, imputed, warnings
