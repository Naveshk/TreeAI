"""Translate tree split thresholds (on transformed features) into readable rules.

Trees only see the preprocessed matrix. For numeric features the threshold applies to the
original value. For ordinal-encoded categorical features a node `code <= t` sends every
category whose code is <= t to the LEFT child, i.e. `feature in {those categories}`.
Unknown categories are encoded as -1 and therefore always go left.
"""

import math
from typing import Any


def format_number(value: float) -> str:
    if value == 0 or (1e-3 <= abs(value) < 1e6):
        text = f"{value:.4f}".rstrip("0").rstrip(".")
        return text if text not in ("", "-0") else "0"
    return f"{value:.4g}"


def _category_set(categories: list[str]) -> str:
    return "{" + ", ".join(categories) + "}"


def split_rules(feature: dict[str, Any], threshold: float) -> dict[str, Any]:
    """Readable left/right rules for one split on `feature` (an input-schema entry)."""
    name = feature["name"]
    if feature["kind"] == "numeric":
        shown = format_number(threshold)
        return {
            "threshold_display": shown,
            "left_rule": f"{name} ≤ {shown}",
            "right_rule": f"{name} > {shown}",
            "left_categories": None,
            "right_categories": None,
        }
    categories: list[str] = feature["categories"]
    cut = math.floor(threshold) + 1  # codes 0..cut-1 go left
    left, right = categories[: max(cut, 0)], categories[max(cut, 0) :]
    return {
        "threshold_display": format_number(threshold),
        "left_rule": f"{name} ∈ {_category_set(left)}" if left else f"{name} is unseen",
        "right_rule": f"{name} ∈ {_category_set(right)}" if right else f"{name} is unseen",
        "left_categories": left,
        "right_categories": right,
    }
